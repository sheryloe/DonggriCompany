# DonggriCompany 2차 패치 — OAuth / Kanban / Meeting / AI CLI

> **스택**: Fastify + Next.js + better-sqlite3 + pnpm monorepo  
> **레퍼런스**: [claw-empire](https://github.com/GreenSheep01201/claw-empire)  
> **브랜치**: `codex/step2-complete` 기준으로 적용

---

## 변경 파일 목록

```
donggri_patch2/
├── README_PATCH2.md
├── apps/server/src/
│   ├── app.ts                              ← registerOAuth/Meeting/CliExecution 라우트 통합
│   └── routes/
│       ├── oauth.ts                        ← GET /api/oauth/status|start|callback, POST /api/oauth/disconnect
│       ├── meetings.ts                     ← GET/POST /api/meetings, /:id/start|complete|delete
│       └── cli-execution.ts               ← POST /api/cli/run|stop/:id, GET /api/cli/logs|subtasks|active
├── apps/web/src/office/
│   ├── components/
│   │   ├── KanbanBoard.tsx                 ← HTML5 드래그앤드롭, 6컬럼 (inbox→done)
│   │   ├── OAuthPanel.tsx                  ← GitHub/Google 연결 상태 UI
│   │   ├── MeetingPanel.tsx                ← 회의 생성/시작/완료 UI
│   │   └── CliRunPanel.tsx                 ← Provider 선택 + 프롬프트 + 실시간 로그
│   └── hooks/
│       └── useCliExecution.ts             ← logs/subtasks/stop 훅
├── packages/db/
│   ├── migrations/
│   │   ├── 0005_oauth_kanban.sql           ← oauth_states/credentials/accounts, meetings, tasks 확장
│   │   └── 0006_cli_execution.sql          ← task_logs, active_cli_runs, subtasks, tasks CLI 컬럼
│   └── src/services/
│       ├── OAuthService.ts                 ← AES-256-GCM 암호화, PKCE, GitHub/Google OAuth
│       ├── MeetingService.ts               ← 회의 CRUD + start/complete 상태 전환
│       └── CliExecutionService.ts          ← spawnCliAgent, stopCliAgent, 이중 타임아웃
└── packages/shared/src/
    └── oauth-types.ts                      ← OAuthProvider, OAuthAccount, Meeting, KANBAN_COLUMNS
```

---

## 신규 API 엔드포인트

### OAuth (`/api/oauth`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/oauth/status` | GitHub/Google 연결 상태 조회 |
| GET | `/api/oauth/start/:provider` | OAuth 플로우 시작 (github \| google) |
| GET | `/api/oauth/callback/:provider` | OAuth 콜백 처리, 성공 시 → `http://localhost:7777` 리다이렉트 |
| POST | `/api/oauth/disconnect` | `{ provider }` — 연결 해제 |

### Meeting (`/api/meetings`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/meetings` | 전체 목록 (query: `status`, `departmentId`, `limit`) |
| POST | `/api/meetings` | 회의 생성 `{ title, taskId?, departmentId?, agenda?, scheduledAt? }` |
| POST | `/api/meetings/:id/start` | 회의 시작 → status: `in_progress` |
| POST | `/api/meetings/:id/complete` | 회의 완료 `{ summary? }` → status: `done` |
| DELETE | `/api/meetings/:id` | 회의 삭제 |

### CLI 실행 (`/api/cli`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/cli/run` | CLI 에이전트 실행 `{ taskId, provider, prompt, projectPath, model? }` |
| POST | `/api/cli/stop/:taskId` | 실행 중 프로세스 종료 (SIGTERM → SIGKILL 3s) |
| GET | `/api/cli/logs/:taskId` | 실행 로그 조회 (query: `limit`, 최대 500) |
| GET | `/api/cli/subtasks/:taskId` | Claude Code subtask 목록 조회 |
| GET | `/api/cli/active` | 현재 실행 중인 CLI 프로세스 목록 |

---

## 적용 순서

### 1. 환경변수 추가 (`.env`)

```env
# OAuth 암호화 키 — 필수 (32자 이상 랜덤 문자열)
OFFICE_OAUTH_ENCRYPTION_KEY=your-super-secret-32char-key-here

# GitHub OAuth App
OAUTH_GITHUB_CLIENT_ID=your_github_client_id
OAUTH_GITHUB_CLIENT_SECRET=your_github_client_secret

# Google OAuth App
OAUTH_GOOGLE_CLIENT_ID=your_google_client_id
OAUTH_GOOGLE_CLIENT_SECRET=your_google_client_secret

# OAuth 콜백 base URL (기본: http://localhost:4315)
OAUTH_BASE_URL=http://localhost:4315

# CLI 타임아웃 (ms, 선택)
TASK_RUN_IDLE_TIMEOUT_MS=300000
TASK_RUN_HARD_TIMEOUT_MS=1800000
```

> **GitHub OAuth App 설정**: Homepage URL = `http://localhost:7777`  
> Authorization callback URL = `http://localhost:4315/api/oauth/callback/github`

> **Google OAuth App 설정**: Authorized redirect URI = `http://localhost:4315/api/oauth/callback/google`

---

### 2. DB 마이그레이션 실행

패치 파일을 `packages/db/migrations/` 에 복사 후:

```bash
# DonggriCompany가 자체 마이그레이션 스크립트를 사용하는 경우:
pnpm --filter @workspace/db migrate

# 또는 직접 sqlite3 CLI로 실행:
sqlite3 .local/workspace.sqlite < packages/db/migrations/0005_oauth_kanban.sql
sqlite3 .local/workspace.sqlite < packages/db/migrations/0006_cli_execution.sql
```

---

### 3. 파일 복사

```bash
# 패치 디렉토리에서 DonggriCompany 루트로:

# DB Services
cp packages/db/src/services/OAuthService.ts    your-repo/packages/db/src/services/
cp packages/db/src/services/MeetingService.ts  your-repo/packages/db/src/services/
cp packages/db/src/services/CliExecutionService.ts your-repo/packages/db/src/services/

# Shared types
cp packages/shared/src/oauth-types.ts  your-repo/packages/shared/src/

# Server routes
cp apps/server/src/routes/oauth.ts          your-repo/apps/server/src/routes/
cp apps/server/src/routes/meetings.ts       your-repo/apps/server/src/routes/
cp apps/server/src/routes/cli-execution.ts  your-repo/apps/server/src/routes/

# Web components & hooks
cp apps/web/src/office/components/KanbanBoard.tsx   your-repo/apps/web/src/office/components/
cp apps/web/src/office/components/OAuthPanel.tsx    your-repo/apps/web/src/office/components/
cp apps/web/src/office/components/MeetingPanel.tsx  your-repo/apps/web/src/office/components/
cp apps/web/src/office/components/CliRunPanel.tsx   your-repo/apps/web/src/office/components/
cp apps/web/src/office/hooks/useCliExecution.ts     your-repo/apps/web/src/office/hooks/
```

---

### 4. `app.ts` 교체

`apps/server/src/app.ts`를 패치 파일로 교체 (기존 라우트를 모두 포함하는 버전):

```bash
cp apps/server/src/app.ts  your-repo/apps/server/src/app.ts
```

---

### 5. `packages/db/src/index.ts` exports 추가

`@workspace/db` 패키지 진입점에 신규 서비스를 export합니다:

```typescript
// packages/db/src/index.ts에 추가
export { OAuthService } from "./services/OAuthService.js";
export { MeetingService } from "./services/MeetingService.js";
export {
  CliExecutionService,
  spawnCliAgent,
  stopCliAgent,
  buildAgentArgs,
  activeProcesses,
  type CliProvider,
} from "./services/CliExecutionService.js";
```

---

### 6. `packages/shared/src/index.ts` exports 추가

```typescript
// packages/shared/src/index.ts에 추가
export * from "./oauth-types.js";
```

---

### 7. 웹 컴포넌트 연결

`OfficePage.tsx`의 탭 구조에 컴포넌트를 추가합니다:

```tsx
import { KanbanBoard }  from "../components/KanbanBoard.js";
import { OAuthPanel }   from "../components/OAuthPanel.js";
import { MeetingPanel } from "../components/MeetingPanel.js";
import { CliRunPanel }  from "../components/CliRunPanel.js";

// 탭 메뉴에 추가 예시:
// <KanbanBoard />   → Kanban 탭
// <OAuthPanel />    → Settings 탭
// <MeetingPanel />  → Meetings 탭
// <CliRunPanel />   → CLI 탭
```

---

### 8. 빌드 & 실행

```bash
pnpm install
pnpm build
pnpm dev
```

---

## Kanban 컬럼 구성

| 순서 | key | 표시명 |
|------|-----|--------|
| 1 | `inbox` | 📥 Inbox |
| 2 | `planned` | 📋 Planned |
| 3 | `in_progress` | ⚙️ In Progress |
| 4 | `review` | 🔍 Review |
| 5 | `done` | ✅ Done |
| 6 | `cancelled` | ❌ Cancelled |

> claw-empire 8컬럼에서 DonggriCompany 태스크 상태에 맞게 6컬럼으로 조정됨

---

## CLI Provider 목록

| Provider | 커맨드 | 비고 |
|----------|--------|------|
| `claude` | `claude` | Claude Code CLI, stream-json 출력 |
| `codex` | `codex` | OpenAI Codex CLI |
| `gemini` | `gemini` | Google Gemini CLI |
| `opencode` | `opencode` | OpenCode CLI |
| `kimi` | `kimi` | Kimi CLI |

---

## 주요 설계 포인트

- **OAuth**: AES-256-GCM으로 토큰 암호화, PKCE는 Google에만 적용 (GitHub은 state만 사용)
- **CLI 타임아웃**: idle 5분 + hard 30분 이중 타임아웃, SIGTERM → SIGKILL 3초 fallback
- **Subtask 자동 감지**: Claude Code `tool_use Task` 이벤트를 stdout JSON에서 파싱해 subtasks 테이블에 자동 기록
- **WebSocket 재사용**: `broadcast()` 함수는 1차 패치의 `office-ws.ts`를 그대로 재사용
- **DB 싱글턴**: WAL 모드 + busy_timeout 5000ms로 잠금 충돌 방지
