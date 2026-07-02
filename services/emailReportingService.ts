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
