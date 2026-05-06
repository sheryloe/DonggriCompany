# Claw-Empire 운영 매뉴얼 (오케스트레이터: CEO/팀장)

적용 버전: `v2.0.4`  
기본 주소: `http://127.0.0.1:8790`  
기본 전제: `ENFORCE_DIRECTIVE_PROJECT_BINDING=1` (기본값)

코드 기준 파일:
- `src/types/index.ts` (`TaskStatus` 타입)
- `server/modules/routes/ops/messages/directives-inbox-routes.ts` (`/api/inbox`, `$` 라우팅, 401/422/428/503 분기)
- `server/modules/routes/collab/task-delegation.ts` (`collaborating` 전환 로직)

## 1) 실행 전 준비

### 1-1. 필수 환경 점검
```powershell
Set-Location <PROJECT_ROOT>

node -v
pnpm -v

if (!(Test-Path .env)) {
  Copy-Item .env.example .env
}

Get-Content .env | Select-String -Pattern '^(PORT|HOST|INBOX_WEBHOOK_SECRET|ENFORCE_DIRECTIVE_PROJECT_BINDING)='
```

### 1-2. 공통 헬퍼 (복붙 후 그대로 사용)
```powershell
function Get-EnvValue {
  param(
    [string]$Path = ".env",
    [Parameter(Mandatory = $true)][string]$Key
  )
  if (!(Test-Path $Path)) { return $null }
  $line = Get-Content $Path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split "=", 2)[1].Trim().Trim("'").Trim('"'))
}

$BaseUrl = "http://127.0.0.1:8790"
$InboxSecret = Get-EnvValue -Key "INBOX_WEBHOOK_SECRET"

if ([string]::IsNullOrWhiteSpace($InboxSecret)) {
  throw "INBOX_WEBHOOK_SECRET 이 비어 있습니다. .env 값을 먼저 설정하세요."
}
```

### 1-3. 서버 기동 + 헬스체크
터미널 A:
```powershell
Set-Location <PROJECT_ROOT>
pnpm dev:local
```

터미널 B:
```powershell
$BaseUrl = "http://127.0.0.1:8790"
Invoke-RestMethod "$BaseUrl/api/health"
```

`ok=true` 또는 정상 JSON 응답이면 준비 완료다.

## 2) 전체 상태 맵

### 2-1. 상태 전이 요약
```text
inbox -> planned -> collaborating -> in_progress -> review -> done
planned/collaborating/in_progress/review -> pending
in_progress/review -> cancelled
pending/cancelled -> resume -> planned (또는 assignee 없으면 inbox)
```

### 2-2. 상태 정의 표
| 상태 | 의미 | 주요 진입 트리거 | 주요 이탈 트리거 |
|---|---|---|---|
| `inbox` | 접수됨, 미계획 | 신규 생성 기본값 | `assign` 또는 수동 `status=planned` |
| `planned` | 담당/계획 확정 | `/api/tasks/:id/assign`, 계획 단계 | `/api/tasks/:id/run` |
| `collaborating` | 부서 간 선행 협업 중 | 교차부서 협업 시작 시 서버가 자동 설정 | 실행 시작(`in_progress`) 또는 정지/대기(`pending`/`cancelled`) |
| `in_progress` | 실제 실행 중 | `/api/tasks/:id/run` | 완료 후 `review`/`done`, 또는 `stop` |
| `review` | 검토/회의 라운드 | 실행 결과 검토 단계 | `done` 또는 재작업 흐름 |
| `done` | 최종 완료 | 검토 통과 | 보관/리포트 대상 |
| `pending` | 일시중지 | `/api/tasks/:id/stop` + `mode=pause` | `/api/tasks/:id/resume` |
| `cancelled` | 취소 | `/api/tasks/:id/stop` 기본 모드 | `/api/tasks/:id/resume` 또는 신규 재생성 |

## 3) `$` CEO Directive 운영

### 3-1. 프로젝트 고정 (existing/new)
기존 프로젝트 10개 조회:
```powershell
$BaseUrl = "http://127.0.0.1:8790"
Invoke-RestMethod "$BaseUrl/api/projects?page=1&page_size=10"
```

