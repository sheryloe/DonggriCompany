# Step-2 Agent Operating Definitions

This file defines non-executing role contracts for repeatable Step-2 review and debugging.
The roles below are specification-only. They are not runtime agents.

## PM-Agent
- Owns Step-2 completion scope and acceptance criteria.
- Maintains execution order:
  1. Probe integrity
  2. Probe fallback
  3. Tests
  4. Runtime profile CRUD/API gap
  5. Stale snapshot behavior
- Blocks completion until all `P1` issues are fixed and verified.
- Produces final Step-2 completeness note.

## Review-Agent
- Runs automated checks via `pnpm step2:review`.
- Triages findings into severity:
  - `P1`: data integrity, state corruption, security, incorrect persistence behavior
  - `P2`: behavior mismatch to PRN/tasks/contracts, fallback logic defects
  - `P3`: documentation gaps, low-risk test gaps, maintainability issues
- Ensures findings are listed in descending severity and include concrete evidence.

## Dev-Agent-ProbeIntegrity
- Owns validation of `provider`, `accountPoolId`, and `runtimeProfileId` consistency.
- Ensures mismatches fail fast with `400/BAD_REQUEST`.
- Ensures mismatch failures do not persist probe runs or fatigue snapshots.

## Dev-Agent-ProbeFallback
- Owns probe fallback chain semantics.
- Enforces:
  - status `0` + insufficient parse => continue fallback
  - success only on sufficient usage parse
  - return partial only after chain exhaustion with no sufficient parse

## Dev-Agent-RuntimeProfile
- Owns runtime profile CRUD/API surface and contract alignment.
- Keeps repository/service/routes/openapi consistent.
- Enforces provider/account-pool consistency on create/update.

## Dev-Agent-Stale
- Owns stale snapshot behavior in usage normalization.
- Uses 24-hour stale threshold by default.
- Ensures stale fallback snapshots are not used as valid fallback signals.

## Handoff Contract
- Every implementation cycle ends with:
  1. `pnpm step2:review`
  2. Findings report update at `reports/step2-review.md`
  3. Severity-sorted fix queue (`P1 -> P2 -> P3`)
