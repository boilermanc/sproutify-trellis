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
import time
import traceback
from datetime import datetime, timezone

import requests
from flask import Flask, request, jsonify

SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()  # strip: trailing newline breaks Storage's JWT parse
BUCKET = os.environ.get("ASSET_BUCKET", "episode-assets").strip()
PORT = int(os.environ.get("PORT", "8100"))
VIDEO_WIDTH = int(os.environ.get("VIDEO_WIDTH", "1280"))
VIDEO_HEIGHT = int(os.environ.get("VIDEO_HEIGHT", "720"))
VIDEO_FPS = int(os.environ.get("VIDEO_FPS", "12"))
VIDEO_CRF = os.environ.get("VIDEO_CRF", "32").strip()
VIDEO_AUDIO_BITRATE = os.environ.get("VIDEO_AUDIO_BITRATE", "96k").strip()
MAX_STANDARD_UPLOAD_MB = int(os.environ.get("VIDEO_MAX_STANDARD_UPLOAD_MB", "48"))
RENDER_PROFILE = "studio-safe-fit-v2"

app = Flask(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _duration(path: str) -> float:
    """Audio duration in seconds via ffprobe (0.0 if it can't be read)."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, check=True,
        )
        return float(out.stdout.strip())
    except Exception:  # noqa: BLE001
        return 0.0


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


def _get_row(table: str, row_id: str, select: str = "*") -> dict | None:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        params={"id": f"eq.{row_id}", "select": select, "limit": "1"},
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None


def _heartbeat(asset_id: str, stage: str, progress: float | None = None, message: str | None = None, extra: dict | None = None,
               pipeline: str = "episode", job_id: str | None = None, album_id: str | None = None):
    try:
        worker = {
            "stage": stage,
            "message": message or stage,
            "heartbeat_at": _now(),
            "settings": {
                "width": VIDEO_WIDTH,
                "height": VIDEO_HEIGHT,
                "fps": VIDEO_FPS,
                "crf": VIDEO_CRF,
                "audio_bitrate": VIDEO_AUDIO_BITRATE,
                "render_profile": RENDER_PROFILE,
            },
        }
        if progress is not None:
            worker["progress"] = max(0, min(100, round(progress, 1)))
        if extra:
            worker.update(extra)
        table = "studio_assets" if pipeline == "studio" else "trellis_episode_assets"
        metadata_column = "metadata_json" if pipeline == "studio" else "metadata"
        existing = _get_row(table, asset_id, metadata_column) or {}
        metadata = existing.get(metadata_column) if isinstance(existing.get(metadata_column), dict) else {}
        _patch(table, asset_id, {metadata_column: {**metadata, "worker": worker}, "updated_at": _now()})
        if pipeline == "studio" and job_id:
            _patch("studio_jobs", job_id, {
                "status": "processing", "progress": int(worker.get("progress", 0)),
                "started_at": _now(), "updated_at": _now(),
            })
        if pipeline == "studio" and album_id:
            _patch("studio_albums", album_id, {"video_status": "processing", "status": "video_rendering", "updated_at": _now()})
    except Exception as e:  # noqa: BLE001
        print(f"[video] heartbeat failed for {asset_id}: {e}")


def _download(url: str, path: str):
    r = requests.get(url, timeout=180)
    r.raise_for_status()
    with open(path, "wb") as f:
        f.write(r.content)


def _upload(bucket: str, path_in_bucket: str, data: bytes, content_type: str) -> str:
    size_mb = len(data) / (1024 * 1024)
    if size_mb > MAX_STANDARD_UPLOAD_MB:
        raise RuntimeError(
            f"Video is {size_mb:.1f} MB, above the configured standard upload limit "
            f"of {MAX_STANDARD_UPLOAD_MB} MB. Lower VIDEO_WIDTH/VIDEO_HEIGHT/VIDEO_FPS, "
            "raise VIDEO_CRF, or switch the worker to Supabase resumable uploads."
        )

    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path_in_bucket}",
        headers={"Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": content_type, "x-upsert": "true"},
        data=data, timeout=300,
    )
    if r.status_code not in (200, 201):
        if r.status_code == 413:
            raise RuntimeError(
                f"Upload failed 413: video is {size_mb:.1f} MB. "
                "Use smaller video render settings or configure resumable uploads for long videos."
            )
        raise RuntimeError(f"Upload failed {r.status_code}: {r.text}")
    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path_in_bucket}"


def _run_ffmpeg(cmd: list[str], asset_id: str, duration_s: float, pipeline: str = "episode", job_id: str | None = None, album_id: str | None = None):
    last_emit = 0.0
    tail: list[str] = []
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    assert proc.stdout is not None

    for raw in proc.stdout:
        line = raw.strip()
        if line:
            tail.append(line)
            tail = tail[-20:]
        if line.startswith("out_time_ms=") and duration_s > 0:
            try:
                out_s = int(line.split("=", 1)[1]) / 1_000_000
                progress = (out_s / duration_s) * 100
                now = time.time()
                if now - last_emit >= 15:
                    last_emit = now
                    _heartbeat(
                        asset_id,
                        "rendering",
                        progress,
                        f"Rendering video with ffmpeg ({progress:.0f}%)",
                        {"rendered_seconds": round(out_s, 1), "duration_seconds": round(duration_s, 1)},
                        pipeline, job_id, album_id,
                    )
            except Exception:  # noqa: BLE001
                pass

    code = proc.wait()
    if code != 0:
        raise RuntimeError(f"ffmpeg failed with exit code {code}: {' | '.join(tail[-8:])}")


def _render(asset_id: str, project_id: str, master_audio_url: str, cover_url: str | None, motion: str = "ken_burns",
            pipeline: str = "episode", job_id: str | None = None, storage_bucket: str | None = None,
            storage_path: str | None = None):
    try:
        table = "studio_assets" if pipeline == "studio" else "trellis_episode_assets"
        _patch(table, asset_id, {"status": "processing", "updated_at": _now()})
        _heartbeat(asset_id, "starting", 0, "Worker accepted the video job", pipeline=pipeline, job_id=job_id, album_id=project_id if pipeline == "studio" else None)
        with tempfile.TemporaryDirectory() as tmp:
            audio = os.path.join(tmp, "master.mp3")
            _heartbeat(asset_id, "downloading-audio", 2, "Downloading master audio", pipeline=pipeline, job_id=job_id, album_id=project_id if pipeline == "studio" else None)
            _download(master_audio_url, audio)
            cover = os.path.join(tmp, "cover.png")
            if cover_url:
                _heartbeat(asset_id, "downloading-cover", 5, "Downloading cover image", pipeline=pipeline, job_id=job_id, album_id=project_id if pipeline == "studio" else None)
                _download(cover_url, cover)
            else:
                # solid dark background if no cover was supplied
                _heartbeat(asset_id, "creating-cover", 5, "Creating fallback cover image", pipeline=pipeline, job_id=job_id, album_id=project_id if pipeline == "studio" else None)
                subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=0x0A0E27:s=1920x1080", "-frames:v", "1", cover], check=True)

            out = os.path.join(tmp, "video.mp4")
            fps = VIDEO_FPS
            still = str(motion).lower() in ("none", "static", "off", "still")
            _heartbeat(asset_id, "probing-audio", 8, "Reading master duration", pipeline=pipeline, job_id=job_id, album_id=project_id if pipeline == "studio" else None)
            dur = _duration(audio) or 180.0
            # Build the blurred 16:9 composition once. Applying blur + overlay on
            # every frame of an hour-long video can consume several GB of memory.
            # The prepared frame keeps the entire approved square cover visible;
            # the inexpensive render pass below only loops/zooms that flat image.
            framed_cover = os.path.join(tmp, "framed-cover.png")
            foreground_h = max(2, VIDEO_HEIGHT - max(80, VIDEO_HEIGHT // 8))
            foreground_filter = (
                f"scale={VIDEO_WIDTH}:{foreground_h}:force_original_aspect_ratio=decrease:"
                "force_divisible_by=2,setsar=1"
            )
            frame_filter = (
                "[0:v]split=2[bgsrc][fgsrc];"
                f"[bgsrc]scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=increase,"
                f"crop={VIDEO_WIDTH}:{VIDEO_HEIGHT},gblur=sigma=20,eq=brightness=-0.08,setsar=1[bg];"
                f"[fgsrc]{foreground_filter}[fg];"
                "[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,format=rgb24[v]"
            )
            _heartbeat(asset_id, "preparing-frame", 9, "Preparing memory-safe widescreen artwork", pipeline=pipeline, job_id=job_id, album_id=project_id if pipeline == "studio" else None)
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error", "-i", cover,
                "-filter_complex", frame_filter, "-map", "[v]", "-frames:v", "1", framed_cover,
            ], check=True)
            if still:
                vf = f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT},setsar=1,format=yuv420p"
            else:
                # A restrained zoom on the already-composited frame keeps the full
                # cover inside the canvas even at the end of the album.
                total = max(1, int(dur * fps))
                zmax = 1.04
                zrate = (zmax - 1.0) / total
                source_w = VIDEO_WIDTH * 4 // 3
                source_h = VIDEO_HEIGHT * 4 // 3
                vf = (
                    f"scale={source_w}:{source_h},"
                    f"zoompan=z='min(1+{zrate:.9f}*on,{zmax})':d=1:"
                    "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
                    f"s={VIDEO_WIDTH}x{VIDEO_HEIGHT}:fps={fps},setsar=1,format=yuv420p"
                )
            _heartbeat(asset_id, "rendering", 10, "Rendering video with ffmpeg", {"duration_seconds": round(dur, 1), "motion": motion}, pipeline, job_id, project_id if pipeline == "studio" else None)
            _run_ffmpeg([
                "ffmpeg", "-y", "-nostats", "-progress", "pipe:1", "-loop", "1", "-i", framed_cover, "-i", audio,
                "-vf", vf,
                "-map", "0:v", "-map", "1:a",
                "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", VIDEO_CRF,
                "-c:a", "aac", "-b:a", VIDEO_AUDIO_BITRATE,
                "-pix_fmt", "yuv420p", "-r", str(fps), "-shortest",
                out,
            ], asset_id, dur, pipeline, job_id, project_id if pipeline == "studio" else None)

            _heartbeat(asset_id, "reading-output", 96, "Reading rendered video file", pipeline=pipeline, job_id=job_id, album_id=project_id if pipeline == "studio" else None)
            with open(out, "rb") as f:
                data = f.read()
            print(
                f"[video] asset {asset_id} export {VIDEO_WIDTH}x{VIDEO_HEIGHT}@{VIDEO_FPS}fps "
                f"crf={VIDEO_CRF} audio={VIDEO_AUDIO_BITRATE} size={len(data)/(1024*1024):.1f}MB"
            )
            bucket = storage_bucket or ("studio-assets" if pipeline == "studio" else BUCKET)
            path = storage_path or f"{project_id}/video.mp4"
            _heartbeat(asset_id, "uploading", 98, "Uploading MP4 to storage", {"file_size_mb": round(len(data) / (1024 * 1024), 1)}, pipeline, job_id, project_id if pipeline == "studio" else None)
            url = _upload(bucket, path, data, "video/mp4")

        worker_metadata = {
            "worker": {
                "stage": "ready", "message": "Video render complete", "progress": 100, "heartbeat_at": _now(),
                "duration_seconds": round(dur, 1), "file_size_mb": round(len(data) / (1024 * 1024), 1),
                "settings": {"width": VIDEO_WIDTH, "height": VIDEO_HEIGHT, "fps": VIDEO_FPS, "crf": VIDEO_CRF, "audio_bitrate": VIDEO_AUDIO_BITRATE, "render_profile": RENDER_PROFILE},
            }
        }
        if pipeline == "studio":
            existing = _get_row("studio_assets", asset_id, "metadata_json") or {}
            metadata = existing.get("metadata_json") if isinstance(existing.get("metadata_json"), dict) else {}
            _patch("studio_assets", asset_id, {
                "status": "active", "storage_bucket": bucket, "storage_path": path, "mime_type": "video/mp4",
                "file_size": len(data), "duration_seconds": round(dur), "width": VIDEO_WIDTH, "height": VIDEO_HEIGHT,
                "metadata_json": {**metadata, **worker_metadata}, "error_message": None, "updated_at": _now(),
            })
            if job_id:
                _patch("studio_jobs", job_id, {"status": "completed", "progress": 100, "output_json": {"studio_asset_id": asset_id, "storage_path": path}, "completed_at": _now(), "updated_at": _now()})
            _patch("studio_albums", project_id, {"video_status": "pending_review", "status": "video_review", "updated_at": _now()})
        else:
            _patch("trellis_episode_assets", asset_id, {
                "status": "ready", "url": url, "storage_bucket": bucket, "storage_path": path,
                "file_size_bytes": len(data), "duration_seconds": round(dur), "metadata": worker_metadata,
                "updated_at": _now(),
            })
        print(f"[video] asset {asset_id} ready -> {url}")
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        try:
            table = "studio_assets" if pipeline == "studio" else "trellis_episode_assets"
            metadata_column = "metadata_json" if pipeline == "studio" else "metadata"
            existing = _get_row(table, asset_id, metadata_column) or {}
            metadata = existing.get(metadata_column) if isinstance(existing.get(metadata_column), dict) else {}
            _patch(table, asset_id, {"status": "failed", "error_message": str(e)[:500], metadata_column: {**metadata, "worker": {"stage": "failed", "message": str(e)[:500], "heartbeat_at": _now()}}, "updated_at": _now()})
            if pipeline == "studio":
                if job_id:
                    _patch("studio_jobs", job_id, {"status": "failed", "error_message": str(e)[:500], "completed_at": _now(), "updated_at": _now()})
                _patch("studio_albums", project_id, {"video_status": "failed", "status": "video_review", "updated_at": _now()})
        except Exception:  # noqa: BLE001
            pass


@app.post("/video")
def video():
    b = request.get_json(force=True, silent=True) or {}
    pipeline = b.get("pipeline", "episode")
    if pipeline not in ("episode", "studio"):
        return jsonify({"error": "pipeline must be episode or studio"}), 400
    project_id = b.get("album_id") if pipeline == "studio" else b.get("episode_id")
    if not b.get("asset_id") or not project_id or not b.get("master_audio_url"):
        return jsonify({"error": "asset_id, project id, and master_audio_url required"}), 400
    if pipeline == "studio" and (not b.get("job_id") or b.get("storage_bucket") != "studio-assets" or not str(b.get("storage_path", "")).startswith("studio/")):
        return jsonify({"error": "Studio jobs require job_id and a studio-assets path under studio/"}), 400
    if pipeline == "studio":
        expected_prefix = f"studio/{b.get('organization_id')}/albums/{project_id}/video/"
        asset = _get_row("studio_assets", b["asset_id"], "album_id,asset_type,status,storage_bucket,storage_path")
        job = _get_row("studio_jobs", b["job_id"], "album_id,job_type,status,input_json")
        job_input = job.get("input_json") if job and isinstance(job.get("input_json"), dict) else {}
        valid_asset = bool(
            asset
            and asset.get("album_id") == project_id
            and asset.get("asset_type") == "final_video"
            and asset.get("status") == "pending"
            and asset.get("storage_bucket") == b.get("storage_bucket")
            and asset.get("storage_path") == b.get("storage_path")
            and str(asset.get("storage_path", "")).startswith(expected_prefix)
        )
        valid_job = bool(
            job
            and job.get("album_id") == project_id
            and job.get("job_type") == "video_render"
            and job.get("status") in ("queued", "processing")
            and job_input.get("asset_id") == b["asset_id"]
            and job_input.get("storage_path") == b.get("storage_path")
        )
        if not valid_asset or not valid_job:
            return jsonify({"error": "Studio asset and job linkage could not be verified"}), 409
    threading.Thread(target=_render, args=(b["asset_id"], project_id, b["master_audio_url"], b.get("cover_image_url"), b.get("motion", "ken_burns"), pipeline, b.get("job_id"), b.get("storage_bucket"), b.get("storage_path")), daemon=True).start()
    return jsonify({"accepted": True, "asset_id": b["asset_id"]}), 202


@app.get("/health")
def health():
    # service_key_is_jwt must be True for Storage uploads to work. If it's False the
    # process loaded an sb_secret_ key (Storage rejects it as "Invalid Compact JWS") —
    # restart the worker with the legacy eyJ... service_role JWT.
    return jsonify({
        "ok": True,
        "bucket": BUCKET,
        "service_key_is_jwt": SERVICE_KEY.startswith("eyJ"),
        "render_profile": RENDER_PROFILE,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
