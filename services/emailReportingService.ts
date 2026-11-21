import { supabase } from '../lib/supabase';

// Supabase/PostgREST caps each response at a server-side max-rows setting
// (commonly 1000) regardless of the range a client requests — a single
// `.range(0, 9999)` call silently truncates on any table past that size. This
// walks pages until a short page proves there's nothing left, so bulk reads
// over email_events (which routinely exceeds 1000 rows for one campaign) get
// every row instead of just the oldest slice.
const PAGE_SIZE = 1000;
const MAX_PAGES = 200; // safety backstop — 200k rows

async function fetchAllPages<T>(
  table: string,
  select: string,
  applyFilters: (query: any) => any,
  orderColumn: string,
  onPage?: (rowsSoFar: number) => void,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    let query = supabase.from(table).select(select).order(orderColumn, { ascending: true });
    query = applyFilters(query);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = (data || []) as T[];
    rows.push(...chunk);
    onPage?.(rows.length);
    if (chunk.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) console.warn(`fetchAllPages(${table}) hit MAX_PAGES — results may be incomplete`);
  }
  return rows;
}

// Per-campaign email metrics keyed by the durable campaign UUID. Subject is only
// display copy; repeated subject lines never combine separate sends.
export interface CampaignEmailStat {
  campaign_id: string;
  campaign_name: string;
  campaign_subject: string;
  branches: string[];
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  first_event_at: string | null;
  last_event_at: string | null;
}

export interface SuppressionSummary {
  total: number;
  unsubscribe: number;
  bounce: number;
  complaint: number;
  manual: number;
}

export async function fetchCampaignEmailStats(): Promise<CampaignEmailStat[]> {
  try {
    const { data: campaignRows, error: campaignError } = await supabase
      .from('campaigns')
      .select('id,name,subject,branches,launched_at,created_at,send_status')
      .or('launched_at.not.is.null,send_status.not.is.null')
      .order('launched_at', { ascending: false, nullsFirst: false });
    if (campaignError) throw campaignError;
    const campaigns = campaignRows || [];
    if (campaigns.length === 0) return [];

    const { data: statRows, error: statError } = await supabase
      .from('campaign_stats_by_id')
      .select('*')
      .in('campaign_id', campaigns.map((row: any) => row.id));
    if (statError) throw statError;
    const byId = new Map((statRows || []).map((row: any) => [row.campaign_id, row]));

    return campaigns.map((campaign: any) => {
      const stat: any = byId.get(campaign.id) || {};
      return {
        campaign_id: campaign.id,
        campaign_name: campaign.name || campaign.subject || 'Untitled campaign',
        campaign_subject: campaign.subject || '',
        branches: Array.isArray(campaign.branches) ? campaign.branches : [],
        sent: Number(stat.sent || 0), delivered: Number(stat.delivered || 0),
        opened: Number(stat.opened || 0), clicked: Number(stat.clicked || 0),
        bounced: Number(stat.bounced || 0), complained: Number(stat.complained || 0),
        first_event_at: stat.first_event_at || null,
        last_event_at: stat.last_event_at || null,
      };
    });
  } catch (e) {
    console.error('fetchCampaignEmailStats failed:', e);
    return [];
  }
}

export interface RecentCampaignPerformance {
  id: string;
  subject: string;
  name: string;
  launchedAt: string;
  audienceSize: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
}

export interface RecentCampaignPerformanceResult {
  campaigns: RecentCampaignPerformance[];
  error: string | null;
}

export interface SharedCampaignOpenersResult {
  emails: string[];
  error: string | null;
}

export interface CampaignEngagementRecipient {
  email: string;
  deliveredAt: string | null;
  firstOpenedAt: string | null;
  firstClickedAt: string | null;
}

export interface RecentCampaignEngagementResult {
  campaigns: RecentCampaignPerformance[];
  recipientsByCampaign: Record<string, CampaignEngagementRecipient[]>;
  error: string | null;
}

export interface CampaignEngagementSummary {
  email: string;
  delivered_campaign_ids: string[];
  opened_campaign_ids: string[];
}

export interface CampaignChoice {
  id: string;
  name: string;
  subject: string;
  launched_at: string;
  branches: string[];
}

const normalizeBranch = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')
  .replace(/com$/, '');