신규 프로젝트 생성:
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$newProject = @{
  name = "my-new-project"
  project_path = "D:\workspace\my-new-project"
  core_goal = "프로덕션 로그인 버그 즉시 핫픽스"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/projects" `
  -ContentType "application/json" `
  -Body $newProject
```

### 3-2. `$` 전송 함수 (회의 포함/생략 공용)
```powershell
function Invoke-CeoDirective {
  param(
    [Parameter(Mandatory = $true)][string]$DirectiveText,
    [Parameter(Mandatory = $true)][string]$ProjectId,
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [Parameter(Mandatory = $true)][string]$ProjectContext,
    [switch]$SkipPlannedMeeting,
    [string]$Author = "ceo",
    [string]$Source = "telegram"
  )

  $baseUrl = "http://127.0.0.1:8790"
  $secret = Get-EnvValue -Key "INBOX_WEBHOOK_SECRET"
  if ([string]::IsNullOrWhiteSpace($secret)) {
    throw "INBOX_WEBHOOK_SECRET 이 비어 있습니다."
  }

  $payload = @{
    source = $Source
    author = $Author
    text = '$' + $DirectiveText
    agent_rules_version = 2
    project_id = $ProjectId
    project_path = $ProjectPath
    project_context = $ProjectContext
  }
  if ($SkipPlannedMeeting) {
    $payload.skipPlannedMeeting = $true
  }

  $headers = @{
    "content-type" = "application/json"
    "x-inbox-secret" = $secret
  }

  $resp = Invoke-WebRequest `
    -Method Post `
    -Uri "$baseUrl/api/inbox" `
    -Headers $headers `
    -Body ($payload | ConvertTo-Json -Depth 10) `
    -SkipHttpErrorCheck

  $status = [int]$resp.StatusCode
  $body = $null
  if (-not [string]::IsNullOrWhiteSpace($resp.Content)) {
    try { $body = $resp.Content | ConvertFrom-Json } catch { $body = $resp.Content }
  }

  [pscustomobject]@{
    StatusCode = $status
    Body = $body
  }
}
```

회의 포함:
```powershell
$r = Invoke-CeoDirective `
  -DirectiveText "금주 금요일까지 릴리즈 후보와 QA sign-off 완료" `
  -ProjectId "PROJECT_ID" `
  -ProjectPath "D:\workspace\my-project" `
  -ProjectContext "기존 프로젝트 릴리즈 안정화"
$r
```

회의 생략:
```powershell
$r = Invoke-CeoDirective `
  -DirectiveText "프로덕션 로그인 버그 즉시 핫픽스" `
  -ProjectId "PROJECT_ID" `
  -ProjectPath "D:\workspace\my-project" `
  -ProjectContext "긴급 장애 복구" `
  -SkipPlannedMeeting
$r
```

### 3-3. 성공/실패 판정 규칙
- `200`: 성공
- `401`: `x-inbox-secret` 불일치
- `428`: `agent_upgrade_required` (AGENTS 규칙 업그레이드 필요)
- `503`: 서버의 `INBOX_WEBHOOK_SECRET` 미설정

428일 때 즉시 실행:
```powershell
Set-Location <PROJECT_ROOT>
powershell -ExecutionPolicy Bypass -File .\scripts\openclaw-setup.ps1
```

업그레이드 후 같은 directive를 1회 재전송한다.

## 4) `#` Task 등록 운영

### 4-1. `#` 메시지 등록
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$InboxSecret = Get-EnvValue -Key "INBOX_WEBHOOK_SECRET"

$payload = @{
  source = "telegram"
  text = "#로그인 에러 재현 후 원인 분석하고 수정"
} | ConvertTo-Json

Invoke-WebRequest `
  -Method Post `
  -Uri "$BaseUrl/api/inbox" `
  -Headers @{
    "content-type" = "application/json"
    "x-inbox-secret" = $InboxSecret
  } `
  -Body $payload `
  -SkipHttpErrorCheck
```

### 4-2. inbox 최신 태스크 찾기 + `project_path` 확정
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$inbox = Invoke-RestMethod "$BaseUrl/api/tasks?status=inbox"
$task = $inbox.tasks | Sort-Object updated_at -Descending | Select-Object -First 1
$task
```

`project_path`가 비어 있으면 패치:
```powershell
$taskId = "TASK_ID"
$BaseUrl = "http://127.0.0.1:8790"

Invoke-RestMethod `
  -Method Patch `
  -Uri "$BaseUrl/api/tasks/$taskId" `
  -ContentType "application/json" `
  -Body (@{ project_path = "D:\workspace\my-project" } | ConvertTo-Json)
