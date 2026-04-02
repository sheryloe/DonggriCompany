# T204 — Office dashboard UI

## Objective
Build the office view with workspace columns or zones, employee cards, runtime badges, and fatigue summaries.

## Inputs
- employee list API
- account pool summaries from Step 2
- SSE endpoint

## Outputs
- /office page
- workspace switcher
- employee card components
- top status bar

## Implementation notes
Default to card/grid mode. Map mode may be scaffolded but not required for completion.

## Acceptance criteria
- office page renders seed data
- status bar shows account pool fatigue
- active employees visibly differ from idle employees

## Validation commands
```bash
pnpm test -- office-ui
pnpm lint
pnpm typecheck
```
