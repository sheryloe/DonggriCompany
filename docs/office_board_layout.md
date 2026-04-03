# Office Board Layout (Step-5)

Route: `/dashboard`

Step-5 레이아웃은 "아바타 우선 + 운영 패널 fallback" 구조로 동작한다.

## 상단 영역

- TopOpsBar: providers/pools/profiles/latest probe 요약
- Avatar Shell: 메인 아바타 상태 + 말풍선 가이드

## 보드 구획

1. Account Pool Zone
2. Runtime Profile Cabinet
3. Probe Monitor Panel
4. History Board

각 구획은 `BoardZone`으로 감싸고 기존 Step-2~4 위젯을 재사용한다.

## 안정성 구조

- `AvatarLayerBoundary`가 아바타 렌더링 실패를 격리한다.
- 아바타 실패 시에도 account/profile/probe 핵심 조작 패널은 그대로 노출된다.

## 접근성/표현

- 핵심 상태 정보는 텍스트로 항상 제공한다.
- motion은 `prefers-reduced-motion` 설정을 존중한다.
