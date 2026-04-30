# Character Image Module

## Purpose

Define character image generation prompts, identity-lock notes, and review requirements for project assets.

## Runtime Boundary

The server stores jobs and manifests. Codex uses the built-in image generation path to produce drafts.

## Output Contract

- Draft source files: `assets/generated/image_prompt_pack/<asset_id>/`
- Published files: `public/generated/image_prompt_pack/<asset_id>/`
- Manifest: `.donggri/assets/manifest.json`

## Review Rules

- Original character only.
- Consistent silhouette, palette, and outfit.
- No unlicensed real-person likeness.
- Workspace copy required before publication.
