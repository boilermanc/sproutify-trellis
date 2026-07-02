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

// Default house style + setting if the caller doesn't pass one (see EPISODE_ART_STYLES).
const DEFAULT_STYLE =
  "1960s mid-century illustrated cover art, hand-painted gouache figures with cinematic contrast, " +
  "expressive visible brushwork, glamorous Riviera scene, elegant figures in vintage haute couture, " +
  "classic European sports car, warm sun-drenched palette with bold teal and crimson accents, romantic " +
  "and sophisticated, in the style of vintage Robert McGinnis paperback covers and 1960s film posters. " +
  "No text, no words, no lettering, no logos, no watermark, no signature.";
const DEFAULT_SETTING = "the glamorous 1960s Mediterranean / Riviera world";

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
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

async function writeScene(title: string, theme: string, extra: string, setting: string, key: string): Promise<string> {
  try {
    const prompt =
      `Write ONE vivid visual scene (a single sentence, no preamble, no quotes) for the cover art of a ` +
      `music episode titled "${title}"${theme ? ` with the theme "${theme}"` : ""}. ` +
      `${extra ? extra + " " : ""}Set it in ${setting} — describe the setting, one or two evocative subjects, ` +
      `and a period-appropriate detail. Do NOT mention art style, medium, or the word 'cover'. Just the scene.`;
    const j = await gemini(`models/${TEXT_MODEL}:generateContent`, { contents: [{ parts: [{ text: prompt }] }] }, key);
    const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return txt || "";
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
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const body = await req.json().catch(() => ({}));
  const {
    asset_id, episode_id, asset_type = "cover_art", width, height,
    title = "", theme = "", prompt: extra = "",
    style_prompt = DEFAULT_STYLE, setting = DEFAULT_SETTING,
  } = body;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const fail = async (msg: string) => {
    console.error("artwork error:", msg);
    if (asset_id) await supabase.from("trellis_episode_assets").update({ status: "failed", error_message: msg.slice(0, 500) }).eq("id", asset_id);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "content-type": "application/json" } });
  };

  try {
    if (asset_id) await supabase.from("trellis_episode_assets").update({ status: "processing" }).eq("id", asset_id);

    const { data: sec } = await supabase.from("tenant_secrets").select("gemini_api_key").eq("organization_id", ORG_ID).single();
    const key = sec?.gemini_api_key;
    if (!key) return await fail("No gemini_api_key in tenant_secrets");

    const scene = await writeScene(title, theme, extra, setting, key);
    const finalPrompt = `${scene || extra || title || "A glamorous vintage scene"}. ${style_prompt}`;
    const aspect = aspectFor(width, height);
    const bytes = await renderImage(finalPrompt, aspect, key);

    const path = asset_id && episode_id ? `${episode_id}/${asset_type}.png` : `_test/${crypto.randomUUID()}.png`;
    const url = await upload(supabase, path, bytes);

    if (asset_id) {
      await supabase.from("trellis_episode_assets").update({
        status: "ready", url, storage_bucket: BUCKET, storage_path: path,
        metadata: { prompt: finalPrompt, aspect, model: IMAGE_MODEL, scene, style_prompt, setting }, updated_at: new Date().toISOString(),
      }).eq("id", asset_id);
    }

    return new Response(JSON.stringify({ ok: true, url, aspect, model: IMAGE_MODEL, scene }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return await fail((e as Error).message);
  }
});
