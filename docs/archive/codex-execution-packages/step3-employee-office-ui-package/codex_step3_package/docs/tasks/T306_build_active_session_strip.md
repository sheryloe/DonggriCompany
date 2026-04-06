# T306 Build Active Session Strip

## Goal
Show all active sessions as a compact horizontal strip.

## Outputs
- `src/office/components/ActiveSessionStrip.tsx`
- `src/office/components/SessionPill.tsx`

## Requirements
- Render current task title, runtime provider, progress, status, blocked reason if any.
- Clicking a session focuses related employee and inspector.

## Acceptance
- Session strip updates from bootstrap data.
- Session selection and employee selection stay in sync.
