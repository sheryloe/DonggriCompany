# Step 4 Constraints — Telegram Bridge

## Immutable Rules
1. Telegram is a **secondary control plane**, not the primary UI.
2. Telegram must never handle provider OAuth or provider credential refresh.
3. Telegram must never execute raw shell commands from user input.
4. Telegram must only expose an **allowlisted command surface**.
5. Long polling is required for v1; webhook support is explicitly deferred.
6. The bridge must remain optional and feature-flagged.
7. The bot may only control chats in the allowlist.
8. All control actions must generate audit log entries.
9. The bridge must call orchestrator services or internal APIs; do not duplicate business logic.
10. Single-user local deployment is assumed.

## Do Not Implement
- `/oauth`
- `/login`
- `/callback`
- `/provider`
- `/exec`
- `/shell`
- `/sql`
- arbitrary freeform agent prompts via Telegram

## Allowed Command Families
- Read status
- Pause/resume session
- Assign a short task to an employee
- Open links back to the local dashboard
- Delivery of event notifications
