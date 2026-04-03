# Avatar Copy Guide (Step-5)

아바타 카피는 이벤트 기반으로 생성되며 운영 액션을 설명하고 다음 행동을 제안한다.

- 구현 파일: `apps/web/src/office/avatar/agent-copy.ts`
- 이벤트 타입: `apps/web/src/office/avatar/agent-types.ts`

## 카피 원칙

1. 상태 설명 + 다음 액션 제안을 한 화면에서 제공한다.
2. 실패 메시지는 raw exception dump 대신 조치 중심 문장으로 변환한다.
3. destructive action(삭제)은 확인 문구를 먼저 보여준다.

## 주요 이벤트 카피

- bootstrap-loading: 보드 준비 중 안내
- bootstrap-ready: provider/pool/profile 요약과 첫 행동 제안
- runtime-delete-intent: 삭제 전 재확인 안내
- runtime-create/update/delete-success: 작업 완료 피드백
- probe-run-start / probe-run-finish: 실행 진행/결과 요약
- probe-error: retry + 점검 경로 안내
- history-filter-changed: 필터 반영 사실과 no-match 가능성 안내
- history-empty: 필터 완화/재실행 제안

## 문체 가이드

- 짧고 명확한 운영 문장 사용
- 책임 소재가 모호한 표현 지양
- 상태명(success/partial/stale/no-signal/error) 의미를 흐리지 않음
