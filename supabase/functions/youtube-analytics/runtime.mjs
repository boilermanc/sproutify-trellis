// Tokens stay inside this service-only proxy, never in saved n8n execution data.
export const ANALYTICS_COLUMNS = ['day', 'views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'subscribersGained', 'subscribersLost', 'likes', 'comments', 'shares'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const DAY_MS = 86400000;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const ms = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
}
function videoId(row) {
  if (VIDEO.test(row.external_id || '')) return row.external_id;
  // Only actual YouTube URLs; never infer an ID from arbitrary text or hosts.
  for (const candidate of [row.external_url, row.response?.youtube_url, row.response?.url, row.response_json?.youtube_url, row.response_json?.url]) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:') continue;
      let id;
      if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
        id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1];
      }
      if (VIDEO.test(id || '')) return id;
    } catch { /* No usable URL. */ }
  }
  return null;
}
function numeric(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function safeAnalytics(payload, start, end) {
  if (!Array.isArray(payload?.columnHeaders) || payload.columnHeaders.length !== ANALYTICS_COLUMNS.length ||
      payload.columnHeaders.some((header, i) => header?.name !== ANALYTICS_COLUMNS[i])) throw new Error();
  const rows = payload.rows ?? [];
  if (!Array.isArray(rows) || rows.length > 200) throw new Error();
  const seen = new Set();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== ANALYTICS_COLUMNS.length || !Number.isFinite(date(row[0])) ||
        row[0] < start || row[0] > end || seen.has(row[0]) || !row.slice(1).every(numeric)) throw new Error();
    seen.add(row[0]);
  }
  return { columnHeaders: ANALYTICS_COLUMNS.map(name => ({ name })), rows: rows.map(row => [...row]) };
}
function safeStatistics(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
  const result = {};
  for (const key of ['viewCount', 'likeCount', 'commentCount']) {
    if (payload[key] === undefined) continue; // Hidden counts are unknown, not zero.
    if (typeof payload[key] !== 'string' || !/^\d+$/.test(payload[key])) throw new Error();
    result[key] = payload[key];
  }
  return result;
}

// Adapters are injectable so every boundary is exercised without provider calls.
export function createAnalyticsHandler({ serviceKey, supabaseUrl, loadPublication, loadAccount, fetch: request = globalThis.fetch, now = () => Date.now() }) {
  const boundedRequest = (url, options) => request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  return async req => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!serviceKey || req.headers.get('authorization') !== `Bearer ${serviceKey}`) return json({ error: 'Service role required' }, 403);
    let input;
    try { input = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    if (!input || !['episode', 'studio'].includes(input.source_type) || typeof input.publication_id !== 'string' || !UUID.test(input.publication_id) ||
        !Number.isFinite(date(input.start_date)) || !Number.isFinite(date(input.end_date)) ||
        input.end_date < input.start_date || (date(input.end_date) - date(input.start_date)) / DAY_MS + 1 > 200 ||
        date(input.end_date) >= Math.floor(now() / DAY_MS) * DAY_MS) return json({ error: 'Invalid publication or reporting window' }, 400);
    const identity = { source_type: input.source_type, publication_id: input.publication_id };
    const unavailable = reason => json({ status: 'unavailable', reason, ...identity });
    let stage = 'publication_unavailable';
    try {
      const row = await loadPublication(input.source_type, input.publication_id);
      if (!row || row.id !== input.publication_id || row.platform !== 'youtube' || row.status !== 'live') return unavailable('publication_not_live_youtube');
      if (!row.youtube_account_id) return json({ status: 'skipped', reason: 'missing_youtube_account', ...identity });
      const studio = input.source_type === 'studio';
      if (!(studio ? row.album_id : row.episode_id)) return unavailable('publication_parent_missing');
      const id = videoId(row);
      if (!id) return unavailable('invalid_video_id');
      stage = 'account_unavailable';
      const account = await loadAccount(row.youtube_account_id);
      if (!account || account.id !== row.youtube_account_id || account.platform !== 'youtube' || account.status !== 'active' ||
          !account.external_account_id || !row.branch_slug || account.branch_slug !== row.branch_slug) return unavailable('account_not_active_for_branch');
      stage = 'token_unavailable';
      const tokenResponse = await boundedRequest(`${supabaseUrl}/functions/v1/youtube-publish-token`, {
        method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_account_id: account.id }),
      });
      if (!tokenResponse.ok) return unavailable(stage);
      const token = await tokenResponse.json();
      if (typeof token?.access_token !== 'string' || !token.access_token || token.youtube_account_id !== account.id || token.channel_id !== account.external_account_id) return unavailable(stage);
      const headers = { Authorization: `Bearer ${token.access_token}` };
      stage = 'channel_verification_unavailable';
      const channelResponse = await boundedRequest('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', { headers });
      if (!channelResponse.ok) return unavailable(stage);
      const channels = await channelResponse.json();
      if (!Array.isArray(channels?.items) || channels.items.length !== 1 || channels.items[0]?.id !== account.external_account_id) return unavailable('channel_mismatch');
      stage = 'video_unavailable';
      const videoResponse = await boundedRequest(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${encodeURIComponent(id)}`, { headers });
      if (!videoResponse.ok) return unavailable(stage);
      const videos = await videoResponse.json();
      const video = videos?.items?.[0];
      if (!Array.isArray(videos?.items) || videos.items.length !== 1 || video?.id !== id) return unavailable(stage);
      if (video.snippet?.channelId !== account.external_account_id) return unavailable('video_channel_mismatch');
      const statistics = safeStatistics(video.statistics);
      stage = 'analytics_unavailable';
      const query = new URLSearchParams({ ids: `channel==${account.external_account_id}`, startDate: input.start_date, endDate: input.end_date,
        metrics: ANALYTICS_COLUMNS.slice(1).join(','), dimensions: 'day', filters: `video==${id}`, sort: 'day' });
      const reportResponse = await boundedRequest(`https://youtubeanalytics.googleapis.com/v2/reports?${query}`, { headers });
      if (!reportResponse.ok) return unavailable(stage);
      const analytics = safeAnalytics(await reportResponse.json(), input.start_date, input.end_date);
      const job = { source_type: input.source_type, episode_id: studio ? null : row.episode_id, publication_id: studio ? null : row.id,
        studio_album_id: studio ? row.album_id : null, studio_publication_id: studio ? row.id : null,
        youtube_video_id: id, external_url: `https://youtu.be/${id}`, start_date: input.start_date, end_date: input.end_date,
        youtube_account_id: account.id, channel_id: account.external_account_id };
      return json({ status: 'ok', job, statistics, analytics });
    } catch {
      // No raw provider payload, thrown error, credential or access token in logs/results.
      return unavailable(stage);
    }
  };
}
