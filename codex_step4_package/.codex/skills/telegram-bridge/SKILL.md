# Skill: telegram-bridge

## Purpose
Implement the Telegram remote control bridge as a secondary control surface for the local orchestrator.

## Priority Order
1. Preserve local-first architecture
2. Keep Telegram optional and safe
3. Prefer orchestrator service reuse
4. Avoid new abstractions unless they reduce risk
5. Build readable operator-facing message formatting

## Never Do
- Add provider OAuth flows
- Add raw command execution
- Add webhook infra in v1
- Add multi-user complexity

## Done Means
- Polling worker starts/stops
- Allowlisted chats can use safe commands
- Notifications send for core events
- Admin UI manages settings and logs
