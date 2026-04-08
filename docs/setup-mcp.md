# MCP Setup (Perplexity)

이 문서는 `DonggriCompany`에서 사용할 MCP 연결 중 **Perplexity 리서치 전용** 설정만 다룹니다.

## 목적

- Perplexity는 검색/리서치용 MCP로만 사용
- 서버 실행 경로(`run/probe/runner/oauth gate`)에는 연결하지 않음

## 1) Codex MCP 서버 등록

`%USERPROFILE%\.codex\config.toml`에 아래 블록을 추가합니다.

```toml
[mcp_servers.perplexity]
command = "npx"
args = ["-y", "@perplexity-ai/mcp-server"]
```

## 2) API Key 설정 (Windows PowerShell)

```powershell
setx PERPLEXITY_API_KEY "YOUR_PERPLEXITY_API_KEY"
```

선택: Base URL을 별도로 쓰는 경우

```powershell
setx PERPLEXITY_BASE_URL "https://api.perplexity.ai"
```

## 3) 적용

1. Codex Desktop 완전 종료
2. Codex Desktop 재실행
3. MCP 목록에서 Perplexity가 활성화되었는지 확인

## 4) 운영 원칙

- Perplexity는 `MCP 리서치 전용`입니다.
- `server/modules/routes/ops/office-runner.ts`의 실행 provider 정책(`codex/gemini/jules`)과 분리 운영합니다.
- 실행/인증/OAuth/Runner 경로에는 Perplexity를 추가하지 않습니다.
