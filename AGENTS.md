# Dongri-grigri Project Rules

## Root Contract

- Root workspace: `G:\Donggri_DevDrive`
- Repo estate root: `G:\Donggri_DevDrive\repos`
- This repo: `G:\Donggri_DevDrive\repos\DonggriCompany`
- DonggriCompany is a Dongri-grigri runtime/projection app for the root Control Plane.
- Do not treat this repo as a separate Codex project root unless the user explicitly asks.

Before planning or editing, read:

1. `G:\Donggri_DevDrive\AGENTS.md`
2. `G:\Donggri_DevDrive\storage\codex-control\registry\projects.yaml`
3. `G:\Donggri_DevDrive\storage\codex-control\specs\_active.md`
4. `G:\Donggri_DevDrive\storage\codex-control\learnings\patterns.md`
5. `G:\Donggri_DevDrive\storage\codex-control\learnings\anti-patterns.md`

## Product Model

Dongri-grigri keeps the office-style operations dashboard as the main experience.
The app must project the root Control Plane state into a friendly office UI, not create a second source of truth.

Default user-facing model:

- 기획 마스터
- 개발 마스터
- 디자인 마스터
- 품질 마스터
- 운영 마스터
- 외부강사 마스터

Do not present the old 22-person staff, team lead, senior, or junior hierarchy as the default model.
Old-record compatibility code may remain only where it is required for old records or tests.

## Agent Model

- A master department agent may create disposable single-task subagents.
- Subagents are not permanent staff.
- Subagents cannot create other subagents.
- The parent master agent accepts, rejects, recreates, or merges subagent results.
- Repo code writes require an approved task, allowed paths in `repo-map.md`, and the implementation authority assigned by the active spec.
- OPS is the single persistent project operations agent. Individual projects are OPS project scopes, not separate persistent project operators.

## SDD

For non-trivial work, use the active root spec under:

`G:\Donggri_DevDrive\storage\codex-control\specs`

Required SDD files:

- `metadata.md`
- `requirements.md`
- `design.md`
- `tasks.md`
- `repo-map.md`
- `approvals.md`
- `evidence.md`
- `handoff.md`
- `learnings.md`

Do not implement before the relevant task and approval are recorded.
Update `evidence.md` and `handoff.md` before reporting completion.

## Kiro-Inspired Structure

Dongri-grigri maps Kiro-style specs, steering, hooks, orchestration, context injection, and verification into Donggri-native root structures.

- Do not create `.kiro`.
- Do not install or depend on Kiro runtime, Kiro hook runner, or Kiro Autopilot runner.
- Use `storage\codex-control\steering`, `hooks`, `orchestrator`, `context-packs`, `quality`, and `integrations`.

## AgentMemory

AgentMemory is a memory layer, not the source of truth.

- Root docs and active specs win over memory recall.
- Show memory by scope: root, department, project, run, persona.
- Runtime candidate: `G:\Donggr_Runtime\agentmemory`
- Local server candidate: `127.0.0.1:3111`
- Viewer candidate: `127.0.0.1:3113`
- Do not enable MCP hooks, transcript capture, forget/delete/import, or global remember automation without explicit OPS approval.

## UI Rules

- User-facing text is Korean-first.
- Visible brand is `Dongri-grigri`.
- Do not show the old product name in normal UI copy.
- Light theme must be readable. Do not hard-code dark-only white text on light surfaces.
- Keep navigation compact and use the wide desktop viewport well.
- Avoid fake agent conversations. Chat/timeline panels should show real run, persona, event, decision, memory, or evidence records.

## Data Reset Rules

When the user asks to reset the app state, this means app DB state unless they explicitly mention repo files.

Allowed reset target, with approval:

- `projects`, `tasks`, old messages/logs/minutes, local app memories, and Control Plane projection rows.

Preserve unless explicitly approved otherwise:

- repo files
- settings required to run the app
- OAuth/API provider/CLI account configuration
- root Control Plane documents
- Git history

Use the reset script:

```powershell
corepack pnpm run db:reset:dongri
```

## Verification

Prefer these checks after meaningful changes:

```powershell
corepack pnpm exec tsc -p tsconfig.json --noEmit --pretty false
corepack pnpm run test:api -- control-plane seeds
corepack pnpm run test:web -- ControlPlanePage Sidebar.app-shell ManualLibrary TaskBoard SkillsLibrary
corepack pnpm run openapi:check
corepack pnpm run build
```

For browser smoke, verify:

- title includes `Dongri-grigri`
- first screen is the office dashboard
- old product naming, visible old-mode labels, and broken Korean patterns are absent

## Git Safety

Do not commit, push, reset, rebase, merge, stash, clean, checkout, restore, or rewrite history unless explicitly approved.

Commit hygiene:

- Do not stage `.tmp/`, screenshots, logs, DB files, backups, `dist/`, coverage, or token material.
- Run a staged diff check and secret-pattern scan before committing.
- Use normal commit and push only after tests pass and the user has approved it.

## Reporting

Report in Korean.
Always include:

- current path
- affected repos
- changed files
- Git status
- verification
- evidence/handoff updates
- remaining risks
