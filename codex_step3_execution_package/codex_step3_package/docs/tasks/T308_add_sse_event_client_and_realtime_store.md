# T308 Add SSE Event Client and Realtime Store

## Goal
Connect office UI to `/api/events/stream` and merge live updates.

## Outputs
- `src/lib/realtime/sse.ts`
- `src/office/hooks/useOfficeEvents.ts`
- `src/office/stores/officeRealtimeStore.ts`

## Requirements
- Subscribe to server-sent events.
- Handle employee/session/timeline/account-pool/provider-status updates.
- Implement reconnect with capped backoff.
- Avoid full-page reloads.

## Acceptance
- Live events patch the current UI state.
- Reconnect works after temporary disconnect.
