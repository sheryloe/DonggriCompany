# API Contract Baseline

This document defines a contributor-facing API baseline for DonggriCompany.
It is intentionally compact and focused on frequently used endpoints.
Current baseline target: `1.0.0-alpha.2` source candidate. This is a local contract snapshot, not a published GitHub Release.

## Base

- Base URL (local): `http://127.0.0.1:8790`
- API prefix: `/api`
- Process liveness: `/livez` (HTTP `200` while the API process is serving)
- Dependency readiness: `/readyz`; compatibility routes `/health`, `/healthz`, and `/api/health` use the same readiness contract and return HTTP `503` when SQLite integrity, Supervisor ownership, or boot reconciliation is unavailable
- Swagger UI: `/api/docs`
- OpenAPI JSON: `/api/openapi.json`

The compact Control Plane projection reads from the absolute `DONGGRI_CONTROL_ROOT` when configured. If the variable is unset and no compatible parent workspace is discoverable, the API remains available and reports a degraded local projection instead of requiring private drive paths.

The reusable `smoke:command-loop` client accepts loopback HTTP only and exercises the documented task create, assignment, run, poll, and result contracts. It requires an explicit disposable `SMOKE_PROJECT_PATH` and does not delete the created task.

## Authentication

- Loopback/local usage usually works without extra headers.
- Remote/non-loopback deployments can require:
  - `Authorization: Bearer <API_AUTH_TOKEN>`
- Inbox webhook endpoint requires:
  - `x-inbox-secret: <INBOX_WEBHOOK_SECRET>`
- Browser session bootstrap (`GET /api/auth/session`) returns `csrf_token`.
  - For cookie-authenticated mutation requests (`POST/PUT/PATCH/DELETE`), send:
    - `x-csrf-token: <csrf_token>`
- Interrupt injection endpoint (`POST /api/tasks/:id/inject`) additionally requires:
  - `session_id`
  - `interrupt_token` (or header `x-task-interrupt-token`)
  - Terminal API (`GET /api/tasks/:id/terminal`) exposes `interrupt.session_id` + `interrupt.control_token`
- Swagger note:
  - `/api/docs` opens with an automatic `/api/auth/session` bootstrap attempt (loopback/local case).
  - If you still get `401 unauthorized`, set `Bearer <API_AUTH_TOKEN>` via Swagger `Authorize`.

## Common Error Shape

Error payloads can vary by route, but API clients should handle:

```json
{
  "error": "error_code",
  "message": "human-readable detail"
}
```

The frontend client wraps non-2xx responses with `ApiRequestError` (`status`, `code`, `details`, `url`).

## Messenger Session Contract (v1.2.3)

Messenger channel settings are stored in `settings.key = "messengerChannels"` and can include:

- `token`: channel token (encrypted at rest with AES-256-GCM using `OAUTH_ENCRYPTION_SECRET`, fallback: `SESSION_SECRET`)
- `sessions[]`:
  - `id`
  - `name`
  - `targetId`
  - `enabled` (default true)
  - `agentId` (optional, binds session to a specific agent for direct chat/task routing)

Supported channel ids (OpenClaw parity):

- `telegram`
- `whatsapp`
- `discord`
- `googlechat`
- `slack`
- `signal`
- `imessage`

Runtime behavior highlights:

- Task report relays are route-pinned to the task's originating messenger target (`[messenger-route]` audit marker in task logs).
- Channel spread is prevented for route-pinned task reports.
- Typing indicators are emitted during direct-chat generation for Telegram/Discord; other channels are no-op.
- Native direct send runtime exists for all OpenClaw-parity channels (`telegram`, `whatsapp`, `discord`, `googlechat`, `slack`, `signal`, `imessage`).
- Per-channel setup requirements differ (e.g., WhatsApp Cloud API token + phone number id, Google Chat webhook URL or `key|token`, Signal RPC base URL, macOS iMessage runtime).
- New project creation path in direct-chat escalation is restricted by `PROJECT_PATH_ALLOWED_ROOTS`.

## Core Endpoint Groups

### Messenger (Built-in Channels)

