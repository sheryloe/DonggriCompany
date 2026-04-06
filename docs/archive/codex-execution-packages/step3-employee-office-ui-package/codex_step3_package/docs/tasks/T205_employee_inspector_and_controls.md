# T205 — Employee inspector and controls

## Objective
Implement side drawer/modal inspector with employee metadata and override actions.

## Inputs
- employee API
- runtime profile API
- session control API

## Outputs
- employee inspector component
- move workspace form
- runtime override form
- status actions

## Implementation notes
Do not expose raw IDs if not needed in UI. Use labels and internal hidden IDs.

## Acceptance criteria
- clicking employee opens inspector
- moving workspace updates UI
- runtime override action triggers success path and event

## Validation commands
```bash
pnpm test -- inspector
pnpm lint
pnpm typecheck
```