export async function fetchCampaignChoices(branchQuery: string): Promise<CampaignChoice[]> {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('id,name,subject,branches,launched_at')
      .not('launched_at', 'is', null)
      .not('subject', 'is', null)
      .order('launched_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const branch = normalizeBranch(branchQuery);
    return (data || []).filter((row: any) => Array.isArray(row.branches) && row.branches.some(
      (candidate: unknown) => normalizeBranch(String(candidate)) === branch,
    )).map((row: any) => ({
      id: row.id,
      name: row.name || row.subject,
      subject: row.subject,
      launched_at: row.launched_at,
      branches: row.branches,
    }));
  } catch (e) {
    console.error('fetchCampaignChoices failed:', e);
    return [];
  }
}

// Loads only recipient status for the selected campaign IDs. Repeated provider
// events are already collapsed by campaign_recipient_status_by_id.
export async function fetchCampaignEngagementByEmail(
  campaignIds: string[],
): Promise<Map<string, CampaignEngagementSummary>> {
  const result = new Map<string, CampaignEngagementSummary>();
  const ids = [...new Set(campaignIds.filter(Boolean))];
  if (ids.length === 0) return result;
  try {
    const rows = await fetchAllPages<{
      campaign_id: string;
      email: string;
      delivered: boolean;
      opened: boolean;
    }>(
      'campaign_recipient_status_by_id',
      'campaign_id,email,delivered,opened',
      (query) => query.in('campaign_id', ids),
      'email',
    );
    for (const row of rows) {
      const email = (row.email || '').trim().toLowerCase();
      if (!email) continue;
      const summary = result.get(email) || {
        email,
        delivered_campaign_ids: [],
        opened_campaign_ids: [],
      };
      if (row.delivered && !summary.delivered_campaign_ids.includes(row.campaign_id)) {
        summary.delivered_campaign_ids.push(row.campaign_id);
      }
      if (row.opened && !summary.opened_campaign_ids.includes(row.campaign_id)) {
        summary.opened_campaign_ids.push(row.campaign_id);
      }
      result.set(email, summary);
    }
    return result;
  } catch (e) {
    console.error('fetchCampaignEngagementByEmail failed:', e);
    return result;
  }
}

// Sage uses this for factual questions such as "how many people read the last
// two ATL emails?". Campaign selection is branch-aware; metrics are keyed by
// campaign_id so two campaigns with the same subject cannot contaminate each
// other's counts. Profile/customer data never leaves its spoke.
export async function fetchRecentCampaignPerformance(
  branchQuery: string,
  limit = 2,
): Promise<RecentCampaignPerformanceResult> {
  try {
    const { data: rows, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id,name,subject,branches,audience_size,launched_at,created_at,send_status,status')
      .not('launched_at', 'is', null)
      .order('launched_at', { ascending: false })
      .limit(100);
    if (campaignsError) throw campaignsError;

    const normalizedQuery = branchQuery.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/com$/, '');
    const matchesBranch = (branches: unknown): boolean => {
      if (!normalizedQuery || !Array.isArray(branches)) return false;
      return branches.some((branch) => {
        const normalizedBranch = String(branch).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/com$/, '');
        return normalizedBranch === normalizedQuery
          || normalizedBranch.includes(normalizedQuery)
          || normalizedQuery.includes(normalizedBranch);
      });
    };

    const campaigns = (rows || [])
      .filter((row: any) => row.subject && matchesBranch(row.branches))
      .slice(0, Math.max(1, limit));

    if (campaigns.length === 0) return { campaigns: [], error: null };

    const { data: statsRows, error: statsError } = await supabase
      .from('campaign_stats_by_id')
      .select('campaign_id,sent,delivered,opened,clicked,bounced,complained')
      .in('campaign_id', campaigns.map((campaign: any) => campaign.id));
    if (statsError) throw statsError;

    const statsById = new Map((statsRows || []).map((row: any) => [row.campaign_id, row]));
    return {
      campaigns: campaigns.map((campaign: any) => {
        const stats: any = statsById.get(campaign.id) || {};
        return {
          id: campaign.id,
          subject: campaign.subject,
          name: campaign.name || campaign.subject,
          launchedAt: campaign.launched_at || campaign.created_at,
          audienceSize: campaign.audience_size || 0,
          sent: Number(stats.sent || 0),
          delivered: Number(stats.delivered || 0),
          opened: Number(stats.opened || 0),
          clicked: Number(stats.clicked || 0),
          bounced: Number(stats.bounced || 0),
          complained: Number(stats.complained || 0),
        };
      }),
      error: null,
    };
  } catch (e) {
    console.error('fetchRecentCampaignPerformance failed:', e);
    return {
      campaigns: [],
      error: e instanceof Error ? e.message : 'Email reporting query failed',
    };
  }
}

