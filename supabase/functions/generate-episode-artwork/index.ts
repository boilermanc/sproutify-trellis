import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Storage rejects sb_secret_ keys ("Invalid Compact JWS"); if the injected key is the
// new format, set STORAGE_JWT to a legacy service_role JWT (eyJ...) as a fallback.
const STORAGE_JWT = Deno.env.get("STORAGE_JWT") || SERVICE_KEY;
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const IMAGE_MODEL = Deno.env.get("IMAGE_MODEL") || "imagen-4.0-generate-001";
const TEXT_MODEL = Deno.env.get("TEXT_MODEL") || "gemini-2.5-flash";
const BUCKET = "episode-assets";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

// Default house style + setting if the caller doesn't pass one (see EPISODE_ART_STYLES).
const DEFAULT_STYLE =
  "1960s mid-century illustrated cover art, hand-painted gouache figures with cinematic contrast, " +
  "expressive visible brushwork, glamorous Riviera scene, elegant figures in vintage haute couture, " +
  "classic European sports car, warm sun-drenched palette with bold teal and crimson accents, romantic " +
  "and sophisticated, in the style of vintage Robert McGinnis paperback covers and 1960s film posters. " +
  "No text, no words, no lettering, no logos, no watermark, no signature. " +
  "No smoking, no cigarettes, no cigars, no tobacco, no smoke, no vapor, no ashtrays, no drug references.";
const DEFAULT_SETTING = "the glamorous 1960s Mediterranean / Riviera world";

const NO_SMOKING =
  "No smoking, no cigarettes, no cigars, no tobacco, no smoke, no vapor, no ashtrays, no drug references.";
const NO_ALCOHOL =
  "No alcohol, no cocktails, no wine, no beer, no liquor bottles, no bar shelves, no drinking glasses.";
const ALCOHOL_ALLOWED =
  "Alcoholic drinks may appear only as elegant background props, such as one cocktail glass or a lounge drink. No drunkenness, intoxication, or irresponsible drinking.";

function sanitizeSceneText(value?: string, allowAlcohol = true): string {
  let clean = (value || "")
    .replace(/\bsmoky\b/gi, "moody")
    .replace(/\bsmoke[-\s]?filled\b/gi, "low-lit")
    .replace(/\bsmoke\b/gi, "atmosphere")
    .replace(/\bcigarettes?\b/gi, "")
    .replace(/\bcigars?\b/gi, "")
    .replace(/\btobacco\b/gi, "")
    .replace(/\bashtrays?\b/gi, "")
    .replace(/\bdrugs?\b/gi, "")
    .replace(/\bnarcotics?\b/gi, "");

  if (!allowAlcohol) {
    clean = clean
      .replace(/\balcohol\b/gi, "")
      .replace(/\bcocktails?\b/gi, "")
      .replace(/\bwine\b/gi, "")
      .replace(/\bbeer\b/gi, "")
      .replace(/\bliquor\b/gi, "")
      .replace(/\bmartinis?\b/gi, "")
      .replace(/\bmojitos?\b/gi, "")
      .replace(/\bbar\b/gi, "lounge")
      .replace(/\bdrinks?\b/gi, "refreshments");
  }

  return clean.replace(/\s{2,}/g, " ").trim();
}

function aspectFor(w?: number, h?: number): string {
  if (!w || !h) return "16:9";
  const r = w / h;
  if (r > 1.5) return "16:9";
  if (r < 0.7) return "9:16";
  if (r > 1.2) return "4:3";
  if (r < 0.85) return "3:4";
  return "1:1";
}

