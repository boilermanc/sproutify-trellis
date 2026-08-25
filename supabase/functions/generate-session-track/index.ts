import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STORAGE_JWT = Deno.env.get("STORAGE_JWT") || SERVICE_KEY;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const BUCKET = "music-sessions";
const STALE_MINUTES = Number(Deno.env.get("MUSIC_TRACK_STALE_MINUTES") || "25");
const WAIT_BETWEEN_MS = Number(Deno.env.get("MUSIC_TRACK_WAIT_MS") || "8000");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

type Track = {
  id: string;
  session_id: string;
  track_number: number;
  title: string;
  prompt: string;
  genre: string | null;
  mood: string | null;
  vocal_style: string | null;
  duration_seconds: number | null;
};

function extractAudioBase64(result: any): string | null {
  if (result?.output_audio?.data) return result.output_audio.data;
  if (Array.isArray(result?.steps)) {
    for (const step of result.steps) {
      const content = step?.model_output?.content || step?.content || [];
      const audio = (Array.isArray(content) ? content : []).find((c) => c?.type === "audio" && c?.data);
      if (audio?.data) return audio.data;
    }
  }
  return null;
}

async function getGeminiKey(supabase: any): Promise<string> {
  if (GEMINI_API_KEY) return GEMINI_API_KEY;
  const { data, error } = await supabase
    .from("tenant_secrets")
    .select("gemini_api_key")
    .eq("organization_id", ORG_ID)
    .single();
  if (error || !data?.gemini_api_key) throw new Error("No Gemini/Lyria API key configured");
  return data.gemini_api_key;
}

function formatTargetDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${remainder} seconds`;
  if (!remainder) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ${remainder} seconds`;
}

function buildDurationAwarePrompt(track: Track): { model: string; input: string } {
  const duration = track.duration_seconds || 180;
  const useClip = duration === 30;
  const model = useClip ? "lyria-3-clip-preview" : "lyria-3-pro-preview";
  const durationDirection = useClip
    ? "Create a complete 30-second clip."
    : `Create an approximately ${formatTargetDuration(duration)} piece. Shape the arrangement to finish naturally near ${formatTargetDuration(duration)}; the requested runtime is a target, not permission to cut off the ending.`;
  const vocalDirection = track.vocal_style === "instrumental"
    ? "PURE INSTRUMENTAL MUSIC. Arrange the entire piece exclusively for musical instruments. Express every melody, harmony, rhythm, and texture through non-vocal instruments."
    : track.vocal_style === "mostly_instrumental"
      ? "Keep the piece predominantly instrumental; any voice must be sparse and secondary."
      : track.vocal_style === "vocals"
        ? "Vocals are allowed and should follow the supplied creative direction."
        : "Follow the supplied vocal direction conservatively.";
  return { model, input: `${durationDirection} ${vocalDirection} ${track.prompt}` };
}

async function generateAudio(track: Track, key: string): Promise<Uint8Array> {
  const { model, input } = buildDurationAwarePrompt(track);
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model,
      input,
      response_format: { type: "audio" },
    }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Lyria ${res.status}: ${JSON.stringify(result).slice(0, 500)}`);
  const b64 = extractAudioBase64(result);
  if (!b64) throw new Error(`No audio returned. Keys: ${Object.keys(result).join(", ")}`);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function uploadTrack(supabase: any, track: Track, bytes: Uint8Array): Promise<{ path: string; url: string }> {
  const path = `${track.session_id}/tracks/${track.id}.mp3`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  if (error) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        apikey: STORAGE_JWT,
        Authorization: `Bearer ${STORAGE_JWT}`,
        "Content-Type": "audio/mpeg",
        "x-upsert": "true",
      },
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });
    if (!res.ok) throw new Error(`Storage upload failed (${error.message}) / raw ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return { path, url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}` };
}

async function resetStaleTracks(supabase: any, sessionId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("trellis_music_tracks")
    .update({ status: "queued", error_message: null, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("status", "generating")
    .is("audio_url", null)
    .lt("updated_at", cutoff)
    .select("id");
  if (error) throw new Error(`Failed to reset stale tracks: ${error.message}`);
  return data?.length || 0;
}

async function markSessionIfDone(supabase: any, sessionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("trellis_music_tracks")
    .select("status")
    .eq("session_id", sessionId);
  if (error) throw new Error(`Failed to inspect session tracks: ${error.message}`);
  const tracks = data || [];
  const hasQueued = tracks.some((t: { status: string }) => t.status === "queued" || t.status === "generating");
  const hasCompleted = tracks.some((t: { status: string }) => t.status === "completed");
  if (!hasQueued && hasCompleted) {
    await supabase.from("trellis_music_sessions")
      .update({ status: "review", updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    return true;
  }
  return false;
}

async function triggerNext(sessionId: string, branch: string | null): Promise<void> {
  if (WAIT_BETWEEN_MS > 0) await new Promise((resolve) => setTimeout(resolve, WAIT_BETWEEN_MS));
  await fetch(`${SUPABASE_URL}/functions/v1/generate-session-track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ session_id: sessionId, branch, continue_queue: true }),
  }).catch((e) => console.error("next track trigger failed:", e?.message || e));
}

