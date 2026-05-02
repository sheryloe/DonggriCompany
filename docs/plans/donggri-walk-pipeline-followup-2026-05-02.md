# Donggri 4방향 walk pipeline 후속 보고서

작성일: 2026-05-02

## 목적

- 기존 front 중심 3프레임 스프라이트를 4방향 3프레임 walk 계약으로 분리한다.
- reserve visual profile은 신규 채용, 프로젝트팩, 직원 교체 승인 전까지 비활성 상태로 유지한다.
- 오피스 floor layout 이후 후속 리팩터링 범위를 업무 카드와 직원 상세 화면으로 분리한다.
- 커밋에 포함하지 않는 파일 범위를 규칙으로 명시해 산출물과 로컬 상태를 분리한다.

## 적용 내용

- `tools/agents/build-agent-sprites-from-sheet.mjs`
  - 44개 런타임 스프라이트를 `D/L/B/R` 4방향, 각 3프레임으로 정규화한다.
  - `public/generated/agent-visual-profiles/sprite-normalization-manifest-v1.json`을 생성한다.
  - 프레임 크기는 96px, 콘텐츠 최대 크기는 84px로 고정한다.
- `src/components/office-view/spriteAssets.ts`
  - 방향과 프레임 계약을 `AGENT_SPRITE_DIRECTIONS`, `AGENT_SPRITE_WALK_FRAMES`로 분리했다.
  - 이동 좌표 기반으로 `D/L/B/R` 방향을 결정한다.
- `src/components/office-view/spriteActors.ts`
  - 4방향 walk actor 생성과 방향 전환 로직을 공통화했다.
  - 누락 방향은 front 방향으로 안전 fallback한다.
- `src/components/office-view/*`
  - 사무실 상주 직원, 회의 이동, 부서 간 전달, CEO 호출 애니메이션이 같은 walk actor를 사용한다.
  - 좌우 이동은 더 이상 스프라이트 반전으로 처리하지 않고 방향별 프레임을 사용한다.
- `server/modules/bootstrap/schema/organization-manifest.ts`
  - reserve visual profile 활성화 정책을 canonical 상수로 추가했다.
- `AGENTS.md`
  - reserve 활성화 조건과 커밋 제외 범위를 운영 규칙으로 명시했다.

## 커밋 제외 규칙

- `.tmp/`, `reports/`, `data/`, `logs/`, `coverage/`, `dist/`는 커밋하지 않는다.
- 로컬 DB, 인증 저장소, 토큰, secret 원문은 커밋하지 않는다.
- `agents/archive/`는 source of truth가 아니므로 별도 승인 없이는 커밋하지 않는다.
- 런타임 이미지 산출물은 generator, source manifest, normalization manifest가 함께 추적될 때만 커밋한다.

## 후속 분리 대상

- 실제 4방향 walk 품질 고도화는 별도 `walk-normalize` asset pipeline으로 분리한다.
- reserve profile 22번 이후 활성화는 신규 채용, 프로젝트팩, 직원 교체 플로우에서만 수행한다.
- 오피스 내부 UI의 다음 리팩터링은 업무 카드와 직원 상세 화면으로 분리한다.
