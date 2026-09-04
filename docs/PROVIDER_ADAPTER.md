# Provider Adapter Guide

A provider adapter has two responsibilities:

1. Report an observed readiness state: `ready`, `auth_required`, `install_required`, `degraded`, or `observed_exhausted`.
2. Dispatch exactly the provider/account named by an accepted checkpoint and return a concrete target run ID.

Adapters must not estimate subscription quota, read tokens into checkpoint data, fall back to a different provider, or report success when process creation is uncertain.

The repository currently contains pure, side-effect-free command builders and parsers for the installed Codex and Claude CLI contracts. Their option shapes were checked against local `--help` output, but this did **not** execute either provider. Codex resume arguments keep the prompt on stdin; Claude uses stream JSON on stdout and stdin for the prompt. Session identifiers reject flag-like values, and provider-specific effort values are validated before command construction.

The current production route intentionally uses a fail-closed dispatcher until an exact Codex or Claude Runner Supervisor binding is approved. `/api/office/cli/run` also returns `503 runner_supervisor_unbound` before storing a prompt, queue item, run, or fake success result. The portable demo injects an in-process mock dispatcher and uses no credentials.

The existing legacy CLI runtime no longer writes a plaintext prompt file for streaming Codex or Claude execution. A bounded, mode-`0600` temporary prompt file remains only for the legacy asynchronous Jules bridge. The legacy Windows spawn path still uses `shell: true`; it is not the approved implementation model for the future Supervisor, which must resolve a fixed executable and use `shell: false`.

Provider contributions should include readiness fixtures, dispatch and process-loss fixtures, exact account-binding evidence, redaction tests, and Windows path/process coverage.

## Deliberately unbound production gates

- No Control Plane V2 operation registry entry or issuance UI exists yet for `continuity_transfer_accept`.
- Approval reservation/consumption is not yet atomic, so a receipt cannot authorize production dispatch.
- Source-run ownership and pause acknowledgement are not yet enforced.
- The persistent run ledger exists, but it is not bound to a live provider process.
- A checkpoint left in `resuming` after process loss still needs boot-time reconciliation.

Until all five gates are closed and independently verified, production provider execution remains **HOLD**.
