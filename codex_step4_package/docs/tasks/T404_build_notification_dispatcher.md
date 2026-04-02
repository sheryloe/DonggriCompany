# T404 — Build Notification Dispatcher

## Goal
Send Telegram notifications based on orchestrator events and notification rules.

## Files
- apps/server/src/modules/telegram/TelegramNotificationDispatcher.ts
- apps/server/src/modules/telegram/formatters/*
- apps/server/src/modules/telegram/subscribers/*

## Events
- session.approval_required
- session.failed
- session.completed
- account_pool.fatigue_threshold
- provider.offline

## Acceptance
- Dispatcher respects enabled rules
- Delivery attempts are logged
- Failed deliveries do not crash event pipeline
