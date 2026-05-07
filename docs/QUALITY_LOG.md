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

## 2026-05-06 16:16 KST - Department Components MVP

- Request: Implement a department-specific component tab with project-scoped history and office-room entry routing.
- Change: Added the `departmentComponents` view, department component screen, design workspace flow, module manifest metadata, `project_component_events` storage/API, and design workspace module manifest.
- Changed files: App navigation/layout files, `DepartmentComponentsView`, module API/schema/routes/tests, module manifest files, and related type/test files.
- Commands: `corepack pnpm install --frozen-lockfile --force`, `corepack pnpm test:web -- DepartmentComponents`, `corepack pnpm test:web -- Sidebar.app-shell`, `corepack pnpm test:api -- modules`, `corepack pnpm build`, targeted Prettier check/write.
- Validation: Department component UI tests passed, sidebar test passed, module API suite passed, and production build passed.
- Risk: Local `node_modules` was missing pnpm-linked packages and binaries during verification; forced lockfile reinstall restored local shims without changing tracked lockfiles.
- Follow-up: Add richer per-department data integrations when backend sources for PRs, builds, scans, SLOs, and QA runs are available.

## 2026-05-06 17:00 KST - Department Components UI Operations Validation

- Request: Rework the department component UI for operational usability, delete the current app project safely, create a runtime test project, and prove project-scoped events/tasks with screenshots.
- Change: Removed the Live Ops rail from the department component view, widened the workbench into left component list/center work area/right history panels, changed design workspace into a wider operational layout, improved mobile wrapping, and hardened project deletion against existing FK references.
- Changed files: `src/components/DepartmentComponentsView.tsx`, `src/app/AppHeaderBar.tsx`, `src/app/AppMainLayout.tsx`, `server/modules/routes/core/projects.ts`, `docs/QUALITY_LOG.md`.
- Commands: Project delete/create API smoke, component event/task creation smoke, Playwright screenshots at `1440x960` and `390x844`, `corepack pnpm test:web -- DepartmentComponents`, `corepack pnpm test:web -- Sidebar.app-shell`, `corepack pnpm test:api -- modules`, `corepack pnpm build`.
- Validation: Deleted app project `77bef962-f511-42bc-899d-09c50a85e826`; skipped folder deletion because `/workspace/DonggriCompany` was not a Windows-local path; created `<PROJECT_RUNTIME_ROOT>\department-components-test-20260506-074352`; generated PMO checkpoint event, design export event, and design task bound to the new project; screenshots showed no Live Ops rail, no horizontal overflow, and no console errors.
- Risk: Long project paths are intentionally truncated with full path available in title/selector context; local pnpm `.bin` links disappeared during verification and required lockfile-safe reinstall.
- Follow-up: Replace placeholder component metrics with real source integrations when PR/build/security/SLO/test-run feeds are connected.

## 2026-05-06 17:20 KST - Decision Option Outcome Analysis

- Request: Improve decision-making so each option, especially 1 and 2, shows detailed analysis and post-selection consequences.
- Change: Added structured option analysis fields, generated fallback analysis for parsed agent decision requests, enriched workflow decision options for project review, timeout resume, and review rounds, and rendered rationale/result/risk/follow-up in the Decision Inbox UI.
- Changed files: Decision Inbox server item builders/formatter/types, frontend API mapping, decision request parser, `DecisionInboxModal`, chat inline decision rendering, targeted tests, and `tasks/todo.md`.
- Commands: `corepack pnpm exec prettier --write ...`, `corepack pnpm test:web -- decision-request decision-inbox`, `corepack pnpm test:api -- decision-inbox`, `corepack pnpm build`, `git diff --check`.
- Validation: Web decision parser/inbox tests passed, API decision-inbox tests passed, production build passed, and whitespace check passed.
- Risk: Generic fallback analysis for free-form agent messages is heuristic when the source message does not provide explicit consequences.
- Follow-up: Let planner agents send explicit option analysis in their decision prompts so fallback text is needed less often.

## 2026-05-06 18:02 KST - Decision Option Analysis P0 Closure

