# Dongri-grigri

Dongri-grigri is the local-first operating console for the Donggri DevDrive Control Plane.

It turns the root workspace at `G:\Donggri_DevDrive` into a visible office: specs, approvals, project scopes, Codex runner state, AgentMemory readiness, review gates, and operational evidence are shown in one app instead of being scattered across files and terminals.

The important boundary is simple:

- `G:\Donggri_DevDrive\storage\codex-control` is the source of truth.
- Dongri-grigri reads and projects that source of truth into an operator UI.
- Codex app settings, OAuth state, tokens, secrets, and raw transcripts are not owned or replaced by Dongri-grigri.
- Git, Docker, database resets, deploys, and secret changes require explicit approval.

## What This App Is

Dongri-grigri is not a separate project root. It is a runtime and projection layer for the single Donggri Control Plane.

The first screen is an office-style operations dashboard. The goal is to make the system feel like a working company floor:

- department zones for planning, development, design, quality, operations, and instructor work
- role activity spaces for focused work, meetings, operations, study, memory, and breaks
- a small OPS control corner with project scope boards
- Codex runner and account-pool status surfaced as operational state, not hidden shell trivia
- AgentMemory shown as a safe workbench with approval gates
- Control Plane specs, evidence, handoff, and quality checks visible without opening raw files

## Operating Model

Donggri Root Control SDD Ver.1 uses six persistent department agents:

| Department | Responsibility |
| --- | --- |
| CONTROL | root state, routing, approval ledger, quality gate |
| SPEC | requirements, design, tasks, repo map, approval documents |
| EXPLORE | read-only investigation and context recovery |
| IMPLEMENT | approved code and document changes inside allowed paths |
| REVIEW | findings-first review, risk checks, test gaps |
| OPS | runtime, Git, Docker, account pools, evidence, handoff |

OPS is the single persistent project operations agent. Projects such as `DonggriCompany`, `BloggerGent`, `JasoSul`, and `dangyang_ssaju` are OPS project scopes, not separate permanent operations agents.

Persona subagents may be created for one bounded task, but they are disposable helpers. They do not become permanent staff, cannot spawn other personas, and their outputs must be accepted, rejected, recreated, or merged by the parent department agent.

## Control Plane Layout

The source-of-truth documents live outside this repository:

| Area | Path |
| --- | --- |
| Registry | `G:\Donggri_DevDrive\storage\codex-control\registry` |
| Active specs | `G:\Donggri_DevDrive\storage\codex-control\specs` |
| Steering | `G:\Donggri_DevDrive\storage\codex-control\steering` |
| Hooks policy | `G:\Donggri_DevDrive\storage\codex-control\hooks` |
| Orchestrator policy | `G:\Donggri_DevDrive\storage\codex-control\orchestrator` |
| Context packs | `G:\Donggri_DevDrive\storage\codex-control\context-packs` |
| Quality gates | `G:\Donggri_DevDrive\storage\codex-control\quality` |
| Integrations | `G:\Donggri_DevDrive\storage\codex-control\integrations` |

Non-trivial work is tracked with SDD documents:

- `metadata.md`
- `requirements.md`
- `design.md`
- `tasks.md`
- `repo-map.md`
- `approvals.md`
- `evidence.md`
- `handoff.md`
- `learnings.md`

Dongri-grigri may display these documents and their projections. It must not replace them as the source of truth.

## Main Features

### Office Operations Dashboard

The `office` route is the main experience. It is a 2D office dashboard with practical work areas rather than a raw data table.

Current office concepts include:

- master department zones
- work seats with monitors, tickets, and desk islands
- meeting room with agenda and attendance signals
- OPS corner with server racks, monitor wall, and project boards
- learning and memory areas
- reduced lounge footprint so the screen reads as a working office

### Control Plane Console

The Control Plane view exposes the root operating state:

- active spec and previous specs
- approval ledger status
- project registry projection
- department agent model
- run and persona evidence
- quality/audit signals
- harness blueprint previews and draft gating
- stale/current Codex thread relationship state

Mutation routes are guarded and should require the appropriate approval class.

### Codex Runtime and Account Pools

Dongri-grigri can show Codex-oriented CLI account pools and runner readiness. This is an operational view over local execution state.

It does not replace the Codex app's own settings. Codex app login, model choice, native settings, plugins, MCP configuration, and local app state remain Codex app concerns.

Docker mode mounts Codex multi-auth storage read-only when configured:

```text
${USERPROFILE}/.codex/multi-auth:/home/app/.codex/multi-auth:ro
```

Per-run account profiles are stored under the runtime account directory, not inside source code:

```text
${DONGGRI_RUNTIME_ROOT}/office-accounts
```

### AgentMemory Workbench

