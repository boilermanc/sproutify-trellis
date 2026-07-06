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
import math
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
MASTER_MP3_BITRATE = os.environ.get("STITCH_MP3_BITRATE", "96k").strip()
MAX_STANDARD_UPLOAD_MB = int(os.environ.get("STITCH_MAX_STANDARD_UPLOAD_MB", "48"))

# Crossfade / fade tuning (ms)
CROSSFADE_MS = 1500
FADE_IN_MS = 1000
FADE_OUT_MS = 2000

app = Flask(__name__)


def _bitrate_kbps(value: str) -> int:
    normalized = value.strip().lower()
    if normalized.endswith("k"):
        return int(normalized[:-1])
    if normalized.endswith("000"):
        return int(normalized) // 1000
    return int(normalized)


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


def _patch_render(render_id: str, body: dict):
    try:
        _patch("trellis_music_renders", render_id, body)
    except Exception:
        if "metadata" not in body:
            raise
        fallback = dict(body)
        fallback.pop("metadata", None)
        _patch("trellis_music_renders", render_id, fallback)


def _heartbeat(render_id: str, stage: str, progress: float | None = None, message: str | None = None, extra: dict | None = None):
    try:
        worker = {
            "stage": stage,
            "message": message or stage,
            "heartbeat_at": _now(),
            "settings": {
                "bitrate": MASTER_MP3_BITRATE,
                "crossfade_ms": CROSSFADE_MS,
                "fade_in_ms": FADE_IN_MS,
                "fade_out_ms": FADE_OUT_MS,
            },
        }
        if progress is not None:
            worker["progress"] = max(0, min(100, round(progress, 1)))
        if extra:
            worker.update(extra)
        _patch_render(render_id, {
            "metadata": {"worker": worker},
            "updated_at": _now(),
        })
    except Exception as e:  # noqa: BLE001
        print(f"[stitch] heartbeat failed for {render_id}: {e}")


def _download(url: str) -> AudioSegment:
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    return AudioSegment.from_file(io.BytesIO(resp.content))


def _upload_master(path: str, data: bytes) -> str:
    size_mb = len(data) / (1024 * 1024)
    if size_mb > MAX_STANDARD_UPLOAD_MB:
        raise RuntimeError(
            f"Master audio is {size_mb:.1f} MB, above the configured standard upload limit "
            f"of {MAX_STANDARD_UPLOAD_MB} MB. Lower STITCH_MP3_BITRATE or switch the worker "
            "to Supabase resumable uploads for larger masters."
        )

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
        if r.status_code == 413:
            raise RuntimeError(
                f"Storage upload failed 413: final MP3 is {size_mb:.1f} MB. "
                "Use a lower STITCH_MP3_BITRATE or configure resumable uploads for long masters."
            )
        raise RuntimeError(f"Storage upload failed {r.status_code}: {r.text}")
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"


def _stitch(render_id: str, session_id: str, tracks: list):
    try:
        _patch_render(render_id, {"status": "processing", "updated_at": _now()})
        _heartbeat(render_id, "starting", 0, "Worker accepted the master rebuild")

        ordered = sorted(tracks, key=lambda t: t.get("track_number", 0))
        segments = []
        total_tracks = len([t for t in ordered if t.get("audio_url")])
        for idx, track in enumerate([t for t in ordered if t.get("audio_url")], start=1):
            _heartbeat(
                render_id,
                "downloading-tracks",
                5 + (idx - 1) / max(1, total_tracks) * 25,
                f"Downloading track {idx} of {total_tracks}",
                {"track_number": track.get("track_number"), "downloaded_tracks": idx - 1, "total_tracks": total_tracks},
            )
            segments.append(_download(track["audio_url"]))
        if not segments:
            raise RuntimeError("No playable track URLs to stitch")

        _heartbeat(render_id, "stitching", 35, "Combining approved tracks", {"total_tracks": len(segments)})
        master = segments[0].fade_in(FADE_IN_MS)
        for idx, seg in enumerate(segments[1:], start=2):
            _heartbeat(
                render_id,
                "stitching",
                35 + (idx - 1) / max(1, len(segments) - 1) * 35,
                f"Stitching track {idx} of {len(segments)}",
                {"stitched_tracks": idx - 1, "total_tracks": len(segments)},
            )
            master = master.append(seg.fade_in(FADE_IN_MS), crossfade=CROSSFADE_MS)
        master = master.fade_out(FADE_OUT_MS)

        # Loudness normalize to ~ -14 dBFS (streaming-ish target)
        _heartbeat(render_id, "normalizing", 75, "Normalizing master loudness")
        change = -14.0 - master.dBFS
        if change < 0:
            master = master.apply_gain(change)

        _heartbeat(render_id, "exporting", 82, "Exporting MP3 master")
        buf = io.BytesIO()
        master.export(buf, format="mp3", bitrate=MASTER_MP3_BITRATE)
        audio_bytes = buf.getvalue()
        size_mb = len(audio_bytes) / (1024 * 1024)
        duration_s = math.ceil(len(master) / 1000)
        expected_mb = duration_s * _bitrate_kbps(MASTER_MP3_BITRATE) / 8 / 1024
        print(
            f"[stitch] render {render_id} export bitrate={MASTER_MP3_BITRATE} "
            f"duration={duration_s}s size={size_mb:.1f}MB expected~{expected_mb:.1f}MB"
        )

        path = f"{session_id}/renders/final-master.mp3"
        _heartbeat(render_id, "uploading", 95, "Uploading master audio", {"file_size_mb": round(size_mb, 1), "duration_seconds": duration_s})
        public_url = _upload_master(path, audio_bytes)
        duration_s = int(len(master) / 1000)

        _patch_render(render_id, {
            "status": "ready",
            "final_audio_url": public_url,
            "storage_bucket": BUCKET,
            "storage_path": path,
            "duration_seconds": duration_s,
            "metadata": {"worker": {
                "stage": "ready",
                "message": "Master rebuild complete",
                "progress": 100,
                "heartbeat_at": _now(),
                "duration_seconds": duration_s,
                "file_size_mb": round(size_mb, 1),
                "settings": {
                    "bitrate": MASTER_MP3_BITRATE,
                    "crossfade_ms": CROSSFADE_MS,
                    "fade_in_ms": FADE_IN_MS,
                    "fade_out_ms": FADE_OUT_MS,
                },
            }},
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
            _patch_render(render_id, {
                "status": "failed",
                "error_message": msg,
                "metadata": {"worker": {"stage": "failed", "message": msg, "heartbeat_at": _now()}},
                "updated_at": _now(),
            })
            _patch("trellis_music_sessions", session_id, {"status": "failed", "error_message": msg, "updated_at": _now()})
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
