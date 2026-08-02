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

  const { data, error } = await supabase.rpc('upsert_social_credential', {
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
  // The RPC signals a rejected write (e.g. an invalid platform) by RETURNING
  // { success: false, error } rather than raising — a PostgREST-level `error`
  // check alone would miss that and report success while nothing was saved.
  if (data && (data as any).success === false) {
    return { success: false, error: (data as any).error || 'Failed to save credential' };
  }
  return { success: true };
}

// ─── 1b. saveAppCredentials ─────────────────────────────────────────
// Persists the developer-app credentials (App ID + App Secret) for a
// branch+platform so the OAuth flow can read them via get_social_credential().
// Saved with status='pending' and NO access token — the row only becomes
// 'active' (connected) once the OAuth popup completes and stores a user token.
// The deployed upsert merges on (branch_id, platform) and preserves app creds
// on later OAuth writes, so this is safe to call before connecting.
export async function saveAppCredentials(
  branchId: string,
  platform: SocialPlatform,
  appId: string,
  appSecret: string
): Promise<ServiceResult> {
  if (!branchId || !platform) {
    return { success: false, error: 'Branch and platform are required' };
  }
  if (!appId?.trim() || !appSecret?.trim()) {
    return { success: false, error: 'App ID and App Secret are required' };
  }

  const { data, error } = await supabase.rpc('upsert_social_credential', {
    p_branch_id: branchId,
    p_platform: platform,
    p_access_token: null,        // app creds only — no user token yet
    p_app_id: appId.trim(),
    p_app_secret: appSecret.trim(),
    p_status: 'pending',
  });

  if (error) {
    return { success: false, error: error.message };
  }
  // Same gotcha as saveCredential above — a rejected platform comes back as
  // { success: false, error } inside `data`, not as a PostgREST `error`.
  if (data && (data as any).success === false) {
    return { success: false, error: (data as any).error || 'Failed to save app credentials' };
  }
  return { success: true };
}

// ─── 1c. openSocialOAuthPopup ───────────────────────────────────────
// Opens the social-oauth Edge Function in a popup for a branch+platform and
// polls until the popup closes, then invokes onDone(). Shared by the Platform
// Setup wizard and the Branch editor so the OAuth handshake lives in one place.
// A CSRF state nonce is stashed in sessionStorage and verified on return.
export function openSocialOAuthPopup(
  branchId: string,
  platform: SocialPlatform,
  supabaseUrl: string,
  onDone: () => void
): void {
  if (!branchId || !platform || !supabaseUrl) return;
  const oauthState = crypto.randomUUID();
  sessionStorage.setItem('oauth_state', oauthState);
  const oauthUrl =
    `${supabaseUrl}/functions/v1/social-oauth` +
    `?branch_id=${encodeURIComponent(branchId)}` +
    `&platform=${encodeURIComponent(platform)}` +
    `&state=${encodeURIComponent(oauthState)}`;
  const popup = window.open(oauthUrl, `connect_${platform}`, 'width=600,height=700');

  const interval = setInterval(() => {
    if (popup?.closed) {
      clearInterval(interval);
      sessionStorage.removeItem('oauth_state');
      onDone();
    }
  }, 1000);
}

// ─── 2. checkConnections ────────────────────────────────────────────
// Calls the deployed SECURITY DEFINER RPC `list_social_connections`, which
// returns a jsonb array of credential rows for the branch. A platform counts
// as connected only when its row's status is 'active'. A branch with no rows
// (e.g. a brand-new branch) returns an empty array → nothing shows connected.
export async function checkConnections(branchId: string): Promise<{
  success: boolean;
  connections: SocialConnectionStatus[];
  error?: string;
}> {
  if (!branchId) {
    return { success: false, connections: [], error: 'Branch ID is required' };
  }

  const { data, error } = await supabase.rpc('list_social_connections', {
    p_branch_id: branchId,
  });

  if (error) {
    return { success: false, connections: [], error: error.message };
  }

  // RPC returns a jsonb array (or [] when the branch has no credentials).
  const rows: any[] = Array.isArray(data) ? data : [];
  const connections: SocialConnectionStatus[] = rows.map((row: any) => ({
    platform: row.platform as SocialPlatform,
    is_connected: row.status === 'active',
    platform_username: row.platform_username || row.platform_metadata?.username || undefined,
    connected_at: row.created_at || undefined,
    has_app_secret: row.has_app_secret === true,
  }));

  return { success: true, connections };
}

// ─── 2b. testConnection ─────────────────────────────────────────────
// Calls the test-social-connection Edge Function, which makes one minimal
// authenticated API call using the branch's stored token. Returns whether the
// live connection actually works (not just whether a row exists).
export async function testConnection(
  branchId: string,
  platform: SocialPlatform
): Promise<{ ok: boolean; username?: string; error?: string }> {
  if (!branchId || !platform) {
    return { ok: false, error: 'Branch and platform are required' };
  }
  const { data, error } = await supabase.functions.invoke('test-social-connection', {
    body: { branch_id: branchId, platform },
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return {
    ok: !!data?.ok,
    username: data?.username,
    error: data?.error,
  };
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

  const { error } = await supabase.rpc('revoke_social_credential', {
    p_branch_id: branchId,
    p_platform: platform,
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ─── 4. publishToSocial ────────────────────────────────────────────
// Publishes an Instagram image, Reel, or carousel (media + caption) for a branch via the
// n8n webhook. n8n looks up the branch's credential, creates a media container,
// then publishes — so this call is SLOW and synchronous; we await the result.
//
// Payload contract (matches the deployed trellis-social-publish webhook):
//   { branch_id, caption, image_url, media_type, media_urls, scheduled_for }
// - branch_id MUST be the branch UUID, never a domain slug.
// - image_url remains the primary-media compatibility field; media_type/media_urls
//   support the Reel and carousel paths in the publisher workflow.
// - scheduled_for is null for immediate publish.
export interface PublishOutcome {
  ok: boolean;
  postId?: string;
  error?: string;
}

export interface SocialMediaPayload {
  media_type: 'image' | 'video' | 'carousel';
  media_urls: string[];
}

export async function publishToSocial(
  branchId: string,
  caption: string,
  imageUrl: string,
  scheduledFor: string | null = null,
  webhookUrl?: string,
  media?: SocialMediaPayload
): Promise<PublishOutcome> {
  if (!branchId) return { ok: false, error: 'Branch ID is required' };
  if (!caption) return { ok: false, error: 'Caption is required' };
  if (!imageUrl) return { ok: false, error: 'Media is required to publish to Instagram' };

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
        // The live webhook continues to receive image_url for a standard post.
        // Updated publisher workflows can use these fields for Reels and carousels.
        media_type: media?.media_type || 'image',
        media_urls: media?.media_urls || [imageUrl],
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

// ─── 4c. publishToTikTok ────────────────────────────────────────────
// Publishes a TikTok video, single photo, or photo carousel (caption + media)
// for a branch via the TikTok n8n webhook. Unlike Instagram/Facebook, TikTok
// has NO text-only post — media is always required. Publishing on TikTok's
// side is asynchronous (the workflow polls a publish_id until terminal), so
// this call can take up to ~2 minutes; the caller must show an in-progress
// state rather than assuming a fast round trip.
//
// Until the app clears TikTok's audit, every post is forced to SELF_ONLY
// (private) visibility on TikTok's side — that is an external constraint
// this function cannot change; callers must surface it in the UI.
//
// Payload contract (matches the deployed trellis-tiktok-publish webhook):
//   { branch_id, caption, media_type, media_urls, scheduled_for }
// - branch_id MUST be the branch UUID.
// - media_urls is never empty — TikTok requires at least one media item.
export async function publishToTikTok(
  branchId: string,
  caption: string,
  mediaUrls: string[],
  mediaType: 'video' | 'image' | 'carousel',
  scheduledFor: string | null = null,
  webhookUrl?: string
): Promise<PublishOutcome> {
  if (!branchId) return { ok: false, error: 'Branch ID is required' };
  if (!caption) return { ok: false, error: 'Caption is required' };
  if (!mediaUrls || mediaUrls.length === 0) {
    return { ok: false, error: 'Media is required to publish to TikTok — there is no text-only TikTok post' };
  }
  if (mediaType === 'video' && mediaUrls.length !== 1) {
    return { ok: false, error: 'A TikTok video post needs exactly one video URL' };
  }
  if (mediaType === 'carousel' && (mediaUrls.length < 2 || mediaUrls.length > 35)) {
    return { ok: false, error: 'A TikTok photo carousel needs between 2 and 35 images' };
  }

  const url = webhookUrl || WEBHOOK_SPECS.tiktok_publish;
  if (!url) {
    return { ok: false, error: 'TikTok publish webhook URL not configured' };
  }

  return postToPublishWebhook(url, {
    branch_id: branchId,
    caption,
    media_type: mediaType,
    media_urls: mediaUrls,
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
      profile_id: signal.matched_profile_id,
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
    matched_profile_id: row.profile_id,
    profile_matched: !!row.profile_id,
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