AgentMemory is a memory layer, not the source of truth.

The Memory tab is designed as an internal workbench:

- embeds the AgentMemory Viewer at `127.0.0.1:3113` when available
- falls back to a safe proxy workbench when the Viewer is offline or blocked
- keeps search/context/remember flows scoped and approval-aware
- blocks runtime start/connect, MCP hooks, global capture, delete, forget, import, and raw transcript capture unless separately approved

Runtime candidates:

| Item | Candidate |
| --- | --- |
| Runtime path | `G:\Donggr_Runtime\agentmemory` |
| Server | `http://127.0.0.1:3111` |
| Viewer | `http://127.0.0.1:3113` |

## Local Development

Use PowerShell from the repository root:

```powershell
Set-Location G:\Donggri_DevDrive\repos\DonggriCompany
corepack pnpm install
corepack pnpm run dev:local
```

Default local development endpoints:

| Surface | URL |
| --- | --- |
| Web | `http://127.0.0.1:8800` |
| API | `http://127.0.0.1:8790` |

Health check:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/health" | ConvertTo-Json -Compress
```

## Docker

Docker is available for local operation, but it is not the default safe action.

Before starting Docker, inspect the generated compose configuration:

```powershell
Set-Location G:\Donggri_DevDrive\repos\DonggriCompany
docker compose config
```

Start the container only when Docker execution is approved:

```powershell
docker compose up -d --build
```

Docker endpoint:

```text
http://127.0.0.1:8900
```

Docker runtime state is mounted outside the source tree through `DONGGRI_RUNTIME_ROOT`:

```text
data/
office-accounts/
worktrees/
```

Do not commit runtime data, logs, DB files, OAuth material, token files, or generated account profiles.

## Verification

Recommended checks after meaningful changes:

```powershell
corepack pnpm exec tsc -p tsconfig.json --noEmit --pretty false
corepack pnpm run test:api -- control-plane seeds
corepack pnpm run test:web -- ControlPlanePage Sidebar.app-shell ManualLibrary TaskBoard SkillsLibrary
corepack pnpm run openapi:check
corepack pnpm run build
```

Office dashboard focused checks:

```powershell
corepack pnpm run test:web -- OfficeView officeFloorPlan officeTextIntegrity officeActivitySpaces
```

Root Control Plane quality check:

```powershell
node G:\Donggri_DevDrive\tools\control-plane\spec-quality.mjs score --control-root G:\Donggri_DevDrive\storage\codex-control --min-score 95 --fail-on-hard-gate
```

## Important Safety Rules

- Do not use `D:` for project work.
- Do not treat `repos\DonggriCompany` as the root Control Plane.
- Do not create `.kiro` or depend on Kiro runtime.
- Do not expose `.env`, auth files, OAuth tokens, refresh tokens, API keys, private keys, passwords, or raw transcripts.
- Do not run DB resets, Docker up/down/restart/build, deploys, Git history operations, cleanup, or deletes without explicit approval.
- Preserve unrelated dirty worktree changes.
- Keep generated screenshots, logs, DB files, coverage, `dist`, `.tmp`, and runtime artifacts out of commits.

## Repository Map

| Path | Purpose |
| --- | --- |
| `server/` | Express API, SQLite schema, runner services, Control Plane projection |
| `src/` | React/Vite frontend |
| `src/components/OfficeView.tsx` | main office dashboard shell |
| `src/components/office-view/` | Pixi office scene, layout, activity, density, and text integrity models |
| `src/components/ControlPlanePage.tsx` | Control Plane detail console |
| `src/components/settings/` | OAuth, CLI pool, provider, and runtime settings UI |
| `scripts/` | verification, OpenAPI, reset, and operational helper scripts |
| `docs/` | architecture, API, operations, security, release, and analysis notes |
| `public/` | static app assets and office sprites |

## Reset Policy

When the app state must be reset, use the approved soft reset script only:

```powershell
corepack pnpm run db:reset:dongri
```

The reset is intended for application DB state, not source files.

Preserve unless explicitly approved otherwise:

- repo files
- Git history
- settings required to run the app
- OAuth/API provider/CLI account configuration
- root Control Plane documents
- secrets and auth material

## Git Policy

Commit and push only after:

1. the user explicitly approves Git operations,
2. relevant checks pass or skipped checks are clearly explained,
3. staged files are reviewed,
4. secret-pattern scan is clean,
5. generated/runtime artifacts are excluded.

Never run `reset`, `rebase`, `stash`, `clean`, `restore`, force push, or history rewrite without explicit approval.

## License

Dongri-grigri is licensed under the Apache License, Version 2.0. See `LICENSE`.

This repository includes software derived from the upstream Apache-2.0 project identified in `NOTICE`.
