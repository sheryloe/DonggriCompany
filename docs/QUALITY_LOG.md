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

## 2026-05-07 12:45 KST - Archival Memory Search P4

- Request: Commit P3, then proceed to P4 장기기억 검색 고도화 in priority order.
- Change: Added a dedicated `search_archival_memory` HTTP tool prompt block, enriched promotion candidate evidence with skill usage, task results, and task-run memory references, and covered approved-only global lesson injection.
- Changed files: `server/modules/memory/store.ts`, `server/modules/routes/core/memory.test.ts`, `tasks/todo.md`, and this quality log.
- Commands: `corepack pnpm exec prettier --write ...`, `corepack pnpm test:api -- memory`, `corepack pnpm build`, `git diff --check`.
- Validation: Memory API tests passed, production build passed, and whitespace check passed.
- Risk: Promotion candidate evidence is still bounded to the latest 12 skill usage rows and task-run memory references; deeper historical evidence remains discoverable through `search_archival_memory`.
- Follow-up: P5 should connect ISO quality evidence fields to task reports and memory quality events.

## 2026-05-07 13:08 KST - Gemini Pro P0-P4 Analysis Report

- Request: Use Gemini CLI with a Pro model to produce an analysis report.
- Change: Ran Gemini CLI in read-only plan mode against the repository context and saved the generated P0-P4 analysis report under `docs/reports/`.
- Changed files: `docs/reports/GEMINI_PRO_ANALYSIS_P0_P4_2026-05-07.md`, `docs/QUALITY_LOG.md`.
- Commands: `gemini --version`, `gemini --help`, `gemini -m gemini-3-pro-preview --approval-mode plan -p <analysis prompt>`.
- Validation: Gemini CLI returned the report body; output also included server-side Pro model capacity retry logs, so only the generated report body was retained.
- Risk: The CLI routed the Pro request through a preview Pro model and reported capacity 429 retries after output; rerun may be needed if exact model availability must be proven later.
- Follow-up: Use the report recommendations to scope P5 ISO quality evidence automation.

## 2026-05-07 13:50 KST - Gemini Pro Checklist and P5 P0/P1 Closure

- Request: Re-run Gemini CLI with `gemini-3.1-pro-preview`, fall back to `gemini-2.5-pro` on 429/capacity failure, create a detailed checklist, and let Codex implement improvements from that checklist.
- Change: Saved the Gemini detailed analysis/checklist under `docs/analysis/`, added a reusable Pro-to-Pro fallback runner script, centralized reserve-capable visual profile fallback selection, reused that fallback pool in the agent detail reserve approval UI, and extended archival memory search with tag and created/updated date range filters.
- Changed files: `docs/analysis/GEMINI_PRO_DETAILED_CHECKLIST_P5_2026-05-07.md`, `scripts/run-gemini-pro-analysis.ps1`, `src/agent-visual-profiles.ts`, `src/agent-visual-profiles.test.ts`, `src/components/agent-detail/AgentDetailTabContent.tsx`, `server/modules/memory/store.ts`, `server/modules/routes/core/memory.ts`, `server/modules/routes/core/memory.test.ts`, `docs/QUALITY_LOG.md`.
- Commands: `gemini -m gemini-3.1-pro-preview --approval-mode plan -p <analysis prompt>` with `GEMINI_CLI_TRUST_WORKSPACE=true`, fallback attempt to `gemini-2.5-pro`, `corepack pnpm exec prettier --write ...`, `corepack pnpm test:web -- agent-visual-profiles`, `corepack pnpm test:api -- memory`, `corepack pnpm test:web -- AgentDetailTabContent agent-visual-profiles`, `corepack pnpm build`.
- Validation: Gemini 3.1 produced a usable checklist report while also reporting capacity 429 retry logs; residual Gemini CLI node processes from the timed-out fallback run were stopped. Visual profile tests passed, agent detail tests passed, memory API tests passed, and production build passed.
- Risk: Future Gemini 3.1 Pro runs may still hit server capacity; the script now falls back automatically when the primary model exits nonzero, emits no output, times out, or reports 429/capacity. The current visual profile pool still has no explicit reserve status rows, so runtime fallback uses reserve rows when present and otherwise falls back to canonical seeded/active profiles.
- Follow-up: Continue with checklist P2/P3 items: project component event timeline, design workspace asset-review specialization, and decision after-result tracking.

