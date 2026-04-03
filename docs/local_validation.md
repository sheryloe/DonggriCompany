# Local Validation Guide

Date: 2026-04-03

## Prerequisites

- Node.js 20.x recommended
- Corepack enabled (`corepack enable`)
- Workspace dependencies installed from repo root

```bash
corepack pnpm install
```

## Standard Validation Commands

Run from repository root:

```bash
corepack pnpm -r --if-present run typecheck
corepack pnpm -r --if-present run lint
TMPDIR=/tmp corepack pnpm -r --if-present run test
```

## better-sqlite3 Recovery

Symptom:
- tests fail with native binding/module load error for `better-sqlite3`.

Reproducible recovery:

```bash
corepack pnpm --filter @workspace/db rebuild better-sqlite3
```

If still unresolved after rebuild:

```bash
corepack pnpm install --force
corepack pnpm --filter @workspace/db rebuild better-sqlite3
```

## Notes

- `@workspace/db` tests use sqlite native bindings.
- In CI or fresh local env, run full validation only after install/rebuild step succeeds.
