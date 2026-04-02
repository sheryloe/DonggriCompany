# Step 3 — React UI Codex Task Cards + API Scope

## 목적
Step 3은 **직원(Employee) 중심 오피스 UI**를 구현하는 단계다.
이 단계의 범위는 다음과 같다.

- 직원 목록 / 상세 / 배치 시각화
- 오피스 메인 화면
- 활성 세션 스트립
- 이벤트 타임라인
- inspector 패널
- SSE 기반 실시간 상태 반영
- 수동 runtime override UI

이 단계는 **OAuth 구현 단계가 아니다.**
Claude / Codex / Gemini / Jules의 OAuth 로그인과 credential 저장은 각 공식 CLI 또는 provider가 처리한다.
Step 3 프론트엔드는 **로컬 오케스트라 서버의 내부 API**만 사용한다.

---

# 1. API 범위 정리

## 1.1 Step 3에서 유지할 API
이 API들은 UI 구현에 직접 필요하다.

### Employees
- `GET /api/employees`
- `GET /api/employees/:employeeId`
- `POST /api/employees`
- `PATCH /api/employees/:employeeId`
- `POST /api/employees/:employeeId/assignments`

### Office / Layout
- `GET /api/workspaces`
- `GET /api/workspaces/:workspaceId`
- `PATCH /api/workspaces/:workspaceId/layout`

### Sessions
- `GET /api/sessions/active`
- `GET /api/sessions/:sessionId`
- `POST /api/sessions/:sessionId/override-runtime`
- `POST /api/sessions/:sessionId/pause`
- `POST /api/sessions/:sessionId/resume`

### Timeline / Event Stream
- `GET /api/timeline`
- `GET /api/events/stream`  (SSE)

### Runtime / Display Data
- `GET /api/runtime-profiles`
- `GET /api/account-pools`
- `GET /api/providers/status`

### UI bootstrap helper
- `GET /api/office/bootstrap`

추천 응답 구성:
- employees
- workspaces
- activeSessions
- runtimeProfiles
- providerStatuses
- accountPools
- timelinePreview

이 endpoint는 오피스 메인 진입 시 초기 렌더 성능을 위해 둔다.

---

## 1.2 Step 3에서 제거하거나 숨길 API
이 단계에서는 아래 API를 프론트 화면과 직접 연결하지 않는다.

### 제거 대상: OAuth / auth callback류
- `POST /api/oauth/*`
- `GET /api/auth/*`
- `GET /api/providers/:provider/login`
- `GET /api/providers/:provider/callback`
- `POST /api/providers/:provider/token`
- `POST /api/providers/:provider/refresh`
- `DELETE /api/providers/:provider/session`

이유:
- OAuth는 provider CLI가 처리한다.
- 프론트가 토큰, refresh, callback에 접근할 필요가 없다.
- 보안상 UI에 노출하면 안 된다.

### 제거 대상: 외부 webhook / Telegram bridge
- `POST /api/webhooks/*`
- `POST /api/telegram/*`
- `GET /api/telegram/*`

이유:
- Telegram은 Step 4 범위다.

### 제거 대상: provider raw control API
- `POST /api/providers/:provider/exec`
- `POST /api/providers/:provider/shell`
- `POST /api/providers/:provider/raw-command`

이유:
- 프론트가 CLI raw command를 직접 치면 안 된다.
- Step 3 UI는 orchestration 상태를 제어해야지 provider shell을 직접 노출하면 안 된다.

---

# 2. 프론트엔드 데이터 모델

## 2.1 EmployeeCardVM
```ts
export type EmployeeCardVM = {
  id: string;
  name: string;
  avatarType: 'human' | 'animal' | 'robot' | 'pixel';
  avatarAsset: string;
  roleKey: string;
  workspaceId: string | null;
  status: 'idle' | 'assigned' | 'working' | 'blocked' | 'paused' | 'offline';
  currentRuntimeLabel?: string;
  currentSessionId?: string;
  presence: 'online' | 'busy' | 'away';
  progressPct?: number;
  heatPct?: number;
};
```