// Returns the email-key intersection for recipient-level opens across every
// supplied campaign. Repeated opens collapse to one person per campaign before
// intersecting, so the result answers "opened BOTH" rather than adding the two
// campaign totals together.
export async function fetchSharedCampaignOpeners(
  campaignIds: string[],
): Promise<SharedCampaignOpenersResult> {
  const ids = [...new Set(campaignIds.filter(Boolean))];
  if (ids.length < 2) return { emails: [], error: 'At least two campaigns are required' };

  try {
    const openerSets: Set<string>[] = [];
    for (const campaignId of ids) {
      const rows = await fetchAllPages<{ email: string }>(
        'email_events',
        'email',
        (query) => query.eq('campaign_id', campaignId).eq('event_type', 'opened'),
        'email',
      );
      openerSets.push(new Set(rows.map((row) => (row.email || '').trim().toLowerCase()).filter(Boolean)));
    }

    const [first, ...rest] = openerSets;
    const emails = [...first]
      .filter((email) => rest.every((set) => set.has(email)))
      .sort((a, b) => a.localeCompare(b));
    return { emails, error: null };
  } catch (e) {
    console.error('fetchSharedCampaignOpeners failed:', e);
    return {
      emails: [],
      error: e instanceof Error ? e.message : 'Shared opener query failed',
    };
  }
}

// Branch-scoped recipient activity for the latest campaigns. Reports uses this
// to calculate repeat-engagement cohorts (opened both, 2 of 3, 3 of 5) without
// storing any spoke profile data in the Hub. Every campaign/email pair collapses
// repeated webhook events into one recipient record.
export async function fetchRecentCampaignEngagement(
  branchQuery: string,
  limit = 5,
): Promise<RecentCampaignEngagementResult> {
  const recent = await fetchRecentCampaignPerformance(branchQuery, limit);
  if (recent.error || recent.campaigns.length === 0) {
    return { campaigns: recent.campaigns, recipientsByCampaign: {}, error: recent.error };
  }

  try {
    const recipientsByCampaign: Record<string, CampaignEngagementRecipient[]> = {};
    for (const campaign of recent.campaigns) {
      const rows = await fetchAllPages<{
        email: string;
        event_type: string;
        occurred_at: string;
      }>(
        'email_events',
        'email,event_type,occurred_at',
        (query) => query.eq('campaign_id', campaign.id).in('event_type', ['delivered', 'opened', 'clicked']),
        'occurred_at',
      );

      const byEmail = new Map<string, CampaignEngagementRecipient>();
      for (const row of rows) {
        const email = (row.email || '').trim().toLowerCase();
        if (!email) continue;
        const recipient = byEmail.get(email) || {
          email,
          deliveredAt: null,
          firstOpenedAt: null,
          firstClickedAt: null,
        };
        if (row.event_type === 'delivered' && !recipient.deliveredAt) recipient.deliveredAt = row.occurred_at;
        if (row.event_type === 'opened' && !recipient.firstOpenedAt) recipient.firstOpenedAt = row.occurred_at;
        if (row.event_type === 'clicked' && !recipient.firstClickedAt) recipient.firstClickedAt = row.occurred_at;
        byEmail.set(email, recipient);
      }
      recipientsByCampaign[campaign.id] = [...byEmail.values()];
    }

    return { campaigns: recent.campaigns, recipientsByCampaign, error: null };
  } catch (e) {
    console.error('fetchRecentCampaignEngagement failed:', e);
    return {
      campaigns: recent.campaigns,
      recipientsByCampaign: {},
      error: e instanceof Error ? e.message : 'Campaign engagement query failed',
    };
  }
}

export async function fetchSuppressionSummary(): Promise<SuppressionSummary> {
  const empty: SuppressionSummary = { total: 0, unsubscribe: 0, bounce: 0, complaint: 0, manual: 0 };
  try {
    const { data, error } = await supabase.from('email_suppressions').select('reason');
    if (error) throw error;
    const s: SuppressionSummary = { ...empty };
    for (const r of (data || []) as { reason: string }[]) {
      s.total++;
      if (r.reason === 'unsubscribe') s.unsubscribe++;
      else if (r.reason === 'bounce') s.bounce++;
      else if (r.reason === 'complaint') s.complaint++;
      else if (r.reason === 'manual') s.manual++;
    }
    return s;
  } catch (e) {
    console.error('fetchSuppressionSummary failed:', e);
    return empty;
  }
}

