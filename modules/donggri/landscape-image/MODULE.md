# Landscape Image Module

## Purpose

Define a reusable prompt pack and artifact contract for landscape, background, and environment image generation.

## Runtime Boundary

Donggri manages the job, prompt pack, review status, and asset manifest. Codex executes image generation through the built-in image generation path.

## Output Contract

- Draft source files: `assets/generated/image_prompt_pack/<asset_id>/`
- Published files: `public/generated/image_prompt_pack/<asset_id>/`
- Manifest: `.donggri/assets/manifest.json`

## Review Rules

- No text or watermark.
- Stable perspective and lighting.
- Foreground-safe composition for UI overlays.
- Files that only exist under Codex home are drafts, not published assets.
