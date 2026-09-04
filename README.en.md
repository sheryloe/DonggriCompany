# Dongri-grigri

[한국어](README_ko.md) · [English](README.en.md) · [简体中文](README_zh.md)

Dongri-grigri is a local-first command center for operating source-controlled AI projects. It projects real Control Plane documents, repository state, tasks, agents, approvals, and evidence without becoming a second source of truth.

> Current source candidate: `1.0.0-alpha.2` (unreleased). No matching Git tag or GitHub Release exists yet; this is not a public Alpha, production, Soak, Pilot, or certification claim.

> Evidence-based readiness baseline: `771.1/1000` on 2026-08-28. `DAY 30/30` describes the completed planning ledger, not product completion; real provider dispatch, Docker terminal reliability, portable distribution, and external adoption remain open gates.

## Provider continuity

The V1 work branch now includes append-only checkpoints, Git-drift protection, fail-closed transfer APIs, live checkpoint projection, and a credential-free bidirectional mock demo. Real Codex/Claude runner smoke, external adoption, and a published release remain separate gates.

The planned shared continuity record carries the objective, acceptance criteria, completed work, changed files, verification results, blockers, Git identity, and next safe action. OAuth tokens and raw chat transcripts are never part of the handoff.

The Command Center presents this as a transit map:

- projects are lines;
- execution phases are stations;
- Codex and Claude are distinct operator characters;
- provider changes are transfers on the same task line;
- approval waits are gates;
- stale runs are warning signals;
- completed work reaches the terminus.

The current foundation uses real task/provider/subtask state but still derives stations provisionally in the frontend. Wave 3 replaces that heuristic with sequenced backend run events. A percentage is shown only when a real total exists; open-ended model work remains indeterminate.

See the [30-day V1 MVP delivery plan](docs/V1-MVP-30-DAY-PLAN.md). It prohibits empty, backdated, and verification-free commits.

## Requirements

- Node.js 22 or newer
- Corepack and pnpm 10
- Windows is the primary operating environment; Linux CI is also covered

Docker is optional. It is not required for installation, source checks, unit tests, builds, or the local development server.

## Quick start

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run demo:continuity
corepack pnpm run public:verify
corepack pnpm run dev:local
```

Open `http://127.0.0.1:8800/`. The API uses `127.0.0.1:8790` by default. The compatibility interface remains available at `/old`.

Set `DONGGRI_CONTROL_ROOT` to an absolute Control Plane directory when the default workspace is not available.

## Verification

```bash
corepack pnpm exec tsc -p tsconfig.json --noEmit --pretty false
corepack pnpm run test:web
corepack pnpm run test:api
corepack pnpm run openapi:check
corepack pnpm run build
corepack pnpm run smoke:command-loop:self-test
```

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Apache-2.0. See [LICENSE](LICENSE).
