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

## 2026-05-07 15:12 KST - Memory Search UI Project Selector

- Request: Implement the Gemini follow-up plan for the memory search UI by removing raw `project_id` input, adding project selection, adding advanced filters, and reusing the panel in the project memory tab.
- Change: Added project search/selection to `MemorySearchPanel`, wired `promotion_status` and `source_type` through UI/client/server search, and embedded a locked project memory search panel in `ProjectInsightsPanel`.
- Changed files: `server/modules/memory/store.ts`, `server/modules/routes/core/memory.ts`, `server/modules/routes/core/memory.test.ts`, `src/api/memory.ts`, `src/components/skills-library/MemorySearchPanel.tsx`, `src/components/skills-library/MemorySearchPanel.test.tsx`, `src/components/project-manager/ProjectInsightsPanel.tsx`, `src/components/project-manager/ProjectInsightsPanel.test.tsx`, `src/components/ProjectManagerModal.tsx`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:web -- MemorySearchPanel ProjectInsightsPanel`, `corepack pnpm test:api -- memory`, `corepack pnpm build`, `git diff --check`.
- Validation: Web tests passed with 2 files and 6 tests; API memory tests passed with 11 tests; production build and diff check passed.
- Risk: Project selector uses first-page project search results only and does not yet provide saved/recent memory searches, audit export, or semantic/vector ranking.
- Follow-up: Keep global command palette/search-history/export as the next patch set.

## 2026-05-07 15:27 KST - Gemini Full System Review

- Request: Run Gemini CLI for a full-system DonggriCompany code/system review report.
- Change: Generated a read-only full-system review prompt and Gemini analysis report covering architecture, frontend UX, backend/data, workflow/agents/memory, security/operations, tests, risks, roadmap, and scores.
- Changed files: `docs/analysis/GEMINI_PRO_FULL_SYSTEM_REVIEW_PROMPT_2026-05-07.md`, `docs/analysis/GEMINI_PRO_FULL_SYSTEM_REVIEW_2026-05-07.md`, `docs/QUALITY_LOG.md`.
- Commands: `.\scripts\run-gemini-pro-analysis.ps1 -PromptFile '.\docs\analysis\GEMINI_PRO_FULL_SYSTEM_REVIEW_PROMPT_2026-05-07.md' -OutputPath '.\docs\analysis\GEMINI_PRO_FULL_SYSTEM_REVIEW_2026-05-07.md' -PrimaryModel 'gemini-3.1-pro-preview' -FallbackModel 'gemini-2.5-pro' -TimeoutSeconds 1200`.
- Validation: `gemini-3.1-pro-preview` reported capacity 429 and the scripted fallback completed with `gemini-2.5-pro`; report structure and UTF-8 Korean rendering were checked.
- Risk: The report is a Gemini CLI read-only review with generated/heavy/secret-bearing paths excluded; it should be treated as a system-level review, not a line-by-line security audit.
- Follow-up: Convert the P0/P1/P2 roadmap into implementation tasks, starting with frontend state-management decomposition.

## 2026-05-07 15:38 KST - App Overlay State Decomposition

- Request: Use the Gemini full-system review as input, independently judge the improvement path, and start improving the DonggriCompany program.
- Change: Confirmed Gemini's P0 frontend state-management risk, noted that the existing CI workflow already covers much of the reported P1 area, and extracted transient overlay/navigation state from `App.tsx` into `useAppOverlayState`.
- Changed files: `src/App.tsx`, `src/app/useAppOverlayState.ts`, `src/app/useAppOverlayState.test.tsx`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:web -- useAppOverlayState AppHeaderBar`, `corepack pnpm build`.
- Validation: Hook/AppHeaderBar web tests passed with 2 files and 4 tests; production build passed.
- Risk: This is the first low-risk decomposition step, not a full external store migration; domain data state remains in `App.tsx` until the next slice extraction.
- Follow-up: Continue P0 by extracting domain collections/actions or introducing a measured external store after the hook boundary proves stable.

## 2026-05-07 18:11 KST - Gemini Pro Software Completeness Review

- Request: Run a Gemini CLI Pro model to analyze DonggriCompany software completeness.
- Change: Created a dedicated software-completeness prompt and generated an evidence-based Gemini Pro report with subsystem scorecard, confirmed gaps, inferred risks, and P0/P1/P2 completion roadmap.
- Changed files: `docs/analysis/GEMINI_PRO_SOFTWARE_COMPLETENESS_REVIEW_PROMPT_2026-05-07.md`, `docs/analysis/GEMINI_PRO_SOFTWARE_COMPLETENESS_REVIEW_2026-05-07.md`, `docs/QUALITY_LOG.md`.
- Commands: `gemini --version`, `gemini -m gemini-3.1-pro-preview ...`, `gemini -m gemini-3-pro-preview ...`, `gemini -m gemini-2.5-pro ...`, evidence-based `gemini-3-pro-preview --output-format text --approval-mode plan --skip-trust`.
- Validation: `gemini-3.1-pro-preview` and full workspace `gemini-3-pro-preview` runs hit capacity 429; `gemini-2.5-pro` quota was exhausted; the final report was generated successfully with `gemini-3-pro-preview` using tracked non-secret evidence and UTF-8 Korean rendering was checked.
- Risk: The final report is evidence-based because full workspace Pro analysis was capacity constrained; it should be treated as a software-completeness review, not a line-by-line security audit.
- Follow-up: Use the report's recommended next slice, domain collection extraction from `App.tsx`, as the next P0 implementation candidate.

