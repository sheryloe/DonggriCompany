# T105 — Admin UI for Account Pools, Fatigue, and Router

## Goal
Build Step 2 admin UI pages.

## Pages
- `/admin/account-pools`
- `/admin/fatigue`
- `/admin/runtime-router`

## Required widgets
### Account pools page
- table of pools
- latest fatigue badge
- provider label
- enable/disable toggle
- manual probe button

### Fatigue page
- history chart/list by pool
- confidence badge
- raw vs normalized summary

### Runtime router page
- task simulation form
- selected runtime result card
- reason text and fallback chain display

## Acceptance criteria
- UI works without office-scene assets
- all actions show structured server errors
- simulation form can test at least task_type + role_key inputs

## Verify
- manual browser QA
- component tests where available
