# T311 Build Runtime and Account Pool Widgets

## Goal
Add top-bar widgets for provider status, runtime profiles, and fatigue/account pools.

## Outputs
- `src/office/components/ProviderStatusWidget.tsx`
- `src/office/components/AccountPoolWidget.tsx`
- `src/office/components/RuntimeProfileWidget.tsx`

## Requirements
- Show provider availability, last probe time, account pool fatigue, and runtime profile counts.
- Distinguish provider status from account-pool stamina.

## Acceptance
- Top ops bar communicates system health at a glance.
- Widgets consume existing bootstrap + realtime data.