## 2026-05-07 22:43 KST - App Domain State P0 Slice

- Request: Finish the committed Gemini review work, identify the remaining work toward 100-point completeness, and continue according to current progress.
- Change: Added a software-completeness roadmap to `tasks/todo.md`, extracted App domain collections and realtime refs into `useAppDomainState`, and moved office workflow pack save/hydration/rollback behavior into `useOfficeWorkflowPackChange`.
- Changed files: `src/App.tsx`, `src/app/useAppDomainState.ts`, `src/app/useAppDomainState.test.tsx`, `src/app/useOfficeWorkflowPackChange.ts`, `src/app/useOfficeWorkflowPackChange.test.tsx`, `tasks/todo.md`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:web -- useAppDomainState useOfficeWorkflowPackChange useAppOverlayState AppHeaderBar`, `corepack pnpm build`.
- Validation: Targeted web tests passed with 4 files and 7 tests; production build passed.
- Risk: This slice creates hook boundaries and tests for state/action separation, but does not yet add Planner JSON quality telemetry or provider capacity dashboards.
- Follow-up: Continue P0 with Planner decision JSON quality metrics, persistence, and operator visibility.

## 2026-05-07 22:50 KST - Planner JSON Quality P0 Slice

- Request: Continue the software-completeness roadmap instead of stopping at the Gemini report.
- Change: Added Planner decision analysis quality metrics for complete, partial, missing, invalid, and not-applicable states; exposed the quality payload through decision inbox API items; mapped it into the frontend decision model; and displayed Planner JSON quality coverage in the Decision Inbox modal.
- Changed files: `server/modules/routes/ops/messages/decision-inbox/planner-option-analysis.ts`, `server/modules/routes/ops/messages/decision-inbox/planner-option-analysis.test.ts`, `server/modules/routes/ops/messages/decision-inbox/types.ts`, `server/modules/routes/ops/messages/decision-inbox/project-timeout-items.ts`, `server/modules/routes/ops/messages/decision-inbox/review-round-items.ts`, `src/api/messaging-runtime-oauth.ts`, `src/components/chat/decision-inbox.ts`, `src/app/decision-inbox.ts`, `src/components/DecisionInboxModal.tsx`, `src/components/DecisionInboxModal.test.tsx`, `tasks/todo.md`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:api -- planner-option-analysis`, `corepack pnpm test:web -- DecisionInboxModal`, `corepack pnpm build`.
- Validation: Planner option analysis API tests passed with 3 tests; DecisionInboxModal web test passed; production build passed.
- Risk: The quality metric is computed from stored planner summaries and exposed in the pending decision surface; long-term historical trend storage is still a future operations hardening item.
- Follow-up: Continue P1 with LLM provider capacity 429 fallback/retry visibility in the operator UI.

## 2026-05-07 23:16 KST - Provider Capacity, ISO Evidence, Memory Ranking, and FK Regression Slice