## 2.2 ActiveSessionVM
```ts
export type ActiveSessionVM = {
  id: string;
  employeeId: string;
  employeeName: string;
  taskTitle: string;
  runtimeProfileId: string;
  runtimeLabel: string;
  provider: 'claude' | 'codex' | 'gemini' | 'jules';
  startedAt: string;
  status: 'planning' | 'working' | 'waiting_approval' | 'paused' | 'error' | 'done';
  progressPct?: number;
  heatPct?: number;
  latestEventSummary?: string;
};
```

## 2.3 TimelineEventVM
```ts
export type TimelineEventVM = {
  id: string;
  ts: string;
  kind:
    | 'employee.created'
    | 'employee.assigned'
    | 'session.started'
    | 'session.updated'
    | 'session.runtime_switched'
    | 'session.paused'
    | 'session.resumed'
    | 'session.error'
    | 'session.completed';
  title: string;
  body?: string;
  employeeId?: string;
  sessionId?: string;
  provider?: 'claude' | 'codex' | 'gemini' | 'jules';
};
```

---

# 3. Codex 작업 방식

각 task는 다음 원칙을 따른다.

- 한 task는 하나의 주된 UI vertical만 구현한다.
- API 계약은 이미 존재한다고 가정하되, 없으면 mock adapter를 먼저 만든다.
- 모든 fetch는 `src/features/*/api/*.ts`에 모은다.
- 페이지 컴포넌트와 presentational 컴포넌트를 분리한다.
- 실시간 이벤트는 SSE hook으로 통합 처리한다.
- provider OAuth 관련 화면은 만들지 않는다.

---

# 4. Task Cards

## T301_office_route_shell

### 목표
오피스 메인 라우트와 레이아웃 셸을 만든다.

### 범위
- `/office` route 생성
- 좌측 task rail 자리
- 중앙 office canvas 자리
- 우측 inspector panel 자리
- 하단 timeline dock 자리
- 상단 operations bar 자리

### 입력
- `Step3_React_Wireframe_Component_Spec.md`

### 출력 파일
- `src/app/office/page.tsx`
- `src/features/office/components/OfficeLayout.tsx`
- `src/features/office/components/OfficeTopBar.tsx`
- `src/features/office/components/OfficeCanvas.tsx`
- `src/features/office/components/OfficeInspectorDock.tsx`
- `src/features/office/components/OfficeTimelineDock.tsx`

### API 사용
- 없음 또는 `GET /api/office/bootstrap` mock 연결만 허용

### 완료 조건
- `/office` 진입 가능
- 빈 레이아웃이 깨지지 않음
- 반응형 3-column + bottom dock 레이아웃 적용

---

## T302_office_bootstrap_query_layer

### 목표
오피스 초기 데이터 로딩 계층을 만든다.

### 범위
- `GET /api/office/bootstrap` fetcher
- query hook
- loading / error / retry 처리
- mock fallback 지원

### 출력 파일
- `src/features/office/api/getOfficeBootstrap.ts`
- `src/features/office/hooks/useOfficeBootstrap.ts`
- `src/features/office/mappers/bootstrapMappers.ts`
- `src/features/office/types.ts`

### API 사용
- `GET /api/office/bootstrap`

### 제거 API
- OAuth callback/login/token 관련 endpoint 참조 금지

### 완료 조건
- 초기 데이터가 typed VM으로 변환됨
- loading skeleton / error state 표시됨

---

## T303_employee_grid_and_cards

### 목표
직원 목록과 카드 렌더링을 구현한다.

### 범위
- 직원 카드 grid/list
- 상태 dot
- runtime badge
- progress / heat 표시
- selection state

### 출력 파일
- `src/features/employees/components/EmployeeGrid.tsx`
- `src/features/employees/components/EmployeeCard.tsx`
- `src/features/employees/components/EmployeeStatusPill.tsx`
- `src/features/employees/components/RuntimeBadge.tsx`

### API 사용
- bootstrap payload의 `employees`
- 필요 시 `GET /api/employees`

### 완료 조건
- 최소 20개 직원 카드 렌더링에서 레이아웃이 유지됨
- 클릭 시 employee selected state 반영

---