| Method | Path                               | Purpose                                                          |
| ------ | ---------------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/messenger/sessions`          | List runtime messenger sessions resolved from persisted settings |
| GET    | `/api/messenger/receiver/telegram` | Telegram webhook/poll receiver status                            |
| GET    | `/api/messenger/receiver/discord`  | Discord polling receiver status                                  |
| GET    | `/api/messenger/receiver/gmail`    | Gmail `[DonggriCompany]` intake receiver status                  |
| GET    | `/api/messenger/receiver/calendar` | Google Calendar intake receiver status                           |
| POST   | `/api/messenger/discord/channels`  | Discover accessible Discord text channels by Bot token           |
| POST   | `/api/messenger/send`              | Send message by `sessionKey` or (`channel` + `targetId`)         |

`POST /api/messenger/send` request body:

```json
{
  "sessionKey": "telegram:my-session",
  "text": "hello"
}
```

or

```json
{
  "channel": "discord",
  "targetId": "123456789012345678",
  "text": "hello"
}
```

### Workflow Pack Routing

| Method | Path                       | Purpose                                                        |
| ------ | -------------------------- | -------------------------------------------------------------- |
| GET    | `/api/workflow-packs`      | List workflow packs and effective enable state                 |
| PUT    | `/api/workflow-packs/:key` | Update workflow pack metadata/flags/json fields                |
| POST   | `/api/workflow/route`      | Resolve workflow pack by explicit/session/project/text context |

### Runtime / Org

| Method | Path                             | Purpose                                                         |
| ------ | -------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/departments`               | List departments                                                |
| GET    | `/api/departments/:id`           | Get department detail with member list                          |
| POST   | `/api/departments`               | Create department                                               |
| PATCH  | `/api/departments/:id`           | Update department                                               |
| PATCH  | `/api/departments/reorder`       | Reorder departments                                             |
| GET    | `/api/agents`                    | List agents                                                     |
| GET    | `/api/agents/:id`                | Get agent detail                                                |
| GET    | `/api/meeting-presence`          | Current kickoff/review meeting seat occupancy                   |
| GET    | `/api/agents/active`             | Agents currently marked working with live session metadata      |
| GET    | `/api/agents/cli-processes`      | Detected CLI processes and task correlation                     |
| DELETE | `/api/agents/cli-processes/:pid` | Kill a detected CLI process by pid                              |
| GET    | `/api/cli-status`                | Installed CLI provider detection + authentication readiness     |
| POST   | `/api/agents`                    | Create agent                                                    |
| POST   | `/api/agents/:id/spawn`          | Spawn assigned task execution directly from an agent card       |
| PATCH  | `/api/agents/:id`                | Update agent                                                    |
| DELETE | `/api/agents/:id`                | Delete agent                                                    |
| POST   | `/api/sprites/process`           | Slice/upload sprite sheet preview set and suggest sprite number |
| POST   | `/api/sprites/register`          | Persist processed sprite variants under a sprite number         |
| GET    | `/api/stats`                     | Dashboard/company stats                                         |
| GET    | `/api/settings`                  | Read settings                                                   |
| PUT    | `/api/settings`                  | Save settings                                                   |

### Tasks / Execution

