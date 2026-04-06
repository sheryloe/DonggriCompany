# IMPLEMENT STEP 4 — Telegram Remote Control Bridge

## Objective
Implement a local-first Telegram integration that:
- polls updates,
- authenticates chat IDs via allowlist,
- dispatches safe orchestrator actions,
- sends notifications back to the operator.

## Milestones

### Milestone 1 — Data model
Add:
- telegram_bot_settings
- telegram_allowed_chats
- telegram_command_logs
- telegram_notification_rules
- telegram_delivery_logs

### Milestone 2 — Service layer
Implement:
- TelegramConfigService
- TelegramPollingWorker
- TelegramCommandRouter
- TelegramNotificationDispatcher
- TelegramAuditService

### Milestone 3 — HTTP API
Expose internal UI/admin APIs:
- GET/PUT telegram settings
- GET/POST allowlisted chats
- GET command logs
- GET/PUT notification rules
- POST test notification

### Milestone 4 — Command handling
Implement handlers for:
- help/status/sessions/employees/timeline/open
- pause/resume
- assign

### Milestone 5 — Admin UI
Create admin settings page:
- bot token presence
- polling state
- allowed chat list
- notification rules
- recent command logs
- send test notification action

## Execution Rules
- Build with feature flag `telegramBridgeEnabled`.
- Bridge must fail closed if token missing or invalid.
- Never block core orchestrator startup because Telegram is offline.
- Long polling worker must be restartable.
- All command side effects must go through orchestrator services, not direct DB writes.

## Acceptance
- Operator can authorize one chat and use safe commands.
- Notifications are delivered for core events.
- All command invocations are logged.
- Turning off the feature stops polling cleanly.
