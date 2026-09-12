import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  CANDIDATE_SCHEMA,
  MANUS_BASE,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  buildPublicResearchPrompt,
  manusRequest,
  pollRun,
  validateLocation,
} from "../_shared/spectiq-prospect-research.ts";

const HUB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ORG_ID = "00000000-0000-0000-0000-000000000001";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function requireFounder(req: Request): Promise<{ userId: string } | Response> {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ ok: false, error: "Authentication required." }, 401);
  const authed = createClient(HUB_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await authed.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, error: "Authentication required." }, 401);
  // The RPC re-queries trellis_users on every mutation and requires status
  // "active" plus platform_role "platform_super_admin"; no JWT metadata role
  // or stale client-side access flag is trusted.
  const { data: access, error: accessError } = await authed.rpc("spectiq_prospecting_access_status");
  const row = Array.isArray(access) ? access[0] : access;
  if (accessError || row?.authorized !== true) return json({ ok: false, error: "SpectIQ founder access is required." }, 403);
  return { userId: userData.user.id };
}

async function getManusKey(db: any): Promise<string> {
  const envKey = Deno.env.get("MANUS_API_KEY")?.trim();
  if (envKey) return envKey;
  const { data } = await db.from("tenant_secrets").select("manus_api_key").eq("organization_id", ORG_ID).maybeSingle();
  const secret = data as { manus_api_key?: unknown } | null;
  return typeof secret?.manus_api_key === "string" ? secret.manus_api_key.trim() : "";
}

async function createManusTask(key: string, prompt: string, title: string): Promise<any> {
  const response = await manusRequest("/v2/task.create", key, {
    method: "POST",
    body: JSON.stringify({
      message: { content: [{ type: "text", text: prompt }] },
      structured_output_schema: CANDIDATE_SCHEMA,
      agent_profile: "standard",
      interactive_mode: false,
      hide_in_task_list: true,
      share_visibility: "private",
      title,
    }),
  });
  if (!response.ok || !response.body?.task_id) {
    throw new Error(response.body?.error?.message || `Manus task.create failed (${response.status}).`);
  }
  const taskUrl = typeof response.body.task_url === "string" && response.body.task_url.startsWith("https://")
    ? response.body.task_url : `${MANUS_BASE.replace("api.", "")}/app/${encodeURIComponent(response.body.task_id)}`;
  return { taskId: response.body.task_id, taskUrl };
}

