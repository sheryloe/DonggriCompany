# T312 Polish, State Guards, and Acceptance Pass

## Goal
Finish Step 3 UI with robust state guards and clean interactions.

## Outputs
- small fixes across `src/office/**`
- `docs/implementation/STEP3_ACCEPTANCE_NOTES.md`

## Requirements
- Add loading, empty, error, reconnecting, and stale-data states.
- Ensure keyboard/focus behavior for selection panels.
- Remove dead code and route stubs for excluded APIs.

## Acceptance
- Office UI can run end-to-end using only allowed Step 3 routes.
- No OAuth/login/callback/token code remains in Step 3 UI.
- Lint, typecheck, and tests pass.
