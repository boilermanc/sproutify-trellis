export const HANDLE = 'boilermanc';
export const SCOPES = 'tweet.read users.read offline.access';
export const PUBLIC_FIELDS = 'id,text,created_at,author_id,public_metrics';
export const METRIC_KEYS = ['impression_count', 'like_count', 'reply_count', 'retweet_count', 'quote_count', 'bookmark_count'];

export function verifyIdentity(user, expectedId) {
  if (!/^\d{1,25}$/.test(user?.id || '') || user?.username?.toLowerCase() !== HANDLE ||
      (expectedId && user.id !== expectedId)) throw new Error('Only the verified @boilermanc account can be connected.');
  return user.id;
}
export function normalizePost(post, accountId) {
  if (!/^\d{1,25}$/.test(post?.id || '') || !post.author_id || !Number.isFinite(Date.parse(post.created_at))) {
    throw new Error('X returned an invalid post; sync cursor was not advanced.');
  }
  const metrics = {};
  for (const key of METRIC_KEYS) {
    const value = post.public_metrics?.[key];
    metrics[key] = Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return { post_id: post.id, account_id: accountId, is_own: post.author_id === accountId,
    text: String(post.text || ''), published_at: post.created_at, metrics };
}
export function validateTags(tags, validIds) {
  if (!Array.isArray(tags) || tags.length > 50 || tags.some(tag => typeof tag !== 'string' || !validIds.includes(tag))) {
    throw new Error('Choose valid project tags.');
  }
  return [...new Set(tags)];
}
// Pin the lower bound while draining a paginated batch. Never advance since_id
// until its last page is persisted, including after retries or a bounded run.
export function timelineParams(cursor, now = new Date()) {
  const params = new URLSearchParams({ max_results: '100', 'tweet.fields': PUBLIC_FIELDS });
  if (cursor.since_id) params.set('since_id', cursor.since_id);
  else params.set('start_time', cursor.start_time || new Date(now.getTime() - 30 * 86400000).toISOString());
  if (cursor.next_token) params.set('pagination_token', cursor.next_token);
  return params;
}
export function advanceCursor(cursor, payload, startTime) {
  const ids = [cursor.high_id, cursor.since_id, ...(payload.data || []).map(p => p.id)].filter(Boolean);
  const high = ids.reduce((a, b) => BigInt(a) > BigInt(b) ? a : b, '0');
  if (payload.meta?.next_token) return { ...cursor, high_id: high, start_time: cursor.start_time || startTime, next_token: payload.meta.next_token };
  return high === '0' ? { start_time: cursor.start_time || startTime } : { since_id: high };
}
export async function xGet(path, token, fetcher = fetch, allowMissing = false) {
  const response = await fetcher(`https://api.x.com/2/${path}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error('X rate limit reached. Collection will retry on the next scheduled run.');
    if (response.status === 401) throw new Error('X authorization expired. Reconnect @boilermanc.');
    if (response.status === 402 || response.status === 403) throw new Error('X access denied. Check API credits and read permissions.');
    throw new Error(`X request failed (HTTP ${response.status}). Previous data is retained.`);
  }
  const payload = await response.json();
  if (payload.errors?.length && (!allowMissing || payload.errors.some(error =>
    !['https://api.twitter.com/2/problems/resource-not-found', 'https://api.x.com/2/problems/resource-not-found', 'https://api.twitter.com/2/problems/not-authorized-for-resource', 'https://api.x.com/2/problems/not-authorized-for-resource'].includes(error.type)
  ))) throw new Error('X returned partial results. Previous data and the sync cursor are retained.');
  return payload;
}
