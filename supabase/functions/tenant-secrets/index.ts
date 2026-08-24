// Trellis: Tenant Secrets proxy
//
// Reads and writes the org's third-party credentials (Gemini/OpenAI/Anthropic,
// Resend, Twilio, Woo, Meta, Slack) SERVER-SIDE with the service_role key.
//
// WHY THIS EXISTS: services/secretsService.ts previously ran
//     supabase.from('tenant_secrets').select('*')
// straight from the browser using the public anon key. RLS is disabled on that
// table, so every third-party API key the org owns was readable by anyone on
// the internet who opened devtools and copied the anon key out of the bundle.
// Routing through this function means only a signed-in Trellis user can read
// them, and it is the prerequisite for turning RLS on.
//
// Deploy WITH jwt verification (the default -- do NOT pass --no-verify-jwt):
//   supabase functions deploy tenant-secrets
// An unauthenticated caller must not be able to reach this.
//
// Call: POST /tenant-secrets
//   { op: "get" }
//   { op: "save", secrets: { ...ApiKeyConfig } }
//
// SECRETS (auto-set by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Single-tenant today. The org is fixed server-side rather than taken from the
// request so a caller cannot enumerate other orgs' secrets by changing an id.
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

// Shape returned to the client. Mirrors ApiKeyConfig in types.ts.
function toConfig(row: Record<string, any> | null) {
  const r = row || {};
  return {
    active_llm: r.active_llm || "gemini",
    gemini_api_key: r.gemini_api_key || "",
    openai_api_key: r.openai_api_key || "",
    anthropic_api_key: r.anthropic_api_key || "",
    xai_api_key: r.xai_api_key || "",
    n8n_webhooks: {
      chat: r.n8n_webhook_chat || "",
      workflow: r.n8n_webhook_workflow || "",
    },
    slack_webhook: r.slack_webhook || "",
    resend_token: r.resend_token || "",
    resend_from_address: r.resend_from_address || "",
    twilio_sid: r.twilio_sid || "",
    twilio_token: r.twilio_token || "",
    woo_consumer_key: r.woo_consumer_key || "",
    woo_consumer_secret: r.woo_consumer_secret || "",
    meta_app_id: r.meta_app_id || "",
    meta_app_secret: r.meta_app_secret || "",
    manus_api_key: r.manus_api_key || "",
    manus_model: r.manus_model || "manus-1.6",
  };
}

// Only these columns may be written. An unexpected key in the request body is
// dropped rather than passed through to the upsert.
const WRITABLE = [
  "active_llm", "gemini_api_key", "openai_api_key", "anthropic_api_key", "xai_api_key",
  "n8n_webhook_chat", "n8n_webhook_workflow", "slack_webhook",
  "resend_token", "resend_from_address", "twilio_sid", "twilio_token",
  "woo_consumer_key", "woo_consumer_secret", "meta_app_id", "meta_app_secret",
  "manus_api_key", "manus_model",
] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // verify_jwt=true already rejects anonymous callers at the gateway. This is a
  // second, explicit check so the function is still safe if it is ever
  // redeployed with --no-verify-jwt by mistake.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header" }, 401);
  }
  const authed = createClient(HUB_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "Not authenticated" }, 401);
  }

  // Credentials are materially more sensitive than ordinary Trellis data.
  // A valid session alone is not enough: only active owners/admins may read or
  // change the organization-wide provider keys.
  const db = createClient(HUB_URL, SERVICE_KEY);
  const { data: secretManager } = await db.from("trellis_users").select("role,status")
    .eq("auth_user_id", userData.user.id).eq("status", "active")
    .in("role", ["owner", "admin"]).maybeSingle();
  if (!secretManager) return json({ error: "Owner or admin access required" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const op = body?.op;

  if (op === "get") {
    const { data, error } = await db
      .from("tenant_secrets")
      .select("*")
      .eq("organization_id", ORG_ID)
      .maybeSingle();

    if (error) {
      console.error("tenant-secrets get failed:", error.message);
      return json({ error: "Could not read secrets" }, 500);
    }
    // No row yet is a legitimate first-run state, not an error.
    return json({ secrets: toConfig(data) });
  }

  if (op === "save") {
    const incoming = body?.secrets;
    if (!incoming || typeof incoming !== "object") {
      return json({ error: "secrets object is required" }, 400);
    }

    // Flatten the nested n8n_webhooks the client sends into their columns.
    const flat: Record<string, any> = { ...incoming };
    if (incoming.n8n_webhooks && typeof incoming.n8n_webhooks === "object") {
      flat.n8n_webhook_chat = incoming.n8n_webhooks.chat ?? "";
      flat.n8n_webhook_workflow = incoming.n8n_webhooks.workflow ?? "";
    }

    const payload: Record<string, any> = {
      organization_id: ORG_ID,
      updated_at: new Date().toISOString(),
    };
    for (const col of WRITABLE) {
      if (flat[col] !== undefined) payload[col] = flat[col];
    }

    const { error } = await db
      .from("tenant_secrets")
      .upsert(payload, { onConflict: "organization_id" });

    if (error) {
      console.error("tenant-secrets save failed:", error.message);
      return json({ error: "Could not save secrets" }, 500);
    }
    // Never echo the values back -- the caller already has what it sent.
    return json({ success: true });
  }

  return json({ error: `Unknown op: ${op}` }, 400);
});
