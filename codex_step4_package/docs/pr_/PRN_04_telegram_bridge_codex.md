# PRN 04 — Telegram Remote Control Bridge (Codex)

## Goal
Add a Telegram bridge that lets the user:
- inspect office status remotely,
- receive notifications,
- issue a small set of safe commands,
- open deep links back into the local web UI.

Telegram is **not** the primary product surface. The primary surface remains the local web dashboard.

## Product Position
The system has three layers:
1. Local web dashboard (primary)
2. Local orchestrator API/services (core)
3. Telegram bot bridge (secondary remote control surface)

## User Story
As a solo operator, I want to:
- check active sessions from my phone,
- pause/resume a session,
- assign a task to a named employee,
- receive alerts when approval is required or a session fails,
without exposing provider credentials or moving orchestration into Telegram.

## Key Constraints
- Local-server deployment only.
- No provider OAuth flows in Telegram.
- No public webhook required in v1.
- Use **long polling** (`getUpdates`) first.
- Telegram bot only talks to the local orchestrator's internal APIs/services.
- Commands must be allowlisted and auditable.
- The bot must be single-user or explicitly allowlisted by chat ID.

## Feature Scope
### In scope
- Bot registration and chat allowlist
- Polling worker
- Command parsing
- Read-only status commands
- Small set of control commands
- Notification rules
- Deep links to the local UI

### Out of scope
- Telegram Mini App UI
- Telegram webhook server
- Multi-tenant bot support
- Free-form shell command execution
- Provider login through Telegram
- OAuth callback handling
- Arbitrary prompt passthrough to providers

## Primary Commands
- `/start`
- `/help`
- `/status`
- `/sessions`
- `/employees`
- `/timeline`
- `/pause <session-id>`
- `/resume <session-id>`
- `/assign <employee-slug> <task summary>`
- `/open office`
- `/open session <session-id>`

## Notifications
V1 notifications:
- approval required
- session failed
- session completed
- account pool fatigue threshold crossed
- provider offline

## Security Model
Telegram bot token is stored locally in app config.
Only allowlisted chat IDs may issue commands.
All commands are translated into orchestrator service calls.
All command invocations create audit log entries.

## Deliverables
- Telegram bridge service
- Command router
- Allowlist management
- Notification dispatcher
- Audit logging
- Admin UI page for Telegram settings
