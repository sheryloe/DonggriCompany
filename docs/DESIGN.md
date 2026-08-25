---
name: Dongri-grigri
description: 실제 Control Plane 상태를 다음 판단으로 연결하는 시민 정보형 운영 인터페이스
colors:
  service-red: "#d92d20"
  service-red-deep: "#ae2018"
  warm-paper: "#f7f6f1"
  warm-paper-deep: "#eeece5"
  graphite: "#181918"
  graphite-soft: "#5f625f"
  hairline: "#c9cbc5"
  hairline-strong: "#858a84"
  warning: "#d88900"
  healthy: "#2f8d46"
  active: "#158b9d"
  historical: "#737874"
typography:
  display:
    fontFamily: "IBM Plex Sans KR, Noto Sans KR, Malgun Gothic, sans-serif"
    fontSize: "clamp(1.5rem, 2.5vw, 2.2rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "IBM Plex Sans KR, Noto Sans KR, Malgun Gothic, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "IBM Plex Sans KR, Noto Sans KR, Malgun Gothic, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "IBM Plex Sans KR, Noto Sans KR, Malgun Gothic, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
  brand:
    fontFamily: "IBM Plex Sans KR, Noto Sans KR, Malgun Gothic, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.2
  rail-counter:
    fontFamily: "IBM Plex Sans KR, Noto Sans KR, Malgun Gothic, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 800
    lineHeight: 1
  view-display:
    fontFamily: "IBM Plex Sans KR, Noto Sans KR, Malgun Gothic, sans-serif"
    fontSize: "clamp(2rem, 5vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 0.95
  view-counter:
    fontFamily: "IBM Plex Sans KR, Noto Sans KR, Malgun Gothic, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 5.5rem)"
    fontWeight: 800
    lineHeight: 0.8
  detail-title:
    fontFamily: "IBM Plex Sans KR, Noto Sans KR, Malgun Gothic, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.1
  mobile-counter:
    fontFamily: "IBM Plex Sans KR, Noto Sans KR, Malgun Gothic, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 0.9
rounded:
  control: "0.6rem"
  compact: "0.55rem"
  small: "0.5rem"
  soft: "1rem"
  pill: "999px"
spacing:
  xs: "0.55rem"
  sm: "0.8rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.service-red}"
    textColor: "#ffffff"
    rounded: "0"
    padding: "0 1.2rem"
  button-primary-hover:
    backgroundColor: "{colors.service-red-deep}"
    textColor: "#ffffff"
    rounded: "0"
    padding: "0 1.2rem"
---

# Design System: Dongri-grigri

## Overview

**Creative North Star: "서울 교통 운영도"**

Dongri-grigri의 기본 화면은 스위스 시민 정보 체계의 절제와 서울 지하철 노선도의 관계 표현을 결합한다. 프로젝트, 승인, 실행, 검토, 증거, 이력은 장식용 차트가 아니라 실제 상태를 읽는 노선·역·환승점으로 나타난다. 화면의 첫 질문은 “무엇이 얼마나 많은가”가 아니라 “지금 어떤 판단이 필요한가”이다.

기본 경험은 `/`의 Command Center이며, 기존 오피스 경험은 `/old`에서 호환 경로로 유지한다. 두 경험 모두 실제 레코드만 표시하고, 가짜 대화나 합성 운영 지표를 만들지 않는다.

**Key Characteristics:**

- 따뜻한 종이색 또는 무광 흑연색 바탕
- 번호가 붙은 다섯 운영 영역과 가는 구획선
- 서비스 레드를 제한적으로 쓰는 단일 주 행동
- 프로젝트 관계를 드러내는 코드 기반 노선 기하
- 상태·출처·저하를 숨기지 않는 한국어 우선 문구

## Colors

팔레트는 한 개의 강한 서비스 색, 네 개의 상태 색, 종이와 흑연 중립색으로 구성된다.

### Primary

- **서비스 레드:** 판단함과 즉시 확인이 필요한 상태에만 사용한다.

### Secondary

- **경고 앰버:** 변경 확인과 검토 대기를 나타낸다.
- **운행 그린:** 정상 실행과 연결 상태를 나타낸다.
- **활성 시안:** 후보 또는 다음 안전 작업을 나타낸다.
- **이력 그레이:** 완료·보관·역사 상태를 나타낸다.

### Neutral

- **따뜻한 종이:** 밝은 테마의 기본 표면이다.
- **무광 흑연:** 어두운 테마의 기본 표면이자 밝은 테마의 본문색이다.
- **헤어라인:** 카드 그림자 대신 영역·행·노선을 구분한다.

**The One Service Color Rule.** 서비스 레드는 주 행동과 실제 주의 상태에만 사용하며 장식적 강조에는 사용하지 않는다.

## Typography

**Display Font:** IBM Plex Sans KR 계열, Noto Sans KR와 Malgun Gothic 대체
**Body Font:** 동일한 한국어 안전 스택

**Character:** 좁고 단단한 공공 정보형 산세리프 계층을 사용한다. 크기보다 굵기, 간격, 구획선으로 위계를 만든다.

### Hierarchy

- **Display:** 첫 화면의 “오늘의 운영 판단” 한 곳에만 사용한다.
- **Title:** 노선도, 최근 업무, 우측 처리 목록의 제목에 사용한다.
- **Body:** 짧은 설명에 사용하며 약한 흑연색으로 위계를 낮춘다.
- **Label:** 숫자, 상태, 출처, 버튼, 내비게이션에 사용한다.

**The Korean Integrity Rule.** 깨진 한글은 시각 결함이 아니라 릴리스 차단 결함이다.

## Layout