- Request: Complete the next P1/P2 roadmap items after P0: provider 429/fallback/retry visibility, task report ISO evidence links, memory semantic/vector ranking plus saved/recent searches, and project delete/task/memory FK edge-case regression coverage.
- Change: Added API provider runtime status metadata for capacity 429, retryable failures, retry-after, and fallback model candidates; rendered that status in the API settings UI; added task report ISO evidence fields for change request, implementation, verification, approval, smoke screenshot, commit hash, CI URL, and traceability notes; added lightweight semantic ranking mode to memory search; added memory saved/recent searches in local storage; and added project deletion FK regression tests.
- Changed files: `server/modules/routes/ops/api-providers.ts`, `server/modules/routes/ops/api-providers.test.ts`, `src/components/settings/ApiSettingsTab.tsx`, `src/components/settings/ApiSettingsTab.test.tsx`, `src/components/settings/types.ts`, `src/components/settings/useApiProvidersState.ts`, `src/api/providers-reports-github.ts`, `server/modules/routes/ops/task-reports/helpers.ts`, `server/modules/routes/ops/task-reports/helpers.test.ts`, `server/modules/routes/ops/task-reports/routes.ts`, `src/components/TaskReportPopup.tsx`, `src/components/TaskReportPopup.test.tsx`, `server/modules/memory/store.ts`, `server/modules/routes/core/memory.ts`, `server/modules/routes/core/memory.test.ts`, `src/api/memory.ts`, `src/components/skills-library/MemorySearchPanel.tsx`, `src/components/skills-library/MemorySearchPanel.test.tsx`, `server/modules/routes/core/projects.delete.test.ts`, `tasks/todo.md`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:web -- ApiSettingsTab MemorySearchPanel TaskReportPopup`, `corepack pnpm test:api -- api-providers task-reports memory projects.delete`, `corepack pnpm build`, `git diff --check`, `corepack pnpm test:web -- useAppDomainState useOfficeWorkflowPackChange DecisionInboxModal ApiSettingsTab MemorySearchPanel TaskReportPopup`, `corepack pnpm test:api -- planner-option-analysis api-providers task-reports memory projects.delete`.
- Validation: Initial targeted web tests passed with 3 files and 13 tests; initial targeted API tests passed with 5 files and 29 tests; production build passed; diff whitespace check passed; final combined P0/P1/P2 web regression passed with 6 files and 17 tests; final combined API regression passed with 6 files and 32 tests.
- Risk: Memory semantic ranking is a local lexical relevance scorer layered onto existing FTS/SQL, not an embedding/vector database yet. Saved/recent searches are browser-local and not synchronized across devices.
- Follow-up: If higher recall is required, add an embedding/vector index with migration/backfill and an auditable saved-search server table.

## 2026-05-07 23:32 KST - Memory Embedding Vector Ranking

- Request: After committing the P0/P1/P2 slice, continue the remaining memory semantic ranking gap by adding an actual embedding/vector DB path.
- Change: Added a `memory_embeddings` SQLite table, model/version keyed local hash embedding cache, delete cleanup triggers, vector search candidate expansion, cosine ranking mode, UI/API `ranking=vector` support, and regression coverage for project deletion cleanup.
- Changed files: `server/modules/bootstrap/schema/memory-schema.ts`, `server/modules/memory/store.ts`, `server/modules/routes/core/memory.test.ts`, `server/modules/routes/core/projects.delete.test.ts`, `src/api/memory.ts`, `src/components/skills-library/MemorySearchPanel.tsx`, `src/components/skills-library/MemorySearchPanel.test.tsx`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:api -- memory projects.delete`, `corepack pnpm test:web -- MemorySearchPanel`.
- Validation: API memory/project-delete tests passed with 2 files and 14 tests; MemorySearchPanel web tests passed with 1 file and 4 tests.
- Risk: The first vector model is deterministic local hashed token embedding (`local-hash-v3`), suitable for offline operation and auditability, but not an external semantic embedding model or ANN index.
- Follow-up: Add provider-backed embeddings and vector backfill when model capacity, cost controls, and migration observability are ready.

## 2026-05-07 23:59 KST - Gemini ISO 9001 Software Completeness Review

- Request: Use Gemini CLI to review the full codebase from an ISO 9001 quality and software-completeness perspective.
- Change: Created a full-workspace Gemini Pro audit prompt and, after Pro capacity/time limits, generated a condensed evidence-based Gemini report with ISO 9001 readiness, software completeness scoring, subsystem scorecard, and prioritized improvement checklist.
- Changed files: `docs/analysis/GEMINI_PRO_ISO9001_SOFTWARE_COMPLETENESS_PROMPT_2026-05-07.md`, `docs/analysis/GEMINI_CONDENSED_ISO9001_SOFTWARE_COMPLETENESS_PROMPT_2026-05-07.md`, `docs/analysis/GEMINI_CONDENSED_ISO9001_SOFTWARE_COMPLETENESS_REVIEW_2026-05-07.md`, `docs/QUALITY_LOG.md`.
- Commands: `gemini --version`, `.\scripts\run-gemini-pro-analysis.ps1 -PromptFile '.\docs\analysis\GEMINI_PRO_ISO9001_SOFTWARE_COMPLETENESS_PROMPT_2026-05-07.md' -OutputPath '.\docs\analysis\GEMINI_PRO_ISO9001_SOFTWARE_COMPLETENESS_REVIEW_2026-05-07.md' -PrimaryModel 'gemini-3.1-pro-preview' -FallbackModel 'gemini-2.5-pro' -TimeoutSeconds 1200`, fallback retries with `gemini-3-pro-preview`, `gemini-2.5-flash`, and final condensed prompt through `gemini-3-pro-preview`.
- Validation: Gemini CLI version `0.41.2` was available; full-workspace Pro attempts hit capacity 429 or timeout; the condensed evidence report completed with effective model `gemini-3-pro-preview`; UTF-8 Korean report content was verified with zero replacement characters.
- Risk: The generated report is condensed evidence-based because full-workspace Pro code traversal was provider-constrained; it is not a line-by-line full source audit.
- Follow-up: Use the report's next implementation candidates: server-side saved/recent memory searches, provider-backed embeddings, and long-term quality metrics storage.

