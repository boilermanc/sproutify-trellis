import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { runPodStatusToJobStatus, sanitizeMediaText, validateCreateMediaJob } from "../_shared/media-generation.ts";
import { cancelRunPodJob, getRunPodJob, submitRunPodJob, type RunPodConfig } from "../_shared/gpu-providers/runpod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "media-generation-assets";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const clean = (value: unknown, max = 200) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const enabled = (name: string) => ["1", "true", "yes", "on"].includes((Deno.env.get(name) || "").trim().toLowerCase());
const boundedInteger = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(Deno.env.get(name) || fallback);
  return Number.isSafeInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
};
const MEDIA_GENERATION_ENABLED = enabled("MEDIA_GENERATION_ENABLED");
const MEDIA_PUBLISHING_HANDOFF_ENABLED = enabled("MEDIA_PUBLISHING_HANDOFF_ENABLED");
const MEDIA_GENERATION_ALLOWED_ROLES = new Set(
  (Deno.env.get("MEDIA_GENERATION_ALLOWED_ROLES") || "owner,admin").split(",").map(value => value.trim()).filter(Boolean),
);
const MAX_ACTIVE_JOBS_PER_USER = boundedInteger("MEDIA_GENERATION_MAX_ACTIVE_PER_USER", 1, 1, 5);
const MAX_DAILY_DISPATCHES_PER_USER = boundedInteger("MEDIA_GENERATION_MAX_DAILY_DISPATCHES_PER_USER", 3, 1, 100);
const RUNPOD_EXECUTION_TIMEOUT_MS = boundedInteger("RUNPOD_EXECUTION_TIMEOUT_MS", 3_600_000, 300_000, 86_400_000);
const RUNPOD_JOB_TTL_MS = Math.max(
  RUNPOD_EXECUTION_TIMEOUT_MS,
  boundedInteger("RUNPOD_JOB_TTL_MS", 7_200_000, 300_000, 86_400_000),
);
const RUNPOD_COST_PER_SECOND = Math.max(0, Number(Deno.env.get("RUNPOD_COST_PER_SECOND") || 0));
const ACTIVE_JOB_STATUSES = ["validating", "submitted", "running", "cancel_requested"];
const MEDIA_FONT_IDS = new Set(["cormorant", "abril", "bebas", "playfair", "oswald", "montserrat", "inter", "jetbrains"]);
const MEDIA_TEXT_POSITIONS = new Set(["top", "center", "bottom"]);
const MEDIA_TEXT_ANIMATIONS = new Set(["fade", "slide_up", "word_reveal"]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function validateFinishingPlan(value: unknown, durationSeconds: number) {
  const input = value && typeof value === "object" ? value as Record<string, any> : {};
  const rawCues = Array.isArray(input.text_cues) ? input.text_cues : [];
  if (rawCues.length < 1 || rawCues.length > 24) throw new Error("Add between 1 and 24 timed text messages.");
  if (!(durationSeconds > 0)) throw new Error("The source video duration is unavailable; refresh the media record before finishing it.");
  const cues = rawCues.map((raw: any, index: number) => {
    const text = sanitizeMediaText(clean(raw?.text, 180));
    const start = Number(raw?.start_seconds);
    const end = Number(raw?.end_seconds);
    const position = clean(raw?.position, 20);
    const animation = clean(raw?.animation, 30);
    if (!text) throw new Error(`Text message ${index + 1} is empty.`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > durationSeconds + 0.1) throw new Error(`Text message ${index + 1} has invalid timing.`);
    if (!MEDIA_TEXT_POSITIONS.has(position)) throw new Error(`Text message ${index + 1} has an unsupported position.`);
    if (!MEDIA_TEXT_ANIMATIONS.has(animation)) throw new Error(`Text message ${index + 1} has an unsupported animation.`);
    return { id: clean(raw?.id, 80) || crypto.randomUUID(), text, start_seconds: start, end_seconds: end, position, animation };
  });
  const rawStyle = input.style && typeof input.style === "object" ? input.style : {};
  const fontId = clean(rawStyle.font_id, 30);
  const fontSize = Number(rawStyle.font_size);
  const fontWeight = Number(rawStyle.font_weight);
  const backgroundOpacity = Number(rawStyle.background_opacity);
  if (!MEDIA_FONT_IDS.has(fontId)) throw new Error("Choose one of the available video fonts.");
  if (!Number.isFinite(fontSize) || fontSize < 0.035 || fontSize > 0.14) throw new Error("Text size is outside the supported range.");
  if (![400, 600, 700, 800, 900].includes(fontWeight)) throw new Error("Choose a supported font weight.");
  if (!HEX_COLOR.test(String(rawStyle.color || "")) || !HEX_COLOR.test(String(rawStyle.background_color || ""))) throw new Error("Choose valid text and background colors.");
  if (!Number.isFinite(backgroundOpacity) || backgroundOpacity < 0 || backgroundOpacity > 0.9) throw new Error("Text background strength is outside the supported range.");
  return {
    cues,
    style: {
      font_id: fontId, font_size: fontSize, font_weight: fontWeight,
      color: rawStyle.color, background_color: rawStyle.background_color,
      background_opacity: backgroundOpacity, uppercase: rawStyle.uppercase === true, shadow: rawStyle.shadow !== false,
    },
  };
}

async function assertDispatchAllowed(db: any, userId: string, operatorRole: string) {
  if (!MEDIA_GENERATION_ENABLED) throw new Error("Media generation is disabled by the deployment circuit breaker.");
  if (!MEDIA_GENERATION_ALLOWED_ROLES.has(operatorRole)) throw new Error("Your Trellis role is not allowed to start GPU generation jobs.");
  if (!(RUNPOD_COST_PER_SECOND > 0)) throw new Error("GPU cost tracking is not configured; dispatch was blocked.");

  const utcDayStart = new Date();
  utcDayStart.setUTCHours(0, 0, 0, 0);
  const [{ count: activeCount, error: activeError }, { count: dailyCount, error: dailyError }] = await Promise.all([
    db.from("media_generation_jobs").select("id", { count: "exact", head: true })
      .eq("created_by", userId).in("status", ACTIVE_JOB_STATUSES),
    db.from("media_generation_attempts")
      .select("id,media_generation_jobs!inner(created_by)", { count: "exact", head: true })
      .eq("media_generation_jobs.created_by", userId).gte("created_at", utcDayStart.toISOString()),
  ]);
  if (activeError || dailyError) throw new Error("Could not verify media generation usage limits; dispatch was blocked.");
  if (Number(activeCount || 0) >= MAX_ACTIVE_JOBS_PER_USER) {
    throw new Error(`You already have ${MAX_ACTIVE_JOBS_PER_USER} active GPU generation job(s).`);
  }
  if (Number(dailyCount || 0) >= MAX_DAILY_DISPATCHES_PER_USER) {
    throw new Error(`Daily GPU generation limit reached (${MAX_DAILY_DISPATCHES_PER_USER} dispatches).`);
  }
}

function runPodConfig(modelId: string): RunPodConfig {
  const apiKey = Deno.env.get("RUNPOD_API_KEY") || "";
  const endpointId = modelId === "longcat-video-avatar-1.5"
    ? Deno.env.get("RUNPOD_LONGCAT_AVATAR_ENDPOINT_ID") || ""
    : Deno.env.get("RUNPOD_LONGCAT_VIDEO_ENDPOINT_ID") || "";
  if (!apiKey || !endpointId) throw new Error(`RunPod is not configured for ${modelId}.`);
  return { apiKey, endpointId };
}

async function getOwnedProject(db: any, projectId: string, userId: string) {
  const { data, error } = await db.from("media_generation_projects").select("*").eq("id", projectId).eq("created_by", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Media project not found or you do not own it.");
  return data;
}

async function getOwnedJob(db: any, jobId: string, userId: string) {
  const { data, error } = await db.from("media_generation_jobs").select("*").eq("id", jobId).eq("created_by", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Generation job not found or you do not own it.");
  return data;
}

async function getOwnedOutput(db: any, outputId: string, userId: string) {
  const { data: output, error } = await db.from("media_generation_outputs").select("*").eq("id", outputId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!output) throw new Error("Generated output not found.");
  const job = await getOwnedJob(db, output.job_id, userId);
  const { data: asset, error: assetError } = await db.from("media_assets").select("*").eq("id", output.asset_id).maybeSingle();
  if (assetError || !asset || asset.status !== "ready") throw new Error(assetError?.message || "Generated asset is unavailable.");
  return { output, job, asset };
}

async function listLibrary(db: any, userId: string, limit: number) {
  const { data: jobs, error: jobsError } = await db.from("media_generation_jobs").select("*")
    .eq("created_by", userId).eq("status", "succeeded").order("created_at", { ascending: false }).limit(limit);
  if (jobsError) throw new Error(jobsError.message);
  if (!jobs?.length) return [];
  const jobIds = jobs.map((job: any) => job.id);
  const projectIds = [...new Set(jobs.map((job: any) => job.project_id))];
  const [{ data: outputs, error: outputsError }, { data: attempts }, { data: projects }, { data: publications }] = await Promise.all([
    db.from("media_generation_outputs").select("*").in("job_id", jobIds),
    db.from("media_generation_attempts").select("job_id,execution_seconds,actual_cost_usd,gpu_count,attempt_number").in("job_id", jobIds).order("attempt_number", { ascending: false }),
    db.from("media_generation_projects").select("*").in("id", projectIds),
    db.from("scheduled_social_posts").select("*").in("source_generation_job_id", jobIds).order("created_at", { ascending: false }),
  ]);
  if (outputsError) throw new Error(outputsError.message);
  if (!outputs?.length) return [];
  const outputIds = outputs.map((output: any) => output.id);
  const { data: finishingJobs, error: finishingError } = await db.from("media_finishing_jobs").select("*").in("source_output_id", outputIds).order("created_at", { ascending: false });
  if (finishingError) throw new Error(finishingError.message);
  const assetIds = [...new Set((outputs || []).map((output: any) => output.asset_id))];
  const { data: assets, error: assetsError } = await db.from("media_assets").select("*").in("id", assetIds);
  if (assetsError) throw new Error(assetsError.message);
  const jobsById = new Map(jobs.map((job: any) => [job.id, job]));
  const projectsById = new Map((projects || []).map((project: any) => [project.id, project]));
  const assetsById = new Map((assets || []).map((asset: any) => [asset.id, asset]));
  const attemptByJob = new Map<string, any>();
  for (const attempt of attempts || []) if (!attemptByJob.has(attempt.job_id)) attemptByJob.set(attempt.job_id, attempt);
  const publicationsByOutput = new Map<string, any[]>();
  for (const publication of publications || []) publicationsByOutput.set(publication.source_generation_output_id, [...(publicationsByOutput.get(publication.source_generation_output_id) || []), publication]);
  const finishingBySource = new Map<string, any>();
  for (const finishing of finishingJobs || []) if (!finishingBySource.has(finishing.source_output_id)) finishingBySource.set(finishing.source_output_id, finishing);
  return Promise.all((outputs || []).map(async (output: any) => {
    const job = jobsById.get(output.job_id) as any;
    const asset = assetsById.get(output.asset_id) as any;
    const signed = asset ? await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 60) : { data: null };
    return {
      output_id: output.id,
      output_role: output.output_role,
      approved: output.approved,
      approved_at: output.approved_at || null,
      asset,
      job,
      project: projectsById.get(job.project_id) || null,
      attempt: attemptByJob.get(job.id) || null,
      publishing: publicationsByOutput.get(output.id) || [],
      signed_url: signed.data?.signedUrl || null,
      source_output_id: output.source_output_id || null,
      finishing: finishingBySource.get(output.id) || null,
    };
  }));
}

async function addEvent(db: any, jobId: string, eventType: string, values: Record<string, unknown> = {}) {
  const { error } = await db.from("media_generation_events").insert({ job_id: jobId, event_type: eventType, ...values });
  if (error) console.error("Could not record media generation event", { jobId, eventType, error: error.message });
}

async function dispatchJob(db: any, job: any, userId: string, operatorRole: string) {
  if (!["queued", "failed"].includes(job.status)) throw new Error(`Job cannot be dispatched from ${job.status}.`);
  if (job.attempt_count >= job.max_attempts) throw new Error("This job has used all retry attempts.");
  await assertDispatchAllowed(db, userId, operatorRole);

  const [{ data: model, error: modelError }, { data: inputRows, error: inputsError }] = await Promise.all([
    db.from("media_model_catalog").select("*").eq("id", job.model_id).eq("active", true).maybeSingle(),
    db.from("media_generation_job_inputs").select("input_role,position,metadata,media_assets(*)").eq("job_id", job.id).order("position"),
  ]);
  if (modelError || !model) throw new Error(modelError?.message || "Generation model is unavailable.");
  if (inputsError) throw new Error(inputsError.message);

  const signedInputs = await Promise.all((inputRows || []).map(async (row: any) => {
    const asset = row.media_assets;
    if (!asset || asset.project_id !== job.project_id || asset.status !== "ready") throw new Error(`Input asset for ${row.input_role} is unavailable.`);
    const { data, error } = await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 60 * 6);
    if (error || !data?.signedUrl) throw new Error(`Could not sign ${row.input_role} input.`);
    return { role: row.input_role, position: row.position, url: data.signedUrl, mime_type: asset.mime_type, metadata: row.metadata || {} };
  }));

  const attemptNumber = Number(job.attempt_count || 0) + 1;
  const outputPath = `${userId}/${job.project_id}/${job.id}/attempt-${attemptNumber}/output.mp4`;
  const { data: upload, error: uploadError } = await db.storage.from(BUCKET).createSignedUploadUrl(outputPath, { upsert: false });
  if (uploadError || !upload?.token) throw new Error(uploadError?.message || "Could not reserve the output upload.");

  const workerInput = {
    contract_version: "trellis.media-generation.v1",
    job: { id: job.id, task_type: job.task_type, prompt: job.prompt, negative_prompt: job.negative_prompt, parameters: { ...model.default_parameters, ...job.parameters } },
    model: { id: model.id, family: model.family, runtime: model.runtime },
    inputs: signedInputs,
    output: { bucket: BUCKET, path: outputPath, signed_upload_url: upload.signedUrl, signed_upload_token: upload.token, supabase_url: SUPABASE_URL, content_type: "video/mp4" },
  };

  const gpuCount = Number(model.runtime?.recommended_gpu_count || 1);
  const ratePerSecond = RUNPOD_COST_PER_SECOND;
  const estimatedMaxCost = ratePerSecond > 0 ? ratePerSecond * (RUNPOD_EXECUTION_TIMEOUT_MS / 1000) * gpuCount : null;
  const { data: attempt, error: attemptError } = await db.from("media_generation_attempts").insert({
    job_id: job.id,
    attempt_number: attemptNumber,
    provider: job.provider,
    status: "created",
    request_snapshot: {
      contract_version: workerInput.contract_version,
      model_id: model.id,
      task_type: job.task_type,
      input_roles: signedInputs.map(input => input.role),
      output_bucket: BUCKET,
      output_path: outputPath,
    },
    gpu_count: gpuCount,
    estimated_cost_usd: estimatedMaxCost,
  }).select("*").single();
  if (attemptError || !attempt) throw new Error(attemptError?.message || "Could not create generation attempt.");

  const { error: validatingError } = await db.from("media_generation_jobs")
    .update({ status: "validating", attempt_count: attemptNumber, error_code: null, error_message: null })
    .eq("id", job.id);
  if (validatingError) {
    const completedAt = new Date().toISOString();
    await Promise.all([
      db.from("media_generation_attempts").update({
        status: "failed",
        error_code: "dispatch_guardrail",
        error_message: "Another GPU generation job is already active.",
        completed_at: completedAt,
      }).eq("id", attempt.id),
      db.from("media_generation_jobs").update({
        status: "failed",
        attempt_count: attemptNumber,
        error_code: "dispatch_guardrail",
        error_message: "Another GPU generation job is already active.",
        completed_at: completedAt,
      }).eq("id", job.id),
    ]);
    throw new Error(validatingError.code === "23505" ? "Only one GPU generation job may be active per user." : validatingError.message);
  }
  await addEvent(db, job.id, "dispatch_started", { attempt_id: attempt.id, status: "validating", progress: 0 });

  try {
    if (job.provider !== "runpod") throw new Error(`Provider ${job.provider} is not configured yet.`);
    const providerJob = await submitRunPodJob(runPodConfig(job.model_id), workerInput, {
      executionTimeout: RUNPOD_EXECUTION_TIMEOUT_MS,
      ttl: RUNPOD_JOB_TTL_MS,
    });
    const now = new Date().toISOString();
    await Promise.all([
      db.from("media_generation_attempts").update({ provider_job_id: providerJob.id, status: "submitted", response_snapshot: { id: providerJob.id, status: providerJob.status } }).eq("id", attempt.id),
      db.from("media_generation_jobs").update({ provider_job_id: providerJob.id, status: "submitted", progress: 1, submitted_at: now, last_heartbeat_at: now }).eq("id", job.id),
    ]);
    await addEvent(db, job.id, "provider_submitted", { attempt_id: attempt.id, status: "submitted", progress: 1, details: { provider_job_id: providerJob.id } });
    return (await db.from("media_generation_jobs").select("*").eq("id", job.id).single()).data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider dispatch failed.";
    const now = new Date().toISOString();
    await Promise.all([
      db.from("media_generation_attempts").update({ status: "failed", error_code: "dispatch_failed", error_message: message, completed_at: now }).eq("id", attempt.id),
      db.from("media_generation_jobs").update({ status: "failed", error_code: "dispatch_failed", error_message: message, completed_at: now }).eq("id", job.id),
    ]);
    await addEvent(db, job.id, "dispatch_failed", { attempt_id: attempt.id, status: "failed", message });
    throw new Error(message);
  }
}

async function registerSuccessfulOutput(db: any, job: any, attempt: any, providerJob: any) {
  const expectedPath = attempt.request_snapshot?.output_path;
  const output = providerJob.output && typeof providerJob.output === "object" ? providerJob.output : {};
  const reportedPath = output.storage_path || output.path || expectedPath;
  if (!expectedPath || reportedPath !== expectedPath) throw new Error("Worker returned an unexpected output path.");

  const { data: existing } = await db.from("media_assets").select("*").eq("storage_bucket", BUCKET).eq("storage_path", expectedPath).maybeSingle();
  let asset = existing;
  if (!asset) {
    const { data, error } = await db.from("media_assets").insert({
      project_id: job.project_id,
      asset_type: "generated_video",
      role: "primary_output",
      storage_bucket: BUCKET,
      storage_path: expectedPath,
      mime_type: clean(output.mime_type || "video/mp4", 100),
      file_size_bytes: Number(output.file_size_bytes || 0) || null,
      duration_seconds: Number(output.duration_seconds || 0) || null,
      width: Number(output.width || 0) || null,
      height: Number(output.height || 0) || null,
      sha256: clean(output.sha256, 128) || null,
      status: "ready",
      metadata: { provider: job.provider, model_id: job.model_id, attempt_number: attempt.attempt_number },
    }).select("*").single();
    if (error || !data) throw new Error(error?.message || "Could not register generated output.");
    asset = data;
  }
  await db.from("media_generation_outputs").upsert({ job_id: job.id, attempt_id: attempt.id, asset_id: asset.id, output_role: "primary" }, { onConflict: "job_id,asset_id,output_role" });
  return asset;
}

async function refreshJob(db: any, job: any) {
  if (!["submitted", "running", "cancel_requested"].includes(job.status) || !job.provider_job_id) return job;
  if (job.provider !== "runpod") throw new Error(`Provider ${job.provider} is not configured yet.`);
  const providerJob = await getRunPodJob(runPodConfig(job.model_id), job.provider_job_id);
  const next = runPodStatusToJobStatus(providerJob.status);
  const { data: attempt } = await db.from("media_generation_attempts").select("*").eq("job_id", job.id).eq("attempt_number", job.attempt_count).single();
  if (!attempt) throw new Error("Current generation attempt is missing.");
  const now = new Date().toISOString();
  const executionSeconds = providerJob.executionTime == null ? null : Number(providerJob.executionTime) / 1000;

  if (next === "succeeded") {
    const asset = await registerSuccessfulOutput(db, job, attempt, providerJob);
    const rate = RUNPOD_COST_PER_SECOND;
    const actualCost = executionSeconds != null && rate > 0 ? executionSeconds * rate * Number(attempt.gpu_count || 1) : null;
    await Promise.all([
      db.from("media_generation_attempts").update({ status: "succeeded", response_snapshot: { id: providerJob.id, status: providerJob.status, output: providerJob.output || null }, execution_seconds: executionSeconds, actual_cost_usd: actualCost, completed_at: now }).eq("id", attempt.id),
      db.from("media_generation_jobs").update({ status: "succeeded", progress: 100, completed_at: now, last_heartbeat_at: now, error_code: null, error_message: null }).eq("id", job.id),
      executionSeconds == null ? Promise.resolve() : db.from("media_usage_ledger").insert({ job_id: job.id, attempt_id: attempt.id, provider: job.provider, model_id: job.model_id, metric: "gpu_seconds", quantity: executionSeconds, unit: "seconds", cost_usd: actualCost }),
    ]);
    await addEvent(db, job.id, "generation_succeeded", { attempt_id: attempt.id, status: "succeeded", progress: 100, details: { asset_id: asset.id } });
  } else if (["failed", "cancelled"].includes(next)) {
    const message = clean(providerJob.error || (next === "cancelled" ? "Generation cancelled." : "GPU worker failed."), 2000);
    await Promise.all([
      db.from("media_generation_attempts").update({ status: next, response_snapshot: { id: providerJob.id, status: providerJob.status }, execution_seconds: executionSeconds, error_code: next === "failed" ? "provider_failed" : null, error_message: message, completed_at: now }).eq("id", attempt.id),
      db.from("media_generation_jobs").update({ status: next, progress: next === "cancelled" ? job.progress : 0, error_code: next === "failed" ? "provider_failed" : null, error_message: message, completed_at: now, last_heartbeat_at: now }).eq("id", job.id),
    ]);
    await addEvent(db, job.id, `generation_${next}`, { attempt_id: attempt.id, status: next, message });
  } else {
    const progress = next === "running" ? Math.max(5, Math.min(95, Number((providerJob.output as any)?.progress || job.progress || 5))) : Math.max(1, job.progress || 1);
    await Promise.all([
      db.from("media_generation_attempts").update({ status: next === "running" ? "running" : "submitted", started_at: next === "running" ? (attempt.started_at || now) : attempt.started_at, response_snapshot: { id: providerJob.id, status: providerJob.status } }).eq("id", attempt.id),
      db.from("media_generation_jobs").update({ status: next, progress, started_at: next === "running" ? (job.started_at || now) : job.started_at, last_heartbeat_at: now }).eq("id", job.id),
    ]);
  }
  return (await db.from("media_generation_jobs").select("*").eq("id", job.id).single()).data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

  const userDb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: userError } = await userDb.auth.getUser();
  if (userError || !user) return json({ error: "Invalid or expired session." }, 401);
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: operator } = await db.from("trellis_users").select("id,role,status").eq("auth_user_id", user.id).maybeSingle();
  if (!operator || operator.status !== "active") return json({ error: "An active Trellis operator account is required." }, 403);
  const body = await request.json().catch(() => ({}));

  try {
    if (body.action === "get_configuration") {
      return json({ configuration: {
        generation_enabled: MEDIA_GENERATION_ENABLED,
        role_allowed: MEDIA_GENERATION_ALLOWED_ROLES.has(operator.role),
        cost_tracking_configured: RUNPOD_COST_PER_SECOND > 0,
        max_active_jobs_per_user: MAX_ACTIVE_JOBS_PER_USER,
        max_daily_dispatches_per_user: MAX_DAILY_DISPATCHES_PER_USER,
        execution_timeout_seconds: Math.round(RUNPOD_EXECUTION_TIMEOUT_MS / 1000),
        cost_per_gpu_second: RUNPOD_COST_PER_SECOND > 0 ? RUNPOD_COST_PER_SECOND : null,
        publishing_handoff_enabled: MEDIA_PUBLISHING_HANDOFF_ENABLED,
      } });
    }
    if (body.action === "list_library") {
      return json({ items: await listLibrary(db, user.id, Math.min(100, Math.max(1, Number(body.limit || 50)))) });
    }
    if (body.action === "create_finishing_job") {
      const finishing = body.finishing && typeof body.finishing === "object" ? body.finishing : {};
      const owned = await getOwnedOutput(db, clean(finishing.source_output_id, 80), user.id);
      if (owned.output.output_role !== "primary") throw new Error("Create text finishes from the untouched original video.");
      if (!String(owned.asset.mime_type || "").startsWith("video/")) throw new Error("Only video outputs can be finished.");
      const { cues, style } = validateFinishingPlan(finishing, Number(owned.asset.duration_seconds || 0));
      const idempotencyKey = clean(finishing.idempotency_key, 160);
      if (!idempotencyKey) throw new Error("A finishing idempotency key is required.");
      const { data: active } = await db.from("media_finishing_jobs").select("id").eq("source_output_id", owned.output.id).in("status", ["queued", "running", "cancel_requested"]).limit(1);
      if (active?.length) throw new Error("This video already has a finishing render in progress.");
      const { data, error } = await db.from("media_finishing_jobs").insert({
        project_id: owned.job.project_id,
        source_output_id: owned.output.id,
        source_asset_id: owned.asset.id,
        created_by: user.id,
        text_cues: cues,
        style,
        idempotency_key: idempotencyKey,
      }).select("*").single();
      if (error?.code === "23505") {
        const { data: existing } = await db.from("media_finishing_jobs").select("*").eq("created_by", user.id).eq("idempotency_key", idempotencyKey).single();
        return json({ finishing_job: existing, duplicate: true });
      }
      if (error || !data) throw new Error(error?.message || "Could not queue the final video.");
      await addEvent(db, owned.job.id, "finishing_queued", { status: "queued", progress: 0, details: { finishing_job_id: data.id, source_output_id: owned.output.id } });
      return json({ finishing_job: data }, 201);
    }
    if (body.action === "approve_output") {
      const owned = await getOwnedOutput(db, clean(body.output_id, 80), user.id);
      if (owned.job.status !== "succeeded") throw new Error("Only completed outputs can be approved.");
      const now = new Date().toISOString();
      const { data, error } = await db.from("media_generation_outputs")
        .update({ approved: true, approved_at: now, approved_by: user.id }).eq("id", owned.output.id).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not approve the generated output.");
      await addEvent(db, owned.job.id, "output_approved", { attempt_id: owned.output.attempt_id, status: "succeeded", progress: 100, details: { output_id: owned.output.id, asset_id: owned.asset.id } });
      return json({ output: data });
    }
    if (body.action === "schedule_output") {
      if (!MEDIA_PUBLISHING_HANDOFF_ENABLED) throw new Error("Generated-media publishing handoff is paused.");
      const publication = body.publication && typeof body.publication === "object" ? body.publication : {};
      const owned = await getOwnedOutput(db, clean(publication.output_id, 80), user.id);
      if (!owned.output.approved) throw new Error("Approve this generated output before scheduling it.");
      const platform = clean(publication.platform, 20).toLowerCase();
      if (!new Set(["instagram", "tiktok"]).has(platform)) throw new Error("Generated video can currently publish to Instagram or TikTok.");
      const caption = sanitizeMediaText(clean(publication.caption, 2200));
      if (!caption) throw new Error("A publishing caption is required.");
      const scheduledFor = new Date(String(publication.scheduled_for || ""));
      if (Number.isNaN(scheduledFor.getTime())) throw new Error("Choose a valid publishing date and time.");
      const nowMs = Date.now();
      if (scheduledFor.getTime() < nowMs - 5 * 60_000) throw new Error("Publishing time cannot be in the past.");
      if (scheduledFor.getTime() > nowMs + 30 * 24 * 60 * 60_000) throw new Error("Schedule generated media no more than 30 days ahead.");
      const branchId = clean(publication.branch_id, 80);
      const { data: branch, error: branchError } = await db.from("branches").select("id,slug,is_active").eq("id", branchId).maybeSingle();
      if (branchError || !branch?.is_active) throw new Error(branchError?.message || "Choose an active Trellis brand.");
      if (!["owner", "admin"].includes(operator.role)) {
        const { data: assignment } = await db.from("trellis_user_branches").select("id")
          .eq("trellis_user_id", operator.id).eq("branch_id", branch.id).maybeSingle();
        if (!assignment) throw new Error("You are not assigned to that brand.");
      }
      const idempotencyKey = clean(publication.idempotency_key, 160);
      if (!idempotencyKey) throw new Error("A publishing idempotency key is required.");
      const row = {
        branch_id: branch.id,
        branch_slug: branch.slug,
        platform,
        caption,
        media_type: "video",
        media_urls: [],
        scheduled_for: scheduledFor.toISOString(),
        status: "scheduled",
        source: "media_generation",
        created_by: user.id,
        source_media_asset_id: owned.asset.id,
        source_generation_job_id: owned.job.id,
        source_generation_output_id: owned.output.id,
        idempotency_key: idempotencyKey,
        creative_template: owned.job.model_id,
        creative_meta: { project_id: owned.job.project_id, task_type: owned.job.task_type, model_id: owned.job.model_id },
      };
      const { data: post, error: postError } = await db.from("scheduled_social_posts").insert(row).select("*").single();
      if (postError?.code === "23505") {
        const { data: existing } = await db.from("scheduled_social_posts").select("*").eq("created_by", user.id).eq("idempotency_key", idempotencyKey).single();
        return json({ post: existing, duplicate: true });
      }
      if (postError || !post) throw new Error(postError?.message || "Could not add the video to the publishing queue.");
      await addEvent(db, owned.job.id, "publishing_scheduled", { attempt_id: owned.output.attempt_id, status: "succeeded", progress: 100, details: { output_id: owned.output.id, scheduled_post_id: post.id, platform, scheduled_for: post.scheduled_for } });
      return json({ post }, 201);
    }
    if (body.action === "list_models") {
      const { data, error } = await db.from("media_model_catalog").select("*").eq("active", true).order("display_name");
      if (error) throw new Error(error.message);
      return json({ models: data || [] });
    }
    if (body.action === "create_project") {
      const name = clean(body.name, 160);
      if (!name) throw new Error("Project name is required.");
      if (body.branch_id && !["owner", "admin"].includes(operator.role)) {
        const { data: assignment } = await db.from("trellis_user_branches").select("id").eq("trellis_user_id", operator.id).eq("branch_id", body.branch_id).maybeSingle();
        if (!assignment) throw new Error("You are not assigned to that branch.");
      }
      const { data, error } = await db.from("media_generation_projects").insert({ created_by: user.id, branch_id: body.branch_id || null, name, description: clean(body.description, 2000) || null }).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not create media project.");
      return json({ project: data }, 201);
    }
    if (body.action === "list_projects") {
      const { data, error } = await userDb.from("media_generation_projects").select("*").order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return json({ projects: data || [] });
    }
    if (body.action === "create_upload") {
      await getOwnedProject(db, body.project_id, user.id);
      const filename = clean(body.filename, 180).replace(/[^a-zA-Z0-9._-]/g, "-");
      const mimeType = clean(body.mime_type, 100);
      const assetType = clean(body.asset_type, 40);
      if (!filename || !mimeType || !assetType) throw new Error("filename, mime_type, and asset_type are required.");
      const assetId = crypto.randomUUID();
      const path = `${user.id}/${body.project_id}/uploads/${assetId}-${filename}`;
      const { data: asset, error: assetError } = await db.from("media_assets").insert({ id: assetId, project_id: body.project_id, character_id: body.character_id || null, asset_type: assetType, role: clean(body.role, 80) || null, storage_bucket: BUCKET, storage_path: path, mime_type: mimeType, status: "uploading" }).select("*").single();
      if (assetError || !asset) throw new Error(assetError?.message || "Could not register upload.");
      const { data: upload, error: uploadError } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
      if (uploadError || !upload) throw new Error(uploadError?.message || "Could not create upload URL.");
      return json({ asset, upload }, 201);
    }
    if (body.action === "complete_upload") {
      const { data: asset } = await db.from("media_assets").select("*").eq("id", body.asset_id).maybeSingle();
      if (!asset) throw new Error("Upload asset not found.");
      await getOwnedProject(db, asset.project_id, user.id);
      const slash = asset.storage_path.lastIndexOf("/");
      const folder = asset.storage_path.slice(0, slash);
      const filename = asset.storage_path.slice(slash + 1);
      const { data: objects, error: objectError } = await db.storage.from(asset.storage_bucket).list(folder, { search: filename, limit: 2 });
      if (objectError || !objects?.some((object: any) => object.name === filename)) throw new Error("Upload has not reached storage yet.");
      const { data, error } = await db.from("media_assets").update({ status: "ready", file_size_bytes: Number(body.file_size_bytes || 0) || null, duration_seconds: Number(body.duration_seconds || 0) || null, width: Number(body.width || 0) || null, height: Number(body.height || 0) || null }).eq("id", asset.id).select("*").single();
      if (error) throw new Error(error.message);
      return json({ asset: data });
    }
    if (body.action === "create_job") {
      const input = validateCreateMediaJob(body.job);
      await getOwnedProject(db, input.project_id, user.id);
      await assertDispatchAllowed(db, user.id, operator.role);
      const { data: model } = await db.from("media_model_catalog").select("*").eq("id", input.model_id).eq("active", true).maybeSingle();
      if (!model || !Array.isArray(model.task_types) || !model.task_types.includes(input.task_type)) throw new Error("The selected model does not support this job type.");
      const assetIds = (input.inputs || []).map(item => item.asset_id);
      if (assetIds.length) {
        const { data: assets, error } = await db.from("media_assets").select("id,project_id,status").in("id", assetIds);
        if (error || assets?.length !== new Set(assetIds).size || assets.some((asset: any) => asset.project_id !== input.project_id || asset.status !== "ready")) throw new Error("One or more input assets are unavailable for this project.");
      }
      const { data: job, error: jobError } = await db.from("media_generation_jobs").insert({
        project_id: input.project_id, scene_id: input.scene_id || null, created_by: user.id, model_id: input.model_id,
        provider: input.provider || model.provider_hint || "runpod", task_type: input.task_type, prompt: input.prompt,
        negative_prompt: input.negative_prompt || null, parameters: input.parameters || {}, idempotency_key: input.idempotency_key || null,
      }).select("*").single();
      if (jobError || !job) {
        if (jobError?.code === "23505" && input.idempotency_key) {
          const { data: existing } = await db.from("media_generation_jobs").select("*").eq("created_by", user.id).eq("idempotency_key", input.idempotency_key).single();
          return json({ job: existing, duplicate: true });
        }
        throw new Error(jobError?.message || "Could not create generation job.");
      }
      if (input.inputs?.length) {
        const { error } = await db.from("media_generation_job_inputs").insert(input.inputs.map(item => ({ job_id: job.id, asset_id: item.asset_id, input_role: item.input_role, position: item.position || 0, metadata: item.metadata || {} })));
        if (error) {
          await db.from("media_generation_jobs").update({ status: "failed", error_code: "input_registration_failed", error_message: error.message, completed_at: new Date().toISOString() }).eq("id", job.id);
          throw new Error(error.message);
        }
      }
      await addEvent(db, job.id, "job_created", { status: "queued", progress: 0 });
      return json({ job: await dispatchJob(db, job, user.id, operator.role) }, 201);
    }
    if (body.action === "list_jobs") {
      await getOwnedProject(db, body.project_id, user.id);
      const { data, error } = await db.from("media_generation_jobs").select("*").eq("project_id", body.project_id).order("created_at", { ascending: false }).limit(Math.min(100, Math.max(1, Number(body.limit || 50))));
      if (error) throw new Error(error.message);
      return json({ jobs: data || [] });
    }
    if (body.action === "get_job" || body.action === "refresh_job") {
      let job = await getOwnedJob(db, body.job_id, user.id);
      if (body.action === "refresh_job") job = await refreshJob(db, job);
      const [{ data: inputs }, { data: attempts }, { data: outputs }, { data: events }] = await Promise.all([
        db.from("media_generation_job_inputs").select("*,media_assets(*)").eq("job_id", job.id),
        db.from("media_generation_attempts").select("*").eq("job_id", job.id).order("attempt_number", { ascending: false }),
        db.from("media_generation_outputs").select("*,media_assets(*)").eq("job_id", job.id),
        db.from("media_generation_events").select("*").eq("job_id", job.id).order("created_at", { ascending: false }).limit(100),
      ]);
      const signedOutputs = await Promise.all((outputs || []).map(async (output: any) => ({ ...output, signed_url: (await db.storage.from(output.media_assets.storage_bucket).createSignedUrl(output.media_assets.storage_path, 60 * 60)).data?.signedUrl || null })));
      return json({ job, inputs: inputs || [], attempts: attempts || [], outputs: signedOutputs, events: events || [] });
    }
    if (body.action === "cancel_job") {
      const job = await getOwnedJob(db, body.job_id, user.id);
      if (["succeeded", "failed", "cancelled"].includes(job.status)) return json({ job });
      await db.from("media_generation_jobs").update({ status: "cancel_requested" }).eq("id", job.id);
      if (job.provider === "runpod" && job.provider_job_id) await cancelRunPodJob(runPodConfig(job.model_id), job.provider_job_id);
      await addEvent(db, job.id, "cancel_requested", { status: "cancel_requested", progress: job.progress });
      return json({ job: (await db.from("media_generation_jobs").select("*").eq("id", job.id).single()).data });
    }
    if (body.action === "retry_job") {
      const job = await getOwnedJob(db, body.job_id, user.id);
      if (job.status !== "failed") throw new Error("Only failed jobs can be retried.");
      if (job.attempt_count >= job.max_attempts) throw new Error("This job has used all retry attempts.");
      await db.from("media_generation_jobs").update({ status: "queued", progress: 0, provider_job_id: null, completed_at: null, error_code: null, error_message: null }).eq("id", job.id);
      return json({ job: await dispatchJob(db, { ...job, status: "queued", provider_job_id: null }, user.id, operator.role) });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media generation request failed.";
    console.error("media-generation action failed", { action: body.action || "unknown", user_id: user.id, message });
    return json({ error: message }, 400);
  }
});
