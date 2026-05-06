# Google Calendar Intake 운영 문서

## 목적

Google Calendar를 DonggriCompany 프로젝트 일정 접수 채널로 사용한다.
일정 제목 또는 설명이 지정된 토큰과 매칭되면 로컬 receiver가 해당 이벤트를 읽고 PRN 초안을 만든 뒤 Telegram 승인 대기 상태로 전송한다.

## 동작 흐름

```text
Google Calendar
  -> 로컬 Calendar polling receiver
  -> 제목/설명 토큰 검증
  -> PRN markdown 생성
  -> Telegram 승인 요청
  -> 승인 <CAL-intake_id>
  -> /api/inbox 로 CEO directive 제출
  -> PMO/부서 시스템 기존 흐름
```

## 필수 환경값

```powershell
CALENDAR_INTAKE_ENABLED=1
CALENDAR_INTAKE_CALENDAR_ID="primary"
CALENDAR_INTAKE_MATCH_TOKENS="[DonggriCompany],[Hackathon],[해커톤],해커톤,hackathon"
CALENDAR_INTAKE_POLL_INTERVAL_MS=60000
CALENDAR_INTAKE_LOOKBACK_DAYS=1
CALENDAR_INTAKE_LOOKAHEAD_DAYS=60
CALENDAR_INTAKE_TELEGRAM_SESSION_KEY="telegram:global"
CALENDAR_INTAKE_DEFAULT_PROJECT_PATH="<PROJECT_ROOT>"
```

## OAuth 연결

Gmail intake OAuth 스크립트가 Gmail readonly와 Calendar readonly scope를 함께 요청한다.
기존 Gmail-only 토큰에는 Calendar 권한이 없으므로 Calendar 연동 전에 다시 실행해야 한다.

```powershell
$env:GMAIL_INTAKE_GOOGLE_CLIENT_ID="..."
$env:GMAIL_INTAKE_GOOGLE_CLIENT_SECRET="..."
corepack pnpm run google:intake:oauth
```

## 승인/거절

Telegram에서 아래 형식으로 보낸다.

```text
승인 CAL-20260429-001
거절 CAL-20260429-001 사유
```

아래 별칭도 허용한다.

```text
캘린더승인 CAL-20260429-001
캘린더거절 CAL-20260429-001 사유
일정승인 CAL-20260429-001
일정거절 CAL-20260429-001 사유
```

## 점검 명령

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/messenger/receiver/calendar" | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/calendar-intake/items" | ConvertTo-Json -Depth 5
```

## 보안 기준

- Calendar에는 읽기 전용 scope만 사용한다.
- 일정은 접수 채널이며 승인 전 자동 실행하지 않는다.
- 매칭 토큰/키워드가 없는 일정은 저장하지 않는다.
- PRN 원문, 승인/거절/실패 이력은 DB에 보존한다.
