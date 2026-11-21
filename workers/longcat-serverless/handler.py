"""RunPod Serverless boundary for trellis.media-generation.v1 jobs."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests
import runpod

CONTRACT = "trellis.media-generation.v1"
MAX_INPUT_BYTES = int(os.getenv("MAX_INPUT_BYTES", str(5 * 1024 * 1024 * 1024)))


def _https(url: str) -> str:
    if urlparse(url).scheme != "https":
        raise ValueError("Worker inputs and outputs must use HTTPS URLs.")
    return url


def _download(url: str, destination: Path) -> None:
    size = 0
    with requests.get(_https(url), stream=True, timeout=(20, 1800)) as response:
        response.raise_for_status()
        with destination.open("wb") as output:
            for chunk in response.iter_content(8 * 1024 * 1024):
                if not chunk:
                    continue
                size += len(chunk)
                if size > MAX_INPUT_BYTES:
                    raise ValueError("Input exceeds the configured worker size limit.")
                output.write(chunk)


def _probe(path: Path) -> dict:
    process = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(process.stdout or "{}")
    stream = (payload.get("streams") or [{}])[0]
    duration = stream.get("duration") or (payload.get("format") or {}).get("duration")
    return {
        "width": int(stream.get("width") or 0) or None,
        "height": int(stream.get("height") or 0) or None,
        "duration_seconds": float(duration) if duration else None,
    }


def _upload(url: str, path: Path, content_type: str) -> None:
    with path.open("rb") as body:
        response = requests.put(
            _https(url),
            data=body,
            headers={"content-type": content_type, "cache-control": "max-age=3600", "x-upsert": "false"},
            timeout=(20, 1800),
        )
    if not response.ok:
        raise RuntimeError(f"Output upload failed ({response.status_code}): {response.text[:300]}")


def _validate(payload: object) -> dict:
    if not isinstance(payload, dict) or payload.get("contract_version") != CONTRACT:
        raise ValueError(f"Expected {CONTRACT} input contract.")
    job = payload.get("job")
    model = payload.get("model")
    output = payload.get("output")
    if not isinstance(job, dict) or not job.get("id") or not job.get("task_type") or not job.get("prompt"):
        raise ValueError("Worker job is incomplete.")
    if not isinstance(model, dict) or model.get("id") not in {"longcat-video-base", "longcat-video-avatar-1.5"}:
        raise ValueError("Worker model is unsupported.")
    if not isinstance(output, dict) or not output.get("signed_upload_url") or not output.get("path"):
        raise ValueError("Worker output reservation is incomplete.")
    if len(json.dumps(payload)) > 20 * 1024 * 1024:
        raise ValueError("RunPod payload exceeds 20 MB; media must be passed by signed URL.")
    return payload


def handler(event: dict) -> dict:
    payload = _validate(event.get("input"))
    model_id = payload["model"]["id"]
    gpu_count = 2 if model_id == "longcat-video-avatar-1.5" else int(os.getenv("LONGCAT_BASE_GPU_COUNT", "1"))

    with tempfile.TemporaryDirectory(prefix=f"trellis-{payload['job']['id']}-") as raw_dir:
        work = Path(raw_dir)
        localized = []
        for index, item in enumerate(payload.get("inputs") or []):
            suffix = Path(urlparse(item["url"]).path).suffix[:12] or ".bin"
            local_path = work / f"input-{index}-{item['role']}{suffix}"
            _download(item["url"], local_path)
            localized.append({**item, "local_path": str(local_path), "url": None})

        request_path = work / "request.json"
        output_path = work / "output.mp4"
        request_path.write_text(json.dumps({**payload, "inputs": localized}), encoding="utf-8")
        command = [
            "torchrun", f"--nproc_per_node={gpu_count}", "/opt/trellis/longcat_job.py",
            "--request", str(request_path), "--output", str(output_path),
        ]
        subprocess.run(command, check=True, cwd=os.getenv("LONGCAT_REPO", "/opt/longcat"))
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise RuntimeError("LongCat completed without a video output.")

        _upload(payload["output"]["signed_upload_url"], output_path, "video/mp4")
        digest = hashlib.sha256()
        with output_path.open("rb") as source:
            for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
                digest.update(chunk)
        return {
            "storage_path": payload["output"]["path"],
            "mime_type": "video/mp4",
            "file_size_bytes": output_path.stat().st_size,
            "sha256": digest.hexdigest(),
            **_probe(output_path),
        }


runpod.serverless.start({"handler": handler})