```

### 4-3. 이전 작업 이력 확인 (continue/fresh 판단)
```powershell
$taskId = "TASK_ID"
$BaseUrl = "http://127.0.0.1:8790"
Invoke-RestMethod "$BaseUrl/api/tasks/$taskId/terminal?lines=20" | ConvertTo-Json -Depth 8
```

- `Continue`: 기존 태스크 실행
- `Fresh`: 새 태스크를 복제 생성하고 기존 태스크는 `cancelled` 처리

Continue:
```powershell
$taskId = "TASK_ID"
$BaseUrl = "http://127.0.0.1:8790"
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/tasks/$taskId/run"
```

Fresh (복제 + 기존 취소):
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$oldTaskId = "TASK_ID"
$detail = Invoke-RestMethod "$BaseUrl/api/tasks/$oldTaskId"

$newPayload = @{
  title = $detail.task.title
  description = $detail.task.description
  department_id = $detail.task.department_id
  task_type = $detail.task.task_type
  priority = $detail.task.priority
  project_id = $detail.task.project_id
  project_path = $detail.task.project_path
  workflow_pack_key = $detail.task.workflow_pack_key
} | ConvertTo-Json -Depth 10

$newTask = Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/tasks" `
  -ContentType "application/json" `
  -Body $newPayload

Invoke-RestMethod `
  -Method Patch `
  -Uri "$BaseUrl/api/tasks/$oldTaskId" `
  -ContentType "application/json" `
  -Body (@{ status = "cancelled" } | ConvertTo-Json)

$newTask
```

## 5) Collaborating 심화

### 5-1. 진입 조건
`collaborating`은 수동 라벨이 아니라 서버가 교차부서 협업 시 자동 설정한다.
- 기획팀 선행 협업 시작 시: `status='collaborating'` 설정
- 메인 위임 후 후행 교차협업 시작 시: 현재가 `in_progress`가 아닐 때만 `collaborating` 설정

### 5-2. 관측 지표 (필수 4개 API)
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$TaskId = "TASK_ID"

Invoke-RestMethod "$BaseUrl/api/tasks/$TaskId" | ConvertTo-Json -Depth 8
Invoke-RestMethod "$BaseUrl/api/subtasks?active=1" | ConvertTo-Json -Depth 8
Invoke-RestMethod "$BaseUrl/api/tasks/$TaskId/meeting-minutes" | ConvertTo-Json -Depth 8
Invoke-RestMethod "$BaseUrl/api/tasks/$TaskId/terminal?lines=120" | ConvertTo-Json -Depth 8
```

### 5-3. 이탈 조건
- 실행 시작: `/api/tasks/:id/run` 후 `in_progress` 진입
- 일시중지: `/api/tasks/:id/stop` + `mode=pause` -> `pending`
- 취소: `/api/tasks/:id/stop`(기본) -> `cancelled`

### 5-4. 정체 복구 플레이북 (고정 순서)
순서: `run 재시도 -> pause/resume -> stop`

1) `run` 재시도:
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$TaskId = "TASK_ID"
Invoke-WebRequest -Method Post -Uri "$BaseUrl/api/tasks/$TaskId/run" -SkipHttpErrorCheck
```

2) `pause/resume`:
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$TaskId = "TASK_ID"

$session = Invoke-RestMethod "$BaseUrl/api/auth/session" -SessionVariable ws
$csrf = $session.csrf_token
$h = @{ "content-type" = "application/json"; "x-csrf-token" = $csrf }

Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/tasks/$TaskId/stop" -WebSession $ws -Headers $h -Body (@{ mode = "pause" } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/tasks/$TaskId/resume" -WebSession $ws -Headers $h -Body (@{} | ConvertTo-Json)
```

3) 최종 `stop`:
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$TaskId = "TASK_ID"

$session = Invoke-RestMethod "$BaseUrl/api/auth/session" -SessionVariable ws
$csrf = $session.csrf_token
$h = @{ "content-type" = "application/json"; "x-csrf-token" = $csrf }

Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/tasks/$TaskId/stop" -WebSession $ws -Headers $h -Body (@{} | ConvertTo-Json)
```

## 6) 운영 플레이북

### 6-1. 시나리오 A: 지시 접수
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$projects = Invoke-RestMethod "$BaseUrl/api/projects?page=1&page_size=10"
$projects.projects | Select-Object id, name, project_path

$r = Invoke-CeoDirective `
  -DirectiveText "핵심 결제 오류 수정 및 회귀 테스트 완료" `
  -ProjectId "PROJECT_ID" `
  -ProjectPath "D:\workspace\billing" `
  -ProjectContext "결제 안정화" `
  -SkipPlannedMeeting
$r

Invoke-RestMethod "$BaseUrl/api/tasks?status=inbox" | ConvertTo-Json -Depth 6
```

