# IMPLEMENT STEP 1

## Execution order
1. T001 workspace shell
2. T002 SQLite schema + migration wiring
3. T003 bootstrap API
4. T004 bootstrap wizard UI
5. T005 role pack loader + dashboard shell
6. T006 provider probe adapters

## Delivery rules
- Keep changes small and reviewable.
- Prefer typed contracts shared between server and web.
- Do not build future-step features prematurely.
- Implement the simplest thing that satisfies Step 1.