## 2026-05-08 00:34 KST - Provider Semantic Memory, Saved Searches, and Quality Metrics Warehouse

- Request: Remove the 100-point blockers by adding provider-backed semantic embeddings, SQLite-first ANN indexing, server-side saved/recent memory searches, and a long-term quality metrics warehouse.
- Change: Extended `memory_embeddings` with provider/status/error metadata, added `memory_embedding_index`, `memory_search_profiles`, and `quality_metric_events`, implemented provider-neutral embedding backfill/status APIs, added `ranking=semantic_provider` with ANN bucket candidate lookup and local-hash fallback, moved memory saved/recent searches to server-first storage with localStorage fallback, and added a compact 7-day quality summary in the memory search UI.
- Changed files: `server/modules/bootstrap/schema/memory-schema.ts`, `server/modules/memory/store.ts`, `server/modules/routes/core/memory.ts`, `server/modules/routes/core/memory.test.ts`, `server/modules/routes/ops.ts`, `server/modules/routes/ops/api-providers.ts`, `server/modules/routes/ops/quality-metrics.ts`, `server/modules/routes/ops/quality-metrics.test.ts`, `src/api/memory.ts`, `src/components/skills-library/MemorySearchPanel.tsx`, `src/components/skills-library/MemorySearchPanel.test.tsx`, `src/types/index.ts`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:api -- memory`, `corepack pnpm test:api -- quality-metrics`, `corepack pnpm test:api -- memory api-providers planner-option-analysis quality-metrics`, `corepack pnpm test:web -- MemorySearchPanel`, `corepack pnpm test:web -- MemorySearchPanel DecisionInboxModal ApiSettingsTab`, `corepack pnpm build`, `git diff --check`.
- Validation: Memory API tests passed with 16 tests; quality metrics API tests passed with 2 tests; combined API regression passed with 5 files and 34 tests; MemorySearchPanel web tests passed with 6 tests; combined web regression passed with 3 files and 13 tests; production build passed; diff whitespace check passed.
- Risk: ANN is SQLite bucket prefilter plus cosine rerank, not a native vector extension or external vector database. Provider calls are disabled/mocked in tests and depend on existing `api_providers` configuration at runtime; failures are recorded and fall back to `local-hash-v3`.
- Follow-up: Add operator controls for scheduled embedding backfill and retention/rollup policy for `quality_metric_events` once real production volume is observed.

## 2026-05-08 11:15 KST - Toss In-App Viral Map Internal Workflow Validation

- Request: Use Codex multi-auth account 1 first and create a Toss in-app trend validation project inside DonggriCompany to verify planning through operations workflow.
- Change: Switched `codex-multi-auth` selection to account 1, synced Donggri CLI pools, assigned all Codex staff to `codex-main`, created Donggri project `88c06b5f-f678-46b1-9e17-0fcc72594898`, generated runtime project `G:\Donggri_DevDrive\repos\runtime\DonggriCompany\toss-inapp-viral-map-20260508-110049`, and registered six completed department tasks with evidence results.
- Changed files: `docs/quality-reports/toss-inapp-viral-map-validation-2026-05-08.md`, `docs/QUALITY_LOG.md`, `src/app/office-workflow-pack.ts`, `src/app/office-workflow-pack.test.ts`.
- Runtime artifact: Runtime project Git commit `3296290 Create Toss in-app viral map validation MVP`.
- Commands: `corepack pnpm install`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm screenshots`, runtime `git diff --cached --check`.
- Validation: Runtime unit test passed with 1 test; production build passed; Playwright screenshots generated for mobile home, mobile detail, mobile complete, and desktop workbench; project-specific Vite process was cleaned after capture.
- Risk: `codex-main` is execution-ready, but `codex-main-2` through `codex-main-4` are fallback candidates only after auth artifact connection; real Toss console, mTLS, login, payment, and location integrations remain out of scope.

## 2026-05-08 12:56 KST - Donggri Architecture Workflow Correction