// A single delivery/engagement event for one recipient, straight from email_events.
export interface EmailEventRow {
  id: string;
  email: string;
  event_type: string;
  campaign_subject: string | null;
  // Set only when the Resend webhook matched this event back to a Trellis send
  // (via campaign_sends). null = a transactional/spoke email that merely shares
  // the Resend account — not a campaign Trellis dispatched.
  campaign_id: string | null;
  resend_email_id: string | null;
  // Only set on event_type='clicked' — the specific link the recipient clicked.
  link_url: string | null;
  occurred_at: string;
  metadata: Record<string, any> | null;
}

// Per-contact email history — the "track this person over time" view. Keyed by
// email (the federated identity key); does NOT touch any spoke/profile data.
export async function fetchEmailActivity(email: string): Promise<EmailEventRow[]> {
  if (!email) return [];
  try {
    const { data, error } = await supabase
      .from('email_events')
      .select('id,email,event_type,campaign_subject,campaign_id,resend_email_id,link_url,occurred_at,metadata')
      .eq('email', email.toLowerCase())
      .order('occurred_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data || []) as EmailEventRow[];
  } catch (e) {
    console.error('fetchEmailActivity failed:', e);
    return [];
  }
}

// Delivery/engagement rollup for one recipient. Exact Resend IDs are primary;
// lowercased subjects remain as a fallback for historical lead sends.
export interface EmailEngagementStatus {
  sent: boolean;
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  bounced: boolean;
  complained: boolean;
  openedAt: string | null;
  clickedAt: string | null;
}

export async function fetchLeadEmailEngagement(
  email: string,
): Promise<Record<string, EmailEngagementStatus>> {
  const rows = await fetchEmailActivity(email);
  const map: Record<string, EmailEngagementStatus> = {};
  for (const r of rows) {
    const keys = [...new Set([r.resend_email_id, (r.campaign_subject || '').trim().toLowerCase()].filter(Boolean) as string[])];
    for (const key of keys) {
      const s = map[key] || (map[key] = {
        sent: false, delivered: false, opened: false, clicked: false,
        bounced: false, complained: false, openedAt: null, clickedAt: null,
      });
      switch (r.event_type) {
        case 'sent': s.sent = true; break;
        case 'delivered': s.delivered = true; break;
        case 'opened': s.opened = true; if (!s.openedAt) s.openedAt = r.occurred_at; break;
        case 'clicked': s.clicked = true; if (!s.clickedAt) s.clickedAt = r.occurred_at; break;
        case 'bounced': s.bounced = true; break;
        case 'complained': s.complained = true; break;
      }
    }
  }
  return map;
}

// One row per recipient of an exact campaign — the
// "who opened/clicked/complained" list.
export interface CampaignRecipient {
  email: string;
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  bounced: boolean;
  complained: boolean;
  // Unsubscribed — sourced from email_suppressions (reason='unsubscribe'), NOT a
  // Resend event, so it's joined in by email (campaign_recipient_status can't carry it).
  unsubscribed: boolean;
  // Every distinct link this recipient clicked, in click order.
  linkUrls: string[];
  lastEventAt: string | null;
}

const suppressionScopesForCampaign = (branches: string[]): string[] => {
  const normalized = [...new Set((branches || []).map((branch) => String(branch).trim().toLowerCase()).filter(Boolean))];
  return normalized.length === 1 ? ['global', normalized[0]] : ['global'];
};

// Sourced from campaign_recipient_status_by_id — grouped server-side to one row
// per (campaign_id, email), not one row per raw event. A campaign with 12,800
// delivery/open/click events for 5,600 recipients pulls 5,600 rows here, not
// 12,800, and that count only grows with audience size, not re-opens/re-sends.
export async function fetchCampaignRecipients(
  campaignId: string,
  branches: string[] = [],
  onProgress?: (rowsSoFar: number) => void,
): Promise<CampaignRecipient[]> {
  if (!campaignId) return [];
  try {
    const data = await fetchAllPages<{
      email: string; delivered: boolean; opened: boolean; clicked: boolean;
       bounced: boolean; complained: boolean; link_urls: string[] | null; last_event_at: string | null;
    }>(
      'campaign_recipient_status_by_id',
      'email,delivered,opened,clicked,bounced,complained,link_urls,last_event_at',
      (q) => q.eq('campaign_id', campaignId),
      'email',
      onProgress,
    );

    // Unsubscribes aren't Resend events — they live in email_suppressions. Pull the
    // unsubscribe rows once (the do-not-email list is small) and join by email.
    const unsubscribedSet = new Set<string>();
    try {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: sup, error: supErr } = await supabase
          .from('email_suppressions')
          .select('email')
          .eq('reason', 'unsubscribe')
          .in('scope', suppressionScopesForCampaign(branches))
          .range(from, from + PAGE - 1);
        if (supErr) break;
        for (const s of sup || []) unsubscribedSet.add((s.email || '').toLowerCase());
        if (!sup || sup.length < PAGE) break;
      }
    } catch { /* non-fatal — unsubscribed flags just stay false */ }

    return data
      .map((r) => ({
        email: r.email,
        delivered: r.delivered,
        opened: r.opened,
        clicked: r.clicked,
        bounced: r.bounced,
        complained: r.complained,
        unsubscribed: unsubscribedSet.has((r.email || '').toLowerCase()),
        linkUrls: r.link_urls || [],
        lastEventAt: r.last_event_at,
      }))
      .sort((a, b) => String(a.lastEventAt || '') < String(b.lastEventAt || '') ? 1 : -1);
  } catch (e) {
    console.error('fetchCampaignRecipients failed:', e);
    return [];
  }
}

