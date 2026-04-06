# Codex Step 4 Execution Package — Telegram Remote Control Bridge

This package implements **Step 4** of the local AI office system.

Scope:
- Add a **Telegram bot bridge** for remote control and notifications.
- Keep the system **local-server-first**.
- Do **not** move orchestration to Telegram.
- Do **not** implement provider OAuth endpoints.
- Prefer **Telegram long polling** in v1.
- Treat Telegram as a **secondary control surface** over the local orchestrator.

Included:
- PRN
- Implementation plan
- Constraints
- Contracts (schema, OpenAPI, seed)
- Task cards (T401–T406)
- Codex skill instructions

Recommended execution order:
1. Read `docs/prn/PRN_04_telegram_bridge_codex.md`
2. Read `docs/implementation/IMPLEMENT_STEP4.md`
3. Enforce `docs/rules/constraints.md`
4. Execute task files in order