| Method | Path                             | Purpose                                                     |
| ------ | -------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/tasks`                     | List tasks (supports filters)                               |
| GET    | `/api/tasks/:id`                 | Task detail                                                 |
| POST   | `/api/tasks`                     | Create task                                                 |
| PATCH  | `/api/tasks/:id`                 | Update task                                                 |
| DELETE | `/api/tasks/:id`                 | Delete task                                                 |
| POST   | `/api/tasks/bulk-hide`           | Hide or unhide tasks by status group                        |
| POST   | `/api/tasks/:id/assign`          | Assign agent                                                |
| POST   | `/api/tasks/:id/run`             | Start task                                                  |
| POST   | `/api/tasks/:id/stop`            | Cancel or pause task                                        |
| POST   | `/api/tasks/:id/resume`          | Resume paused task                                          |
| POST   | `/api/tasks/:id/inject`          | Queue sanitized interrupt prompt (paused session)           |
| GET    | `/api/tasks/:id/terminal`        | Task terminal logs                                          |
| GET    | `/api/tasks/:id/meeting-minutes` | Meeting minutes                                             |
| GET    | `/api/tasks/:id/diff`            | Git diff/stat for task worktree branch                      |
| POST   | `/api/tasks/:id/merge`           | Manual merge of task worktree into project branch           |
| POST   | `/api/tasks/:id/discard`         | Discard task worktree and abandon branch changes            |
| GET    | `/api/worktrees`                 | Active task worktree registry                               |
| GET    | `/api/subtasks`                  | List subtasks (`active=1` limits to in-flight parent tasks) |
| POST   | `/api/tasks/:id/subtasks`        | Create subtask                                              |
| PATCH  | `/api/subtasks/:id`              | Update subtask                                              |

`GET /api/tasks` supports query filters: `status`, `department_id`, `agent_id`, `project_id`, `workflow_pack_key`.

### Codex / Claude Continuity Checkpoints

The continuity API persists a sanitized handoff/checkpoint chain for one real task and source run. It supports both provider changes and same-provider resume. It does not persist raw prompts, credentials, tokens, or complete transcripts.

| Method | Path                                                    | Purpose                                                                                  |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/continuity/checkpoints/recent`                    | Read recent checkpoint rows                                                              |
| GET    | `/api/continuity/tasks/:taskId/checkpoints`             | Read the ordered checkpoint chain for one task                                           |
| POST   | `/api/continuity/checkpoints`                           | Create a `ready_for_transfer` checkpoint from an actual task/run and connected pools     |
| POST   | `/api/continuity/checkpoints/:checkpointId/validate`    | Recheck workspace identity and target-pool readiness                                     |
| POST   | `/api/continuity/checkpoints/:checkpointId/accept`      | Consume one matching server-side approval receipt and append an `accepted` checkpoint    |
| POST   | `/api/continuity/checkpoints/:checkpointId/resume`      | Revalidate the consumed approval, workspace, and readiness immediately before dispatch   |
| POST   | `/api/continuity/dispatches/:dispatchId/reconcile`      | Reconcile a `dispatch_uncertain` dispatch by its reserved identity without blind respawn |

Every continuity mutation requires a non-empty `idempotency_key` in the JSON body. Browser clients also send the same value as `x-idempotency-key`. Reusing a key with different input fails closed.

`POST .../accept` does not create or infer approval authority. `approval_ref` must identify an unexpired, untampered Control Plane receipt whose operation is exactly `continuity_transfer_accept`. The receipt and persisted preview must match the checkpoint project, checkpoint target, workspace digest (`source_epoch`), exact scope (`checkpoint_id`, `task_id`, `source_run_id`, `target_provider`, `target_account_pool_id`), and command (`continuity accept <checkpoint_id>`). Synthetic values such as `ui:*` are rejected. The endpoint reserves the one-use receipt and idempotency result atomically; a second consumer is rejected.

`POST .../resume` accepts only the checkpoint returned by the successful accept operation. It revalidates that the receipt was consumed into a completed, hash-consistent accept outcome and is still unexpired before attempting dispatch.

Production execution is intentionally unavailable in the current source candidate: no live Supervisor dispatcher or reconciler is registered by default. The default dispatcher reports `continuity_dispatch_adapter_unbound`, and the persisted resume result is `dispatch_uncertain` with blocker `dispatch_failed_or_unknown`; default reconcile remains `unknown`. These endpoints and fake-adapter tests are local contracts, not evidence that Codex or Claude was executed.

Example accept body:

```json
{
  "approval_ref": "approval:server-issued-id",
  "idempotency_key": "continuity-accept-unique-request-id"
}
```

### Reports / Diagnostics