## T304_workspace_canvas_and_zones

### 목표
오피스 중앙 캔버스와 workspace zone 렌더링을 구현한다.

### 범위
- workspace zone 박스
- 직원 배치
- idle / research / coding / review / async cloud zone 표현
- 선택된 직원 하이라이트

### 출력 파일
- `src/features/workspaces/components/WorkspaceCanvas.tsx`
- `src/features/workspaces/components/WorkspaceZone.tsx`
- `src/features/workspaces/components/EmployeeSprite.tsx`
- `src/features/workspaces/components/EmployeeDeskToken.tsx`

### API 사용
- bootstrap payload의 `workspaces`
- 필요 시 `GET /api/workspaces`

### 완료 조건
- zone별 직원 배치가 시각적으로 보임
- employee selection과 sync됨

---

## T305_active_sessions_strip

### 목표
활성 세션 스트립을 구현한다.

### 범위
- active sessions horizontal strip
- provider badge
- task title
- progress
- waiting approval / paused / error 표시

### 출력 파일
- `src/features/sessions/components/ActiveSessionStrip.tsx`
- `src/features/sessions/components/SessionStripCard.tsx`
- `src/features/sessions/components/SessionStateIcon.tsx`

### API 사용
- bootstrap payload의 `activeSessions`
- 필요 시 `GET /api/sessions/active`

### 완료 조건
- 세션 10개 이상에서도 가로 스크롤 동작
- employee selection과 session selection 연동

---

## T306_inspector_panel

### 목표
직원/세션 상세 인스펙터를 구현한다.

### 범위
- employee summary
- current session info
- runtime profile 정보
- provider status 요약
- manual override panel
- pause/resume actions

### 출력 파일
- `src/features/inspector/components/InspectorPanel.tsx`
- `src/features/inspector/components/EmployeeInspector.tsx`
- `src/features/inspector/components/SessionInspector.tsx`
- `src/features/inspector/components/RuntimeOverrideForm.tsx`

### API 사용
- `GET /api/employees/:employeeId`
- `GET /api/sessions/:sessionId`
- `GET /api/runtime-profiles`
- `GET /api/providers/status`
- `POST /api/sessions/:sessionId/override-runtime`
- `POST /api/sessions/:sessionId/pause`
- `POST /api/sessions/:sessionId/resume`

### 제거 API
- `POST /api/providers/:provider/raw-command`
- `GET /api/providers/:provider/login`

### 완료 조건
- employee/session 선택 상태에 따라 inspector가 정상 전환
- runtime override modal 또는 inline form 동작

---

## T307_timeline_dock

### 목표
하단 타임라인 도크를 구현한다.

### 범위
- 최신 이벤트 목록
- filter by kind/provider
- compact / expanded mode
- 클릭 시 employee/session deep link

### 출력 파일
- `src/features/timeline/components/TimelineDock.tsx`
- `src/features/timeline/components/TimelineEventRow.tsx`
- `src/features/timeline/components/TimelineFilters.tsx`

### API 사용
- `GET /api/timeline`

### 완료 조건
- 이벤트 100개까지 렌더링 가능
- kind/provider filter 동작

---

## T308_sse_event_integration

### 목표
SSE 스트림을 연결해 실시간 상태 갱신을 구현한다.

### 범위
- SSE subscribe hook
- event parsing
- office store patching
- reconnect/backoff
- visibility change 대응

### 출력 파일
- `src/features/events/api/connectOfficeEventStream.ts`
- `src/features/events/hooks/useOfficeEventStream.ts`
- `src/features/events/reducers/applyOfficeEvent.ts`

### API 사용
- `GET /api/events/stream`

### 완료 조건
- session started/updated/completed 이벤트가 UI에 반영됨
- reconnect 후 중복 반영 최소화

---

## T309_provider_status_bar

### 목표
상단 provider/account pool status bar를 구현한다.

### 범위
- provider online/offline
- account pool fatigue bar
- current runtime counts
- warning state

### 출력 파일
- `src/features/providers/components/ProviderStatusBar.tsx`
- `src/features/providers/components/AccountPoolMeter.tsx`
- `src/features/providers/components/ProviderHealthBadge.tsx`

