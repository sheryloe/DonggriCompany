# DonggriCompany

Step-2 ~ Step-4 범위(계정풀/런타임프로필/프로바이더 프로브 + Office 브리지 UI + 안정화/검증/운영문서)가 반영된 모노레포입니다.

## 1) 현재 구현 상태 요약

- Step-2: backend contract 구현/보강 완료
  - account pool CRUD + fatigue history
  - runtime profile CRUD
  - provider usage probe run/history
  - probe 무결성 검증 / fallback 동작 보강
- Step-3: Step-2 API 브리지 UI 구현 완료
  - `/dashboard`에서 Office 운영 콘솔 형태 UI 제공
  - account pool / runtime profile / probe run / probe history 연동
  - probe 상태 분류(`success | partial | stale | no-signal | error`) 적용
- Step-4: 안정화/검증/문서화 완료
  - loading/empty/error/retry UX 보강
  - destructive action(삭제) 확인 단계 적용
  - web Vitest + RTL 테스트 추가
  - release-readiness 문서 추가

참고:
- 현재 `/dashboard`는 “운영 콘솔형(텍스트/테이블 중심)” UI입니다.
- 카툰형 직원 보드/시각화는 이 브랜치의 완료 범위가 아닙니다.

## 2) 리포지토리 구조

```text
apps/
  server/   Fastify API 서버
  web/      Next.js UI

packages/
  db/       sqlite 기반 도메인/리포지토리/마이그레이션
  shared/   공통 타입 계약
  rolepack/ rolepack 로딩 유틸

docs/
  step4_status.md
  step4_signoff.md
  local_validation.md
  runbook_probe_failures.md
  release_checklist.md
  known_risks.md
```

## 3) 사전 요구사항

- Node.js 20+ (현재 환경은 Node 22도 동작)
- Corepack 사용 가능 환경
- pnpm (Corepack 통해 사용)

## 4) 설치

```bash
corepack pnpm install
```

### better-sqlite3 빠른 점검

```bash
corepack pnpm --filter @workspace/db exec node -e "require('better-sqlite3'); console.log('better-sqlite3:ok')"
```

실패 시 복구:

```bash
corepack pnpm --filter @workspace/db rebuild better-sqlite3
# 필요 시
corepack pnpm install --force
corepack pnpm --filter @workspace/db rebuild better-sqlite3
```

## 5) DB 준비

기본 DB 경로: `.local/workspace.sqlite`

```bash
corepack pnpm --filter @workspace/db run db:migrate
corepack pnpm --filter @workspace/db run db:seed
```

일부 WSL/IPC 제한 환경에서 `tsx` watch/cli가 ENOTSUP로 실패하면 아래 우회 실행:

```bash
cd packages/db
node --import tsx src/cli/migrate.ts
node --import tsx src/cli/seed.ts
```

## 6) 실행 (로컬)

### 기본 포트

- API 서버: `4315`
- 웹: `3000` (Next rewrite로 `/api/* -> 4315`)

### 터미널 1: 서버

```bash
corepack pnpm --filter @workspace/server run dev
```

WSL IPC 제한 우회:

```bash
cd apps/server
node --import tsx src/index.ts
```

### 터미널 2: 웹

```bash
corepack pnpm --filter @workspace/web run dev
```

접속:
- `http://localhost:3000/dashboard`

### 웹 포트를 4000으로 실행하고 싶을 때

```bash
corepack pnpm --filter @workspace/web exec next dev -p 4000
```

접속:
- `http://localhost:4000/dashboard`

## 7) 헬스/연결 확인

```bash
curl http://127.0.0.1:4315/api/health
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/dashboard
```

`/dashboard`가 처음에는 `Loading Step-3 bridge data...`를 잠깐 보일 수 있습니다(초기 fetch 중).

## 8) 주요 API 엔드포인트

### Bootstrap
- `GET /api/bootstrap/state`
- `GET /api/office/bootstrap` (alias)
- `POST /api/bootstrap/init`

### Providers
- `GET /api/providers`
- `POST /api/providers/probe`

### Account Pools
- `GET /api/account-pools`
- `POST /api/account-pools`
- `PATCH /api/account-pools/:id`
- `GET /api/account-pools/:id/fatigue`

### Runtime Profiles
- `GET /api/runtime-profiles`
- `POST /api/runtime-profiles`
- `PATCH /api/runtime-profiles/:id`
- `DELETE /api/runtime-profiles/:id`

### Provider Probes
- `POST /api/provider-probes/run`
- `GET /api/provider-probes/history?provider=&accountPoolId=&runtimeProfileId=&limit=`

## 9) 검증 명령 (권장 표준)

```bash
corepack pnpm -r --if-present run typecheck
corepack pnpm -r --if-present run lint
TMPDIR=/tmp corepack pnpm -r --if-present run test
```

## 10) 테스트 구성

- `@workspace/db`
  - Step-2 핵심 서비스/정규화/프로브/fallback/무결성 검증 테스트
- `@workspace/server`
  - bootstrap alias 경로 동작 테스트
- `@workspace/web`
  - Vitest + jsdom + Testing Library
  - probe 상태 분류/패널 상태/삭제 확인 플로우 테스트

## 11) Step-4 운영 문서

- 상태 요약: `docs/step4_status.md`
- 최종 사인오프: `docs/step4_signoff.md`
- 로컬 검증 가이드: `docs/local_validation.md`
- Probe 장애 런북: `docs/runbook_probe_failures.md`
- 릴리스 체크리스트: `docs/release_checklist.md`
- 잔여 리스크: `docs/known_risks.md`

## 12) Docker 데모(현재 추가됨)

데모용 파일:
- `Dockerfile.demo`
- `docker-compose.demo.yml`
- `scripts/demo-start.sh`

실행:

```bash
docker-compose -f docker-compose.demo.yml up --build
```

노출 포트:
- `3000` (web)
- `4315` (api)

주의:
- 일부 환경(특히 WSL + Rancher/Desktop)에서 Docker 소켓 권한 문제로 기동 실패할 수 있습니다.
- 실패 시 먼저 Docker daemon 접근 가능 여부를 확인하세요.

## 13) 알려진 운영 리스크

- 로컬 환경 오염 시 `better-sqlite3` native binding drift
- provider CLI 출력 포맷 변화 시 probe 결과가 `partial`/`no-signal`로 저하될 수 있음

## 14) 빠른 데모 체크리스트

1. 설치: `corepack pnpm install`
2. DB: migrate + seed
3. 서버(4315) 실행
4. 웹(3000 또는 4000) 실행
5. `/dashboard` 접속
6. Runtime Profile create/update/delete
7. Provider Probe run + history/filter 확인
8. typecheck/lint/test 통과 확인
