# PRN 명세서: Cloudflare Access 개인 전용 대시보드

작성일: 2026-04-29
문서 상태: 초안
대상 시스템: DonggriCompany
PRN 형식: DonggriCompany PRN Draft Contract v1

## background

DonggriCompany는 로컬 PC 또는 Docker 컨테이너에서 실행되는 AI 회사 운영 대시보드다. 시스템은 단순 정적 UI가 아니라 DB, WebSocket, Telegram receiver, Codex runner, project path 접근, OAuth/multi-auth 상태를 포함한다.

사용자는 집 밖에서도 대시보드에 접속해 채팅, CEO 지시, 태스크 등록, 진행 확인을 하고 싶다. 단, 공개 서비스가 아니라 사용자 본인만 접속해야 한다.

이 요구는 일반 웹호스팅보다 원격 개인 접속과 접근통제가 핵심이다. 따라서 Cloudflare Tunnel로 로컬 origin을 연결하고, Cloudflare Access로 본인 인증을 강제한다.

## goal

Cloudflare Tunnel + Cloudflare Access를 통해 DonggriCompany 대시보드를 외부에서 안전하게 접속 가능하게 만든다.

목표:

1. 사용자는 외부 브라우저에서 `https://<서브도메인>`으로 접속한다.
2. Cloudflare Access가 본인 이메일/SSO 인증을 먼저 수행한다.
3. 인증된 요청만 Cloudflare Tunnel을 통해 로컬 DonggriCompany 서버로 전달된다.
4. 대시보드 채팅, `$` CEO 지시, `#` 태스크 등록, PRN 작성, task 상태 조회가 외부에서도 동작한다.
5. 내 PC 또는 Docker 서버가 꺼져 있으면 외부 접속과 실행은 중단된다.
6. secret, token, DB, multi-auth 저장소는 외부 호스팅 서비스로 이동하지 않는다.
7. 운영/변경/검증 기록을 남겨 ISO 9001:2015 품질운영 체계에 맞춘다.

## non_goal

이번 범위에서 제외한다.

1. DonggriCompany 전체를 Cloudflare Workers/Pages/VPS로 이식하지 않는다.
2. 공유기 포트포워딩으로 `8790`, `8900`을 직접 열지 않는다.
3. Cloudflare Access Bypass 정책으로 관리자 API를 공개하지 않는다.
4. Telegram Web App을 전체 대시보드 대체 UI로 만들지 않는다.
5. Cloudflare API Token을 채팅이나 문서에 저장하지 않는다.
6. ISO 9001 인증 취득을 완료했다고 주장하지 않는다. 본 범위는 인증 대응 가능한 운영 문서와 증거 체계 구축이다.

## requirements

### 기능 요구사항

1. 외부 접속 도메인
   - `https://donggri-company.<사용자 도메인>` 형식으로 접속한다.
   - Cloudflare DNS에 연결된 활성 domain을 사용한다.

2. 접근통제
   - Access self-hosted application을 생성한다.
   - Allow policy는 사용자 본인 이메일 1개를 기본값으로 한다.
   - 필요 시 국가 제한, MFA, device posture를 Require 조건으로 추가한다.
   - Bypass policy는 사용하지 않는다.

3. Tunnel 연결
   - Cloudflare Tunnel origin은 Docker 기준 `http://127.0.0.1:8900`으로 한다.
   - 로컬 pnpm 운영 시 origin은 `http://127.0.0.1:8790` 또는 production preview 구조를 별도 검토한다.
   - `cloudflared`는 PC 부팅 후 자동 실행되도록 서비스화할 수 있어야 한다.

4. 앱 내부 인증
   - `API_AUTH_TOKEN`을 설정한다.
   - `INBOX_WEBHOOK_SECRET`을 설정한다.
   - `OAUTH_ENCRYPTION_SECRET`을 설정한다.
   - 원격 도메인을 `ALLOWED_ORIGINS`에 추가한다.
   - `OAUTH_BASE_URL`은 외부 HTTPS 도메인으로 설정한다.

5. 명령 실행
   - 외부 대시보드에서 채팅/지시를 내리면 로컬 DonggriCompany 서버가 처리한다.
   - task 실행은 로컬 Docker/host runner가 수행한다.
   - project path는 기존 path gate 정책을 통과해야 한다.

