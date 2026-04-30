<!-- BEGIN claw-empire orchestration rules -->
# Claw-Empire Orchestration Rules

이 파일은 `D:\Donggri_Platform\DonggriCompany` 전용 운영 규칙이다. 다른 프로젝트의 `AGENTS.md`, Codex 홈, 자동화 설정과 섞지 않는다.

## 언어와 출력

- 사용자의 마지막 메시지 언어를 따른다. 한국어 요청에는 한국어로 답한다.
- UI, 토스트, 운영 메시지는 한국어를 기본 표시 언어로 고정한다.
- 내부 key, API payload, DB canonical 값, AGENTS/Skills/Module MD 산출물은 영어 canonical로 저장한다.
- PowerShell 기준으로 실행 가능한 명령을 제시한다.
- 비밀값, 토큰, OAuth 코드, `.env` 원문, multi-auth storage 내용은 출력하지 않는다.
- 모르는 내용을 성공 처리하지 않는다. 확인 가능한 로그, 테스트, CI, API 응답을 먼저 확보한다.

## 기본 Skill Bootstrap

`TASTE_SKILL_DEFAULT_V1`

- 비단순 구현 작업에서는 `tools/taste-skill/skill.md`가 있으면 먼저 확인한다.
- 로컬 파일이 없으면 원격에서 자동 다운로드하지 않고 프로젝트 규칙만 따른다.
- 기존 프로젝트 규칙과 skill은 삭제하지 않는다. 이 규칙은 additive다.

## 작업 관리

- 비단순 작업은 먼저 `update_plan`으로 단계와 검증 기준을 잡는다.
- 장기 계획과 완료/검토 결과는 `tasks/todo.md`에 남긴다.
- 반복 실수나 사용자 교정은 `tasks/lessons.md`에 예방 규칙으로 남긴다.
- 구현 완료 판정은 테스트, 빌드, smoke, CI 같은 증거 기반으로만 한다.
- 임시 경로나 fabricated path를 만들지 않는다. 프로젝트 경로가 필요하면 사용자에게 확인한다.

## Git 안전 규칙

- 사용자가 명시적으로 요청한 경우에만 commit/push한다.
- 커밋 전 최소 `git diff --check`, 관련 테스트, 빌드를 통과해야 한다.
- `.env`, token, DB, backup, auth storage, Codex home, multi-auth 파일은 절대 커밋하지 않는다.
- 원격과 충돌하면 force push하지 않는다. `git pull --rebase origin main` 후 재검증한다.

## 프로젝트 경계

- 작업 루트: `D:\Donggri_Platform\DonggriCompany`
- 전용 Codex 홈: `D:\Donggri_Platform\.codex-homes\DonggriCompany`
- 실행 래퍼: `scripts\codex-donggricompany.ps1`
- 기본 서버: `http://127.0.0.1:8900`
- 레거시 문서나 예시에서 `8790`이 나오면 현재 Docker 운영 기준 `8900`으로 확인 후 사용한다.

## Canonical 7부서

기본 조직은 아래 7부서로 고정한다. 신규 저장값은 이 ID만 사용한다.

| ID | 한국어 표시 | 책임 |
| --- | --- | --- |
| `pmo` | PMO | CEO 지시 정리, 부서 분배, chair, 품질 증거 관리 |
| `planning` | 기획 | 요구사항, 설계, 아키텍처, 티켓 분해 |
| `dev` | 개발 | 프론트엔드/백엔드 구현, 테스트 작성, Codex worker 실행 |
| `design` | 디자인 | UI/UX, 화면 흐름, 접근성, 시각 품질 |
| `qa` | QA | 회귀 검증, ISO/IEC 25010 품질 특성 점검 |
| `devsecops` | DevSecOps | 보안, CI/CD, 릴리스, 배포 게이트 |
| `operations` | 운영 | 상태 모니터링, 문서, 리서치, 주간 스킬/모듈 보고 |

Legacy alias는 읽기/마이그레이션 호환용으로만 허용한다.

| Legacy | Canonical |
| --- | --- |
| `planning-architecture` | `planning` |
| `development` | `dev` |
| `ui-ux` | `design` |
| `cicd-repo` | `devsecops` |
| `security-approval` | `devsecops` |
| `management` | `operations` |
| `knowledge-docs` | `operations` |
| `api-research` | `operations` |
| `bloggent` | `operations` |

## Goal Command 운영 규칙

- 업무 등록 UI의 목표별 선택은 Donggri 전용 `/dg-*` 명령만 사용한다.
- `/octo-*` alias는 사용하지 않는다. Claude Octopus는 제품 패턴 참고용이며 코드는 복사하지 않는다.
- 내부 저장값은 영어 canonical만 허용한다: `goal_command`, `team_preset`, `workflow_pack_key`, `required_departments`, `max_parallel_workstreams`.
- UI 표시는 한국어 dictionary로만 렌더링한다.