// Unsubscribe count for one campaign. Unsubscribes aren't Resend events (they
// live in email_suppressions), so campaign_email_stats can't report them. We
// intersect this campaign's exact-ID recipients
// with the unsubscribe suppression list — the SAME definition the recipients
// modal uses, so the drawer metric and the modal's Unsubscribed chip agree.
export async function fetchCampaignUnsubscribedCount(campaignId: string, branches: string[] = []): Promise<number> {
  if (!campaignId) return 0;
  try {
    // The unsubscribe list is small (the do-not-email list) — pull it once.
    const emails: string[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('email_suppressions')
        .select('email')
        .eq('reason', 'unsubscribe')
        .in('scope', suppressionScopesForCampaign(branches))
        .range(from, from + PAGE - 1);
      if (error) return 0;
      for (const r of data || []) if (r.email) emails.push(r.email.toLowerCase());
      if (!data || data.length < PAGE) break;
    }
    if (emails.length === 0) return 0;

    // Count how many are recipients of this campaign. Chunk the IN list so the
    // request URL stays bounded even if the suppression list grows large.
    let total = 0;
    const CH = 300;
    for (let i = 0; i < emails.length; i += CH) {
      const { count, error } = await supabase
        .from('campaign_recipient_status_by_id')
        .select('email', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('email', emails.slice(i, i + CH));
      if (error) return total;
      total += count || 0;
    }
    return total;
  } catch (e) {
    console.error('fetchCampaignUnsubscribedCount failed:', e);
    return 0;
  }
}

// ── Link click summary ───────────────────────────────────────────────────────
// "Which link in this campaign actually earned the clicks", then drill into who
// clicked it. Sourced from campaign_link_clicks (server-side rollup over
// email_events), with human-readable labels recovered from the sent HTML.

export interface CampaignLinkClick {
  linkUrl: string;
  // Anchor text from the sent email ("Shop This Week's Sale"). Falls back to a
  // label derived from the URL when the link had no text (image/icon links) or
  // when the campaign's HTML isn't available — never null, so the UI always has
  // something readable to show.
  label: string;
  // True when `label` came from the email's own copy rather than the URL. The UI
  // dims derived labels so a guess is never mistaken for the real link text.
  labelFromEmail: boolean;
  // Raw click events — repeat clicks by the same person included.
  clicks: number;
  // Distinct people. Summing this across links does NOT equal the campaign's
  // Clicked count (one person clicking three links is 1 clicker, 3 rows here).
  uniqueClickers: number;
  firstClickAt: string | null;
  lastClickAt: string | null;
}

// Resend's click payload carries only the destination URL — there is no anchor
// text in it — so a bare URL is all email_events can store. The readable label
// has to come from the email we sent, which the durable outbox saved verbatim in
// campaigns.dispatch.html_template.
//
// Parsed with DOMParser rather than a regex: it decodes entities in both the
// href and the text (`&amp;` in a stored href vs. the raw `&` Resend reports
// would otherwise never match, and `&rsquo;` would render literally), and it
// handles the nested tags email HTML wraps every link in. 'text/html' parsing
// does not execute scripts, and the result is only ever read as text — never
// injected back into the DOM.
export function extractLinkLabels(html: string): Map<string, string> {
  const labels = new Map<string, string>();
  if (!html) return labels;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('a[href]').forEach((anchor) => {
      const href = (anchor.getAttribute('href') || '').trim();
      if (!href || href.startsWith('{{') || href.startsWith('#') || href.startsWith('mailto:')) return;
      let text = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
      // Image/icon links (the social row) have no text — the alt attribute is
      // the only description the email itself provides.
      if (!text) text = (anchor.querySelector('img')?.getAttribute('alt') || '').trim();
      if (!text) return;
      // Same href can appear twice with different text (a bare icon and a worded
      // link). First non-empty wins; don't let a later empty one clear it.
      const key = normalizeLinkKey(href);
      if (!labels.has(key)) labels.set(key, text.length > 120 ? `${text.slice(0, 117)}…` : text);
    });
  } catch (e) {
    console.error('extractLinkLabels failed:', e);
  }
  return labels;
}

