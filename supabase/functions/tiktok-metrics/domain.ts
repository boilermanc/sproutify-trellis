// TikTok metrics use decimal-string IDs; never round a video ID through Number.
export const METRIC_FIELDS = 'id,share_url,video_description,create_time,view_count,like_count,comment_count,share_count';
export function videoId(input: unknown): string {
  if (typeof input !== 'string') throw new Error('Paste a TikTok video URL or video ID.');
  const value = input.trim();
  if (/^\d{15,25}$/.test(value)) return value;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Paste the full TikTok video URL.'); }
  const match = url.pathname.match(/^\/@[^/]+\/video\/(\d{15,25})\/?$/);
  if (url.protocol !== 'https:' || !['www.tiktok.com', 'tiktok.com'].includes(url.hostname) || !match) {
    throw new Error('Use the full https://www.tiktok.com/@account/video/ID URL.');
  }
  return match[1];
}
export function hasVideoReadScope(scopes: unknown): boolean {
  return Array.isArray(scopes) && scopes.includes('video.list');
}
export function metric(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function normalizeVideo(video: any, expectedId: string) {
  if (video?.id !== expectedId) throw new Error('TikTok did not return the requested video.');
  const seconds = metric(video.create_time);
  let shareUrl: string | null = null;
  try { if (videoId(video.share_url) === expectedId) shareUrl = new URL(video.share_url).origin + new URL(video.share_url).pathname; } catch { /* URL unavailable */ }
  return {
    video_id: expectedId,
    share_url: shareUrl,
    caption: typeof video.video_description === 'string' ? video.video_description.slice(0, 4000) : '',
    published_at: seconds !== null && seconds < 8640000000000 ? new Date(seconds * 1000).toISOString() : null,
    views: metric(video.view_count), likes: metric(video.like_count),
    comments: metric(video.comment_count), shares: metric(video.share_count),
  };
}
export async function queryVideos(token: string, ids: string[], fetcher = fetch) {
  if (!ids.length || ids.length > 20 || ids.some(id => videoId(id) !== id)) throw new Error('Invalid video batch.');
  // This fixed read endpoint is the ONLY TikTok endpoint this module can call.
  const response = await fetcher(`https://open.tiktokapis.com/v2/video/query/?fields=${METRIC_FIELDS}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters: { video_ids: ids } }), signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json();
  if (!response.ok || payload?.error?.code !== 'ok') {
    if (payload?.error?.code === 'scope_not_authorized') throw new Error('Reconnect TikTok with video.list read permission.');
    if (response.status === 429) throw new Error('TikTok rate limit reached. Try again later.');
    throw new Error('TikTok metrics could not be read. Check the connection and video.list permission.');
  }
  if (!Array.isArray(payload?.data?.videos)) throw new Error('TikTok returned an invalid metrics response.');
  return payload.data.videos.filter((video: any) => ids.includes(video?.id)).map((video: any) => normalizeVideo(video, video.id));
}