- Request: Correct the Toss in-app validation because manual Codex output did not prove DonggriCompany architecture execution; verification must use internal planning, department assignment, Telegram relay, CLI execution, and project-linked reports.
- Change: Re-ran validation through DonggriCompany project `88c06b5f-f678-46b1-9e17-0fcc72594898`; confirmed planning meeting and department relay evidence; fixed Codex CLI runtime completion handling so non-final agent messages do not falsely complete tasks; filtered Codex model/plugin/skill-loader noise from task logs; extracted final `agent_message` text for task results instead of storing noisy raw log tails; recovered an orphan `in_progress` collaboration task back to `inbox`; and fixed the runtime validation project test config to exclude `.climpire-worktrees/**`.
- Changed files: `server/modules/workflow/agents/cli-runtime.ts`, `server/modules/workflow/agents/cli-runtime.account-pool.test.ts`, `server/modules/workflow/core/cli-tools.ts`, `server/modules/workflow/core/cli-tools.test.ts`, `server/modules/lifecycle.ts`, `server/modules/lifecycle.test.ts`, `server/modules/workflow/orchestration/run-complete-handler.ts`, `server/modules/workflow/orchestration/run-complete-handler.video-review.test.ts`, `server/modules/routes/ops/messages/announcements-routes.ts`, `server/modules/routes/ops/messages/announcements-routes.test.ts`, runtime `vite.config.ts`.
- Runtime evidence: Parent task `e5661b06-5e32-42fc-8190-d66e985bdc2f` reached review after planned meeting/delegations; corrective DevSecOps task `447f0cef-2944-4d30-8618-c6f4dcff40d5` reached review; Telegram relay success logs exist for PMO, planning/delegated work, dev, design, QA, DevSecOps, and operations; orphan task `ffecfd8c-faa5-4561-bc5a-9adabec1586d` was recovered to `inbox` with cleaned result text.
- Commands: `corepack pnpm test:api -- cli-tools cli-runtime.account-pool lifecycle run-complete-handler.video-review cli-account-gate-service execution-path-gate announcements-routes`, runtime `node scripts/devsecops-gate.mjs`, runtime `corepack pnpm test`, runtime `corepack pnpm build`, root `corepack pnpm build`.
- Validation: API regression passed with 9 files and 40 tests; runtime DevSecOps gate passed; runtime unit test passed with 1 test; runtime production build passed; root production build passed after repairing a corrupted local `node_modules` install.
- Risk: The project still has non-terminal backlog rows (`ffecfd8c` in `inbox`, legacy pending task `4f86dccc-cc4d-44d5-acab-74ed6d56c09b`) and QA's earlier verdict remains `Hold` due missing empty/error/430px evidence. Authentication-protected task control APIs rejected direct stop/resume calls during local validation, so orphan handling was verified through watchdog recovery rather than operator API controls.
- Follow-up: Add an authenticated operator recovery action for orphan task replay/cancel, add a project health panel that highlights pending/inbox/review blockers, and complete the QA Hold evidence set before claiming this validation project is end-to-end green.

## 2026-05-08 14:55 KST - Project Health Panel and QA Hold Evidence Closure

- Request: Continue with the project health panel, orphan recovery action, and QA Hold evidence补완.
- Change: Added `/api/projects/:id/health` for project status/orphan/QA Hold summaries, added `/api/projects/:id/orphan-tasks/:taskId/recover` to move stale orphan work back to the planned queue with an audit log, and added a Project Health tab in the project detail UI. The Toss in-app runtime validation app now includes explicit empty/error QA states and 430px screenshot capture.
- Changed files: `server/modules/routes/core/projects.ts`, `server/modules/routes/core/projects.health.test.ts`, `server/modules/routes/core.ts`, `src/api/organization-projects.ts`, `src/components/project-manager/ProjectHealthPanel.tsx`, `src/components/project-manager/ProjectInsightsPanel.tsx`, `src/components/project-manager/ProjectInsightsPanel.test.tsx`, `src/components/project-manager/types.ts`, runtime `src/App.tsx`, runtime `src/App.test.tsx`, runtime `src/styles.css`, runtime `scripts/smoke-screenshots.mjs`.
- Commands: `corepack pnpm test:api -- projects.health`, `corepack pnpm test:web -- ProjectInsightsPanel`, runtime `corepack pnpm test`, runtime `corepack pnpm build`, runtime `corepack pnpm devsecops:gate`, runtime `corepack pnpm screenshots`, root `corepack pnpm build`, root/runtime `git diff --check`.
- Validation: Project health API tests passed with 2 tests; project detail UI tests passed with 4 tests; runtime unit tests passed with 2 tests; runtime and root production builds passed; DevSecOps gate passed; screenshot evidence generated for `mobile-home-390.png`, `mobile-detail-390.png`, `mobile-complete-390.png`, `desktop-workbench-1440.png`, `mobile-empty-430.png`, and `mobile-error-430.png`.
- Risk: The recovery action deliberately queues recovered work instead of automatically launching CLI execution to avoid unintended reruns. Existing live server must be restarted to expose the new route in the running UI.
- Follow-up: Use the Health tab to recover/triage current project blockers, then rerun the department workflow if QA wants a fresh GO/NO-GO review.

## 2026-05-08 22:50 KST - Donggri Workflow State Reconciliation