// Match key for "same link" across the two sources. Resend reports the URL it
// redirected through, which can differ from the stored href by trailing slash or
// protocol case, so compare on a normalized form instead of raw equality.
function normalizeLinkKey(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

// Readable fallback when the email gave us no anchor text: "atlurbanfarms.com →
// blog / keep your tower clean" reads far better than a raw URL in a table.
export function deriveLabelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/|\/$/g, '');
    const host = u.hostname.replace(/^www\./, '');
    if (!path) return host;
    const readable = path
      .split('/')
      .map((seg) => decodeURIComponent(seg).replace(/[-_+]/g, ' ').trim())
      .filter(Boolean)
      .join(' / ');
    return `${host} · ${readable}`;
  } catch {
    return url;
  }
}

// The campaign HTML we actually sent, looked up by its durable campaign ID.
async function fetchSentHtmlById(campaignId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('dispatch')
      .eq('id', campaignId)
      .maybeSingle();
    if (error) throw error;
    return (data as any)?.dispatch?.html_template || '';
  } catch (e) {
    console.error('fetchSentHtmlById failed:', e);
    return '';
  }
}

// Per-link click counts for one campaign, ranked by clicks. Pass `sentHtml` when
// the caller already has the campaign row (the Campaigns drawer does) to skip the
// extra lookup; Reports only knows the subject, so it omits it.
export async function fetchCampaignLinkClicks(
  campaignId: string,
  sentHtml?: string,
): Promise<CampaignLinkClick[]> {
  if (!campaignId) return [];
  try {
    const [{ data, error }, html] = await Promise.all([
      supabase
        .from('campaign_link_clicks_by_id')
        .select('link_url,clicks,unique_clickers,first_click_at,last_click_at')
        .eq('campaign_id', campaignId)
        .order('clicks', { ascending: false }),
      sentHtml !== undefined ? Promise.resolve(sentHtml) : fetchSentHtmlById(campaignId),
    ]);
    if (error) throw error;

    const labels = extractLinkLabels(html);
    return (data || []).map((r: any) => {
      const fromEmail = labels.get(normalizeLinkKey(r.link_url));
      return {
        linkUrl: r.link_url,
        label: fromEmail || deriveLabelFromUrl(r.link_url),
        labelFromEmail: !!fromEmail,
        clicks: r.clicks ?? 0,
        uniqueClickers: r.unique_clickers ?? 0,
        firstClickAt: r.first_click_at ?? null,
        lastClickAt: r.last_click_at ?? null,
      };
    });
  } catch (e) {
    console.error('fetchCampaignLinkClicks failed:', e);
    return [];
  }
}

export interface LinkClicker {
  email: string;
  clicks: number; // times this person clicked THIS link
  firstClickAt: string;
  lastClickAt: string;
}

// Who clicked one specific link, most recent first. Scoped to a single link of a
// single campaign, so this reads a small slice of email_events rather than the
// whole campaign's click history.
export async function fetchLinkClickers(
  campaignId: string,
  linkUrl: string,
): Promise<LinkClicker[]> {
  if (!campaignId || !linkUrl) return [];
  try {
    const rows = await fetchAllPages<{ email: string; link_url: string | null; occurred_at: string; metadata: any }>(
      'email_events',
      'email,link_url,occurred_at,metadata',
      (q) => q.eq('campaign_id', campaignId).eq('event_type', 'clicked'),
      'occurred_at',
    );

    const target = normalizeLinkKey(linkUrl);
    const byEmail = new Map<string, LinkClicker>();
    for (const r of rows) {
      // Same COALESCE the view uses — pre-Aug-5 events only carry the link in metadata.
      const url = r.link_url || r.metadata?.click?.link || '';
      if (!url || normalizeLinkKey(url) !== target) continue;
      const key = (r.email || '').toLowerCase();
      if (!key) continue;
      const existing = byEmail.get(key);
      if (existing) {
        existing.clicks++;
        // fetchAllPages orders ascending, so later rows are always the newer ones.
        existing.lastClickAt = r.occurred_at;
      } else {
        byEmail.set(key, { email: key, clicks: 1, firstClickAt: r.occurred_at, lastClickAt: r.occurred_at });
      }
    }
    return [...byEmail.values()].sort((a, b) => (a.lastClickAt < b.lastClickAt ? 1 : -1));
  } catch (e) {
    console.error('fetchLinkClickers failed:', e);
    return [];
  }
}

