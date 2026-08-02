// ═══════════════════════════════════════════════════════════════
// TRELLIS SOCIAL OAUTH EDGE FUNCTION
// supabase/functions/social-oauth/index.ts
// ═══════════════════════════════════════════════════════════════
//
// Handles the full OAuth dance for Instagram/Meta, X, LinkedIn, Facebook.
//
// TWO ROUTES:
//   GET /social-oauth          → Redirects user to platform consent screen
//   GET /social-oauth/callback → Handles callback, exchanges code for tokens
//
// FLOW:
//   1. Wizard saves app credentials → social_credentials table (status: 'pending')
//   2. User clicks "Connect" → hits this function with ?branch_id=...&platform=...
//   3. Function reads app_id from DB → builds OAuth URL → redirects user
//   4. User authorizes → platform redirects back to /callback?code=...&state=...
//   5. Function exchanges code for tokens → upserts tokens → closes popup
//
// DEPLOY:
//   supabase functions deploy social-oauth --no-verify-jwt
//
// SECRETS (set via Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL            (auto-set by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
//   TRELLIS_APP_URL         (e.g. https://trellis.sproutify.app)
// The encryption key is NOT read here — the SQL functions own it via
// get_encryption_key(), so there is one source of truth and no way for this
// function to disagree with what the columns were encrypted with.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Environment ────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("TRELLIS_APP_URL") || "https://trellis.sproutify.app";

// Service role client — bypasses RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// The callback URL that platforms redirect to after authorization
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/social-oauth/callback`;

// ─── Platform OAuth Configs ─────────────────────────────────

interface PlatformOAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  buildAuthUrl: (appId: string, state: string, scopes: string[]) => string;
  buildTokenBody: (appId: string, appSecret: string, code: string) => URLSearchParams;
  defaultScopes: string[];
  extractTokens: (data: any) => {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

const PLATFORM_CONFIGS: Record<string, PlatformOAuthConfig> = {
  // ── Instagram / Meta ────────────────────────────────────
  instagram: {
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    defaultScopes: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_comments",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
    ],
    buildAuthUrl(appId, state, scopes) {
      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: CALLBACK_URL,
        state,
        scope: scopes.join(","),
        response_type: "code",
      });
      return `${this.authorizeUrl}?${params.toString()}`;
    },
    buildTokenBody(appId, appSecret, code) {
      return new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: CALLBACK_URL,
        code,
        grant_type: "authorization_code",
      });
    },
    extractTokens(data) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || undefined,
        expires_in: data.expires_in,
      };
    },
  },

  // ── Facebook (same Meta app, different scopes) ──────────
  facebook: {
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    defaultScopes: [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_read_user_content",
      "read_insights",
    ],
    buildAuthUrl(appId, state, scopes) {
      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: CALLBACK_URL,
        state,
        scope: scopes.join(","),
        response_type: "code",
      });
      return `${this.authorizeUrl}?${params.toString()}`;
    },
    buildTokenBody(appId, appSecret, code) {
      return new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: CALLBACK_URL,
        code,
        grant_type: "authorization_code",
      });
    },
    extractTokens(data) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || undefined,
        expires_in: data.expires_in,
      };
    },
  },

  // ── X (Twitter) — OAuth 2.0 with PKCE ──────────────────
  x: {
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    defaultScopes: [
      "tweet.read",
      "tweet.write",
      "users.read",
      "offline.access",
    ],
    buildAuthUrl(appId, state, scopes) {
      // X OAuth 2.0 requires PKCE — we use a simple S256 challenge
      // The code_verifier is embedded in the state for retrieval at callback
      const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
      const stateWithVerifier = JSON.stringify({
        original: state,
        cv: codeVerifier,
      });
      const encodedState = btoa(stateWithVerifier);

      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: CALLBACK_URL,
        state: encodedState,
        scope: scopes.join(" "),
        response_type: "code",
        code_challenge_method: "plain",
        code_challenge: codeVerifier, // Using plain method for simplicity
      });
      return `${this.authorizeUrl}?${params.toString()}`;
    },
    buildTokenBody(appId, appSecret, code) {
      // Note: code_verifier will be injected by the callback handler
      return new URLSearchParams({
        client_id: appId,
        redirect_uri: CALLBACK_URL,
        code,
        grant_type: "authorization_code",
        code_verifier: "__PLACEHOLDER__", // Replaced at call time
      });
    },
    extractTokens(data) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || undefined,
        expires_in: data.expires_in,
      };
    },
  },

  // ── TikTok — OAuth 2.0 (Login Kit) ──────────────────────
  tiktok: {
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    defaultScopes: [
      "user.info.basic",
      "video.publish",
      "video.upload",
    ],
    buildAuthUrl(appId, state, scopes) {
      // TikTok uses client_key, not client_id — the single most common integration bug.
      const params = new URLSearchParams({
        client_key: appId,
        redirect_uri: CALLBACK_URL,
        state,
        scope: scopes.join(","),
        response_type: "code",
      });
      return `${this.authorizeUrl}?${params.toString()}`;
    },
    buildTokenBody(appId, appSecret, code) {
      return new URLSearchParams({
        client_key: appId,
        client_secret: appSecret,
        redirect_uri: CALLBACK_URL,
        code,
        grant_type: "authorization_code",
      });
    },
    extractTokens(data) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || undefined,
        expires_in: data.expires_in,
      };
    },
  },

  // ── LinkedIn — OAuth 2.0 ────────────────────────────────
  linkedin: {
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    defaultScopes: [
      "openid",
      "profile",
      "email",
      "w_member_social",
    ],
    buildAuthUrl(appId, state, scopes) {
      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: CALLBACK_URL,
        state,
        scope: scopes.join(" "),
        response_type: "code",
      });
      return `${this.authorizeUrl}?${params.toString()}`;
    },
    buildTokenBody(appId, appSecret, code) {
      return new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: CALLBACK_URL,
        code,
        grant_type: "authorization_code",
      });
    },
    extractTokens(data) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || undefined,
        expires_in: data.expires_in,
      };
    },
  },
};

// ─── HTML Response Helpers ──────────────────────────────────

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function errorPage(title: string, message: string, status = 400): Response {
  return htmlResponse(
    `<!DOCTYPE html>
