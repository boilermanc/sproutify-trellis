"""Thin, parameterized adapter over the upstream LongCat demo pipelines."""

from __future__ import annotations

import argparse
import datetime
import json
import os
import shutil
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import PIL.Image
import torch
import torch.distributed as dist
from diffusers.utils import load_image, load_video
from torchvision.io import write_video
from transformers import AutoTokenizer, UMT5EncoderModel

from longcat_video.context_parallel import context_parallel_util
from longcat_video.context_parallel.context_parallel_util import init_context_parallel
from longcat_video.modules.autoencoder_kl_wan import AutoencoderKLWan
from longcat_video.modules.longcat_video_dit import LongCatVideoTransformer3DModel
from longcat_video.modules.scheduling_flow_match_euler_discrete import FlowMatchEulerDiscreteScheduler
from longcat_video.pipeline_longcat_video import LongCatVideoPipeline


def _input(payload: dict, *roles: str) -> str | None:
    return next((item.get("local_path") for item in payload.get("inputs", []) if item.get("role") in roles), None)


def _frames(value) -> list[PIL.Image.Image]:
    return [PIL.Image.fromarray((frame * 255).clip(0, 255).astype(np.uint8)) for frame in value]


def _save(frames: list[PIL.Image.Image], output: Path, fps: int) -> None:
    tensor = torch.from_numpy(np.asarray(frames))
    write_video(str(output), tensor, fps=fps, video_codec="libx264", options={"crf": "18"})


def _base(payload: dict, output_path: Path) -> None:
    weights = os.getenv("LONGCAT_BASE_WEIGHTS", "/runpod-volume/weights/LongCat-Video")
    rank = int(os.environ["RANK"])
    local_rank = int(os.environ["LOCAL_RANK"])
    world_size = int(os.environ["WORLD_SIZE"])
    torch.cuda.set_device(local_rank)
    dist.init_process_group(backend="nccl", timeout=datetime.timedelta(hours=24))
    init_context_parallel(context_parallel_size=world_size, global_rank=rank, world_size=world_size)
    split = context_parallel_util.get_optimal_split(context_parallel_util.get_cp_size())

    tokenizer = AutoTokenizer.from_pretrained(weights, subfolder="tokenizer", torch_dtype=torch.bfloat16)
    encoder = UMT5EncoderModel.from_pretrained(weights, subfolder="text_encoder", torch_dtype=torch.bfloat16)
    vae = AutoencoderKLWan.from_pretrained(weights, subfolder="vae", torch_dtype=torch.bfloat16)
    scheduler = FlowMatchEulerDiscreteScheduler.from_pretrained(weights, subfolder="scheduler", torch_dtype=torch.bfloat16)
    dit = LongCatVideoTransformer3DModel.from_pretrained(weights, subfolder="dit", cp_split_hw=split, torch_dtype=torch.bfloat16)
    pipe = LongCatVideoPipeline(tokenizer=tokenizer, text_encoder=encoder, vae=vae, scheduler=scheduler, dit=dit)
    pipe.to(local_rank)
    lora = os.path.join(weights, "lora/cfg_step_lora.safetensors")
    pipe.dit.load_lora(lora, "cfg_step_lora")
    pipe.dit.enable_loras(["cfg_step_lora"])

    job = payload["job"]
    params = job.get("parameters") or {}
    task = job["task_type"]
    resolution = params.get("resolution", "480p")
    if resolution != "480p":
        raise ValueError("The first serverless base-model preset supports 480p only; 720p refinement must be benchmarked before enabling it.")
    frames_count = min(241, max(17, int(params.get("frames", 93))))
    seed = int(params.get("seed", 42))
    generator = torch.Generator(device=local_rank).manual_seed(seed + rank)
    common = dict(prompt=job["prompt"], resolution=resolution, num_frames=frames_count, num_inference_steps=16, use_distill=True, guidance_scale=1.0, generator=generator)

    if task == "text_to_video":
        generated = pipe.generate_t2v(**common)[0]
        result = _frames(generated)
    elif task == "image_to_video":
        image_path = _input(payload, "source_image", "first_frame")
        if not image_path:
            raise ValueError("image_to_video requires a source image.")
        generated = pipe.generate_i2v(image=load_image(image_path), **common)[0]
        result = _frames(generated)
    elif task == "video_continuation":
        video_path = _input(payload, "source_video")
        if not video_path:
            raise ValueError("video_continuation requires a source video.")
        source = load_video(video_path)
        cond_frames = min(13, len(source))
        generated = pipe.generate_vc(video=source, num_cond_frames=cond_frames, use_kv_cache=True, offload_kv_cache=False, enhance_hf=False, **common)[0]
        result = source + _frames(generated)[cond_frames:]
    else:
        raise ValueError(f"Base LongCat does not support {task}.")

    pipe.dit.disable_all_loras()
    if rank == 0:
        _save(result, output_path, 15)
    dist.barrier()


def _avatar(payload: dict, output_path: Path) -> None:
    from run_demo_avatar_single_audio_to_video import generate

    rank = int(os.environ["RANK"])
    image = _input(payload, "reference_image")
    audio = _input(payload, "driving_audio")
    if not image or not audio:
        raise ValueError("Avatar 1.5 requires a reference image and driving audio.")
    work = output_path.parent
    input_json = work / "avatar-input.json"
    input_json.write_text(json.dumps({"prompt": payload["job"]["prompt"], "cond_image": image, "cond_audio": {"person1": audio}}), encoding="utf-8")
    params = payload["job"].get("parameters") or {}
    args = SimpleNamespace(
        input_json=str(input_json), output_dir=str(work / "avatar-output"), resolution=params.get("resolution", "480p"),
        num_segments=min(10, max(1, int(params.get("num_segments", 1)))), num_inference_steps=8,
        ref_img_index=min(30, max(0, int(params.get("ref_img_index", 10)))), mask_frame_range=min(8, max(1, int(params.get("mask_frame_range", 3)))),
        text_guidance_scale=1.0, audio_guidance_scale=1.0, stage_1="ai2v", context_parallel_size=2,
        checkpoint_dir=os.getenv("LONGCAT_AVATAR_WEIGHTS", "/runpod-volume/weights/LongCat-Video-Avatar-1.5"),
        model_type="avatar-v1.5", use_distill=True, use_int8=True,
    )
    os.makedirs(args.output_dir, exist_ok=True)
    generate(args)
    if rank == 0:
        candidates = sorted(Path(args.output_dir).glob("*.mp4"), key=lambda path: path.stat().st_mtime)
        if not candidates:
            raise RuntimeError("Avatar pipeline did not produce an MP4.")
        shutil.copyfile(candidates[-1], output_path)
    dist.barrier()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    payload = json.loads(Path(args.request).read_text(encoding="utf-8"))
    output = Path(args.output)
    if payload["model"]["id"] == "longcat-video-avatar-1.5":
        _avatar(payload, output)
    else:
        _base(payload, output)


if __name__ == "__main__":
    main()
