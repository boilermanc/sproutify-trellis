// Service-role-only token broker for account-aware YouTube publishing.
// n8n supplies the immutable branch_social_accounts id and receives a short-
// lived access token. Refresh tokens and Google app secrets never leave Trellis.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true";
const REFRESH_WINDOW_MS = 5 * 60 * 1000;
const db = createClient(SUPABASE_URL, SERVICE_KEY);

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function isServiceRoleRequest(req: Request): boolean {
  const authorization = req.headers.get("authorization") || "";
  return authorization === `Bearer ${SERVICE_KEY}`;
}

async function verifyChannel(accessToken: string, expectedChannelId: string): Promise<void> {
  const response = await fetch(CHANNELS_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`YouTube channel verification failed (${response.status})`);
  const channelId = payload?.items?.[0]?.id;
  if (!channelId || channelId !== expectedChannelId) throw new Error("The refreshed token does not belong to the selected YouTube channel");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isServiceRoleRequest(req)) return json({ error: "Service role required" }, 403);

  try {
    const body = await req.json();
    const accountId = String(body?.youtube_account_id || "").trim();
    if (!accountId) return json({ error: "youtube_account_id is required" }, 400);

    const { data: account, error: accountError } = await db
      .from("branch_social_accounts")
      .select("id,branch_id,external_account_id,handle,platform,status")
      .eq("id", accountId)
      .maybeSingle();
    if (accountError || !account || account.platform !== "youtube" || account.status !== "active") {
      return json({ error: "The selected YouTube account is not active" }, 400);
    }

    const { data: credential, error: credentialError } = await db.rpc("get_social_account_credential", {
      p_branch_id: account.branch_id,
      p_platform: "youtube",
      p_branch_social_account_id: account.id,
    });
    if (credentialError || !credential?.success || credential.status !== "active") {
      return json({ error: credential?.error || credentialError?.message || "YouTube credentials are unavailable" }, 400);
    }

    let accessToken = String(credential.access_token || "");
    let expiresAt = credential.token_expires_at ? new Date(credential.token_expires_at).getTime() : 0;
    if (!accessToken || expiresAt <= Date.now() + REFRESH_WINDOW_MS) {
      if (!credential.refresh_token || !credential.app_id || !credential.app_secret) {
        return json({ error: "Reconnect this YouTube account to restore its refresh credentials" }, 400);
      }
      const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: credential.app_id,
          client_secret: credential.app_secret,
          refresh_token: credential.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const refreshed = await response.json().catch(() => ({}));
      if (!response.ok || !refreshed.access_token) throw new Error(`Google token refresh failed (${response.status})`);
      accessToken = refreshed.access_token;
      expiresAt = Date.now() + Number(refreshed.expires_in || 3600) * 1000;
      await verifyChannel(accessToken, account.external_account_id);

      const { data: saved, error: saveError } = await db.rpc("upsert_social_account_credential", {
        p_branch_id: account.branch_id,
        p_platform: "youtube",
        p_branch_social_account_id: account.id,
        p_access_token: accessToken,
        p_refresh_token: credential.refresh_token,
        p_token_expires_at: new Date(expiresAt).toISOString(),
        p_status: "active",
      });
      if (saveError || !saved?.success) throw new Error(saved?.error || saveError?.message || "Could not persist refreshed YouTube token");
    }

    return json({
      access_token: accessToken,
      expires_at: new Date(expiresAt).toISOString(),
      youtube_account_id: account.id,
      channel_id: account.external_account_id,
      handle: account.handle,
    });
  } catch (error) {
    console.error("youtube-publish-token failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: error instanceof Error ? error.message : "Could not resolve YouTube publishing token" }, 400);
  }
});
