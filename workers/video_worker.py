#!/usr/bin/env python3
"""
Trellis Episodes — video render worker
======================================
Renders a static-image music video (cover image + master audio -> mp4) with
ffmpeg, uploads to the episode-assets bucket, and marks the episode asset ready.
Runs on the IONOS VPS alongside stitch_worker.py.

Run:
    pip install -r requirements.txt      # needs ffmpeg on PATH
    export SUPABASE_URL=https://horvjqqifgrzxesuxtfm.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=...
    export ASSET_BUCKET=episode-assets
    python video_worker.py               # serves on :8100

Webhook contract (POST /video — matches EPISODE_VIDEO_WEBHOOK / episodeService.buildVideo):
    { "asset_id","episode_id","branch","master_audio_url","cover_image_url" }
Responds 202; renders in a background thread.

FUTURE: swap the static-image filter for animated backgrounds, waveform,
vinyl spin, rain/fireplace loops, subtle zoom, etc.
"""
import os
import io
import subprocess
import tempfile
import threading
import traceback
from datetime import datetime, timezone

import requests
from flask import Flask, request, jsonify

SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()  # strip: trailing newline breaks Storage's JWT parse
BUCKET = os.environ.get("ASSET_BUCKET", "episode-assets").strip()
PORT = int(os.environ.get("PORT", "8100"))

app = Flask(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@app.after_request
def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return resp


@app.route("/video", methods=["OPTIONS"])
def _preflight():
    return ("", 204)


def _patch(table: str, row_id: str, body: dict):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
        json=body, timeout=30,
    )
    r.raise_for_status()


def _download(url: str, path: str):
    r = requests.get(url, timeout=180)
    r.raise_for_status()
    with open(path, "wb") as f:
        f.write(r.content)


def _upload(path_in_bucket: str, data: bytes, content_type: str) -> str:
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path_in_bucket}",
        headers={"Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": content_type, "x-upsert": "true"},
        data=data, timeout=300,
    )
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Upload failed {r.status_code}: {r.text}")
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path_in_bucket}"


def _render(asset_id: str, episode_id: str, master_audio_url: str, cover_url: str | None):
    try:
        _patch("trellis_episode_assets", asset_id, {"status": "processing"})
        with tempfile.TemporaryDirectory() as tmp:
            audio = os.path.join(tmp, "master.mp3")
            _download(master_audio_url, audio)
            cover = os.path.join(tmp, "cover.png")
            if cover_url:
                _download(cover_url, cover)
            else:
                # solid dark background if no cover was supplied
                subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=0x0A0E27:s=1920x1080", "-frames:v", "1", cover], check=True)

            out = os.path.join(tmp, "video.mp4")
            subprocess.run([
                "ffmpeg", "-y", "-loop", "1", "-i", cover, "-i", audio,
                "-c:v", "libx264", "-tune", "stillimage", "-c:a", "aac", "-b:a", "192k",
                "-pix_fmt", "yuv420p", "-shortest",
                "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
                out,
            ], check=True)

            with open(out, "rb") as f:
                data = f.read()
            path = f"{episode_id}/video.mp4"
            url = _upload(path, data, "video/mp4")

        _patch("trellis_episode_assets", asset_id, {
            "status": "ready", "url": url, "storage_bucket": BUCKET, "storage_path": path,
            "file_size_bytes": len(data), "updated_at": _now(),
        })
        print(f"[video] asset {asset_id} ready -> {url}")
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        try:
            _patch("trellis_episode_assets", asset_id, {"status": "failed", "error_message": str(e)[:500]})
        except Exception:  # noqa: BLE001
            pass


@app.post("/video")
def video():
    b = request.get_json(force=True, silent=True) or {}
    if not b.get("asset_id") or not b.get("episode_id") or not b.get("master_audio_url"):
        return jsonify({"error": "asset_id, episode_id, master_audio_url required"}), 400
    threading.Thread(target=_render, args=(b["asset_id"], b["episode_id"], b["master_audio_url"], b.get("cover_image_url")), daemon=True).start()
    return jsonify({"accepted": True, "asset_id": b["asset_id"]}), 202


@app.get("/health")
def health():
    return jsonify({"ok": True, "bucket": BUCKET})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
