# Step-4 Release Checklist

Date: 2026-04-03

## Validation Gate

- [x] `corepack pnpm -r --if-present run typecheck` PASS
- [x] `corepack pnpm -r --if-present run lint` PASS
- [x] `TMPDIR=/tmp corepack pnpm -r --if-present run test` PASS

## Environment Gate

- [x] Node/Corepack versions match project expectations
- [x] dependencies installed (`corepack pnpm install`)
- [x] sqlite native binding verified (`better-sqlite3`)

## Contract Gate

- [ ] OpenAPI/docs and handlers are aligned for:
  - `/api/office/bootstrap`
  - `/api/runtime-profiles` CRUD
  - `/api/provider-probes/run`
  - `/api/provider-probes/history` query filters
- [ ] web allowed-routes/route-map/client call only approved Step-3 routes

## Critical Flow Manual Checks

- [ ] account pool list + pool detail renders for selected provider
- [ ] runtime profile create/update/delete works
- [ ] delete flow requires confirmation and blocks duplicate click
- [ ] probe run refreshes latest + history
- [ ] history filter (`provider/accountPoolId/runtimeProfileId/limit`) refreshes results
- [ ] UI state badges show `success/partial/stale/no-signal/error` consistently
- [ ] loading/empty/error/retry UX is visible in each section

## Ops Readiness

- [ ] local validation guide published
- [ ] probe failure runbook published
- [ ] known risks and assumptions documented
- [ ] sign-off note updated with latest verification run