// Bulk per-address engagement aggregate, built for segment targeting (see
// SEGMENT_FIELDS 'engagement' category + segmentEngine.ts). One row per email that
// has at least one 'opened' or 'clicked' event.
export interface EngagementSummary {
  email: string; // lowercased
  opened: number; // count of 'opened' events for this address
  clicked: number; // count of 'clicked' events for this address
  last_opened_at: string | null;
  last_clicked_at: string | null;
  campaigns_delivered: number; // distinct campaigns delivered to this address
  campaigns_opened: number; // distinct campaigns opened at least once
  campaigns_clicked: number; // distinct campaigns with a non-unsubscribe click
}

export interface LinkInterestClickSummary {
  email: string;
  link_url: string;
  campaign_id: string | null;
  campaign_subject: string | null;
  click_date: string;
  clicks: number;
  first_click_at: string;
  last_click_at: string;
}

// One row per address/link/campaign/day from link_interest_clicks. Daily buckets
// keep all-time intent reads compact while preserving accurate recency filters.
export async function fetchLinkInterestByEmail(): Promise<Map<string, LinkInterestClickSummary[]>> {
  const result = new Map<string, LinkInterestClickSummary[]>();
  try {
    const rows = await fetchAllPages<LinkInterestClickSummary>(
      'link_interest_clicks',
      'email,link_url,campaign_id,campaign_subject,click_date,clicks,first_click_at,last_click_at',
      (query) => query,
      'email',
    );
    for (const row of rows) {
      const email = (row.email || '').trim().toLowerCase();
      if (!email || !row.link_url) continue;
      const existing = result.get(email) || [];
      existing.push({ ...row, email, clicks: Number(row.clicks || 0) });
      result.set(email, existing);
    }
  } catch (e) {
    console.error('fetchLinkInterestByEmail failed:', e);
  }
  return result;
}

// Bulk engagement aggregate for segment targeting, sourced from
// email_engagement_summary — grouped server-side to one row per email (bounded
// by audience size), not one row per open/click event (bounded by all-time
// activity, which is what made this table balloon on any decently-aged Hub).
export async function fetchEngagementByEmail(): Promise<Map<string, EngagementSummary>> {
  const result = new Map<string, EngagementSummary>();
  try {
    const data = await fetchAllPages<{
      email: string; opened: number; clicked: number; last_opened_at: string | null; last_clicked_at: string | null;
      campaigns_delivered: number; campaigns_opened: number; campaigns_clicked: number;
    }>('email_engagement_summary', 'email,opened,clicked,last_opened_at,last_clicked_at,campaigns_delivered,campaigns_opened,campaigns_clicked', (q) => q, 'email');
    for (const row of data) {
      const key = (row.email || '').toLowerCase();
      if (!key || (!row.opened && !row.clicked)) continue;
      result.set(key, {
        email: key,
        opened: row.opened,
        clicked: row.clicked,
        last_opened_at: row.last_opened_at,
        last_clicked_at: row.last_clicked_at,
        campaigns_delivered: row.campaigns_delivered || 0,
        campaigns_opened: row.campaigns_opened || 0,
        campaigns_clicked: row.campaigns_clicked || 0,
      });
    }
    return result;
  } catch (e) {
    console.error('fetchEngagementByEmail failed:', e);
    return result;
  }
}