- Request: Recover the mismatch between the Toss in-app runtime commit evidence and the DonggriCompany board state without adding new task statuses.
- Change: Added Dev Drive runtime roots to the execution path gate, normalized legacy Codex account pool profile paths to repo-scoped office accounts, expanded project health with path/account/stale-assignment blockers, added supersede evidence mode for orphan recovery, added review approval and stale-assignment cleanup APIs, refreshed the Project Health UI actions, and excluded completed/cancelled tasks from active QA Hold blocker counting.
- Changed files: `server/modules/workflow/core/execution-path-gate.ts`, `server/modules/workflow/agents/cli-account-pool-env.ts`, `server/modules/lifecycle.ts`, `server/modules/routes/core/projects.ts`, `server/modules/routes/core/projects.health.test.ts`, `server/modules/workflow/agents/cli-runtime.account-pool.test.ts`, `src/api/organization-projects.ts`, `src/components/project-manager/ProjectHealthPanel.tsx`, `src/components/project-manager/ProjectInsightsPanel.tsx`, `src/components/project-manager/ProjectInsightsPanel.test.tsx`, `docs/QUALITY_LOG.md`.
- Runtime reconciliation: Using authenticated project APIs against local port 8791, cancelled `4f86dccc-cc4d-44d5-acab-74ed6d56c09b` and `ffecfd8c-faa5-4561-bc5a-9adabec1586d` as superseded by runtime commit `557b3ec`, approved reviews `447f0cef-2944-4d30-8618-c6f4dcff40d5` and `e5661b06-5e32-42fc-8190-d66e985bdc2f`, and ran stale-assignment cleanup.
- Commands: `corepack pnpm test:api -- projects.health execution-path-gate cli-runtime.account-pool`, `corepack pnpm test:web -- ProjectInsightsPanel`, `corepack pnpm build`, `git diff --check`.
- Validation: API regression passed with 3 files and 21 tests; ProjectInsightsPanel web tests passed with 4 tests; production build passed; diff whitespace check passed. Final project health for `88c06b5f-f678-46b1-9e17-0fcc72594898` returned `health=good`, `open_tasks=0`, `orphan_candidates=0`, `review_waiting=0`, `qa_hold_items=0`, and `stale_assignments=0`.
- Risk: The live 8900 server still needs restart/reload to pick up the new code if it was already running before this patch. Runtime reconciliation was applied to the local SQLite DB through the new API on a temporary 8791 server.
- Follow-up: Restart the active DonggriCompany server/UI and verify the Health tab visually reflects the reconciled state.

## 2026-05-10 14:09 KST - Project Health Hardening Priority Fixes

