# T310 Add Session Control Actions

## Goal
Implement pause/resume/override runtime controls.

## Outputs
- `src/office/components/SessionControls.tsx`
- update `src/lib/api/office.ts`

## Requirements
- POST `/api/sessions/:id/pause`
- POST `/api/sessions/:id/resume`
- POST `/api/sessions/:id/override-runtime`
- Optimistic or semi-optimistic UI with rollback on failure.

## Acceptance
- Controls are disabled when no active session is selected.
- Success and error feedback are visible.
