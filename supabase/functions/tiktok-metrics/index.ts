import { adminClient, requireTrellisUser, secureEqual, SERVICE_KEY, cors, json } from '../_shared/posthog.ts';
import { hasVideoReadScope, queryVideos, videoId } from './domain.ts';

const db = adminClient();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_COLUMNS = 'id,branch_id,video_id,share_url,caption,published_at,views,likes,comments,shares,last_synced_at,last_error';
async function connection(branchId: string, token = false) {
  const { data: own, error } = await db.from('social_credentials')
    .select('id,shared_credential_id,status').eq('branch_id', branchId).eq('platform', 'tiktok')
    .is('branch_social_account_id', null).maybeSingle();
  if (error || !own || own.status !== 'active') throw new Error('Connect TikTok for this branch first.');
  const { data: owner, error: ownerError } = await db.from('social_credentials')
    .select('id,status,granted_scopes,platform_user_id,platform_metadata')
    .eq('id', own.shared_credential_id || own.id).eq('platform', 'tiktok').is('shared_credential_id', null).single();
  if (ownerError || owner?.status !== 'active') throw new Error('The shared TikTok connection is inactive.');
  const identity = owner.platform_user_id || owner.platform_metadata?.open_id;
  if (!identity) throw new Error('Reconnect TikTok to verify the account identity.');
  const ready = hasVideoReadScope(owner.granted_scopes);
  if (!token) return { ready, credential_id: owner.id, identity, access_token: '' };
  if (!ready) throw new Error('Missing video.list permission. Add Display API in TikTok, then reconnect the owner branch with video.list.');
  const { data: secret, error: secretError } = await db.rpc('get_social_credential', { p_branch_id: branchId, p_platform: 'tiktok' });
  if (secretError || !secret?.success || !secret.access_token || secret.credential_id !== owner.id) throw new Error('TikTok credential lookup failed.');
  return { ready, credential_id: owner.id, identity, access_token: secret.access_token };
}
async function record(post: any, video: any) {
  const { error } = await db.rpc('record_tiktok_metrics', {
    p_post_id: post.id, p_caption: video.caption, p_published_at: video.published_at, p_share_url: video.share_url,
    p_views: video.views, p_likes: video.likes, p_comments: video.comments, p_shares: video.shares,
  });
  if (error) throw new Error('Could not save the metrics snapshot.');
}
async function syncBranch(branchId: string) {
  const creds = await connection(branchId, true);
  let offset = 0, refreshed = 0, unavailable = 0;
  while (true) {
    const { data: posts, error } = await db.from('tiktok_metric_posts')
      .select('id,video_id,credential_id,account_id').eq('branch_id', branchId).order('id').range(offset, offset + 99);
    if (error) throw new Error('Could not load tracked TikTok posts.');
    if (!posts?.length) break;
    for (let i = 0; i < posts.length; i += 20) {
      const batch = posts.slice(i, i + 20);
      if (batch.some(post => post.credential_id !== creds.credential_id || post.account_id !== creds.identity)) {
        throw new Error('The connected TikTok account has changed. Existing posts were not synced.');
      }
      const videos = await queryVideos(creds.access_token, batch.map(post => post.video_id));
      for (const post of batch) {
        const video = videos.find((v: any) => v.video_id === post.video_id);
        if (video) { await record(post, video); refreshed++; }
        else {
          const { error: missingError } = await db.from('tiktok_metric_posts').update({ last_error: 'Video unavailable from TikTok; previous metrics retained.' }).eq('id', post.id);
          if (missingError) throw new Error('Could not save video availability status.');
          unavailable++;
        }
      }
    }
    offset += posts.length;
    if (posts.length < 100) break;
  }
  return { refreshed, unavailable };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const bearer = req.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
    const isWorker = !!SERVICE_KEY && secureEqual(bearer, SERVICE_KEY);
    const user = isWorker ? null : await requireTrellisUser(req);
    if (user instanceof Response) return user;
    const body = await req.json();
    if (body.action === 'sync_all') {
      if (!isWorker) return json({ error: 'Worker access required' }, 403);
      // Branches are small configuration data; a scheduled job is one run per shared-account branch.
      const { data: branches, error } = await db.from('branches').select('id').eq('is_active', true);
      if (error) throw new Error('Could not load branches.');
      const results = [];
      for (const branch of branches || []) {
        const { count, error: countError } = await db.from('tiktok_metric_posts').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id);
        if (countError) throw new Error('Could not load tracked posts.');
        if (!count) continue;
        try { results.push({ branch_id: branch.id, ...await syncBranch(branch.id) }); }
        catch (e) { results.push({ branch_id: branch.id, error: e instanceof Error ? e.message : 'Sync failed' }); }
      }
      return json({ results, success: results.every(row => !('error' in row)) });
    }
    if (!['list', 'track', 'sync'].includes(body.action) || !UUID.test(body.branch_id || '')) return json({ error: 'Valid branch and action required' }, 400);
    const branchId = body.branch_id;
    if (!isWorker && user && !['owner', 'admin'].includes(user.role)) {
      const { data: operator } = await db.from('trellis_users').select('id').eq('auth_user_id', user.userId).single();
      const { data: assignment } = await db.from('trellis_user_branches').select('id').eq('trellis_user_id', operator?.id).eq('branch_id', branchId).maybeSingle();
      if (!assignment) return json({ error: 'Branch access required' }, 403);
      if (body.action === 'track' && !['operator'].includes(user.role)) return json({ error: 'Operator access required to assign a post' }, 403);
    }
    if (body.action === 'sync') return json(await syncBranch(branchId));
    if (body.action === 'track') {
      const id = videoId(body.video_url);
      const creds = await connection(branchId, true);
      const videos = await queryVideos(creds.access_token, [id]);
      if (videos.length !== 1) return json({ error: 'This public video was not returned for the connected TikTok account.' }, 400);
      const { data: existing, error: existingError } = await db.from('tiktok_metric_posts').select('id,branch_id,account_id').eq('video_id', id).maybeSingle();
      if (existingError) throw new Error('Could not check existing post assignment.');
      if (existing && (existing.branch_id !== branchId || existing.account_id !== creds.identity)) return json({ error: 'This video is already assigned to another branch or account.' }, 409);
      let post = existing;
      if (!post) {
        const { data, error } = await db.from('tiktok_metric_posts').insert({ branch_id: branchId, video_id: id, credential_id: creds.credential_id, account_id: creds.identity }).select('id,branch_id,account_id').single();
        if (error) throw new Error('Could not track this post; it may already be assigned. Refresh the list.');
        post = data;
      }
      await record(post, videos[0]);
      return json({ success: true });
    }
    const { data: posts, error } = await db.from('tiktok_metric_posts').select(POST_COLUMNS).eq('branch_id', branchId).order('published_at', { ascending: false, nullsFirst: false }).limit(200);
    if (error) throw new Error('TikTok metrics storage is unavailable. Deploy the metrics migration first.');
    let permissionError: string | null = null;
    let ready = false;
    try { ready = (await connection(branchId)).ready; if (!ready) permissionError = 'Missing video.list permission. Reconnect TikTok after adding Display API.'; }
    catch (e) { permissionError = e instanceof Error ? e.message : 'Connection unavailable'; }
    return json({ posts, ready, permission_error: permissionError, limit: 200 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'TikTok metrics failed' }, 400);
  }
});
