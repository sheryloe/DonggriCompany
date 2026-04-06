# T403 — Build Command Router and Safe Handlers

## Goal
Implement parser and safe command handlers.

## Commands
- /start
- /help
- /status
- /sessions
- /employees
- /timeline
- /pause <session-id>
- /resume <session-id>
- /assign <employee-slug> <task summary>
- /open office
- /open session <session-id>

## Rules
- Unknown commands return help
- Only allowlisted chats may control the system
- All commands must log audit entries
- Pause/resume/assign must call orchestrator service methods

## Acceptance
- Command parser extracts name/args reliably
- Read-only commands format human-readable summaries
- Control commands call orchestrator services and return status
