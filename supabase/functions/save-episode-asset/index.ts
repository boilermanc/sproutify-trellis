import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STORAGE_JWT = Deno.env.get("STORAGE_JWT") || SERVICE_KEY;
const BUCKET = "episode-assets";

// Saves a client-rendered PNG (e.g. a titled thumbnail composited in the browser)
// to the episode-assets bucket and records a ready asset row.
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
  const { episode_id, asset_type = "thumbnail", image_base64, width = 1280, height = 720, metadata = {} } = body;

  if (!episode_id || !image_base64) {
    return new Response(JSON.stringify({ ok: false, error: "episode_id and image_base64 required" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  try {
    const b64 = String(image_base64).replace(/^data:image\/\w+;base64,/, "");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const path = `${episode_id}/${asset_type}.png`;
    const url = await upload(supabase, path, bytes);

    const { data: asset, error } = await supabase.from("trellis_episode_assets").insert({
      episode_id, asset_type, status: "ready", url, storage_bucket: BUCKET, storage_path: path,
      width, height, metadata,
    }).select("*").single();
    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ ok: true, url, asset }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
