import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fingerprintPromoJson } from "../_shared/promo-studio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("PROMO_WORKER_SECRET") || "";
const WORKER_ID = (Deno.env.get("PROMO_WORKER_ID") || "promo-edge-noop-v1").slice(0, 160);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-promo-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, "content-type": "application/json" },
});

function authorized(req: Request) {
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  const workerSecret = req.headers.get("x-promo-worker-secret") || "";
  return bearer === SERVICE_KEY || (!!WORKER_SECRET && workerSecret === WORKER_SECRET);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!authorized(req)) return json({ error: "Worker authorization required" }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: rows, error: claimError } = await db.rpc("claim_promo_job", {
    p_worker_id: WORKER_ID,
    p_lease_seconds: 60,
    p_job_types: ["noop"],
  });
  if (claimError) return json({ error: `Could not claim Promo Studio job: ${claimError.message}` }, 500);
  const job = rows?.[0];
  if (!job) return json({ ok: true, claimed: false });

  try {
    const output = {
      job_id: job.id,
      job_type: job.job_type,
      input_fingerprint: job.input_fingerprint,
      verified_at: new Date().toISOString(),
      worker_id: WORKER_ID,
    };
    const outputFingerprint = await fingerprintPromoJson(output);
    const { data: completed, error } = await db.rpc("complete_promo_job", {
      p_job_id: job.id,
      p_worker_id: WORKER_ID,
      p_lease_token: job.lease_token,
      p_output_asset_ids: [],
      p_output_fingerprint: outputFingerprint,
    });
    if (error || completed !== true) throw new Error(error?.message || "Worker lease was no longer valid.");
    await db.from("promo_events").insert({
      project_id: job.project_id, revision_id: job.revision_id, job_id: job.id,
      event_type: "job.succeeded", stage: "noop", correlation_id: crypto.randomUUID(),
      details: { worker_id: WORKER_ID, output_fingerprint: outputFingerprint },
    });
    return json({ ok: true, claimed: true, job_id: job.id, output_fingerprint: outputFingerprint });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No-op worker failed.";
    await db.rpc("fail_promo_job", {
      p_job_id: job.id, p_worker_id: WORKER_ID, p_lease_token: job.lease_token,
      p_error_code: "PROMO_NOOP_WORKER_FAILED", p_error_message: message, p_retryable: true,
    });
    return json({ error: message, job_id: job.id }, 500);
  }
});