<html>
<head><title>Trellis — ${title}</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
  .card { background: white; border: 2px solid #fecaca; border-radius: 24px; padding: 48px; max-width: 440px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
  h1 { font-size: 18px; color: #991b1b; margin: 0 0 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
  p { font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 24px; }
  button { background: #0f172a; color: white; border: none; padding: 14px 32px; border-radius: 12px; font-weight: 800; font-size: 12px; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; }
  button:hover { background: #059669; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`,
    status
  );
}

function successPage(platform: string, branchId: string): Response {
  return htmlResponse(
    `<!DOCTYPE html>
<html>
<head><title>Trellis — Connected!</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f0fdf4; }
  .card { background: white; border: 2px solid #bbf7d0; border-radius: 24px; padding: 48px; max-width: 440px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
  .check { width: 64px; height: 64px; background: #dcfce7; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
  .check svg { width: 32px; height: 32px; color: #16a34a; }
  h1 { font-size: 18px; color: #14532d; margin: 0 0 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
  p { font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 24px; }
  .platform { display: inline-block; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 4px 12px; border-radius: 8px; font-weight: 800; font-size: 11px; color: #16a34a; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
</style>
<script>
  // Notify the parent window (Trellis app) that OAuth succeeded
  if (window.opener) {
    window.opener.postMessage({
      type: 'TRELLIS_OAUTH_SUCCESS',
      platform: '${platform}',
      branch_id: '${branchId}'
    }, '*');
  }
  // Auto-close after 3 seconds
  setTimeout(() => window.close(), 3000);
</script>
</head>
<body>
  <div class="card">
    <div class="check">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <div class="platform">${platform}</div>
    <h1>Connected Successfully</h1>
    <p>OAuth tokens have been securely stored in your Trellis vault. This window will close automatically.</p>
  </div>
</body>
</html>`
  );
}

// ─── Main Handler ───────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    // ═══════════════════════════════════════════════════════
    // ROUTE 1: INITIATE OAUTH → /social-oauth
    // Opens the platform's consent screen
    // ═══════════════════════════════════════════════════════
    if (path.endsWith("/social-oauth") && !path.includes("/callback")) {
      const branchId = url.searchParams.get("branch_id");
      const platform = url.searchParams.get("platform");
      const stateParam = url.searchParams.get("state") || crypto.randomUUID();

      // Validate required params
      if (!branchId || !platform) {
        return errorPage(
          "Missing Parameters",
          "Both branch_id and platform are required. This link may be malformed."
        );
      }

      // Validate platform
      if (!PLATFORM_CONFIGS[platform]) {
        return errorPage(
          "Invalid Platform",
          `"${platform}" is not a supported platform. Use: instagram, facebook, x, linkedin, or tiktok.`
        );
      }

      // Read stored credentials from database. No p_encryption_key — the
      // function defaults it to get_encryption_key(), the same key the column
      // was encrypted with. (This route only reads app_id, which is stored
      // plaintext, so it worked even with the wrong key before — but passing
      // the wrong key was the bug that broke the callback route below.)
      const { data: credResult, error: credError } = await supabase.rpc(
        "get_social_credential",
        {
          p_branch_id: branchId,
          p_platform: platform,
        }
      );

      if (credError || !credResult?.success) {
        return errorPage(
          "No Credentials Found",
          `No ${platform} app credentials found for this branch. Complete the Platform Setup Wizard first to save your App ID and App Secret.`
        );
      }

      const appId = credResult.app_id;
      if (!appId) {
        return errorPage(
          "Missing App ID",
          `The ${platform} credentials exist but the App ID is empty. Re-run the Platform Setup Wizard.`
        );
      }

      // Build the state payload (encodes branch_id and platform for the callback)
      const statePayload = JSON.stringify({
        branch_id: branchId,
        platform,
        nonce: stateParam,
        ts: Date.now(),
      });
      const encodedState = btoa(statePayload);

      // Build platform-specific OAuth URL
      const config = PLATFORM_CONFIGS[platform];
      const authUrl = config.buildAuthUrl(appId, encodedState, config.defaultScopes);

      // Redirect user to the platform's consent screen
      return new Response(null, {
        status: 302,
        headers: { Location: authUrl },
      });
    }

    // ═══════════════════════════════════════════════════════
    // ROUTE 2: OAUTH CALLBACK → /social-oauth/callback
    // Receives the authorization code, exchanges for tokens
    // ═══════════════════════════════════════════════════════
    if (path.includes("/callback")) {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      // Meta returns error_code/error_message (non-standard); OAuth2 spec uses
      // error/error_description. Read both so the real reason is never masked.
      const error = url.searchParams.get("error") || url.searchParams.get("error_code");
      const errorDesc = url.searchParams.get("error_description") || url.searchParams.get("error_message");

      // Platform denied, cancelled, or (Meta) redirect/domain misconfiguration
      if (error) {
        return errorPage(
          "Authorization Error",
          errorDesc
            ? `${errorDesc} (code ${error})`
            : `The platform returned an error: ${error}. The user may have cancelled, or the app's OAuth settings are incomplete.`
        );
      }

      if (!code || !stateParam) {
        return errorPage(
          "Missing Callback Data",
          "The callback is missing the authorization code or state parameter. Try connecting again."
        );
      }

      // Decode state to get branch_id and platform
      let state: { branch_id: string; platform: string; nonce: string };
      try {
        // Handle X's double-encoded state (it has the PKCE verifier nested)
        let decoded = atob(stateParam);

        // Check if this is X's state with PKCE verifier
        try {
          const xState = JSON.parse(decoded);
          if (xState.original) {
            // This is X's wrapped state — unwrap it
            decoded = atob(xState.original);
          }
        } catch {
          // Not X's wrapped format, proceed normally
        }

        state = JSON.parse(decoded);
      } catch {
        return errorPage(
          "Invalid State",
          "Could not decode the state parameter. The OAuth session may have expired. Try connecting again."
        );
      }

      const { branch_id: branchId, platform } = state;

      if (!branchId || !platform || !PLATFORM_CONFIGS[platform]) {
        return errorPage(
          "Invalid State Data",
          "The state parameter contains invalid branch or platform data."
        );
      }

      // Read stored credentials (need app_secret for token exchange).
      // Do NOT pass p_encryption_key. The column was encrypted with the key from
      // get_encryption_key() (that is what upsert_social_credential uses), and
      // the function defaults p_encryption_key to exactly that. Passing the
      // Edge Function's own ENCRYPTION_KEY env value overrode that default with
      // a DIFFERENT key ("trellis-vault-key-change-me" when the env var is
      // unset), so pgp_sym_decrypt failed, app_secret came back null, and the
      // callback reported "Incomplete Credentials" for a secret that was
      // present and valid. n8n calls this RPC with no key and works for exactly
      // this reason — the DB is the single source of truth for the key.
      const { data: credResult, error: credError } = await supabase.rpc(
        "get_social_credential",
        {
          p_branch_id: branchId,
          p_platform: platform,
        }
      );

      if (credError || !credResult?.success) {
        return errorPage(
          "Credential Lookup Failed",
          "Could not retrieve app credentials from the vault. The credentials may have been deleted."
        );
      }

      const appId = credResult.app_id;
      const appSecret = credResult.app_secret;

      if (!appId || !appSecret) {
        return errorPage(
          "Incomplete Credentials",
          "App ID or App Secret is missing from the vault. Re-run the Platform Setup Wizard."
        );
      }

      // Build token exchange request
      const config = PLATFORM_CONFIGS[platform];
      const tokenBody = config.buildTokenBody(appId, appSecret, code);

      // Handle X's PKCE code_verifier
      if (platform === "x") {
        try {
          const rawState = JSON.parse(atob(stateParam));
          if (rawState.cv) {
            tokenBody.set("code_verifier", rawState.cv);
          }
        } catch {
          // If we can't extract verifier, proceed without it
        }
      }

      // Exchange authorization code for tokens
      const tokenHeaders: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      // X requires Basic auth header
      if (platform === "x") {
        const basicAuth = btoa(`${appId}:${appSecret}`);
        tokenHeaders["Authorization"] = `Basic ${basicAuth}`;
      }

      const tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: tokenHeaders,
        body: tokenBody.toString(),
      });

      if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text();
        console.error(`Token exchange failed for ${platform}:`, errorBody);
        return errorPage(
          "Token Exchange Failed",
          `The platform rejected the token exchange (HTTP ${tokenResponse.status}). This usually means the authorization code expired or the app credentials are incorrect. Try connecting again.`
        );
      }

      const tokenData = await tokenResponse.json();
      const tokens = config.extractTokens(tokenData);

      if (!tokens.access_token) {
        return errorPage(
          "No Access Token",
          "The platform returned a response but no access token was included. Check your app's permissions and scopes."
        );
      }

      // Calculate token expiry
      const tokenExpiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null;

      // Fetch platform-specific metadata (username, page info, etc.)
      let platformMetadata: Record<string, any> = {};
      try {
        platformMetadata = await fetchPlatformMetadata(
          platform,
          tokens.access_token,
          tokenData
        );
      } catch (err) {
        console.error(`Metadata fetch failed for ${platform}:`, err);
        // Non-fatal — continue without metadata
      }

      // Store tokens in the vault (upserts on same branch_id+platform row)
      const { error: upsertError } = await supabase.rpc(
        "upsert_social_credential",
        {
          p_branch_id: branchId,
          p_platform: platform,
          p_access_token: tokens.access_token,
          p_refresh_token: tokens.refresh_token || null,
          p_token_expires_at: tokenExpiresAt,
          p_platform_metadata: platformMetadata,
          p_granted_scopes: config.defaultScopes,
          p_status: "active",
          // NOTE: do NOT pass p_encryption_key. The deployed function has no
          // such parameter — it derives the key internally via
          // get_encryption_key() — and PostgREST rejects an unknown named
          // argument outright (PGRST202). Sending it meant every OAuth callback
          // failed at the final step: the user completed the consent screen and
          // the token was silently never stored.
        }
      );

      if (upsertError) {
        console.error("Token storage failed:", upsertError);
        return errorPage(
          "Storage Error",
          "Tokens were received but could not be stored in the vault. Check the Supabase logs."
        );
      }

      // SUCCESS — show the success page (auto-closes popup)
      return successPage(platform, branchId);
    }

    // ═══════════════════════════════════════════════════════
    // ROUTE 3: HEALTH CHECK
    // ═══════════════════════════════════════════════════════
    return new Response(
      JSON.stringify({
        status: "ok",
        function: "social-oauth",
        version: "1.0.0",
        supported_platforms: Object.keys(PLATFORM_CONFIGS),
        callback_url: CALLBACK_URL,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unhandled error in social-oauth:", err);
    return errorPage(
      "Internal Error",
      "An unexpected error occurred. Check the Edge Function logs in the Supabase Dashboard.",
      500
    );
  }
});

