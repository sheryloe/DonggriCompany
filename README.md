# Dongri-grigri

[한국어](README_ko.md) · [English](README.en.md) · [简体中文](README_zh.md)

Dongri-grigri is a local-first operations command center for a source-controlled AI workspace. It projects real Control Plane documents, repository state, tasks, agents, approvals, and evidence into a Korean-first interface without becoming a second source of truth.

> Current source candidate: `1.0.0-alpha.2` (unreleased). No matching Git tag or GitHub Release exists yet; this is not a public Alpha or a production-readiness claim.

> Evidence-based readiness baseline: `771.1/1000` on 2026-08-28. `DAY 30/30` names the completed planning ledger, not product completion; real provider dispatch, Docker terminal reliability, portable distribution, and external adoption remain open gates.

## Why this project exists

Codex and Claude keep separate sessions, authentication, and subscription lifecycles. A project should not lose its objective, changed-file state, verification evidence, blockers, or next safe action just because its active provider changes. Dongri-grigri is building a provider-neutral continuity layer around the local workspace while keeping the repository and Control Plane as the source of truth.

The interface turns that state into an operating map: projects are transit lines, execution phases are stations, Codex and Claude are operator characters, and a verified provider handoff becomes a transfer on the same task line.

## Current status

| Capability                                                  | Alpha.2 status                            |
| ----------------------------------------------------------- | ----------------------------------------- |
| Project/task/agent and Control Plane projection             | Available                                 |
| Project + Codex/Claude selection when registering a command | Available in the current V1 work branch   |
| Character transit board bound to task/provider status       | Visual foundation available               |
| Determinate `N/M` and honest indeterminate progress         | Available                                 |
| Durable continuity checkpoint                               | Component verified; integration still HOLD |
| Verified Codex ↔ Claude transfer and resume                 | Mock verified; real runner smoke pending  |
| Git/workspace drift protection                              | Implemented and locally verified          |
| Sequenced checkpoint projection                             | Available; live run-ledger binding pending |
| Portable mock-provider demo                                 | Available with `pnpm demo:continuity`     |

The current work branch has verified local components and a credential-free mock transfer. The integrated local Runner contract remains on HOLD until approval consumption, source ownership/pause acknowledgement, Supervisor binding, and restart reconciliation are joined and verified. It must not be presented as proof of real Codex/Claude runner transfer.

## What you get

- A decision-first Command Center at `/` with native Today, Projects, Tasks, Agents & Skills, and System views.
- URL-addressable views and details that survive refresh and browser history.
- A Seoul-transit-inspired project map generated from real registry and Git state.
- The incumbent compatibility interface at `/old`.
- Read-only source identity and active-spec projection through a compact dashboard API.
- A six-role command path that can register work or register and run it, then return to the native task detail for execution controls, logs, and the final result.
- A provider-continuity transit-board foundation that keeps task identity visible while the durable transfer contract is being implemented.
- Character sprites tied to real task/provider state. Current station placement is provisional until backend-authoritative run phases land; indeterminate LLM work never receives a fabricated percentage.
- Explicit separation between local verification and Soak, Pilot, release, or deployment evidence.

## V1.0 MVP contract

V1.0 MVP is reached only when one local project task can be paused under Codex, checkpointed with a verified workspace digest, accepted by Claude, and resumed without losing work—and the reverse path passes the same contract.

The MVP requires:

- durable, restart-safe continuity checkpoints;
- exact project, Git root, branch, HEAD, changed-path, and workspace-digest validation;
- explicit pause → checkpoint → validate → accept → resume transitions;
- provider readiness states without guessed subscription quota;
- fail-closed dispatch when the selected runner is unavailable or uncertain;
- sequenced WebSocket run events, heartbeat, blockers, terminal result, and recent output;
- a backend-authoritative character transit board;
- an OAuth-free mock-provider demo and portable Windows setup.

See the [30-day V1 MVP delivery plan](docs/V1-MVP-30-DAY-PLAN.md). The plan prohibits empty, backdated, or verification-free commits.

## Requirements

- Node.js 22 or newer
- Corepack and pnpm 10
- Windows is the primary operating environment; the CI contract also covers Linux.

Docker is optional. It is not required for install, static verification, unit tests, or the local development server.

## Quick start

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run public:verify
corepack pnpm run dev:local
```

Open `http://127.0.0.1:8800/`. The local API uses `127.0.0.1:8790` by default.

Run the portable bidirectional demo without OAuth or API keys:

```bash
corepack pnpm run demo:continuity
```

It creates and removes a disposable Git repository in the operating-system temporary directory and prints machine-readable evidence for Codex→Claude and Claude→Codex mock transfers.

The complete Donggri workspace uses root documents under `G:\Donggri_DevDrive\storage\codex-control`. Contributors without that private layout can still run the source checks, tests, build, and inspect the public contracts; live Control Plane projection will correctly report missing or degraded source state.

To project a different local Control Plane, set `DONGGRI_CONTROL_ROOT` to an absolute directory containing `AGENTS.md` and `storage/codex-control`. If it is unset, Dongri-grigri discovers a compatible parent workspace when available and otherwise starts with a safely degraded, repository-local projection.

## Verification

```bash
corepack pnpm run public:verify
corepack pnpm exec tsc -p tsconfig.json --noEmit --pretty false
corepack pnpm run test:web
corepack pnpm run test:api
corepack pnpm run openapi:check
corepack pnpm run build
corepack pnpm run smoke:command-loop:self-test
```

After a separately approved isolated runtime is listening on `127.0.0.1:8790`, the bounded end-to-end command check can be run with an explicit disposable project path:

```bat
set "SMOKE_PROJECT_PATH=C:\absolute\disposable\project"
corepack pnpm run smoke:command-loop
```

The smoke command accepts loopback HTTP only, caps its deadline at 900 seconds, verifies command → department → agent → execution → non-empty result, and does not clean up the created task automatically.

The public-readiness gate checks repository identity, documentation, contribution templates, CI wiring, the compact dashboard contract, portable Control Plane configuration, the bounded command-loop harness, and unreleased Alpha wording. See [docs/QUALITY-949.md](docs/QUALITY-949.md) for the local quality rubric and its non-claims.

See [provider continuity architecture](docs/CONTINUITY_ARCHITECTURE.md), [provider adapter guide](docs/PROVIDER_ADAPTER.md), and [roadmap](docs/ROADMAP.md).

## Source-of-truth model

Dongri-grigri reads the root registry and active specs. It does not copy them into an independent product registry. Mutating operations remain guarded by explicit approvals and are outside the read-only Command Center projection.

Continuity checkpoints will store structured work state and workspace digests, not OAuth tokens, credentials, raw transcripts, or complete source patches. A dirty workspace may transfer between providers only inside the same canonical local workspace and only when its exact digest still matches. Cross-workspace transfer requires a clean commit or a separately approved hash-bound bundle.

## Release policy

- **Alpha:** deterministic continuity fixtures and provider smoke tests pass with known data loss `0`.
- **Beta:** the live visual command center and portable demo pass external installation testing.
- **v1.0.0 Stable:** at least 50 external handoffs with `>=95%` success, all fail-closed scenarios passing, P0/P1 `0`, documentation/runtime mismatch `0`, and data loss `0`.

Stars and downloads are adoption evidence, not substitutes for these safety gates.

## Contributing and security

Contributions target `main` through pull requests. Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing code. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
