# DonggriCompany — 보완 패치 (claw-empire 레퍼런스)

## 보완 내용

### 추가된 기능
1. **Agent/Department/Task 도메인** — DB 마이그레이션 + 서비스 레이어
2. **WebSocket 실시간 동기화** — `/ws/office` 엔드포인트, 30초 stats 브로드캐스트
3. **Dashboard UI** — HUD stats (4개), 에이전트 랭킹보드, 부서 퍼포먼스, 최근 태스크
4. **AgentAvatar 컴포넌트** — 스프라이트 기반 (spriteNumber DB 필드), 상태 인디케이터
5. **useOfficeData 훅** — REST 초기 로드 + WebSocket 실시간 업데이트, 자동 재연결
6. **CORS 지원** — @fastify/cors 추가
7. **SQLite 하드닝** — WAL + busy_timeout + PRAGMA 설정

### 새 API 엔드포인트
| Method | Path | 설명 |
|--------|------|------|
| GET | /api/departments | 부서 목록 |
| GET | /api/agents | 에이전트 목록 |
| PATCH | /api/agents/:id/status | 에이전트 상태 변경 |
| GET | /api/tasks | 태스크 목록 |
| POST | /api/tasks | 태스크 생성 |
| PATCH | /api/tasks/:id/status | 태스크 상태 변경 |
| GET | /api/stats | 회사 통계 |
| WS | /ws/office | 실시간 동기화 |

### 설치 추가 의존성
```bash
# 서버
pnpm --filter @workspace/server add @fastify/websocket @fastify/cors

# 웹
# 별도 추가 불필요 (next.js 기본으로 WebSocket 클라이언트 사용 가능)
```

### 마이그레이션 실행
```bash
corepack pnpm --filter @workspace/db run db:migrate
```

## 파일 구조

```
donggri_patch/
├── README_PATCH.md                                  # 이 파일
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── app.ts                               # 서버 앱 (전체 교체)
│   │       ├── index.ts                             # 엔트리포인트 (전체 교체)
│   │       ├── routes/
│   │       │   └── agents.ts                        # Agent/Dept/Task/Stats 라우트
│   │       └── ws/
│   │           └── office-ws.ts                     # WebSocket 서버
│   └── web/
│       └── src/
│           └── office/
│               ├── components/
│               │   ├── AgentAvatar.tsx              # 에이전트 아바타 컴포넌트
│               │   └── Dashboard.tsx                # 대시보드 컴포넌트
│               ├── hooks/
│               │   └── useOfficeData.ts             # WebSocket+API 통합 훅
│               └── pages/
│                   └── OfficePage.tsx               # 오피스 페이지 (탭 통합)
└── packages/
    ├── db/
    │   ├── migrations/
    │   │   └── 0004_step_agents.sql                 # Agent/Department/Task 마이그레이션
    │   └── src/
    │       ├── db-hardening-patch.md                # SQLite PRAGMA 하드닝 가이드
    │       └── services/
    │           └── AgentService.ts                  # DepartmentService/AgentService/TaskService/StatsService
    └── shared/
        └── src/
            └── additions.ts                         # 추가 타입 정의
```

## claw-empire 레퍼런스 대응표

| claw-empire | DonggriCompany 보완 |
|-------------|---------------------|
| AgentAvatar (PixiJS 스프라이트) | AgentAvatar.tsx (img + 이모지 폴백) |
| Dashboard HUD stats | Dashboard.tsx StatCard 4개 |
| 랭킹보드 | Agent Ranking 섹션 |
| 부서 퍼포먼스 | Departments 섹션 |
| WebSocket 실시간 동기화 | office-ws.ts + useOfficeData.ts |
| SQLite WAL + busy_timeout | db-hardening-patch.md |
| 고아 태스크 복구/sweep | TaskService.updateStatus + WS 브로드캐스트 |
