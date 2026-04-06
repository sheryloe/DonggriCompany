# T401 — Add Step 4 Schema and Repositories

## Goal
Add Telegram bridge tables and repository/service scaffolding.

## Files
- apps/server/src/db/schema/*
- apps/server/src/modules/telegram/repositories/*
- apps/server/src/modules/telegram/types.ts

## Deliverables
- Schema migration for Step 4 tables
- Repository interfaces and implementations
- Types for settings, chats, command logs, notification rules, delivery logs

## Acceptance
- Migrations run cleanly
- Repositories expose CRUD needed by Step 4 services
