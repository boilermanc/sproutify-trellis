import { supabase } from './lib/supabase';
import { Profile } from './types';

export { supabase };

// Campaign interface
export interface Campaign {
  id: string;
  owner_id?: string | null;
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
  campaign_type?: 'standard' | 'marketing_wizard';
  // Durable outbox fields (send state machine driven by the campaign-sender worker)
  dispatch?: CampaignDispatch | null;
  send_status?: 'queued' | 'sending' | 'sent' | 'partial' | 'failed' | null;
  send_error?: string | null;
  retry_count?: number;
  last_attempt_at?: string | null;
}

export type CampaignCreateInput = Omit<Campaign, 'id' | 'created_at' | 'updated_at' | 'owner_id'>;
export type CampaignDraftInput = Omit<
  CampaignCreateInput,
  'status' | 'launched_at' | 'dispatch' | 'send_status' | 'send_error' | 'retry_count' | 'last_attempt_at'
>;

// The fully-rendered email saved at launch time so a send can be (re)tried later
// without re-deriving anything. The worker reads this off the campaign row.
export interface CampaignDispatch {
  subject: string;
  preview_text?: string;              // inbox preheader (Mailchimp "Preview Text"); baked into html_template as a hidden block
  from?: string;
  cc?: string;
  html_template: string;              // content tokens filled; {{first_name}}/{{unsubscribe_url}} intact
  unsubscribe_url_template?: string;  // brand template with {{token}}, filled per recipient by the worker
}

export interface CampaignRecipientStats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
}

const mapCampaignRow = (row: any): Campaign => ({
  id: row.id,
  owner_id: row.owner_id ?? null,
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
  campaign_type: row.campaign_type ?? 'standard',
  dispatch: row.dispatch ?? null,
  send_status: row.send_status ?? null,
  send_error: row.send_error ?? null,
  retry_count: row.retry_count ?? 0,
  last_attempt_at: row.last_attempt_at ?? null,
});

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

  return (data || []).map(mapCampaignRow);
}

export async function fetchCampaignById(id: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapCampaignRow(data) : null;
}

/**
 * Create a new campaign
 * Returns the created campaign or null on error
 */
export async function createCampaign(
  campaign: CampaignCreateInput
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

  return mapCampaignRow(data);
}

/**
 * Insert a new draft or update the same draft row. Drafts never contain a
 * dispatch snapshot or send state, so saving work cannot enqueue an email.
 */
