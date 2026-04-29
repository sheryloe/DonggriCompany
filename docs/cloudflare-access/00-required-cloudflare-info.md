# Cloudflare 필요 정보 체크리스트

작성일: 2026-04-29
목적: Cloudflare Tunnel + Access 구축 전에 사용자가 제공해야 할 정보와 제공하면 안 되는 secret을 분리한다.

## 사용자가 보내도 되는 정보

아래 항목을 채워서 전달하면 된다.

```text
Cloudflare 계정 이메일:
Cloudflare에 연결된 도메인:
사용할 대시보드 서브도메인:
DNS setup 방식(full/partial/모름):
Access 로그인 방식(One-time PIN/Google/GitHub/기타):
접속 허용 이메일:
Tunnel 이름:
원본 서버 주소:
원본 서버 포트:
운영 방식(Docker/로컬 pnpm):
세션 유지 시간:
MFA 요구 여부:
접속 허용 국가 제한 여부:
WARP 또는 device posture 사용할지:
Telegram Web App 2차 구축 여부:
```

권장값:

```text
Cloudflare 계정 이메일: <내 Cloudflare 로그인 이메일>
Cloudflare에 연결된 도메인: <보유 도메인>
사용할 대시보드 서브도메인: donggri-company.<보유 도메인>
DNS setup 방식: full
Access 로그인 방식: Google 또는 One-time PIN
접속 허용 이메일: <내 이메일 1개>
Tunnel 이름: donggri-company
원본 서버 주소: http://127.0.0.1
원본 서버 포트: 8900
운영 방식: Docker
세션 유지 시간: 8h
MFA 요구 여부: 가능하면 사용
접속 허용 국가 제한 여부: KR 또는 사용 지역만 허용
WARP 또는 device posture 사용할지: 1차에서는 미사용, 2차에서 검토
Telegram Web App 2차 구축 여부: 후순위
```

## 채팅에 보내면 안 되는 정보

아래 값은 채팅에 붙여 넣지 않는다. 필요한 경우 로컬 `.env` 또는 Cloudflare Dashboard에만 입력한다.

```text
Cloudflare API Token
Cloudflare Global API Key
cloudflared tunnel credentials JSON
cert.pem
Service Auth Client Secret
API_AUTH_TOKEN
INBOX_WEBHOOK_SECRET
OAUTH_ENCRYPTION_SECRET
Telegram Bot Token
OAuth Client Secret
Codex multi-auth token/storage
SQLite DB 파일
```

## 자동화 구축이 필요한 경우 추가 정보

Cloudflare Dashboard 수동 설정이 아니라 스크립트 자동화를 원할 때만 아래 정보가 필요하다.

```text
Cloudflare Account ID:
Cloudflare Zone ID:
API Token 저장 위치:
```

API Token은 채팅으로 전달하지 않는다. 로컬 PowerShell에서만 환경변수로 주입한다.

```powershell
$env:CLOUDFLARE_API_TOKEN = "<로컬에서만 입력>"
```

권장 API Token 권한은 실제 자동화 범위가 확정된 후 최소 권한으로 발급한다.

## 결정 기준

1차 구축은 Dashboard 수동 설정 + 로컬 `cloudflared` 실행으로 진행한다.

이유:

- secret 노출면이 작다.
- 실패 시 Cloudflare Dashboard에서 상태를 바로 확인할 수 있다.
- 현재 목적은 개인용 대시보드 접속이며 대규모 IaC가 필요하지 않다.
