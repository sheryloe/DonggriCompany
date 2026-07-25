# DonggriCompany Release and Rollback Runbook

This runbook defines a reversible single-host release. It is a procedure, not
authorization to deploy. Deploy, Docker mutation, Git history changes, database
writes, and secret changes remain separately approval-gated.

## Prepare

1. Record release ID, immutable source revision, previous verified revision,
   operator, approver, start time, and trace ID in the release evidence record.
2. Run `corepack pnpm install --frozen-lockfile` in a clean checkout.
3. Run `corepack pnpm run master95:delivery`, formatting, lint, contracts,
   type-check, build, and all tests.
4. Back up the runtime DB and configuration to the canonical E: backup store.
   Record file hashes without recording secret values.
5. Verify the previous revision can still be built and its artifact is retained.

## Deploy

1. Obtain the separate deploy approval and record the approval ID.
2. Stop accepting new work and wait for active runs to checkpoint or terminate.
3. Install the immutable candidate artifact without changing runtime secrets.
4. Start the service and retain the previous artifact until the observation
   window closes.

## Verify

1. Verify `/api/health`, authenticated API access, UI load, Task read/query, and
   one read-only BloggerGent routing preview.
2. Confirm no schema migration ran unless the release evidence explicitly names
   a separately approved migration and its down/restore procedure.
3. Observe error rate, latency, memory, and logs for the declared window.
4. Mark the release verified only when every check has an artifact and trace ID.

## Roll Back

Trigger rollback on failed health, authorization regression, state corruption,
unbounded error growth, or missed verification deadline.

1. Stop new work and record the rollback trigger and timestamp.
2. Stop the candidate service.
3. Restore the previous immutable artifact and, only with explicit DB approval,
   restore the compatible DB backup when required.
4. Start the previous revision and repeat all Verify checks.
5. Preserve candidate logs and traces; do not delete failed-release evidence.

## Rehearsal Evidence Gate

Step 5 is not complete until a clean PC/VM rehearsal and one induced failed
release rollback both pass. Record results in the Control Plane evidence pack;
`master95:delivery:certify` must remain blocked until that record is `pass`.
