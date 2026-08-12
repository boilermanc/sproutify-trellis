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

// Per-campaign email metrics, aggregated by subject on the Hub (`campaign_email_stats`
// view over `email_events`, which the resend-webhook edge function populates).
export interface CampaignEmailStat {
  campaign_subject: string;
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
    const { data, error } = await supabase
      .from('campaign_email_stats')
      .select('*')
      .order('last_event_at', { ascending: false });
    if (error) throw error;
    return (data || []) as CampaignEmailStat[];
  } catch (e) {
    console.error('fetchCampaignEmailStats failed:', e);
    return [];
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
      .select('id,email,event_type,campaign_subject,resend_email_id,link_url,occurred_at,metadata')
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

// Delivery/engagement rollup for one recipient, keyed by email SUBJECT (lowercased),
// so a specific sent email (e.g. a lead's welcome) can show its own status. Same
// subject-keying campaign stats use. Timestamps are the latest of each event type
// (fetchEmailActivity returns rows newest-first).
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
    const key = (r.campaign_subject || '').trim().toLowerCase();
    if (!key) continue;
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
  return map;
}

// One row per recipient of a given campaign (matched by subject, same grouping
// campaign_email_stats uses) — the "who opened/clicked/complained" list, so you
// don't have to open each customer's profile one at a time to find out.
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
  lastEventAt: string;
}

// Sourced from campaign_recipient_status — grouped server-side to one row per
// (campaign_subject, email), not one row per raw event. A campaign with 12,800
// delivery/open/click events for 5,600 recipients pulls 5,600 rows here, not
// 12,800, and that count only grows with audience size, not re-opens/re-sends.
export async function fetchCampaignRecipients(
  campaignSubject: string,
  onProgress?: (rowsSoFar: number) => void,
): Promise<CampaignRecipient[]> {
  if (!campaignSubject) return [];
  try {
    const data = await fetchAllPages<{
      email: string; delivered: boolean; opened: boolean; clicked: boolean;
      bounced: boolean; complained: boolean; link_urls: string[] | null; last_event_at: string;
    }>(
      'campaign_recipient_status',
      'email,delivered,opened,clicked,bounced,complained,link_urls,last_event_at',
      (q) => q.eq('campaign_subject', campaignSubject),
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
      .sort((a, b) => (a.lastEventAt < b.lastEventAt ? 1 : -1));
  } catch (e) {
    console.error('fetchCampaignRecipients failed:', e);
    return [];
  }
}

// Unsubscribe count for one campaign. Unsubscribes aren't Resend events (they
// live in email_suppressions), so campaign_email_stats can't report them. We
// intersect this campaign's recipients (campaign_recipient_status, by subject)
// with the unsubscribe suppression list — the SAME definition the recipients
// modal uses, so the drawer metric and the modal's Unsubscribed chip agree.
export async function fetchCampaignUnsubscribedCount(campaignSubject: string): Promise<number> {
  if (!campaignSubject) return 0;
  try {
    // The unsubscribe list is small (the do-not-email list) — pull it once.
    const emails: string[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('email_suppressions')
        .select('email')
        .eq('reason', 'unsubscribe')
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
        .from('campaign_recipient_status')
        .select('email', { count: 'exact', head: true })
        .eq('campaign_subject', campaignSubject)
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

// Bulk per-address engagement aggregate, built for segment targeting (see
// SEGMENT_FIELDS 'engagement' category + segmentEngine.ts). One row per email that
// has at least one 'opened' or 'clicked' event.
export interface EngagementSummary {
  email: string; // lowercased
  opened: number; // count of 'opened' events for this address
  clicked: number; // count of 'clicked' events for this address
  last_opened_at: string | null;
  last_clicked_at: string | null;
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
    }>('email_engagement_summary', 'email,opened,clicked,last_opened_at,last_clicked_at', (q) => q, 'email');
    for (const row of data) {
      const key = (row.email || '').toLowerCase();
      if (!key || (!row.opened && !row.clicked)) continue;
      result.set(key, { email: key, opened: row.opened, clicked: row.clicked, last_opened_at: row.last_opened_at, last_clicked_at: row.last_clicked_at });
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
    }>('email_engagement_summary', 'email,opened,clicked,last_opened_at,last_clicked_at', (q) => q, 'email');

    for (const row of data) {
      const key = (row.email || '').toLowerCase();
      if (!key) continue;
      // Every row here has at least one email_events row (any type), so presence
      // in this view is itself the "we've contacted this address" signal.
      contacted.add(key);
      if (!row.opened && !row.clicked) continue;
      summaries.set(key, { email: key, opened: row.opened, clicked: row.clicked, last_opened_at: row.last_opened_at, last_clicked_at: row.last_clicked_at });
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