export async function saveCampaignDraft(
  id: string | null,
  draft: CampaignDraftInput,
): Promise<{ campaign: Campaign | null; error: string | null }> {
  const payload = {
    ...draft,
    status: 'draft',
    launched_at: null,
    dispatch: null,
    send_status: null,
    send_error: null,
    retry_count: 0,
    last_attempt_at: null,
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? supabase.from('campaigns').update(payload).eq('id', id).eq('status', 'draft')
    : supabase.from('campaigns').insert(payload);

  const { data, error } = await query.select('*').single();
  if (error) {
    console.error('Error saving campaign draft:', error);
    return { campaign: null, error: error.message };
  }
  return { campaign: mapCampaignRow(data), error: null };
}

/** Update an existing draft into its launch state without creating a duplicate. */
export async function launchCampaignDraft(
  id: string,
  campaign: CampaignCreateInput,
): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .update({ ...campaign, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft')
    .select('*')
    .single();

  if (error) {
    console.error('Error launching campaign draft:', error);
    return null;
  }
  return mapCampaignRow(data);
}

/**
 * Delete a DRAFT campaign. Restricted to status='draft' so sent campaigns (and their
 * engagement history) can never be removed here.
 */
export async function deleteCampaign(id: string): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from('campaigns').delete().eq('id', id).eq('status', 'draft');
  if (error) {
    console.error('Error deleting campaign:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

/**
 * Duplicate any campaign into a fresh DRAFT copy. Carries the editable definition
 * (name/subject/template/branches/segments + the builder_state in metadata) and drops
 * ALL send state + scheduling, so the copy is a clean new draft ready to edit and send.
 */
export async function duplicateCampaign(id: string): Promise<{ campaign: Campaign | null; error: string | null }> {
  const { data: src, error: fErr } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle();
  if (fErr || !src) return { campaign: null, error: fErr?.message || 'Campaign not found' };

  const payload = {
    name: `${src.name || 'Campaign'} (copy)`,
    subject: src.subject,
    template: src.template,
    trigger_type: src.trigger_type,
    campaign_type: src.campaign_type ?? 'standard',
    segments: src.segments,
    tags: src.tags,
    branches: src.branches,
    audience_size: src.audience_size,
    metadata: src.metadata,
    created_by: 'app',
    status: 'draft',
    scheduled_at: null,
    launched_at: null,
    dispatch: null,
    send_status: null,
    send_error: null,
    retry_count: 0,
    last_attempt_at: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('campaigns').insert(payload).select('*').single();
  if (error) {
    console.error('Error duplicating campaign:', error);
    return { campaign: null, error: error.message };
  }
  return { campaign: mapCampaignRow(data), error: null };
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
 * Recipients who were SENT the original campaign but never opened it — the audience
 * for a follow-up "reminder" resend. Built from the durable outbox snapshot
 * (campaign_recipients, status='sent') minus anyone who opened, bounced, or
 * complained per the campaign_recipient_status view (keyed by subject line).
 * Returns full recipient rows (email + first_name + unsubscribe_token) so the
 * follow-up can be enqueued without re-deriving the audience. Email matching is
 * case-insensitive because the events view lowercases addresses.
 */
export async function fetchNonOpeners(
  campaignId: string,
  campaignSubject: string,
): Promise<{ recipients: Array<{ email: string; first_name: string; unsubscribe_token: string }>; error: string | null }> {
  const PAGE = 1000;
  try {
    // Emails to EXCLUDE: opened OR bounced OR complained on the original subject.
    const exclude = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('campaign_recipient_status')
        .select('email,opened,bounced,complained')
        .eq('campaign_subject', campaignSubject)
        .range(from, from + PAGE - 1);
      if (error) return { recipients: [], error: error.message };
      for (const r of data || []) {
        if (r.opened || r.bounced || r.complained) exclude.add((r.email || '').toLowerCase());
      }
      if (!data || data.length < PAGE) break;
    }

    // Candidates: everyone the worker actually sent the original to.
    const seen = new Set<string>();
    const recipients: Array<{ email: string; first_name: string; unsubscribe_token: string }> = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('campaign_recipients')
        .select('email,first_name,unsubscribe_token')
        .eq('campaign_id', campaignId)
        .eq('status', 'sent')
        .range(from, from + PAGE - 1);
      if (error) return { recipients: [], error: error.message };
      for (const r of data || []) {
        const key = (r.email || '').toLowerCase();
        if (!key || exclude.has(key) || seen.has(key)) continue;
        seen.add(key);
        recipients.push({
          email: r.email,
          first_name: r.first_name || '',
          unsubscribe_token: r.unsubscribe_token || '',
        });
      }
      if (!data || data.length < PAGE) break;
    }

    return { recipients, error: null };
  } catch (e: any) {
    console.error('fetchNonOpeners failed:', e);
    return { recipients: [], error: e?.message || 'Failed to compute non-openers' };
  }
}

/**
 * Create a follow-up campaign that re-sends the original's email to the given
 * recipients (its non-openers), reusing the saved dispatch with a NEW subject
 * line. A distinct subject keeps the reminder's opens from merging with the
 * original in the subject-keyed reporting views. Snapshots recipients and kicks
 * the worker so it sends immediately.
 */
export async function resendToNonOpeners(
  campaignId: string,
  newSubject: string,
  recipients: Array<{ email: string; first_name?: string; unsubscribe_token?: string }>,
): Promise<{ campaign: Campaign | null; error: string | null }> {
  if (!recipients.length) return { campaign: null, error: 'No non-openers to send to.' };

  const { data: src, error: fErr } = await supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle();
  if (fErr || !src) return { campaign: null, error: fErr?.message || 'Campaign not found' };
  if (!src.dispatch) return { campaign: null, error: 'This campaign has no saved email to resend.' };

  const now = new Date().toISOString();
  const subject = newSubject.trim() || src.subject;
  const dispatch = { ...src.dispatch, subject };

  const payload = {
    name: `${src.name || 'Campaign'} — Reminder`,
    subject,
    template: src.template,
    trigger_type: 'immediate',
    campaign_type: src.campaign_type ?? 'standard',
    segments: src.segments,
    tags: src.tags,
    branches: src.branches,
    audience_size: recipients.length,
    metadata: { ...(src.metadata || {}), resend_of: campaignId, resend_kind: 'non_openers' },
    created_by: 'app',
    status: 'active',
    scheduled_at: null,
    launched_at: now,
    dispatch,
    send_status: 'queued',
    send_error: null,
    retry_count: 0,
    last_attempt_at: null,
    updated_at: now,
  };

  const { data, error } = await supabase.from('campaigns').insert(payload).select('*').single();
  if (error) {
    console.error('Error creating resend campaign:', error);
    return { campaign: null, error: error.message };
  }

  const { error: enqErr } = await enqueueCampaignRecipients(data.id, recipients);
  if (enqErr) {
    // Park the campaign so a half-populated one never fires (the worker only
    // claims 'queued' rows). Leaves a visible failure to retry from.
    await supabase
      .from('campaigns')
      .update({ send_status: 'failed', send_error: `Enqueue failed: ${enqErr}` })
      .eq('id', data.id);
    return { campaign: null, error: enqErr };
  }

  await pingCampaignSender();
  return { campaign: mapCampaignRow(data), error: null };
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
