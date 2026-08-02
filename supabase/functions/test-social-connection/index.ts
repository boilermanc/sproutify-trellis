// Trellis: Social connection tester
// Validates that a branch's stored access token for a platform is live by making
// one minimal authenticated call to the platform API. The decrypted token is read
// server-side via get_social_credential and never reaches the browser.
//
// Call: POST /test-social-connection  { "branch_id": "<uuid>", "platform": "instagram|facebook|x|linkedin|tiktok" }
//
// Returns: { ok: boolean, username?: string, error?: string }
//
// SECRETS (auto-set by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy: supabase functions deploy test-social-connection --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const VALID_PLATFORMS = ["instagram", "facebook", "x", "linkedin", "tiktok"];

// One minimal authenticated read per platform → { ok, username?, error? }.
async function probe(platform: string, token: string, meta: any): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    if (platform === "instagram") {
      const igId = meta?.instagram_business_account_id;
      const path = igId ? `${igId}?fields=username` : `me?fields=username`;
      const res = await fetch(`${GRAPH}/${path}&access_token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data?.error) return { ok: false, error: data.error.message };
      return { ok: true, username: data?.username ?? undefined };
    }

    if (platform === "facebook") {
      const pageId = meta?.page_id;
      // A Facebook credential with no Page cannot publish. Falling back to /me
      // here made the test query the USER and report "live" off a valid personal
      // token even though no Page is connected -- a false pass. Report the real
      // state instead: not usable until a Page is granted.
      if (!pageId) {
        return {
          ok: false,
          error: "No Facebook Page is connected — reconnect and select the Page. Publishing targets a Page, not your personal account.",
        };
      }
      const res = await fetch(`${GRAPH}/${pageId}?fields=name&access_token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data?.error) return { ok: false, error: data.error.message };
      return { ok: true, username: data?.name ?? undefined };
    }

    if (platform === "x") {
      const res = await fetch("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data?.errors) {
        return { ok: false, error: data?.errors?.[0]?.detail || data?.title || `X API returned ${res.status}` };
      }
      return { ok: true, username: data?.data?.username ?? undefined };
    }

    if (platform === "linkedin") {
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data?.message || `LinkedIn API returned ${res.status}` };
      }
      return { ok: true, username: data?.name ?? data?.email ?? undefined };
    }

    if (platform === "tiktok") {
      const res = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url,username",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok || data?.error?.code && data.error.code !== "ok") {
        return { ok: false, error: data?.error?.message || `TikTok API returned ${res.status}` };
      }
      const user = data?.data?.user;
      if (!user) return { ok: false, error: "TikTok API returned no user data" };
      return { ok: true, username: user.username ?? user.display_name ?? undefined };
    }

    return { ok: false, error: `Unsupported platform: ${platform}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = new URL(req.url);
    let branchId = url.searchParams.get("branch_id");
    let platform = url.searchParams.get("platform");
    if ((!branchId || !platform) && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      branchId = branchId || body?.branch_id || null;
      platform = platform || body?.platform || null;
    }
    if (!branchId) return json({ ok: false, error: "branch_id is required" }, 400);
    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return json({ ok: false, error: `platform must be one of ${VALID_PLATFORMS.join(", ")}` }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: cred, error } = await supabase.rpc("get_social_credential", {
      p_branch_id: branchId,
      p_platform: platform,
    });
    if (error) return json({ ok: false, error: `Credential lookup failed: ${error.message}` });
    if (!cred?.success) return json({ ok: false, error: cred?.error || "No credential found for this branch/platform" });
    if (!cred?.access_token) {
      return json({ ok: false, error: "No access token stored — save app credentials and connect the account first." });
    }

    const result = await probe(platform, cred.access_token, cred.platform_metadata);
    return json(result);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" });
  }
});
