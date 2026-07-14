import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const LEGACY_TRACK_WORKER = "generate-session-track";

function fallbackTrackPlan(album: any, trackNumber: number) {
  const title = `${album.title} — ${trackNumber === 1 ? 'Opening Signal' : `Movement ${trackNumber}`}`;
  const prompt = `Original ${album.genre || 'instrumental'} piece with ${album.mood || 'a cohesive'} feel, ${album.vocal_direction === 'instrumental' ? 'instrumental arrangement' : album.vocal_direction}, clean studio production, ${72 + ((trackNumber - 1) % 5) * 4} BPM.`;
  return { title, prompt };
}

async function planAlbumTrack(db: any, album: any, trackNumber: number) {
  const fallback = fallbackTrackPlan(album, trackNumber);
  const key = Deno.env.get("GEMINI_API_KEY") || (await db.from("tenant_secrets").select("gemini_api_key").eq("organization_id", ORG_ID).maybeSingle()).data?.gemini_api_key;
  if (!key) return fallback;
  const prompt = `Create one original, cohesive next track for an AI music album. Return only JSON: {"title":"...","prompt":"..."}.
Album title: ${album.title}
Fictional artist: ${album.artist_name}
Genre: ${album.genre || 'open'}
Mood: ${album.mood || 'open'}
Era: ${album.era || 'open'}
Setting: ${album.theme || 'open'}
Vocals: ${album.vocal_direction}
Track number: ${trackNumber}
Requirements: title is short and original; prompt is one concise 15–30 word sentence describing instruments, style, mood, and BPM; no real artists, songs, brands, franchises, lyrics, or unsafe themes.`;
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const plan = JSON.parse(raw);
    if (!plan?.title || !plan?.prompt) return fallback;
    return { title: String(plan.title).slice(0, 120), prompt: String(plan.prompt).replace(/\s+/g, " ").trim().slice(0, 400) };
  } catch {
    return fallback;
  }
}

async function getOwnedAlbum(db: any, albumId: string, userId: string) {
  const { data, error } = await db.from("studio_albums").select("*").eq("id", albumId).eq("organization_id", ORG_ID).eq("created_by", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Album not found.");
  return data;
}

async function invokeLegacyWorker(sessionId: string, branch: string | null) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${LEGACY_TRACK_WORKER}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ session_id: sessionId, branch, continue_queue: false }),
  });
  if (!response.ok) throw new Error(`Legacy music worker failed to start: ${await response.text()}`);
}

async function trackWithAsset(db: any, trackId: string) {
  const { data: track, error } = await db.from("studio_tracks").select("*").eq("id", trackId).single();
  if (error) throw new Error(error.message);
  const { data: asset } = await db.from("studio_assets").select("*").eq("track_id", trackId).eq("asset_type", "track_audio").order("version", { ascending: false }).limit(1).maybeSingle();
  let audio_url: string | null = null;
  if (asset) {
    const { data: signed } = await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 15);
    audio_url = signed?.signedUrl || null;
  }
  return { ...track, asset, audio_url };
}

