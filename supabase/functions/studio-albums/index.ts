import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const LEGACY_TRACK_WORKER = "generate-session-track";
const MAX_CONCURRENT_STUDIO_TRACKS = 3;
const STALE_STUDIO_TRACK_MS = 25 * 60 * 1000;
const MUSIC_STITCH_WEBHOOK = "https://n8n.sproutify.app/webhook/trellis-music-stitch";
const VIDEO_RENDER_WEBHOOK = Deno.env.get("STUDIO_VIDEO_RENDER_WEBHOOK") || Deno.env.get("STUDIO_VIDEO_WEBHOOK") || "https://n8n.sproutify.app/webhook/trellis-episode-video";
const STUDIO_PUBLISH_WEBHOOK = Deno.env.get("STUDIO_PUBLISH_WEBHOOK") || "https://n8n.sproutify.app/webhook/trellis-studio-album-publish";
const configuredImageModel = Deno.env.get("IMAGE_MODEL") || "";
const IMAGE_MODEL = configuredImageModel.startsWith("imagen-") ? "gemini-3.1-flash-image" : configuredImageModel || "gemini-3.1-flash-image";
const IMAGE_EDIT_MODEL = Deno.env.get("IMAGE_EDIT_MODEL") || "gemini-3.1-flash-image";
const VALID_COVER_FONTS = new Set(["cormorant", "abril", "bebas", "playfair", "oswald", "montserrat", "inter", "jetbrains"]);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const cleanText = (value: unknown, limit: number) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};
const chapterTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
};
const publicationTags = (value: unknown) => {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of source) {
    const tag = cleanText(raw, 45).replace(/^#+/, "").replace(/[,|;]/g, " ").trim();
    const key = tag.toLowerCase();
    if (tag.length < 2 || seen.has(key)) continue;
    tags.push(tag); seen.add(key);
    if (tags.length === 15) break;
  }
  return tags;
};

