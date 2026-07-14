import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

function fallback(album: any, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    title: `${album.title} — ${index === 0 ? "Opening Signal" : `Movement ${index + 1}`}`,
    prompt: `Original ${album.genre || "instrumental"} piece with ${album.mood || "a cohesive"} feel, ${album.vocal_direction === "instrumental" ? "instrumental arrangement" : album.vocal_direction}, clean studio production, ${72 + (index % 5) * 4} BPM.`,
    narrative_purpose: index === 0 ? "Opening statement" : index === count - 1 ? "Closing resolution" : "Cohesive album movement",
    energy: Math.min(8, Math.max(3, 5 + ((index % 5) - 2))),
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization"); if (!auth) return json({ error: "Authentication required" }, 401);
  const client = createClient(URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await client.auth.getUser(); if (!user) return json({ error: "Authentication required" }, 401);
  const db = createClient(URL, SERVICE_KEY); const body = await req.json().catch(() => ({})); const count = Math.max(2, Math.min(24, Number(body.track_count) || 8));
  const { data: flag } = await db.from("studio_feature_flags").select("enabled, enabled_for_user_ids").eq("organization_id", ORG_ID).eq("key", "studio_music_enabled").single();
  if (!flag || (!flag.enabled && !(Array.isArray(flag.enabled_for_user_ids) && flag.enabled_for_user_ids.includes(user.id)))) return json({ error: "Trellis Studio Albums is not enabled for this account." }, 403);
  const { data: album } = await db.from("studio_albums").select("*").eq("id", body.album_id).eq("organization_id", ORG_ID).eq("created_by", user.id).maybeSingle();
  if (!album) return json({ error: "Album not found." }, 404);
  const { count: existing } = await db.from("studio_tracks").select("id", { count: "exact", head: true }).eq("album_id", album.id);
  if ((existing || 0) > 0) return json({ error: "This album already has tracks. Batch planning is intentionally a one-time approval gate for now." }, 409);
  const fallbackPlan = fallback(album, count);
  const key = Deno.env.get("GEMINI_API_KEY") || (await db.from("tenant_secrets").select("gemini_api_key").eq("organization_id", ORG_ID).maybeSingle()).data?.gemini_api_key;
  let plan = fallbackPlan;
  if (key) try {
    const prompt = `Create exactly ${count} original tracks for one cohesive AI music album. Return only a JSON array of objects: {"title":"...","prompt":"...","narrative_purpose":"...","energy":1-10}. Album: ${album.title}; fictional artist: ${album.artist_name}; genre: ${album.genre || "open"}; mood: ${album.mood || "open"}; era: ${album.era || "open"}; setting: ${album.theme || "open"}; vocals: ${album.vocal_direction}. Each prompt is one concise 15–30 word sentence describing instruments, style, mood, and BPM. No real artists, songs, brands, franchises, lyrics, or unsafe themes.`;
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }) });
    const payload = response.ok ? await response.json() : null; const generated = JSON.parse(payload?.candidates?.[0]?.content?.parts?.[0]?.text || "[]");
    if (Array.isArray(generated) && generated.length === count) plan = generated.map((item, index) => ({ ...fallbackPlan[index], title: String(item.title || fallbackPlan[index].title).slice(0, 120), prompt: String(item.prompt || fallbackPlan[index].prompt).replace(/\s+/g, " ").trim().slice(0, 400), narrative_purpose: String(item.narrative_purpose || fallbackPlan[index].narrative_purpose).slice(0, 180), energy: Math.max(1, Math.min(10, Number(item.energy) || fallbackPlan[index].energy)) }));
  } catch { /* deterministic fallback remains usable */ }
  const { data: tracks, error } = await db.from("studio_tracks").insert(plan.map((item, index) => ({ album_id: album.id, track_number: index + 1, title: item.title, prompt: item.prompt, narrative_purpose: item.narrative_purpose, energy: item.energy, duration_seconds: Math.min(165, Math.max(30, Math.round(album.target_duration_seconds / count))), vocal_direction: album.vocal_direction, review_status: "planned" }))).select("*");
  if (error) return json({ error: error.message }, 500);
  await db.from("studio_albums").update({ status: "planning", updated_at: new Date().toISOString() }).eq("id", album.id);
  return json({ tracks });
});