| Method | Path                                                 | Purpose                                                                                     |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/api/task-reports`                                  | Root completed-task report list                                                             |
| GET    | `/api/task-reports/:taskId`                          | Consolidated report detail (logs, subtasks, meeting minutes, documents)                     |
| POST   | `/api/task-reports/:taskId/archive`                  | Regenerate/archive planning consolidated markdown for a task tree                           |
| GET    | `/api/docs`                                          | Swagger UI for the current OpenAPI contract                                                 |
| GET    | `/api/docs/swagger-bootstrap.js`                     | Swagger bootstrap helper that primes `/api/auth/session`                                    |
| GET    | `/api/cli-usage`                                     | Cached CLI quota/usage windows by provider                                                  |
| POST   | `/api/cli-usage/refresh`                             | Refresh CLI quota/usage cache and broadcast update                                          |
| GET    | `/api/control-plane/state`                           | Live read-only DevDrive Control Plane state                                                 |
| GET    | `/api/control-plane/dashboard`                       | Compact source-bound Command Center summary without raw config or mutation capability       |
| GET    | `/api/control-plane/memory/status`                   | AgentMemory runtime/config status and memory document health                                |
| GET    | `/api/control-plane/memory/search`                   | Read-only AgentMemory search probe by query; raw payload is omitted                         |
| GET    | `/api/control-plane/v1/state`                        | Donggri Root Control SDD Ver.1 read-only projection                                         |
| GET    | `/api/control-plane/v1/steering`                     | Ver.1 steering document status                                                              |
| GET    | `/api/control-plane/v1/specs/active`                 | Ver.1 active spec status                                                                    |
| GET    | `/api/control-plane/v1/hooks/status`                 | Ver.1 control hook policy status                                                            |
| POST   | `/api/control-plane/v1/hooks/evaluate`               | Ver.1 hook policy evaluation without command execution                                      |
| GET    | `/api/control-plane/v1/orchestrator/state`           | Ver.1 orchestrator and persona subagent status                                              |
| GET    | `/api/control-plane/v1/agents/departments`           | Six Ver.1 department agent projection                                                       |
| GET    | `/api/control-plane/v1/context-pack`                 | Ver.1 context-pack status                                                                   |
| GET    | `/api/control-plane/v1/quality/score`                | Ver.1 quality score and hard gate status                                                    |
| GET    | `/api/control-plane/v1/gemini-review/latest`         | Latest Gemini third-party review status                                                     |
| GET    | `/api/control-plane/v1/codex/assets`                 | Sanitized Codex app assets: skills, MCP, plugins, automations, root agents, trusted aliases |
| GET    | `/api/control-plane/v1/sync/status`                  | Control Plane DB snapshot/link table status without creating tables                         |
| POST   | `/api/control-plane/v1/sync/preview`                 | Preview registry/project/spec-task links without DB writes                                  |
| POST   | `/api/control-plane/v1/sync/apply`                   | Approved idempotent write to `control_plane_*` snapshot/link tables only                    |
| GET    | `/api/control-plane/v1/runs/status`                  | Dedicated Control Plane runner table/run/persona status                                     |
| POST   | `/api/control-plane/v1/runs/prepare`                 | Prepare a department-agent run with context-pack, routing decision, and hook preview        |
| POST   | `/api/control-plane/v1/runs/:runId/start`            | Mark a prepared Control Plane run as running after gates are checked                        |
| GET    | `/api/control-plane/v1/runs/:runId`                  | Read a Control Plane run with routing, persona, and event timeline                          |
| POST   | `/api/control-plane/v1/runs/:runId/personas`         | Create a disposable persona run under the parent department agent                           |
| POST   | `/api/control-plane/v1/personas/:personaId/decision` | Record accept/reject/recreate/merge decision for a returned persona                         |

### Messaging / Inbox / Decision

| Method | Path                               | Purpose                    |
| ------ | ---------------------------------- | -------------------------- |
| GET    | `/api/messages`                    | Message history            |
| POST   | `/api/messages`                    | Send message               |
| POST   | `/api/announcements`               | Broadcast announcement     |
| POST   | `/api/directives`                  | Send directive             |
| DELETE | `/api/messages`                    | Clear messages             |
| POST   | `/api/inbox`                       | External webhook ingestion |
| GET    | `/api/gmail-intake/items`          | Gmail intake item list     |
| POST   | `/api/gmail-intake/:id/approve`    | Approve Gmail intake       |
| POST   | `/api/gmail-intake/:id/reject`     | Reject Gmail intake        |
| GET    | `/api/calendar-intake/items`       | Calendar intake item list  |
| POST   | `/api/calendar-intake/:id/approve` | Approve Calendar intake    |
| POST   | `/api/calendar-intake/:id/reject`  | Reject Calendar intake     |
| GET    | `/api/decision-inbox`              | Decision inbox items       |
| POST   | `/api/decision-inbox/:id/reply`    | Decision reply             |

### Skills / Providers / OAuth

| Method | Path                            | Purpose                                                   |
| ------ | ------------------------------- | --------------------------------------------------------- |
| GET    | `/api/skills`                   | Skill catalog                                             |
| GET    | `/api/skills/available`         | Learned skill inventory available for reuse               |
| GET    | `/api/skills/detail`            | Skill detail                                              |
| POST   | `/api/skills/learn`             | Start learn job                                           |
| GET    | `/api/skills/learn/:jobId`      | Learn job status                                          |
| GET    | `/api/skills/history`           | Learn history                                             |
| POST   | `/api/skills/unlearn`           | Unlearn skill                                             |
| POST   | `/api/skills/custom`            | Upload custom skill                                       |
| GET    | `/api/skills/custom`            | List custom skills                                        |
| DELETE | `/api/skills/custom/:skillName` | Delete custom skill                                       |
| GET    | `/api/api-providers`            | List API providers                                        |
| POST   | `/api/api-providers`            | Create API provider                                       |
| PUT    | `/api/api-providers/:id`        | Update API provider                                       |
| DELETE | `/api/api-providers/:id`        | Delete API provider                                       |
| POST   | `/api/api-providers/:id/test`   | Probe upstream provider and refresh model cache           |
| GET    | `/api/api-providers/:id/models` | Read cached or refreshed provider model list              |
| GET    | `/api/api-providers/presets`    | Built-in provider preset base URLs/auth conventions       |
| GET    | `/api/oauth/status`             | OAuth status                                              |
| POST   | `/api/oauth/disconnect`         | OAuth disconnect                                          |
| POST   | `/api/oauth/refresh`            | OAuth token refresh                                       |
| POST   | `/api/oauth/accounts/activate`  | Activate, add, remove, or toggle a stored OAuth account   |
| PUT    | `/api/oauth/accounts/:id`       | Update OAuth account metadata and model override          |
| GET    | `/api/oauth/models`             | OAuth-backed model catalog (Copilot/OpenCode/Antigravity) |
| GET    | `/api/cli-models`               | Local CLI model catalog (Claude/Codex/Gemini/OpenCode)    |

### Project / GitHub / Update

| Method | Path                                      | Purpose                                                          |
| ------ | ----------------------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/projects`                           | List projects                                                    |
| POST   | `/api/projects`                           | Create project                                                   |
| GET    | `/api/projects/:id`                       | Project detail with assigned agents/tasks/reports/review events  |
| PATCH  | `/api/projects/:id`                       | Update project                                                   |
| DELETE | `/api/projects/:id`                       | Delete project                                                   |
| GET    | `/api/projects/path-check`                | Validate project path                                            |
| GET    | `/api/projects/path-suggestions`          | Suggested paths                                                  |
| GET    | `/api/projects/path-browse`               | Browse allowed project roots/subdirectories for manual selection |
| POST   | `/api/projects/path-native-picker`        | Native path picker                                               |
| GET    | `/api/projects/:id/branches`              | Local git branches for a project path                            |
| GET    | `/api/github/status`                      | GitHub integration status                                        |
| GET    | `/api/github/repos`                       | Repositories                                                     |
| GET    | `/api/github/repos/:owner/:repo/branches` | Remote GitHub branch list                                        |
| POST   | `/api/github/clone`                       | Clone repository                                                 |
| GET    | `/api/github/clone/:cloneId`              | Clone progress/status polling                                    |
| GET    | `/api/update-status`                      | Update status                                                    |
| GET    | `/api/update-auto-status`                 | Auto-update daemon status and lock state                         |
| POST   | `/api/update-auto-config`                 | Toggle auto update                                               |
| POST   | `/api/update-apply`                       | Trigger update apply flow immediately                            |

## Coverage Notes

- `docs/openapi.json` now includes the main contributor-facing detail/picker/report endpoints that were missing from the previous baseline.
- CI E2E should treat the following as regression-sensitive:
  - `/api/docs`, `/api/docs/swagger-bootstrap.js`, `/api/openapi.json`
  - `/api/projects/:id`, `/api/projects/:id/branches`, `/api/projects/path-browse`
  - `/api/tasks/bulk-hide`, `/api/tasks/:id/diff`, `/api/worktrees`
  - `/api/meeting-presence`, `/api/agents/active`, `/api/agents/cli-processes`
  - `/api/cli-usage`, `/api/api-providers/presets`, `/api/task-reports*`

## Known Follow-up

- Promote this baseline to OpenAPI (`/api/*.yaml`) in incremental slices:
  1. auth/session + settings
  2. tasks/subtasks
  3. inbox/directives
  4. project/github/update routes
