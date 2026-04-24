# DonggriCompany

DonggriCompany는 CEO 지시를 프로젝트, 부서, 직원, 실행 작업, 리뷰, 텔레그램 보고까지 연결하는 로컬 AI 회사 운영 플랫폼입니다.

## 핵심 기능

- 11개 기본 부서와 35명 seed 직원 기반 조직 운영
- PMO chair가 CEO 지시를 정리하고 부서별 작업으로 분배
- 프로젝트별 staffing overlay와 worktree 기반 실행 정책
- Canonical authority/quorum/approval gate 기반 hard block
- Codex 중심 실행과 로컬 multi-auth 계정풀 상태 표시
- 텔레그램 단일 그룹 보고: 부서 구분은 메시지 헤더 태그로 처리
- 한국어 UI 우선, 비한국어는 영어 fallback

## 운영 원칙

- canonical key와 DB 저장값은 영어로 유지합니다.
- 한국어 UI에서는 사용자에게 보이는 라벨과 설명을 한국어로 표시합니다.
- JA/ZH는 별도 번역을 제공하지 않고 영어로 표시합니다.
- Product-Manager-Skills는 개념만 참고하며 원문 파일은 포함하지 않습니다.

## 기본 검증

```powershell
corepack pnpm test
corepack pnpm build
docker compose up -d --build
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/health" | ConvertTo-Json -Compress
```

## PMO E2E 기준

`$기본적인 계산이 깔끔하게 만들어봐` 같은 CEO 지시는 다음 증거를 남겨야 합니다.

- 프로젝트와 project_path 바인딩
- PMO/기획 chair의 planned 회의 시작
- 관련 부서의 공개 발언과 산출물/검증 기준
- 텔레그램 단일 그룹 보고 로그
- run/review/finalize 또는 hard block 메타