- Request: Start closing the P0 gaps identified in the decision option analysis review.
- Change: Added analysis source tracking (`template`, `fallback`, `planner`), extended planning-lead prompts to require JSON option analysis, stored planner option analysis alongside display summaries, applied planner analysis over template text, and added modal render coverage.
- Changed files: Decision Inbox option analysis helpers, project/review planning and item builders, frontend decision mapping/types, `DecisionInboxModal`, targeted tests, `tasks/todo.md`, and this quality log.
- Commands: `corepack pnpm exec prettier --write ...`, `corepack pnpm test:web -- DecisionInboxModal decision-request decision-inbox`, `corepack pnpm test:api -- decision-inbox`, `corepack pnpm build`, `corepack pnpm run openapi:check`, `git diff --check`.
- Validation: Web targeted suite passed, API decision-inbox suite passed, production build passed, OpenAPI check passed, and whitespace check passed.
- Risk: Planner JSON quality still depends on the planning agent following the contract; invalid or partial planner analysis is ignored and template/fallback analysis remains available.
- Follow-up: Add live planner-output observability if production prompts repeatedly fall back to template analysis.

## 2026-05-07 09:22 KST - Walk Normalize P1

- Request: Proceed from P0 to P1 in priority order after committing the P0 decision-option work.
- Change: Split the agent sprite walk-normalize contract into a reusable config, moved direction-specific reference crop/anchor/frame-offset rules out of the generator, added a repeatable sprite asset quality checker, generated a deterministic walk animation smoke report, and added runtime walk actor tests.
- Changed files: `tools/agents/build-agent-sprites-from-sheet.mjs`, `tools/agents/walk-normalize-config.mjs`, `tools/agents/check-walk-normalize-assets.mjs`, `public/generated/agent-visual-profiles/walk-animation-smoke-v1.json`, `src/components/office-view/spriteActors.test.ts`, `package.json`, `tasks/todo.md`, and this quality log.
- Commands: `corepack pnpm run agents:sprites:check`, `node --check tools/agents/build-agent-sprites-from-sheet.mjs`, `node --check tools/agents/walk-normalize-config.mjs`, `node --check tools/agents/check-walk-normalize-assets.mjs`, `corepack pnpm test:web -- spriteAssets spriteActors`.
- Validation: 528 expected runtime sprite PNG files inspected, 176 direction sets collectable, 0 errors, 0 warnings; web sprite tests passed.
- Risk: The generator now records v2 walk-normalize metadata on future regeneration, but existing PNG assets were not regenerated in this P1 pass.
- Follow-up: If sprite source art changes, run `corepack pnpm agents:sprites` first, then `corepack pnpm agents:sprites:check` before committing generated PNG/manifest changes.

## 2026-05-07 09:34 KST - Agent Detail P2

- Request: Continue from P1 to P2 and improve the employee detail screen.
- Change: Added an operational profile board for visual profile, character settings, sprite settings, and generation history; surfaced memory/growth/subagent recommendations in the info view; connected reserve visual profile approval to `agent_profile.visual_profile_key` updates; preserved visual profile and preferred subagent fields during client/server profile normalization.
- Changed files: `src/components/AgentDetail.tsx`, `src/components/agent-detail/AgentDetailTabContent.tsx`, `src/agent-profile.ts`, `server/modules/workflow/agents/agent-profile.ts`, targeted tests, `tasks/todo.md`, and this quality log.
- Commands: `corepack pnpm exec prettier --write ...`, `corepack pnpm test:web -- AgentDetail AgentDetailTabContent`, `corepack pnpm test:api -- agent-profile`, `git diff --check`, `corepack pnpm build`.
- Validation: Agent detail web tests passed, server agent-profile tests passed, whitespace check passed, and production build passed.
- Risk: Reserve profile candidates currently fall back to the canonical visual profile pool when explicit `reserve` statuses are not populated.
- Follow-up: Mark generated visual profile statuses as active/reserve from the staff mapping source when the seed profile manifest is promoted.

## 2026-05-07 10:37 KST - Task Card and Office Ops P3

- Request: Commit P2, then proceed to P3 업무 카드/오피스 관제 in priority order.
- Change: Added compact task-card operations metadata for goal command, responsible departments, verification gates, recent logs, and office timeline signals; unified task status labels/colors between task cards and the live operations rail; projected recent task logs from the task list API with schema compatibility checks.
- Changed files: Task card/board components, live operations rail status helper/tests, task list API/tests, shared task types, `tasks/todo.md`, and this quality log.
- Commands: `corepack pnpm exec prettier --write ...`, `corepack pnpm test:web -- TaskCard LiveOperationsRail`, `corepack pnpm test:api -- crud.workflow-pack-filter`, `corepack pnpm build`, `git diff --check`.
- Validation: TaskCard and LiveOperationsRail web tests passed, task CRUD API tests passed, production build passed, and whitespace check passed.
- Risk: Task timeline uses current in-memory office events; persisted historical meeting/call/delivery rows would be needed for long-term replay after reload.
- Follow-up: P4 should add durable memory/search linkage so task reports can retrieve longer evidence trails beyond the compact card view.
