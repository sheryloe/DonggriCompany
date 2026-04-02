# PRN 03 — Employee Office UI (Codex Execution Version)

## Goal
Implement the user-facing office simulation layer where employees are first-class entities and model/runtime is attached at task/session time.

## Core principle
- Employee is identity
- Runtime profile is execution engine
- Account pool is stamina/fatigue source
- Session is active behavior
- Event stream is the observable history

## What must exist at the end
1. Employee CRUD and role assignment
2. Workspace / office-zone registry
3. Office dashboard with employees rendered as cards or map nodes
4. Real-time session list with status, runtime badge, and progress
5. Timeline panel fed by SSE
6. Employee inspector drawer with:
   - current role
   - assigned runtime
   - active session
   - override actions
7. Session control API:
   - start
   - stop
   - rebind runtime
   - move workspace
8. UI themes that support human / animal / robot / pixel presets

## Non-goals
- Telegram integration
- Production auth hardening
- Full animation engine
- Asset marketplace
- Voice or TTS

## References from prior steps
- Step 1 provides local foundation and bootstrap
- Step 2 provides account pools, fatigue, runtime router
- Step 3 consumes both and visualizes them

## Acceptance summary
- User can create employees and assign visual presets
- User can create office zones and place employees
- User can see active sessions update in real time
- User can inspect an employee and change runtime binding
- User can view a timeline of state changes and notable events
