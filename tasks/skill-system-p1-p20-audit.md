# Skill System Preflight P1-P20 Audit

Date: 2026-04-28
Scope: server preflight for `skills/donggri`, `/api/skills`, Skill tab UI, Codex skill sync, and OAuth readiness.

## Current classification

| Priority | Status | Item | Evidence / acceptance |
| --- | --- | --- | --- |
| P1 | Done | Codex install API must not expose arbitrary/local paths | `server/modules/routes/ops/skills/catalog-routes.ts` uses module-relative repo root, repo-backed source only, local action header, CSRF check, atomic swap, and no `codexSkillPath` response. |
| P2 | Done | Public OAuth status must not leak account identity | `/api/oauth/status` is readiness-only; `/api/oauth/status/debug` is separated for authenticated admin/settings consumers. |
| P3 | Done | Skill tab custom category count/filter mismatch | `custom` count uses custom skills; selecting `custom` hides catalog grid and shows custom section only. |
| P4 | Done | ESC close tests failing from missing API mock | `SkillsLibrary.esc-close.test.tsx` mocks `getOAuthStatus`; 9 ESC tests pass. |
| P5 | Done | Skill tab visible mojibake in priority subcomponents | `LearningModal`, `CustomSkillSection`, `SkillsMemorySection`, `ClassroomOverlay`, `SkillsGrid`, and `SkillsLibrary` were normalized. |
| P6 | Done | Donggri seed details should use real server detail route | `useSkillsLibraryState` no longer builds synthetic Donggri detail payloads; hover detail calls `/api/skills/detail`. |
| P7 | Done | Sync script must not run `$CODEX_HOME` Python validator | `tools/skills/sync-codex-skills.ps1` uses repo-owned lightweight validation and atomic copy. |
| P8 | Done | Skill docs must match validator/security behavior | Donggri skill authoring/OAuth/Gemini docs now reference repo validator and readiness-only OAuth status. |
| P9 | Done | OAuth readiness badge must reflect storage/connect/execution state | Skill cards distinguish `storage_unavailable`, `connectable`, `reauth_required`, `execution_ready`. |
| P10 | Done | Global-only `donggri-gemini-nano` must not expose global SKILL.md | Catalog can show detected metadata; `/api/skills/detail` returns null when no repo-backed source exists. |
| P11 | Done | Full skills.sh catalog must not be capped at 600 | Sitemap-backed merge and ranked overlay tests cover full catalog behavior. |
| P12 | Done | Custom search result count must include custom entries | `filteredCustomSkillsCount` is included for `all` search and `custom` selected category. |
| P13 | Done | Atomic install rollback failure path needs direct test | Forced `renameSync` failure test asserts previous Codex skill directory is restored. |
| P14 | Done | CSRF install behavior needs session-mode integration test | Tests cover no-bearer missing CSRF rejection and valid CSRF success. |
| P15 | Done | Runtime smoke must be run after server start | Windows local `8790` smoke passed for `/api/skills`, `/api/skills/detail`, `/api/oauth/status`, `/api/oauth/status/debug`, `/api/skills/refresh`, and install POST. |
| P16 | Done | Browser/UI install flow needs authenticated smoke | Playwright smoke passed on `8800`: Skill tab loaded, category labels rendered, `Codex 앱에 설치` clicked, and Codex home install verified. |
| P17 | Done | Skill UI still has inline locale objects | Skill tab domain strings were moved to `skillLibraryText`; component scan has no remaining inline `t({ ko/en/ja/zh })` objects outside the dictionary. |
| P18 | Done | OAuth debug endpoint needs explicit admin/debug policy | `/api/oauth/status/debug` now requires `x-donggri-debug-action: oauth-status-debug`; regular `/api/oauth/status` stays readiness-only. |
| P19 | Done | Catalog cache lacks manual refresh / invalidation UX | Added authenticated `POST /api/skills/refresh` and a Skill tab refresh action. |
| P20 | Done | Skill availability reconciliation needs UI status pass | Refresh clears catalog/detail caches and recomputes server-derived `codexInstalled` state from Codex home. |

## Validation already run

```powershell
corepack pnpm test:web -- src/components/SkillsLibrary.counts.test.tsx src/components/SkillsLibrary.esc-close.test.tsx src/components/skills-library/SkillsGrid.render.test.tsx
corepack pnpm test:api -- server/modules/routes/ops/skills/catalog-routes.test.ts server/modules/routes/ops/oauth/status.redaction.test.ts server/modules/workflow/core/prompt-skills.test.ts server/modules/workflow/core/video-skill-bootstrap.test.ts
corepack pnpm build
powershell -ExecutionPolicy Bypass -File ".\tools\skills\sync-codex-skills.ps1" -SkillName "donggri-codex-skill-authoring" -Validate -WhatIf
```

Latest verification:

```powershell
corepack pnpm test:web -- src/components/SkillsLibrary.counts.test.tsx src/components/SkillsLibrary.esc-close.test.tsx src/components/skills-library/SkillsGrid.render.test.tsx src/components/skills-library/model.sort.test.ts
corepack pnpm test:api -- server/modules/routes/ops/skills/catalog-routes.test.ts server/modules/routes/ops/oauth/status.redaction.test.ts server/modules/workflow/core/prompt-skills.test.ts server/modules/workflow/core/video-skill-bootstrap.test.ts
git diff --check -- . ':(exclude)src/components/Dashboard.tsx'
corepack pnpm build
powershell -ExecutionPolicy Bypass -File ".\tools\skills\sync-codex-skills.ps1" -SkillName "donggri-google-stitch-design" -Validate -WhatIf
```

Runtime smoke:

```text
Windows local API: 127.0.0.1:8790, db=data\claw-empire.sqlite, skillsCount=4111, refreshCount=4111, debug without header=403, debug with header=200.
Browser UI: 127.0.0.1:8800, Skill tab category labels visible, install button flow completed, Codex home SKILL.md present.
```

## Next implementation order

1. Stage only Skill System scope files; leave unrelated dirty files unstaged.
2. Review staged diff before commit.
3. Commit and push only after confirming the staged scope is clean.
