import { supabase } from '../lib/supabase';
import { SocialPlatform, SocialConnectionStatus, SocialActivity, SignalStatus } from '../types';
import { WEBHOOK_SPECS } from '../constants';

// ─── Result Types ───────────────────────────────────────────────────
interface ServiceResult {
  success: boolean;
  error?: string;
}

interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  platform_user_id?: string;
  platform_username?: string;
  scopes?: string[];
  expires_at?: string;
}

// ─── 1. saveCredential ──────────────────────────────────────────────
// Called from Supabase Edge Function (OAuth callback) via service role.
// Also callable from frontend via SECURITY DEFINER RPC.
export async function saveCredential(
  branchId: string,
  platform: SocialPlatform,
  tokens: OAuthTokens
): Promise<ServiceResult> {
  if (!branchId || !platform || !tokens.access_token) {
    return { success: false, error: 'Missing required fields' };
  }

  const { error } = await supabase.rpc('upsert_social_credential', {
    p_branch_id: branchId,
    p_platform: platform,
    p_access_token: tokens.access_token,
    p_refresh_token: tokens.refresh_token || null,
    p_platform_user_id: tokens.platform_user_id || null,
    p_platform_username: tokens.platform_username || null,
    p_scopes: tokens.scopes || [],
    p_expires_at: tokens.expires_at || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ─── 2. checkConnections ────────────────────────────────────────────
// Calls SECURITY DEFINER RPC — returns non-sensitive connection data.
export async function checkConnections(branchId: string): Promise<{
  success: boolean;
  connections: SocialConnectionStatus[];
  error?: string;
}> {
  if (!branchId) {
    return { success: false, connections: [], error: 'Branch ID is required' };
  }

  const { data, error } = await supabase.rpc('check_social_connections', {
    p_branch_id: branchId,
  });

  if (error) {
    return { success: false, connections: [], error: error.message };
  }

  const connections: SocialConnectionStatus[] = (data || []).map((row: any) => ({
    platform: row.platform as SocialPlatform,
    is_connected: row.is_connected,
    platform_username: row.platform_username || undefined,
    connected_at: row.connected_at || undefined,
  }));

  return { success: true, connections };
}

// ─── 3. disconnectPlatform ──────────────────────────────────────────
// Calls SECURITY DEFINER RPC — deletes credential row.
export async function disconnectPlatform(
  branchId: string,
  platform: SocialPlatform
): Promise<ServiceResult> {
  if (!branchId || !platform) {
    return { success: false, error: 'Branch ID and platform are required' };
  }

  const { error } = await supabase.rpc('disconnect_social_platform', {
    p_branch_id: branchId,
    p_platform: platform,
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ─── 4. publishToSocial ────────────────────────────────────────────
// Publishes a single Instagram post (image + caption) for a branch via the
// n8n webhook. n8n looks up the branch's credential, creates a media container,
// then publishes — so this call is SLOW and synchronous; we await the result.
//
// Payload contract (matches the deployed trellis-social-publish webhook):
//   { branch_id, caption, image_url, scheduled_for }
// - branch_id MUST be the branch UUID, never a domain slug.
// - image_url is REQUIRED (Instagram cannot publish a caption-only post).
// - scheduled_for is null for immediate publish.
export interface PublishOutcome {
  ok: boolean;
  postId?: string;
  error?: string;
}

export async function publishToSocial(
  branchId: string,
  caption: string,
  imageUrl: string,
  scheduledFor: string | null = null,
  webhookUrl?: string
): Promise<PublishOutcome> {
  if (!branchId) return { ok: false, error: 'Branch ID is required' };
  if (!caption) return { ok: false, error: 'Caption is required' };
  if (!imageUrl) return { ok: false, error: 'An image is required to publish to Instagram' };

  const url = webhookUrl || WEBHOOK_SPECS.social_publish;
  if (!url) {
    return { ok: false, error: 'Social publish webhook URL not configured' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branchId,
        caption,
        image_url: imageUrl,
        scheduled_for: scheduledFor,
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `Webhook returned ${response.status}` };
    }

    const data = await response.json();

    if (data?.success === true) {
      return { ok: true, postId: data.post_id };
    }
    return { ok: false, error: data?.error || 'Publish failed' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to publish' };
  }
}

// ─── 4b. publishToFacebook ─────────────────────────────────────────
// Publishes a Facebook post (caption + optional image) for a branch via the
// Facebook n8n webhook. Same slow/synchronous response handling as Instagram,
// but the image is OPTIONAL — Facebook allows text-only posts.
//
// Payload contract (matches the deployed trellis-facebook-publish webhook):
//   { branch_id, caption, image_url, scheduled_for }
// - branch_id MUST be the branch UUID.
// - image_url is null when the draft has no image (text-only post).
export async function publishToFacebook(
  branchId: string,
  caption: string,
  imageUrl: string | null = null,
  scheduledFor: string | null = null,
  webhookUrl?: string
): Promise<PublishOutcome> {
  if (!branchId) return { ok: false, error: 'Branch ID is required' };
  if (!caption) return { ok: false, error: 'Caption is required' };

  const url = webhookUrl || WEBHOOK_SPECS.facebook_publish;
  if (!url) {
    return { ok: false, error: 'Facebook publish webhook URL not configured' };
  }

  return postToPublishWebhook(url, {
    branch_id: branchId,
    caption,
    image_url: imageUrl,      // optional — null = text-only Facebook post
    scheduled_for: scheduledFor,
  });
}

// Shared POST + response parsing for the publish webhooks. Awaits the slow,
// synchronous webhook and maps the result to a PublishOutcome.
async function postToPublishWebhook(
  url: string,
  body: Record<string, unknown>
): Promise<PublishOutcome> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) return { ok: false, error: `Webhook returned ${response.status}` };

    const data = await response.json();
    if (data?.success === true) return { ok: true, postId: data.post_id };
    return { ok: false, error: data?.error || 'Publish failed' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to publish' };
  }
}

// ─── social_signals table gate ──────────────────────────────────────
// Checked once per page load via a HEAD probe in fetchSocialSignals().
// If the table doesn't exist, all social_signals functions no-op.
let _tableCheckDone = false;
let _tableExists = false;

// ─── 5. ingestSocialSignal ──────────────────────────────────────────
// Called by n8n webhook (or directly for testing). Writes to social_signals.
export async function ingestSocialSignal(
  signal: Omit<SocialActivity, 'id' | 'profile_matched' | 'status'>
): Promise<string | null> {
  if (_tableCheckDone && !_tableExists) return null;
  const { data, error } = await supabase
    .from('social_signals')
    .insert({
      platform: signal.platform,
      username: signal.username,
      content: signal.content,
      intent_type: signal.intent_type,
      confidence: signal.confidence,
      branch_id: signal.branch_id,
      matched_profile_id: signal.matched_profile_id,
      source_post_id: signal.source_post_id,
      source_post_url: signal.source_post_url,
      status: 'new',
    })
    .select('id')
    .single();

  if (error) { return null; }
  return data.id;
}

// ─── 6. fetchSocialSignals ──────────────────────────────────────────
// Fetches signals for the Queue tab.
// NOTE: social_signals table must be created in Supabase before enabling.
// See SQL_SCHEMA in constants.ts for the CREATE TABLE statement.
interface SignalFilters {
  status?: SignalStatus | SignalStatus[];
  platform?: SocialPlatform;
  branch_id?: string;
  limit?: number;
}

export async function fetchSocialSignals(filters?: SignalFilters): Promise<SocialActivity[]> {
  if (!_tableCheckDone) {
    _tableCheckDone = true;
    const { error } = await supabase
      .from('social_signals')
      .select('id', { count: 'exact', head: true })
      .limit(0);
    _tableExists = !error;
  }
  if (!_tableExists) return [];

  let query = supabase
    .from('social_signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit || 50);

  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    query = query.in('status', statuses);
  }
  if (filters?.platform) query = query.eq('platform', filters.platform);
  if (filters?.branch_id) query = query.eq('branch_id', filters.branch_id);

  const { data, error } = await query;
  if (error) { return []; }

  return (data || []).map((row: any) => ({
    id: row.id,
    platform: row.platform,
    username: row.username,
    content: row.content,
    intent_type: row.intent_type,
    confidence: row.confidence,
    branch_id: row.branch_id,
    matched_profile_id: row.matched_profile_id,
    profile_matched: !!row.matched_profile_id,
    source_post_id: row.source_post_id,
    source_post_url: row.source_post_url,
    status: row.status,
    created_at: row.created_at,
    actioned_at: row.actioned_at,
  }));
}

// ─── 7. updateSignalStatus ──────────────────────────────────────────
// Used by Queue actions (dismiss, mark reviewed, etc.).
export async function updateSignalStatus(
  signalId: string,
  status: SignalStatus
): Promise<boolean> {
  if (_tableCheckDone && !_tableExists) return false;
  const { error } = await supabase
    .from('social_signals')
    .update({
      status,
      actioned_at: status === 'actioned' || status === 'dismissed' ? new Date().toISOString() : null,
    })
    .eq('id', signalId);

  return !error;
}

// ─── 8. linkProfileToSocial ────────────────────────────────────────
// Links a social handle to an Identity Hub profile via metadata update.
export async function linkProfileToSocial(
  profileId: string,
  platform: SocialPlatform,
  username: string
): Promise<boolean> {
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('metadata')
    .eq('id', profileId)
    .single();

  if (fetchError || !profile) return false;

  const currentMetadata = (profile as any).metadata || {};
  const socialHandles = currentMetadata.social_handles || {};
  socialHandles[platform] = username;

  const { error } = await supabase
    .from('profiles')
    .update({ metadata: { ...currentMetadata, social_handles: socialHandles } })
    .eq('id', profileId);

  return !error;
}
