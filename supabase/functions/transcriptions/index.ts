import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "transcription-audio";
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const clean = (value: unknown, max = 500) => String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const sanitizePII = (value: string) => value
  .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[CARD REDACTED]")
  .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN REDACTED]")
  .replace(/\b(?:sk|pk|api)[-_][A-Za-z0-9_-]{20,}\b/g, "[TOKEN REDACTED]");

async function owned(db: any, id: string, userId: string) {
  const { data, error } = await db.from("transcription_jobs").select("*").eq("id", id).eq("created_by", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Transcription not found or you do not own it.");
  return data;
}

function normalizeSegments(result: any) {
  const source = Array.isArray(result?.segments) ? result.segments : [];
  return source.map((segment: any, index: number) => ({
    id: String(segment.id ?? index + 1),
    speaker: clean(segment.speaker || segment.speaker_label || "", 80) || undefined,
    start: Math.max(0, Number(segment.start ?? segment.start_seconds ?? 0) || 0),
    end: Math.max(0, Number(segment.end ?? segment.end_seconds ?? 0) || 0),
    text: sanitizePII(clean(segment.text, 10000)),
  })).filter((segment: any) => segment.text && segment.end >= segment.start);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization") || "";
  const userDb = createClient(URL, ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user } } = await userDb.auth.getUser();
  if (!user) return json({ error: "Sign in to use Transcription Studio." }, 401);
  const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const body = await request.json();
    const action = clean(body.action, 40);
    if (action === "list") {
      const { data, error } = await db.from("transcription_jobs").select("*").eq("created_by", user.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return json({ jobs: data || [] });
    }
    if (action === "create_upload") {
      const title = clean(body.title || body.filename, 180);
      const filename = clean(body.filename, 240);
      const mimeType = clean(body.mime_type, 100).toLowerCase();
      const size = Number(body.file_size_bytes);
      const mode = body.mode === "diarized" ? "diarized" : "standard";
      if (!title || !filename || !Number.isSafeInteger(size) || size < 1 || size > 104857600) throw new Error("Choose a valid file smaller than 100 MB.");
      if (!/^(audio|video)\//.test(mimeType)) throw new Error("Only audio and video uploads can be transcribed.");
      const id = crypto.randomUUID();
      const extension = filename.includes(".") ? filename.split(".").pop()!.replace(/[^a-z0-9]/gi, "").slice(0, 8) : "audio";
      const path = `${user.id}/${id}/source.${extension || "audio"}`;
      const model = mode === "diarized" ? "gpt-4o-transcribe-diarize" : "gpt-4o-mini-transcribe";
      const { data: job, error } = await db.from("transcription_jobs").insert({ id, created_by: user.id, title, original_filename: filename, storage_path: path, mime_type: mimeType, file_size_bytes: size, mode, model }).select("*").single();
      if (error) throw new Error(error.message);
      const { data: upload, error: uploadError } = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (uploadError || !upload?.token) { await db.from("transcription_jobs").delete().eq("id", id); throw new Error(uploadError?.message || "Could not reserve the upload."); }
      return json({ job, upload: { path, token: upload.token } });
    }
    if (action === "transcribe") {
      const job = await owned(db, clean(body.job_id, 80), user.id);
      if (!["uploaded", "failed"].includes(job.status)) throw new Error(`This file cannot be transcribed from ${job.status}.`);
      await db.from("transcription_jobs").update({ status: "processing", error_message: null, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
      try {
        const [{ data: audio, error: audioError }, { data: secret }] = await Promise.all([
          db.storage.from(BUCKET).download(job.storage_path),
          db.from("tenant_secrets").select("openai_api_key").eq("organization_id", ORG_ID).maybeSingle(),
        ]);
        if (audioError || !audio) throw new Error(audioError?.message || "Uploaded audio could not be read.");
        const apiKey = Deno.env.get("OPENAI_API_KEY") || secret?.openai_api_key;
        if (!apiKey) throw new Error("Add an OpenAI API key in Trellis Settings before transcribing.");
        const form = new FormData();
        form.append("file", new File([audio], job.original_filename, { type: job.mime_type }));
        form.append("model", job.model);
        if (job.mode === "diarized") {
          form.append("response_format", "diarized_json");
          form.append("chunking_strategy", "auto");
        } else {
          form.append("response_format", "verbose_json");
          form.append("timestamp_granularities[]", "segment");
        }
        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(140000) });
        const result = await response.json();
        if (!response.ok) throw new Error(clean(result?.error?.message || `Provider returned HTTP ${response.status}.`, 500));
        const segments = normalizeSegments(result);
        const transcript = sanitizePII(clean(result.text || segments.map((segment: any) => `${segment.speaker ? `${segment.speaker}: ` : ""}${segment.text}`).join("\n"), 200000));
        if (!transcript) throw new Error("The provider returned an empty transcript.");
        const duration = Number(result.duration || Math.max(0, ...segments.map((segment: any) => segment.end))) || null;
        const { data: completed, error } = await db.from("transcription_jobs").update({ status: "completed", transcript_text: transcript, segments, duration_seconds: duration, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).eq("created_by", user.id).select("*").single();
        if (error) throw new Error(error.message);
        return json({ job: completed });
      } catch (error) {
        const message = clean(error instanceof Error ? error.message : "Transcription failed.", 500);
        await db.from("transcription_jobs").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", job.id).eq("created_by", user.id);
        throw new Error(message);
      }
    }
    if (action === "update") {
      const job = await owned(db, clean(body.job_id, 80), user.id);
      const title = clean(body.title, 180);
      const transcript = sanitizePII(String(body.transcript_text || "").trim()).slice(0, 200000);
      if (!title || !transcript || job.status !== "completed") throw new Error("A completed transcript requires a title and text.");
      const { data, error } = await db.from("transcription_jobs").update({ title, transcript_text: transcript, updated_at: new Date().toISOString() }).eq("id", job.id).eq("created_by", user.id).select("*").single();
      if (error) throw new Error(error.message);
      return json({ job: data });
    }
    if (action === "delete") {
      const job = await owned(db, clean(body.job_id, 80), user.id);
      const { error: storageError } = await db.storage.from(BUCKET).remove([job.storage_path]);
      if (storageError) throw new Error(storageError.message);
      const { error } = await db.from("transcription_jobs").delete().eq("id", job.id).eq("created_by", user.id);
      if (error) throw new Error(error.message);
      return json({ deleted: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: clean(error instanceof Error ? error.message : "Transcription request failed.", 500) }, 400);
  }
});
