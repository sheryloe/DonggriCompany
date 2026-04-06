# T206 — Session strip, timeline, and presence

## Objective
Add real-time timeline panel, active session strip, and optional presence markers per employee.

## Inputs
- ui events
- sessions API
- employee presence data

## Outputs
- timeline panel
- active session strip
- presence state badges

## Implementation notes
Timeline should support filters for employee, session, severity. Presence may be represented as simple badges if position data is unused.

## Acceptance criteria
- timeline updates via SSE
- session strip shows active sessions
- filters work for at least employee and severity

## Validation commands
```bash
pnpm test -- timeline
pnpm lint
pnpm typecheck
```