데스크톱은 상단 상태 헤더, 번호형 좌측 내비게이션, 중앙 운영도, 우측 판단 레일의 세 영역으로 구성한다. 첫 화면에서 판단 수, 대기·실행·검토 수, 프로젝트 노선, 처리할 항목을 함께 읽을 수 있어야 한다.

`1180px` 아래에서는 우측 레일을 본문 아래로 옮기고, `860px` 아래에서는 좌측 내비게이션을 메뉴로 접는다. 모바일에서는 전체 SVG를 축소하지 않고 프로젝트 노선을 세로 목록으로 번역한다. `390x844`에서 루트 가로 넘침이 없어야 한다.

## Elevation & Depth

기본 표면은 평면이다. 깊이는 그림자가 아니라 헤어라인, 톤 차이, 고정 헤더의 반투명 배경으로 만든다. 모바일 메뉴가 열릴 때만 문맥 분리를 위한 약한 그림자를 허용한다.

**The Flat Operations Rule.** 운영 정보는 떠 있는 카드 묶음이 아니라 하나의 연속된 지도처럼 읽혀야 한다.

## Shapes

노선은 둥근 끝과 완만한 직각 전환을 사용하고, 역은 원과 이중 원으로 표시한다. 큰 콘텐츠 영역은 직각 구획을 유지한다. 반경은 테마 버튼, 오류 재시도, 보조 컨트롤처럼 손으로 조작하는 작은 요소에만 제한한다.

## Components

### Buttons

- **Primary:** 서비스 레드의 직각 전체 높이 행동으로, 화면당 한 개의 주 판단에 사용한다.
- **Hover / Focus:** 더 짙은 서비스 레드와 3px 외곽 포커스 링을 사용한다.
- **Secondary:** 종이/흑연 표면 위 1px 헤어라인 컨트롤로 표현한다.

### Cards / Containers

- **Corner Style:** 큰 운영 영역은 직각이며 반복 행만 선으로 분리한다.
- **Background:** 기본 표면을 공유하고 필요한 경우 한 단계 깊은 종이색만 사용한다.
- **Shadow Strategy:** 기본 그림자는 사용하지 않는다.

### Navigation

다섯 목적지는 `01–05` 번호와 한국어 명칭으로 구성한다. 현재 항목은 서비스 레드 세로선과 더 큰 번호로 표시한다. 모바일에서는 메뉴 버튼을 통해 같은 목적지를 노출한다.

### Project Route Map

실제 registry 프로젝트를 최대 다섯 노선으로 투영한다. 존재하지 않는 소스, 변경 상태, 정상, 후보, 이력은 색과 텍스트를 함께 사용한다. 로딩·오류·빈 상태는 노선 영역 안에서 처리하며, 선택적 Control Plane 투영 실패가 핵심 업무 상태를 지우면 안 된다.

### Agent, Skill, and Memory

기본 에이전트 모델은 여섯 마스터와 일회성 하위 에이전트다. 새 `에이전트·Skill` 화면은 실제 에이전트 프로필의 전문성, 검토 렌즈, 실행 제공자를 네이티브로 투영한다. 호환 화면은 부가 기능 확인용으로만 남고 기본 내비게이션 목적지가 아니다. Memory 쓰기·훅은 별도 승인 없이는 제공하지 않는다.

### URL and History

다섯 기본 화면은 `?view=`로 주소화하며 프로젝트·업무·에이전트 상세는 각 식별자를 쿼리에 기록한다. 새로고침, 뒤로가기, 앞으로가기는 같은 화면과 상세를 복원해야 한다.

### Command-to-Result Loop

명령 입력은 기획·개발·디자인·품질·운영·외부강사 중 하나의 실제 부서 역할을 선택한다. `업무 등록`과 `등록 후 실행`을 분리하고, 생성 성공 뒤에는 실제 업무 상세로 이동한다. 업무 상세는 기존 실행 API를 재사용해 실행·중지·재개, 터미널 로그, 최종 결과를 한 흐름으로 보여준다. 실패한 등록이나 실행은 성공처럼 닫지 않고 사용자에게 오류를 돌려준다.

공개 검증용 전체 루프는 별도 서비스나 감시기를 추가하지 않는다. 명시된 loopback API와 폐기 가능한 프로젝트 경로만 사용하고, 900초 이내에 명령 → 부서 → 에이전트 → 실행 → 결과를 검증한다.

### Accessibility Floor

본문과 상호작용 설명은 기본 `0.875rem`, 압축 상태 라벨은 `0.75rem` 아래로 내려가지 않는다. 모든 아이콘 버튼은 최소 `44px`이며, 모바일 메뉴는 열릴 때 첫 링크로 포커스를 이동하고 Escape 종료와 트리거 복귀를 제공한다. 축소 동작 설정에서는 shimmer만 제거하며 정보성 상태 변화는 숨기지 않는다.

## Do's and Don'ts

### Do:

- **Do** 실제 프로젝트·업무·승인·출처·저하 상태를 짧은 한국어로 표시한다.
- **Do** 상태를 색과 텍스트로 함께 전달한다.
- **Do** 밝고 어두운 테마, 키보드 포커스, 축소 동작, 모바일 재배치를 함께 검증한다.
- **Do** 새 기본 경험과 `/old` 호환 경험의 데이터 계약을 공유한다.

### Don't:

- **Don't** 동일 크기의 카드와 장식용 차트로 화면을 채우지 않는다.
- **Don't** 사이버펑크 네온, 터미널 벽지, 가짜 에이전트 대화를 사용하지 않는다.
- **Don't** 이미지를 런타임 지도처럼 고정하지 않는다. 노선은 실제 데이터에서 코드로 생성한다.
- **Don't** 공개 Alpha와 장기 인증을 같은 완료 상태로 표현하지 않는다.
