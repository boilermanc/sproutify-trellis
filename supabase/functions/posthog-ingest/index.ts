import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, cors, hashWebhookSecret, json, secureEqual } from "../_shared/posthog.ts";
import {
  canonicalEventType,
  normalizePosthogEmail,
  qualifyPosthogEventId,
  sanitizePosthogProperties,
} from "../_shared/posthog-contract.mjs";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const connectionId = String(body.connection_id || "");
  const authHeader = req.headers.get("Authorization") || "";
  const suppliedSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!connectionId || !suppliedSecret) return json({ error: "Connection and bearer secret are required" }, 401);

  const db = adminClient();
  const { data: connection } = await db
    .from("posthog_connections")
    .select("id,project_id,branch_id,webhook_secret_hash,allowed_events,allowed_properties,status,branches(slug)")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection || connection.status === "disconnected") return json({ error: "Connection not found" }, 404);

  const suppliedHash = await hashWebhookSecret(suppliedSecret);
  if (!secureEqual(suppliedHash, connection.webhook_secret_hash)) return json({ error: "Invalid webhook secret" }, 401);

  const eventName = String(body.event || body.event_name || "").trim();
  const allowedEvents: string[] = Array.isArray(connection.allowed_events) ? connection.allowed_events.map(String) : [];
  if (!allowedEvents.includes(eventName)) return json({ accepted: false, reason: "event_not_allowlisted" }, 202);

  const qualifiedEventId = qualifyPosthogEventId(connection.project_id, body.event_id || body.uuid);
  if (!qualifiedEventId) return json({ error: "A valid PostHog event UUID is required" }, 400);
  const canonicalType = canonicalEventType(eventName);
  const branchUserId = String(body.branch_user_id || body.distinct_id || "").trim().slice(0, 200) || null;
  const email = normalizePosthogEmail(body.email);
  const occurredAt = new Date(body.occurred_at || body.timestamp || Date.now());
  if (Number.isNaN(occurredAt.getTime())) return json({ error: "Invalid event timestamp" }, 400);
  const properties = sanitizePosthogProperties(
    body.properties,
    Array.isArray(connection.allowed_properties) ? connection.allowed_properties.map(String) : [],
  );
  if (canonicalType === "product_feature_milestone") properties.milestone = properties.milestone || eventName;

  const safeEnvelope = {
    event_id: qualifiedEventId,
    connection_id: connection.id,
    event_type: canonicalType,
    source_site: connection.branches?.slug || String(connection.branch_id),
    branch_user_id: branchUserId,
    email,
    occurred_at: occurredAt.toISOString(),
    properties,
  };

  const { data, error } = await db.rpc("ingest_posthog_event", {
    p_event_id: safeEnvelope.event_id,
    p_connection_id: safeEnvelope.connection_id,
    p_event_type: safeEnvelope.event_type,
    p_source_site: safeEnvelope.source_site,
    p_branch_user_id: safeEnvelope.branch_user_id,
    p_email: safeEnvelope.email,
    p_occurred_at: safeEnvelope.occurred_at,
    p_properties: safeEnvelope.properties,
  });

  if (error) {
    await db.from("failed_syncs").insert({
      event_id: qualifiedEventId,
      source_site: safeEnvelope.source_site,
      raw_payload: safeEnvelope,
      error_message: error.message.slice(0, 500),
      retry_count: 0,
    });
    await db.from("posthog_connections").update({
      status: "error",
      last_error: error.message.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", connectionId);
    return json({ error: "Event could not be ingested" }, 500);
  }

  return json({ accepted: true, ...data });
});
