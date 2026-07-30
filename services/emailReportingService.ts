import { supabase } from '../lib/supabase';

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
  resend_email_id: string | null;
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
      .select('id,email,event_type,campaign_subject,resend_email_id,occurred_at,metadata')
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

// Bulk engagement aggregate for segment targeting: a single query over email_events
// (not one call per profile), grouped client-side by lowercased email into open/click
// counts plus last-touch timestamps. Keyed the same way the rest of the codebase
// normalizes email identity (see fetchEmailActivity above).
export async function fetchEngagementByEmail(): Promise<Map<string, EngagementSummary>> {
  const result = new Map<string, EngagementSummary>();
  try {
    const { data, error } = await supabase
      .from('email_events')
      .select('email,event_type,occurred_at')
      .in('event_type', ['opened', 'clicked'])
      .order('occurred_at', { ascending: true })
      // Bulk aggregate query — explicit range so we don't silently fall back to the
      // client's default 1000-row cap on a large events table.
      .range(0, 49999);
    if (error) throw error;
    for (const row of (data || []) as { email: string; event_type: string; occurred_at: string }[]) {
      const key = (row.email || '').toLowerCase();
      if (!key) continue;
      let summary = result.get(key);
      if (!summary) {
        summary = { email: key, opened: 0, clicked: 0, last_opened_at: null, last_clicked_at: null };
        result.set(key, summary);
      }
      // Rows are ordered ascending by occurred_at, so the last write for each
      // event_type ends up holding the most recent timestamp.
      if (row.event_type === 'opened') {
        summary.opened++;
        summary.last_opened_at = row.occurred_at;
      } else if (row.event_type === 'clicked') {
        summary.clicked++;
        summary.last_clicked_at = row.occurred_at;
      }
    }
    return result;
  } catch (e) {
    console.error('fetchEngagementByEmail failed:', e);
    return result;
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
