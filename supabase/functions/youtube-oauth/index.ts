// Trellis account-scoped YouTube OAuth.
//
// The callback verifies channels.list(mine=true) against the immutable channel
// ID stored in branch_social_accounts before any token is persisted. This is the
// guard that prevents one Rekkrd Brand Account from being attached to another.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/youtube-oauth/callback`;
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];
const MAX_STATE_AGE_MS = 15 * 60 * 1000;

const db = createClient(SUPABASE_URL, SERVICE_KEY);

type StatePayload = {
  branch_id: string;
  branch_social_account_id: string;
  platform: "youtube";
  nonce: string;
  ts: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function stringToBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToString(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

async function signState(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifyState(payload: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const raw = signature.replaceAll("-", "+").replaceAll("_", "/");
  const padded = raw + "===".slice((raw.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(payload));
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlPage(title: string, message: string, ok = false, accountId?: string): Response {
  const color = ok ? "#166534" : "#991b1b";
  const border = ok ? "#bbf7d0" : "#fecaca";
  const background = ok ? "#f0fdf4" : "#f8fafc";
  const script = ok
    ? `<script>
        if (window.opener) window.opener.postMessage({
          type: 'TRELLIS_OAUTH_SUCCESS', platform: 'youtube',
          branch_social_account_id: '${escapeHtml(accountId)}'
        }, '*');
        setTimeout(() => window.close(), 2500);
      </script>`
    : "";

  return new Response(`<!doctype html>
    <html><head><meta charset="utf-8"><title>Trellis — ${escapeHtml(title)}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:${background}}
      .card{background:#fff;border:2px solid ${border};border-radius:24px;padding:44px;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.06)}
      h1{font-size:18px;color:${color};margin:0 0 12px;font-weight:900;text-transform:uppercase;letter-spacing:1px}
      p{font-size:14px;color:#64748b;line-height:1.6;margin:0 0 24px}button{background:#0f172a;color:#fff;border:0;padding:13px 28px;border-radius:12px;font-weight:800;cursor:pointer}
    </style>${script}</head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><button onclick="window.close()">Close Window</button></div></body></html>`, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function getCredential(branchId: string, accountId: string) {
  const { data, error } = await db.rpc("get_social_account_credential", {
    p_branch_id: branchId,
    p_platform: "youtube",
    p_branch_social_account_id: accountId,
  });
  if (error || !data?.success) throw new Error(data?.error || error?.message || "YouTube credentials not found");
  return data;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const isCallback = url.pathname.endsWith("/callback");

  try {
    if (!isCallback) {
      const branchId = url.searchParams.get("branch_id");
      const accountId = url.searchParams.get("account_id");
      const nonce = url.searchParams.get("state") || crypto.randomUUID();
      if (!branchId || !accountId) {
        return htmlPage("Missing Parameters", "Both branch_id and account_id are required.");
      }

      const credential = await getCredential(branchId, accountId);
      if (!credential.app_id || !credential.app_secret) {
        return htmlPage("Missing OAuth Credentials", "Save the Google OAuth Client ID and Client Secret for this YouTube channel first.");
      }

      const statePayload: StatePayload = {
        branch_id: branchId,
        branch_social_account_id: accountId,
        platform: "youtube",
        nonce,
        ts: Date.now(),
      };
      const encodedPayload = stringToBase64Url(JSON.stringify(statePayload));
      const signature = await signState(encodedPayload, credential.app_secret);
      const state = `${encodedPayload}.${signature}`;

      const params = new URLSearchParams({
        client_id: credential.app_id,
        redirect_uri: CALLBACK_URL,
        response_type: "code",
        scope: YOUTUBE_SCOPES.join(" "),
        state,
        access_type: "offline",
        include_granted_scopes: "true",
        prompt: "consent",
      });
      return new Response(null, { status: 302, headers: { Location: `${AUTHORIZE_URL}?${params}` } });
    }

    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      return htmlPage("Authorization Cancelled", url.searchParams.get("error_description") || oauthError);
    }

    const code = url.searchParams.get("code");
    const rawState = url.searchParams.get("state");
    if (!code || !rawState) return htmlPage("Missing Callback Data", "Google did not return an authorization code and signed state.");

    const [encodedPayload, signature] = rawState.split(".");
    if (!encodedPayload || !signature) return htmlPage("Invalid State", "The OAuth state is malformed. Start the connection again from Trellis.");

    let state: StatePayload;
    try {
      state = JSON.parse(base64UrlToString(encodedPayload));
    } catch {
      return htmlPage("Invalid State", "The OAuth state could not be decoded. Start the connection again from Trellis.");
    }

    if (state.platform !== "youtube" || !state.branch_id || !state.branch_social_account_id) {
      return htmlPage("Invalid State", "The OAuth state does not identify a valid YouTube account.");
    }
    if (!Number.isFinite(state.ts) || Date.now() - state.ts > MAX_STATE_AGE_MS || state.ts > Date.now() + 60_000) {
      return htmlPage("Expired Session", "This YouTube authorization session expired. Start it again from Trellis.");
    }

    const credential = await getCredential(state.branch_id, state.branch_social_account_id);
    if (!await verifyState(encodedPayload, signature, credential.app_secret)) {
      return htmlPage("Invalid State", "The OAuth state signature is invalid. Start the connection again from Trellis.");
    }

    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credential.app_id,
        client_secret: credential.app_secret,
        code,
        redirect_uri: CALLBACK_URL,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("YouTube token exchange failed", tokenResponse.status, tokenData?.error);
      return htmlPage("Token Exchange Failed", tokenData?.error_description || "Google rejected the authorization code. Start the connection again.");
    }

    const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const channelData = await channelResponse.json().catch(() => ({}));
    const channel = channelData?.items?.[0];
    if (!channelResponse.ok || !channel?.id) {
      console.error("YouTube channel lookup failed", channelResponse.status, channelData?.error);
      return htmlPage("No YouTube Channel", "Google authorized the account, but no manageable YouTube channel was returned. Choose the intended Brand Account and try again.");
    }

    if (channel.id !== credential.expected_external_account_id) {
      return htmlPage(
        "Wrong YouTube Channel",
        `You selected ${channel.snippet?.title || channel.id} (${channel.id}), but Trellis expected ${credential.expected_handle} (${credential.expected_external_account_id}). Reconnect and choose the correct Brand Account.`,
      );
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
      : null;
    const metadata = {
      channel_id: channel.id,
      channel_title: channel.snippet?.title || null,
      custom_url: channel.snippet?.customUrl || null,
      thumbnail_url: channel.snippet?.thumbnails?.default?.url || null,
      connected_at: new Date().toISOString(),
    };

    const { data: stored, error: storeError } = await db.rpc("upsert_social_account_credential", {
      p_branch_id: state.branch_id,
      p_platform: "youtube",
      p_branch_social_account_id: state.branch_social_account_id,
      p_access_token: tokenData.access_token,
      p_refresh_token: tokenData.refresh_token || null,
      p_token_expires_at: expiresAt,
      p_platform_user_id: channel.id,
      p_platform_username: channel.snippet?.customUrl || channel.snippet?.title || channel.id,
      p_platform_metadata: metadata,
      p_granted_scopes: YOUTUBE_SCOPES,
      p_status: "active",
    });
    if (storeError || !stored?.success) {
      console.error("YouTube token storage failed", storeError, stored);
      return htmlPage("Storage Error", stored?.error || storeError?.message || "The verified channel token could not be stored.");
    }

    return htmlPage("YouTube Connected", `${channel.snippet?.title || credential.expected_handle} is now connected to Trellis.`, true, state.branch_social_account_id);
  } catch (error) {
    console.error("youtube-oauth error", error);
    return htmlPage("Connection Error", error instanceof Error ? error.message : "An unexpected error occurred.");
  }
});
