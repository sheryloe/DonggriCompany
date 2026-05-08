# Toss In-App Viral Map Validation

## Summary

- Date: 2026-05-08 KST
- Donggri project id: `88c06b5f-f678-46b1-9e17-0fcc72594898`
- Runtime project path: `G:\Donggri_DevDrive\repos\runtime\DonggriCompany\toss-inapp-viral-map-20260508-110049`
- Runtime git commit: `3296290 Create Toss in-app viral map validation MVP`
- Codex account policy: `codex-main` first. `codex-main-2` to `codex-main-4` remain fallback candidates after auth artifact connection.

## Implementation

- Created a non-clone viral map style WebView MVP named `LocalPin Mission Map`.
- Added Apps in Toss mock config through `granite.config.ts`.
- Implemented mobile-first React/Vite UI for mission map, category filtering, mission save, and completion state.
- Added planning, checklist, risk, operations, and quality documents in the runtime project.
- Registered six department tasks against the Donggri project and marked them complete with evidence-linked results.
- Set Donggri starter Codex agents to use `cli_account_pool_id="codex-main"` by default.

## Validation

- `corepack pnpm test`: passed, 1 runtime test.
- `corepack pnpm build`: passed in the runtime project.
- `corepack pnpm screenshots`: passed and generated mobile/desktop captures.
- Donggri office workflow pack test was extended to assert Codex starter agents default to `codex-main`.

## Screenshots

- `G:\Donggri_DevDrive\repos\runtime\DonggriCompany\toss-inapp-viral-map-20260508-110049\artifacts\screenshots\mobile-home-390.png`
- `G:\Donggri_DevDrive\repos\runtime\DonggriCompany\toss-inapp-viral-map-20260508-110049\artifacts\screenshots\mobile-detail-390.png`
- `G:\Donggri_DevDrive\repos\runtime\DonggriCompany\toss-inapp-viral-map-20260508-110049\artifacts\screenshots\mobile-complete-390.png`
- `G:\Donggri_DevDrive\repos\runtime\DonggriCompany\toss-inapp-viral-map-20260508-110049\artifacts\screenshots\desktop-workbench-1440.png`

## Notes

- The first project creation attempt against port `8900` normalized a Windows path as a container path; that row was deleted immediately. The final project was created through the local Windows API on port `8790`.
- `@apps-in-toss/web-framework` currently brings React Native peer warnings in this mock WebView project. They do not block test/build, but real console submission should start from the official template or align peer versions.
- Real Toss login, real payment, real location, mTLS certificate setup, and Toss console submission are intentionally out of scope for this internal workflow validation.
