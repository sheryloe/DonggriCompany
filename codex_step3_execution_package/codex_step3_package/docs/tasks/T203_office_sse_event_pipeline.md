# T203 — Office SSE event pipeline

## Objective
Add append-only UI events and an SSE endpoint that streams office updates to the dashboard.

## Inputs
- ui_events table
- existing session mutations from prior steps

## Outputs
- event publisher utility
- SSE endpoint
- simple in-process pubsub or polling bridge

## Implementation notes
Prefer simple implementation. It is acceptable to persist events then fan out from an in-memory broker in a single-node deployment.

## Acceptance criteria
- creating/updating employee emits UI events
- session start/rebind emits UI events
- dashboard can subscribe and receive messages

## Validation commands
```bash
pnpm test -- ui-events
pnpm lint
pnpm typecheck
```