// ─── Platform Metadata Fetchers ─────────────────────────────
// After getting tokens, fetch the user's profile/page info
// to store useful metadata (username, profile pic, page ID, etc.)

async function fetchPlatformMetadata(
  platform: string,
  accessToken: string,
  tokenData?: Record<string, any>
): Promise<Record<string, any>> {
  switch (platform) {
    case "instagram": {
      // Get the Facebook Pages connected to this user
      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`
      );
      const pagesData = await pagesRes.json();

      if (pagesData.data?.[0]) {
        const page = pagesData.data[0];
        const pageToken = page.access_token;

        // Get the Instagram Business Account linked to the first page
        const igRes = await fetch(
          `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${pageToken}`
        );
        const igData = await igRes.json();

        if (igData.instagram_business_account?.id) {
          // Get IG profile details
          const igProfileRes = await fetch(
            `https://graph.facebook.com/v21.0/${igData.instagram_business_account.id}?fields=username,name,profile_picture_url,followers_count&access_token=${pageToken}`
          );
          const igProfile = await igProfileRes.json();

          return {
            // Keep both keys: test-social-connection + meta-insights read
            // instagram_business_account_id; older code read ig_user_id.
            instagram_business_account_id: igData.instagram_business_account.id,
            ig_user_id: igData.instagram_business_account.id,
            page_id: page.id,
            page_name: page.name,
            page_access_token: pageToken,
            username: igProfile.username || null,
            display_name: igProfile.name || null,
            profile_picture_url: igProfile.profile_picture_url || null,
            followers_count: igProfile.followers_count || 0,
            connected_at: new Date().toISOString(),
          };
        }
      }

      return { connected_at: new Date().toISOString(), note: "No Instagram Business Account found on connected pages" };
    }

    case "facebook": {
      // Get user's pages (include the page access token for publishing/testing)
      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=name,id,picture,fan_count,access_token&access_token=${accessToken}`
      );
      const pagesData = await pagesRes.json();
      const first = pagesData.data?.[0];

      return {
        page_id: first?.id || null,
        page_name: first?.name || null,
        page_access_token: first?.access_token || null,
        pages: (pagesData.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          fan_count: p.fan_count || 0,
        })),
        page_count: pagesData.data?.length || 0,
        connected_at: new Date().toISOString(),
      };
    }

    case "x": {
      // Get authenticated user's profile
      const meRes = await fetch("https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url,public_metrics", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meData = await meRes.json();

      if (meData.data) {
        return {
          x_user_id: meData.data.id,
          username: meData.data.username,
          display_name: meData.data.name,
          profile_picture_url: meData.data.profile_image_url || null,
          followers_count: meData.data.public_metrics?.followers_count || 0,
          connected_at: new Date().toISOString(),
        };
      }

      return { connected_at: new Date().toISOString() };
    }

    case "linkedin": {
      // Get authenticated user's profile via OpenID
      const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meData = await meRes.json();

      return {
        li_sub: meData.sub || null,
        username: meData.name || null,
        display_name: meData.name || null,
        email: meData.email || null,
        profile_picture_url: meData.picture || null,
        connected_at: new Date().toISOString(),
      };
    }

    case "tiktok": {
      // open_id is the identifier publishing depends on — TikTok returns it at the
      // top level of the token response, so grab it before the user-info call
      // (which can fail independently) so we never lose it.
      const openId = tokenData?.open_id ?? null;
      try {
        const meRes = await fetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url,username",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const meData = await meRes.json();
        const user = meData?.data?.user;

        if (user) {
          return {
            open_id: user.open_id || openId,
            union_id: user.union_id || null,
            username: user.username || null,
            display_name: user.display_name || null,
            avatar_url: user.avatar_url || null,
            connected_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        console.error("TikTok user-info fetch failed:", err);
      }

      // User-info call failed or returned no user — a credential without open_id
      // can't publish, so still persist it from the token response if we have it.
      return { open_id: openId, connected_at: new Date().toISOString() };
    }

    default:
      return { connected_at: new Date().toISOString() };
  }
}
