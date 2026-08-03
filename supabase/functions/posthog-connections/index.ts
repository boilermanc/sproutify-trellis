import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  ORG_ID,
  adminClient,
  cors,
  decryptSecret,
  encryptSecret,
  hashWebhookSecret,
  json,
  newWebhookSecret,
  normalizeHost,
  normalizeNameList,
  requireTrellisUser,
  runPosthogQuery,
} from "../_shared/posthog.ts";

const DEFAULT_EVENTS = [
  "user_signed_up",
  "account_created",
  "onboarding_completed",
  "activation_milestone_reached",
  "core_feature_milestone",
  "meaningful_return",
];
const DEFAULT_PROPERTIES = ["platform", "feature", "milestone", "app_version", "return_interval_bucket"];

function publicConnection(row: Record<string, any>) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    branch_id: row.branch_id,
    branch_name: row.branches?.name || null,
    branch_slug: row.branches?.slug || null,
    host_url: row.host_url,
    project_id: row.project_id,
    api_key_preview: row.api_key_preview,
    allowed_events: row.allowed_events || [],
    allowed_properties: row.allowed_properties || [],
    status: row.status,
    last_successful_query_at: row.last_successful_query_at,
    last_event_at: row.last_event_at,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const isMutation = ["save", "delete", "rotate_webhook_secret"].includes(body?.op);
  const operator = await requireTrellisUser(req, isMutation ? ["owner", "admin"] : undefined);
  if (operator instanceof Response) return operator;

  const db = adminClient();
  const op = body?.op;

  if (op === "list") {
    const { data, error } = await db
      .from("posthog_connections")
      .select("id,organization_id,branch_id,host_url,project_id,api_key_preview,allowed_events,allowed_properties,status,last_successful_query_at,last_event_at,last_error,created_at,updated_at,branches(name,slug)")
      .eq("organization_id", ORG_ID)
      .order("created_at", { ascending: true });
    if (error) return json({ error: "Could not load PostHog connections" }, 500);
    return json({ connections: (data || []).map(publicConnection) });
  }

  if (op === "save") {
    const branchId = String(body.branch_id || "");
    const hostUrl = normalizeHost(body.host_url);
    const projectId = String(body.project_id || "").trim();
    if (!/^[0-9]+$/.test(projectId)) return json({ error: "A numeric PostHog project ID is required" }, 400);
    if (!hostUrl) return json({ error: "A valid HTTPS PostHog host is required" }, 400);

    const { data: branch } = await db.from("branches").select("id").eq("id", branchId).eq("is_active", true).maybeSingle();
    if (!branch) return json({ error: "Active branch not found" }, 404);

    const { data: existing } = await db
      .from("posthog_connections")
      .select("*")
      .eq("organization_id", ORG_ID)
      .eq("branch_id", branchId)
      .maybeSingle();

    const suppliedKey = String(body.api_key || "").trim();
    if (!suppliedKey && !existing) return json({ error: "A PostHog personal API key is required" }, 400);
    let apiKey: string;
    try {
      apiKey = suppliedKey || await decryptSecret(existing.api_key_ciphertext);
      await runPosthogQuery(hostUrl, projectId, apiKey, "SELECT 1 AS ok", "Trellis connection test");
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "PostHog connection test failed" }, 400);
    }

    const webhookSecret = existing ? null : newWebhookSecret();
    const allowedEvents = normalizeNameList(body.allowed_events, DEFAULT_EVENTS);
    const allowedProperties = normalizeNameList(body.allowed_properties, DEFAULT_PROPERTIES);
    const now = new Date().toISOString();
    const row = {
      organization_id: ORG_ID,
      branch_id: branchId,
      host_url: hostUrl,
      project_id: projectId,
      api_key_ciphertext: suppliedKey ? await encryptSecret(apiKey) : existing.api_key_ciphertext,
      api_key_preview: `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}`,
      webhook_secret_hash: existing?.webhook_secret_hash || await hashWebhookSecret(webhookSecret!),
      allowed_events: allowedEvents,
      allowed_properties: allowedProperties,
      status: "active",
      last_successful_query_at: now,
      last_error: null,
      updated_at: now,
    };

    let saved: any;
    let saveError: any;
    if (existing) {
      const result = await db.from("posthog_connections").update(row).eq("id", existing.id).select("*,branches(name,slug)").single();
      saved = result.data; saveError = result.error;
    } else {
      const result = await db.from("posthog_connections").insert(row).select("*,branches(name,slug)").single();
      saved = result.data; saveError = result.error;
    }
    if (saveError || !saved) return json({ error: "Could not save PostHog connection" }, 500);
    return json({ connection: publicConnection(saved), webhook_secret: webhookSecret });
  }

  if (op === "test") {
    const connectionId = String(body.connection_id || "");
    const { data: connection } = await db.from("posthog_connections").select("*").eq("id", connectionId).eq("organization_id", ORG_ID).maybeSingle();
    if (!connection) return json({ error: "Connection not found" }, 404);
    try {
      const apiKey = await decryptSecret(connection.api_key_ciphertext);
      await runPosthogQuery(connection.host_url, connection.project_id, apiKey, "SELECT 1 AS ok", "Trellis connection test");
      const now = new Date().toISOString();
      await db.from("posthog_connections").update({ status: "active", last_error: null, last_successful_query_at: now, updated_at: now }).eq("id", connectionId);
      return json({ success: true, tested_at: now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";
      await db.from("posthog_connections").update({ status: "error", last_error: message, updated_at: new Date().toISOString() }).eq("id", connectionId);
      return json({ success: false, error: message }, 400);
    }
  }

  if (op === "rotate_webhook_secret") {
    const connectionId = String(body.connection_id || "");
    const secret = newWebhookSecret();
    const { data, error } = await db
      .from("posthog_connections")
      .update({ webhook_secret_hash: await hashWebhookSecret(secret), updated_at: new Date().toISOString() })
      .eq("id", connectionId)
      .eq("organization_id", ORG_ID)
      .select("id")
      .maybeSingle();
    if (error || !data) return json({ error: "Connection not found" }, 404);
    return json({ webhook_secret: secret });
  }

  if (op === "delete") {
    const connectionId = String(body.connection_id || "");
    const { error } = await db.from("posthog_connections").delete().eq("id", connectionId).eq("organization_id", ORG_ID);
    if (error) return json({ error: "Could not delete PostHog connection" }, 500);
    return json({ success: true });
  }

  return json({ error: `Unknown op: ${op}` }, 400);
});
