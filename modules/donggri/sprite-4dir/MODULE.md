# 4-Direction Sprite Module

## Purpose

Define a reusable four-direction game sprite prompt and manifest contract.

## Required Directions

- `front`
- `left`
- `back`
- `right`

## Optional Extension

- `walk`

## Output Contract

- Draft source files: `assets/generated/game_asset_pipeline/<asset_id>/`
- Published files: `public/generated/game_asset_pipeline/<asset_id>/`
- Manifest: `.donggri/assets/manifest.json`

## Review Rules

- Direction set must include front, left, back, and right.
- Character identity, scale, outfit, and anchor position must remain consistent.
- Walk frames are optional in v1 and must not block static four-direction approval.
