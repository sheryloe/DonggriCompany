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
