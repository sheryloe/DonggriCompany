# PRN 01 — Local Foundation (Codex Execution Version)

## Goal
Build the first working slice of the local orchestration platform:

- single-user local web application
- employee-first architecture
- OAuth handled by provider CLIs
- SQLite as local source of truth
- bootstrap wizard to initialize workspace
- real-time dashboard shell ready for later steps

## In scope
- monorepo scaffold
- API server
- web app shell
- SQLite schema
- migration + seed flow
- bootstrap wizard
- role pack loader
- provider probe endpoints
- basic dashboard layout

## Out of scope
- Telegram integration
- task execution engine
- fatigue router logic
- full pixel office rendering
- provider execution sessions
- cloud deployment

## Deliverables
1. local monorepo
2. DB schema and migration system
3. bootstrap REST API
4. bootstrap wizard UI
5. role pack loader
6. provider probe adapters
7. dashboard shell
