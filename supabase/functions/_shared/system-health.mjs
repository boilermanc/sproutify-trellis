// Shared by the dashboard health endpoint, webhook cache, and daily repair bot.
export const HEALTH_VERSION = 1;
export const WEBHOOKS = [
  { path: 'trellis-social-publish', label: 'Instagram publisher', critical: true },
  { path: 'trellis-facebook-publish', label: 'Facebook publisher', critical: true },
  { path: 'trellis-tiktok-publish', label: 'TikTok publisher', critical: true },
  { path: 'trellis-static-ad-generate', label: 'Static ad generator', critical: true },
  { path: 'trellis-carousel-generate', label: 'Carousel generator', critical: true },
  { path: 'trellis-video-ad-generate', label: 'Video ad generator', critical: true },
  { path: 'trellis-video-ad-render', label: 'Video ad render', critical: true },
  { path: 'trellis-clip-publish', label: 'Clip publisher', critical: false },
  { path: 'trellis-music-generate', label: 'Music generator', critical: false },
  { path: 'reddit-post-comment', label: 'Reddit poster', critical: false },
];

export function classifyWebhook(httpCode, body = '') {
  // n8n returns 404 even for a registered POST-only route when checked with GET.
  const registeredPost = /not registered for GET requests\. Did you mean to make a POST request\?/i.test(body);
  if (httpCode === 404 && registeredPost) {
    return { status: 'ok', detail: 'POST route registered (read-only GET check). Execution health is not tested.' };
  }
  if (httpCode === 404 && /requested webhook.+is not registered/i.test(body)) {
    return { status: 'down', detail: 'Production webhook is not registered. Check its path and workflow activation in n8n.' };
  }
  if (httpCode === 404) return { status: 'error', detail: 'HTTP 404 without an n8n registration response. Check routing before declaring the workflow missing.' };
  if (httpCode >= 200 && httpCode < 300) return { status: 'ok', detail: 'GET route responding. Execution health is not tested.' };
  return { status: 'error', detail: `Health check returned HTTP ${httpCode}. Check authentication, routing, or service availability.` };
}

// Retry only safe reads, once, for temporary transport/rate/server failures.
export async function retryRead(read, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const value = await read();
      if (attempt === 1 && (value.status === 429 || value.status >= 500)) {
        await value.body?.cancel?.();
        await wait(750);
        continue;
      }
      return { value, attempts: attempt };
    } catch (error) {
      if (attempt === 2) throw error;
      await wait(750);
    }
  }
  throw new Error('Read attempts exhausted.');
}

export async function probeWebhook(webhook, fetcher = fetch) {
  try {
    const { value: response, attempts } = await retryRead(() => fetcher(
      `https://n8n.sproutify.app/webhook/${webhook.path}`,
      { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000) },
    ));
    const body = await response.text();
    return { ...webhook, ...classifyWebhook(response.status, body), http_code: response.status, attempts, checked_at: new Date().toISOString() };
  } catch {
    return { ...webhook, status: 'error', http_code: null, detail: 'No response after two bounded read-only checks.', attempts: 2, checked_at: new Date().toISOString() };
  }
}

export async function fetchEmailHealth(db, until = new Date().toISOString()) {
  const since = new Date(new Date(until).getTime() - 7 * 86400000).toISOString();
  const counts = await Promise.all(['sent', 'bounced', 'complained'].map(async type => {
    const { count, error } = await db.from('email_events').select('id', { count: 'exact', head: true })
      .eq('event_type', type).gte('occurred_at', since).lt('occurred_at', until);
    if (error || count === null || count === undefined) throw new Error('Email event counts unavailable.');
    return count;
  }));
  return { sent: counts[0], bounced: counts[1], complained: counts[2], since, until };
}

/** @param {{webhooks: any[], spokes: any[], email: any, errors?: any[]}} report */
export function healthRows({ webhooks, spokes, email, errors = [] }) {
  const rows = [];
  for (const w of webhooks) {
    if (w.status === 'ok') continue;
    rows.push({ key: `webhook:${w.path}`, name: w.label, status: w.critical ? w.status : 'optional',
      code: w.critical ? (w.status === 'down' ? 'MISSING' : 'ERROR') : 'OPTIONAL',
      detail: `${w.path}: ${w.detail}`, checked_at: w.checked_at });
  }
  for (const s of spokes) {
    rows.push({ key: `spoke:${s.id}`, name: s.name, status: s.status,
      code: s.status === 'ok' ? 'OK' : s.status === 'unknown' ? 'UNVERIFIED' : 'ERROR',
      detail: s.detail, checked_at: s.checked_at });
  }
  if (email) {
    const bounceRate = email.sent > 0 ? email.bounced / email.sent : null;
    const warning = email.complained > 0 || (bounceRate !== null && bounceRate > 0.05) || (email.sent === 0 && email.bounced > 0);
    rows.push({ key: 'resend:dispatch', name: 'Resend email quality', status: warning ? 'warning' : 'ok', code: warning ? 'REVIEW' : 'OK',
      detail: `${email.sent.toLocaleString('en-US')} sent · ${email.bounced} bounced · ${email.complained} complained (last 7 days, all recorded events).${warning ? ' Review delivery quality and consent; this does not indicate a Resend outage.' : ''}`,
      checked_at: email.until });
  } else rows.push({ key: 'monitor:email', name: 'Email health check', status: 'unknown', code: 'UNAVAILABLE', detail: 'Email counts could not be verified. Refresh or inspect the health endpoint.' });
  for (const error of errors) rows.push({ key: `monitor:${error.source}`, name: error.name, status: 'unknown', code: 'UNAVAILABLE', detail: error.detail });
  if (!rows.length) rows.push({ key: 'monitor:empty', name: 'System health', status: 'unknown', code: 'UNAVAILABLE', detail: 'No health results available.' });
  const rank = { down: 0, error: 1, unknown: 2, warning: 3, stale: 4, optional: 5, ok: 6 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || a.key.localeCompare(b.key));
}

// Stop paging only at an empty page: a server may enforce a smaller cap than requested.
export async function fetchDashboardEmailEvents(db, since, until) {
  const rows = [];
  for (let offset = 0; ; ) {
    const { data, error } = await db.from('email_events')
      .select('id,email,event_type,campaign_subject,campaign_id,resend_email_id,occurred_at,metadata')
      .gte('occurred_at', since).lt('occurred_at', until)
      .order('occurred_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
    offset += data.length;
  }
}
