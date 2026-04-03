# IMPLEMENT STEP 2

## Objective
Implement the routing and quota control plane.

## Milestones

### M1 — Schema extension
Add tables for:
- account_pools
- runtime_capabilities
- runtime_profile_capabilities
- fatigue_snapshots
- routing_rules
- routing_rule_targets
- routing_decisions
- provider_probe_runs

### M2 — Repository and services
Create repositories and services for:
- AccountPoolRepository
- RuntimeProfileRepository updates
- FatigueSnapshotRepository
- RoutingRuleRepository
- ProviderProbeRepository
- FatigueEngine
- RuntimeRouter
- UsageNormalizer

### M3 — Provider probes
Add probe adapters for:
- codex
- claude
- gemini

Probe adapters should not modify credentials. They only inspect local status signals or parse command outputs.

### M4 — APIs
Implement APIs for:
- list/create/update account pools
- list fatigue snapshots
- run router simulation
- run provider probes manually
- fetch normalized pool health

### M5 — Admin UI
Build admin pages:
- `/admin/account-pools`
- `/admin/runtime-router`
- `/admin/fatigue`

## Coding standards
- TypeScript strict mode
- Zod on request validation
- never trust provider output blindly
- save raw probe payloads before normalization
- separate routing decision logs from fatigue snapshots

## Verification commands
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:migrate`
- `pnpm dev`

## Done definition
Step 2 is done only if:
- unit tests cover router scoring and fallback behavior
- provider probe failures do not crash the server
- fatigue dashboard shows normalized values and confidence levels
- router simulation endpoint returns decision reasoning

## Completion note (2026-04-03)
- Step-2 implementation is complete and signed off.
- Final validation:
  - `typecheck`: PASS
  - `lint`: PASS
  - `full test suite`: PASS
- Environment issue observed during validation:
  - `better-sqlite3` native binary was missing (`better_sqlite3.node` not present).
  - `pnpm install` did not re-run native install scripts because workspace dependencies were already up to date.
  - Resolved by forcing rebuild for the DB workspace package.
- Reproducible recovery command:
  - `corepack pnpm --filter @workspace/db rebuild better-sqlite3 --reporter append-only`
