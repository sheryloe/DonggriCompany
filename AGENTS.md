# DonggriCompany Agent Rules

이 파일은 `D:\Donggri_Platform\DonggriCompany` 전용 로컬 규칙이다. 다른 프로젝트 규칙, Codex 홈, automation과 섞지 않는다.

## 기본 응답 규칙

- 사용자의 마지막 메시지 언어를 따른다. 한국어면 한국어로 답한다.
- PowerShell 기준으로 실행 가능한 명령을 제시한다.
- 불필요한 설명보다 현재 상태, 실행한 일, 다음 액션을 우선한다.
- 비밀값, 토큰, OAuth 코드, `.env` 원문은 출력하지 않는다.
- 모르는 부분은 추측으로 성공 처리하지 말고, 확인 가능한 증거를 먼저 확보한다.

## 프로젝트 경계

- 작업 루트: `D:\Donggri_Platform\DonggriCompany`
- 전용 Codex 홈: `D:\Donggri_Platform\.codex-homes\DonggriCompany`
- 실행 래퍼: `scripts\codex-donggricompany.ps1`
- `AGENTS.md`는 repo root의 이 파일만 truth로 본다.
- 인증 풀은 로컬 Codex multi-auth를 공유할 수 있지만, 설정/세션/자동화 cwd는 이 프로젝트로 고정한다.

## 현재 운영 구조

### Canonical 조직

기본 조직은 11개 부서와 35명 seed 직원이다. 부팅 시 강제 reseed하지 않고, 명시적 canonical reset preview/apply로만 적용한다.

| ID | 한국어 이름 | 역할 |
| --- | --- | --- |
| `development` | 개발 | 프론트엔드/백엔드 구현 |
| `planning-architecture` | 기획 및 설계 | 요구사항, 설계, 아키텍처 |
| `ui-ux` | UI/UX | 화면 흐름, 인터랙션, 사용성 |
| `cicd-repo` | CI/CD 병합 | GitHub repo, branch, PR, merge, release |
| `management` | 관리 | 운영 상태, 작업 흐름 관리 |
| `pmo` | PMO | CEO 지시 정리, 부서 분배, chair |
| `qa` | QA | 검증, 회귀, 품질 기준 |
| `bloggent` | 블로그 | Bloggent CLI 기반 콘텐츠 운영 |
| `api-research` | API 전문 | 무료 토큰 범위 내 정보 수집/요약 |
| `security-approval` | 보안/승인 | auth, billing, production gate |
| `knowledge-docs` | 지식/문서 | STATUS, KANBAN, GANTT, DECISIONS 유지 |

### PMO chair 규칙

- CEO 지시는 PMO 팀장이 1순위 chair다.
- fallback은 `planning-architecture`, legacy `planning` 순서다.
- `acts_as_planning_leader`, legacy `planning`, `workflow_role`은 compatibility-only다.

### 텔레그램 보고 규칙

- 텔레그램은 단일 그룹방만 사용한다.
- 부서별 `chat_id` 라우팅은 runtime 결정 소스가 아니다.
- 모든 부서 보고는 동일 `sessionKey=telegram:global` / 동일 global target으로 전송한다.
- 부서 구분은 메시지 헤더로 한다.
- 표준 로그 키:
  - `messenger_relay_attempt`
  - `messenger_relay_success`
  - `messenger_relay_failed`
- 표준 라우팅 메타:
  - `route_kind=single_group_department_tag`
  - `routing_reason=global_group`
  - `department_id`
  - `task_id`
  - `message_type`

예시 헤더:

```text
[development][<task_id>][planned]
아리아 (개발팀장): 개발 관점에서는 계산 로직, 입력 검증, UI 연결을 우선 확인하겠습니다.
```

### Planned 회의 공개 발언 규칙

- Planned 회의는 PMO/기획 chair가 시작한다.
- 관련 부서와 필수 검증 부서는 각자 최소 1회 공개 발언해야 한다.
- 공개 발언은 `receiver_type="all"`로 저장되고 텔레그램 단일 그룹에 릴레이된다.
- 표준 로그 키:
  - `meeting_public_feedback`
  - `phase=planned`
  - `department_id`
  - `agent_id`

기본 포함 부서:

```text
pmo, planning-architecture, development, ui-ux, qa, knowledge-docs
```

조건부 포함 부서:

```text
cicd-repo, security-approval, api-research, bloggent, management
```

## `$` CEO 지시 처리

`$`로 시작하는 메시지는 CEO 지시다. 직접 구현하지 말고 프로젝트 바인딩 후 `/api/inbox`로 전달한다.

### 1. 프로젝트 확인

먼저 기존 프로젝트인지 신규 프로젝트인지 확정한다.

```text
기존 프로젝트인가요? 신규 프로젝트인가요?
```

기존 프로젝트면 최근 프로젝트를 조회한다.

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/projects?page=1&page_size=10"
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

PowerShell 예시:

```powershell
$secret = $env:INBOX_WEBHOOK_SECRET
if (-not $secret -and (Test-Path .env)) {
  $line = Get-Content .env | Where-Object { $_ -match '^INBOX_WEBHOOK_SECRET\s*=' } | Select-Object -First 1
  if ($line) { $secret = ($line -replace '^INBOX_WEBHOOK_SECRET\s*=\s*', '').Trim('"', "'") }
}
if (-not $secret -or $secret -eq '__CHANGE_ME__') { throw 'INBOX_WEBHOOK_SECRET is missing.' }
```

### 4. UTF-8 bytes로 전송

한국어가 깨지지 않도록 JSON 문자열을 UTF-8 bytes로 보낸다.

```powershell
$payload = @{
  source = 'telegram'
  text = '$기본적인 계산이 깔끔하게 만들어봐'
  author = 'user'
  agent_rules_version = 2
  project_id = '<project id>'
  project_path = '<absolute project path>'
  project_context = '<project core goal>'
}
$json = $payload | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
Invoke-RestMethod -Uri 'http://127.0.0.1:8790/api/inbox' `
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
Invoke-RestMethod -Uri 'http://127.0.0.1:8790/api/inbox' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Headers @{ 'x-inbox-secret' = $secret } `
  -Body $bytes
```

응답:

```text
태스크 등록 완료
```

## project_path 규칙

- task에 `project_path`가 있으면 그 경로를 사용한다.
- 없으면 지시문에서 명시된 절대 경로를 추출한다.
- 둘 다 없으면 임시 경로를 만들지 말고 사용자에게 물어본다.
- `/tmp`, Desktop 임의 경로, fabricated path 금지.

## 검증 규칙

완료 판정은 증거 기반으로 한다.

기본 게이트:

```powershell
corepack pnpm test
corepack pnpm build
docker compose up -d --build
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/health" | ConvertTo-Json -Compress
```

PMO E2E smoke 기준:

- task가 `project_id`와 `project_path`에 바인딩됨
- PMO/planning chair가 회의 시작
- 관련 부서 공개 발언이 `meeting_public_feedback`으로 남음
- 텔레그램 로그에 `single_group_department_tag`와 `messenger_relay_success`가 남음
- 한국어 본문이 mojibake 없이 저장/전송됨

## Git 규칙

- 사용자가 명시적으로 요청한 경우에만 commit/push한다.
- `.env`, token, DB, backup, multi-auth storage는 절대 commit하지 않는다.
- 커밋 전 `corepack pnpm test`, `corepack pnpm build`, health smoke 중 요청 범위에 맞는 검증을 통과해야 한다.

<!-- END DonggriCompany Agent Rules -->