function fallbackTrackPlan(album: any, trackNumber: number) {
  const title = `${album.title} — ${trackNumber === 1 ? 'Opening Signal' : `Movement ${trackNumber}`}`;
  const instruments = Array.isArray(album.style_profile?.instruments) ? album.style_profile.instruments.slice(0, 4).join(', ') : 'genre-appropriate ensemble';
  const prompt = `Original ${album.genre || 'instrumental'} piece with ${instruments}, ${album.mood || 'a cohesive'} feel, ${album.vocal_direction === 'instrumental' ? 'instrumental arrangement' : album.vocal_direction}, ${72 + ((trackNumber - 1) % 5) * 4} BPM.`;
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

async function recoverStudioTrackQueue(db: any, albumId: string) {
  const { data: studioTracks, error: studioError } = await db.from("studio_tracks")
    .select("legacy_generation_id")
    .eq("album_id", albumId)
    .eq("review_status", "regenerating")
    .not("legacy_generation_id", "is", null);
  if (studioError) throw new Error(studioError.message);
  const legacyIds = (studioTracks || []).map((track: any) => track.legacy_generation_id).filter(Boolean);
  if (!legacyIds.length) return 0;

  const { data: legacyTracks, error: legacyError } = await db.from("trellis_music_tracks")
    .select("id,session_id,status,updated_at")
    .in("id", legacyIds);
  if (legacyError) throw new Error(legacyError.message);

  const cutoff = Date.now() - STALE_STUDIO_TRACK_MS;
  const active = (legacyTracks || []).filter((track: any) => track.status === "generating" && new Date(track.updated_at).getTime() >= cutoff);
  const stale = (legacyTracks || []).filter((track: any) => track.status === "generating" && new Date(track.updated_at).getTime() < cutoff);
  const queued = (legacyTracks || []).filter((track: any) => track.status === "queued");
  const availableSlots = Math.max(0, MAX_CONCURRENT_STUDIO_TRACKS - active.length);
  const dispatch = [...stale, ...queued].slice(0, availableSlots);
  await Promise.all(dispatch.map((track: any) => invokeLegacyWorker(track.session_id, null)));
  return dispatch.length;
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
  return { ...track, legacy_generation_id: track.review_status === "rejected" ? null : track.legacy_generation_id, asset, audio_url };
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

async function queueStudioTrackGeneration(db: any, album: any, userId: string, studioTrack: any, startWorker = true) {
  const duration = Number(studioTrack.duration_seconds);
  const { data: legacySession, error: sessionError } = await db.from("trellis_music_sessions").insert({ created_by: userId, title: `[Studio Adapter] ${album.title} — ${studioTrack.title}`, target_duration_seconds: duration, genre: album.genre, mood: album.mood, track_count: 1, avg_track_length_seconds: duration, status: "planned" }).select("*").single();
  if (sessionError || !legacySession) throw new Error(sessionError?.message || "Could not initialize the legacy generation adapter.");
  const { data: legacyTrack, error: legacyError } = await db.from("trellis_music_tracks").insert({ session_id: legacySession.id, track_number: 1, title: studioTrack.title, prompt: studioTrack.prompt, genre: album.genre, mood: album.mood, vocal_style: album.vocal_direction, duration_seconds: duration, status: "queued" }).select("*").single();
  if (legacyError || !legacyTrack) throw new Error(legacyError?.message || "Could not queue legacy generation.");
  const { error: updateError } = await db.from("studio_tracks").update({ legacy_generation_id: legacyTrack.id, review_status: "regenerating", generation_provider: "google", generation_model: duration === 30 ? "lyria-3-clip-preview" : "lyria-3-pro-preview", updated_at: new Date().toISOString() }).eq("id", studioTrack.id);
  if (updateError) throw new Error(updateError.message);
  const { error: jobError } = await db.from("studio_jobs").insert({ album_id: album.id, track_id: studioTrack.id, job_type: "track_generation", status: "processing", progress: 5, provider: "legacy_lyria_adapter", attempt_count: 1, input_json: { legacy_session_id: legacySession.id, legacy_generation_id: legacyTrack.id } });
  if (jobError) throw new Error(jobError.message);
  if (startWorker) await invokeLegacyWorker(legacySession.id, null);
  await db.from("studio_albums").update({ status: "track_generation", music_generation_status: "processing", updated_at: new Date().toISOString() }).eq("id", album.id);
  return trackWithAsset(db, studioTrack.id);
}

async function coverWithUrl(db: any, asset: any) {
  const { data: signed } = await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 15);
  return { ...asset, image_url: signed?.signedUrl || null };
}

async function clearCoverSelections(db: any, albumId: string) {
  const { data: candidates, error } = await db.from("studio_assets").select("id,metadata_json").eq("album_id", albumId).eq("asset_type", "cover_art").eq("status", "active");
  if (error) throw new Error(error.message);
  const selected = (candidates || []).filter((asset: any) => ["selected", "approved"].includes(asset.metadata_json?.selection_status));
  await Promise.all(selected.map((asset: any) => db.from("studio_assets").update({ metadata_json: { ...(asset.metadata_json || {}), selection_status: "unselected" } }).eq("id", asset.id)));
}

function buildCoverPrompt(aspectLabel: string, params: { stylePrompt: string; styleSetting: string; customDirection: string; subjectConstraint: string; locationConstraint: string; genreLabel: string; moodLabel: string }) {
  return `${aspectLabel} IMAGE-ONLY album artwork plate for an original music release. Typography will be added later with real fonts.\nSTYLE / MEDIUM: ${params.stylePrompt}\nSCENE SETTING: ${params.styleSetting || "an evocative, geographically specific setting"}.\nUSER DIRECTION — HIGHEST PRIORITY: ${params.customDirection || "Create one elegant focal subject and a restrained editorial composition"}.\n${params.subjectConstraint}\n${params.locationConstraint}\nALBUM CONTEXT: Genre ${params.genreLabel}; mood ${params.moodLabel}.\nABSOLUTE EXCLUSIONS: no title, no words, no letters, no numbers, no signage, no labels, no logos, no watermark, no signature, no readable writing, no real artists, and no copyrighted characters. Do not invent extra people, vehicles, or narrative props that conflict with the user direction.`;
}

async function generateNativeImage(key: string, prompt: string, aspectRatio: "1:1" | "16:9", errorLabel: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${errorLabel}: ${JSON.stringify(payload).slice(0, 240)}`);
  const imagePart = payload?.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData?.data || part.inline_data?.data);
  const encoded = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
  if (!encoded) throw new Error("The image provider returned no image data.");
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}

async function generateStudioCover(db: any, album: any, input: any) {
  if (album.release_identity_status !== "approved") throw new Error("Approve the Release Identity before generating cover concepts.");
  const { data: secret } = await db.from("tenant_secrets").select("gemini_api_key").eq("organization_id", ORG_ID).maybeSingle();
  const key = Deno.env.get("GEMINI_API_KEY") || secret?.gemini_api_key;
  if (!key) throw new Error("Image generation is not configured.");
  const cleanDirection = (value: unknown, limit: number) => String(value || "").replace(/\b(real artists?|brands?|lyrics?|logos?)\b/gi, "").trim().slice(0, limit);
  const styleId = cleanDirection(input.style_id, 80) || "custom";
  const stylePrompt = cleanDirection(input.style_prompt, 1200) || "Premium editorial album artwork with a strong single visual idea.";
  const styleSetting = cleanDirection(input.style_setting, 500);
  const customDirection = cleanDirection(input.custom_direction, 500);
  const singleWomanRequested = /(?:\b(?:single|one|only|exactly one)\b.{0,40}\b(?:woman|female|lady)\b)|(?:\b(?:woman|female|lady)\b.{0,40}\b(?:alone|only|single)\b)/i.test(customDirection);
  const subjectConstraint = singleWomanRequested
    ? "HARD SUBJECT CONSTRAINT: Exactly one adult woman is the only human figure anywhere in the image. No second person, no men, no crowd, no background people, no reflections or portraits containing other people."
    : "SUBJECT CONSTRAINT: Use one clear focal subject. Do not add a group, entourage, or crowd unless the user explicitly requests one.";
  const locationSource = `${album.title || ""} ${album.theme || ""} ${styleSetting} ${customDirection}`;
  const rivieraRequested = /riviera|mediterranean|c[oô]te d['’]?azur|cannes|nice|monaco/i.test(locationSource);
  const locationConstraint = rivieraRequested
    ? "HARD LOCATION CONSTRAINT: This is the real French Riviera / Côte d’Azur: deep blue Mediterranean water, yachts, palms, a curved developed coastline, limestone terrace or balustrade, and recognizable Belle Époque resort architecture. No tropical jungle, waterfall, volcano, fantasy island, or generic Caribbean setting."
    : "LOCATION CONSTRAINT: Make the stated setting geographically and architecturally specific rather than generic.";
  const genreLabel = album.subgenre || album.genre || "instrumental";
  const moodLabel = album.mood || "cinematic";
  const prompt = buildCoverPrompt("Square", { stylePrompt, styleSetting: styleSetting || album.theme, customDirection, subjectConstraint, locationConstraint, genreLabel, moodLabel });
  const bytes = await generateNativeImage(key, prompt, "1:1", "Cover concept generation failed");
  const { data: prior } = await db.from("studio_assets").select("version").eq("album_id", album.id).eq("asset_type", "cover_art").order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (prior?.version || 0) + 1;
  const path = `studio/${ORG_ID}/albums/${album.id}/cover-concepts/cover-v${version}.png`;
  const { error: uploadError } = await db.storage.from("studio-assets").upload(path, bytes, { contentType: "image/png", upsert: false });
  if (uploadError) throw new Error(`Could not store cover concept: ${uploadError.message}`);
  const { data: asset, error } = await db.from("studio_assets").insert({ album_id: album.id, asset_type: "cover_art", storage_bucket: "studio-assets", storage_path: path, mime_type: "image/png", file_size: bytes.byteLength, width: 1024, height: 1024, version, status: "active", metadata_json: { role: "cover_concept", selection_status: "unselected", prompt, style_id: styleId, style_prompt: stylePrompt, style_setting: styleSetting, custom_direction: customDirection, hard_constraints: { single_woman: singleWomanRequested, french_riviera: rivieraRequested }, model: IMAGE_MODEL } }).select("*").single();
  if (error || !asset) throw new Error(error?.message || "Could not register cover concept.");
  await db.from("studio_albums").update({ artwork_status: "processing", updated_at: new Date().toISOString() }).eq("id", album.id);
  return coverWithUrl(db, asset);
}

function videoSourceConstraints(sourceConcept: any) {
  const hardConstraints = sourceConcept.metadata_json?.hard_constraints || {};
  const subjectConstraint = hardConstraints.single_woman
    ? "HARD SUBJECT CONSTRAINT: Exactly one adult woman is the only human figure anywhere in the image. No second person, no men, no crowd, no background people, no reflections or portraits containing other people."
    : "SUBJECT CONSTRAINT: Use one clear focal subject. Do not add a group, entourage, or crowd unless the user explicitly requests one.";
  const locationConstraint = hardConstraints.french_riviera
    ? "HARD LOCATION CONSTRAINT: This is the real French Riviera / Côte d’Azur: deep blue Mediterranean water, yachts, palms, a curved developed coastline, limestone terrace or balustrade, and recognizable Belle Époque resort architecture. No tropical jungle, waterfall, volcano, fantasy island, or generic Caribbean setting."
    : "LOCATION CONSTRAINT: Make the stated setting geographically and architecturally specific rather than generic.";
  return { subjectConstraint, locationConstraint };
}

// Shared tail: store PNG bytes as a new video_source take that joins the gallery.
// The newest is auto-selected (deselect the others) so preview and render agree.
async function storeVideoSource(db: any, album: any, sourceConcept: any, bytes: Uint8Array, extraMeta: Record<string, unknown>) {
  const { data: prior } = await db.from("studio_assets").select("version").eq("album_id", album.id).eq("asset_type", "scene_image").order("version", { ascending: false }).limit(1).maybeSingle();
  const version = Number(prior?.version || 0) + 1;
  const path = `studio/${ORG_ID}/albums/${album.id}/video-source/scene-v${version}.png`;
  const { error: uploadError } = await db.storage.from("studio-assets").upload(path, bytes, { contentType: "image/png", upsert: false });
  if (uploadError) throw new Error(`Could not store the video source image: ${uploadError.message}`);
  await deselectVideoSources(db, album.id);
  const { data: asset, error } = await db.from("studio_assets").insert({ album_id: album.id, asset_type: "scene_image", storage_bucket: "studio-assets", storage_path: path, mime_type: "image/png", file_size: bytes.byteLength, width: 1280, height: 720, version, status: "active", metadata_json: { role: "video_source", selection_status: "selected", source_asset_id: sourceConcept.id, aspect_ratio: "16:9", ...extraMeta } }).select("*").single();
  if (error || !asset) throw new Error(error?.message || "Could not register the video source image.");
  return asset;
}

// Fresh native 16:9 take of the same scene (a new photograph, not the cover).
async function generateStudioVideoSource(db: any, album: any, sourceConcept: any) {
  const { data: secret } = await db.from("tenant_secrets").select("gemini_api_key").eq("organization_id", ORG_ID).maybeSingle();
  const key = Deno.env.get("GEMINI_API_KEY") || secret?.gemini_api_key;
  if (!key) throw new Error("Image generation is not configured.");
  const meta = sourceConcept.metadata_json || {};
  const { subjectConstraint, locationConstraint } = videoSourceConstraints(sourceConcept);
  const prompt = buildCoverPrompt("Widescreen 16:9", {
    stylePrompt: meta.style_prompt || "Premium editorial album artwork with a strong single visual idea.",
    styleSetting: meta.style_setting || "",
    customDirection: meta.custom_direction || "",
    subjectConstraint,
    locationConstraint,
    genreLabel: album.subgenre || album.genre || "instrumental",
    moodLabel: album.mood || "cinematic",
  });
  const bytes = await generateNativeImage(key, prompt, "16:9", "Video source generation failed");
  return storeVideoSource(db, album, sourceConcept, bytes, { prompt, model: IMAGE_MODEL, method: "fresh_scene" });
}

// Extend the APPROVED cover photo itself into 16:9 — keeps the exact subject and
// composition, outpainting believable scenery left/right so the video image
// matches the cover instead of being a different photograph.
async function extendCoverToVideoSource(db: any, album: any, sourceConcept: any) {
  const { data: secret } = await db.from("tenant_secrets").select("gemini_api_key").eq("organization_id", ORG_ID).maybeSingle();
  const key = Deno.env.get("GEMINI_API_KEY") || secret?.gemini_api_key;
  if (!key) throw new Error("Image generation is not configured.");
  const { data: sourceBlob, error: downloadError } = await db.storage.from(sourceConcept.storage_bucket).download(sourceConcept.storage_path);
  if (downloadError || !sourceBlob) throw new Error(downloadError?.message || "Could not load the approved cover source.");
  const sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer());
  const { subjectConstraint, locationConstraint } = videoSourceConstraints(sourceConcept);
  const subject = subjectConstraint.replace(/^HARD SUBJECT CONSTRAINT: |^SUBJECT CONSTRAINT: /, "");
  const location = locationConstraint.replace(/^HARD LOCATION CONSTRAINT: |^LOCATION CONSTRAINT: /, "");
  const prompt = `Recompose and outpaint the supplied square, image-only album photograph into a native cinematic 16:9 landscape frame for a long-form music video. This must look like one intentional full-width photograph, never a square placed over a blurred background. Preserve the exact source subject, pose, period, wardrobe, palette, lighting, photographic medium, and atmosphere from the supplied image. Extend believable scenery to the left and right and keep the important subject inside the center safe area. ${subject} ${location} Return image-only artwork with no title, words, letters, numbers, labels, logos, watermark, signature, border, or frame.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_EDIT_MODEL}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: sourceConcept.mime_type || "image/png", data: bytesToBase64(sourceBytes) } }, { text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "16:9" } } }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Cover extension failed: ${JSON.stringify(payload).slice(0, 240)}`);
  const imagePart = payload?.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData?.data || part.inline_data?.data);
  const encoded = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
  if (!encoded) throw new Error("The image editor returned no extended artwork.");
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return storeVideoSource(db, album, sourceConcept, bytes, { prompt, model: IMAGE_EDIT_MODEL, method: "cover_extend" });
}

async function deselectVideoSources(db: any, albumId: string) {
  const { data: rows } = await db.from("studio_assets").select("id, metadata_json").eq("album_id", albumId).eq("asset_type", "scene_image").eq("status", "active").contains("metadata_json", { role: "video_source", selection_status: "selected" });
  await Promise.all((rows || []).map((row: any) => db.from("studio_assets").update({ metadata_json: { ...(row.metadata_json || {}), selection_status: "unselected" } }).eq("id", row.id)));
}

async function videoSourceList(db: any, albumId: string, sourceConceptId: string) {
  const { data } = await db.from("studio_assets").select("*").eq("album_id", albumId).eq("asset_type", "scene_image").eq("status", "active").contains("metadata_json", { role: "video_source", source_asset_id: sourceConceptId }).order("version", { ascending: false });
  return data || [];
}

// The take used for the video: the explicitly selected one, else the newest
// (covers legacy single sources saved before selection_status existed).
async function selectedVideoSource(db: any, albumId: string, sourceConceptId: string) {
  const rows = await videoSourceList(db, albumId, sourceConceptId);
  if (!rows.length) return null;
  return rows.find((row: any) => row.metadata_json?.selection_status === "selected") || rows[0];
}

async function approvedCoverSource(db: any, album: any) {
  const { data: approvedCover } = await db.from("studio_assets").select("id, metadata_json").eq("album_id", album.id).eq("asset_type", "cover_art").eq("status", "active").contains("metadata_json", { selection_status: "approved" }).maybeSingle();
  if (!approvedCover) return { approvedCover: null, sourceConcept: null };
  const sourceConceptId = approvedCover.metadata_json?.source_asset_id || approvedCover.id;
  const { data: sourceConcept } = await db.from("studio_assets").select("*").eq("id", sourceConceptId).eq("album_id", album.id).eq("asset_type", "cover_art").eq("status", "active").maybeSingle();
  return { approvedCover, sourceConcept: sourceConcept || null };
}

async function masterWithAsset(db: any, albumId: string, fallback: any = {}) {
  const { data: asset } = await db.from("studio_assets").select("*").eq("album_id", albumId).is("track_id", null).eq("asset_type", "master_mp3").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  let audio_url: string | null = null;
  if (asset) {
    const { data: signed } = await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 15);
    audio_url = signed?.signedUrl || null;
  }
  return { ...fallback, asset, audio_url };
}

async function videoWithAsset(db: any, album: any) {
  const { data: asset, error } = await db.from("studio_assets").select("*").eq("album_id", album.id).is("track_id", null).eq("asset_type", "final_video").order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!asset) return { status: album.video_status || "not_started", video_url: null };
  let videoUrl: string | null = null;
  if (asset.status === "active") {
    const { data: signed } = await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 60);
    videoUrl = signed?.signedUrl || null;
    if (album.video_status !== "approved" && album.video_status !== "pending_review") {
      await db.from("studio_albums").update({ video_status: "pending_review", status: "video_review", updated_at: new Date().toISOString() }).eq("id", album.id);
      album.video_status = "pending_review";
    }
  }
  const worker = asset.metadata_json?.worker || {};
  const status = asset.status === "active" ? (album.video_status === "approved" ? "approved" : "pending_review") : asset.status === "pending" ? "queued" : asset.status;
  return { status, video_url: videoUrl, duration_seconds: asset.duration_seconds, progress: worker.progress, stage: worker.stage, message: worker.message, error_message: asset.error_message, asset_id: asset.id, artwork_layout: asset.metadata_json?.artwork_layout || null };
}

async function publicationForAlbum(db: any, albumId: string) {
  const { data, error } = await db.from("studio_publications").select("*").eq("album_id", albumId).eq("platform", "youtube").maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

// AI-writes the rich, YouTube-style description parts (genre line, evocative
// paragraphs, "ideal for" phrases, hashtags) from the album's brief. Returns
// null on any failure so publishing falls back to the plain description.
async function generateAlbumMetadata(db: any, album: any, tracks: any[]) {
  const key = Deno.env.get("GEMINI_API_KEY") || (await db.from("tenant_secrets").select("gemini_api_key").eq("organization_id", ORG_ID).maybeSingle()).data?.gemini_api_key;
  if (!key) return null;
  const trackTitles = (tracks || []).map((t: any) => t.title).filter(Boolean).slice(0, 24).join(", ");
  const prompt = `Write YouTube metadata for a long-form instrumental music mix. Return ONLY JSON with keys genre_summary, description, ideal_for, hashtags.
