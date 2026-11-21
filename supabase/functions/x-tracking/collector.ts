import { account, accessToken, db } from './runtime.ts';
import { advanceCursor, normalizePost, PUBLIC_FIELDS, timelineParams, xGet } from './domain.mjs';

async function record(post: any, accountId: string, mention: boolean) {
  const { error } = await db.rpc('record_x_post', { p_post: normalizePost(post, accountId), p_mention: mention });
  if (error) throw new Error('Could not save X post and daily snapshot; the batch will be retried.');
}
export async function collect() {
  const row = await account();
  const lock = crypto.randomUUID();
  const { data: claimed, error } = await db.from('x_shared_account')
    .update({ lock_id: lock, locked_until: new Date(Date.now() + 240000).toISOString() })
    .eq('id', row.id).or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`).select('id');
  if (error || !claimed?.length) throw new Error('X collection is already running. Try again shortly.');
  let collected = 0, refreshed = 0, unavailable = 0;
  const deadline = Date.now() + 100000;
  function checkDeadline() {
    if (Date.now() > deadline) throw new Error('X collection reached its time budget. The next run will resume the saved batch.');
  }
  try {
    // Reload under the lease so a previous refresh cannot leave us with stale tokens.
    const current = await account();
    const token = await accessToken(current);
    for (const [endpoint, field] of [['tweets', 'posts_cursor'], ['mentions', 'mentions_cursor']]) {
      let cursor = current[field] || {};
      // Persist pagination across runs to bound API usage without skipping posts.
      for (let page = 0; page < 2; page++) {
        checkDeadline();
        const params = timelineParams(cursor);
        const payload = await xGet(`users/${current.platform_user_id}/${endpoint}?${params}`, token);
        for (const post of payload.data || []) {
          checkDeadline();
          await record(post, current.platform_user_id, endpoint === 'mentions');
          collected++;
        }
        cursor = advanceCursor(cursor, payload, params.get('start_time'));
        const { error: cursorError } = await db.from('x_shared_account').update({ [field]: cursor }).eq('id', row.id).eq('lock_id', lock);
        if (cursorError) throw new Error('Could not save the X sync cursor.');
        if (!cursor.next_token) break;
      }
    }
    // Refresh at most 100 older tracked posts per run. Repeated scheduled runs
    // drain the backlog; snapshots are lifetime counters, one per UTC day.
    const today = new Date().toISOString().slice(0, 10);
    const { data: posts, error: postsError } = await db.from('x_tracked_posts').select('id,post_id')
      .eq('account_id', current.platform_user_id).eq('is_own', true)
      .gte('published_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .lt('last_checked_at', `${today}T00:00:00Z`).order('last_checked_at').limit(100);
    if (postsError) throw new Error('Could not load the daily metrics queue.');
    if (posts?.length) {
      checkDeadline();
      const payload = await xGet(`tweets?${new URLSearchParams({ ids: posts.map(p => p.post_id).join(','), 'tweet.fields': PUBLIC_FIELDS })}`, token, fetch, true);
      for (const post of payload.data || []) { checkDeadline(); await record(post, current.platform_user_id, false); refreshed++; }
      for (const post of posts.filter(p => !(payload.data || []).some((item: any) => item.id === p.post_id))) {
        // Missing/deleted posts keep the last real snapshot, never fabricated zeroes.
        const { error } = await db.from('x_tracked_posts').update({
          last_checked_at: new Date().toISOString(), last_error: 'Post unavailable from X; previous metrics retained.',
        }).eq('id', post.id);
        if (error) throw new Error('Could not record X post availability.');
        unavailable++;
      }
    }
    const { error: finishError } = await db.from('x_shared_account').update({ last_synced_at: new Date().toISOString(), last_error: null }).eq('id', row.id).eq('lock_id', lock);
    if (finishError) throw new Error('Could not save X sync completion.');
    return { collected, refreshed, unavailable };
  } catch (error) {
    await db.from('x_shared_account').update({ last_error: error instanceof Error ? error.message : 'X collection failed.' }).eq('id', row.id).eq('lock_id', lock);
    throw error;
  } finally {
    await db.from('x_shared_account').update({ locked_until: null, lock_id: null }).eq('id', row.id).eq('lock_id', lock);
  }
}
