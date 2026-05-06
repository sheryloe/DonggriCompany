# 구축 명세서: Cloudflare Tunnel + Access

작성일: 2026-04-29
대상: DonggriCompany Docker 운영 서버
기본 origin: `http://127.0.0.1:8900`
실행 기준: Windows PowerShell

## 1. 구축 개요

목표 구성:

```text
https://donggri-company.<도메인>
  -> Cloudflare Access
  -> Cloudflare Tunnel
  -> http://127.0.0.1:8900
  -> DonggriCompany Express + React dist + WebSocket
```

## 2. 선행 조건

로컬:

```text
Windows PC
Docker Desktop
Node.js >= 22
pnpm/corepack
Cloudflare cloudflared
DonggriCompany repo
```

Cloudflare:

```text
활성 Cloudflare 계정
Cloudflare에 연결된 도메인
Access 사용 가능 계정
사용자 본인 이메일
```

DonggriCompany:

```text
<PROJECT_ROOT>
docker-compose.yml
.env
data volume
Codex multi-auth read-only mount
```

## 3. 필요한 사용자 입력

```text
DOMAIN=<사용자 도메인>
APP_HOSTNAME=donggri-company.<사용자 도메인>
ACCESS_ALLOWED_EMAIL=<사용자 이메일>
ACCESS_IDP=Google 또는 One-time PIN
TUNNEL_NAME=donggri-company
ORIGIN_URL=http://127.0.0.1:8900
SESSION_DURATION=8h
```

## 4. 로컬 환경변수

`.env`는 로컬에만 둔다. 실제 secret은 아래 명령으로 생성한다.

```powershell
Set-Location "<PROJECT_ROOT>"

$apiToken = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
$inboxSecret = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
$oauthSecret = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
$appHostname = "donggri-company.<사용자 도메인>"

@"
API_AUTH_TOKEN=$apiToken
INBOX_WEBHOOK_SECRET=$inboxSecret
OAUTH_ENCRYPTION_SECRET=$oauthSecret
ALLOWED_ORIGINS=https://$appHostname
OAUTH_BASE_URL=https://$appHostname
"@ | Set-Content -Path ".\.env" -Encoding UTF8
```

주의:

```text
위 명령은 기존 .env를 덮어쓴다.
기존 OAuth/Teleram/GitHub 설정이 있으면 먼저 백업하고 필요한 값을 병합한다.
```

안전한 백업:

```powershell
Set-Location "<PROJECT_ROOT>"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item ".\.env" ".\.env.backup-$stamp" -ErrorAction SilentlyContinue
```

## 5. Docker compose 반영 필요 항목

현재 compose 운영 시 `ALLOWED_ORIGINS`, `ALLOWED_ORIGIN_SUFFIXES`가 container environment에 명시되어야 외부 도메인 session bootstrap이 안정적이다.

`docker-compose.yml`의 `environment`에 아래 항목이 있어야 한다.

```yaml
ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-}
ALLOWED_ORIGIN_SUFFIXES: ${ALLOWED_ORIGIN_SUFFIXES:-.ts.net}
```

반영 후 실행:

```powershell
Set-Location "<PROJECT_ROOT>"
docker compose up -d --build
docker compose ps
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/health" | ConvertTo-Json -Compress
```

## 6. Cloudflare Access 생성

Cloudflare Dashboard에서 먼저 Access application을 만든다.

```text
Cloudflare Zero Trust
-> Access
-> Applications
-> Add an application
-> Self-hosted
```

설정값:

```text
Application name: DonggriCompany
Application domain: donggri-company.<사용자 도메인>
Session duration: 8h
Identity provider: Google 또는 One-time PIN
Policy action: Allow
Policy include: Emails == <사용자 이메일>
Policy require: MFA 또는 country/device 조건은 선택
Bypass policy: 사용 금지
```

Cloudflare 공식 문서 기준 Access application이 없으면 published app이 인터넷 전체에 열릴 수 있으므로, tunnel route보다 Access application을 먼저 만든다.

## 7. Cloudflare Tunnel 생성

설치:

```powershell
winget install --id Cloudflare.cloudflared
```

로그인 및 tunnel 생성:

```powershell
cloudflared tunnel login
cloudflared tunnel create donggri-company
cloudflared tunnel route dns donggri-company donggri-company.<사용자 도메인>
```

config 생성:

```powershell
$tunnelId = "<TUNNEL_ID>"
$userName = $env:USERNAME
$hostname = "donggri-company.<사용자 도메인>"

New-Item -ItemType Directory -Force "$env:USERPROFILE\.cloudflared" | Out-Null

@"
tunnel: $tunnelId
credentials-file: C:\Users\$userName\.cloudflared\$tunnelId.json

ingress:
  - hostname: $hostname
    service: http://127.0.0.1:8900
  - service: http_status:404
"@ | Set-Content -Path "$env:USERPROFILE\.cloudflared\config.yml" -Encoding UTF8
```

실행:

```powershell
cloudflared tunnel run donggri-company
```

## 8. 서비스 자동 실행 선택

상시 사용하려면 `cloudflared`를 Windows service로 등록한다.

```powershell
cloudflared service install
Get-Service cloudflared
```

Docker도 Windows 시작 시 실행되도록 Docker Desktop 설정에서 자동 시작을 켠다.

## 9. 검증 절차

### 9.1 로컬 health

```powershell
Set-Location "<PROJECT_ROOT>"
Invoke-RestMethod -Uri "http://127.0.0.1:8900/api/health" | ConvertTo-Json -Compress
```

### 9.2 Cloudflare tunnel 상태

```powershell
cloudflared tunnel list
cloudflared tunnel info donggri-company
```

### 9.3 외부 접속

```text
1. 휴대폰 LTE 또는 외부 네트워크로 접속
2. https://donggri-company.<사용자 도메인> 열기
3. Access 로그인
4. Dashboard 로딩 확인
5. Chat 입력창 확인
6. PRN 작성 버튼 또는 /prn smoke 입력
```

### 9.4 차단 검증

```text
1. 시크릿 창에서 허용되지 않은 이메일로 접근
2. Access 차단 페이지 확인
3. Cloudflare Access 로그 확인
```

### 9.5 앱 기능 smoke

```text
1. 대시보드 접속
2. /prn Cloudflare Access 접속 smoke 요구사항 초안 작성
3. PRN 초안 모달 생성 확인
4. 테스트 directive 전송 전 프로젝트 선택 흐름 확인
5. 실제 실행은 테스트용 프로젝트에서만 수행
```

## 10. 롤백 절차

Cloudflare route 중지:

```powershell
cloudflared tunnel cleanup donggri-company
```

로컬 서버 중지:

```powershell
Set-Location "<PROJECT_ROOT>"
docker compose down
```

Access 차단:

```text
Cloudflare Zero Trust
-> Access
-> Applications
-> DonggriCompany
-> Policy를 Block으로 변경 또는 application 비활성화
```

## 11. 산출 증거

아래 증거를 보관한다.

```text
Cloudflare Access application 설정 스크린샷
Access policy 스크린샷
Tunnel route 스크린샷
로컬 /api/health 결과
외부 접속 성공 스크린샷
비허용 계정 차단 스크린샷
PRN smoke 또는 chat smoke 결과
변경일/변경자/검증자 기록
```

보관 위치:

```text
docs/cloudflare-access/evidence/YYYY-MM-DD/
```
