from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download

MODEL_MAP = {
    "sd15": "runwayml/stable-diffusion-v1-5",
    "openjourney": "prompthero/openjourney",
}


def model_ready(model_dir: Path) -> bool:
    return (model_dir / "model_index.json").exists()


def main() -> int:
    parser = argparse.ArgumentParser(description="Preload local image models for Ollama-driven image generation.")
    parser.add_argument(
        "--cache-root",
        type=Path,
        required=True,
        help="Directory to store downloaded model snapshots.",
    )
    parser.add_argument(
        "--models",
        nargs="+",
        default=["sd15", "openjourney"],
        help="Model aliases to preload. Supported: sd15, openjourney",
    )
    args = parser.parse_args()

    cache_root = args.cache_root.resolve()
    cache_root.mkdir(parents=True, exist_ok=True)

    for alias in args.models:
        if alias not in MODEL_MAP:
            raise ValueError(f"Unsupported model alias: {alias}")

        repo_id = MODEL_MAP[alias]
        target_dir = cache_root / alias

        if model_ready(target_dir):
            print(f"[skip] {alias} already exists: {target_dir}")
            continue

        print(f"[download] {alias} <- {repo_id}")
        snapshot_download(
            repo_id=repo_id,
            local_dir=target_dir,
        )
        print(f"[done] {alias}: {target_dir}")

    print(f"[ok] model preload complete at {cache_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
