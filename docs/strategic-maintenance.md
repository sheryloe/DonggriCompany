# 전략보수팀 운영 문서

## 목적

전략보수팀(`strategic_maintenance`)은 DonggriCompany 시스템을 주기적으로 검토하고, 개선 후보를 태스크로 남기며, 운영자에게 Gmail 요약 보고를 보내는 정식 운영 부서다.

## 기본 동작

- 조직 버전: `org-v5`
- 부서 ID: `strategic_maintenance`
- 기본 인원: 팀장 1명, 시니어 2명
- 기본 주기: 매주 월요일 09:00 KST
- 보고서 경로: `data/reports/strategic-maintenance/`
- 실행 기록 테이블: `strategic_maintenance_runs`
- 설정 키: `settings.strategicMaintenance`

## 설정

Settings UI의 `전략보수` 탭에서 다음 값을 관리한다.

- 주간 자동 점검 사용 여부
- 실행 요일과 시각
- 개선 태스크 생성 여부
- 실행당 최대 생성 태스크 수
- Gmail 보고 사용 여부
- Gmail 수신자와 참조
- 수동 점검 실행
- 테스트 메일 발송

기본값은 안전을 위해 자동 점검과 Gmail 보고가 꺼져 있다. 수신자가 없거나 Gmail send 권한이 없으면 보고서와 태스크 생성은 계속 진행되며, 메일만 `blocked` 상태로 기록된다.

## Gmail 권한

전략보수 메일 발송은 기존 `settings.gmailIntakeOAuth`를 재사용한다. OAuth 연결에는 다음 scope가 필요하다.

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.readonly
```

기존 readonly 연결만 있는 경우 아래 명령으로 다시 연결한다.

```powershell
corepack pnpm run gmail:intake:oauth
```

토큰과 client secret은 SQLite 설정에 암호화 저장되며, 로그나 보고서에 출력하지 않는다.

## API

```text
GET  /api/strategic-maintenance/status
GET  /api/strategic-maintenance/runs?limit=20
POST /api/strategic-maintenance/run
POST /api/strategic-maintenance/test-email
```

수동 실행은 보고서를 생성하고 개선 태스크를 `inbox` 상태로 등록한다. 자동 코드 수정, 태스크 실행, 커밋, 푸시는 수행하지 않는다.

## 검증 후보

```powershell
corepack pnpm exec vitest run server/modules/strategic-maintenance/service.test.ts server/messenger/gmail-client.test.ts --config server/vitest.config.ts
corepack pnpm exec vitest run src/components/settings/StrategicMaintenanceSettingsTab.test.tsx --config vitest.config.ts
corepack pnpm run openapi:check
corepack pnpm run build
git diff --check
```
