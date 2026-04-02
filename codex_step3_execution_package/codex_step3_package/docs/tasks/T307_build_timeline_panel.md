# T307 Build Timeline Panel

## Goal
Render a chronological timeline of orchestration events.

## Outputs
- `src/office/components/TimelinePanel.tsx`
- `src/office/components/TimelineEventRow.tsx`

## Requirements
- Support event icon, timestamp, actor label, message.
- Support filtering by employee/session/event type.
- Consume `/api/timeline` initial data and SSE deltas later.

## Acceptance
- Timeline renders newest-first or grouped mode per chosen pattern.
- Empty state is user-friendly.