async function processClaimedTrack(supabase: any, track: Track, branch: string | null, continueQueue: boolean): Promise<void> {
  try {
    const key = await getGeminiKey(supabase);
    const bytes = await generateAudio(track, key);
    const { path, url } = await uploadTrack(supabase, track, bytes);
    const { error: updateError } = await supabase.from("trellis_music_tracks").update({
      status: "completed",
      storage_bucket: BUCKET,
      storage_path: path,
      audio_url: url,
      audio_mime_type: "audio/mpeg",
      file_size_bytes: bytes.byteLength,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq("id", track.id);
    if (updateError) throw new Error(`Track update failed: ${updateError.message}`);

    const done = await markSessionIfDone(supabase, track.session_id);
    if (continueQueue && !done) await triggerNext(track.session_id, branch);
  } catch (trackError) {
    const message = (trackError as Error).message;
    console.error(`track ${track.id} failed:`, message);
    await supabase.from("trellis_music_tracks").update({
      status: "failed",
      error_message: message.slice(0, 700),
      updated_at: new Date().toISOString(),
    }).eq("id", track.id);
    const done = await markSessionIfDone(supabase, track.session_id);
    if (continueQueue && !done) await triggerNext(track.session_id, branch);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: true });

  const body = await req.json().catch(() => ({}));
  const sessionId = body.session_id || null;
  const trackId = body.track_id || null;
  const branch = body.branch || null;
  const continueQueue = body.continue_queue !== false && !trackId;
  if (!sessionId && !trackId) return json({ ok: false, error: "session_id or track_id required" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    if (sessionId) {
      await resetStaleTracks(supabase, sessionId);
      await supabase.from("trellis_music_sessions")
        .update({ status: "generating", error_message: null, updated_at: new Date().toISOString() })
        .eq("id", sessionId);
    }

    const { data: claimed, error: claimError } = await supabase.rpc("claim_trellis_music_track", {
      p_session_id: sessionId,
      p_track_id: trackId,
    });
    if (claimError) throw new Error(`Track claim failed: ${claimError.message}`);
    const track = Array.isArray(claimed) ? claimed[0] as Track | undefined : claimed as Track | undefined;

    if (!track) {
      const done = sessionId ? await markSessionIfDone(supabase, sessionId) : false;
      return json({ ok: true, claimed: false, done });
    }

    const work = processClaimedTrack(supabase, track, branch, continueQueue);
    EdgeRuntime.waitUntil(work);
    return json({ ok: true, claimed: true, track_id: track.id, track_number: track.track_number, status: "generating", continue_queue: continueQueue });
  } catch (e) {
    const message = (e as Error).message;
    if (sessionId) {
      await supabase.from("trellis_music_sessions")
        .update({ error_message: message.slice(0, 700), updated_at: new Date().toISOString() })
        .eq("id", sessionId);
    }
    return json({ ok: false, error: message }, 500);
  }
});
