#!/usr/bin/env python3
"""
Trellis Sessions — audio stitch worker
======================================
Receives a stitch job (approved tracks) from Trellis, crossfades them into a
single master with pydub/ffmpeg, uploads the master to Supabase Storage, and
updates the render + session rows to 'ready'.

Runs on the IONOS VPS (audio processing is too heavy for Edge Functions).

Run:
    pip install -r requirements.txt        # needs ffmpeg on the system PATH
    export SUPABASE_URL=https://horvjqqifgrzxesuxtfm.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=...    # Hub service_role key
    export STITCH_BUCKET=music-sessions     # optional (default)
    python stitch_worker.py                 # serves on :8099

Webhook contract (POST /stitch — matches MUSIC_STITCH_WEBHOOK / sessionService.stitchSession):
    {
      "render_id": "uuid",
      "session_id": "uuid",
      "branch": "atl-urban-farms",
      "tracks": [ { "id": "uuid", "track_number": 1, "audio_url": "https://..." }, ... ]
    }
Responds 202 immediately; the stitch runs in a background thread.
"""
import os
import io
import threading
import traceback
from datetime import datetime, timezone

import requests
from flask import Flask, request, jsonify
from pydub import AudioSegment


def _now() -> str:
    """ISO-8601 UTC timestamp (PostgREST wants a value, not the SQL now())."""
    return datetime.now(timezone.utc).isoformat()

SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()  # strip: trailing newline breaks Storage's JWT parse
BUCKET = os.environ.get("STITCH_BUCKET", "music-sessions").strip()
PORT = int(os.environ.get("PORT", "8099"))

# Crossfade / fade tuning (ms)
CROSSFADE_MS = 1500
FADE_IN_MS = 1000
FADE_OUT_MS = 2000

app = Flask(__name__)


@app.after_request
def _cors(resp):
    # Allow the Trellis browser app to fire /stitch directly (fire-and-forget).
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return resp


@app.route("/stitch", methods=["OPTIONS"])
def stitch_preflight():
    return ("", 204)


def _rest_headers():
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def _patch(table: str, row_id: str, body: dict):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}",
        headers=_rest_headers(),
        json=body,
        timeout=30,
    )
    r.raise_for_status()


def _download(url: str) -> AudioSegment:
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    return AudioSegment.from_file(io.BytesIO(resp.content))


def _upload_master(path: str, data: bytes) -> str:
    # Upsert so re-stitching overwrites the master
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    r = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "audio/mpeg",
            "x-upsert": "true",
        },
        data=data,
        timeout=180,
    )
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Storage upload failed {r.status_code}: {r.text}")
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"


def _stitch(render_id: str, session_id: str, tracks: list):
    try:
        _patch("trellis_music_renders", render_id, {"status": "processing"})

        ordered = sorted(tracks, key=lambda t: t.get("track_number", 0))
        segments = [_download(t["audio_url"]) for t in ordered if t.get("audio_url")]
        if not segments:
            raise RuntimeError("No playable track URLs to stitch")

        master = segments[0].fade_in(FADE_IN_MS)
        for seg in segments[1:]:
            master = master.append(seg.fade_in(FADE_IN_MS), crossfade=CROSSFADE_MS)
        master = master.fade_out(FADE_OUT_MS)

        # Loudness normalize to ~ -14 dBFS (streaming-ish target)
        change = -14.0 - master.dBFS
        if change < 0:
            master = master.apply_gain(change)

        buf = io.BytesIO()
        master.export(buf, format="mp3", bitrate="192k")
        audio_bytes = buf.getvalue()

        path = f"{session_id}/renders/final-master.mp3"
        public_url = _upload_master(path, audio_bytes)
        duration_s = int(len(master) / 1000)

        _patch("trellis_music_renders", render_id, {
            "status": "ready",
            "final_audio_url": public_url,
            "storage_bucket": BUCKET,
            "storage_path": path,
            "duration_seconds": duration_s,
            "updated_at": _now(),
        })
        _patch("trellis_music_sessions", session_id, {
            "status": "ready",
            "final_audio_url": public_url,
            "actual_duration_seconds": duration_s,
            "storage_bucket": BUCKET,
            "storage_path": path,
            "updated_at": _now(),
        })
        print(f"[stitch] render {render_id} ready ({duration_s}s) -> {public_url}")
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        msg = str(e)[:500]
        try:
            _patch("trellis_music_renders", render_id, {"status": "failed", "error_message": msg})
            _patch("trellis_music_sessions", session_id, {"status": "failed", "error_message": msg})
        except Exception:  # noqa: BLE001
            pass


@app.post("/stitch")
def stitch():
    body = request.get_json(force=True, silent=True) or {}
    render_id = body.get("render_id")
    session_id = body.get("session_id")
    tracks = body.get("tracks") or []
    if not render_id or not session_id or not tracks:
        return jsonify({"error": "render_id, session_id and tracks are required"}), 400
    threading.Thread(target=_stitch, args=(render_id, session_id, tracks), daemon=True).start()
    return jsonify({"accepted": True, "render_id": render_id}), 202


@app.get("/health")
def health():
    return jsonify({"ok": True, "bucket": BUCKET})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
