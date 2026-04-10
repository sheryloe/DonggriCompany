from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import requests
import torch
from diffusers import EulerAncestralDiscreteScheduler, StableDiffusionPipeline

MODEL_MAP = {
    "sd15": "runwayml/stable-diffusion-v1-5",
    "openjourney": "prompthero/openjourney",
}


def rewrite_prompt_with_ollama(prompt: str, model: str, host: str, timeout_sec: int) -> str:
    system = (
        "You are a prompt optimizer for text-to-image diffusion models. "
        "Rewrite user prompt into one compact, concrete English prompt suitable for Stable Diffusion. "
        "Return JSON only: {\"prompt\":\"...\",\"negative_prompt\":\"...\"}."
    )
    payload = {
        "model": model,
        "stream": False,
        "keep_alive": "0s",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "options": {
            "temperature": 0.2,
            "num_predict": 96,
        },
    }
    resp = requests.post(
        f"{host.rstrip('/')}/api/chat",
        json=payload,
        timeout=timeout_sec,
    )
    resp.raise_for_status()
    content = (
        resp.json()
        .get("message", {})
        .get("content", "")
        .strip()
    )
    if not content:
        return prompt

    try:
        data = json.loads(content)
        rewritten = str(data.get("prompt", "")).strip()
        if rewritten:
            return rewritten
    except json.JSONDecodeError:
        pass

    return content


def resolve_model_dir(cache_root: Path, model_alias: str) -> Path:
    model_dir = (cache_root / model_alias).resolve()
    if not (model_dir / "model_index.json").exists():
        raise FileNotFoundError(
            f"Model not found: {model_dir}. Run setup.ps1 first to preload models."
        )
    return model_dir


def build_pipeline(model_dir: Path, model_alias: str, prefer_cuda: bool) -> StableDiffusionPipeline:
    use_cuda = prefer_cuda and torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0).lower() if use_cuda else ""
    # GTX 16xx on SD1.x checkpoints can produce unstable outputs with fp16, so keep fp32 there.
    force_fp32 = model_alias in {"sd15", "openjourney"} and any(
        token in gpu_name for token in ["gtx 16", "1660", "1650"]
    )
    dtype = torch.float32 if (not use_cuda or force_fp32) else torch.float16

    pipe = StableDiffusionPipeline.from_pretrained(
        str(model_dir),
        torch_dtype=dtype,
        safety_checker=None,
        requires_safety_checker=False,
        local_files_only=True,
    )
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
    pipe.enable_attention_slicing()
    pipe.enable_vae_slicing()
    pipe.enable_vae_tiling()

    if use_cuda:
        pipe = pipe.to("cuda")
    else:
        pipe = pipe.to("cpu")

    return pipe


def pick_defaults(model_alias: str, steps: int | None, guidance_scale: float | None) -> tuple[int, float]:
    if model_alias == "openjourney":
        return (steps if steps is not None else 24, guidance_scale if guidance_scale is not None else 7.0)
    return (steps if steps is not None else 24, guidance_scale if guidance_scale is not None else 7.0)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate images locally via SD model with Ollama prompt rewrite.")
    parser.add_argument("--prompt", required=True, help="User prompt.")
    parser.add_argument("--negative-prompt", default="", help="Optional negative prompt.")
    parser.add_argument("--model-alias", default="sd15", choices=sorted(MODEL_MAP.keys()))
    parser.add_argument("--cache-root", type=Path, required=True, help="Model cache root used by preload_models.py")
    parser.add_argument("--output-dir", type=Path, required=True, help="Output directory for images.")
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=512)
    parser.add_argument("--steps", type=int, default=None)
    parser.add_argument("--guidance-scale", type=float, default=None)
    parser.add_argument("--seed", type=int, default=-1)
    parser.add_argument("--ollama-model", default="qwen2.5:3b")
    parser.add_argument("--ollama-host", default="http://127.0.0.1:11434")
    parser.add_argument("--ollama-timeout-sec", type=int, default=45)
    parser.add_argument("--skip-prompt-enhance", action="store_true")
    args = parser.parse_args()

    steps, guidance_scale = pick_defaults(args.model_alias, args.steps, args.guidance_scale)
    model_dir = resolve_model_dir(args.cache_root, args.model_alias)
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    final_prompt = args.prompt.strip()
    if not args.skip_prompt_enhance:
        try:
            final_prompt = rewrite_prompt_with_ollama(
                prompt=final_prompt,
                model=args.ollama_model,
                host=args.ollama_host,
                timeout_sec=args.ollama_timeout_sec,
            )
        except Exception as error:  # noqa: BLE001
            print(f"[warn] prompt enhance skipped: {error}")

    pipe = build_pipeline(model_dir=model_dir, model_alias=args.model_alias, prefer_cuda=True)

    seed = args.seed if args.seed >= 0 else int(time.time() * 1000) % 2_147_483_647
    generator_device = "cuda" if torch.cuda.is_available() else "cpu"
    generator = torch.Generator(device=generator_device).manual_seed(seed)

    result = pipe(
        prompt=final_prompt,
        negative_prompt=args.negative_prompt.strip() or None,
        width=args.width,
        height=args.height,
        num_inference_steps=steps,
        guidance_scale=guidance_scale,
        generator=generator,
    )
    image = result.images[0]

    output_path = output_dir / f"{args.model_alias}_{seed}.png"
    image.save(output_path)

    meta: dict[str, Any] = {
        "output": str(output_path),
        "model_alias": args.model_alias,
        "model_repo": MODEL_MAP[args.model_alias],
        "prompt_original": args.prompt,
        "prompt_final": final_prompt,
        "negative_prompt": args.negative_prompt,
        "width": args.width,
        "height": args.height,
        "steps": steps,
        "guidance_scale": guidance_scale,
        "seed": seed,
        "cuda_available": torch.cuda.is_available(),
        "dtype": str(pipe.unet.dtype),
    }
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
