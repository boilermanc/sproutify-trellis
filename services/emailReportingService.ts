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
