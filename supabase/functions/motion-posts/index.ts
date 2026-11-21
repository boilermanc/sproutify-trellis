import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const XAI_BASE = "https://api.x.ai/v1";
const MODEL = "grok-imagine-video-1.5";
const BUCKET = "motion-posts";
const RENDER_WEBHOOK = Deno.env.get("MOTION_POST_RENDER_WEBHOOK") || "https://n8n.sproutify.app/webhook/trellis-episode-video";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "content-type": "application/json" },
});

const clean = (value: unknown, limit: number) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
const cleanMultiline = (value: unknown, limit: number) => String(value || "").replace(/\r\n/g, "\n").trim().slice(0, limit);
const HEX = /^#[0-9a-f]{6}$/i;
const FONT_IDS = new Set(["cormorant", "abril", "bebas", "playfair", "oswald", "montserrat", "inter", "jetbrains"]);

function finishingInput(body: any, duration: number) {
  if (!Array.isArray(body.text_cues) || body.text_cues.length < 1 || body.text_cues.length > 20) {
    throw new Error("Add between 1 and 20 timed text messages.");
  }
  const cues = body.text_cues.map((raw: any, index: number) => {
    const text = cleanMultiline(raw?.text, 180);
    const start = Number(raw?.start_seconds);
    const end = Number(raw?.end_seconds);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.01) {
      throw new Error(`Text message ${index + 1} has invalid text or timing.`);
    }
    return {
      id: clean(raw?.id, 80) || crypto.randomUUID(), text,
      start_seconds: Number(start.toFixed(2)), end_seconds: Number(end.toFixed(2)),
      position: ["top", "center", "bottom"].includes(raw?.position) ? raw.position : "center",
      animation: ["fade", "slide_up", "word_reveal"].includes(raw?.animation) ? raw.animation : "fade",
    };
  });
  const raw = body.style || {};
  const fontId = FONT_IDS.has(raw.font_id) ? raw.font_id : "inter";
  const fontSize = Math.min(0.14, Math.max(0.035, Number(raw.font_size) || 0.07));
  const weight = [400, 600, 700, 800, 900].includes(Number(raw.font_weight)) ? Number(raw.font_weight) : 800;
  const opacity = Math.min(0.9, Math.max(0, Number(raw.background_opacity) || 0));
  return { cues, style: {
    font_id: fontId, font_size: fontSize, font_weight: weight,
    color: HEX.test(raw.color) ? raw.color : "#ffffff",
    background_color: HEX.test(raw.background_color) ? raw.background_color : "#000000",
    background_opacity: opacity, uppercase: raw.uppercase === true, shadow: raw.shadow !== false,
  } };
}

// Prompts are persisted and sent to xAI, so scrub the same high-risk patterns
// Trellis protects elsewhere. This intentionally preserves ordinary names and
// creative direction while removing credentials and direct contact details.
export const sanitizeMotionPrompt = (value: unknown) => clean(value, 1200)
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
  .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE]")
  .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]")
  .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[CARD]")
  .replace(/\b(?:sk|xai|key|token)[-_][A-Za-z0-9_-]{20,}\b/gi, "[SECRET]");

async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { response: json({ error: "Missing Authorization header" }, 401) };
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { response: json({ error: "Not authenticated" }, 401) };
  return { user: data.user };
}

async function xaiKey(db: any) {
  const env = clean(Deno.env.get("XAI_API_KEY"), 500);
  if (env) return env;
  const { data } = await db.from("tenant_secrets").select("xai_api_key").eq("organization_id", ORG_ID).maybeSingle();
  return clean(data?.xai_api_key, 500);
}

function estimatedCost(duration: number, resolution: string) {
  const rate = resolution === "1080p" ? 0.25 : resolution === "480p" ? 0.08 : 0.14;
  return Number((duration * rate + 0.01).toFixed(2));
}

