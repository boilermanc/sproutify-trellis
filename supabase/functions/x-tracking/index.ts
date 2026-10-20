import { cors, json, requireTrellisUser, secureEqual, SERVICE_KEY } from '../_shared/posthog.ts';
import { account, appConfig, callbackUrl, db, decrypt, encrypt, exchange, hash, tokenFields } from './runtime.ts';
import { collect } from './collector.ts';
import { HANDLE, SCOPES, validateTags, verifyIdentity, xGet } from './domain.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_COLUMNS = 'id,post_id,is_own,is_mention,text,published_at,project_tags,mention_status,metrics,last_synced_at,last_error';
async function callback(url: URL) {
  const state = url.searchParams.get('state') || '';
  if (!/^[0-9a-f-]{72}$/i.test(state)) throw new Error('Invalid X authorization state. Start again in Trellis.');
  // Atomic consume prevents callback replay, including error callbacks.
  const { data, error } = await db.from('x_oauth_states').delete().eq('state_hash', await hash(state))
    .gt('expires_at', new Date().toISOString()).select('verifier_encrypted').maybeSingle();
  if (error || !data) throw new Error('X authorization expired or was already used. Start again in Trellis.');
  if (url.searchParams.has('error') || !url.searchParams.get('code')) throw new Error('X authorization was cancelled. You can reconnect from Trellis.');
  const tokens = await exchange(new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code')!,
    redirect_uri: callbackUrl, code_verifier: await decrypt(data.verifier_encrypted) }));
  if (!tokens.refresh_token) throw new Error('X did not grant offline access. Reconnect to enable scheduled collection.');
  const row = await account();
  const me = await xGet('users/me', tokens.access_token);
  const identity = verifyIdentity(me.data, row.platform_user_id);
  // Avoid rotating authorization while the collector is refreshing a token.
  const { data: saved, error: saveError } = await db.from('x_shared_account').update({
    ...await tokenFields(tokens), platform_user_id: identity, connected_at: new Date().toISOString(), last_error: null,
  }).eq('id', row.id).or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`).select('id');
  if (saveError || !saved?.length) throw new Error('Could not save X authorization; a sync may be running. Try connecting again shortly.');
  return new Response('Connected @boilermanc. Close this window and choose Refresh in Trellis X tracking.', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
export async function handle(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.endsWith('/callback')) return await callback(url);
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const bearer = req.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
    const worker = !!SERVICE_KEY && secureEqual(bearer, SERVICE_KEY);
    if (!worker) {
      const user = await requireTrellisUser(req, ['owner', 'admin']);
      if (user instanceof Response) return user;
    }
    const body = await req.json();
    if (worker && body.action !== 'sync') return json({ error: 'Worker may only collect X data.' }, 403);
    if (body.action === 'connect') {
      const app = appConfig();
      const state = crypto.randomUUID() + crypto.randomUUID();
      const verifier = crypto.randomUUID() + crypto.randomUUID();
      await db.from('x_oauth_states').delete().lt('expires_at', new Date().toISOString());
      const { error } = await db.from('x_oauth_states').insert({ state_hash: await hash(state),
        verifier_encrypted: await encrypt(verifier), expires_at: new Date(Date.now() + 600000).toISOString() });
      if (error) throw new Error('Could not start X authorization.');
      return json({ url: `https://x.com/i/oauth2/authorize?${new URLSearchParams({
        response_type: 'code', client_id: app.id, redirect_uri: callbackUrl, scope: SCOPES, state,
        code_challenge: await hash(verifier), code_challenge_method: 'S256',
      })}` });
    }
    if (body.action === 'sync') return json(await collect());
    if (body.action === 'list') {
      const row = await account();
      const page = Number.isInteger(body.page) && body.page >= 0 && body.page < 10000 ? body.page : 0;
      if (body.project && body.project !== 'unassigned' && !UUID.test(body.project)) throw new Error('Invalid project filter.');
      let query = db.from('x_tracked_posts').select(POST_COLUMNS, { count: 'exact' });
      if (body.kind === 'mentions') query = query.eq('is_mention', true);
      else query = query.eq('is_own', true);
      if (body.project === 'unassigned') query = query.eq('project_tags', '[]');
      else if (body.project) query = query.contains('project_tags', [body.project]);
      if (body.kind === 'mentions' && body.unread) query = query.eq('mention_status', 'new');
      const { data: posts, count, error } = await query.order('published_at', { ascending: false }).order('id').range(page * 50, page * 50 + 49);
      const { data: projects, error: projectError } = await db.from('branches').select('id,name').order('name');
      if (error || projectError) throw new Error('Could not load X tracking data.');
      return json({ posts, projects, total: count, page, account: { handle: HANDLE, connected: !!row.platform_user_id && !!row.access_token_encrypted,
        connected_at: row.connected_at, last_synced_at: row.last_synced_at, last_error: row.last_error } });
    }
    if (!UUID.test(body.id || '')) return json({ error: 'Valid post ID required.' }, 400);
    if (body.action === 'history') {
      const { data, error } = await db.from('x_post_daily').select('snapshot_date,captured_at,metrics').eq('post_id', body.id)
        .order('snapshot_date', { ascending: false }).limit(31);
      if (error) throw new Error('Could not load daily metrics.');
      return json({ snapshots: data });
    }
    if (body.action === 'tag') {
      const { data: projects, error } = await db.from('branches').select('id');
      if (error) throw new Error('Could not validate project tags.');
      const tags = validateTags(body.tags, (projects || []).map(p => p.id));
      const { data, error: saveError } = await db.from('x_tracked_posts').update({ project_tags: tags }).eq('id', body.id).select('id').maybeSingle();
      if (saveError || !data) throw new Error('Could not save project tags.');
      return json({ success: true });
    }
    if (body.action === 'status' && ['new', 'done'].includes(body.status)) {
      const { data, error } = await db.from('x_tracked_posts').update({ mention_status: body.status }).eq('id', body.id).eq('is_mention', true).select('id').maybeSingle();
      if (error || !data) throw new Error('Could not update mention status.');
      return json({ success: true });
    }
    return json({ error: 'Unknown X tracking action.' }, 400);
  } catch (error) {
    // Never forward raw provider payloads or secrets.
    return json({ error: error instanceof Error ? error.message : 'X tracking failed.' }, 400);
  }
}
Deno.serve(handle);
