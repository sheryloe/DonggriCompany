# Skill: account-pools-router

Use this skill when implementing Step 2 of the local agent office system.

## Objective
Build the runtime control plane:
- account pools
- fatigue normalization
- runtime router
- provider usage probes
- admin UI for inspection and simulation

## Working rules
1. Prefer small, reviewable diffs.
2. Implement schema and tests before UI.
3. Preserve raw provider probe payloads.
4. Keep router logic deterministic and explainable.
5. Never hard-bind employees to a provider in Step 2.
6. Never mutate OAuth credentials or login caches.
7. If provider usage cannot be read reliably, return a structured degraded result.

## Recommended order
1. schema
2. repositories
3. normalization engine
4. router
5. provider probes
6. admin UI

## Deliverable quality bar
- TypeScript strict mode clean
- tests for routing and fatigue logic
- structured errors
- route simulation produces explainable output
