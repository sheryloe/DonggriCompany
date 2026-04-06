# T406 — Integrate Lifecycle and Acceptance Pass

## Goal
Wire Telegram bridge into server boot lifecycle behind feature flag.

## Files
- apps/server/src/bootstrap/*
- apps/server/src/config/*
- apps/server/src/modules/telegram/index.ts

## Acceptance
- Server boots when feature disabled
- Server boots when feature enabled but token missing
- Polling starts only when config valid
- Commands and notifications are end-to-end testable
- README runbook updated
