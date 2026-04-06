# T309 Build Employee Inspector Panel

## Goal
Show detailed employee/session/runtime information in the right rail.

## Outputs
- `src/office/components/EmployeeInspector.tsx`
- `src/office/components/RuntimeBadgeList.tsx`
- `src/office/components/EmployeeMetrics.tsx`

## Requirements
- Show employee identity, current session, current runtime, recent timeline snippets, available runtime profiles.
- Empty selection state must be explicit.

## Acceptance
- Clicking employee card populates inspector.
- Clicking session pill populates same inspector through linked employee/session context.