Album: ${album.title}
Fictional artist: ${album.artist_name}
Genre: ${album.subgenre || album.genre || "instrumental"}
Mood: ${album.mood || "cinematic"}
Era: ${album.era || ""}
Setting / theme: ${album.theme || ""}
Tracks: ${trackTitles}
Rules:
- genre_summary: ONE line, 6-12 comma-separated evocative descriptors (e.g. "Mediterranean jazz house, chill-out lounge, Italian summer vibes, sunset relaxation").
- description: 2-3 short evocative paragraphs separated by blank lines, about the mood, instrumentation, and ideal listening moments. No track list, no hashtags, no headings, no emoji.
- ideal_for: array of 5-7 short phrases (2-4 words each), listening situations.
- hashtags: array of 8-12 single-token hashtags each starting with # and no spaces.
- No real artists, brands, songs, or copyrighted names.`;
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(raw);
    return {
      genre_summary: cleanText(parsed.genre_summary, 300),
      description: String(parsed.description || "").replace(/\r/g, "").trim().slice(0, 2600),
      ideal_for: Array.isArray(parsed.ideal_for) ? parsed.ideal_for.map((v: unknown) => cleanText(v, 60)).filter(Boolean).slice(0, 8) : [],
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((v: unknown) => cleanText(v, 40).replace(/\s+/g, "")).filter((h: string) => /^#\w{2,}$/.test(h)).slice(0, 15) : [],
    };
  } catch {
    return null;
  }
}

async function preparePublicationDraft(db: any, album: any, userId: string, youtubeAccountId: string) {
  if (album.video_status !== "approved") throw new Error("Approve the final video before preparing publishing metadata.");
  const existing = await publicationForAlbum(db, album.id);
  if (existing?.status === "live") throw new Error("This album is already published.");
  if (existing?.status === "submitting") throw new Error("This album is already being submitted.");
  const { data: video } = await db.from("studio_assets").select("id").eq("album_id", album.id).eq("asset_type", "final_video").eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle();
  if (!video) throw new Error("The approved video asset is unavailable.");
  // Prefer the dedicated 16:9 thumbnail (title text, YouTube-shaped); fall back
  // to the approved square cover only if no thumbnail was designed.
  const { data: thumbnail } = await db.from("studio_assets").select("id").eq("album_id", album.id).eq("asset_type", "thumbnail").eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle();
  const { data: cover } = await db.from("studio_assets").select("id").eq("album_id", album.id).eq("asset_type", "cover_art").eq("status", "active").contains("metadata_json", { selection_status: "approved" }).maybeSingle();
  const { data: tracks, error: tracksError } = await db.from("studio_tracks").select("track_number,title,duration_seconds").eq("album_id", album.id).eq("included_in_master", true).eq("review_status", "approved").order("track_number");
  if (tracksError) throw new Error(tracksError.message);
  let elapsed = 0;
  const chapters = (tracks || []).map((track: any) => {
    const chapter = { time: chapterTime(elapsed), title: cleanText(track.title, 100) || `Track ${track.track_number}` };
    elapsed += Math.max(0, Number(track.duration_seconds) || 0);
    return chapter;
  });
  const chaptersBlock = chapters.map((c: any) => `${c.time} — ${c.title}`).join("\n");
  const meta = await generateAlbumMetadata(db, album, tracks || []);
  const idealBlock = meta?.ideal_for?.length ? `☀️ Ideal for:\n${meta.ideal_for.map((b: string) => `• ${b}`).join("\n")}` : "";
  const hashtagLine = meta?.hashtags?.length ? meta.hashtags.join(" ") : "";
  // Chapters are baked into the description (with 0:00 first, so YouTube builds
  // chapter markers) rather than appended by n8n, so the layout matches the
  // reference format. publish_album sends chapters:[] to avoid duplication.
  const description = [
    meta?.genre_summary || null,
    meta?.description || album.short_description,
    chaptersBlock,
    idealBlock,
    album.ai_disclosure,
    album.copyright_note,
    hashtagLine,
  ].filter(Boolean).join("\n\n").slice(0, 4900);
  const tags = publicationTags([album.artist_name, album.genre, album.subgenre, album.mood, album.series_name, ...(meta?.hashtags || []).map((h: string) => h.replace(/^#/, "")), "instrumental music", "full album"]);
  const draft = {
    album_id: album.id, created_by: userId, platform: "youtube", status: "draft",
    youtube_account_id: youtubeAccountId,
    title: cleanText(`${album.artist_name} — ${album.title}`, 95) || "Untitled Album",
    description, tags, chapters, visibility: existing?.visibility || "private", made_for_kids: false,
    scheduled_for: existing?.scheduled_for || null, video_asset_id: video.id, thumbnail_asset_id: thumbnail?.id || cover?.id || null,
    external_id: null, external_url: null, error_message: null, response_json: {}, submitted_at: null, published_at: null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("studio_publications").upsert(draft, { onConflict: "album_id,platform" }).select("*").single();
  if (error || !data) throw new Error(error?.message || "Could not prepare publishing metadata.");
  await db.from("studio_albums").update({ metadata_status: "pending_review", publishing_status: "not_started", status: "metadata_review", updated_at: new Date().toISOString() }).eq("id", album.id);
  return data;
}

async function invalidateDownstreamAssets(db: any, albumId: string, from: "master" | "identity") {
  const types = from === "master" ? ["cover_art", "thumbnail", "scene_image", "scene_loop", "final_video", "logo_overlay", "cta_overlay", "waveform"] : ["cover_art", "thumbnail", "scene_image", "scene_loop", "final_video", "logo_overlay", "cta_overlay"];
  await db.from("studio_assets").update({ status: "archived", updated_at: new Date().toISOString() }).eq("album_id", albumId).in("asset_type", types).in("status", ["pending", "processing", "active", "failed"]);
  await db.from("studio_jobs").update({ status: "cancelled", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("album_id", albumId).in("job_type", ["cover_art", "scene_loop", "video_render", "metadata", "publishing_handoff"]).in("status", ["queued", "processing"]);
}

async function syncStudioMaster(db: any, albumId: string) {
  const { data: job, error: jobError } = await db.from("studio_jobs").select("*").eq("album_id", albumId).eq("job_type", "master_audio").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) return masterWithAsset(db, albumId, { status: "not_started" });
  const renderId = job.input_json?.legacy_render_id;
  if (!renderId) return masterWithAsset(db, albumId, { status: job.status, error_message: job.error_message });
  const { data: render, error: renderError } = await db.from("trellis_music_renders").select("*").eq("id", renderId).maybeSingle();
  if (renderError || !render) throw new Error(renderError?.message || "Master render record not found.");
  if (render.status === "failed") {
    await db.from("studio_jobs").update({ status: "failed", error_message: render.error_message || "Mastering failed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    await db.from("studio_albums").update({ master_status: "failed", updated_at: new Date().toISOString() }).eq("id", albumId);
    return masterWithAsset(db, albumId, { status: "failed", error_message: render.error_message || "The master render failed." });
  }
  if (render.status !== "ready") return masterWithAsset(db, albumId, { status: render.status === "queued" ? "queued" : "processing" });
  if (!render.storage_bucket || !render.storage_path) throw new Error("The completed master did not include an audio file.");
  let assetId = job.output_json?.studio_asset_id;
  if (!assetId) {
    const { data: bytes, error: downloadError } = await db.storage.from(render.storage_bucket).download(render.storage_path);
    if (downloadError || !bytes) throw new Error(downloadError?.message || "Could not retrieve the completed master.");
    const path = `studio/${ORG_ID}/albums/${albumId}/masters/${render.id}.mp3`;
    const { error: uploadError } = await db.storage.from("studio-assets").upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) throw new Error(`Could not register the completed master: ${uploadError.message}`);
    const { data: previousAsset } = await db.from("studio_assets").select("version").eq("album_id", albumId).is("track_id", null).eq("asset_type", "master_mp3").order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: asset, error: assetError } = await db.from("studio_assets").insert({ album_id: albumId, asset_type: "master_mp3", storage_bucket: "studio-assets", storage_path: path, mime_type: "audio/mpeg", file_size: bytes.size, duration_seconds: render.duration_seconds, version: (previousAsset?.version || 0) + 1, status: "active", metadata_json: { legacy_render_id: render.id, legacy_session_id: render.session_id, track_ids: render.track_ids } }).select("*").single();
    if (assetError || !asset) throw new Error(assetError?.message || "Could not create the Studio master asset.");
    assetId = asset.id;
    await db.from("studio_jobs").update({ status: "completed", progress: 100, output_json: { legacy_render_id: render.id, studio_asset_id: asset.id }, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
  }
  const { data: album } = await db.from("studio_albums").select("master_status").eq("id", albumId).maybeSingle();
  const masterStatus = album?.master_status === "approved" ? "approved" : "pending_review";
  if (masterStatus === "pending_review") await db.from("studio_albums").update({ status: "master_review", master_status: "pending_review", actual_duration_seconds: render.duration_seconds, updated_at: new Date().toISOString() }).eq("id", albumId);
  return masterWithAsset(db, albumId, { status: masterStatus, duration_seconds: render.duration_seconds, studio_asset_id: assetId });
}

async function queueStudioMaster(db: any, album: any, userId: string) {
  const { data: tracks, error: tracksError } = await db.from("studio_tracks").select("*").eq("album_id", album.id).order("track_number");
  if (tracksError) throw new Error(tracksError.message);
  const includedTracks = (tracks || []).filter((track: any) => track.included_in_master !== false);
  if (!includedTracks.length) throw new Error("Include and approve at least one generated track before building the full MP3.");
  const unapproved = includedTracks.filter((track: any) => track.review_status !== "approved");
  if (unapproved.length) throw new Error(`Approve all generated tracks before building the full MP3 (${unapproved.length} remaining).`);
  if (includedTracks.some((track: any) => !track.legacy_generation_id)) throw new Error("Every included track needs a completed generation before the full MP3 can be built.");
  const legacyIds = includedTracks.map((track: any) => track.legacy_generation_id);
  const { data: legacyTracks, error: legacyError } = await db.from("trellis_music_tracks").select("*").in("id", legacyIds);
  if (legacyError) throw new Error(legacyError.message);
  const legacyById = new Map<string, any>((legacyTracks || []).map((track: any) => [track.id, track]));
  const stitchTracks = await Promise.all(includedTracks.map(async (track: any) => {
    const legacy = legacyById.get(track.legacy_generation_id);
    if (!legacy || legacy.status !== "completed" || !legacy.storage_bucket || !legacy.storage_path) throw new Error(`“${track.title}” is not ready for mastering.`);
    const { data: signed, error: signError } = await db.storage.from(legacy.storage_bucket).createSignedUrl(legacy.storage_path, 60 * 60);
    if (signError || !signed?.signedUrl) throw new Error(signError?.message || `Could not prepare “${track.title}” for mastering.`);
    return { id: legacy.id, track_number: track.track_number, audio_url: signed.signedUrl };
  }));
  const totalDuration = includedTracks.reduce((total: number, track: any) => total + Number(track.duration_seconds || 0), 0);
  const { data: legacySession, error: sessionError } = await db.from("trellis_music_sessions").insert({ created_by: userId, title: `[Studio Master] ${album.title}`, target_duration_seconds: totalDuration, actual_duration_seconds: null, genre: album.genre, mood: album.mood, track_count: includedTracks.length, avg_track_length_seconds: Math.round(totalDuration / includedTracks.length), status: "stitching", final_audio_url: null, error_message: null }).select("*").single();
  if (sessionError || !legacySession) throw new Error(sessionError?.message || "Could not initialize the master adapter.");
  const { data: render, error: renderError } = await db.from("trellis_music_renders").insert({ session_id: legacySession.id, render_type: "master", status: "queued", track_ids: legacyIds }).select("*").single();
  if (renderError || !render) throw new Error(renderError?.message || "Could not queue the master render.");
  const { data: job, error: jobError } = await db.from("studio_jobs").insert({ album_id: album.id, job_type: "master_audio", status: "queued", progress: 5, provider: "legacy_ffmpeg_stitch_adapter", attempt_count: 1, input_json: { legacy_render_id: render.id, legacy_session_id: legacySession.id, legacy_generation_ids: legacyIds } }).select("*").single();
  if (jobError || !job) throw new Error(jobError?.message || "Could not register the Studio master job.");
  await db.from("studio_albums").update({ status: "mastering", master_status: "queued", actual_duration_seconds: null, updated_at: new Date().toISOString() }).eq("id", album.id);
  fetch(MUSIC_STITCH_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ render_id: render.id, session_id: legacySession.id, branch: null, tracks: stitchTracks }) }).catch(() => { /* n8n receives this independent of its response body */ });
  return masterWithAsset(db, album.id, { status: "queued", job_id: job.id });
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
    const { data, error } = await db.from("studio_albums").insert({ organization_id: ORG_ID, created_by: user.id, title: album.title.trim(), artist_name: album.artist_name.trim(), description: album.description?.trim() || null, genre: album.genre?.trim() || null, mood: album.mood?.trim() || null, era: album.era?.trim() || null, theme: album.theme?.trim() || null, style_preset_id: album.style_preset_id?.trim() || null, style_profile: album.style_profile && typeof album.style_profile === "object" ? album.style_profile : {}, vocal_direction: album.vocal_direction || "instrumental", target_duration_seconds: album.target_duration_seconds }).select("*").single();
    return error ? json({ error: error.message }, 500) : json({ album: data }, 201);
  }
  try {
    if (body.action === "list_publications") {
      const { data: owned } = await db.from("studio_albums").select("id, title, artist_name").eq("organization_id", ORG_ID).eq("created_by", user.id);
      const byId = new Map<string, any>((owned || []).map((a: any) => [a.id, a]));
      const ids = Array.from(byId.keys());
      if (!ids.length) return json({ releases: [] });
      const { data: pubs, error } = await db.from("studio_publications").select("id, album_id, status, title, external_id, external_url, published_at, updated_at").in("album_id", ids).eq("status", "live").order("published_at", { ascending: false });
      if (error) throw new Error(error.message);
      const releases = (pubs || []).map((p: any) => ({ ...p, album_title: byId.get(p.album_id)?.title || "", artist_name: byId.get(p.album_id)?.artist_name || "" }));
      return json({ releases });
    }
    if (body.action === "get_youtube_metrics") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const limit = Number.isInteger(body.limit) && body.limit > 0 ? body.limit : 30;
      const { data, error } = await db.from("trellis_youtube_daily_metrics").select("*").eq("studio_album_id", album.id).order("metric_date", { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return json({ metrics: data || [] });
    }
    if (body.action === "rename_album") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const title = String(body.title || "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (!title) throw new Error("The album title cannot be empty.");
      const { data, error } = await db.from("studio_albums").update({ title, updated_at: new Date().toISOString() }).eq("id", album.id).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not rename the album.");
      return json({ album: data });
    }
    if (body.action === "tracks") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      await recoverStudioTrackQueue(db, album.id);
      const { data, error } = await db.from("studio_tracks").select("*").eq("album_id", body.album_id).order("track_number");
      if (error) throw new Error(error.message);
      const tracks = await Promise.all((data || []).map((track: any) => syncLegacyTrack(db, track.id)));
      const includedTracks = tracks.filter((track: any) => track.included_in_master !== false);
      const statuses = includedTracks.map((track: any) => track.review_status);
      if (includedTracks.length && statuses.every((status: string) => status === "approved")) await db.from("studio_albums").update({ music_generation_status: "complete", status: album.master_status === "approved" ? album.status : "track_review", updated_at: new Date().toISOString() }).eq("id", album.id);
      else if (statuses.some((status: string) => status === "regenerating")) await db.from("studio_albums").update({ music_generation_status: "processing", status: "track_generation", updated_at: new Date().toISOString() }).eq("id", album.id);
      else if (statuses.some((status: string) => ["pending_review", "rejected", "failed"].includes(status))) await db.from("studio_albums").update({ status: "track_review", updated_at: new Date().toISOString() }).eq("id", album.id);
      return json({ tracks, master: await syncStudioMaster(db, album.id), video: await videoWithAsset(db, album), publication: await publicationForAlbum(db, album.id) });
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
      if (!input.title?.trim() || !input.prompt?.trim() || !Number.isInteger(duration) || duration < 30 || duration > 165) throw new Error("Track title, prompt, and a 30–165 second planned duration are required.");
      const { data: last } = await db.from("studio_tracks").select("track_number").eq("album_id", album.id).order("track_number", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await db.from("studio_tracks").insert({ album_id: album.id, track_number: (last?.track_number || 0) + 1, title: input.title.trim(), prompt: input.prompt.trim(), duration_seconds: duration, vocal_direction: album.vocal_direction, review_status: "planned" }).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not add planned track.");
      return json({ track: data }, 201);
    }
    if (body.action === "update_planned_track") {
      const input = body.track || {};
      const duration = Number(input.duration_seconds);
      if (!body.track_id || !input.title?.trim() || !input.prompt?.trim() || !Number.isInteger(duration) || duration < 30 || duration > 165) throw new Error("Track title, prompt, and a 30–165 second planned duration are required.");
      const { data: track, error } = await db.from("studio_tracks").select("*").eq("id", body.track_id).single();
      if (error || !track) throw new Error("Track not found.");
      await getOwnedAlbum(db, track.album_id, user.id);
      if (!["planned", "failed", "rejected"].includes(track.review_status) || (track.review_status === "planned" && track.legacy_generation_id)) throw new Error("Only planned, rejected, or failed tracks can be edited.");
      const resettingGeneration = track.review_status === "failed" || track.review_status === "rejected";
      if (resettingGeneration && track.studio_asset_id) await db.from("studio_assets").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", track.studio_asset_id);
      const { error: updateError } = await db.from("studio_tracks").update({ title: input.title.trim(), prompt: input.prompt.trim(), duration_seconds: duration, legacy_generation_id: resettingGeneration ? null : track.legacy_generation_id, studio_asset_id: resettingGeneration ? null : track.studio_asset_id, source_audio_path: resettingGeneration ? null : track.source_audio_path, generation_provider: resettingGeneration ? null : track.generation_provider, generation_model: resettingGeneration ? null : track.generation_model, rejection_reason: resettingGeneration ? null : track.rejection_reason, review_status: resettingGeneration ? "planned" : track.review_status, updated_at: new Date().toISOString() }).eq("id", track.id);
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
    if (body.action === "reorder_tracks") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      // The stitched master bakes in the running order, so reordering is only
      // free before it's built. After that, the order changes on the next rebuild.
      if (!["not_started", "failed"].includes(album.master_status)) throw new Error("Rebuild the master to change the running order — the current master already uses it.");
      const orderedIds = Array.isArray(body.track_ids) ? body.track_ids.map((id: unknown) => String(id)) : [];
      const { data: existing, error } = await db.from("studio_tracks").select("id, review_status").eq("album_id", album.id);
      if (error) throw new Error(error.message);
      const existingIds = (existing || []).map((track: any) => track.id);
      if (orderedIds.length !== existingIds.length || !existingIds.every((id: string) => orderedIds.includes(id))) throw new Error("The reordered list must include every track exactly once.");
      if ((existing || []).some((track: any) => track.review_status === "regenerating")) throw new Error("Wait for tracks to finish generating before reordering.");
      // Two-phase renumber: park at high temp numbers first so the
      // UNIQUE(album_id, track_number) constraint never trips mid-swap.
      await Promise.all(orderedIds.map((id: string, index: number) => db.from("studio_tracks").update({ track_number: 100000 + index + 1, updated_at: new Date().toISOString() }).eq("id", id).eq("album_id", album.id)));
      await Promise.all(orderedIds.map((id: string, index: number) => db.from("studio_tracks").update({ track_number: index + 1, updated_at: new Date().toISOString() }).eq("id", id).eq("album_id", album.id)));
      const { data: tracks } = await db.from("studio_tracks").select("*").eq("album_id", album.id).order("track_number");
      return json({ tracks: await Promise.all((tracks || []).map((track: any) => trackWithAsset(db, track.id))) });
    }
    if (body.action === "set_track_master_inclusion") {
      const { data: track, error: trackError } = await db.from("studio_tracks").select("*").eq("id", body.track_id).single();
      if (trackError || !track) throw new Error("Track not found.");
      const album = await getOwnedAlbum(db, track.album_id, user.id);
      if (!["not_started", "failed"].includes(album.master_status)) throw new Error("Track inclusion is locked after the master build begins.");
      if (track.review_status === "regenerating") throw new Error("Wait for this track to finish generating before changing its master inclusion.");
      const included = body.included === true;
      const { error: updateError } = await db.from("studio_tracks").update({ included_in_master: included, updated_at: new Date().toISOString() }).eq("id", track.id);
      if (updateError) throw new Error(updateError.message);
      await db.from("studio_albums").update({ music_generation_status: included ? "processing" : album.music_generation_status, status: "track_review", updated_at: new Date().toISOString() }).eq("id", album.id);
      return json({ track: await trackWithAsset(db, track.id) });
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
      const { data: tracks, error } = await db.from("studio_tracks").update({ review_status: "locked", updated_at: new Date().toISOString() }).eq("album_id", album.id).eq("included_in_master", true).eq("review_status", "planned").is("legacy_generation_id", null).select("*");
      if (error) throw new Error(error.message);
      return json({ tracks: tracks || [] });
    }
    if (body.action === "generate_planned_track") {
      const { data: studioTrack, error } = await db.from("studio_tracks").select("*").eq("id", body.track_id).single();
      if (error || !studioTrack) throw new Error("Track not found.");
      const album = await getOwnedAlbum(db, studioTrack.album_id, user.id);
      if (studioTrack.legacy_generation_id || studioTrack.review_status !== "locked") throw new Error("Only a plan approved for generation can be queued.");
      if (!studioTrack.title?.trim() || !studioTrack.prompt?.trim() || !Number.isInteger(Number(studioTrack.duration_seconds)) || studioTrack.duration_seconds < 30 || studioTrack.duration_seconds > 165) throw new Error("This planned track needs a title, prompt, and a 30–165 second planned duration before generation.");
      return json({ track: await queueStudioTrackGeneration(db, album, user.id, studioTrack) }, 201);
    }
    if (body.action === "generate_all_approved_tracks") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { data: approvedPlans, error } = await db.from("studio_tracks").select("*").eq("album_id", album.id).eq("included_in_master", true).eq("review_status", "locked").is("legacy_generation_id", null).order("track_number");
      if (error) throw new Error(error.message);
      if (!approvedPlans?.length) throw new Error("Approve at least one planned track before generating.");
      const tracks: any[] = [];
      const failures: Array<{ track_id: string; title: string; error: string }> = [];
      const concurrency = 3;
      for (let index = 0; index < approvedPlans.length; index += concurrency) {
        const batch = approvedPlans.slice(index, index + concurrency);
        const results = await Promise.all(batch.map(async (track: any) => {
          try {
            return { track: await queueStudioTrackGeneration(db, album, user.id, track, false) };
          } catch (generationError) {
            return { failure: { track_id: track.id, title: track.title, error: generationError instanceof Error ? generationError.message : "Could not queue generation." } };
          }
        }));
        for (const result of results) {
          if (result.track) tracks.push(result.track);
          if (result.failure) failures.push(result.failure);
        }
      }
      if (!tracks.length) throw new Error(failures[0]?.error || "No approved tracks could be queued.");
      await recoverStudioTrackQueue(db, album.id);
      return json({ tracks, failures }, failures.length ? 207 : 201);
    }
    if (body.action === "generate_one") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const input = body.track || {};
      const duration = Number(input.duration_seconds || 30);
      if (!Number.isInteger(duration) || duration < 30 || duration > 165) throw new Error("Track duration must be between 30 and 165 planned seconds.");
      if (!input.title?.trim() || !input.prompt?.trim() || !Number.isInteger(duration) || duration < 30 || duration > 165) throw new Error("Track title, prompt, and a 30–165 second planned duration are required.");
      const { data: last } = await db.from("studio_tracks").select("track_number").eq("album_id", album.id).order("track_number", { ascending: false }).limit(1).maybeSingle();
      const trackNumber = (last?.track_number || 0) + 1;
      const { data: studioTrack, error: studioError } = await db.from("studio_tracks").insert({ album_id: album.id, track_number: trackNumber, title: input.title.trim(), prompt: input.prompt.trim(), duration_seconds: duration, review_status: "regenerating", generation_provider: "google", generation_model: duration === 30 ? "lyria-3-clip-preview" : "lyria-3-pro-preview" }).select("*").single();
      if (studioError || !studioTrack) throw new Error(studioError?.message || "Could not create Studio track.");
      return json({ track: await queueStudioTrackGeneration(db, album, user.id, studioTrack) }, 201);
    }
    if (body.action === "review_track") {
      const { data: track, error } = await db.from("studio_tracks").select("album_id").eq("id", body.track_id).single();
      if (error || !track) throw new Error("Track not found.");
      await getOwnedAlbum(db, track.album_id, user.id);
      const { data: currentTrack } = await db.from("studio_tracks").select("review_status").eq("id", body.track_id).single();
      if (currentTrack?.review_status !== "pending_review") throw new Error("Only generated audio awaiting review can be approved or rejected.");
      const reviewStatus = body.approved ? "approved" : "rejected";
      const { error: updateError } = await db.from("studio_tracks").update({ review_status: reviewStatus, approved_at: body.approved ? new Date().toISOString() : null, rejection_reason: body.approved ? null : String(body.rejection_reason || "Rejected during review").slice(0, 500), updated_at: new Date().toISOString() }).eq("id", body.track_id);
      if (updateError) throw new Error(updateError.message);
      return json({ track: await trackWithAsset(db, body.track_id) });
    }
    if (body.action === "approve_all_generated_tracks") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const now = new Date().toISOString();
      const { data: readyTracks, error: readyError } = await db.from("studio_tracks").select("id").eq("album_id", album.id).eq("included_in_master", true).eq("review_status", "pending_review").not("studio_asset_id", "is", null);
      if (readyError) throw new Error(readyError.message);
      const readyIds = (readyTracks || []).map((track: any) => track.id);
      if (!readyIds.length) {
        const { count } = await db.from("studio_tracks").select("id", { count: "exact", head: true }).eq("album_id", album.id).eq("included_in_master", true).neq("review_status", "approved");
        return json({ tracks: [], remaining_review_count: count || 0 });
      }
      const { error } = await db.from("studio_tracks").update({ review_status: "approved", approved_at: now, rejection_reason: null, updated_at: now }).in("id", readyIds);
      if (error) throw new Error(error.message);
      const tracks = await Promise.all(readyIds.map((trackId: string) => trackWithAsset(db, trackId)));
      const { data: remaining } = await db.from("studio_tracks").select("id, review_status, included_in_master").eq("album_id", album.id);
      const remainingReviewCount = (remaining || []).filter((track: any) => track.included_in_master !== false && track.review_status !== "approved").length;
      if (remainingReviewCount === 0) await db.from("studio_albums").update({ music_generation_status: "complete", status: "track_review", updated_at: now }).eq("id", album.id);
      return json({ tracks, remaining_review_count: remainingReviewCount });
    }
    if (body.action === "reopen_track_review") {
      const { data: track, error: trackError } = await db.from("studio_tracks").select("*").eq("id", body.track_id).single();
      if (trackError || !track) throw new Error("Track not found.");
      const album = await getOwnedAlbum(db, track.album_id, user.id);
      if (track.review_status !== "approved" || !track.studio_asset_id) throw new Error("Only approved generated audio can be returned to review.");
      if (!["not_started", "failed"].includes(album.master_status)) throw new Error("The master already uses this approval. Rebuild workflow changes must start from the master review.");
      const { error: updateError } = await db.from("studio_tracks").update({ review_status: "pending_review", approved_at: null, updated_at: new Date().toISOString() }).eq("id", track.id);
      if (updateError) throw new Error(updateError.message);
      await db.from("studio_albums").update({ music_generation_status: "processing", status: "track_review", updated_at: new Date().toISOString() }).eq("id", album.id);
      return json({ track: await trackWithAsset(db, track.id) });
    }
    if (body.action === "build_master") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (["approved", "pending_review"].includes(album.master_status)) {
        await invalidateDownstreamAssets(db, album.id, "master");
        await db.from("studio_albums").update({ release_identity_status: "not_started", artwork_status: "not_started", video_status: "not_started", metadata_status: "not_started", publishing_status: "not_started", updated_at: new Date().toISOString() }).eq("id", album.id);
      }
      return json({ master: await queueStudioMaster(db, album, user.id) }, 201);
    }
    if (body.action === "approve_master") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { data: asset } = await db.from("studio_assets").select("id").eq("album_id", album.id).is("track_id", null).eq("asset_type", "master_mp3").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!asset) throw new Error("Build the full MP3 before approving the master.");
      if (album.master_status !== "pending_review") throw new Error("Only a master awaiting review can be approved.");
      const { error } = await db.from("studio_albums").update({ master_status: "approved", status: "release_identity", updated_at: new Date().toISOString() }).eq("id", album.id);
      if (error) throw new Error(error.message);
      return json({ master: await masterWithAsset(db, album.id, { status: "approved", studio_asset_id: asset.id }) });
    }
    if (body.action === "update_release_identity") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.master_status !== "approved") throw new Error("Approve the master before editing the Release Identity.");
      if (album.release_identity_status === "approved") await invalidateDownstreamAssets(db, album.id, "identity");
      const identity = body.identity || {};
      const text = (value: unknown, limit: number) => String(value || "").trim().slice(0, limit) || null;
      const { data, error } = await db.from("studio_albums").update({ release_subtitle: text(identity.release_subtitle, 160), series_name: text(identity.series_name, 120), subgenre: text(identity.subgenre, 120), short_description: text(identity.short_description, 400), credits: text(identity.credits, 2000), ai_disclosure: text(identity.ai_disclosure, 1000), copyright_note: text(identity.copyright_note, 1000), catalog_number: text(identity.catalog_number, 80), release_identity_status: "draft", artwork_status: "not_started", video_status: "not_started", metadata_status: "not_started", publishing_status: "not_started", status: "release_identity", updated_at: new Date().toISOString() }).eq("id", album.id).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not save the Release Identity.");
      return json({ album: data });
    }
    if (body.action === "approve_release_identity") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.master_status !== "approved") throw new Error("Approve the master before approving the Release Identity.");
      if (!album.short_description?.trim()) throw new Error("Add a short promotional description before approving the Release Identity.");
      const { data, error } = await db.from("studio_albums").update({ release_identity_status: "approved", status: "artwork_review", updated_at: new Date().toISOString() }).eq("id", album.id).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not approve the Release Identity.");
      return json({ album: data });
    }
    if (body.action === "list_cover_concepts") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { data, error } = await db.from("studio_assets").select("*").eq("album_id", album.id).eq("asset_type", "cover_art").eq("status", "active").order("version", { ascending: false });
      if (error) throw new Error(error.message);
      return json({ concepts: await Promise.all((data || []).map((asset: any) => coverWithUrl(db, asset))) });
    }
    if (body.action === "generate_cover_concept") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      return json({ concept: await generateStudioCover(db, album, body) }, 201);
    }
    if (body.action === "save_cover_composite") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.release_identity_status !== "approved") throw new Error("Approve the Release Identity before saving a titled cover.");
      const { data: source } = await db.from("studio_assets").select("*").eq("id", body.source_asset_id).eq("album_id", album.id).eq("asset_type", "cover_art").eq("status", "active").maybeSingle();
      if (!source) throw new Error("The source cover concept is unavailable.");
      const match = String(body.image_base64 || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new Error("The titled cover must be a PNG image.");
      const binary = atob(match[1]);
      if (binary.length > 15 * 1024 * 1024) throw new Error("The titled cover is larger than 15 MB.");
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) throw new Error("The titled cover PNG is invalid.");
      const { data: previous } = await db.from("studio_assets").select("version").eq("album_id", album.id).eq("asset_type", "cover_art").order("version", { ascending: false }).limit(1).maybeSingle();
      const version = Number(previous?.version || 0) + 1;
      const path = `studio/${ORG_ID}/albums/${album.id}/cover-concepts/cover-v${version}-titled.png`;
      const { error: uploadError } = await db.storage.from("studio-assets").upload(path, bytes, { contentType: "image/png", upsert: false });
      if (uploadError) throw new Error(`Could not store the titled cover: ${uploadError.message}`);
      const typography = {
        title: cleanText(body.typography?.title, 200),
        subtitle: cleanText(body.typography?.subtitle, 160),
        series: cleanText(body.typography?.series, 120) || "Rekkrd After Dark",
        treatment: cleanText(body.typography?.treatment, 80) || "riviera_editorial",
        vintage_border: body.typography?.vintage_border !== false,
        title_color: HEX_COLOR_RE.test(String(body.typography?.title_color || "")) ? body.typography.title_color : undefined,
        title_font: VALID_COVER_FONTS.has(String(body.typography?.title_font || "")) ? body.typography.title_font : undefined,
        subtitle_color: HEX_COLOR_RE.test(String(body.typography?.subtitle_color || "")) ? body.typography.subtitle_color : undefined,
        subtitle_font: VALID_COVER_FONTS.has(String(body.typography?.subtitle_font || "")) ? body.typography.subtitle_font : undefined,
        series_color: HEX_COLOR_RE.test(String(body.typography?.series_color || "")) ? body.typography.series_color : undefined,
        series_font: VALID_COVER_FONTS.has(String(body.typography?.series_font || "")) ? body.typography.series_font : undefined,
        text_v: ["top", "middle", "bottom"].includes(String(body.typography?.text_v || "")) ? body.typography.text_v : undefined,
        text_h: ["left", "center", "right"].includes(String(body.typography?.text_h || "")) ? body.typography.text_h : undefined,
      };
      if (!typography.title) throw new Error("Add the album title before saving the cover.");
      await clearCoverSelections(db, album.id);
      const { data: asset, error } = await db.from("studio_assets").insert({ album_id: album.id, asset_type: "cover_art", storage_bucket: "studio-assets", storage_path: path, mime_type: "image/png", file_size: bytes.byteLength, width: 1024, height: 1024, version, status: "active", metadata_json: { role: "titled_cover", selection_status: "selected", source_asset_id: source.id, typography } }).select("*").single();
      if (error || !asset) throw new Error(error?.message || "Could not register the titled cover.");
      await db.from("studio_albums").update({ artwork_status: "processing", updated_at: new Date().toISOString() }).eq("id", album.id);
      return json({ concept: await coverWithUrl(db, asset) }, 201);
    }
    if (body.action === "enhance_cover_concept") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.release_identity_status !== "approved") throw new Error("Approve the Release Identity before enhancing cover concepts.");
      const { data: source } = await db.from("studio_assets").select("*").eq("id", body.source_asset_id).eq("album_id", album.id).eq("asset_type", "cover_art").eq("status", "active").maybeSingle();
      if (!source) throw new Error("The source cover concept is unavailable.");
      const direction = cleanText(body.direction, 700);
      if (!direction) throw new Error("Describe what you want to enhance.");
      const { data: sourceBlob, error: downloadError } = await db.storage.from(source.storage_bucket).download(source.storage_path);
      if (downloadError || !sourceBlob) throw new Error(downloadError?.message || "Could not load the source cover.");
      const sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer());
      const prompt = `Edit the supplied square album-art photograph. Preserve its core subject identity, location, camera angle, photographic medium, period styling, lighting, and overall composition. Apply only this requested improvement: ${direction}. Keep exactly one adult woman if one is present. Preserve the real French Riviera / Côte d’Azur geography when present. Return a polished square image-only art plate. Do not add title text, words, letters, numbers, signage, labels, logos, watermark, signature, extra people, tropical jungle, waterfall, volcano, fantasy island, or generic Caribbean scenery.`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_EDIT_MODEL}:generateContent`, { method: "POST", headers: { "x-goog-api-key": Deno.env.get("GEMINI_API_KEY") || (await db.from("tenant_secrets").select("gemini_api_key").eq("organization_id", ORG_ID).maybeSingle()).data?.gemini_api_key || "", "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: source.mime_type || "image/png", data: bytesToBase64(sourceBytes) } }, { text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "1:1" } } }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Cover enhancement failed: ${JSON.stringify(payload).slice(0, 240)}`);
      const imagePart = payload?.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData?.data || part.inline_data?.data);
      const encoded = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
      if (!encoded) throw new Error("The image editor returned no enhanced image.");
      const enhancedBinary = atob(encoded);
      const enhancedBytes = Uint8Array.from(enhancedBinary, (char) => char.charCodeAt(0));
      const { data: previous } = await db.from("studio_assets").select("version").eq("album_id", album.id).eq("asset_type", "cover_art").order("version", { ascending: false }).limit(1).maybeSingle();
      const version = Number(previous?.version || 0) + 1;
      const path = `studio/${ORG_ID}/albums/${album.id}/cover-concepts/cover-v${version}-enhanced.png`;
      const { error: uploadError } = await db.storage.from("studio-assets").upload(path, enhancedBytes, { contentType: "image/png", upsert: false });
      if (uploadError) throw new Error(`Could not store the enhanced cover: ${uploadError.message}`);
      await clearCoverSelections(db, album.id);
      const { data: asset, error } = await db.from("studio_assets").insert({ album_id: album.id, asset_type: "cover_art", storage_bucket: "studio-assets", storage_path: path, mime_type: "image/png", file_size: enhancedBytes.byteLength, width: 1024, height: 1024, version, status: "active", metadata_json: { role: "cover_concept", selection_status: "selected", source_asset_id: source.id, enhancement_direction: direction, model: IMAGE_EDIT_MODEL } }).select("*").single();
      if (error || !asset) { await db.storage.from("studio-assets").remove([path]); throw new Error(error?.message || "Could not register the enhanced cover."); }
      return json({ concept: await coverWithUrl(db, asset) }, 201);
    }
    if (body.action === "delete_cover_concept") {
      const { data: asset } = await db.from("studio_assets").select("*").eq("id", body.asset_id).eq("asset_type", "cover_art").eq("status", "active").maybeSingle();
      if (!asset) throw new Error("Cover concept not found.");
      const album = await getOwnedAlbum(db, asset.album_id, user.id);
      if (asset.metadata_json?.selection_status === "approved") throw new Error("The approved cover cannot be deleted. Choose an unused concept instead.");
      // Checks for ANY active titled cover referencing this concept, not just an
      // approved one — a drafted-but-unapproved titled cover can still be approved
      // later, and its source must survive until then or approval leaves a dangling
      // source_asset_id (see the "clean source image ... unavailable" incident).
      const { data: dependents, error: dependencyError } = await db.from("studio_assets").select("id").eq("album_id", album.id).eq("asset_type", "cover_art").eq("status", "active").contains("metadata_json", { role: "titled_cover", source_asset_id: asset.id }).limit(1);
      if (dependencyError) throw new Error(dependencyError.message);
      if (dependents?.length) throw new Error("This concept is the source image for a titled cover and must be kept.");
      const { error } = await db.from("studio_assets").update({ status: "archived", metadata_json: { ...(asset.metadata_json || {}), selection_status: "unselected", deleted_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("id", asset.id);
      if (error) throw new Error(error.message);
      return json({ deleted: true, asset_id: asset.id });
    }
    if (body.action === "select_cover_concept") {
      const { data: asset, error } = await db.from("studio_assets").select("*").eq("id", body.asset_id).eq("asset_type", "cover_art").single();
      if (error || !asset) throw new Error("Cover concept not found.");
      const album = await getOwnedAlbum(db, asset.album_id, user.id);
      await clearCoverSelections(db, album.id);
      const { data, error: selectError } = await db.from("studio_assets").update({ metadata_json: { ...(asset.metadata_json || {}), selection_status: "selected" } }).eq("id", asset.id).select("*").single();
      if (selectError || !data) throw new Error(selectError?.message || "Could not select cover concept.");
      await db.from("studio_albums").update({ artwork_status: "processing", updated_at: new Date().toISOString() }).eq("id", album.id);
      return json({ concept: await coverWithUrl(db, data) });
    }
    if (body.action === "approve_cover") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { data: selectedCover } = await db.from("studio_assets").select("*").eq("album_id", album.id).eq("asset_type", "cover_art").eq("status", "active").contains("metadata_json", { selection_status: "selected" }).maybeSingle();
      if (!selectedCover) throw new Error("Select a cover concept before approving it.");
      if (selectedCover.metadata_json?.role !== "titled_cover") throw new Error("Finish and save the cover typography before approving it.");
      const sourceAssetId = selectedCover.metadata_json?.source_asset_id;
      if (sourceAssetId) {
        const { data: sourceStillActive } = await db.from("studio_assets").select("id").eq("id", sourceAssetId).eq("album_id", album.id).eq("asset_type", "cover_art").eq("status", "active").maybeSingle();
        if (!sourceStillActive) throw new Error("The clean source photo behind this titled cover was deleted. Recreate the typography from an available concept before approving.");
      }
      await db.from("studio_assets").update({ metadata_json: { ...(selectedCover.metadata_json || {}), selection_status: "approved" }, updated_at: new Date().toISOString() }).eq("id", selectedCover.id);
      await db.from("studio_assets").update({ status: "archived", updated_at: new Date().toISOString() }).eq("album_id", album.id).in("asset_type", ["scene_image", "final_video"]).in("status", ["pending", "processing", "active", "failed"]);
      await db.from("studio_jobs").update({ status: "cancelled", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("album_id", album.id).eq("job_type", "video_render").in("status", ["queued", "processing"]);
      const { data, error } = await db.from("studio_albums").update({ artwork_status: "approved", status: "animation_review", video_status: "not_started", metadata_status: "not_started", publishing_status: "not_started", updated_at: new Date().toISOString() }).eq("id", album.id).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not approve the cover.");
      return json({ album: data });
    }
    if (body.action === "list_video_sources") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { sourceConcept } = await approvedCoverSource(db, album);
      if (!sourceConcept) return json({ concepts: [] });
      const rows = await videoSourceList(db, album.id, sourceConcept.id);
      return json({ concepts: await Promise.all(rows.map((row: any) => coverWithUrl(db, row))) });
    }
    if (body.action === "get_video_source") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { sourceConcept } = await approvedCoverSource(db, album);
      if (!sourceConcept) return json({ concept: null });
      const existing = await selectedVideoSource(db, album.id, sourceConcept.id);
      return json({ concept: existing ? await coverWithUrl(db, existing) : null });
    }
    if (body.action === "generate_video_source") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.artwork_status !== "approved") throw new Error("Approve the cover before creating the video image.");
      const { sourceConcept } = await approvedCoverSource(db, album);
      if (!sourceConcept) throw new Error("The clean source photo behind the approved cover is unavailable.");
      const asset = await generateStudioVideoSource(db, album, sourceConcept);
      return json({ concept: await coverWithUrl(db, asset) }, 201);
    }
    if (body.action === "extend_cover_video_source") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.artwork_status !== "approved") throw new Error("Approve the cover before creating the video image.");
      const { sourceConcept } = await approvedCoverSource(db, album);
      if (!sourceConcept) throw new Error("The clean source photo behind the approved cover is unavailable.");
      const asset = await extendCoverToVideoSource(db, album, sourceConcept);
      return json({ concept: await coverWithUrl(db, asset) }, 201);
    }
    if (body.action === "upload_video_source") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.artwork_status !== "approved") throw new Error("Approve the cover before adding a video image.");
      const { sourceConcept } = await approvedCoverSource(db, album);
      if (!sourceConcept) throw new Error("The clean source photo behind the approved cover is unavailable.");
      const match = String(body.image_base64 || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new Error("The uploaded image must be a PNG.");
      const binary = atob(match[1]);
      if (binary.length > 15 * 1024 * 1024) throw new Error("The uploaded image is larger than 15 MB.");
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) throw new Error("The uploaded PNG is invalid.");
      const asset = await storeVideoSource(db, album, sourceConcept, bytes, { model: "upload", method: "uploaded" });
      return json({ concept: await coverWithUrl(db, asset) }, 201);
    }
    if (body.action === "select_video_source") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { data: chosen } = await db.from("studio_assets").select("*").eq("id", body.asset_id).eq("album_id", album.id).eq("asset_type", "scene_image").eq("status", "active").contains("metadata_json", { role: "video_source" }).maybeSingle();
      if (!chosen) throw new Error("That video image is no longer available.");
      await deselectVideoSources(db, album.id);
      const { data: updated, error } = await db.from("studio_assets").update({ metadata_json: { ...(chosen.metadata_json || {}), selection_status: "selected" }, updated_at: new Date().toISOString() }).eq("id", chosen.id).select("*").single();
      if (error || !updated) throw new Error(error?.message || "Could not select that video image.");
      return json({ concept: await coverWithUrl(db, updated) });
    }
    if (body.action === "delete_video_source") {
      const { data: asset } = await db.from("studio_assets").select("*").eq("id", body.asset_id).eq("asset_type", "scene_image").eq("status", "active").contains("metadata_json", { role: "video_source" }).maybeSingle();
      if (!asset) throw new Error("Video image not found.");
      const album = await getOwnedAlbum(db, asset.album_id, user.id);
      const { sourceConcept } = await approvedCoverSource(db, album);
      const remaining = (await videoSourceList(db, album.id, sourceConcept?.id || asset.metadata_json?.source_asset_id)).filter((row: any) => row.id !== asset.id);
      if (!remaining.length) throw new Error("Keep at least one video image. Generate another before removing this one.");
      await db.from("studio_assets").update({ status: "archived", metadata_json: { ...(asset.metadata_json || {}), selection_status: "unselected" }, updated_at: new Date().toISOString() }).eq("id", asset.id);
      // If the removed take was the selected one, promote the newest remaining.
      if (asset.metadata_json?.selection_status === "selected") {
        await db.from("studio_assets").update({ metadata_json: { ...(remaining[0].metadata_json || {}), selection_status: "selected" }, updated_at: new Date().toISOString() }).eq("id", remaining[0].id);
      }
      return json({ deleted: true, asset_id: asset.id });
    }
    if (body.action === "get_thumbnail") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { data: existing } = await db.from("studio_assets").select("*").eq("album_id", album.id).eq("asset_type", "thumbnail").eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle();
      return json({ concept: existing ? await coverWithUrl(db, existing) : null });
    }
    if (body.action === "save_thumbnail_composite") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.artwork_status !== "approved") throw new Error("Approve the cover before saving a thumbnail.");
      const match = String(body.image_base64 || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new Error("The thumbnail must be a PNG image.");
      const binary = atob(match[1]);
      if (binary.length > 15 * 1024 * 1024) throw new Error("The thumbnail is larger than 15 MB.");
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) throw new Error("The thumbnail PNG is invalid.");
      const typography = {
        title: cleanText(body.typography?.title, 200),
        subtitle: cleanText(body.typography?.subtitle, 160),
        title_color: /^#[0-9a-fA-F]{6}$/.test(String(body.typography?.title_color || "")) ? body.typography.title_color : undefined,
        title_font: VALID_COVER_FONTS.has(String(body.typography?.title_font || "")) ? body.typography.title_font : undefined,
        text_v: ["top", "middle", "bottom"].includes(String(body.typography?.text_v || "")) ? body.typography.text_v : undefined,
        text_h: ["left", "center", "right"].includes(String(body.typography?.text_h || "")) ? body.typography.text_h : undefined,
      };
      if (!typography.title) throw new Error("Add the title before saving the thumbnail.");
      const { data: previous } = await db.from("studio_assets").select("version").eq("album_id", album.id).eq("asset_type", "thumbnail").order("version", { ascending: false }).limit(1).maybeSingle();
      const version = Number(previous?.version || 0) + 1;
      const path = `studio/${ORG_ID}/albums/${album.id}/thumbnail/thumb-v${version}.png`;
      const { error: uploadError } = await db.storage.from("studio-assets").upload(path, bytes, { contentType: "image/png", upsert: false });
      if (uploadError) throw new Error(`Could not store the thumbnail: ${uploadError.message}`);
      // Only one thumbnail stays active — it's what publishing sends to YouTube.
      await db.from("studio_assets").update({ status: "archived", updated_at: new Date().toISOString() }).eq("album_id", album.id).eq("asset_type", "thumbnail").eq("status", "active");
      const { data: asset, error } = await db.from("studio_assets").insert({ album_id: album.id, asset_type: "thumbnail", storage_bucket: "studio-assets", storage_path: path, mime_type: "image/png", file_size: bytes.byteLength, width: 1280, height: 720, version, status: "active", metadata_json: { role: "thumbnail", typography } }).select("*").single();
      if (error || !asset) throw new Error(error?.message || "Could not register the thumbnail.");
      return json({ concept: await coverWithUrl(db, asset) }, 201);
    }
    if (body.action === "prepare_visual_production") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.artwork_status !== "approved") throw new Error("Approve the cover before preparing Visual Production.");
      if (album.master_status !== "approved") throw new Error("Approve the master before preparing Visual Production.");
      const motion = String(body.motion || "ken_burns").slice(0, 80);
      const direction = String(body.direction || "Subtle cinematic movement that preserves the approved cover composition.").trim().slice(0, 500);
      const { approvedCover, sourceConcept } = await approvedCoverSource(db, album);
      if (!approvedCover) throw new Error("Approve the cover before rendering the final video.");
      if (!sourceConcept) throw new Error("The clean source photo behind the approved cover is unavailable.");
      // The video never derives from the square typography'd cover — it renders
      // a native 16:9, text-free companion photo generated from the same scene
      // (same pattern as the Episodes pipeline: born the right shape, so the
      // worker never has to crop away or letterbox around anything meaningful).
      let videoSource = await selectedVideoSource(db, album.id, sourceConcept.id);
      if (!videoSource) videoSource = await generateStudioVideoSource(db, album, sourceConcept);
      // Optionally burn the title onto the video too: render from the titled
      // thumbnail (1280x720, exact 16:9) instead of the clean image. Falls back
      // to the clean image if the option is off or no thumbnail was designed.
      let renderSource = videoSource;
      let showTitleOnVideo = false;
      if (body.use_thumbnail === true) {
        const { data: thumb } = await db.from("studio_assets").select("id, storage_path, storage_bucket").eq("album_id", album.id).eq("asset_type", "thumbnail").eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle();
        if (thumb) { renderSource = thumb; showTitleOnVideo = true; }
      }
      const { data: master } = await db.from("studio_assets").select("id, storage_path, storage_bucket").eq("album_id", album.id).eq("asset_type", "master_mp3").is("track_id", null).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!master) throw new Error("The approved master is required before preparing Visual Production.");
      const { data: activeJob } = await db.from("studio_jobs").select("id").eq("album_id", album.id).eq("job_type", "video_render").in("status", ["queued", "processing"]).maybeSingle();
      if (activeJob) throw new Error("A video render is already in progress.");
      const { data: previous } = await db.from("studio_assets").select("version").eq("album_id", album.id).eq("asset_type", "final_video").order("version", { ascending: false }).limit(1).maybeSingle();
      const version = Number(previous?.version || 0) + 1;
      const storagePath = `studio/${ORG_ID}/albums/${album.id}/video/final-v${version}.mp4`;
      const metadata = { role: "visual_production", motion, direction, cover_asset_id: approvedCover.id, video_source_asset_id: videoSource.id, render_source_asset_id: renderSource.id, show_title_on_video: showTitleOnVideo, master_asset_id: master.id, artwork_layout: "full_bleed_16x9", worker: { stage: "queued", progress: 0, message: "Waiting for the video worker" } };
      const { data: asset, error: assetError } = await db.from("studio_assets").insert({ album_id: album.id, asset_type: "final_video", storage_bucket: "studio-assets", storage_path: storagePath, mime_type: "video/mp4", version, status: "pending", metadata_json: metadata }).select("*").single();
      if (assetError || !asset) throw new Error(assetError?.message || "Could not create the video asset.");
      const { data: job, error: jobError } = await db.from("studio_jobs").insert({ album_id: album.id, job_type: "video_render", status: "queued", progress: 0, provider: "ffmpeg_video_worker", attempt_count: 1, input_json: { asset_id: asset.id, render_source_asset_id: renderSource.id, master_asset_id: master.id, motion, direction, artwork_layout: "full_bleed_16x9", storage_path: storagePath } }).select("*").single();
      if (jobError || !job) {
        await db.from("studio_assets").update({ status: "failed", error_message: jobError?.message || "Could not register the video render job.", updated_at: new Date().toISOString() }).eq("id", asset.id);
        throw new Error(jobError?.message || "Could not register the video render job.");
      }
      const failQueuedVideo = async (message: string) => {
        const now = new Date().toISOString();
        await Promise.all([
          db.from("studio_assets").update({ status: "failed", error_message: message, updated_at: now }).eq("id", asset.id),
          db.from("studio_jobs").update({ status: "failed", error_message: message, completed_at: now, updated_at: now }).eq("id", job.id),
          db.from("studio_albums").update({ video_status: "failed", status: "video_review", updated_at: now }).eq("id", album.id),
        ]);
      };
      const [{ data: signedCover, error: coverSignError }, { data: signedMaster, error: masterSignError }] = await Promise.all([
        db.storage.from(renderSource.storage_bucket).createSignedUrl(renderSource.storage_path, 60 * 60),
        db.storage.from(master.storage_bucket).createSignedUrl(master.storage_path, 60 * 60),
      ]);
      if (coverSignError || masterSignError || !signedCover?.signedUrl || !signedMaster?.signedUrl) {
        const message = `Could not prepare private Studio assets for the video worker: ${coverSignError?.message || masterSignError?.message || "signed URL unavailable"}`;
        await failQueuedVideo(message);
        throw new Error(message);
      }
      const { data, error } = await db.from("studio_albums").update({ video_status: "queued", status: "video_rendering", metadata_status: "not_started", publishing_status: "not_started", updated_at: new Date().toISOString() }).eq("id", album.id).select("*").single();
      if (error || !data) {
        const message = error?.message || "Could not prepare Visual Production.";
        await failQueuedVideo(message);
        throw new Error(message);
      }
      let response: Response;
      try {
        response = await fetch(VIDEO_RENDER_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipeline: "studio", asset_id: asset.id, job_id: job.id, album_id: album.id, organization_id: ORG_ID, master_audio_url: signedMaster.signedUrl, cover_image_url: signedCover.signedUrl, artwork_layout: "full_bleed_16x9", storage_bucket: "studio-assets", storage_path: storagePath, motion }) });
      } catch (dispatchError) {
        const message = `Could not reach the video worker: ${dispatchError instanceof Error ? dispatchError.message : "network error"}`;
        await failQueuedVideo(message);
        throw new Error(message);
      }
      if (!response.ok) {
        const message = `Video worker rejected the job (${response.status}): ${(await response.text()).slice(0, 240)}`;
        await failQueuedVideo(message);
        throw new Error(message);
      }
      return json({ album: data });
    }
    if (body.action === "approve_video") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const { data: asset } = await db.from("studio_assets").select("id,metadata_json").eq("album_id", album.id).eq("asset_type", "final_video").eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle();
      if (!asset) throw new Error("Render the final video before approving it.");
      if (!asset.metadata_json?.artwork_layout) throw new Error("This render predates artwork layout tracking. Render again before approving.");
      const { data, error } = await db.from("studio_albums").update({ video_status: "approved", status: "metadata_review", metadata_status: "not_started", updated_at: new Date().toISOString() }).eq("id", album.id).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not approve the video.");
      return json({ album: data });
    }
    if (body.action === "prepare_publication") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const youtubeAccountId = String(body.youtube_account_id || "").trim();
      if (!youtubeAccountId) throw new Error("Choose an active YouTube channel before preparing publishing metadata.");
      return json({ publication: await preparePublicationDraft(db, album, user.id, youtubeAccountId) });
    }
    if (body.action === "save_publication") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.video_status !== "approved") throw new Error("Approve the final video before editing publishing metadata.");
      const existing = await publicationForAlbum(db, album.id);
      if (!existing) throw new Error("Prepare publishing metadata first.");
      if (["submitting", "live"].includes(existing.status)) throw new Error("Publishing metadata is locked after submission.");
      const input = body.publication || {};
      const title = cleanText(input.title, 95);
      const description = String(input.description || "").trim().slice(0, 4900);
      const tags = publicationTags(input.tags);
      const visibility = ["private", "unlisted", "public"].includes(input.visibility) ? input.visibility : "private";
      if (input.scheduled_for) throw new Error("Scheduled YouTube publishing is not enabled yet. Leave the schedule blank and submit explicitly when ready.");
      const scheduledFor: string | null = null;
      const youtubeAccountId = String(body.youtube_account_id || "").trim();
      if (!youtubeAccountId) throw new Error("Choose an active YouTube channel before saving publishing metadata.");
      if (!title || !description) throw new Error("A publishing title and description are required.");
      const { data, error } = await db.from("studio_publications").update({ youtube_account_id: youtubeAccountId, title, description, tags, visibility, made_for_kids: input.made_for_kids === true, scheduled_for: scheduledFor, status: "draft", error_message: null, updated_at: new Date().toISOString() }).eq("id", existing.id).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not save publishing metadata.");
      await db.from("studio_albums").update({ metadata_status: "pending_review", publishing_status: "not_started", status: "metadata_review", updated_at: new Date().toISOString() }).eq("id", album.id);
      return json({ publication: data });
    }
    if (body.action === "approve_publication") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      if (album.video_status !== "approved") throw new Error("Approve the final video before approving publishing metadata.");
      const existing = await publicationForAlbum(db, album.id);
      if (!existing || existing.status !== "draft") throw new Error("Save a publishing draft before approving it.");
      if (!existing.title?.trim() || !existing.description?.trim()) throw new Error("A publishing title and description are required.");
      const now = new Date().toISOString();
      const { data, error } = await db.from("studio_publications").update({ status: "ready", error_message: null, updated_at: now }).eq("id", existing.id).select("*").single();
      if (error || !data) throw new Error(error?.message || "Could not approve publishing metadata.");
      await db.from("studio_albums").update({ metadata_status: "approved", publishing_status: "ready", status: "ready_to_publish", updated_at: now }).eq("id", album.id);
      return json({ publication: data });
    }
    if (body.action === "publish_album") {
      const album = await getOwnedAlbum(db, body.album_id, user.id);
      const publication = await publicationForAlbum(db, album.id);
      if (!publication || !["ready", "failed"].includes(publication.status) || album.metadata_status !== "approved" || album.video_status !== "approved") throw new Error("Approve the video and publishing metadata before submission.");
      const youtubeAccountId = String(body.youtube_account_id || "").trim();
      if (!youtubeAccountId) throw new Error("Choose an active YouTube channel before submission.");
      const { data: youtubeAccount } = await db.from("branch_social_accounts").select("id,branch_id,platform,status").eq("id", youtubeAccountId).maybeSingle();
      const { data: youtubeBranch } = youtubeAccount?.branch_id
        ? await db.from("branches").select("slug").eq("id", youtubeAccount.branch_id).maybeSingle()
        : { data: null };
      if (!youtubeAccount || youtubeAccount.platform !== "youtube" || youtubeAccount.status !== "active" || youtubeBranch?.slug !== "rekkrd") {
        throw new Error("The selected YouTube channel is not active for Rekkrd.");
      }
      // Resolve the CURRENT active video and thumbnail, not the ids captured when
      // the draft was prepared — re-rendering after prepare archives the old ones,
      // and the stored reference would otherwise point at an archived asset.
      const { data: video } = await db.from("studio_assets").select("*").eq("album_id", album.id).eq("asset_type", "final_video").eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle();
      if (!video) throw new Error("The approved video asset is unavailable.");
      const { data: signedVideo, error: videoSignError } = await db.storage.from(video.storage_bucket).createSignedUrl(video.storage_path, 60 * 60 * 6);
      let thumbnailUrl: string | null = null;
      const { data: thumbnail } = await db.from("studio_assets").select("storage_bucket,storage_path").eq("album_id", album.id).eq("asset_type", "thumbnail").eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle();
      if (thumbnail) thumbnailUrl = (await db.storage.from(thumbnail.storage_bucket).createSignedUrl(thumbnail.storage_path, 60 * 60 * 6)).data?.signedUrl || null;
      if (videoSignError || !signedVideo?.signedUrl) throw new Error("Could not prepare the private video for publishing.");
      const { data: job, error: jobError } = await db.from("studio_jobs").insert({ album_id: album.id, job_type: "publishing_handoff", status: "queued", progress: 0, provider: "n8n_youtube", attempt_count: 1, input_json: { publication_id: publication.id, video_asset_id: video.id, youtube_account_id: youtubeAccountId } }).select("*").single();
      if (jobError || !job) throw new Error(jobError?.message || "Could not register the publishing handoff.");
      const now = new Date().toISOString();
      const { data: submitting } = await db.from("studio_publications").update({ youtube_account_id: youtubeAccountId, status: "submitting", submitted_at: now, error_message: null, updated_at: now }).eq("id", publication.id).select("*").single();
      await db.from("studio_albums").update({ publishing_status: "submitted", status: "publishing", updated_at: now }).eq("id", album.id);
      let response: Response;
      try {
        response = await fetch(STUDIO_PUBLISH_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipeline: "studio", publication_id: publication.id, job_id: job.id, album_id: album.id, organization_id: ORG_ID, platform: "youtube", youtube_account_id: youtubeAccountId, video_url: signedVideo.signedUrl, thumbnail_url: thumbnailUrl, visibility: publication.visibility, made_for_kids: publication.made_for_kids, scheduled_for: publication.scheduled_for, metadata: { title: publication.title, description: publication.description, tags: publication.tags, chapters: [] } }) });
      } catch (dispatchError) {
        const message = `Could not reach the publishing workflow: ${dispatchError instanceof Error ? dispatchError.message : "network error"}`;
        await Promise.all([db.from("studio_publications").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", publication.id), db.from("studio_jobs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id), db.from("studio_albums").update({ publishing_status: "failed", status: "ready_to_publish", updated_at: new Date().toISOString() }).eq("id", album.id)]);
        throw new Error(message);
      }
      if (!response.ok) {
        const message = `Publishing workflow rejected the job (${response.status}): ${(await response.text()).slice(0, 240)}`;
        await Promise.all([db.from("studio_publications").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", publication.id), db.from("studio_jobs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id), db.from("studio_albums").update({ publishing_status: "failed", status: "ready_to_publish", updated_at: new Date().toISOString() }).eq("id", album.id)]);
        throw new Error(message);
      }
      return json({ publication: submitting });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Studio track operation failed.";
    console.error("studio-albums action failed", { action: body.action || "unknown", message });
    return json({ error: message }, 400);
  }
  return json({ error: "Unknown action" }, 400);
});