| 명령 | 표시 | canonical |
| --- | --- | --- |
| `/dg-feature` | 완전 개발 | `feature`, `full_delivery` |
| `/dg-fix` | 버그 수정 | `fix`, `bugfix_response` |
| `/dg-review` | 코드/품질 리뷰 | `review`, `multi_review` |
| `/dg-debug` | 디버깅 | `debug`, `incident_debug` |
| `/dg-refactor` | 리팩터링 | `refactor`, `refactor_lane` |
| `/dg-design` | 디자인/UI | `design`, `design_delivery` |
| `/dg-research` | 조사/분석 | `research`, `research_report` |
| `/dg-security` | 보안 점검 | `security`, `security_gate` |
| `/dg-docs` | 문서/보고 | `docs`, `documentation` |
| `/dg-release` | 릴리스/PR/CI | `release`, `release_gate` |

## Gemini/Codex 하이브리드 라우팅 규칙

- 에이전트별 모델 override를 만들지 않는다. 모델 선택은 중앙 `provider execution policy`와 `task/workflow inferred policy`로만 결정한다.
- `Gemini Pro` 계열은 복잡한 설계, 대규모 맥락 분석, supervisor review, PMO/Planning 판단에 우선 사용한다.
- `Gemini Flash` 계열은 라우팅, 의도 분류, 로그 파싱, 요약, 정적 workflow preset 선택에 우선 사용한다.
- `Codex`는 실제 파일 편집, 테스트 작성, 리팩터링, PR diff 준비를 담당하는 worker로 우선 사용한다.
- Pro 가용 시 `dynamic_supervisor` 모드로 PMO/Planning이 subtasks를 쪼개고 Codex worker 결과를 리뷰한다.
- Flash 전용 또는 예산 초과 시 `static_workflow_preset` 모드로 제한한다. Flash는 preset 선택과 요약만 수행하고 파일 수정은 Codex가 담당한다.
- 토큰/예산/할당량이 임계치를 넘으면 Pro 사용을 중지하고 Flash preset 모드로 전환하는 circuit breaker를 적용한다.
- 모든 라우팅 결정은 `policy_version`, `model_tier`, `provider`, `selected_by`, `fallback_reason`을 로그와 task metadata에 남긴다.

## A2A 통신 규격

에이전트 간 메시지는 자유문 대신 아래 JSON 의미를 유지한다.

```json
{
  "goal": "canonical task goal",
  "project_id": "project id",
  "project_path": "absolute path",
  "preconditions": ["required artifact or state"],
  "inputs": ["documents, diffs, logs"],
  "expected_outputs": ["patch, report, test evidence"],
  "quality_gates": ["format", "lint", "test", "build", "security"],
  "handoff_notes": "short Korean user-facing summary"
}
```

## ISO 9001 / ISO/IEC 25010 품질 규칙

- ISO 9001 인증을 주장하지 않는다. 대신 QMS-ready 증거를 남긴다.
- ISO 9001 기준 증거: 요구사항, 변경요청, 승인, 검증결과, 배포기록, 시정조치, 내부감사 기록.
- ISO/IEC 25010 기준 점검축: 기능 적합성, 성능 효율성, 호환성, 사용성, 신뢰성, 보안성, 유지보수성, 이식성, 유연성.
- 모든 주요 변경은 다음 중 해당 증거를 남긴다: `tasks/todo.md`, task report, CI URL, test output, PR/commit hash, smoke screenshot.
- 실패가 발생하면 원인, 재현, 수정, 회귀 방지 항목을 `tasks/lessons.md` 또는 task report에 남긴다.

## 병목 방지 규칙

- 모든 부서를 기본 소집하지 않는다. goal command의 `required_departments`를 1차 범위로 사용한다.
- 검증 게이트가 필요할 때만 `qa` 또는 `devsecops`를 추가한다.
- 독립 작업은 `max_parallel_workstreams` 범위 안에서 병렬화하되, workstream마다 단일 책임자를 둔다.
- Planned 회의는 실행 가능한 subtask와 검증 증거를 만드는 용도다. 회의 발언 자체가 산출물이 되면 안 된다.
- PMO는 병목이 생기면 회의를 늘리지 말고 범위를 줄이거나 workstream을 쪼갠다.

## Memory / Growth 운영 규칙

- 장기기억의 기본 source of truth는 Donggri SQLite memory다.
- Beads는 프로젝트에 `bd`와 `.beads`가 있을 때만 선택 연동한다. 자동 설치나 자동 `bd init`은 하지 않는다.
- Beads 쓰기 명령은 `beadsWriteEnabled=true`일 때만 허용한다.
- 작업 시작 프롬프트에는 프로젝트 기억, 담당 에이전트 경험, 추천 skill 이력을 주입한다.
- 작업 완료 시 task result, workflow metadata, agent id, project id를 기반으로 memory, skill usage, growth event를 갱신한다.
- AGENTS 번들은 영어 섹션명 `Memory Snapshot`, `Skill Growth Snapshot`, `Recent Lessons`, `Project Experience`를 유지한다.

