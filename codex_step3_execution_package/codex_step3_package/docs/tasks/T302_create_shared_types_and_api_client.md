# T302 Create Shared Types and API Client

## Goal
Build typed fetch helpers and Step 3 view model types.

## Inputs
- docs/contracts/viewmodels.md
- docs/rules/api_scope.md

## Outputs
- `src/lib/types/office.ts`
- `src/lib/api/client.ts`
- `src/lib/api/office.ts`

## Requirements
- Add TypeScript interfaces for OfficeBootstrapVM, EmployeeCardVM, SessionCardVM, TimelineEventVM, AccountPoolVM, RuntimeProfileVM, ProviderStatusVM.
- Add typed client helpers for GET and POST.
- Add API functions for every allowed Step 3 route.

## Acceptance
- No `any` in exported API client surface.
- All allowed routes have wrapper functions.
- Excluded routes have no client helper.
