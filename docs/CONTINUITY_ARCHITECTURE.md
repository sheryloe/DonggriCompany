# Provider Continuity Architecture

Dongri-grigri keeps the repository and Control Plane authoritative. A checkpoint is a compact, append-only SQLite record; it is not a copied chat session.

```text
source run -> checkpoint -> workspace validation -> provider readiness
           -> approval receipt validation -> target dispatch -> run ledger
           -> sequenced real-event projection
```

## Integrity boundary

- The server canonicalizes the project and Git root.
- Branch, HEAD, every tracked/untracked changed path, and each changed file digest form the workspace digest.
- An unchanged dirty workspace may continue. Path, Git identity, or content drift fails closed.
- Stored JSON is checked against its SHA-256 and duplicated identity columns when read.
- SQLite triggers reject checkpoint update and deletion.
- `continuity_runs` reserves one row per dispatch ID and records provider/account, native session, PID, heartbeat, parent run, and terminal state.
- `continuity_run_events` is append-only, gap-free per run, digest-checked, redacted, and resumable from an event cursor.

## Transfer boundary

The target provider never silently replaces the selected provider. Missing installation, authentication, observed exhaustion, workspace drift, duplicate acceptance, and uncertain dispatch produce explicit non-success states. Source run, target run, dispatch, and provider-native session identifiers are separate fields and are never inferred from a task ID.

The API exposes create, validate, accept, resume, recent snapshot, and task-history operations under `/api/continuity`. Every new checkpoint carries a monotonic task sequence and is broadcast as `continuity_event`.

`accept` verifies a signed Control Plane receipt against the stored preview, its digests, expiry, operation, project, checkpoint, scope, command, and consumption state. Synthetic `ui:` approvals are rejected. This is a local validation contract only: receipt issuance for this operation and atomic one-use consumption are not wired, so the default dispatcher remains unbound and fails closed.

The office transit map and character movement are projections of real checkpoint/run states. They must not animate an invented `running` or `completed` state. When the production Supervisor is unavailable, the UI must show the blocked state and next safe action rather than simulate work.

## Privacy boundary

Checkpoints contain objectives, acceptance criteria, bounded work state, verification summaries, evidence references, account display labels, and Git identity. They reject unknown fields and credential-like values. OAuth tokens, API keys, raw transcripts, full patches, and terminal logs are not checkpoint payloads.

Run events apply a second redaction and truncation boundary before persistence. Raw prompts, stdin, transcripts, credentials, cookies, and secret-like values are redacted or excluded. Provider stdout must be normalized into bounded events before it can reach the ledger or UI.
