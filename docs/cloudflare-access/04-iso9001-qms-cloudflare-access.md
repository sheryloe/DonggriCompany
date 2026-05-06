# ISO 9001 품질운영 명세서: Cloudflare Access 운영 체계

작성일: 2026-04-29
대상: DonggriCompany Cloudflare Access 원격 운영
기준: ISO 9001:2015
주의: 사용자가 언급한 `ISO 90001`은 일반적으로 `ISO 9001`을 의미한다. ISO 공식 문서 기준 2026-04-29 현재 운영 기준은 ISO 9001:2015이며, ISO/FDIS 9001은 정식 승인 전 단계다.

## 1. 품질운영 목적

Cloudflare Access 기반 DonggriCompany 외부 접속 운영을 반복 가능하고 검증 가능한 품질경영 프로세스로 만든다.

목표:

```text
접근통제 일관성
명령 실행 안정성
변경 추적성
검증 증거 보관
장애/부적합 재발 방지
지속적 개선
```

## 2. ISO 9001:2015 조항 매핑

| ISO 9001 영역 | 적용 방식 | 산출 증거 |
| --- | --- | --- |
| 4. 조직 상황 | 개인 운영 시스템 범위와 이해관계자 정의 | 본 문서, PRN, 설계 명세서 |
| 5. 리더십 | 운영 책임자와 승인 기준 정의 | 승인 기록, 변경 기록 |
| 6. 기획 | 리스크/기회, 품질 목표 정의 | risk register, quality objectives |
| 7. 지원 | 문서, 역량, 도구, secret 관리 | 운영 매뉴얼, 환경 체크리스트 |
| 8. 운영 | 구축/변경/검증 절차 표준화 | runbook, smoke 결과 |
| 9. 성과 평가 | health, Access log, task success 측정 | KPI report, audit log |
| 10. 개선 | incident/CAPA/lesson 반영 | corrective action record |

## 3. 품질 범위

포함:

```text
Cloudflare Access application
Cloudflare Tunnel
DonggriCompany Docker runtime
외부 dashboard 접속
chat/directive/task/PRN smoke
WebSocket 상태 반영
Telegram receiver/relay 연계
운영 문서와 검증 증거
```

제외:

```text
Cloudflare 전체 계정 보안 인증
ISO 인증기관 심사 대행
VPS/Cloudflare Workers 이식
공개 사용자 서비스 운영
제3자 multi-user RBAC
```

## 4. 이해관계자

| 이해관계자 | 요구 |
| --- | --- |
| 사용자/운영자 | 외부에서 본인만 접속, 명령 실행 가능 |
| DonggriCompany 시스템 | 인증된 요청만 처리, project path 안전성 유지 |
| Cloudflare | Access/Tunnel 정책 정상 구성 |
| 로컬 PC/runner | 켜져 있을 때 안정 실행 |
| Telegram 보고 채널 | 결과 보고 누락 최소화 |

## 5. 역할과 책임

| 역할 | 책임 |
| --- | --- |
| 운영 책임자 | Cloudflare 설정 승인, secret 보관, 변경 승인 |
| 시스템 관리자 | Docker/cloudflared 실행, health 확인 |
| 보안 검토자 | Access policy, secret 노출, Bypass 여부 점검 |
| QA 검증자 | 외부 접속, 차단, WebSocket, 명령 smoke 검증 |
| 문서 관리자 | 명세서, 변경 기록, 증거 보관 |

개인 운영에서는 사용자가 모든 역할을 겸할 수 있다. 단, 기록은 역할별 항목으로 남긴다.

## 6. 문서 관리

관리 문서:

```text
docs/cloudflare-access/00-required-cloudflare-info.md
docs/cloudflare-access/01-prn-cloudflare-access.md
docs/cloudflare-access/02-build-cloudflare-access.md
docs/cloudflare-access/03-design-cloudflare-access.md
docs/cloudflare-access/04-iso9001-qms-cloudflare-access.md
docs/remote-access-strategy-report.md
```

문서 규칙:

```text
작성일 포함
변경 목적 포함
secret 원문 금지
검증 절차 포함
완료 기준 포함
```

## 7. 품질 목표

| 목표 | 기준 | 측정 |
| --- | --- | --- |
| 본인만 접속 | 비허용 계정 100% 차단 | Access 차단 smoke |
| 외부 대시보드 동작 | 인증 후 dashboard/API/WS 정상 | 외부 브라우저 smoke |
| 명령 실행 가능 | PRN 또는 test directive 처리 | task/message 로그 |
| secret 무노출 | repo/docs에 secret 원문 0건 | git diff + 검색 |
| 변경 추적 | 운영 변경 100% 기록 | change record |
| 장애 재발 방지 | incident별 CAPA 1건 이상 | incident/CAPA log |

