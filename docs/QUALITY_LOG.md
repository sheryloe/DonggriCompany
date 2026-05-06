# QUALITY_LOG.md

ISO 9001-style work records for traceability, verification, and risk follow-up.

## Record Format

```md
## YYYY-MM-DD HH:mm KST - Work Summary

- Request:
- Change:
- Changed files:
- Commands:
- Validation:
- Risk:
- Follow-up:
```

## 2026-05-06 15:03 +09:00ST - Dev Drive Documentation Baseline

- Request: Apply standard Donggri Dev Drive operating rules and project documents.
- Change: Created or updated project instructions, persona, README baseline, ignore rules, quality log, requirements, decisions, risk register, Git workflow, and operations documents.
- Changed files: Standard root documents and `docs/` operating documents.
- Commands: Read-only inventory, backup copy, document write, Git diff/status validation. No install/build/test/Docker execution.
- Validation: Confirm required files exist and check Git diffs after application.
- Risk: Legacy D path residue, generated/cache folders, sensitive file exposure, and existing project-specific rules.
- Follow-up: Keep this log updated after future code, config, Docker, Git, or documentation changes.

## 2026-05-06 15:20 KST - Runtime Separation and Branch Cleanup

- Request: Merge checkpoint work into `main`, remove non-main branches locally/remotely, and move Docker/runtime state outside the source repo.
- Change: Fast-forwarded `main`, pruned stale worktree metadata, removed merged `climpire/*` and checkpoint branches, copied runtime data to `..\runtime\DonggriCompany`, and configured worktrees through `WORKTREE_BASE_DIR`.
- Changed files: `docker-compose.yml`, `.env.example`, `README.md`, worktree lifecycle modules/tests, and Dev Drive operating docs.
- Commands: `git merge --ff-only`, `git push`, `git worktree prune`, `git branch -d`, `docker compose up -d --build`, targeted `pnpm test:api`, TypeScript check, and runtime worktree smoke.
- Validation: Target tests, TypeScript, compose config, health check, and runtime worktree path check.
- Risk: Existing OAuth refresh tokens in runtime DB may be expired; GitHub server OAuth remains a separate follow-up.
- Follow-up: Commit these runtime separation changes only after user approval.

## 2026-05-06 15:27 KST - GitHub CI Format Failure Fix

- Request: Stop repeated GitHub Actions `CI` failures on `main`.
- Change: Inspected the latest failed run and applied Prettier formatting to the worktree lifecycle module that failed `format:check`.
- Changed files: `server/modules/workflow/core/worktree/lifecycle.ts`, `docs/QUALITY_LOG.md`.
- Commands: `gh run view 25419489200 --log-failed`, `corepack pnpm exec prettier --write server/modules/workflow/core/worktree/lifecycle.ts`, direct Prettier check, targeted worktree lifecycle test, TypeScript check.
- Validation: Prettier direct check passed, lifecycle API tests passed, TypeScript check passed, and `git diff --check` passed.
- Risk: Local Windows `pnpm` shims under `node_modules/.bin` were missing after dependency reinstall, so direct package binaries were used for local verification; GitHub Ubuntu CI installs fresh dependencies and should use normal shims.
- Follow-up: Commit and push after approval so GitHub Actions can re-run on `main`.

## 2026-05-06 15:42 KST - GitHub CI E2E Contract Follow-up

- Request: Continue resolving the GitHub Actions `CI` failure after the format step passed.
- Change: Updated E2E coverage tests to include the required `override_reason` on manual assignment and to expect the current resume/auto-routing contract.
- Changed files: `tests/e2e/ci-coverage-gap.spec.ts`, `tests/e2e/ci-api-ops-and-docs.spec.ts`, `docs/QUALITY_LOG.md`.
- Commands: `gh run watch 25420206463 --exit-status`, `gh run watch 25420511417 --exit-status`, targeted Playwright E2E attempt, TypeScript check, staged diff/secret checks.
- Validation: Format, lint, OpenAPI, type check, build, and Playwright browser install passed in CI before the remaining E2E assertion was narrowed.
- Risk: CI may expose further downstream E2E issues after these contract mismatches are fixed.
- Follow-up: Push a follow-up commit and watch the next GitHub Actions run.