### 6-2. 시나리오 B: 협업 정체
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$TaskId = "TASK_ID"

Invoke-RestMethod "$BaseUrl/api/tasks/$TaskId" | ConvertTo-Json -Depth 6
Invoke-RestMethod "$BaseUrl/api/subtasks?active=1" | ConvertTo-Json -Depth 6
Invoke-RestMethod "$BaseUrl/api/tasks/$TaskId/terminal?lines=80" | ConvertTo-Json -Depth 6

Invoke-WebRequest -Method Post -Uri "$BaseUrl/api/tasks/$TaskId/run" -SkipHttpErrorCheck
```

재시도 실패 시 `5-4` 순서대로 `pause/resume -> stop` 실행.

### 6-3. 시나리오 C: 리뷰 대기
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$reviewTasks = Invoke-RestMethod "$BaseUrl/api/tasks?status=review"
$reviewTasks.tasks | Select-Object id, title, status, updated_at

$TaskId = "TASK_ID"
Invoke-RestMethod "$BaseUrl/api/tasks/$TaskId/meeting-minutes" | ConvertTo-Json -Depth 10
Invoke-RestMethod "$BaseUrl/api/tasks/$TaskId/diff" | ConvertTo-Json -Depth 10

$decision = Invoke-RestMethod "$BaseUrl/api/decision-inbox"
$item = $decision.items | Select-Object -First 1
if ($item) {
  $firstOptionNumber = ($item.options | Select-Object -First 1).number
  Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/api/decision-inbox/$($item.id)/reply" `
    -ContentType "application/json" `
    -Body (@{ option_number = $firstOptionNumber } | ConvertTo-Json)
}
```

### 6-4. 시나리오 D: 완료 검증
```powershell
$BaseUrl = "http://127.0.0.1:8790"
$TaskId = "TASK_ID"

$taskDetail = Invoke-RestMethod "$BaseUrl/api/tasks/$TaskId"
$taskDetail.task | Select-Object id, status, completed_at, project_id, project_path

Invoke-RestMethod "$BaseUrl/api/task-reports/$TaskId" | ConvertTo-Json -Depth 8
Invoke-RestMethod "$BaseUrl/api/tasks/$TaskId/terminal?lines=120" | ConvertTo-Json -Depth 8
```

## 7) 오류 코드 대응표

| 코드 | 대표 원인 | 확인 명령 | 조치 순서 |
|---|---|---|---|
| `401` | `x-inbox-secret` 불일치 | `Get-EnvValue -Key "INBOX_WEBHOOK_SECRET"` + 요청 헤더 확인 | `.env` 값 동기화 -> 재호출 |
| `422` | 비지시(`$` 없음) inbox 메시지에 세션-에이전트 매핑 없음 | `Invoke-WebRequest ... /api/inbox` 응답 본문 확인 | 세션에 agent 매핑 설정 후 재시도 |
| `428` | `agent_upgrade_required` (`project_id` 강제 정책 위반 또는 AGENTS 구버전) | 응답 `error`, `installer_paths` 확인 | `scripts/openclaw-setup.ps1` 실행 -> 동일 directive 1회 재시도 |
| `503` | 서버 `INBOX_WEBHOOK_SECRET` 미설정 또는 저장소 Busy | `Get-Content .env | Select-String '^INBOX_WEBHOOK_SECRET='` + `/api/health` | 시크릿 설정/서버 재시작 -> 재호출 |
| `409` | idempotency 충돌 또는 실행 중 태스크 재실행 | 응답 `error` 확인 (`idempotency_conflict`, `process_still_active`) | 새 idempotency 키 사용 또는 기존 실행 종료 후 재시도 |

## 8) 최종 체크리스트

- [ ] 서버 기동 후 `/api/health`가 정상 응답한다.
- [ ] `$` 지시(회의 포함) 전송 시 `200` 및 `directive=true` 응답을 확인했다.
- [ ] `$` 지시(회의 생략, `skipPlannedMeeting=true`) 전송이 정상 동작한다.
- [ ] `#` 등록 후 `project_path`를 확정하고 실행 가능한 상태(`planned`)를 확인했다.
- [ ] 협업 유도 태스크에서 `collaborating` 진입과 관련 서브태스크/회의 로그를 확인했다.
- [ ] `pending -> resume -> planned/in_progress` 복구 흐름을 확인했다.
- [ ] `401/503` 실패 분기를 재현 또는 점검했고 대응 절차가 동작한다.
- [ ] 운영 완료 근거(`task detail`, `terminal`, `task-report`)를 수집했다.