async function signedAssetUrl(db: any, asset: any) {
  const { data, error } = await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 60);
  if (error || !data?.signedUrl) throw new Error("Could not authorize the selected audio asset.");
  return data.signedUrl;
}

async function resolveOwnedAudio(db: any, userId: string, sourceType: string, sourceId: string) {
  if (sourceType === "music_generation") {
    const { data } = await db.from("music_generations").select("id,title,duration_seconds,audio_url,created_by,status")
      .eq("id", sourceId).eq("created_by", userId).eq("status", "completed").maybeSingle();
    if (!data?.audio_url) throw new Error("That Rekkrd track is no longer available.");
    return { id: data.id, source_type: sourceType, title: data.title, duration_seconds: data.duration_seconds, audio_url: data.audio_url };
  }

  if (sourceType !== "studio_track" && sourceType !== "studio_master") throw new Error("Unknown audio source.");
  const expected = sourceType === "studio_track" ? "track_audio" : "master_mp3";
  const { data: asset } = await db.from("studio_assets").select("id,album_id,track_id,asset_type,storage_bucket,storage_path,duration_seconds,status")
    .eq("id", sourceId).eq("asset_type", expected).eq("status", "active").maybeSingle();
  if (!asset) throw new Error("That Studio audio asset is no longer available.");
  const { data: album } = await db.from("studio_albums").select("id,title,artist_name,created_by").eq("id", asset.album_id).eq("created_by", userId).maybeSingle();
  if (!album) throw new Error("You do not have access to that Studio audio asset.");
  let title = album.title;
  if (asset.track_id) {
    const { data: track } = await db.from("studio_tracks").select("title").eq("id", asset.track_id).maybeSingle();
    title = track?.title || title;
  }
  return {
    id: asset.id,
    source_type: sourceType,
    title,
    artist: album.artist_name,
    duration_seconds: asset.duration_seconds,
    audio_url: await signedAssetUrl(db, asset),
  };
}

async function listAudio(db: any, userId: string) {
  const options: any[] = [];
  const { data: albums } = await db.from("studio_albums").select("id,title,artist_name").eq("created_by", userId).neq("status", "archived");
  const albumMap = new Map((albums || []).map((album: any) => [album.id, album]));
  const albumIds = [...albumMap.keys()];
  if (albumIds.length) {
    const { data: assets } = await db.from("studio_assets")
      .select("id,album_id,track_id,asset_type,storage_bucket,storage_path,duration_seconds,status")
      .in("album_id", albumIds).in("asset_type", ["track_audio", "master_mp3"]).eq("status", "active")
      .order("created_at", { ascending: false }).limit(100);
    const trackIds = (assets || []).map((asset: any) => asset.track_id).filter(Boolean);
    const { data: tracks } = trackIds.length
      ? await db.from("studio_tracks").select("id,title").in("id", trackIds)
      : { data: [] };
    const trackMap = new Map((tracks || []).map((track: any) => [track.id, track.title]));
    for (const asset of assets || []) {
      const album: any = albumMap.get(asset.album_id);
      if (!album) continue;
      try {
        options.push({
          id: asset.id,
          source_type: asset.asset_type === "master_mp3" ? "studio_master" : "studio_track",
          title: asset.track_id ? trackMap.get(asset.track_id) || album.title : `${album.title} — full master`,
          artist: album.artist_name,
          duration_seconds: asset.duration_seconds,
          audio_url: await signedAssetUrl(db, asset),
        });
      } catch { /* skip missing storage objects */ }
    }
  }
  const { data: generations } = await db.from("music_generations")
    .select("id,title,duration_seconds,audio_url").eq("created_by", userId).eq("status", "completed")
    .not("audio_url", "is", null).order("created_at", { ascending: false }).limit(50);
  for (const track of generations || []) options.push({ ...track, source_type: "music_generation", artist: "Rekkrd" });
  return options;
}

