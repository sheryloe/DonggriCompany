---
name: donggri-codex-oauth-operations
description: Use when auditing, reconnecting, or troubleshooting Donggri OAuth execution accounts for Codex, GitHub Copilot, Google Antigravity, Gemini, and provider readiness without exposing tokens.
---

# Donggri Codex OAuth Operations

## Safety rules

- Never print raw tokens, OAuth codes, cookies, local auth files, or `.env` values.
- Report only provider name, connection state, account label, and actionable next step.
- Treat `connectable`, `reauth_required`, and `execution_ready` as canonical status keys.
- Keep account pool and execution pool language distinct.

## Inspection workflow

1. Query Donggri OAuth readiness through the local API or existing UI state.
2. Classify each provider into `connectable`, `reauth_required`, or `execution_ready`.
3. Identify blocked skills or providers from required OAuth metadata.
4. Recommend the minimal reconnect action.
5. Re-check status after reconnect before declaring execution readiness.

## Local commands

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/oauth/status" | ConvertTo-Json -Depth 8
```

Use session bootstrap first if the endpoint requires authentication. The public status endpoint is readiness-only.
Use `/api/oauth/status/debug` only in authenticated admin/settings flows, and never print raw tokens or secrets.

## Output format

- Provider
- Status key
- Account label only when using authenticated debug/admin data
- Blocked capability
- Next action