- Request: Identify the priority order among the four remaining workflow-health issues and resolve them one by one.
- Priority: P0 account-pool auth artifact validation, P0 stale-assignment cleanup race guard, P1 QA Hold evidence-gap precision, and P2 operator evidence input UX.
- Change: Added provider-specific auth artifact checks for Codex/Gemini/Jules account pools, reused legacy profile-home normalization in project health checks, made stale-assignment cleanup report only rows actually cleared, narrowed QA Hold detection to require both a hold signal and an evidence-gap signal, and added operator-supplied commit/note evidence fields to Project Health actions.
- Changed files: `server/modules/workflow/agents/cli-account-pool-env.ts`, `server/modules/routes/core/projects.ts`, `server/modules/routes/core/projects.health.test.ts`, `server/modules/workflow/agents/cli-runtime.account-pool.test.ts`, `src/components/project-manager/ProjectHealthPanel.tsx`, `src/components/project-manager/ProjectInsightsPanel.test.tsx`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:api -- projects.health execution-path-gate cli-runtime.account-pool`, `corepack pnpm test:web -- ProjectInsightsPanel`, `corepack pnpm build`, `git diff --check`.
- Validation: API regression passed with 3 files and 24 tests; ProjectInsightsPanel web tests passed with 4 tests; production build passed; diff whitespace check passed with only the existing CRLF normalization warning for `server/modules/routes/core/projects.ts`.
- Risk: Auth artifact markers are conservative and provider-specific. If a future provider stores OAuth material under a different canonical path, the marker list must be extended before marking the pool executable.
- Follow-up: Restart the active DonggriCompany server/UI before validating the Health tab in the running app.

## 2026-05-10 14:43 KST - Gemini Pro Remaining Project Health Review Follow-up

- Request: Use Gemini CLI Pro to perform a full remaining-issue review, create an analysis report, and fix the actionable findings.
- Gemini: Ran `gemini-3.1-pro-preview` through `scripts/run-gemini-pro-analysis.ps1`; fallback to `gemini-2.5-pro` was not needed. Gemini scored the patch at 85/100 before follow-up fixes and identified P0/P1/P2 action items.
- Change: Generated a transient Gemini review prompt/report for local analysis and removed those files from the commit scope, tightened orphan recovery so `requeue` only accepts true orphan candidates while `supersede` can close path-blocked pending tasks with evidence, rejected already closed tasks in the recovery route, broadcasted task/agent updates after Project Health recovery/approval/stale-cleanup actions, and collapsed workflow metadata writes into the main task status update.
- Changed files: `server/modules/routes/core.ts`, `server/modules/routes/core/projects.ts`, `server/modules/routes/core/projects.health.test.ts`, `docs/QUALITY_LOG.md`.
- Commands: `gemini --version`, `.\scripts\run-gemini-pro-analysis.ps1 -PromptFile '.\docs\analysis\GEMINI_PRO_PROJECT_HEALTH_REMAINING_REVIEW_PROMPT_2026-05-10.md' -OutputPath '.\docs\analysis\GEMINI_PRO_PROJECT_HEALTH_REMAINING_REVIEW_2026-05-10.md' -PrimaryModel 'gemini-3.1-pro-preview' -FallbackModel 'gemini-2.5-pro' -TimeoutSeconds 1200`, `corepack pnpm test:api -- projects.health execution-path-gate cli-runtime.account-pool`, `corepack pnpm test:web -- ProjectInsightsPanel`, `corepack pnpm build`, `git diff --check`.
- Validation: Gemini CLI version `0.41.2` was available; Gemini Pro report generation completed with `PrimaryCapacity429=False` and `FallbackUsed=False`; API regression passed with 3 files and 26 tests; ProjectInsightsPanel web regression passed with 4 tests; production build passed; diff whitespace check passed with only the existing CRLF normalization warning for `server/modules/routes/core/projects.ts`.
- Risk: The generated Gemini report was produced through the CLI and may render Korean poorly in some PowerShell consoles, but the actionable findings were interpreted and cross-checked against the code before implementation.
- Follow-up: Per-task evidence input scoping in the Project Health panel remains a UX refinement candidate, not a commit blocker.

## 2026-05-10 14:52 KST - DORO Noise Cleanup and Project Health Evidence UX

- Request: Resolve the remaining dirty `agents/qa/DORO/*` files and handle the remaining follow-up improvement.
- Change: Reverted DORO timestamp-only noise in `.DORO_settings.json` and `DORO_AGENTS.md`; moved Project Health evidence commit/note inputs from global panel state to per-task card state so review approval and supersede actions cannot accidentally share evidence across different tasks; fixed a `src/api/memory.ts` import-order lint warning found during final completeness checks.
- Changed files: `agents/qa/DORO/.DORO_settings.json`, `agents/qa/DORO/DORO_AGENTS.md`, `src/components/project-manager/ProjectHealthPanel.tsx`, `src/components/project-manager/ProjectInsightsPanel.test.tsx`, `src/api/memory.ts`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:web -- ProjectInsightsPanel`, `corepack pnpm test:api -- projects.health execution-path-gate cli-runtime.account-pool`, `corepack pnpm lint`, `corepack pnpm build`, `git diff --check`.
- Validation: DORO files no longer appear in `git status --short`; ProjectInsightsPanel web tests passed with 4 tests; API regression passed with 3 files and 26 tests; lint passed with 0 errors and 0 warnings after import-order cleanup; production build passed; diff whitespace check passed with only the existing CRLF normalization warning for `server/modules/routes/core/projects.ts`.
- Risk: Evidence inputs now appear on every actionable health card, which is safer for operations but slightly denser visually.
- Follow-up: Restart the active server/UI before browser smoke testing the Health tab.

## 2026-05-10 18:49 KST - Project Health 98-Point Hardening Gate

- Request: Raise the completion score from 94 to 98 by removing commit-time quality risks without adding new product scope.
- Change: Normalized `server/modules/routes/core/projects.ts` to LF, documented Project Health endpoints in `docs/openapi.json`, added a health-log priority ordering so later policy snapshot logs do not hide `project_path_not_allowed` evidence, and verified the Project Health tab through a real e2e UI smoke. Transient Gemini/report files and smoke screenshots were kept out of commit scope.
- Changed files: `server/modules/routes/core/projects.ts`, `server/modules/routes/core/projects.health.test.ts`, `docs/openapi.json`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm openapi:sync`, `corepack pnpm openapi:check`, manual Playwright smoke against `corepack pnpm dev:e2e`, `corepack pnpm lint`, `corepack pnpm test:api -- projects.health execution-path-gate cli-runtime.account-pool`, `corepack pnpm test:web -- ProjectInsightsPanel`, `corepack pnpm test:e2e -- smoke.spec.ts`, `corepack pnpm build`, `git diff --check`.
- Validation: OpenAPI check passed with 115 operations; manual Project Health UI smoke rendered the Health panel, separate per-task commit/note inputs, supersede/review/stale cleanup buttons, and path-blocked evidence card with no horizontal overflow and no browser console/page errors; API regression passed with 3 files and 26 tests; ProjectInsightsPanel web tests passed with 4 tests; e2e smoke passed; lint passed; production build passed; `git diff --check` passed with no CRLF/whitespace warnings.
- Risk: The visual smoke used an isolated `.tmp/e2e-runtime` database and did not mutate the production 8900 server. Runtime screenshot `.tmp/project-health-smoke.png` is intentionally untracked.
- Follow-up: After commit/deploy, restart the active DonggriCompany server and run the same Health tab smoke against the live operator UI.

## 2026-05-10 19:40 KST - Project Health E2E Action Automation

- Request: Start the remaining 100-point gap with item 1, converting the Project Health manual smoke into an automated e2e spec.
- Change: Added `tests/e2e/project-health.spec.ts` to seed an isolated Project Health fixture, navigate through TaskBoard to Project Manager Health, verify per-task evidence inputs and operator buttons, detect horizontal overflow/console errors, and execute stale cleanup, review approval, path-blocked supersede, and orphan requeue actions through the actual UI.
- Changed files: `tests/e2e/project-health.spec.ts`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:e2e -- project-health.spec.ts`, `corepack pnpm test:api -- projects.health`, `corepack pnpm test:web -- ProjectInsightsPanel`, `git diff --check`.
- Validation: Project Health e2e passed with 1 browser test; API health tests passed with 11 tests; ProjectInsightsPanel web tests passed with 4 tests; `git diff --check` passed. Agent guide file rewrites generated by the e2e dev server were restored and are not in the commit scope.
- Risk: This closes the automated e2e evidence gap for isolated runtime. The remaining 1 point is live operator server validation after restarting the active 8900 server.
- Follow-up: Run the same Health tab smoke against the live DonggriCompany server and record the live result.

## 2026-05-10 19:51 KST - Live 8900 Project Health Operator Smoke

- Request: Complete the last 1-point gap by validating the Project Health UI on the active 8900 operator server.
- Change: Rebuilt and restarted the `donggricompany` Docker service with the current workspace code, then ran a read-only Playwright smoke against `http://127.0.0.1:8900` without mutating live project state.
- Changed files: `docs/QUALITY_LOG.md`.
- Commands: `docker compose up -d --build donggricompany`, `Invoke-WebRequest http://127.0.0.1:8900/api/health`, live Playwright smoke against TaskBoard -> Project Manager -> Health, `docker compose ps`, `git diff --check`.
- Validation: Docker image build completed, container restarted and reported `healthy`; `/api/health` returned HTTP 200; live UI loaded with no browser console/page errors; selected live project `PMO Calculation E2E 1776946257` rendered the Project Health panel on 8900; panel showed `total_tasks=8`, `open_tasks=7`, `review_waiting=4`, `orphan_candidates=0`, `stale_assignments=0`, evidence inputs and review approval buttons rendered, and both panel/page horizontal overflow checks passed. Screenshot `.tmp/live-8900-health.png` is intentionally untracked.
- Risk: The live smoke is read-only, so it verifies rendering and operator action availability but does not approve/cancel real production tasks.
- Follow-up: Commit and push the verified change set after final staged diff review.

## 2026-05-10 20:26 KST - Project Health Telegram Action Notices

- Request: Resolve why Telegram messages did not arrive while Project Health appeared to be working.
- Root cause: Telegram session delivery was available, but Project Health repair/approval/cleanup actions only updated DB/UI state and did not publish a messenger notification after successful actions. The previous live smoke was also intentionally read-only, so no action notification could be produced.
- Change: Added a Project Health action notification contract and wired orphan requeue, supersede, review approval, and stale-assignment cleanup success paths to `telegram:global` through the existing messenger session sender. Notification failures are isolated: the action still succeeds and a warning task log is written for audit.
- Changed files: `server/modules/routes/core.ts`, `server/modules/routes/core/projects.ts`, `server/modules/routes/core/projects.health.test.ts`, `docs/QUALITY_LOG.md`.
- Commands: `corepack pnpm test:api -- projects.health`, `corepack pnpm test:web -- ProjectInsightsPanel`, `corepack pnpm build`, `git diff --check`.
- Validation: Project Health API tests passed with 11 tests and now assert notification callback payloads for requeue, supersede, review approval, and stale cleanup; ProjectInsightsPanel web tests passed with 4 tests; production build passed; whitespace diff check passed.
- Risk: The implementation sends to the global Telegram session, not department-specific bot sessions. Department-level routing remains a separate follow-up if the desired behavior is per-department Telegram fan-out.
- Follow-up: Restart the active DonggriCompany server before expecting live Project Health action notices from the operator UI.

## 2026-05-10 20:42 KST - Live 8900 Restart and Telegram Verification

- Request: Restart the active server, commit, push, and reflect the latest Project Health notification changes.
- Change: Rebuilt and restarted the `donggricompany` Docker service from the current workspace and verified the live messenger path from inside the running container.
- Changed files: `docs/QUALITY_LOG.md`.
- Commands: `docker compose up -d --build donggricompany`, `docker compose ps donggricompany`, `Invoke-WebRequest http://127.0.0.1:8900/api/health`, container `sendMessengerSessionMessage('telegram:global', ...)`, `git diff --check`.
- Validation: Docker rebuild completed; container restarted and reached `healthy`; `/api/health` returned HTTP 200; live container Telegram send returned `telegram_send_ok`.
- Risk: This verification confirms global Telegram session delivery. Actual Project Health action notices are produced when an operator performs a repair/approval/cleanup action.
- Follow-up: Commit and push the verified change set.
