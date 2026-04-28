---
name: donggri-codex-pr-review-release
description: Use when Donggri work requires Git branch review, staged-file inspection, CI triage, pull request preparation, release notes, or safe commit and push handoff through Codex.
---

# Donggri Codex PR Review and Release

## Preconditions

- Confirm the user explicitly requested commit, push, or release actions.
- Inspect `git status --short` before staging.
- Exclude `.env`, auth storage, database files, backups, and generated caches.
- Keep unrelated changes out of the commit.

## Review workflow

1. Identify changed files and classify them as intended or unrelated.
2. Run targeted tests for the changed surface.
3. Inspect build or typecheck output when UI or API contracts changed.
4. Stage only intended files.
5. Commit with a concise imperative message.
6. Push only when explicitly requested.

## PowerShell commands

```powershell
git status --short
git diff --stat
corepack pnpm test
corepack pnpm build
git add -- <intended-files>
git commit -m "type: concise summary"
git push
```

## Handoff

Include commit hash, pushed branch, validation commands, and any excluded dirty files.
