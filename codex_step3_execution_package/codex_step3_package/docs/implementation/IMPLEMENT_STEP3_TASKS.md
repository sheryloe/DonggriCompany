# IMPLEMENT_STEP3_TASKS

## Objective
Turn the Step 3 wireframe spec into implementable UI tickets for Codex.

## Hard Rules
- Do not add any `/api/oauth/*`, `/api/auth/*`, `/api/providers/:provider/login`, callback, token, refresh routes in this step.
- UI talks only to internal local APIs.
- Provider OAuth remains owned by each CLI outside the web UI.
- Use SSE for real-time updates. Do not introduce WebSocket unless explicitly required later.
- Employee-first UI. Runtime/model is shown as a badge, not as the primary identity.

## Deliverables
- Shared typed API client + view models
- Office dashboard shell
- Employee cards and office zones
- Session strip + timeline
- Inspector + control actions
- Runtime profile and account-pool summary widgets