async function syncLegacyTrack(db: any, studioTrackId: string) {
  const { data: studioTrack, error } = await db.from("studio_tracks").select("*").eq("id", studioTrackId).single();
  if (error || !studioTrack) throw new Error(error?.message || "Track not found.");
  if (!studioTrack.legacy_generation_id || studioTrack.studio_asset_id) return trackWithAsset(db, studioTrackId);
  const { data: legacy, error: legacyError } = await db.from("trellis_music_tracks").select("*").eq("id", studioTrack.legacy_generation_id).single();
  if (legacyError || !legacy) throw new Error(legacyError?.message || "Legacy generation record not found.");
  if (legacy.status === "failed") {
    await db.from("studio_tracks").update({ review_status: "failed", rejection_reason: legacy.error_message || "Generation failed", updated_at: new Date().toISOString() }).eq("id", studioTrackId);
    await db.from("studio_jobs").update({ status: "failed", error_message: legacy.error_message || "Generation failed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("track_id", studioTrackId).eq("job_type", "track_generation").in("status", ["queued", "processing"]);
    return trackWithAsset(db, studioTrackId);
  }
  if (legacy.status !== "completed" || !legacy.storage_path || !legacy.storage_bucket) return trackWithAsset(db, studioTrackId);
  const { data: bytes, error: downloadError } = await db.storage.from(legacy.storage_bucket).download(legacy.storage_path);
  if (downloadError || !bytes) throw new Error(downloadError?.message || "Could not retrieve generated audio.");
  const path = `studio/${ORG_ID}/albums/${studioTrack.album_id}/tracks/${studioTrack.id}.mp3`;
  const { error: uploadError } = await db.storage.from("studio-assets").upload(path, bytes, { contentType: legacy.audio_mime_type || "audio/mpeg", upsert: true });
  if (uploadError) throw new Error(`Could not register generated audio: ${uploadError.message}`);
  const { data: asset, error: assetError } = await db.from("studio_assets").insert({ album_id: studioTrack.album_id, track_id: studioTrack.id, asset_type: "track_audio", storage_bucket: "studio-assets", storage_path: path, mime_type: legacy.audio_mime_type || "audio/mpeg", file_size: legacy.file_size_bytes, duration_seconds: legacy.duration_seconds, status: "active", metadata_json: { legacy_generation_id: legacy.id, legacy_session_id: legacy.session_id } }).select("*").single();
  if (assetError || !asset) throw new Error(assetError?.message || "Could not create Studio asset.");
  await db.from("studio_tracks").update({ generation_provider: legacy.provider, generation_model: legacy.model, duration_seconds: legacy.duration_seconds, source_audio_path: path, studio_asset_id: asset.id, review_status: "pending_review", updated_at: new Date().toISOString() }).eq("id", studioTrackId);
  await db.from("studio_jobs").update({ status: "completed", progress: 100, output_json: { legacy_generation_id: legacy.id, studio_asset_id: asset.id }, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("track_id", studioTrackId).eq("job_type", "track_generation").in("status", ["queued", "processing"]);
  return trackWithAsset(db, studioTrackId);
}

async function queueStudioTrackGeneration(db: any, album: any, userId: string, studioTrack: any) {
  const duration = Number(studioTrack.duration_seconds);
  const { data: legacySession, error: sessionError } = await db.from("trellis_music_sessions").insert({ created_by: userId, title: `[Studio Adapter] ${album.title} — ${studioTrack.title}`, target_duration_seconds: duration, genre: album.genre, mood: album.mood, track_count: 1, avg_track_length_seconds: duration, status: "planned" }).select("*").single();
  if (sessionError || !legacySession) throw new Error(sessionError?.message || "Could not initialize the legacy generation adapter.");
  const { data: legacyTrack, error: legacyError } = await db.from("trellis_music_tracks").insert({ session_id: legacySession.id, track_number: 1, title: studioTrack.title, prompt: studioTrack.prompt, genre: album.genre, mood: album.mood, vocal_style: album.vocal_direction, duration_seconds: duration, status: "queued" }).select("*").single();
  if (legacyError || !legacyTrack) throw new Error(legacyError?.message || "Could not queue legacy generation.");
  const { error: updateError } = await db.from("studio_tracks").update({ legacy_generation_id: legacyTrack.id, review_status: "regenerating", generation_provider: "google", generation_model: duration <= 45 ? "lyria-3-clip-preview" : "lyria-3-pro-preview", updated_at: new Date().toISOString() }).eq("id", studioTrack.id);
  if (updateError) throw new Error(updateError.message);
  const { error: jobError } = await db.from("studio_jobs").insert({ album_id: album.id, track_id: studioTrack.id, job_type: "track_generation", status: "processing", progress: 5, provider: "legacy_lyria_adapter", attempt_count: 1, input_json: { legacy_session_id: legacySession.id, legacy_generation_id: legacyTrack.id } });
  if (jobError) throw new Error(jobError.message);
  await invokeLegacyWorker(legacySession.id, null);
  return trackWithAsset(db, studioTrack.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Authentication required" }, 401);
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Authentication required" }, 401);
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: flag, error: flagError } = await db.from("studio_feature_flags").select("enabled, enabled_for_user_ids").eq("organization_id", ORG_ID).eq("key", "studio_music_enabled").single();
  if (flagError) return json({ error: `Studio is not configured: ${flagError.message}` }, 503);
  const userEnabled = Array.isArray(flag.enabled_for_user_ids) && flag.enabled_for_user_ids.includes(user.id);
  if (!flag.enabled && !userEnabled) return json({ error: "Trellis Studio Albums is not enabled for this account." }, 403);
  const body = await req.json().catch(() => ({}));
  if (body.action === "list") {
    const { data, error } = await db.from("studio_albums").select("*").eq("organization_id", ORG_ID).eq("created_by", user.id).order("updated_at", { ascending: false });
    return error ? json({ error: error.message }, 500) : json({ albums: data || [] });
  }
  if (body.action === "create") {
    const album = body.album || {};
    if (!album.title?.trim() || !album.artist_name?.trim() || !Number.isInteger(album.target_duration_seconds) || album.target_duration_seconds <= 0) return json({ error: "Title, artist, and a positive target duration are required." }, 400);
    const { data, error } = await db.from("studio_albums").insert({ organization_id: ORG_ID, created_by: user.id, title: album.title.trim(), artist_name: album.artist_name.trim(), description: album.description?.trim() || null, genre: album.genre?.trim() || null, mood: album.mood?.trim() || null, era: album.era?.trim() || null, theme: album.theme?.trim() || null, vocal_direction: album.vocal_direction || "instrumental", target_duration_seconds: album.target_duration_seconds }).select("*").single();
    return error ? json({ error: error.message }, 500) : json({ album: data }, 201);
  }
  try {
    if (body.action === "tracks") {
      await getOwnedAlbum(db, body.album_id, user.id);
      const { data, error } = await db.from("studio_tracks").select("*").eq("album_id", body.album_id).order("track_number");
      if (error) throw new Error(error.message);
      const tracks = await Promise.all((data || []).map((track: any) => syncLegacyTrack(db, track.id)));
      return json({ tracks });
    }
    if (body.action === "plan_track") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { data: last } = await db.from("studio_tracks").select("track_number").eq("album_id", album.id).order("track_number", { ascending: false }).limit(1).maybeSingle();
      return json({ track: await planAlbumTrack(db, album, (last?.track_number || 0) + 1) });
    }
    if (body.action === "create_planned_track") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const input = body.track || {};
      const duration = Number(input.duration_seconds);
      if (!input.title?.trim() || !input.prompt?.trim() || !Number.isInteger(duration) || duration < 15 || duration > 165) throw new Error("Track title, prompt, and a 15–165 second duration are required.");
      const { data: last } = await db.from("studio_tracks").select("track_number").eq("album_id", album.id).order("track_number", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await db.from("studio_tracks").insert({ album_id: album.id, track_number: (last?.track_number || 0) + 1, title: input.title.trim(), prompt: input.prompt.trim(), duration_seconds: duration, vocal_direction: album.vocal_direction, review_status: "planned" }).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not add planned track.");
      return json({ track: data }, 201);
    }
    if (body.action === "update_planned_track") {
      const input = body.track || {};
      const duration = Number(input.duration_seconds);
      if (!body.track_id || !input.title?.trim() || !input.prompt?.trim() || !Number.isInteger(duration) || duration < 15 || duration > 165) throw new Error("Track title, prompt, and a 15–165 second duration are required.");
      const { data: track, error } = await db.from("studio_tracks").select("*").eq("id", body.track_id).single();
      if (error || !track) throw new Error("Track not found.");
      await getOwnedAlbum(db, track.album_id, user.id);
      if (!["planned", "failed", "rejected"].includes(track.review_status) || (track.review_status !== "failed" && track.legacy_generation_id)) throw new Error("Only planned tracks, rejected tracks, or failed tracks can be edited.");
      const retryingFailedTrack = track.review_status === "failed";
      const { error: updateError } = await db.from("studio_tracks").update({ title: input.title.trim(), prompt: input.prompt.trim(), duration_seconds: duration, legacy_generation_id: retryingFailedTrack ? null : track.legacy_generation_id, generation_provider: retryingFailedTrack ? null : track.generation_provider, generation_model: retryingFailedTrack ? null : track.generation_model, rejection_reason: retryingFailedTrack ? null : track.rejection_reason, review_status: retryingFailedTrack ? "planned" : track.review_status, updated_at: new Date().toISOString() }).eq("id", track.id);
      if (updateError) throw new Error(updateError.message);
      return json({ track: await trackWithAsset(db, track.id) });
    }
    if (body.action === "delete_planned_track") {
      const { data: track, error } = await db.from("studio_tracks").select("*").eq("id", body.track_id).single();
      if (error || !track) throw new Error("Track not found.");
      await getOwnedAlbum(db, track.album_id, user.id);
      if (track.legacy_generation_id || !["planned", "failed", "rejected"].includes(track.review_status)) throw new Error("Only tracks without generated audio can be deleted.");
      const { error: deleteError } = await db.from("studio_tracks").delete().eq("id", track.id);
      if (deleteError) throw new Error(deleteError.message);
      const { data: laterTracks, error: laterError } = await db.from("studio_tracks").select("id, track_number").eq("album_id", track.album_id).gt("track_number", track.track_number).order("track_number");
      if (laterError) throw new Error(laterError.message);
      for (const later of laterTracks || []) {
        const { error: renumberError } = await db.from("studio_tracks").update({ track_number: later.track_number - 1, updated_at: new Date().toISOString() }).eq("id", later.id);
        if (renumberError) throw new Error(renumberError.message);
      }
      return json({ deleted_track_id: track.id });
    }
    if (body.action === "approve_planned_track") {
      const { data: studioTrack, error } = await db.from("studio_tracks").select("*").eq("id", body.track_id).single();
      if (error || !studioTrack) throw new Error("Track not found.");
      await getOwnedAlbum(db, studioTrack.album_id, user.id);
      if (studioTrack.review_status !== "planned" || studioTrack.legacy_generation_id) throw new Error("Only an ungenerated planned track can be approved for generation.");
      const { error: updateError } = await db.from("studio_tracks").update({ review_status: "locked", updated_at: new Date().toISOString() }).eq("id", studioTrack.id);
      if (updateError) throw new Error(updateError.message);
      return json({ track: await trackWithAsset(db, studioTrack.id) });
    }
    if (body.action === "approve_all_planned_tracks") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { data: tracks, error } = await db.from("studio_tracks").update({ review_status: "locked", updated_at: new Date().toISOString() }).eq("album_id", album.id).eq("review_status", "planned").is("legacy_generation_id", null).select("*");
      if (error) throw new Error(error.message);
      return json({ tracks: tracks || [] });
    }
    if (body.action === "generate_planned_track") {
      const { data: studioTrack, error } = await db.from("studio_tracks").select("*").eq("id", body.track_id).single();
      if (error || !studioTrack) throw new Error("Track not found.");
      const album = await getOwnedAlbum(db, studioTrack.album_id, user.id);
      if (studioTrack.legacy_generation_id || studioTrack.review_status !== "locked") throw new Error("Only a plan approved for generation can be queued.");
      if (!studioTrack.title?.trim() || !studioTrack.prompt?.trim() || !Number.isInteger(Number(studioTrack.duration_seconds)) || studioTrack.duration_seconds < 15 || studioTrack.duration_seconds > 165) throw new Error("This planned track needs a title, prompt, and a 15–165 second duration before generation.");
      return json({ track: await queueStudioTrackGeneration(db, album, user.id, studioTrack) }, 201);
    }
    if (body.action === "generate_all_approved_tracks") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { data: approvedPlans, error } = await db.from("studio_tracks").select("*").eq("album_id", album.id).eq("review_status", "locked").is("legacy_generation_id", null).order("track_number");
      if (error) throw new Error(error.message);
      if (!approvedPlans?.length) throw new Error("Approve at least one planned track before generating.");
      const tracks = [];
      for (const track of approvedPlans) tracks.push(await queueStudioTrackGeneration(db, album, user.id, track));
      return json({ tracks }, 201);
    }
    if (body.action === "generate_one") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const input = body.track || {};
      const duration = Number(input.duration_seconds || 30);
      if (!input.title?.trim() || !input.prompt?.trim() || !Number.isInteger(duration) || duration < 15 || duration > 165) throw new Error("Track title, prompt, and a 15–165 second duration are required.");
      const { data: last } = await db.from("studio_tracks").select("track_number").eq("album_id", album.id).order("track_number", { ascending: false }).limit(1).maybeSingle();
      const trackNumber = (last?.track_number || 0) + 1;
      const { data: studioTrack, error: studioError } = await db.from("studio_tracks").insert({ album_id: album.id, track_number: trackNumber, title: input.title.trim(), prompt: input.prompt.trim(), duration_seconds: duration, review_status: "regenerating", generation_provider: "google", generation_model: duration <= 45 ? "lyria-3-clip-preview" : "lyria-3-pro-preview" }).select("*").single();
      if (studioError || !studioTrack) throw new Error(studioError?.message || "Could not create Studio track.");
      return json({ track: await queueStudioTrackGeneration(db, album, user.id, studioTrack) }, 201);
    }
    if (body.action === "review_track") {
      const { data: track, error } = await db.from("studio_tracks").select("album_id").eq("id", body.track_id).single();
      if (error || !track) throw new Error("Track not found.");
      await getOwnedAlbum(db, track.album_id, user.id);
      const reviewStatus = body.approved ? "approved" : "rejected";
      const { error: updateError } = await db.from("studio_tracks").update({ review_status: reviewStatus, approved_at: body.approved ? new Date().toISOString() : null, rejection_reason: body.approved ? null : String(body.rejection_reason || "Rejected during review").slice(0, 500), updated_at: new Date().toISOString() }).eq("id", body.track_id);
      if (updateError) throw new Error(updateError.message);
      return json({ track: await trackWithAsset(db, body.track_id) });
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Studio track operation failed." }, 400);
  }
  return json({ error: "Unknown action" }, 400);
});