### API 사용
- bootstrap payload의 `providerStatuses`, `accountPools`
- 필요 시 `GET /api/account-pools`
- 필요 시 `GET /api/providers/status`

### 완료 조건
- claude/codex/gemini/jules bar가 렌더링됨
- usage precision badge 표시 가능

---

## T310_task_rail_placeholder

### 목표
좌측 작업 레일 placeholder를 구현한다.

### 범위
- task queue stub
- drag source placeholder
- selected employee와 연결될 future hook 자리

### 출력 파일
- `src/features/tasks/components/TaskRail.tsx`
- `src/features/tasks/components/TaskCardStub.tsx`

### API 사용
- 현재는 mock 데이터만 허용
- Step 4 이전에는 task create API 붙이지 않아도 됨

### 완료 조건
- 레이아웃이 완성되고 future integration 포인트가 드러남

---

## T311_office_state_store

### 목표
오피스 화면 전역 상태 저장소를 구현한다.

### 범위
- selectedEmployeeId
- selectedSessionId
- office view mode
- timeline filters
- inspector tab
- sse-patched normalized state

### 출력 파일
- `src/features/office/store/useOfficeStore.ts`
- `src/features/office/store/selectors.ts`

### API 사용
- 직접 없음

### 완료 조건
- selection / filters / real-time patch state가 일관성 있게 유지됨

---

## T312_ui_polish_states

### 목표
로딩, 에러, 빈 상태를 정리한다.

### 범위
- loading skeletons
- empty states
- provider unavailable banner
- reconnecting SSE banner
- inspector no-selection state

### 출력 파일
- `src/features/shared/components/LoadingSkeleton.tsx`
- `src/features/shared/components/EmptyState.tsx`
- `src/features/shared/components/ErrorState.tsx`
- `src/features/shared/components/Banners.tsx`

### API 사용
- 기존 query 상태 기반

### 완료 조건
- 정상/로딩/에러/빈 상태가 모두 시각적으로 구분됨

---

# 5. 권장 구현 순서

1. T301_office_route_shell
2. T302_office_bootstrap_query_layer
3. T311_office_state_store
4. T303_employee_grid_and_cards
5. T304_workspace_canvas_and_zones
6. T305_active_sessions_strip
7. T306_inspector_panel
8. T307_timeline_dock
9. T309_provider_status_bar
10. T308_sse_event_integration
11. T310_task_rail_placeholder
12. T312_ui_polish_states

---

# 6. Codex에 줄 때의 지시 방식

각 task는 아래 템플릿으로 넘긴다.

## 템플릿
- 목적
- 수정 가능한 경로
- 수정 금지 경로
- 사용할 API
- 절대 사용 금지 API
- 완료 조건
- 검증 명령

예시:

```md
Implement T306_inspector_panel.

Allowed paths:
- src/features/inspector/**
- src/features/runtime-profiles/**
- src/features/providers/**

Do not modify:
- backend routes
- OAuth logic
- provider CLI adapters

Allowed APIs:
- GET /api/employees/:employeeId
- GET /api/sessions/:sessionId
- GET /api/runtime-profiles
- GET /api/providers/status
- POST /api/sessions/:sessionId/override-runtime
- POST /api/sessions/:sessionId/pause
- POST /api/sessions/:sessionId/resume

Forbidden APIs:
- GET /api/providers/:provider/login
- POST /api/providers/:provider/token
- POST /api/providers/:provider/raw-command

Acceptance criteria:
- Inspector shows employee summary and session summary.
- Runtime override UI submits successfully.
- Pause/resume actions show optimistic state.

Validation:
- pnpm lint
- pnpm typecheck
- pnpm test --filter inspector
```

---

# 7. 결론

Step 3에서 필요한 것은 **UI 내부 API 매핑**이다.
OAuth 관련 API는 Step 3 프론트 범위에서 제거한다.

정리:
- 남길 것: employees / sessions / office bootstrap / timeline / events stream / runtime profiles / provider status / account pools
- 제거할 것: oauth callback / token refresh / login redirect / raw provider shell / telegram bridge / external webhook
