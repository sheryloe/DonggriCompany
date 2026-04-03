# Known Risks and Assumptions

Date: 2026-04-03

## Risks

1. Native binding dependency
   - `@workspace/db` tests rely on `better-sqlite3` native module.
   - Local environments can fail without rebuild after install drift.
2. Probe signal quality variance
   - Provider CLI output can change shape/version.
   - Probe may return `partial` or `no-signal` even with process exit success.
3. Stale interpretation is time-window based
   - UI stale classification depends on timestamp freshness window (24h).
   - Unexpected local clock skew can affect stale/no-signal interpretation.
4. UI tests focus on critical widgets/hooks
   - Full browser E2E is not part of this patch.
   - Manual release checks are still required for final UX verification.

## Assumptions

- Step-4 keeps backend contract changes minimal; no large domain expansion.
- Office entry remains `/dashboard`.
- Probe UI state uses single classifier: `classifyProbeUiState(...)`.
- Stale window remains 24 hours (aligned with Step-2 behavior).
