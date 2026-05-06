# Gmail [DonggriCompany] 명세 접수 운영 문서

## 목적

Gmail을 외부 명세 접수 채널로 사용한다. 대시보드는 외부 공개하지 않고, 메일 제목이 `[DonggriCompany]`로 시작하는 메일만 로컬 receiver가 읽어 PRN 승인 대기 상태로 만든다.

## 동작 흐름

```text
Gmail
  -> 로컬 Gmail polling receiver
  -> 제목/발신자/첨부 검증
  -> PRN markdown 생성
  -> Telegram 승인 요청
  -> 승인 <intake_id>
  -> /api/inbox 로 $ 지시 제출
  -> PMO/부서/태스크 기존 흐름
```

## 필수 환경값

```powershell
GMAIL_INTAKE_ENABLED=1
GMAIL_INTAKE_SUBJECT_TOKEN="[DonggriCompany]"
GMAIL_INTAKE_ALLOWED_SENDERS="your@email.com"
GMAIL_INTAKE_POLL_INTERVAL_MS=60000
GMAIL_INTAKE_LOOKBACK_DAYS=14
GMAIL_INTAKE_MAX_ATTACHMENT_MB=10
GMAIL_INTAKE_TELEGRAM_SESSION_KEY="telegram:global"
GMAIL_INTAKE_DEFAULT_PROJECT_PATH="C:\\path\\to\\DonggriCompany"
```

## Google Intake OAuth 연결

Google Cloud Console에서 Gmail API와 Google Calendar API를 켜고 OAuth client id/secret을 준비한다. 이 스크립트는 Gmail readonly와 Calendar readonly scope를 함께 요청한다.

```powershell
$env:GMAIL_INTAKE_GOOGLE_CLIENT_ID="..."
$env:GMAIL_INTAKE_GOOGLE_CLIENT_SECRET="..."
corepack pnpm run gmail:intake:oauth
```

토큰은 SQLite `settings.gmailIntakeOAuth`에 암호화 저장된다. Docker 운영 DB(`data/claw-empire.sqlite`)가 있으면 같은 설정을 함께 갱신한다. `credentials.json`, `token.json`, refresh token을 채팅이나 문서에 붙이지 않는다.

## 승인/거절

텔레그램으로 아래 형식이 전송된다.

```text
[Gmail Intake][승인 대기] GMAIL-20260429-001
승인: 승인 GMAIL-20260429-001
거절: 거절 GMAIL-20260429-001 사유
```

승인 전에는 `/api/inbox`로 전달되지 않는다.

## 점검 명령

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/messenger/receiver/gmail" | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/gmail-intake/items" | ConvertTo-Json -Depth 5
```

## 보안 기준

- 허용 발신자만 접수한다.
- 제목 토큰이 없으면 처리하지 않는다.
- 실행 파일, 스크립트, 압축파일 첨부는 거부한다.
- Gmail OAuth token은 로컬 DB에 암호화 저장한다.
- Gmail message id로 중복 접수를 차단한다.
- 승인 기록, 거절 기록, 실패 사유를 DB에 남긴다.
