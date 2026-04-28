---
name: donggri-gemini-cli-operations
description: Use when Donggri tasks involve Gemini CLI, Gemini Code Assist, MCP workflows, Google provider readiness, quota checks, or safe Gemini-based agent handoffs from Codex.
---

# Donggri Gemini CLI Operations

## Safety rules

- Do not expose Google account tokens, auth files, refresh tokens, or OAuth codes.
- Prefer local readiness checks before running long Gemini jobs.
- Keep generated prompts, policies, and skill metadata in English canonical form.
- Use Korean only for user-facing status if the user is working in Korean.

## Workflow

1. Confirm Gemini CLI availability and version.
2. Check Donggri OAuth/provider readiness when the task depends on Google execution.
3. Select the smallest Gemini operation that satisfies the request.
4. Capture command output summaries, not secrets.
5. Hand results back to Donggri tasks, reports, or Codex edits.

## Commands

```powershell
gemini --version
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/oauth/status" | ConvertTo-Json -Depth 8
```

The OAuth status endpoint is readiness-only. Do not request debug account data unless the user is explicitly troubleshooting authenticated admin settings.

## MCP and agent handoff

- Use MCP only when the project has a configured server or the user explicitly asks for it.
- Prefer read-only analysis before write operations.
- Record model/provider assumptions in task notes when handing work back to Donggri.
