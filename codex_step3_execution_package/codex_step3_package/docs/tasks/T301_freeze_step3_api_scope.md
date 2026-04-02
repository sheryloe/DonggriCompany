# T301 Freeze Step 3 API Scope

## Goal
Create a single source of truth for which APIs are allowed in Step 3.

## Inputs
- docs/rules/api_scope.md

## Outputs
- `src/lib/api/allowed-routes.ts`
- `src/lib/api/route-map.ts`
- update references in UI docs/comments if needed

## Requirements
- Export constants for all allowed Step 3 routes.
- Clearly mark excluded OAuth/auth/telegram/webhook routes.
- No network calls outside the approved list.

## Acceptance
- UI code imports route constants instead of hardcoding strings.
- No references to excluded route prefixes remain in `src/office` UI code.
