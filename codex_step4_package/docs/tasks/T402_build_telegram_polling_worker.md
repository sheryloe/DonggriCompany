# T402 — Build Telegram Polling Worker

## Goal
Implement long-polling worker against Telegram Bot API.

## Files
- apps/server/src/modules/telegram/TelegramPollingWorker.ts
- apps/server/src/modules/telegram/TelegramHttpClient.ts
- apps/server/src/modules/telegram/TelegramWorkerSupervisor.ts

## Behavior
- Poll using saved update offset
- Ignore non-message updates safely
- Route allowlisted chat commands to command router
- Persist update offset after successful handling
- Keep retry loop with backoff

## Acceptance
- Worker can start/stop cleanly
- Offset persists across restarts
- Invalid token does not crash app
