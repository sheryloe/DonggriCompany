# TODO

## Donggri VSCode + Subagents 통합 안정화 (2026-04-14)

- [x] 유지 범위를 `extensions/donggri-vscode`와 subagents/agent 구조 개편으로 고정
- [x] `review-revert` 백업 생성: `.tmp/review-revert-backup.patch`
- [x] `review-revert` untracked 백업 생성: `.tmp/review-revert-untracked/`
- [x] unrelated 변경 1차 정리
- [x] VSCode 확장 F5 실행 경로 고정
- [x] subagents/agent 정책 정합성 반영
- [x] 기본 테스트 및 smoke 검증
- [x] 유지 범위만 스테이징

## 기능 오류 · 한글 깨짐 · 프로필 인증 감사 후속 작업 (2026-04-15)

- [x] `AgentManager.agent-profile` 웹 테스트 mock 누락 수정
- [x] 변경분 기준 UTF-8 문자열 깨짐 정리
- [x] agent role 검증 테스트 보강
- [x] 인증 게이트 테스트 보강
- [x] 서버 재시작 후 runtime smoke 검증
- [x] 최종 스테이징 정리

## 유지 범위

- `extensions/donggri-vscode/**`
- `agents/**`
- `docs/agents/**`
- `tools/agents/**`
- `scripts/{ensure-vitest-coverage-dir.mjs,run-vitest.mjs,sync-awesome-codex-subagents.mjs}`
- `server/modules/routes/core/agents/{crud.ts,crud.seed-filter.test.ts,agent-guide-files.ts,agent-guide-files.test.ts}`
- `server/modules/routes/ops.ts`
- `server/modules/routes/ops/subagents/**`
- `server/modules/workflow/agents/{agent-profile.ts,agent-profile.test.ts}`
- `server/modules/workflow/orchestration/{run-complete-handler.ts,run-complete-handler.video-review.test.ts}`
- `server/security/auth.test.ts`
- `src/{types/index.ts,agent-profile.ts,agent-profile.test.ts,api/workflow-skills-subtasks.ts,components/AgentManager.tsx}`
- `src/components/agent-manager/{constants.ts,AgentFormModal.test.tsx,SubagentsTab.tsx,SubagentsTab.test.tsx}`
- `src/components/AgentManager.agent-profile.test.tsx`
- `package.json`
- `.gitignore`
- `AgentSelectModels.md`

## 검증 결과

- Web
  - `corepack pnpm test:web -- src/agent-profile.test.ts src/components/agent-manager/AgentFormModal.test.tsx src/components/agent-manager/SubagentsTab.test.tsx src/components/AgentManager.agent-profile.test.tsx`
  - 결과: `4 files / 11 tests passed`

- API
  - `corepack pnpm test:api -- server/modules/workflow/agents/agent-profile.test.ts server/modules/routes/core/agents/agent-guide-files.test.ts server/modules/routes/core/agents/crud.seed-filter.test.ts server/modules/routes/ops/subagents/catalog-routes.test.ts server/security/auth.test.ts`
  - 결과: `5 files / 34 tests passed`

- 감사 메모
  - `invalid_role` 테스트는 기존 `POST/PATCH -> 400`으로 검증 완료
  - `intern` 입력은 `junior` 저장과 `agent_profile.role_template` 정규화까지 검증 완료
  - runtime smoke 결과: `/api/agents` unauth `401`, `/api/auth/session` `200`, 세션 후 `/api/agents` `200`, `/api/subagents/catalog` `200`
  - 로컬 현재 소스 서버를 `127.0.0.1:8790`에 직접 기동했고 `dbPath`는 `D:\Donggri_Platform\DonggriCompany\data\claw-empire.sqlite`
  - 추가 `invalid_role` probe도 `HTTP 400`으로 확인 완료

## Agent Skills 전체 카탈로그화 (2026-04-15)

- [x] `skills.sh` 홈 600개 제한 원인 확인
- [x] `/api/skills`를 sitemap 기반 전체 카탈로그 집계로 확장
- [x] `isRanked` 메타데이터와 기본 정렬 규칙 반영
- [x] `Agent Skills 문서고` 헤더 문구를 전체 카탈로그 기준으로 수정
- [x] 서버/프런트 테스트 추가 및 통과
- [x] 로컬 서버 재기동 후 runtime 총계 확인

## Agent Skills 검증 결과

- API
  - `corepack pnpm test:api -- server/modules/routes/ops/skills/catalog-routes.test.ts`
  - 결과: `1 file / 3 tests passed`

- Web
  - `corepack pnpm test:web -- src/components/SkillsLibrary.counts.test.tsx src/components/skills-library/model.sort.test.ts`
  - 결과: `2 files / 8 tests passed`

- Runtime smoke
  - 현재 로컬 서버 PID: `53836`
  - `/api/skills` 총계: `4047`
  - `/api/subagents/catalog` 총계: `136`
  - Docker 재시작 없이 `127.0.0.1:8790` 로컬 서버 반영 확인

## Repository P0 stabilization batch (2026-04-15)

