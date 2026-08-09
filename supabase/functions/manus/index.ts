// Trellis: Manus integration proxy
//
// Talks to the Manus Agent API (https://api.manus.ai) SERVER-SIDE so the org's
// Manus API key never reaches the browser. The key is read from tenant_secrets
// with the service_role key, exactly like tenant-secrets does for other creds.
//
// Deploy WITH jwt verification (the default — do NOT pass --no-verify-jwt):
//   supabase functions deploy manus
//
// Ops (POST body):
//   { op: "test" }  -> validates the saved Manus API key against the Manus API
//
// Phase 2 will add { op: "research", leadId } (task.create) and a poller.
//
// SECRETS (auto-set by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MANUS_BASE = "https://api.manus.ai";
const ORG_ID = "00000000-0000-0000-0000-000000000001";

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

async function getManusKey(db: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await db
    .from("tenant_secrets")
    .select("manus_api_key")
    .eq("organization_id", ORG_ID)
    .maybeSingle();
  return (data?.manus_api_key as string) || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Require a signed-in Trellis user (defense-in-depth on top of verify_jwt).
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header" }, 401);
  }
  const authed = createClient(HUB_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const db = createClient(HUB_URL, SERVICE_KEY);
  const op = body?.op;

  if (op === "test") {
    // Prefer a key passed in the body (lets the UI verify a freshly typed key
    // before saving); fall back to the saved key.
    const typed = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const key = typed || (await getManusKey(db));
    if (!key) return json({ ok: false, error: "No Manus API key saved yet." });
    try {
      const resp = await fetch(`${MANUS_BASE}/v2/task.list?limit=1`, {
        headers: { "x-manus-api-key": key },
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const message = payload?.error?.message || `Manus returned ${resp.status}`;
        return json({ ok: false, error: message });
      }
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: `Could not reach Manus: ${(e as Error).message}` });
    }
  }

  return json({ error: `Unknown op: ${op}` }, 400);
});
