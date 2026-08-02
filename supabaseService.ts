import { supabase } from './lib/supabase';
import { Profile } from './types';

export { supabase };

// Campaign interface
export interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'paused';
  template: string;
  subject: string;
  trigger_type: 'immediate' | 'scheduled' | 'event_based';
  scheduled_at: string | null;
  segments: string[];
  tags: string[];
  branches: string[];
  audience_size: number;
  metadata: Record<string, any> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  launched_at: string | null;
  // Durable outbox fields (send state machine driven by the campaign-sender worker)
  dispatch?: CampaignDispatch | null;
  send_status?: 'queued' | 'sending' | 'sent' | 'partial' | 'failed' | null;
  send_error?: string | null;
  retry_count?: number;
  last_attempt_at?: string | null;
}

// The fully-rendered email saved at launch time so a send can be (re)tried later
// without re-deriving anything. The worker reads this off the campaign row.
export interface CampaignDispatch {
  subject: string;
  from?: string;
  html_template: string;              // content tokens filled; {{first_name}}/{{unsubscribe_url}} intact
  unsubscribe_url_template?: string;  // brand template with {{token}}, filled per recipient by the worker
}

export interface CampaignRecipientStats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
}

/**
 * Fetch all active profiles from the profiles table
 * Orders by last_active descending
 */
export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'active')
    .order('last_active', { ascending: false });

  if (error) {
    console.error('Error fetching profiles:', error);
    throw error;
  }

  // Map database rows to Profile type, handling JSONB arrays
  return (data || []).map((row: any) => ({
    id: row.id,
    spoke_uuid: row.spoke_uuid,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    avatar_url: row.avatar_url,
    bio: row.bio,
    is_subscribed: row.is_subscribed,
    marketing_pause: row.marketing_pause,
    tags: Array.isArray(row.tags) ? row.tags : [],
    segments: Array.isArray(row.segments) ? row.segments : [],
    branches: Array.isArray(row.branches) ? row.branches : [],
    status: row.status,
    ltv: row.ltv,
    churn_risk: row.churn_risk,
    last_active: row.last_active,
    last_event_timestamp: row.last_event_timestamp,
    engagement_score: row.engagement_score,
    metadata: row.metadata,
    role: row.role,
  }));
}

/**
 * Fetch all campaigns from the campaigns table
 * Orders by created_at descending
 */
export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching campaigns:', error);
    throw error;
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    template: row.template,
    subject: row.subject,
    trigger_type: row.trigger_type,
    scheduled_at: row.scheduled_at,
    segments: Array.isArray(row.segments) ? row.segments : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    branches: Array.isArray(row.branches) ? row.branches : [],
    audience_size: row.audience_size,
    metadata: row.metadata,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    launched_at: row.launched_at,
    dispatch: row.dispatch ?? null,
    send_status: row.send_status ?? null,
    send_error: row.send_error ?? null,
    retry_count: row.retry_count ?? 0,
    last_attempt_at: row.last_attempt_at ?? null,
  }));
}

/**
 * Create a new campaign
 * Returns the created campaign or null on error
 */
export async function createCampaign(
  campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>
): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert(campaign)
    .select()
    .single();

  if (error) {
    console.error('Error creating campaign:', error);
    return null;
  }

  return data;
}

/**
 * Snapshot recipients into the durable outbox (campaign_recipients).
 * Called at launch time so the exact audience is saved BEFORE any send —
 * a bombed send can then be retried from what's stored, nothing re-derived.
 * Inserted in chunks to keep each request small for large lists.
 */
export async function enqueueCampaignRecipients(
  campaignId: string,
  recipients: Array<{ email: string; first_name?: string; unsubscribe_token?: string }>,
): Promise<{ inserted: number; error: string | null }> {
  const CHUNK = 1000;
  let inserted = 0;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const rows = recipients.slice(i, i + CHUNK).map((r) => ({
      campaign_id: campaignId,
      email: r.email,
      first_name: r.first_name || null,
      unsubscribe_token: r.unsubscribe_token || null,
      status: 'pending',
    }));
    const { error } = await supabase.from('campaign_recipients').insert(rows);
    if (error) {
      console.error('Error enqueuing recipients:', error);
      return { inserted, error: error.message };
    }
    inserted += rows.length;
  }
  return { inserted, error: null };
}

/**
 * Ping the campaign-sender worker to process the queue right now (immediate sends).
 * Scheduled campaigns don't need this — pg_cron picks them up at their time.
 * Fire-and-forget: failure here just means it waits for the next 2-min cron tick.
 */
export async function pingCampaignSender(): Promise<void> {
  try {
    await supabase.functions.invoke('campaign-sender', { body: {} });
  } catch (err) {
    console.warn('campaign-sender ping failed (cron will still pick it up):', err);
  }
}

/**
 * Retry a failed/partial campaign: reset its failed recipients back to pending,
 * re-queue the campaign, and ping the worker. Already-'sent' recipients are left
 * alone, so nobody gets emailed twice.
 */
export async function retryCampaign(campaignId: string): Promise<{ ok: boolean; error: string | null }> {
  const { error: rErr } = await supabase
    .from('campaign_recipients')
    .update({ status: 'pending', error: null })
    .eq('campaign_id', campaignId)
    .eq('status', 'failed');
  if (rErr) return { ok: false, error: rErr.message };

  const { error: cErr } = await supabase
    .from('campaigns')
    .update({ send_status: 'queued', send_error: null, updated_at: new Date().toISOString() })
    .eq('id', campaignId);
  if (cErr) return { ok: false, error: cErr.message };

  await pingCampaignSender();
  return { ok: true, error: null };
}

/**
 * Per-status recipient counts for a campaign (for the send-status UI/drawer).
 */
export async function fetchCampaignRecipientStats(campaignId: string): Promise<CampaignRecipientStats> {
  const count = async (status?: string) => {
    let q = supabase.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId);
    if (status) q = q.eq('status', status);
    const { count: c } = await q;
    return c || 0;
  };
  const [total, pending, sent, failed] = await Promise.all([count(), count('pending'), count('sent'), count('failed')]);
  return { total, pending, sent, failed };
}

/**
 * Update a campaign's status
 * Optionally set launched_at timestamp
 * Returns true on success, false on failure
 */
export async function updateCampaignStatus(
  id: string,
  status: Campaign['status'],
  launchedAt?: string
): Promise<boolean> {
  const updates: Partial<Campaign> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (launchedAt) {
    updates.launched_at = launchedAt;
  }

  const { error } = await supabase
    .from('campaigns')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating campaign status:', error);
    return false;
  }

  return true;
}