// Engagement summaries PLUS the set of addresses we have ever actually emailed.
//
// The distinction matters and is the whole reason this exists alongside
// fetchEngagementByEmail: an address with zero opens scores 0, but that means
// two completely different things. "We emailed them five times and they never
// opened" is genuine disengagement. "We have never emailed them" is no data at
// all, and scoring it as critical churn risk would invent alarm exactly the way
// the old hardcoded 85% invented health. Callers use `contacted` to tell them
// apart and render the second case as unknown.
//
// One query over every event type, grouped client-side, so this stays a single
// round trip rather than one per profile.
export async function fetchEngagementIndex(): Promise<{
  summaries: Map<string, EngagementSummary>;
  contacted: Set<string>;
}> {
  const summaries = new Map<string, EngagementSummary>();
  const contacted = new Set<string>();
  try {
    const data = await fetchAllPages<{
      email: string; opened: number; clicked: number; last_opened_at: string | null; last_clicked_at: string | null;
      campaigns_delivered: number; campaigns_opened: number; campaigns_clicked: number;
    }>('email_engagement_summary', 'email,opened,clicked,last_opened_at,last_clicked_at,campaigns_delivered,campaigns_opened,campaigns_clicked', (q) => q, 'email');

    for (const row of data) {
      const key = (row.email || '').toLowerCase();
      if (!key) continue;
      // Every row here has at least one email_events row (any type), so presence
      // in this view is itself the "we've contacted this address" signal.
      contacted.add(key);
      if (!row.opened && !row.clicked) continue;
      summaries.set(key, {
        email: key,
        opened: row.opened,
        clicked: row.clicked,
        last_opened_at: row.last_opened_at,
        last_clicked_at: row.last_clicked_at,
        campaigns_delivered: row.campaigns_delivered || 0,
        campaigns_opened: row.campaigns_opened || 0,
        campaigns_clicked: row.campaigns_clicked || 0,
      });
    }
    return { summaries, contacted };
  } catch (e) {
    console.error('fetchEngagementIndex failed:', e);
    return { summaries, contacted };
  }
}

// Derives profiles.engagement_score (0-100) and profiles.churn_risk from a bulk
// EngagementSummary. Simple, deterministic scoring — not a written-back value, just
// available for a future job/UI to use:
//   - Recency: up to 60 pts, linear decay from the most recent open/click, reaching
//     0 at 90+ days (or if the address has never opened/clicked at all).
//   - Frequency: up to 40 pts, from min(opens + clicks*2, 20) activity units scaled
//     to 40 (clicks count double since they're stronger engagement signal).
// churn_risk buckets the resulting score using the existing Profile.churn_risk
// values (types.ts): >=70 minimal, >=40 moderate, >=15 high, else critical.
export function computeEngagementScore(
  summary: EngagementSummary | undefined
): { engagement_score: number; churn_risk: 'minimal' | 'moderate' | 'high' | 'critical' } {
  const opened = summary?.opened ?? 0;
  const clicked = summary?.clicked ?? 0;
  const lastTouch = summary?.last_clicked_at || summary?.last_opened_at || null;

  let recencyScore = 0;
  if (lastTouch) {
    const daysSinceTouch = Math.max(0, Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86400000));
    recencyScore = Math.max(0, 60 * (1 - daysSinceTouch / 90));
  }

  const activityUnits = Math.min(opened + clicked * 2, 20);
  const frequencyScore = (activityUnits / 20) * 40;

  const engagement_score = Math.round(Math.min(100, recencyScore + frequencyScore));

  let churn_risk: 'minimal' | 'moderate' | 'high' | 'critical';
  if (engagement_score >= 70) churn_risk = 'minimal';
  else if (engagement_score >= 40) churn_risk = 'moderate';
  else if (engagement_score >= 15) churn_risk = 'high';
  else churn_risk = 'critical';

  return { engagement_score, churn_risk };
}

// One row per suppressed address, for the org-wide "who unsubscribed / complained /
// bounced" list — filter by reason to answer "who complained?" directly instead of
// paging through campaign recipients or opening profiles one at a time.
export interface SuppressionRow {
  email: string;
  reason: string;
  source: string | null;
  campaign_subject: string | null;
  created_at: string;
}

export async function fetchSuppressions(reason?: string): Promise<SuppressionRow[]> {
  try {
    let query = supabase
      .from('email_suppressions')
      .select('email,reason,source,campaign_subject,created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (reason) query = query.eq('reason', reason);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as SuppressionRow[];
  } catch (e) {
    console.error('fetchSuppressions failed:', e);
    return [];
  }
}

export interface EmailSuppressionStatus {
  suppressed: boolean;
  reason?: string;
  source?: string;
  created_at?: string;
}

// Whether a specific address is on the suppression list (unsubscribed / bounced /
// complained). Returns { suppressed: false } when clean.
export async function fetchSuppressionForEmail(email: string): Promise<EmailSuppressionStatus> {
  if (!email) return { suppressed: false };
  try {
    const { data, error } = await supabase
      .from('email_suppressions')
      .select('reason,source,created_at')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    if (!data) return { suppressed: false };
    return { suppressed: true, reason: data.reason, source: data.source, created_at: data.created_at };
  } catch (e) {
    console.error('fetchSuppressionForEmail failed:', e);
    return { suppressed: false };
  }
}
