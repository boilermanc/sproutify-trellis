// Trellis: Meta Insights reader
// Returns Facebook Page + Instagram audience stats for a branch.
// Reads the encrypted Page access token + platform IDs from social_credentials
// via the get_meta_insight_credentials RPC — tokens never reach the browser.
//
// Call: POST /meta-insights  { "branch_id": "<uuid>" }   (or ?branch_id=)
//
// SECRETS (auto-set by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy: supabase functions deploy meta-insights --no-verify-jwt

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

async function graph(path: string, token: string): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}/${path}${sep}access_token=${token}`);
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = new URL(req.url);
    let branchId = url.searchParams.get("branch_id");
    if (!branchId && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      branchId = body?.branch_id ?? null;
    }
    if (!branchId) return json({ error: "branch_id is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: creds, error } = await supabase.rpc("get_meta_insight_credentials", { p_branch_id: branchId });
    if (error) return json({ connected: false, error: `Credential lookup failed: ${error.message}` });

    const fbCred = creds?.facebook;
    const igCred = creds?.instagram;
    if (!fbCred?.access_token && !igCred?.access_token) {
      return json({ connected: false, branch_id: branchId });
    }

    const result: Record<string, any> = { connected: true, branch_id: branchId, fetched_at: new Date().toISOString() };

    // ── Facebook Page ──────────────────────────────────────────
    if (fbCred?.access_token && fbCred?.platform_user_id) {
      const fb = await graph(`${fbCred.platform_user_id}?fields=name,fan_count,followers_count`, fbCred.access_token);
      if (fb.error) {
        result.facebook = { error: fb.error.message };
      } else {
        result.facebook = { name: fb.name ?? null, fans: fb.fan_count ?? null, followers: fb.followers_count ?? null };
        // Defensive: many page_* insight metrics are deprecated and return empty — only include if data exists.
        try {
          const ins = await graph(`${fbCred.platform_user_id}/insights/page_impressions_unique?period=days_28`, fbCred.access_token);
          const v = ins?.data?.[0]?.values;
          if (Array.isArray(v) && v.length) result.facebook.reach_28d = v[v.length - 1].value;
        } catch { /* metric unavailable */ }
      }
    }

    // ── Instagram Business ─────────────────────────────────────
    if (igCred?.access_token && igCred?.platform_user_id) {
      const ig = await graph(`${igCred.platform_user_id}?fields=username,followers_count,media_count`, igCred.access_token);
      if (ig.error) {
        result.instagram = { error: ig.error.message };
      } else {
        result.instagram = { username: ig.username ?? null, followers: ig.followers_count ?? null, posts: ig.media_count ?? null };
        try {
          const ins = await graph(`${igCred.platform_user_id}/insights?metric=reach&period=days_28`, igCred.access_token);
          const v = ins?.data?.[0]?.values;
          if (Array.isArray(v) && v.length) result.instagram.reach_28d = v.reduce((s: number, x: any) => s + (x.value || 0), 0);
        } catch { /* metric unavailable */ }
      }
    }

    return json(result);
  } catch (e) {
    return json({ connected: false, error: e instanceof Error ? e.message : "Unknown error" });
  }
});
