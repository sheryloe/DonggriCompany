# DonggriCompany

로컬 웹 기반 대시보드에서 여러 AI 제공자 계정을 "게임 캐릭터의 체력"처럼 운영하고, 공용 역할 기반 서브에이전트를 오케스트레이션하기 위한 개인용 AI 오피스 프로젝트입니다.

현재 저장소는 Step-2 ~ Step-5 구현이 완료된 상태이며, 핵심은 다음입니다.

- 계정풀/런타임프로필/프로브 API의 계약 정합화 및 하드닝
- `/dashboard` 아바타 중심 Office Board
- 로딩/에러/재시도/삭제 확인 등 안정화 UX + 아바타 가이드 레이어
- Step-5 상태 매핑/레이아웃/카피/sign-off 문서

## 1) 프로젝트 비전

이 프로젝트는 Outworked 계열 감성의 "오피스/전술 보드"를 목표로 합니다.

- 실제 계정 사용량(Usage)을 Fatigue(피로도)로 치환
- Boss(사람 PM)가 최종 의사결정
- Orchestra가 역할 기반 에이전트를 배분
- Account Pool을 자원 탱크처럼 운영
- Shared Role을 기반으로 Agent Instance를 소환/지휘

## 2) 현재 구현 범위 vs 목표 범위

### 현재 구현됨 (Step-2 ~ Step-5)

- 백엔드
  - account pool CRUD + fatigue history
  - runtime profile CRUD
  - provider probe run/history
  - probe 요청 무결성 검증 및 fallback 강화
- UI (`/dashboard`)
  - 아바타 중심 오피스 보드 (Avatar Agent Shell + Board Zones)
  - account pool / runtime profile / probe 실행/이력
  - probe 상태 분류: `success | partial | stale | no-signal | error`
  - 아바타 가이드 카피 + destructive action 안내 + fallback 패널
- 안정화
  - loading/empty/error/retry UX
  - destructive action(삭제) 확인 단계
  - 테스트 강화 + release docs

### 아직 목표로 남아있는 항목 (향후 Step)

- 멀티 아바타/역할별 상호작용 확장
- 직원/워크스페이스 배치형 심화 인터랙티브 UI
- richer avatar/skin 시스템

## 3) 시작하기 (Docker 권장)

Windows/WSL 환경에서는 `better-sqlite3` 네이티브 빌드 이슈를 피하려면 Docker 방식이 가장 안전합니다.

사전 조건:

- Docker Desktop 또는 Rancher Desktop이 실행 중
- Docker daemon 접근 가능한 상태

실행:

```bash
docker-compose -f docker-compose.demo.yml up --build
```

접속:

- 대시보드 UI: `http://localhost:3000/dashboard`
- 백엔드 API: `http://localhost:4315/api/health`

중지:

```bash
docker-compose -f docker-compose.demo.yml down
```

참고:

- 데모 파일은 `Dockerfile.demo`, `docker-compose.demo.yml`, `scripts/demo-start.sh`를 사용합니다.
- 일부 WSL/Rancher Desktop 조합에서는 Docker 소켓 권한 문제로 실행이 막힐 수 있습니다.

## 4) 로컬 직접 실행

### 사전 요구사항

- Node.js 20+ (Node 22 동작 확인)
- Corepack 사용 가능
- pnpm workspace

### 설치

```bash
corepack pnpm install
```

### better-sqlite3 점검/복구

점검:

```bash
corepack pnpm --filter @workspace/db exec node -e "require('better-sqlite3'); console.log('better-sqlite3:ok')"
```

복구:

```bash
corepack pnpm --filter @workspace/db rebuild better-sqlite3
```

필요 시 강제 재설치:

```bash
corepack pnpm install --force
corepack pnpm --filter @workspace/db rebuild better-sqlite3
```

### DB 초기화

기본 DB 경로: `.local/workspace.sqlite`

```bash
corepack pnpm --filter @workspace/db run db:migrate
corepack pnpm --filter @workspace/db run db:seed
```

WSL에서 `tsx` IPC 이슈(`ENOTSUP`)가 있으면 우회:

```bash
cd packages/db
node --import tsx src/cli/migrate.ts
node --import tsx src/cli/seed.ts
```

### 실행

터미널 1: API 서버(`4315`)

```bash
corepack pnpm --filter @workspace/server run dev
```

서버 `tsx watch` 실패 시 우회:

