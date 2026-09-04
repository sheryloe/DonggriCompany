# Docker Desktop read-only diagnosis and recovery boundary

Dongri-grigri does not repair, restart, or clean Docker Desktop automatically. The diagnostic added for V1 only projects current host evidence into a machine-readable state. It does not start or stop Docker Desktop, change settings, touch services, restart containers, or delete the `dockerInference` path.

## Run the diagnostic

From a Windows checkout:

```bat
scripts\diagnose-docker-desktop.bat
```

Or through the package script:

```bat
corepack pnpm run ops:docker-desktop:status
```

Fixture-only verification is safe on any platform:

```bat
corepack pnpm run ops:docker-desktop:self-test
```

The command writes one JSON object to stdout. Human wrapper status is written to stderr so callers can parse stdout. Exit code `0` means `healthy`, `2` means an observed risk or unreachable engine, `3` means the live probe ran on a non-Windows platform, and `1` means the diagnostic itself failed.

## State contract

| State                           | Meaning                                                                                       | Next safe action                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `healthy`                       | The engine answered and no recent crash/socket risk was found in the bounded checks.          | Preserve the report as point-in-time evidence.                                                   |
| `engine_unreachable`            | The read-only `docker version` server query did not succeed.                                  | Verify Desktop/process state. Starting or restarting it requires separate approval.              |
| `recent_backend_crash`          | A recent bounded backend-log tail contains a crash or inference failure signature.            | Preserve the log and reconcile the event under the Docker recovery SDD.                          |
| `inference_socket_restart_risk` | The fixed `dockerInference` entry is listed but the read-only reparse query cannot access it. | Do not delete the entry or restart blindly. Freeze evidence and request exact recovery approval. |
| `diagnostic_error`              | A required read-only check could not be completed.                                            | Preserve the error code and verify path/tool availability without mutating Docker state.         |

The report always includes `read_only: true`, an empty `mutations_performed` array, fixed path boundaries derived from `%LOCALAPPDATA%`, individual check results, and an approval-aware recommendation.

## What the probe reads

- Docker Desktop and backend process presence through `tasklist`.
- Engine reachability through `docker version --format ...`; it does not run or restart a container.
- `%LOCALAPPDATA%\Docker\run\dockerInference` through a directory listing and `fsutil reparsepoint query`.
- At most the final 512 KiB of `%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log`.

Both Docker paths are resolved under the fixed `%LOCALAPPDATA%\Docker` boundary before access. The tool accepts only `--self-test` and a bounded `--recent-minutes 1..1440` option.

The BAT supervisor deliberately accepts only no argument or `--self-test`, so it never interpolates arbitrary arguments into CMD. To adjust the recent-event window, invoke the Node helper directly, for example `node scripts/diagnose-docker-desktop.mjs --recent-minutes 60`.

## Recovery is a separate operation

An unhealthy diagnostic result is not repair authorization. Before any restart, service action, settings change, socket/reparse operation, or container command:

1. Record the diagnostic JSON, relevant log timestamps, current container/engine evidence, and exact proposed paths.
2. Use `G:\Donggri_DevDrive\storage\codex-control\specs\20260814-docker-desktop-single-canonical-runtime-recovery-v1` as the recovery authority and reconcile its current handoff.
3. Obtain separate approval for the exact lifecycle or filesystem action. A general application-development approval is insufficient.
4. Preserve rollback/recovery evidence and fail closed if a writer respawns or the live state differs from the frozen contract.
5. After an approved recovery, verify semantic engine identity, expected containers, health checks, volumes, and the absence of a new crash signature before declaring `terminal-verified`.

Never use this diagnostic result as permission for `docker restart`, Docker Desktop restart, socket deletion, volume deletion, or `docker system prune`.

## Control Plane command gate

The `pre-docker` Control Plane hook parses the proposed command before execution:

- Read-only Docker and Compose inspection commands return `ALLOW`.
- Container, Compose, Docker Desktop, service, WSL, socket, or filesystem lifecycle commands return `APPROVAL-REQUIRED` with `APR-DOCKER-001`.
- Unknown commands, pipes, redirects, command substitution, and unsupported compound commands return `BLOCK`.

This parser is a policy gate, not a shell. It never executes the proposed command. The local Runner compose override also disables Docker control and does not mount `/var/run/docker.sock`.
