# Step-5 Avatar Agent Status

Date: 2026-04-03  
Scope: PRN_05 Avatar-Agent-First Office Board

## 완료 항목

- `/dashboard`를 Step-5 아바타 오피스 보드로 교체.
- `classifyProbeUiState`를 `apps/web/src/office/lib/probe-ui-state.ts`로 분리해 상태 해석 단일화.
- `ProbeUiState -> avatar/board/copy` 매핑 유틸 추가.
- 아바타 셸(상태 표시 + 말풍선 가이드) 추가.
- 보드 구획(Account Pool / Runtime Profile / Probe Monitor / History Board) 레이아웃 적용.
- runtime profile 삭제 확인 흐름에 아바타 안내 연동.
- history 필터/empty/retry 안내를 아바타 이벤트와 연결.
- 아바타 레이어 오류 시 fallback 패널이 계속 동작하도록 boundary 적용.

## 현재 상태

- Step-5 구현: 진행 완료
- Step-5 테스트: PASS (`typecheck/lint/test`)
- Step-5 문서: 본 문서 포함 5종 추가

## Known Limitations

- 아바타 표현은 CSS 기반 2D MVP이며 스킨/모션 시스템은 향후 확장 예정.
- 아바타 카피는 규칙 기반 이벤트 매핑이며 자연어 대화형 에이전트는 범위 외.