```bash
cd apps/server
node --import tsx src/index.ts
```

터미널 2: 웹 (`3000`)

```bash
corepack pnpm --filter @workspace/web run dev
```

대시보드:

- `http://localhost:3000/dashboard`

웹을 4000 포트로 실행:

```bash
corepack pnpm --filter @workspace/web exec next dev -p 4000
```

- `http://localhost:4000/dashboard`

### 헬스 체크

```bash
curl http://127.0.0.1:4315/api/health
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/dashboard
```

## 5) 핵심 개념

- Boss (사람 PM): 최종 승인/우선순위 관리
- Orchestra (지휘 계층): 작업 계획/분배/상태 추적
- Account Pool: 실제 과금/쿼터가 걸린 물리 계정 자원
- Shared Role: Reviewer, Builder, Scout 등 공용 역할
- Agent Instance: 역할 + 자원으로 생성된 실행 단위
- Fatigue: 계정 사용 한도 기반 자원 피로도
- Heat: 세션 컨텍스트/부하 기반 임시 과열도

## 6) 주요 사용자 플로우 (현재 UI)

`/dashboard`에서 가능한 핵심 플로우:

1. Provider / Account Pool 선택
2. Runtime Profile 생성/수정/삭제 (삭제 확인 포함)
3. Provider Probe 실행
4. Latest Probe 상태 확인
5. Probe History 필터/limit 조정
6. 상태 뱃지 + 아바타 반응 확인 (`success/partial/stale/no-signal/error`)
7. history filter/empty/retry 안내를 아바타 카피로 확인

## 7) API 엔드포인트

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

## 8) 검증 명령

```bash
corepack pnpm -r --if-present run typecheck
corepack pnpm -r --if-present run lint
TMPDIR=/tmp corepack pnpm -r --if-present run test
```

## 9) 모노레포 구조

### 현재 저장소 실제 구조

```text
apps/
  server/        Fastify API
  web/           Next.js 대시보드

packages/
  db/            SQLite + 마이그레이션 + 도메인 서비스
  shared/        공통 타입 계약
  rolepack/      rolepack 유틸

docs/
  step4_status.md
  step4_signoff.md
  step5_avatar_agent_status.md
  step5_signoff.md
  avatar_state_mapping.md
  avatar_copy_guide.md
  office_board_layout.md
  local_validation.md
  runbook_probe_failures.md
  release_checklist.md
  known_risks.md
```

### 목표 아키텍처(로드맵)

```text
apps/
  web/                전술 보드 / 오피스 뷰
  orchestrator/       지휘/스케줄링 데몬

packages/
  core/
  db/
  avatar-system/
  provider-core/
  provider-claude/
  provider-codex/
  provider-gemini/
  provider-jules/
  role-compiler/
```

## 10) UI/UX 철학

목표 철학:

- 채팅 로그 중심 UI가 아니라 운영판 중심 UI
- Boss Room / Account Barracks / Squad View / Approval Gate 제공
- 상태를 텍스트가 아니라 시각 단위(카드/바/보드)로 관리

현재 상태:

- Step-5 아바타 오피스 보드 적용 완료
- 상태/카피/보드 구획이 `classifyProbeUiState` 기반으로 연결됨

## 11) 운영 문서

- `docs/step4_status.md`
- `docs/step4_signoff.md`
- `docs/step5_avatar_agent_status.md`
- `docs/step5_signoff.md`
- `docs/avatar_state_mapping.md`
- `docs/avatar_copy_guide.md`
- `docs/office_board_layout.md`
- `docs/local_validation.md`
- `docs/runbook_probe_failures.md`
- `docs/release_checklist.md`
- `docs/known_risks.md`

## 12) 알려진 리스크

- `better-sqlite3` 네이티브 바인딩 드리프트 (로컬 환경)
- provider CLI 출력 포맷 변화 시 probe 정확도 저하 가능 (`partial`/`no-signal`)

## 13) FAQ

Q. `/dashboard`가 왜 텍스트/설정 위주인가요?  
A. 현재 브랜치는 Step-5 기준으로 아바타 오피스 보드가 기본이며, 기존 운영 패널은 fallback 안전장치로 유지됩니다.

Q. Windows에서 실행이 자주 깨집니다.  
A. Docker 방식이 기본 권장입니다. 로컬 직접 실행 시 `better-sqlite3` 재빌드를 먼저 확인하세요.
