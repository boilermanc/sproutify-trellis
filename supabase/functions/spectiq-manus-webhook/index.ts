// Public webhook endpoint: deploy with JWT verification disabled. Authenticity is
// enforced with Manus RSA-SHA256 signatures, five-minute freshness, and durable
// event-id idempotency before any research state is changed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { MANUS_BASE, getStructuredOutput, persistStructuredResult } from "../_shared/spectiq-prospect-research.ts";

const HUB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const MAX_CLOCK_SKEW_SECONDS = 300;
let publicKeyCache: { key: CryptoKey; expiresAt: number } | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Bytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function getManusApiKey(db: any): Promise<string> {
  const envKey = Deno.env.get("MANUS_API_KEY")?.trim();
  if (envKey) return envKey;
  const { data } = await db.from("tenant_secrets").select("manus_api_key").eq("organization_id", ORG_ID).maybeSingle();
  const secret = data as { manus_api_key?: unknown } | null;
  return typeof secret?.manus_api_key === "string" ? secret.manus_api_key.trim() : "";
}

async function getManusPublicKey(apiKey: string): Promise<CryptoKey> {
  if (publicKeyCache && publicKeyCache.expiresAt > Date.now()) return publicKeyCache.key;
  const response = await fetch(`${MANUS_BASE}/v2/webhook.publicKey`, { headers: { "x-manus-api-key": apiKey } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body?.public_key !== "string" || body?.algorithm !== "RSA-SHA256") {
    throw new Error("Could not load the Manus webhook verification key.");
  }
  const der = base64Bytes(body.public_key.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, ""));
  const key = await crypto.subtle.importKey("spki", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  publicKeyCache = { key, expiresAt: Date.now() + 60 * 60 * 1000 };
  return key;
}

async function verifySignature(req: Request, rawBody: Uint8Array<ArrayBuffer>, apiKey: string): Promise<{ valid: boolean; bodyHash: string }> {
  const signature = req.headers.get("X-Webhook-Signature") || "";
  const timestamp = req.headers.get("X-Webhook-Timestamp") || "";
  const seconds = Number(timestamp);
  if (!signature || !/^\d{10}$/.test(timestamp) || !Number.isSafeInteger(seconds)) return { valid: false, bodyHash: "" };
  if (Math.abs(Math.floor(Date.now() / 1000) - seconds) > MAX_CLOCK_SKEW_SECONDS) return { valid: false, bodyHash: "" };
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", rawBody));
  const bodyHash = bytesToHex(digest);
  const signedContent = new TextEncoder().encode(`${timestamp}.${req.url}.${bodyHash}`);
  try {
    const key = await getManusPublicKey(apiKey);
    const valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, base64Bytes(signature), signedContent);
    return { valid, bodyHash };
  } catch {
    return { valid: false, bodyHash };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const rawBody = new Uint8Array(await req.arrayBuffer());
  if (rawBody.byteLength === 0 || rawBody.byteLength > 1_000_000) return json({ ok: false }, 400);
  const db = createClient(HUB_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const apiKey = await getManusApiKey(db);
  if (!apiKey) return json({ ok: false }, 503);
  const verified = await verifySignature(req, rawBody, apiKey);
  if (!verified.valid) return json({ ok: false }, 401);

  let payload: Record<string, any>;
  try { payload = JSON.parse(new TextDecoder().decode(rawBody)); } catch { return json({ ok: false }, 400); }
  const eventId = typeof payload.event_id === "string" ? payload.event_id.slice(0, 500) : "";
  const eventType = payload.event_type;
  const taskId = typeof payload.task_detail?.task_id === "string" ? payload.task_detail.task_id.slice(0, 500) : "";
  if (!eventId || !taskId || !["task_created", "task_stopped"].includes(eventType)) return json({ ok: false }, 400);

  const eventRow = { event_id: eventId, event_type: eventType, manus_task_id: taskId, payload_sha256: verified.bodyHash, status: "processing", payload };
  const { error: insertError } = await db.from("spectiq_manus_webhook_events").insert(eventRow);
  if (insertError) {
    if (insertError.code !== "23505") return json({ ok: false }, 500);
    const { data: prior } = await db.from("spectiq_manus_webhook_events").select("status,payload_sha256,attempt_count").eq("event_id", eventId).maybeSingle();
    if (!prior || prior.payload_sha256 !== verified.bodyHash) return json({ ok: false }, 409);
    if (prior.status !== "failed") return json({ ok: true, duplicate: true });
    await db.from("spectiq_manus_webhook_events").update({ status: "processing", attempt_count: Number(prior.attempt_count || 1) + 1, error_message: null }).eq("event_id", eventId);
  }

  try {
    const { data: run } = await db.from("spectiq_prospect_research_runs").select("*").eq("manus_task_id", taskId).maybeSingle();
    if (!run) {
      await db.from("spectiq_manus_webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("event_id", eventId);
      return json({ ok: true, ignored: true });
    }
    if (eventType === "task_created") {
      await db.from("spectiq_prospect_research_runs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", run.id).in("status", ["queued", "running"]);
    } else if (payload.task_detail.stop_reason === "ask") {
      await db.from("spectiq_prospect_research_runs").update({ status: "waiting", error_message: "Manus paused for input. Retry the search with a more specific location.", next_poll_at: null, updated_at: new Date().toISOString() }).eq("id", run.id);
    } else if (payload.task_detail.stop_reason === "finish") {
      const structured = getStructuredOutput(payload);
      if (structured) await persistStructuredResult(db, run, structured, { webhook: payload });
      else {
        await db.from("spectiq_prospect_research_runs").update({ status: "running", next_poll_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", run.id);
      }
    }
    await db.from("spectiq_manus_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("event_id", eventId);
    return json({ ok: true });
  } catch (error) {
    console.error("spectiq-manus-webhook", error);
    await db.from("spectiq_manus_webhook_events").update({ status: "failed", error_message: error instanceof Error ? error.message.slice(0, 4000) : "Webhook processing failed." }).eq("event_id", eventId);
    return json({ ok: false }, 500);
  }
});
