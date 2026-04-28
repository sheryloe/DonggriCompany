---
name: donggri-codex-skill-authoring
description: Use when creating, updating, validating, or syncing Codex skills for Donggri, including SKILL.md authoring, canonical metadata, local Codex app installation, and Skill tab catalog integration.
---

# Donggri Codex Skill Authoring

## Canonical structure

- Store Donggri-owned skill sources under `skills/donggri/<skill-name>/SKILL.md`.
- Use lowercase hyphen-case names under 64 characters.
- Keep SKILL.md frontmatter limited to `name` and `description`.
- Store category and provider metadata outside SKILL.md in the Donggri catalog manifest.
- Write skill body text in English; translate only in the UI layer.

## Authoring workflow

1. Identify a concrete trigger and one repeatable workflow.
2. Keep the SKILL.md body concise and procedural.
3. Add scripts or references only when they prevent repeated fragile work.
4. Validate with the repo-owned lightweight validator.
5. Sync to the local Codex app skill home only after validation.

## Validation

```powershell
powershell -ExecutionPolicy Bypass -File ".\tools\skills\sync-codex-skills.ps1" -SkillName "<skill-name>" -Validate -WhatIf
powershell -ExecutionPolicy Bypass -File ".\tools\skills\sync-codex-skills.ps1" -SkillName "<skill-name>" -Validate
```

## Catalog rules

- Use English canonical category keys.
- Add OAuth requirements as provider identifiers, not secrets.
- Mark skills that require local credentials as `reauth_required` or `execution_ready` in UI only.
