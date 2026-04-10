# skills.md

이 문서는 DonggriCompany에서 사용하는 **캐릭터(아바타) 실행 스킬 체계**의 최신 운영 기준입니다.

## 1) 운영 원칙
- 기본 회사팩은 `development`로 고정합니다.
- 명시 팩(`workflow_pack_key`)이 있으면 항상 명시값을 우선합니다.
- 명시 팩이 없으면 텍스트 기반 라우팅을 수행하고, `donggri` 신호가 강하면 `donggri`로 자동 라우팅합니다.
- 자동 라우팅으로 선택된 팩은 `officePackHydratedPacks`에 기록해 재선택 비용을 줄입니다.

## 2) 캐릭터 2x/심사숙고 모드
모든 아바타는 `workflow_profile`로 제어합니다.

```json
{
  "role": "primary_author | reviewer",
  "review_lenses": ["security", "performance", "ux"],
  "two_pass_required": true,
  "max_review_rounds": 2
}
```

### 기본값
- Jules: `primary_author`, `two_pass_required=true`, `max_review_rounds=2`
- 그 외 아바타: `reviewer`, `two_pass_required=true`
- 레거시 에이전트(`workflow_profile` 없음): 런타임 기본값 주입

## 3) Jules 중심 2x 리뷰 파이프라인
1. Jules 초안 생성
2. 리뷰어 최대 3명 병렬 리뷰(`review_lenses` 기준)
3. 합의(Consensus)에서 `pass2(counter-check)` 우선 반영
4. `blocker=0`이면 즉시 승인
5. `blocker>0`이면 Jules 재작업(2x) + 라운드2 재검토
6. 라운드2 종료 후 blocker 잔존 시 `reject + escalation`

리뷰 계약 필드(필수):
- `pass1`
- `pass2`
- `final_verdict`
- `confidence`
- `blocking_items`

누락 시 파서 실패 처리 후 재시도합니다.

## 4) 스킬/렌즈 권장 매핑
- `security`: 보안 경계, 권한, 입력 검증
- `performance`: 병목, 쿼리/렌더 비용, 캐시
- `ux`: 사용자 흐름, 문구 명확성, 상태 피드백
- `reliability`: 실패 복구, 타임아웃, 재시도
- `maintainability`: 결합도, 타입 안정성, 테스트 공백

## 5) 한글 깨짐 방지 규칙
- CLI 스트림 정규화에서 Windows 인코딩(euc-kr) fallback 디코딩을 사용합니다.
- 서브태스크 제목은 저장/조회 모두 정규화합니다.
- 모지바케 패턴(`?쒕툕...`)은 `서브태스크 제목N`으로 복구합니다.
- 응답 직전(display)에서도 마지막 방어선 정규화를 수행합니다.

## 6) 요청사항 대응 체크리스트
- [x] 캐릭터별 2x/심사숙고 모드 입력 UI
- [x] Jules primary author 고정 파이프라인
- [x] 리뷰 라운드 상한(2라운드)
- [x] 동그리+회사팩(development) 동시 정책
- [x] 한글 깨짐 복구(서브태스크/스트림)
- [x] 자동 테스트 추가 및 통과

## 7) PowerShell 운영 명령
```powershell
# API 테스트
corepack pnpm run test:api

# WEB 테스트
corepack pnpm run test:web

# 컨테이너 재시작
docker compose restart donggricompany

# 상태/로그 점검
docker compose ps
docker compose logs --tail 200 donggricompany
```