async function gemini(path: string, body: unknown, key: string): Promise<any> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google ${res.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

async function writeScene(title: string, theme: string, extra: string, setting: string, alcoholInstruction: string, allowAlcohol: boolean, key: string): Promise<string> {
  try {
    const cleanTitle = sanitizeSceneText(title, allowAlcohol);
    const cleanTheme = sanitizeSceneText(theme, allowAlcohol);
    const cleanExtra = sanitizeSceneText(extra, allowAlcohol);
    const prompt =
      `Write ONE vivid visual scene (a single sentence, no preamble, no quotes) for the cover art of a ` +
      `music episode titled "${cleanTitle}"${cleanTheme ? ` with the theme "${cleanTheme}"` : ""}. ` +
      `${cleanExtra ? cleanExtra + " " : ""}Set it in ${setting} — describe the setting, one or two evocative subjects, ` +
      `and a period-appropriate detail. ${NO_SMOKING} ${alcoholInstruction} Do NOT mention art style, medium, or the word 'cover'. Just the scene.`;
    const j = await gemini(`models/${TEXT_MODEL}:generateContent`, { contents: [{ parts: [{ text: prompt }] }] }, key);
    return sanitizeSceneText(j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "", allowAlcohol);
  } catch (e) {
    console.error("scene expansion failed (non-fatal):", (e as Error).message);
    return "";
  }
}

async function renderImage(prompt: string, aspect: string, key: string): Promise<Uint8Array> {
  const j = await gemini(`models/${IMAGE_MODEL}:predict`, {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: aspect },
  }, key);
  const b64 = j?.predictions?.[0]?.bytesBase64Encoded || j?.predictions?.[0]?.image?.imageBytes;
  if (!b64) throw new Error(`No image bytes returned: ${JSON.stringify(j).slice(0, 300)}`);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function upload(supabase: any, path: string, bytes: Uint8Array): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { apikey: STORAGE_JWT, Authorization: `Bearer ${STORAGE_JWT}`, "Content-Type": "image/png", "x-upsert": "true" },
      body: bytes,
    });
    if (!res.ok) throw new Error(`Upload failed (${error.message}) / raw ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: true });
  const body = await req.json().catch(() => ({}));
  const {
    asset_id, episode_id, asset_type = "cover_art", width, height,
    title = "", theme = "", prompt: extra = "",
    style_prompt = DEFAULT_STYLE, setting = DEFAULT_SETTING,
    alcohol_policy = "allow", allow_alcohol,
  } = body;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const fail = async (msg: string) => {
    console.error("artwork error:", msg);
    if (asset_id) await supabase.from("trellis_episode_assets").update({ status: "failed", error_message: msg.slice(0, 500) }).eq("id", asset_id);
    return json({ ok: false, error: msg }, 500);
  };

  try {
    if (asset_id) await supabase.from("trellis_episode_assets").update({ status: "processing" }).eq("id", asset_id);

    const { data: sec } = await supabase.from("tenant_secrets").select("gemini_api_key").eq("organization_id", ORG_ID).single();
    const key = sec?.gemini_api_key;
    if (!key) return await fail("No gemini_api_key in tenant_secrets");

    const allowsAlcohol = typeof allow_alcohol === "boolean" ? allow_alcohol : alcohol_policy !== "exclude";
    const alcoholInstruction = allowsAlcohol ? ALCOHOL_ALLOWED : NO_ALCOHOL;
    const scene = await writeScene(title, theme, extra, setting, alcoholInstruction, allowsAlcohol, key);
    const finalPrompt = `${scene || sanitizeSceneText(extra, allowsAlcohol) || sanitizeSceneText(title, allowsAlcohol) || "A glamorous vintage scene"}. ${style_prompt} ${NO_SMOKING} ${alcoholInstruction}`;
    const aspect = aspectFor(width, height);
    const bytes = await renderImage(finalPrompt, aspect, key);

    const path = asset_id && episode_id ? `${episode_id}/${asset_type}.png` : `_test/${crypto.randomUUID()}.png`;
    const url = await upload(supabase, path, bytes);

    if (asset_id) {
      await supabase.from("trellis_episode_assets").update({
        status: "ready", url, storage_bucket: BUCKET, storage_path: path,
        metadata: { prompt: finalPrompt, aspect, model: IMAGE_MODEL, scene, style_prompt, setting, alcohol_policy: allowsAlcohol ? "allow" : "exclude" }, updated_at: new Date().toISOString(),
      }).eq("id", asset_id);
    }

    return json({ ok: true, url, aspect, model: IMAGE_MODEL, scene });
  } catch (e) {
    return await fail((e as Error).message);
  }
});