async function ensureManusWebhook(key: string): Promise<void> {
  const webhookUrl = `${HUB_URL}/functions/v1/spectiq-manus-webhook`;
  const listed = await manusRequest("/v2/webhook.list", key);
  if (listed.ok && Array.isArray(listed.body?.data) && listed.body.data.some((item: any) => item?.url === webhookUrl && item?.status === "active")) return;
  const created = await manusRequest("/v2/webhook.create", key, {
    method: "POST",
    body: JSON.stringify({ url: webhookUrl }),
  });
  if (!created.ok) throw new Error(created.body?.error?.message || `Manus webhook.create failed (${created.status}).`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  const founder = await requireFounder(req);
  if (founder instanceof Response) return founder;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const db = createClient(HUB_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const key = await getManusKey(db);
  if (!key) return json({ ok: false, error: "Manus is not configured on the server." }, 503);

  try {
    if (body.op === "start") {
      if (Object.keys(body).some((field) => !["op", "locationKind", "locationValue", "targetCount"].includes(field))) {
        return json({ ok: false, error: "Research request contains unsupported fields." }, 400);
      }
      const location = validateLocation({ locationKind: body.locationKind, locationValue: body.locationValue, targetCount: body.targetCount });
      const prompt = buildPublicResearchPrompt(location);
      const { data: existing } = await db.from("spectiq_prospect_research_runs").select("*")
        .eq("created_by", founder.userId).eq("location_kind", location.kind).eq("normalized_location", location.normalized)
        .eq("target_count", location.targetCount).in("status", ["queued", "running", "waiting"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing) return json({ ok: true, run: existing, reused: true });

      // Webhooks improve responsiveness, while polling below remains the
      // recovery path if registration is temporarily unavailable.
      try { await ensureManusWebhook(key); }
      catch (error) { console.warn("spectiq-prospect-research webhook setup", error); }

      const { data: run, error: insertError } = await db.from("spectiq_prospect_research_runs").insert({
        location_kind: location.kind, location_value: location.value, normalized_location: location.normalized,
        target_count: location.targetCount, status: "queued", prompt, prompt_version: PROMPT_VERSION,
        schema_version: SCHEMA_VERSION, created_by: founder.userId,
      }).select("*").single();
      if (insertError?.code === "23505") {
        const { data: racedRun } = await db.from("spectiq_prospect_research_runs").select("*")
          .eq("created_by", founder.userId).eq("location_kind", location.kind).eq("normalized_location", location.normalized)
          .eq("target_count", location.targetCount).in("status", ["queued", "running", "waiting"]).maybeSingle();
        if (racedRun) return json({ ok: true, run: racedRun, reused: true });
      }
      if (insertError || !run) throw new Error(`Could not record research run: ${insertError?.message || "unknown database error"}`);

      try {
        const task = await createManusTask(key, prompt, `SpectIQ: ${location.value} home inspectors`);
        const now = new Date().toISOString();
        const { data: running, error: updateError } = await db.from("spectiq_prospect_research_runs").update({
          status: "running", manus_task_id: task.taskId, manus_task_url: task.taskUrl,
          started_at: now, next_poll_at: new Date(Date.now() + 10_000).toISOString(), updated_at: now,
        }).eq("id", run.id).select("*").single();
        if (updateError) throw updateError;
        return json({ ok: true, run: running });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Manus task creation failed.";
        await db.from("spectiq_prospect_research_runs").update({ status: "failed", error_message: message, next_poll_at: null, updated_at: new Date().toISOString() }).eq("id", run.id);
        return json({ ok: false, error: message, runId: run.id }, 502);
      }
    }

    if (body.op === "poll") {
      if (Object.keys(body).some((field) => !["op", "runId"].includes(field)) || !validUuid(body.runId)) {
        return json({ ok: false, error: "A valid runId is required." }, 400);
      }
      const { data: run } = await db.from("spectiq_prospect_research_runs").select("*").eq("id", body.runId).eq("created_by", founder.userId).maybeSingle();
      if (!run) return json({ ok: false, error: "Research run not found." }, 404);
      const updated = await pollRun(db, run, key);
      const { data: candidates } = await db.from("spectiq_prospect_research_candidates").select("*").eq("research_run_id", run.id).order("company_name");
      return json({ ok: true, run: updated, candidates: candidates || [] });
    }

    if (body.op === "retry") {
      if (Object.keys(body).some((field) => !["op", "runId"].includes(field)) || !validUuid(body.runId)) {
        return json({ ok: false, error: "A valid runId is required." }, 400);
      }
      const { data: run } = await db.from("spectiq_prospect_research_runs").select("*").eq("id", body.runId).eq("created_by", founder.userId).in("status", ["failed", "partial"]).maybeSingle();
      if (!run) return json({ ok: false, error: "Only failed or partial research can be retried." }, 409);
      if (Number(run.attempt_count) >= 10) return json({ ok: false, error: "This research run has reached its retry limit." }, 409);
      const task = await createManusTask(key, run.prompt, `SpectIQ retry: ${run.location_value}`);
      const now = new Date().toISOString();
      const { data: retried, error } = await db.from("spectiq_prospect_research_runs").update({
        status: "running", manus_task_id: task.taskId, manus_task_url: task.taskUrl,
        attempt_count: Number(run.attempt_count) + 1, poll_count: 0, error_message: null,
        raw_result: null, started_at: now, completed_at: null,
        next_poll_at: new Date(Date.now() + 10_000).toISOString(), updated_at: now,
      }).eq("id", run.id).select("*").single();
      if (error) throw new Error(`Could not retry research: ${error.message}`);
      return json({ ok: true, run: retried });
    }

    return json({ ok: false, error: "Unsupported research operation." }, 400);
  } catch (error) {
    console.error("spectiq-prospect-research", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Research operation failed." }, 400);
  }
});
