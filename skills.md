# skills.md

이 문서는 DonggriCompany의 캐릭터(아바타) 실행 규칙을 한국어 기준으로 정리한 운영 문서입니다.

## 1. 목적
- 대표 요청을 UI 내부에서 바로 PRN으로 만들고 지시까지 전환
- Jules 중심 2x 리뷰 파이프라인 일관 적용
- 캐릭터별 2배 모드/심사숙고 모드 설정 표준화
- 한글 깨짐 없는 업무 카드/서브태스크 표시 보장

## 2. 캐릭터 모드 정의

### 2배 모드 (2x)
- 의미: 같은 과업을 `초기판단(pass1)` + `반증검사(pass2)`로 2회 검토
- 강제 필드: `pass1`, `pass2`, `final_verdict`, `confidence`, `blocking_items`
- 누락 시 처리: 파서 실패 → 재시도

### 심사숙고 모드
- 의미: 결론 전에 반례/리스크를 별도 점검
- 구현 기준: `two_pass_required=true`
- 적용 대상: Jules + reviewer 기본 전원

## 3. workflow_profile 표준

```json
{
  "role": "primary_author | reviewer",
  "review_lenses": ["security", "performance", "ux"],
  "two_pass_required": true,
  "max_review_rounds": 2
}
```

기본값:
- Jules: `primary_author`, `two_pass_required=true`, `max_review_rounds=2`
- 기타: `reviewer`, `two_pass_required=true`
- 레거시 에이전트: `workflow_profile` 없으면 런타임 기본값 주입

## 4. Jules 중심 리뷰 파이프라인
1. Jules 초안 작성
2. reviewer 최대 3명 fan-out
3. 합의기(consensus)에서 `pass2`를 blocker 계산 우선값으로 사용
4. 라운드1 결과:
   - blocker=0 → 승인
   - blocker>0 → Jules 재작업(필수)
5. 라운드2 결과:
   - blocker=0 → 승인
   - blocker>0 → reject + escalation (추가 라운드 없음)

## 5. 대표 PRN 작성 기능 규칙
- 입력 방식: `PRN 작성` 버튼 또는 `/prn <요구사항>`
- 생성 API: `POST /api/directives/prn-draft`
- PRN 섹션(표준형 v1):
  - 배경
  - 목표
  - 비목표
  - 핵심요구사항
  - 수용기준
  - 리스크
  - 오픈질문
  - 지시문 초안
- 모달 액션 고정:
  - 지시 전송
  - 초안 재생성
  - 취소
- 지시 전송: 기존 directive API 재사용 + `source: "prn_ui"`

## 6. 팩 정책 (회사팩 + 동그리팩)
- 전역 기본팩: `development`
- 명시팩(`workflow_pack_key`)이 있으면 명시값 우선
- 명시팩이 없을 때만 텍스트 라우팅으로 `donggri` 자동 선택
- 자동 선택 팩은 `officePackHydratedPacks`에 반영

## 7. 스킬 렌즈 한글화 매핑
- `security`: 보안/권한/입력검증
- `performance`: 성능/병목/리소스 비용
- `ux`: 사용자 흐름/문구/피드백
- `reliability`: 실패복구/재시도/타임아웃
- `maintainability`: 코드 구조/결합도/테스트 공백

## 8. 한글 깨짐 방지 운영 규칙
- 서브태스크 제목 정규화는 아래 경로에 공통 적용
  - 저장
  - 조회
  - 브로드캐스트
  - 렌더
- 모지바케 패턴(`?쒕툕...`) 감지 시 안전 라벨 치환
- Decision Inbox/캐릭터 카드에서 마지막 렌더 방어 정규화 1회 추가

## 9. 검증 절차 (PowerShell)

```powershell
# 빌드
corepack pnpm run build

# 테스트
corepack pnpm run test:web
corepack pnpm run test:api

# 통합 스모크
$env:QA_API_AUTH_TOKEN="<API_AUTH_TOKEN>"
node .\scripts\qa\prn-review-pipeline-smoke.mjs

# 도커 재기동 및 상태 확인
docker compose restart donggricompany
docker compose ps
docker compose logs --tail 200 donggricompany
```
