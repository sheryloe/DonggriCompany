# T303 Build Office Bootstrap Loader

## Goal
Load all Step 3 office data from bootstrap endpoint and hydrate page state.

## Outputs
- `src/office/hooks/useOfficeBootstrap.ts`
- `src/office/stores/officeBootstrapStore.ts`

## Requirements
- Fetch `/api/office/bootstrap` on page load.
- Normalize workspaces, employees, activeSessions, timeline, accountPools, runtimeProfiles, providerStatuses.
- Handle loading, empty, and recoverable error states.

## Acceptance
- Main office route can render from bootstrap state alone.
- On fetch failure, show retry action and non-blocking error state.