- [x] Align provider policy runtime contract (`model`, `reasoningLevel`, `subModel`, `subModelReasoningLevel`)
- [x] Add CLI settings controls for main/sub model policy
- [x] Connect workflow pack policy editor tab
- [x] Add GitHub repo delete route and bootstrap rollback
- [x] Move VS Code API token handling to SecretStorage
- [x] Run targeted web/api/extension verification

## Full build stabilization batch (2026-04-15)

- [x] Recollect current `pnpm build` TypeScript errors
- [x] Fix remaining type mismatches and JSX parser blockers
- [x] Re-run `pnpm build` and targeted verification

## Bundle chunk optimization batch (2026-04-15)

- [x] Identify current Vite bundle warning source
- [x] Split heavy app views into lazy-loaded chunks
- [x] Re-run `pnpm build` and confirm warning removal

## Canonical company foundation batch (2026-04-15)

- [x] Add canonical company compiler/cache from `restructing` + `docs/agents`
- [x] Add specialization family mapping layer and canonical catalog projection
- [x] Bootstrap project-root PM artifacts and artifact state APIs
- [x] Add canonical policy / routing preview / reload routes
- [x] Wire canonical preview into main execution policy resolution path
- [x] Add read-only canonical inspector tab in Settings
- [x] Run full `pnpm test` and `pnpm build`

## Canonical redesign batch 2 (2026-04-15)

- [x] Add compiler strict-mode validation and remove fallback family resolution
- [x] Compile canonical pack profiles from `restructing` and downgrade seed packs to projection
- [x] Upgrade PM artifact manifest/schema to v2 with structured validation
- [x] Add artifact patch writer and task/project projection sync hooks
- [x] Extend DB schema for canonical agent/project/task identity fields
- [x] Add backfill-safe writes for new canonical fields in create/update routes
- [x] Run targeted api/web tests and full `pnpm build`

## Canonical redesign step 11 (2026-04-15)

- [x] Add canonical identity adapter for legacy agent rows
- [x] Make agent CRUD return and persist canonical identity fields first
- [x] Align shared web types and agent API payloads with canonical identity
- [x] Show resolved canonical identity in agent manager UI without breaking locale display
- [x] Run targeted agent CRUD/web tests and full `pnpm build`

## Canonical redesign step 12 (2026-04-15)

- [x] Add canonical snapshot archive and current-version pointer
- [x] Keep task `policy_version` pinned after creation and compat-bind legacy rows once
- [x] Pin execution sessions to task snapshot version/hash and reuse pinned policy
- [x] Store meeting policy version/hash on creation
- [x] Run targeted canonical/task/session tests and full `pnpm build`

## Canonical redesign steps 13-20 (2026-04-15)

- [x] Replace heuristic routing/provider resolution with canonical precedence engine
- [x] Swap meeting authority and delegation to family-first canonical rules
- [x] Cut legacy role / workflow role controls from CRUD and hybrid UI surfaces
- [x] Convert workflow pack and office pack flows to projection-only read models
- [x] Add regression coverage for routing, authority, delegation, UI, and pack cutover
- [x] Run full `pnpm test` and `pnpm build`

## Canonical redesign steps 13-20 verification (2026-04-15)

- API
  - `corepack pnpm test:api -- server/modules/workflow/agents/provider-policy-resolver.test.ts server/modules/routes/core/tasks/crud.workflow-pack-filter.test.ts server/modules/routes/core/agents/crud.seed-filter.test.ts server/modules/routes/collab/office-pack-agent-hydration.test.ts server/modules/workflow/orchestration/meetings/leader-selection.test.ts`
  - `corepack pnpm test:api -- server/modules/routes/collab/language-policy.test.ts server/modules/routes/collab/coordination/cross-dept-cooperation.test.ts`
  - `corepack pnpm test:api -- server/modules/workflow/orchestration/meetings/review-consensus.test.ts`
  - `corepack pnpm test:api -- server/modules/company/canonical-policy.test.ts server/modules/routes/ops/settings-stats.seed-init.test.ts server/modules/routes/core/tasks/execution-run-auto-assign.test.ts server/modules/routes/ops/messages/directive-leader-scope.test.ts`
  - result: targeted canonical routing/authority/delegation tests passed

- Web
  - `corepack pnpm test:web -- src/components/settings/ApiAssignModal.test.tsx src/components/settings/WorkflowPacksTab.test.tsx src/components/settings/CanonicalInspectorTab.test.tsx src/components/AgentManager.agent-profile.test.tsx src/components/agent-manager/AgentFormModal.test.tsx`
  - `corepack pnpm test:web -- src/components/settings/CanonicalInspectorTab.test.tsx src/components/settings/WorkflowPacksTab.test.tsx src/components/settings/useApiProvidersState.test.tsx src/components/agent-manager/AgentFormModal.test.tsx src/components/AgentManager.agent-profile.test.tsx src/app/office-workflow-pack.test.ts`
  - result: localized UI / inspector / projection-only tests passed

- Full regression
  - `corepack pnpm test`
  - `corepack pnpm build`
  - result: full regression and production build passed

## Session API auth integration batch (2026-04-22)

- [ ] Inspect session-auth mutation bootstrap gap
- [ ] Patch shared API client bootstrap/retry flow
- [ ] Run targeted web verification and record results
