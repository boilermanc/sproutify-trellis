// Trellis: Webhook health prober
//
// Probes the n8n webhooks the app depends on and caches the result.
//
// WHY SERVER-SIDE: the browser cannot probe these at all — n8n does not send
// CORS headers for these paths, so a fetch from trellis.sproutify.app is
// blocked before it ever reaches the network. The dashboard therefore reads a
// cached table instead of probing directly.
//
// WHY CACHED: the audit found six webhooks the app calls that nothing answers
// (§4.1). Surfacing that on the dashboard is high value, but re-probing 10
// endpoints on every render would hammer n8n for no benefit — status changes
// only when someone imports or activates a workflow.
//
// SAFETY: every probe sends an empty JSON body. Each workflow validates its
// payload (branch_id/caption required) and returns an error long before any
// publish, send, or external API call. Nothing is posted, sent, or created.
//
// Call: POST /webhook-health   { force?: boolean }
// Returns: { checked_at, cached, results: [{ path, label, status, http_code, detail }] }
//
// Deploy: supabase functions deploy webhook-health   (verify_jwt = true)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const N8N = "https://n8n.sproutify.app/webhook";
const CACHE_TTL_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 8000;

// The webhooks the app actually calls. `critical` ones are on a path a user can
// trigger today, so a 404 there means silent data loss rather than an unused
// blueprint sitting idle.
const WEBHOOKS: { path: string; label: string; critical: boolean }[] = [
  { path: "trellis-social-publish", label: "Instagram publisher", critical: true },
  { path: "trellis-facebook-publish", label: "Facebook publisher", critical: true },
  { path: "trellis-tiktok-publish", label: "TikTok publisher", critical: true },
  { path: "trellis-static-ad-generate", label: "Static ad generator", critical: true },
  { path: "trellis-carousel-generate", label: "Carousel generator", critical: true },
  { path: "trellis-video-ad-generate", label: "Video ad generator", critical: true },
  { path: "trellis-video-ad-render", label: "Video ad render", critical: true },
  { path: "trellis-clip-publish", label: "Clip publisher", critical: false },
  { path: "trellis-music-generate", label: "Music generator", critical: false },
  { path: "reddit-post-comment", label: "Reddit poster", critical: false },
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function probe(w: { path: string; label: string }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${N8N}/${w.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
    const text = (await res.text()).slice(0, 300);

    // 404 is the signal that matters: n8n replies "webhook not registered" when
    // the workflow was never imported or is inactive. Every other status means
    // something IS listening — a 400 is the workflow correctly rejecting the
    // empty payload, which is a HEALTHY answer here.
    if (res.status === 404) {
      return {
        path: w.path, label: w.label, status: "down" as const, http_code: 404,
        detail: "Nothing is serving this webhook — the workflow is not imported or not active.",
      };
    }
    return {
      path: w.path, label: w.label, status: "ok" as const, http_code: res.status,
      detail: res.status >= 500
        ? `Registered, but returned ${res.status} on an empty payload: ${text}`
        : "Registered and responding.",
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      path: w.path, label: w.label, status: "error" as const, http_code: null,
      detail: aborted
        ? `No response within ${PROBE_TIMEOUT_MS / 1000}s.`
        : `Could not reach n8n: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Explicit auth check as well as verify_jwt: the anon key is itself a valid
  // project JWT, so the gateway alone does not keep anonymous callers out.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);
  const authed = createClient(HUB_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await authed.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);

  const db = createClient(HUB_URL, SERVICE_KEY);
  let force = false;
  try { force = (await req.json())?.force === true; } catch { /* empty body is fine */ }

  const { data: cached } = await db
    .from("webhook_health")
    .select("*")
    .order("checked_at", { ascending: false });

  const newest = cached?.[0]?.checked_at ? new Date(cached[0].checked_at).getTime() : 0;
  const fresh = Date.now() - newest < CACHE_TTL_MS;

  if (!force && fresh && cached && cached.length) {
    return json({ checked_at: cached[0].checked_at, cached: true, results: cached });
  }

  const results = await Promise.all(WEBHOOKS.map(probe));
  const checked_at = new Date().toISOString();

  const { error } = await db
    .from("webhook_health")
    .upsert(results.map(r => ({ ...r, checked_at })), { onConflict: "path" });
  if (error) console.error("webhook-health cache write failed:", error.message);

  return json({ checked_at, cached: false, results });
});
