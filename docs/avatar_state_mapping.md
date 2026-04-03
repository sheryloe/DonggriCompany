# Avatar State Mapping (Step-5)

Step-5는 probe 상태 표현을 `classifyProbeUiState`에서 시작해 단일 매핑으로 확장한다.

- 상태 분류 소스: `apps/web/src/office/lib/probe-ui-state.ts`
- 표현 매핑 소스: `apps/web/src/office/lib/probe-presentation.ts`
- 가이드 카피 소스: `apps/web/src/office/avatar/agent-copy.ts`

| Probe UI State | Avatar Mood | Board Signal | Copy Tone | User Suggestion |
|---|---|---|---|---|
| success | calm | stable | normal | 필요 시 history 추이 확인 |
| partial | cautious | mixed | caution | retry 또는 CLI 출력 점검 |
| stale | sleepy | dim | nudge | probe 재실행으로 최신화 |
| no-signal | disconnected | muted | caution | 필터 완화 또는 probe 실행 |
| error | alert | warning | critical | retry 후 runbook 점검 |

## 불변 규칙

1. 상태 해석은 `classifyProbeUiState` 단일 진입점만 사용한다.
2. 컴포넌트별 임의 상태 해석 로직을 추가하지 않는다.
3. 아바타/배지/보드 텍스트는 같은 상태 값을 공유한다.
