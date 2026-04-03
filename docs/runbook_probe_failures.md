# Probe Failure Runbook

Date: 2026-04-03
Applies to: Step-2/3 provider probe flows (`/api/provider-probes/run`, `/api/provider-probes/history`)

## 1) Identify Failure Type

- UI `error`: request/transport/backend failure
- UI `no-signal`: no usable result from latest run
- UI `partial`: probe succeeded with degraded parse/data precision
- UI `stale`: latest available probe result is older than freshness window

## 2) Immediate Checks

1. Validate filter inputs in UI (`provider`, `accountPoolId`, `runtimeProfileId`, `limit`).
2. Retry history fetch from the probe panel (`Retry History`).
3. Re-run probe with current selection.
4. Check server logs for `BAD_REQUEST`, `NOT_FOUND`, or provider command execution failures.

## 3) Contract/Integrity Errors

If run request fails with mismatch-style 400 errors:

- Confirm `provider` matches selected account pool provider.
- Confirm `provider` matches selected runtime profile provider.
- If both pool/profile are set, confirm profile belongs to that pool.

Expected behavior: reject fast and no snapshot write on mismatch.

## 4) History Shows Empty

Likely causes:

- filter combination too narrow
- selected runtime profile not associated with selected pool/provider
- history limit too small

Actions:

1. Clear runtime profile filter first.
2. Increase history limit (20 -> 50/100).
3. Re-run probe and refresh history.

## 5) Local Environment Blocker (sqlite binding)

If probe/history tests fail due `better-sqlite3` native module:

```bash
corepack pnpm --filter @workspace/db rebuild better-sqlite3
```

Fallback:

```bash
corepack pnpm install --force
corepack pnpm --filter @workspace/db rebuild better-sqlite3
```

## 6) Exit Criteria

- Probe run succeeds without mismatch errors.
- History query returns expected filtered data.
- UI state badge and messages align with classifier output.