6. 관측성
   - `/api/health`로 서버 상태를 확인한다.
   - Cloudflare Tunnel connector 상태를 확인한다.
   - Access login/audit 로그를 확인한다.
   - DonggriCompany task log와 Telegram relay log를 확인한다.

### 비기능 요구사항

1. 보안
   - public inbound port를 열지 않는다.
   - Access application 없는 tunnel route를 운영하지 않는다.
   - token/secret은 repo와 문서에 저장하지 않는다.

2. 가용성
   - 내 PC/Docker/cloudflared가 켜져 있을 때만 서비스된다.
   - 절전 모드 진입 시 접속 중단을 허용한다. 상시 운영이 필요하면 전원 정책을 별도로 조정한다.

3. 품질
   - 변경 전후 테스트 증거를 남긴다.
   - 설정 변경은 change record에 남긴다.
   - 장애/접속 실패는 incident record에 남긴다.

4. 유지보수
   - Cloudflare 설정값과 로컬 `.env` 값은 문서화하되 secret 원문은 기록하지 않는다.
   - 운영 절차는 PowerShell 기준으로 유지한다.

## acceptance_criteria

완료 기준:

1. Cloudflare Access application이 생성되어 본인 이메일만 허용한다.
2. Cloudflare Tunnel이 `http://127.0.0.1:8900`으로 연결된다.
3. 외부 브라우저에서 Access 로그인 후 대시보드가 열린다.
4. 인증되지 않은 브라우저는 대시보드/API에 접근하지 못한다.
5. `/api/auth/session`이 외부 도메인에서 정상 session cookie를 발급한다.
6. WebSocket 연결이 인증 후 정상 연결된다.
7. 대시보드에서 테스트 메시지 또는 PRN 초안 요청이 정상 처리된다.
8. `$` CEO 지시 또는 `#` 태스크 등록이 project binding 흐름까지 진행된다.
9. PC/Docker/cloudflared 중 하나를 중지하면 외부 접속이 실패한다.
10. 검증 결과가 `docs/cloudflare-access/evidence/` 또는 운영 로그에 남는다.

PowerShell smoke:

```powershell
Set-Location "D:\Donggri_Platform\DonggriCompany"

docker compose ps
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/health" | ConvertTo-Json -Compress
cloudflared tunnel list
```

## risks

| 리스크 | 영향 | 완화 |
| --- | --- | --- |
| Access application 없이 tunnel route 먼저 생성 | 관리자 콘솔 공개 노출 | Access application 먼저 생성 |
| `ALLOWED_ORIGINS` 누락 | 외부 session bootstrap 실패 | `.env`와 Docker env pass-through 반영 |
| secret 문서 노출 | 계정 탈취/명령 실행 위험 | secret 원문 기록 금지 |
| PC 절전/종료 | 외부 접속 불가 | 전원 정책 또는 운영 시간 명시 |
| Docker volume/mount 오류 | task 실행 실패 | health + task smoke 검증 |
| WebSocket 인증 실패 | 실시간 상태 반영 실패 | same-origin, cookie, Access 정책 검증 |
| Cloudflare Bypass 오설정 | Access 우회 | Bypass 금지, Service Auth만 예외 검토 |

## open_questions

사용자 확인 필요:

1. 사용할 Cloudflare 도메인은 무엇인가?
2. 서브도메인은 `donggri-company.<도메인>`으로 할 것인가?
3. Access 로그인은 Google, GitHub, One-time PIN 중 무엇으로 할 것인가?
4. 허용 이메일은 1개만 둘 것인가?
5. 세션 유지 시간은 8시간으로 할 것인가?
6. Docker 운영 포트는 현재 compose 기준 `8900`으로 확정할 것인가?
7. PC 절전 방지 설정이 필요한가?
8. Telegram Web App은 2차 단계로 구축할 것인가?

## directive_text

```text
본 PRN 기준으로 Cloudflare Tunnel + Access 개인 전용 외부 접속 구축을 진행한다.
- 범위는 DonggriCompany 대시보드 원격 개인 접속과 명령 실행 검증까지로 제한한다.
- Access application 선생성, 본인 이메일 allow policy, tunnel origin 127.0.0.1:8900, 앱 내부 token/session/CSRF 유지가 필수다.
- secret 원문은 문서/채팅/repo에 저장하지 않는다.
- 완료 전 health, Access 차단, 인증 접속, WebSocket, 채팅/PRN/지시 smoke 결과를 증거로 남긴다.
```
