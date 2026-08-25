# Contributing to Dongri-grigri

Thank you for helping improve Dongri-grigri.

## Branch and pull request model

- `main` is the only long-lived branch.
- Create a short-lived branch in your fork from the latest `main`.
- Open every contribution as a pull request targeting `main`.
- Do not include runtime databases, logs, screenshots, generated `dist`, coverage, backups, or secrets.
- Prefer a focused change with tests and an explicit verification note.

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/short-description
git push -u origin feature/short-description
gh pr create --base main --fill
```

## Local checks

Run the checks proportional to your change. UI and API contract changes should run the complete set.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run public:verify
corepack pnpm exec tsc -p tsconfig.json --noEmit --pretty false
corepack pnpm run test:web
corepack pnpm run test:api
corepack pnpm run openapi:check
corepack pnpm run build
```

Docker is not required for this contribution path. Runtime, browser, Soak, Pilot, deployment, and migration evidence are separate maintainer-controlled gates.

## Product rules

- Keep the visible brand `Dongri-grigri` and user-facing copy Korean-first.
- Treat root Control Plane documents as the source of truth; do not introduce a second registry.
- Use real task, project, agent, approval, evidence, or runtime records. Do not fabricate operational activity.
- Preserve `/old` as a compatibility route unless a separately reviewed migration removes it.
- Keep keyboard, mobile, light/dark theme, 200% reflow, and reduced-motion behavior intact.

## Review expectations

At least one maintainer approval and passing required checks are expected before merge. Security-sensitive, destructive, deployment, or schema-changing work needs an explicit maintainer-owned scope and evidence plan.
