# Dongri-grigri

Dongri-grigri는 `G:\Donggri_DevDrive` 전체 프로젝트 포트폴리오를 한 화면에서 운영하기 위한 local-first 오피스 Control Platform입니다. 개별 repo를 각각 Codex 프로젝트처럼 흩어서 다루지 않고, root Control Plane 문서와 Codex 앱 상태를 기준으로 `G:\Donggri_DevDrive\repos` 아래 저장소들을 함께 관리합니다.

첫 화면은 8bit 오피스 운영실입니다. Control Plane, Kiro식 SDD 구조, AgentMemory, Skill 후보, 프로젝트 scope, 업무 실행 기록은 별도 앱처럼 분리되지 않고 이 운영실 안에서 투영됩니다.

## 기준

| 항목 | 값 |
|---|---|
| Control root | `G:\Donggri_DevDrive` |
| Repo estate root | `G:\Donggri_DevDrive\repos` |
| Runtime app repo | `G:\Donggri_DevDrive\repos\DonggriCompany` |
| Control docs | `G:\Donggri_DevDrive\storage\codex-control` |
| Runtime DB | `data\claw-empire.sqlite` |
| Web | `http://127.0.0.1:8800` |
| API | `http://127.0.0.1:8790` |

## Ver.1 운영 모델

Dongri-grigri Ver.1은 6개 마스터 부서 에이전트를 기본 단위로 사용합니다.

| 부서 | 역할 |
|---|---|
| 기획 | 요구사항, 설계, task, 승인 체크리스트 작성 |
| 개발 | 승인된 task와 repo-map 범위 안에서 구현 |
| 디자인 | 운영실 UX, 한글 가독성, 테마, 접근성 관리 |
| 품질 | 테스트, 회귀 검증, evidence, release gate 관리 |
| 운영 | 단일 프로젝트 운영 에이전트. project scope를 바꿔 각 repo를 운영 |
| 외부강사 | GitHub 고 star 오픈소스와 Skill 후보를 읽기 전용으로 조사 |

서브에이전트는 permanent 직원이 아닙니다. 각 마스터 부서 에이전트가 작업 단위로 만들고, 결과를 회수한 뒤 accept/reject/recreate/merge를 결정합니다. repo code write는 개발 부서가 승인된 task와 allowed files 안에서만 수행합니다.

## Root Control SDD

Dongri-grigri는 Kiro식 SDD 구조를 Donggri native 구조로 재구성합니다. `.kiro` 폴더나 Kiro runtime은 사용하지 않습니다.

| SDD 축 | Dongri-grigri 위치 |
|---|---|
| Specs | `storage\codex-control\specs` |
| Steering | `storage\codex-control\steering` |
| Hooks | `storage\codex-control\hooks` |
| Orchestrator | `storage\codex-control\orchestrator` |
| Context Pack | `storage\codex-control\context-packs` |
| Quality Gate | `storage\codex-control\quality` |
| App Projection | DonggriCompany office UI/API |

비 trivial 작업은 다음 문서로 관리합니다.

- `metadata.md`
- `requirements.md`
- `design.md`
- `tasks.md`
- `repo-map.md`
- `approvals.md`
- `evidence.md`
- `handoff.md`
- `learnings.md`

## AgentMemory

AgentMemory는 플랫폼 메모리 계층입니다. Ver.1에서는 안전하게 read-only status/search/context 중심으로 연결합니다.

| 항목 | 기준 |
|---|---|
| Runtime candidate | `G:\Donggr_Runtime\agentmemory` |
| Server | `127.0.0.1:3111` |
| Viewer | `127.0.0.1:3113` |
| Scope | `root`, `department:<id>`, `project:<key>`, `run:<id>`, `persona:<id>` |

`remember`, hook 연결, MCP/plugin 설치, delete/forget/import는 별도 OPS 승인 전에는 실행하지 않습니다.

## 시작

```powershell
Set-Location G:\Donggri_DevDrive\repos\DonggriCompany
corepack pnpm install
corepack pnpm run dev:local
```

상태 확인:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/health" | ConvertTo-Json -Compress
```

## DB 초기화

앱 내부 운영 이력을 Ver.1 시작점으로 비울 때 사용합니다. 이 명령은 repo 파일이나 저장소를 삭제하지 않습니다. 실행 전 SQLite DB/WAL/SHM 백업을 `data\backups\` 아래에 만듭니다.

```powershell
corepack pnpm run db:reset:dongri
```

초기화 범위:

- 비움: app domain `projects`, `tasks`, messages, meeting minutes, task logs, local app memories, previous `control_plane_*` projection
- 재생성: 6개 마스터 부서, 6개 마스터 에이전트, root registry projection snapshot
- 보존: `settings`, OAuth tables, API provider rows, CLI account pools, workflow packs, repo source files

## 검증

```powershell
corepack pnpm exec tsc -p tsconfig.json --noEmit --pretty false
corepack pnpm run test:web -- ControlPlanePage Sidebar.app-shell
corepack pnpm run test:api -- control-plane seeds
corepack pnpm run openapi:check
corepack pnpm run build
```

Root SDD 품질 게이트:

```powershell
node G:\Donggri_DevDrive\tools\control-plane\spec-quality.mjs score --control-root G:\Donggri_DevDrive\storage\codex-control --min-score 95 --fail-on-hard-gate
```

## API 요약

| 영역 | Endpoint |
|---|---|
| Health | `GET /api/health` |
| Control Plane state | `GET /api/control-plane/v1/state` |
| 마스터 부서 | `GET /api/control-plane/v1/agents/departments` |
| Context pack | `GET /api/control-plane/v1/context-pack` |
| Runner | `POST /api/control-plane/v1/runs/prepare` |
| Persona | `POST /api/control-plane/v1/runs/:runId/personas` |
| Memory | `GET /api/control-plane/v1/memory/status`, `GET /api/control-plane/v1/memory/search` |
| Skills | `GET /api/control-plane/v1/instructor/open-source/candidates` |
| Tasks | `GET /api/tasks`, `POST /api/tasks` |
| Projects | `GET /api/projects`, `POST /api/projects` |

보호 API는 session 또는 token 인증이 필요합니다. `.env`, DB, 로그, token/key/credential 파일은 저장소에 포함하지 않습니다.

## 저장소 구조

| 경로 | 설명 |
|---|---|
| `server/` | Node/Express API, SQLite runtime, Control Plane projection |
| `src/` | React/Vite UI |
| `src/components/OfficeView.tsx` | 8bit office main surface |
| `src/components/ControlPlanePage.tsx` | root Control Plane 상세 투영 |
| `scripts/reset-dongri-grigri-runtime-db.mjs` | Ver.1 DB soft reset tool |
| `docs/` | architecture, API, 품질 기록 |
| `public/dongri-grigri.svg` | app icon asset |

커밋 제외:

- `.env`
- `data/`
- `logs/`
- `dist/`
- `coverage/`
- `.tmp/`
- `test-results/`
- token, key, credential, password, private auth material

## Git 운영

기본 원칙은 검증 후 commit/push입니다. reset, rebase, force push, clean, stash, history rewrite는 명시 승인 없이는 하지 않습니다.

이번 Ver.1 시작점 정리에서는 사용자가 정상 commit/push를 승인했습니다.

## License

Dongri-grigri is licensed under the Apache License, Version 2.0. See `LICENSE`.

This repository includes software derived from the upstream Apache-2.0 project identified in `NOTICE`.