## 2026-05-07 14:25 KST - Gemini Pro Final P5 Review

- Request: After P5 P0/P1 work, run Gemini CLI again to create a full detailed analysis report and improvement-point document.
- Change: Added a final review prompt, hardened the Gemini runner to capture UTF-8 output through `.NET Process`, reran `gemini-3.1-pro-preview` first with automatic `gemini-2.5-pro` fallback, and saved a cleaned final review report under `docs/analysis/`.
- Changed files: `docs/analysis/GEMINI_PRO_FINAL_REVIEW_PROMPT_2026-05-07.md`, `docs/analysis/GEMINI_PRO_FINAL_REVIEW_AFTER_P5_2026-05-07.md`, `scripts/run-gemini-pro-analysis.ps1`, `docs/QUALITY_LOG.md`.
- Commands: `.\scripts\run-gemini-pro-analysis.ps1 -PromptFile .\docs\analysis\GEMINI_PRO_FINAL_REVIEW_PROMPT_2026-05-07.md -OutputPath .\docs\analysis\GEMINI_PRO_FINAL_REVIEW_AFTER_P5_2026-05-07.md -PrimaryModel gemini-3.1-pro-preview -FallbackModel gemini-2.5-pro -TimeoutSeconds 900`, PowerShell parser validation, `corepack pnpm exec prettier --write ...`.
- Validation: Gemini 3.1 continued to report capacity 429, fallback completed with `gemini-2.5-pro`, final document was normalized to remove a duplicated partial preface, and UTF-8 Korean rendering was verified.
- Risk: The final verdict came from fallback `gemini-2.5-pro` because the preferred 3.1 preview model remained capacity constrained.
- Follow-up: Commit the P5 P0/P1 change set, then proceed to P2/P3 follow-up work identified in the final review.

## 2026-05-07 14:41 KST - Memory Search UI

- Request: Commit the current P5 P0/P1 change set, then start the Gemini-recommended memory search UI patch set.
- Change: Committed the P5 P0/P1 work as `f59d783`, added a long-term memory search panel to the Skills memory section, exposed query/tag/created/updated date/layer/scope/agent/project filters, rendered memory result summaries with tags and timestamps, and extended the client search API to serialize array/date filter parameters.
- Changed files: `src/api/memory.ts`, `src/components/skills-library/MemorySearchPanel.tsx`, `src/components/skills-library/MemorySearchPanel.test.tsx`, `src/components/skills-library/SkillsMemorySection.tsx`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:web -- MemorySearchPanel SkillsLibrary`, `corepack pnpm build`.
- Validation: MemorySearchPanel and SkillsLibrary web tests passed, and production build passed.
- Risk: The project filter currently accepts raw `project_id`; a richer project selector would improve operator ergonomics when project metadata is already loaded elsewhere in the app.
- Follow-up: Connect the memory search panel to project selector context or a project lookup endpoint so operators do not need to paste project ids manually.

## 2026-05-07 14:49 KST - Gemini Memory Search UI Review

- Request: After committing the remaining memory search UI changes, run Gemini CLI with `gemini-3.1-pro-preview` first and produce a detailed review/improvement analysis report.
- Change: Generated a bounded Gemini review prompt and analysis report for memory search UI commit `6761f34`.
- Changed files: `docs/analysis/GEMINI_PRO_MEMORY_SEARCH_UI_REVIEW_PROMPT_2026-05-07.md`, `docs/analysis/GEMINI_PRO_MEMORY_SEARCH_UI_REVIEW_2026-05-07.md`, `docs/QUALITY_LOG.md`.
- Commands: `.\scripts\run-gemini-pro-analysis.ps1 -PromptFile '.\docs\analysis\GEMINI_PRO_MEMORY_SEARCH_UI_REVIEW_PROMPT_2026-05-07.md' -OutputPath '.\docs\analysis\GEMINI_PRO_MEMORY_SEARCH_UI_REVIEW_2026-05-07.md' -PrimaryModel 'gemini-3.1-pro-preview' -FallbackModel 'gemini-2.5-pro' -TimeoutSeconds 900`.
- Validation: Gemini CLI completed with `gemini-3.1-pro-preview` directly, without fallback; UTF-8 Korean report rendering was verified.
- Risk: Gemini report is evidence-based from the supplied prompt and validation summary, not an independent filesystem/tool inspection.
- Follow-up: Use the report's next patch set as the P1/P2 backlog, starting with a project selector for memory search.