## Skill / Module 주간 운영

- 주 1회 `skills.sh`, OpenAI/Codex, Gemini, NotebookLM 공식 문서, GitHub OSS 후보, 커뮤니티 후보를 조사한다.
- 결과물은 `주간 스킬·모듈 보고서`, `추천 신규 skill 초안`, `추천 신규 module 초안`, `리스크/라이선스 검토`로 남긴다.
- 자동 설치, 자동 커밋, 자동 배포는 금지한다. 사용자가 승인한 항목만 registry에 반영한다.
- 성공한 해결 방식은 다음 유사 태스크에서 관련 Skill을 1순위로 참조한다.
- Module은 프로젝트에 적용 가능한 기능 패키지다. Skill과 섞지 않는다.

## `$` CEO 지시 처리

`$`로 시작하는 메시지는 CEO 지시다. 직접 구현하지 말고 프로젝트 바인딩 후 `/api/inbox`로 전달한다.

### 1. 프로젝트 확인

먼저 질문한다.

```text
기존 프로젝트인가요? 신규 프로젝트인가요?
```

기존 프로젝트면 최근 프로젝트를 조회한다.

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/projects?page=1&page_size=10"
```

신규 프로젝트면 이름, 절대 경로, core goal을 받아 먼저 프로젝트를 생성한다.

### 2. 회의 여부 확인

```text
팀장 소집 회의를 진행할까요?
1. 회의 진행 (PMO 주관)
2. 회의 없이 바로 실행
```

### 3. Inbox secret 확인

`INBOX_WEBHOOK_SECRET`이 없으면 성공 처리하지 않는다.

```powershell
$secret = $env:INBOX_WEBHOOK_SECRET
if (-not $secret -and (Test-Path .env)) {
  $line = Get-Content .env | Where-Object { $_ -match '^INBOX_WEBHOOK_SECRET\s*=' } | Select-Object -First 1
  if ($line) { $secret = ($line -replace '^INBOX_WEBHOOK_SECRET\s*=\s*', '').Trim('"', "'") }
}
if (-not $secret -or $secret -eq '__CHANGE_ME__') { throw 'INBOX_WEBHOOK_SECRET is missing.' }
```

### 4. UTF-8 bytes로 전송

```powershell
$payload = @{
  source = 'telegram'
  text = '$<지시문>'
  author = 'user'
  agent_rules_version = 2
  project_id = '<project id>'
  project_path = '<absolute project path>'
  project_context = '<project core goal>'
}
$json = $payload | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
Invoke-RestMethod -Uri 'http://127.0.0.1:8900/api/inbox' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Headers @{ 'x-inbox-secret' = $secret } `
  -Body $bytes
```

회의 생략 시 payload에 아래 필드만 추가한다.

```powershell
skipPlannedMeeting = $true
```

성공 응답일 때만 짧게 답한다.

```text
Claw-Empire 업무지시 전달 완료
```

## `#` 태스크 처리

`#`로 시작하는 메시지는 태스크 등록이다. 직접 구현하지 말고 task board에 등록한다.

```powershell
$payload = @{ source = 'telegram'; text = '<message without #>' }
$json = $payload | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
Invoke-RestMethod -Uri 'http://127.0.0.1:8900/api/inbox' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Headers @{ 'x-inbox-secret' = $secret } `
  -Body $bytes
```

응답은 아래 한 줄만 사용한다.

```text
태스크 등록 완료
```

## project_path 규칙

- task에 `project_path`가 있으면 그 경로를 사용한다.
- 없으면 지시문에서 명시된 절대 경로를 추출한다.
- 둘 다 없으면 임시 경로를 만들지 말고 사용자에게 물어본다.
- `/tmp`, Desktop 임의 경로, fabricated path 금지.

## 검증 명령

범위에 맞게 좁은 검증부터 실행하고, 릴리스 전에는 전체 게이트를 실행한다.

```powershell
git diff --check
corepack pnpm run format:check
corepack pnpm run lint
corepack pnpm run openapi:check
corepack pnpm exec tsc -p tsconfig.json --noEmit
corepack pnpm run build
corepack pnpm run test:ci
```

Docker 운영 smoke:

```powershell
docker compose up -d --build
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/health" | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/departments" | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/skills" | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/modules" | ConvertTo-Json -Depth 3
```

## 완료 보고 규칙

- 완료 보고는 변경 요약, 검증 결과, 남은 리스크만 말한다.
- 실패 시 상태 코드, 실패 단계, 다음 조치만 말한다.
- OAuth 상세, 토큰, raw secret, provider 내부 저장 경로는 말하지 않는다.

<!-- END claw-empire orchestration rules -->
