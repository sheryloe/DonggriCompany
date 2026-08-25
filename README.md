# Dongri-grigri

Dongri-grigri is a local-first operations command center for a source-controlled AI workspace. It projects real Control Plane documents, repository state, tasks, agents, approvals, and evidence into a Korean-first interface without becoming a second source of truth.

> Current channel: `1.0.0-alpha.2`. This is a public alpha, not a production or long-duration certification claim.

## What you get

- A decision-first Command Center at `/` with native Today, Projects, Tasks, Agents & Skills, and System views.
- URL-addressable views and details that survive refresh and browser history.
- A Seoul-transit-inspired project map generated from real registry and Git state.
- The incumbent compatibility interface at `/old`.
- Read-only source identity and active-spec projection through a compact dashboard API.
- A six-role command path that can register work or register and run it, then return to the native task detail for execution controls, logs, and the final result.
- Explicit separation between local verification and Soak, Pilot, release, or deployment evidence.

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

```bash
SMOKE_PROJECT_PATH=/absolute/disposable/project corepack pnpm run smoke:command-loop
```

The smoke command accepts loopback HTTP only, caps its deadline at 900 seconds, verifies command → department → agent → execution → non-empty result, and does not clean up the created task automatically.

The public-readiness gate checks repository identity, documentation, CI wiring, the compact dashboard contract, portable Control Plane configuration, the bounded command-loop harness, and public alpha wording. See [docs/QUALITY-949.md](docs/QUALITY-949.md) for the local quality rubric and its non-claims.

## Source-of-truth model

Dongri-grigri reads the root registry and active specs. It does not copy them into an independent product registry. Mutating operations remain guarded by explicit approvals and are outside the read-only Command Center projection.

## Contributing and security

Contributions target `main` through pull requests. Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing code. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
