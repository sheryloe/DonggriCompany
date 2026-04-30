# Claw-Empire 초자동화 20단계 딥다이브 로드맵

기준일: 2026-05-01

## 목적

이 문서는 Claw-Empire/DonggriCompany를 ISO 9001 QMS-ready 운영 체계와 ISO/IEC 25010 소프트웨어 품질 모델에 맞춰 성장시키기 위한 실행형 로드맵이다.

핵심 원칙:

- UI/토스트/운영 메시지는 한국어 고정
- 내부 key/API/DB/MD 산출물은 영어 canonical
- Gemini Pro/Flash는 supervisor/router 역할, Codex는 worker 역할
- 자동 실행보다 증거, 승인, 추적성을 우선
- ISO 인증을 주장하지 않고 심사 대응 가능한 증거 체계를 구축

## 공식 근거

- [OpenAI Codex](https://openai.com/codex/)
- [Google Gemini API Models](https://ai.google.dev/gemini-api/docs/models)
- [Google Gemini API Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [ISO 9001:2015](https://www.iso.org/standard/62085.html)
- [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html)

## 품질 기준 매핑

| 기준 | Donggri 적용 |
| --- | --- |
| ISO 9001 문서화 | `AGENTS.md`, task report, CI log, smoke evidence, weekly report |
| ISO 9001 변경관리 | task board, approval gate, commit hash, CI URL |
| ISO 9001 내부감사 | 주간 스킬/모듈 보고서, 실패/시정조치 기록 |
| ISO/IEC 25010 기능 적합성 | OpenAPI contract, task acceptance criteria |
| ISO/IEC 25010 신뢰성 | test:ci, e2e, retry/fallback evidence |
| ISO/IEC 25010 보안성 | secret scan, OAuth redaction, DevSecOps gate |
| ISO/IEC 25010 유지보수성 | canonical 7부서, central routing policy, module registry |

## Phase 1. 품질 규격화 및 인프라 기반

### Step 1. ISO 9001 기반 문서화 및 거버넌스 자동화

- 목표: 모든 에이전트 행동이 변경요청, 실행, 검증, 승인 기록으로 추적되게 한다.
- 구현:
  - `AGENTS.md`를 운영 rule source로 유지
  - 주요 작업마다 task report와 검증 로그 저장
  - 실패 시 `tasks/lessons.md`에 예방 규칙 기록
- 리스크: 과도한 로그로 토큰/스토리지 비용 증가
- 완화: summary-first, 원문 로그는 task terminal/history로 분리

### Step 2. ISO/IEC 25010 대응 QC 파이프라인

- 목표: 신뢰성, 보안성, 유지보수성을 자동 게이트로 보장한다.
- 구현:
  - GitHub Actions에 format, lint, OpenAPI, typecheck, build, test:ci 유지
  - Unicode/bidi workflow guard 유지
  - release gate에 smoke evidence 링크 요구
- 리스크: CI 대기 시간 증가
- 완화: 로컬 targeted test -> 전체 CI 순서로 운영

### Step 3. 모델 티어링 아키텍처

- 목표: 모델별 강점을 역할로 분리한다.
- 운영 규칙:
  - `Gemini Pro`: supervisor, architecture, large-context review
  - `Gemini Flash`: router, summarizer, log parser, static preset selector
  - `Codex`: code editing, tests, refactoring, PR diff
- 산출물:
  - `policy_version`
  - `model_tier`
  - `provider`
  - `selected_by`
  - `fallback_reason`

### Step 4. A2A 통신 규격 표준화

- 목표: 모델이 달라도 오해 없는 handoff payload를 사용한다.
- 구현:
  - goal, preconditions, inputs, expected_outputs, quality_gates, handoff_notes를 갖는 JSON envelope 사용
  - free-form 회의 발언은 user-facing summary로만 제한

## Phase 2. Gemini/Codex 하이브리드 동적 라우팅

### Step 5. Gemini Pro 가용 시 Dynamic Supervisor 모드

- 목표: Pro가 PMO/Planning supervisor로 subtask를 쪼개고 Codex worker 결과를 리뷰한다.
- 적용 조건:
  - 대규모 리팩터링
  - 아키텍처 변경
  - 보안/품질 영향이 큰 변경
  - context window가 큰 분석
- 금지:
  - Pro가 직접 임의 파일 수정 경로를 우회하지 않는다.

### Step 6. Gemini Flash 전용 시 Static Workflow Preset 모드

- 목표: Pro 없이도 안정적인 결과를 낸다.
- 적용 조건:
  - 예산 초과
  - Pro quota 부족
  - 단순 라우팅/요약/로그 분석
- 구현:
  - Flash는 workflow preset만 선택
  - Codex가 구현
  - QA/DevSecOps gate가 결과 확인

### Step 7. Codex 전문화 및 worker 격리

- 목표: 파일 수정 안정성을 높인다.
- 구현:
  - Codex worker는 worktree 또는 sandbox 경로에서 작업
  - 테스트 통과 전 main 반영 금지
  - diff, test evidence, rollback note 생성

### Step 8. Dynamic Fallback 알고리즘

- 목표: 예산/할당량/장애 상황에서 자동 downgrade한다.
- 구현 후보:
  - quota 상태 수집
  - cost budget threshold
  - provider health
  - fallback mode: `dynamic_supervisor` -> `static_workflow_preset`
- 금지:
  - 실패를 숨기고 성공 처리하지 않는다.

## Phase 3. 부서별 SOTA 오케스트레이션

### Step 9. Planning 부서: 컨텍스트 압축과 분배

- Pro 모드: 전체 문서/코드 맥락을 읽고 설계안을 만든다.
- Flash 모드: `docs/`, `STATUS.md`, `KANBAN.md`, `GANTT.md` 요약만 사용해 티켓 단위로 분해한다.

### Step 10. Dev 부서: TDD 오토마톤

- 목표: 테스트 우선 loop를 기본화한다.
- 구현:
  - supervisor가 실패 조건과 acceptance test 초안을 만든다.
  - Codex가 테스트 통과 구현을 수행한다.
  - QA가 regression evidence를 확인한다.

### Step 11. QA/DevSecOps: Zero Tolerance 검증

- 목표: 보안/품질 실패를 조기 차단한다.
- 구현:
  - secret scan
  - Unicode/bidi scan
  - OpenAPI contract
  - dependency risk review
  - auth/OAuth redaction check

### Step 12. Mind-Aware Management

- 목표: 병목, 충돌, context drift를 감지한다.
- v1 범위:
  - task age
  - failing test count
  - repeated handoff count
  - agent overload
- Pro 전용:
  - workstream rebalance recommendation

## Phase 4. 컨텍스트 공유 및 자율 성장

### Step 13. Shared Vector Memory

- 목표: 부서 간 문서 전달 지연을 줄인다.
- v1:
  - SQLite memory source of truth
  - optional Beads bridge
- v2:
  - local vector index
  - semantic retrieval
  - memory confidence decay

### Step 14. Flash 전용 Summarization Chain

- 목표: Flash context 한계를 map-reduce 요약으로 보완한다.
- 구현:
  - logs chunking
  - chunk summary
  - final synthesis
  - Codex worker handoff

### Step 15. Lessons 자동화

- 목표: 실패를 개인 탓이 아닌 workflow 개선으로 전환한다.
- 구현:
  - 실패 task에서 root cause, missed gate, prevention rule 추출
  - `tasks/lessons.md`에 사람이 검토 가능한 초안 작성
  - 승인 전 자동 규칙 반영 금지

### Step 16. Skill Forcing Policy

- 목표: 검증된 방법론을 재사용한다.
- 구현:
  - 유사 태스크 탐지
  - 관련 skill 1순위 로딩
  - skill mismatch 시 reason 기록

## Phase 5. 통제 초자동화 및 UI/외부 확장

### Step 17. 통합 커맨드 팔레트와 관제소

- 목표: 터미널 없이 주요 작업을 제어한다.
- 구현:
  - Cmd/Ctrl+K command palette
  - model usage/cost chart
  - workflow status board
  - pending approval list

### Step 18. MCP 생태계 통합

- 목표: GitHub, Jira, Notion 등 외부 SaaS와 동기화한다.
- 원칙:
  - 공식 API/MCP 우선
  - OAuth scope 최소화
  - token 원문 비노출
  - 변경 전 preview

### Step 19. 모바일 원격 관제 및 Notification Center

- 목표: 외부 승인과 알림을 빠르게 처리한다.
- 구현:
  - WebSocket event stream
  - Telegram approval
  - mobile-friendly decision inbox
  - failure push

### Step 20. 24/7 선제적 자율 스캐너

- 목표: 유휴 시간에 기술 부채를 찾고 CEO 결재함에 올린다.
- 원칙:
  - 자동 수정은 draft까지만
  - 자동 commit/push 금지
  - DecisionInbox 승인 후 적용
  - 모든 결과에 evidence 첨부

## 실행 우선순위

| 우선순위 | 항목 | 이유 |
| --- | --- | --- |
| P0 | AGENTS/todo mojibake 제거 | 운영 규칙 자체가 깨져 있으면 모든 에이전트가 오판한다. |
| P1 | 모델 라우팅 decision log 강화 | Pro/Flash/Codex 혼합 운영의 추적성이 필요하다. |
| P2 | ISO 9001/25010 증거 매트릭스 자동화 | 품질 규격 대응의 핵심 증거다. |
| P3 | Flash summarization chain | 비용 효율과 context 제한 대응에 필요하다. |
| P4 | Skill forcing policy | 성공 패턴 재사용과 agent growth에 필요하다. |
| P5 | 자율 스캐너 draft mode | 24/7 자동화는 승인 게이트가 먼저 완성된 뒤 진행한다. |

## Definition of Done

- 저장값은 영어 canonical, 화면 표시는 한국어다.
- 변경은 task/report/commit/CI/smoke 중 최소 하나의 증거를 가진다.
- 실패 시 원인과 재발방지 규칙이 남는다.
- 자동 실행은 preview 또는 draft까지이며, 적용은 승인 기반이다.
- ISO 9001 인증을 주장하지 않고 QMS-ready 상태만 표기한다.