## 8. 운영 프로세스

### 8.1 구축 전 검토

체크:

```text
도메인 확인
Access application 생성 여부
Allow policy 이메일 확인
Bypass 없음 확인
origin URL 확인
.env secret 존재 확인
Docker health 확인
```

### 8.2 변경 승인

변경이 필요한 경우 아래 양식으로 기록한다.

```markdown
## Change Record

- 날짜:
- 변경자:
- 변경 대상:
- 변경 이유:
- 변경 전 상태:
- 변경 후 상태:
- 리스크:
- 롤백 방법:
- 검증 결과:
- 승인:
```

### 8.3 검증

필수 smoke:

```powershell
Set-Location "<PROJECT_ROOT>"
docker compose ps
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/health" | ConvertTo-Json -Compress
cloudflared tunnel list
```

브라우저 smoke:

```text
외부 네트워크 접속
Access 로그인
Dashboard 렌더링
WebSocket 상태 반영
/prn smoke 요청
비허용 계정 차단 확인
```

### 8.4 운영 모니터링

일일 또는 사용 전 확인:

```text
PC 전원/절전 상태
Docker container 상태
cloudflared 상태
Cloudflare Access 최근 로그인
DonggriCompany health
task failure 여부
```

### 8.5 부적합 처리

부적합 예:

```text
비허용 계정이 접근 가능
Access 없이 tunnel route 노출
secret repo 노출
외부 session bootstrap 실패
명령 실행 실패
WebSocket 미연결
```

CAPA 양식:

```markdown
## Corrective Action

- 발생일:
- 부적합 내용:
- 영향 범위:
- 즉시 조치:
- 근본 원인:
- 재발 방지책:
- 검증 방법:
- 완료일:
- 담당:
```

## 9. 리스크 관리

| 리스크 | 등급 | 예방 통제 | 탐지 통제 |
| --- | --- | --- | --- |
| 관리자 콘솔 공개 노출 | 높음 | Access 먼저 생성, Bypass 금지 | 비허용 계정 smoke |
| secret 유출 | 높음 | secret 문서화 금지, `.gitignore` | git diff/search |
| 원격 명령 오남용 | 높음 | 이메일 allowlist, app auth, CSRF | task audit log |
| 로컬 PC 종료 | 중간 | 운영 시간 명시, 전원 설정 | health check |
| tunnel 장애 | 중간 | service 등록 | tunnel status |
| WebSocket 실패 | 중간 | same-origin 설계 | browser console/smoke |
| ISO 문서 형식만 있고 증거 부족 | 중간 | evidence 보관 | 내부 audit |

## 10. 내부 감사 체크리스트

월 1회 또는 major 변경 후 실행한다.

```text
[ ] Access application이 존재한다.
[ ] Allow policy가 본인 이메일로 제한되어 있다.
[ ] Bypass policy가 없다.
[ ] Tunnel route가 의도한 hostname 하나만 가진다.
[ ] origin이 127.0.0.1:8900이다.
[ ] .env에 필수 secret이 설정되어 있다.
[ ] secret 원문이 repo/docs에 없다.
[ ] Docker health가 정상이다.
[ ] 외부 접속 smoke가 성공했다.
[ ] 비허용 계정 차단 smoke가 성공했다.
[ ] PRN/chat/directive smoke 중 하나가 성공했다.
[ ] 장애 또는 실패가 있으면 CAPA가 작성되었다.
```

## 11. 증거 보관 구조

```text
docs/cloudflare-access/evidence/
  2026-04-29/
    access-application.png
    access-policy.png
    tunnel-route.png
    health-local.txt
    external-login-success.png
    unauthorized-block.png
    prn-smoke-result.md
    change-record.md
    audit-checklist.md
```

`docs/reports/`는 현재 `.gitignore` 대상이므로 Cloudflare 운영 증거는 `docs/cloudflare-access/evidence/` 하위에 보관한다.

## 12. 지속적 개선

개선 backlog:

```text
1. Docker compose에 ALLOWED_ORIGINS pass-through 반영
2. Cloudflare Access smoke 자동화
3. tunnel 상태 모니터링 스크립트 작성
4. incident/CAPA 템플릿 추가
5. monthly audit checklist 자동 생성
6. Telegram Web App Quick Command 분리 설계
7. ISO 9001:2026 정식 발행 후 gap analysis 수행
```

## 13. 인증 관련 주의

이 문서는 ISO 9001 인증서가 아니다.

이 문서의 목적:

```text
품질운영 체계 정리
운영 절차 표준화
검증 증거 기준 정의
향후 인증기관 심사에 필요한 기록 기반 마련
```

인증이 필요하면 공인 인증기관 심사를 별도로 진행해야 한다.