async function uploadProviderVideo(db: any, userId: string, jobId: string, providerUrl: string) {
  const response = await fetch(providerUrl);
  if (!response.ok) throw new Error(`Could not download generated video (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const path = `${userId}/${jobId}/final.mp4`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`Could not store generated video: ${error.message}`);
  return { path, url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: operator } = await db.from("trellis_users").select("role,status")
    .eq("auth_user_id", userId).eq("status", "active")
    .in("role", ["owner", "admin", "operator"]).maybeSingle();
  if (!operator) return json({ error: "Marketing operator access required" }, 403);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  try {
    if (body.op === "list_audio") return json({ ok: true, tracks: await listAudio(db, userId) });

    if (body.op === "queue_finish") {
      const jobId = clean(body.job_id, 80);
      const idempotencyKey = clean(body.idempotency_key, 120);
      if (!idempotencyKey) return json({ error: "A finishing idempotency key is required." }, 400);
      const { data: job } = await db.from("motion_post_jobs").select("*")
        .eq("id", jobId).eq("created_by", userId).maybeSingle();
      if (!job || !["ready", "published"].includes(job.status) || !job.output_path) {
        return json({ error: "Only a completed Motion Post can be finished." }, 400);
      }
      let input;
      try { input = finishingInput(body, Number(job.duration_seconds || 1)); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid text settings." }, 400); }
      const row = {
        motion_post_job_id: job.id, created_by: userId, text_cues: input.cues, style: input.style,
        source_bucket: job.output_bucket || BUCKET, source_path: job.output_path,
        output_bucket: BUCKET, idempotency_key: idempotencyKey,
      };
      const { data: created, error } = await db.from("motion_post_finishing_jobs").insert(row).select("*").maybeSingle();
      if (error) {
        const { data: existing } = await db.from("motion_post_finishing_jobs").select("*")
          .eq("created_by", userId).eq("idempotency_key", idempotencyKey).maybeSingle();
        if (existing) return json({ ok: true, finishing_job: existing });
        throw new Error(`Could not queue text rendering: ${error.message}`);
      }
      return json({ ok: true, finishing_job: created });
    }

    if (body.op === "queue_publish") {
      const jobId = clean(body.job_id, 80);
      const finishId = clean(body.finishing_job_id, 80);
      const idempotencyKey = clean(body.idempotency_key, 120);
      const caption = cleanMultiline(body.caption, 2200);
      const scheduledFor = new Date(String(body.scheduled_for || ""));
      if (!idempotencyKey || !caption) return json({ error: "A caption and publish idempotency key are required." }, 400);
      if (!Number.isFinite(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() + 60_000) {
        return json({ error: "Schedule the Reel at least one minute in the future." }, 400);
      }
      const { data: job } = await db.from("motion_post_jobs").select("*")
        .eq("id", jobId).eq("created_by", userId).maybeSingle();
      if (!job || !["ready", "published"].includes(job.status) || !job.output_url || !job.branch_id) {
        return json({ error: "This Motion Post is not ready for the publisher." }, 400);
      }
      let mediaUrl = job.output_url;
      let sourceFinishId: string | null = null;
      if (finishId) {
        const { data: finish } = await db.from("motion_post_finishing_jobs").select("*")
          .eq("id", finishId).eq("motion_post_job_id", job.id).eq("created_by", userId)
          .eq("status", "succeeded").maybeSingle();
        if (!finish?.output_url) return json({ error: "That text-finished version is not ready." }, 400);
        mediaUrl = finish.output_url;
        sourceFinishId = finish.id;
      }
      const row = {
        branch_id: job.branch_id, branch_slug: job.branch_slug, platform: "instagram",
        caption, media_type: "video", media_urls: [mediaUrl], scheduled_for: scheduledFor.toISOString(),
        status: "scheduled", source: "motion_posts", created_by: userId,
        source_motion_post_id: job.id, source_motion_finish_id: sourceFinishId,
        idempotency_key: idempotencyKey,
      };
      const { data: created, error } = await db.from("scheduled_social_posts").insert(row).select("*").maybeSingle();
      if (error) {
        const { data: existing } = await db.from("scheduled_social_posts").select("*")
          .eq("created_by", userId).eq("idempotency_key", idempotencyKey).maybeSingle();
        if (existing) return json({ ok: true, publication: existing });
        throw new Error(`Could not queue the Reel: ${error.message}`);
      }
      return json({ ok: true, publication: created });
    }

    if (body.op === "mark_publish_status") {
      const jobId = clean(body.job_id, 80);
      const status = body.status === "published" ? "published" : body.status === "publishing" ? "publishing" : "ready";
      const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "published") patch.published_at = new Date().toISOString();
      if (body.error_message) patch.error_message = clean(body.error_message, 500);
      const { data: job } = await db.from("motion_post_jobs").update(patch)
        .eq("id", jobId).eq("created_by", userId).select("*").maybeSingle();
      if (!job) return json({ error: "Motion post not found." }, 404);
      return json({ ok: true, job });
    }

    if (body.op === "generate") {
      const prompt = sanitizeMotionPrompt(body.prompt);
      const sourcePath = clean(body.source_path, 500);
      const title = clean(body.title, 120) || "Rekkrd motion post";
      const caption = clean(body.caption, 2200);
      const duration = [5, 7, 10, 15].includes(Number(body.duration_seconds)) ? Number(body.duration_seconds) : 7;
      const resolution = ["480p", "720p", "1080p"].includes(body.resolution) ? body.resolution : "720p";
      if (prompt.length < 12) return json({ error: "Describe the movement you want." }, 400);
      if (!sourcePath.startsWith(`${userId}/`)) return json({ error: "The source image path is not owned by this user." }, 403);
      const { data: sourceObject } = await db.storage.from(BUCKET).list(sourcePath.split("/").slice(0, -1).join("/"), {
        search: sourcePath.split("/").at(-1), limit: 1,
      });
      if (!sourceObject?.some((item: any) => sourcePath.endsWith(`/${item.name}`))) return json({ error: "Source image not found." }, 404);

      let audio: any = null;
      if (body.audio_source_type && body.audio_source_id) {
        audio = await resolveOwnedAudio(db, userId, body.audio_source_type, body.audio_source_id);
      }
      const { data: branch } = body.branch_id
        ? await db.from("branches").select("id,slug").eq("id", body.branch_id).maybeSingle()
        : { data: null };
      const { data: sourceSigned, error: signError } = await db.storage.from(BUCKET).createSignedUrl(sourcePath, 15 * 60);
      if (signError || !sourceSigned?.signedUrl) throw new Error("Could not authorize the source image.");

      const key = await xaiKey(db);
      if (!key) return json({ error: "No xAI API key is configured. Add it in Settings → API Key." }, 400);
      const id = crypto.randomUUID();
      const sourceUrl = db.storage.from(BUCKET).getPublicUrl(sourcePath).data.publicUrl;
      const outputPath = `${userId}/${id}/final.mp4`;
      const { error: insertError } = await db.from("motion_post_jobs").insert({
        id, organization_id: ORG_ID, created_by: userId,
        branch_id: branch?.id || null, branch_slug: branch?.slug || "rekkrd",
        title, prompt, duration_seconds: duration, resolution, status: "queued", progress: 2,
        source_bucket: BUCKET, source_path: sourcePath, source_url: sourceUrl,
        audio_source_type: audio?.source_type || null, audio_source_id: audio?.id || null,
        audio_title: audio?.title || null, audio_url: audio?.audio_url || null,
        audio_start_seconds: Math.max(0, Number(body.audio_start_seconds) || 0),
        caption: caption || null, output_bucket: BUCKET, output_path: outputPath,
        cost_estimate: estimatedCost(duration, resolution),
      });
      if (insertError) throw new Error(`Could not create motion job: ${insertError.message}`);

      const response = await fetch(`${XAI_BASE}/videos/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL, prompt, duration, aspect_ratio: "9:16", resolution,
          image: { url: sourceSigned.signedUrl },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.request_id) {
        const message = payload?.error?.message || payload?.error || `xAI returned ${response.status}`;
        await db.from("motion_post_jobs").update({ status: "failed", error_message: String(message).slice(0, 500), updated_at: new Date().toISOString() }).eq("id", id);
        return json({ error: message }, 502);
      }
      const { data: job } = await db.from("motion_post_jobs").update({
        status: "generating", progress: 8, provider_request_id: payload.request_id, updated_at: new Date().toISOString(),
      }).eq("id", id).select("*").single();
      return json({ ok: true, job });
    }

    if (body.op === "poll") {
      const jobId = clean(body.job_id, 80);
      const { data: job } = await db.from("motion_post_jobs").select("*").eq("id", jobId).eq("created_by", userId).maybeSingle();
      if (!job) return json({ error: "Motion post not found." }, 404);
      if (job.status !== "generating") return json({ ok: true, job });
      const key = await xaiKey(db);
      if (!key) return json({ error: "No xAI API key is configured." }, 400);
      const response = await fetch(`${XAI_BASE}/videos/${job.provider_request_id}`, { headers: { Authorization: `Bearer ${key}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `xAI status returned ${response.status}`);
      if (["failed", "expired"].includes(payload.status)) {
        const message = payload?.error?.message || payload?.error || `Generation ${payload.status}`;
        const { data: failed } = await db.from("motion_post_jobs").update({ status: "failed", progress: 100, error_message: String(message).slice(0, 500), updated_at: new Date().toISOString() }).eq("id", job.id).select("*").single();
        return json({ ok: true, job: failed });
      }
      if (payload.status !== "done") {
        const progress = Math.max(job.progress || 8, Math.min(85, Number(payload.progress) || (job.progress || 8) + 3));
        const { data: pending } = await db.from("motion_post_jobs").update({ progress, updated_at: new Date().toISOString() }).eq("id", job.id).select("*").single();
        return json({ ok: true, job: pending });
      }

      const providerUrl = payload?.video?.url;
      if (!providerUrl) throw new Error("xAI completed without returning a video URL.");
      const ticks = Number(payload?.usage?.cost_in_usd_ticks);
      const actual = Number.isFinite(ticks) && ticks > 0 ? ticks / 1e10 : job.cost_estimate;
      if (!job.audio_url) {
        const stored = await uploadProviderVideo(db, userId, job.id, providerUrl);
        const { data: ready } = await db.from("motion_post_jobs").update({
          status: "ready", progress: 100, generated_video_url: providerUrl,
          output_path: stored.path, output_url: stored.url, cost_actual: actual,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", job.id).select("*").single();
        return json({ ok: true, job: ready });
      }

      const { data: mixing } = await db.from("motion_post_jobs").update({
        status: "mixing", progress: 88, generated_video_url: providerUrl,
        cost_actual: actual, updated_at: new Date().toISOString(),
      }).eq("id", job.id).select("*").single();
      const render = await fetch(RENDER_WEBHOOK, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline: "motion_post", job_id: job.id, user_id: userId,
          source_video_url: providerUrl, audio_url: job.audio_url,
          audio_start_seconds: Number(job.audio_start_seconds) || 0,
          duration_seconds: job.duration_seconds, storage_bucket: BUCKET,
          storage_path: job.output_path,
        }),
      });
      if (!render.ok) {
        const message = `Motion render worker returned ${render.status}`;
        const { data: failed } = await db.from("motion_post_jobs").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", job.id).select("*").single();
        return json({ ok: true, job: failed });
      }
      return json({ ok: true, job: mixing });
    }

    return json({ error: `Unknown operation: ${body.op}` }, 400);
  } catch (error) {
    console.error("[motion-posts]", error);
    return json({ error: error instanceof Error ? error.message : "Motion post operation failed." }, 500);
  }
});
