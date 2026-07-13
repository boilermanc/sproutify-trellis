import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

function fallback(album: any, number: number) {
  return {
    title: `${album.title} — ${number === 1 ? "Opening Signal" : `Movement ${number}`}`,
    prompt: `Original ${album.genre || "instrumental"} piece with ${album.mood || "a cohesive"} feel, ${album.vocal_direction === "instrumental" ? "instrumental arrangement" : album.vocal_direction}, clean studio production, ${72 + ((number - 1) % 5) * 4} BPM.`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Authentication required" }, 401);
  const client = createClient(URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return json({ error: "Authentication required" }, 401);
  const db = createClient(URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const { data: flag } = await db.from("studio_feature_flags").select("enabled, enabled_for_user_ids").eq("organization_id", ORG_ID).eq("key", "studio_music_enabled").single();
  if (!flag || (!flag.enabled && !(Array.isArray(flag.enabled_for_user_ids) && flag.enabled_for_user_ids.includes(user.id)))) return json({ error: "Trellis Studio Albums is not enabled for this account." }, 403);
  const { data: album, error } = await db.from("studio_albums").select("*").eq("id", body.album_id).eq("organization_id", ORG_ID).eq("created_by", user.id).maybeSingle();
  if (error || !album) return json({ error: "Album not found." }, 404);
  const { data: last } = await db.from("studio_tracks").select("track_number").eq("album_id", album.id).order("track_number", { ascending: false }).limit(1).maybeSingle();
  const number = (last?.track_number || 0) + 1;
  const fallbackPlan = fallback(album, number);
  const key = Deno.env.get("GEMINI_API_KEY") || (await db.from("tenant_secrets").select("gemini_api_key").eq("organization_id", ORG_ID).maybeSingle()).data?.gemini_api_key;
  if (!key) return json({ track: fallbackPlan });
  const prompt = `Create one original next track for this AI music album. Return only JSON: {"title":"...","prompt":"..."}. Album: ${album.title}; fictional artist: ${album.artist_name}; genre: ${album.genre || "open"}; mood: ${album.mood || "open"}; era: ${album.era || "open"}; setting: ${album.theme || "open"}; vocals: ${album.vocal_direction}; track number: ${number}. Title must be short and original. Prompt must be one concise 15–30 word sentence about instruments, style, mood, and BPM. Do not mention real artists, songs, brands, franchises, lyrics, or unsafe themes.`;
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }) });
    const payload = response.ok ? await response.json() : null;
    const plan = JSON.parse(payload?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    return json({ track: plan?.title && plan?.prompt ? { title: String(plan.title).slice(0, 120), prompt: String(plan.prompt).replace(/\s+/g, " ").trim().slice(0, 400) } : fallbackPlan });
  } catch { return json({ track: fallbackPlan }); }
});
