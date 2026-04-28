---
name: donggri-codex-55-agentic-coding
description: Use when Codex needs to execute long-horizon engineering work in Donggri repositories using GPT-5.5/Codex capabilities, including codebase analysis, scoped implementation, validation, git handoff, and concise Korean status updates.
---

# Donggri Codex 5.5 Agentic Coding

## Operating rules

- Treat Donggri repository rules as the source of truth before making changes.
- Keep internal identifiers, file names, metadata, and generated Markdown in English canonical form.
- Render user-facing Korean only in responses or locale dictionaries, not in saved policy keys.
- Avoid printing secrets, OAuth tokens, `.env` contents, database files, or auth storage.
- Prefer PowerShell commands when giving runnable steps.

## Workflow

1. Inspect `git status --short` and avoid overwriting unrelated work.
2. Read the nearest `AGENTS.md` and any targeted source files before editing.
3. Define a narrow implementation boundary and update only files required for the task.
4. Implement with root-cause fixes, not UI-only patches.
5. Validate from narrow tests to broader checks.
6. Summarize changed files, validation results, and remaining risks.

## Validation defaults

Use the smallest reliable command first:

```powershell
corepack pnpm test:web -- <target-test>
corepack pnpm test:api -- <target-test>
corepack pnpm build
```

Run broader checks only when the changed surface justifies the cost.

## Handoff

- State whether files were changed, tests passed, and whether runtime smoke was executed.
- If git was requested, stage and commit only the intended files.
- Do not claim success without command output or code evidence.
