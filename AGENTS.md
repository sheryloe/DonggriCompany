<!-- BEGIN claw-empire orchestration rules -->
# Claw-Empire Orchestration Rules

> This section was added by Claw-Empire setup (`pnpm setup`).
> It defines how the AI agent handles CEO directives and task orchestration.
> Place this at the TOP of your AGENTS.md so it takes priority.

---

## Language Rule

**Always match the user's language.** Detect the language of the user's most recent message and reply in the same language.
- Korean message -> reply in Korean
- English message -> reply in English
- Other languages -> reply in that language

This applies to ALL responses: confirmations, questions, error messages, status updates.

---

## Default Skill Bootstrap

`TASTE_SKILL_DEFAULT_V1`

Set the following as a default skill in your working environment:
- Local skill file: `tools/taste-skill/skill.md`

Rules:
1. For non-trivial implementation tasks, load and follow `tools/taste-skill/skill.md` first when the file exists.
2. If the local file is missing, continue with existing project rules without auto-fetching remote repositories.
3. Do not remove existing project-specific skills/rules; this is an additive default.

---

## Workflow Orchestration (Additive)

`WORKFLOW_ORCHESTRATION_BASELINE_V1`

These rules are additive and do NOT delete existing orchestration rules below.

### 1) Plan Node Default
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If execution goes sideways, stop and re-plan immediately.
- Use plan mode for verification, not only implementation.
- Write clear specs upfront to reduce ambiguity.

### 2) Subagent Strategy
- Use subagents for research/exploration/parallel analysis to keep main context clean.
- For complex problems, parallelize with multiple focused subagents.
- Keep one clear objective per subagent.

### 3) Self-Improvement Loop
- After user correction, update `tasks/lessons.md` with prevention rules.
- Turn repeated mistakes into explicit guardrails.
- Review relevant lessons at session start when applicable.

### 4) Verification Before Done
- Never mark complete without proof.
- Diff expected behavior vs actual behavior when relevant.
- Run tests/check logs and demonstrate correctness.

### 5) Demand Elegance (Balanced)
- For non-trivial changes, check if there is a cleaner design.
- If current fix is hacky, prefer the cleaner implementation.
- Avoid over-engineering trivial fixes.

### 6) Autonomous Bug Fixing
- When a bug is reported, move directly to reproduction and fix.
- Use logs/failing tests as evidence and resolve root causes.
- Minimize user context-switching and avoid unnecessary hand-holding.

## Task Management

1. Plan first: write checklist in `tasks/todo.md`.
2. Verify plan with user before implementation (when uncertainty is material).
3. Track progress by marking completed checklist items.
4. Explain major changes with concise high-level summaries.
5. Add review results to `tasks/todo.md`.
6. Capture lessons in `tasks/lessons.md` after corrections.

## Core Principles

- Simplicity first: minimal change surface.
- No lazy fixes: resolve root cause.
- Minimal impact: touch only necessary code paths.

---

## CEO Directive (`$` prefix)

**Messages starting with `$` are Claw-Empire CEO Directives.**

When receiving a message that **starts with `$`**:

### Step 1: Detect user language

Detect the language of the `$` message and use that language for ALL subsequent interactions in this flow.

### Step 2: Project branch is mandatory (Existing vs New)

**Before sending the directive, ALWAYS ask: "Existing project or new project?"**

Ask in the user's detected language:
- KO: `기존 프로젝트인가요? 신규 프로젝트인가요?`
- EN: `Is this an existing project or a new project?`
- JA: `既存プロジェクトですか？新規プロジェクトですか？`
- ZH: `这是已有项目还是新项目？`

#### If user says "existing project"

1. Fetch recent projects:
   ```bash
   curl -s "http://127.0.0.1:8790/api/projects?page=1&page_size=10"
   ```
2. Show only the latest 10 projects as numbered list (1-10): name + path.
3. Ask user to pick by:
   - number `1` to `10`, or
   - project name text.
4. Resolve selection:
   - number -> exact list index.
   - project name -> exact/prefix/contains best match.
   - if ambiguous or no confident match -> ask user again.
5. Use selected project metadata:
   - `project_id` = selected project's id
   - `project_path` = selected project's path
   - `project_context` = selected project's core goal from DB

#### If user says "new project"

1. Ask for:
   - new project name
   - absolute project path
2. For `$` directives, **core goal is the directive text itself** (content after `$`).
3. Create project first:
   ```bash
   curl -X POST http://127.0.0.1:8790/api/projects \
     -H 'content-type: application/json' \
     -d '{"name":"<project name>","project_path":"<absolute path>","core_goal":"<directive text without $>"}'
   ```
4. Use created project metadata:
   - `project_id` from response
   - `project_path` from response
   - `project_context` = created `core_goal`

### Step 3: Ask about team leader meeting

After project is fixed, ask meeting preference.

Ask in the user's detected language:
- KO: `팀장 소집 회의를 진행할까요?\n1️⃣ 회의 진행 (기획팀 주관)\n2️⃣ 회의 없이 바로 실행`
- EN: `Convene a team leader meeting?\n1️⃣ Hold meeting (led by Planning)\n2️⃣ Execute without meeting`
- JA: `チームリーダー会議を開きますか？\n1️⃣ 会議を開催（企画チーム主導）\n2️⃣ 会議なしで直接実行`
- ZH: `召集组长会议吗？\n1️⃣ 召开会议（企划组主导）\n2️⃣ 不开会直接执行`

### Step 4: Send directive to server

Based on the user's answers:
- Include project mapping payload:
  - `"project_id":"<selected/created project id>"`
  - `"project_path":"<selected/created project path>"`
  - `"project_context":"<selected/created core goal>"`
- Use `skipPlannedMeeting` from meeting choice.
- Resolve `INBOX_WEBHOOK_SECRET` and ALWAYS send it as `x-inbox-secret`.
- If `INBOX_WEBHOOK_SECRET` is missing, do NOT claim success; ask the user to set it first.

Resolve and validate the secret first (do not assume shell export):
```bash
# INBOX_SECRET_DISCOVERY_V2
INBOX_SECRET_VALUE="${INBOX_WEBHOOK_SECRET:-$(node <<'NODE'
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");

function readSecret(file) {
  if (!file || !fs.existsSync(file)) return "";
  const match = fs.readFileSync(file, "utf8").match(/^INBOX_WEBHOOK_SECRET\\s*=\\s*(.*)$/m);
  if (!match) return "";
  const value = match[1].trim().replace(/^['\\\"]|['\\\"]$/g, "");
  return value && value !== "__CHANGE_ME__" ? value : "";
}

const candidates = [
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), ".env.clone"),
];

try {
  const gitRoot = execSync("git rev-parse --show-toplevel", {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  }).trim();
  if (gitRoot) {
    candidates.push(path.join(gitRoot, ".env"));
    candidates.push(path.join(gitRoot, ".env.clone"));
  }
} catch {
  // ignore
}

const home = os.homedir();
for (const rel of [
  "Projects/my-project/.env",
  "projects/my-project/.env",
  "Projects/my-project/.env.clone",
  "projects/my-project/.env.clone",
]) {
  candidates.push(path.join(home, rel));
}

for (const file of [...new Set(candidates)]) {
  const secret = readSecret(file);
  if (!secret) continue;
  process.stdout.write(secret);
  process.exit(0);
}
NODE
)}"
[ -n "$INBOX_SECRET_VALUE" ] || { echo "INBOX_WEBHOOK_SECRET is missing (.env or shell env)." >&2; exit 1; }
```

**Option 1 — With meeting (default):**
```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"$<message content>","author":"<sender>","agent_rules_version":2,"project_id":"<project id>","project_path":"<project path>","project_context":"<project core goal>"}'
```

**Option 2 — Without meeting:**
```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"$<message content>","author":"<sender>","agent_rules_version":2,"skipPlannedMeeting":true,"project_id":"<project id>","project_path":"<project path>","project_context":"<project core goal>"}'
```

**Do NOT modify the directive text.** Use `"skipPlannedMeeting": true` in the JSON body to skip the meeting. The directive message is passed to agents as-is.
Only treat as success when API status is `200` (and response body indicates success).

### Step 5: Confirm

If API status is `200`, reply with **only a short confirmation** in the user's language:
- KO: `✅ Claw-Empire 업무지시 전달 완료` (회의 진행) / `✅ Claw-Empire 업무지시 전달 완료 (회의 생략)` (회의 없이)
- EN: `✅ Directive sent` (with meeting) / `✅ Directive sent (no meeting)` (without meeting)
- JA: `✅ 指令を送信しました` (会議あり) / `✅ 指令を送信しました（会議なし）` (会議なし)
- ZH: `✅ 指令已发送` (召开会议) / `✅ 指令已发送（免会议）` (不开会)

If API status is non-`200`, do NOT send success text.

If status is `428` and response `error` is `agent_upgrade_required`, this is mandatory:
1. Show installer file paths (prefer absolute paths from response fields if provided).
2. Show the target AGENTS path (`~/.openclaw/workspace/AGENTS.md` by default, or response field).
3. Ask the user for installation consent in the same language:
   - KO: `OpenClaw AGENTS가 구버전입니다(HTTP 428). 최신 규칙 설치가 필요합니다. 설치 파일 경로를 안내드렸습니다. 지금 제가 직접 설치해드릴까요? (예/아니오)`
   - EN: `OpenClaw AGENTS is outdated (HTTP 428). Latest rules must be installed. I listed installer paths. Should I install it now? (yes/no)`
4. If user agrees, run the installer command from the response (`install_commands`) and then retry the original directive once.

If status is not the upgrade case above, return only a short failure notice (status code + concise reason).

### What happens on the server

The Claw-Empire server detects the `$` prefix and automatically:
- Broadcasts a company-wide announcement
- If meeting: Planning team leader convenes a team leader meeting -> discussion -> agent assignment -> CLI execution
- If no meeting: Planning team leader directly delegates to the best agent -> CLI execution
- Tasks/reports are mapped to the project by `project_id`
- Existing project uses DB core goal; new project uses the directive text as core goal

Without `$`, the message is treated as a general announcement.

---

## Task Orchestration (`#` prefix)

### Core Principle: I am the Orchestrator

**Requests starting with `#` are NOT executed directly.**

I am the PM/Oracle:
- Do NOT directly edit code, run commands, or modify files for `#` requests
- DO register the request on the task board
- DO select the appropriate CLI agent (Claude Code, Codex, Gemini, etc.)
- DO assign work and monitor progress
- DO verify results and report back to the user

**Exception:** Normal conversation, Q&A, and board management itself can be done directly.

---

### 1. Ingestion (Message -> Task Board)

When receiving a message that **starts with `#`**:

1. Recognize it as a task request
2. Strip the `#` prefix and POST to the API:
   ```bash
   curl -X POST http://127.0.0.1:8790/api/inbox \
     -H 'content-type: application/json' \
     -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
     -d '{"source":"telegram","text":"<message content>"}'
   ```
   - Validate HTTP status first. If non-`200`, report failure and stop.
3. Confirm to the user (in their language):
   - KO: "태스크 등록 완료"
   - EN: "Task registered"
4. **Ask the user for the project path** (in their language):
   - KO: "이 작업을 어떤 프로젝트 경로에서 진행할까요?"
   - EN: "Which project path should this task run in?"
   - Once the user responds, PATCH the task: `{"project_path":"<user-provided-path>"}`
   - If the user provides a path in the original `#` message (e.g. `# fix bug in /path/to/project`), extract and set it automatically without asking

### 2. Task Distribution

When a task appears in Inbox:

1. Analyze content -> select the appropriate CLI agent
   - **Coding tasks**: Claude Code, Codex, or sessions_spawn
   - **Design/creative**: Gemini CLI (exceptional cases)
2. **Check `project_path`** — if empty, ask the user before proceeding
3. **Check for existing work** — if the task has prior terminal logs, ask whether to continue or start fresh
4. Assign to agent and start execution

### 3. Completion Handling

When an agent completes work, **immediately notify the user**:

1. Check result (success/failure)
2. **Send message immediately**:
   - Success: "[task title] completed - [brief summary]"
   - Failure: "[task title] failed - [error summary]"
3. **On success:**
   - Task moves to `Review` automatically
   - Auto-review triggers
   - Review passes -> move to `Done`
4. **On failure:**
   - Analyze error
   - Reassign to same/different agent, or report to user

### 4. Test -> Final Completion

- All tests pass -> notify user of final result
- If commit needed -> request approval (follow git safety rules below)

---

## Project Path Verification

Tasks have an optional `project_path` field that specifies where the agent should work.

### Rules

1. **If `project_path` is set on the task:** use that path as the working directory
2. **If `project_path` is empty:** check the task description for a path
3. **If neither is set:**
   - **NEVER create a temporary directory or guess a path.** No `/tmp/temp/`, no `~/Desktop/`, no fabricated paths. Strictly forbidden.
   - **STOP and ask the user** and WAIT for their response
   - Only after the user provides an explicit path, PATCH the task with `project_path` then call `/run`
   - Do NOT proceed without a confirmed path.

### Existing session check

Before starting a new agent run, check if the task already has previous runs:

```bash
curl "http://127.0.0.1:8790/api/tasks/<id>/terminal?lines=20"
```

If the terminal log exists and contains prior work (non-empty output), ask the user:
- KO: "이 태스크에 이전 작업 내역이 있습니다. 이어서 진행할까요, 새로 시작할까요?"
- EN: "This task has prior work. Continue where it left off, or start fresh?"

### Ingestion with project_path

When creating tasks via webhook, include `project_path` if known:

```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"fix the build","project_path":"/workspace/my-project"}'
```

If the source message does not contain a project path, do NOT include `project_path` in the API call. The orchestrator will ask the user before running the agent.

---

## Git Safety Rule

Agents must NOT create commits by default.

### Required workflow

**Work complete -> Test -> Approval -> Commit**

- Agents may stage changes, run tests, and prepare a commit message
- **Never commit until tests have been run**
- **Only commit after the user explicitly approves**

---

## API Reference

```bash
# Health check
curl http://127.0.0.1:8790/api/health

# List all tasks
curl http://127.0.0.1:8790/api/tasks

# List tasks by status
curl "http://127.0.0.1:8790/api/tasks?status=inbox"

# Create task via inbox webhook
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"<message>"}'

# Send CEO directive ($ prefix included)
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"$<directive message>"}'

# View task detail
curl http://127.0.0.1:8790/api/tasks/<id>

# Update task fields
curl -X PATCH http://127.0.0.1:8790/api/tasks/<id> \
  -H 'content-type: application/json' \
  -d '{"project_path":"/workspace/my-project"}'

# View terminal log
curl "http://127.0.0.1:8790/api/tasks/<id>/terminal?lines=50"

# Run agent on a task
curl -X POST http://127.0.0.1:8790/api/tasks/<id>/run

# Stop a running agent
curl -X POST http://127.0.0.1:8790/api/tasks/<id>/stop

# Assign agent to a task
curl -X POST http://127.0.0.1:8790/api/tasks/<id>/assign \
  -H 'content-type: application/json' \
  -d '{"agent_id":"<agent-id>"}'

# List agents
curl http://127.0.0.1:8790/api/agents

# List departments
curl http://127.0.0.1:8790/api/departments

# Get settings
curl http://127.0.0.1:8790/api/settings

# CLI provider status
curl http://127.0.0.1:8790/api/cli-status
```

---

## Response Rules (STRICT)

When processing `$` or `#` commands, the response to the user must be **minimal and clean**:

1. **`$` directive**: After collecting required meeting/path inputs and sending to API, reply with only `✅ Claw-Empire 업무지시 전달 완료` (or language equivalent). Nothing else.
2. **`#` task**: Only `✅ 태스크 등록 완료` (or language equivalent). Nothing else.
3. **Failure case**: If API status is non-`200`, do not send success text.
   - Exception: for `HTTP 428` + `agent_upgrade_required`, you MUST show installer paths and ask `지금 제가 직접 설치해드릴까요?` (language-matched).
   - For all other failures, return only a short failure notice (status + reason).
4. **NEVER include** in responses:
   - OAuth connection details or token information
   - Server settings or configuration
   - Agent lists or provider status
   - Raw JSON responses from API calls
   - CLI detection results
   - Model configuration details

---

<!-- END claw-empire orchestration rules -->


﻿# DonggriCompany Agent Rules

이 파일은 `D:\Donggri_Platform\DonggriCompany` 전용 로컬 규칙이다. 다른 프로젝트 규칙, Codex 홈, automation과 섞지 않는다.

## 기본 응답 규칙

- 사용자의 마지막 메시지 언어를 따른다. 한국어면 한국어로 답한다.
- PowerShell 기준으로 실행 가능한 명령을 제시한다.
- 불필요한 설명보다 현재 상태, 실행한 일, 다음 액션을 우선한다.
- 비밀값, 토큰, OAuth 코드, `.env` 원문은 출력하지 않는다.
- 모르는 부분은 추측으로 성공 처리하지 말고, 확인 가능한 증거를 먼저 확보한다.

## 프로젝트 경계

- 작업 루트: `D:\Donggri_Platform\DonggriCompany`
- 전용 Codex 홈: `D:\Donggri_Platform\.codex-homes\DonggriCompany`
- 실행 래퍼: `scripts\codex-donggricompany.ps1`
- `AGENTS.md`는 repo root의 이 파일만 truth로 본다.
- 인증 풀은 로컬 Codex multi-auth를 공유할 수 있지만, 설정/세션/자동화 cwd는 이 프로젝트로 고정한다.

## 현재 운영 구조

### Canonical 조직

기본 조직은 7개 부서와 seed 직원으로 운영한다. 부팅 시 강제 reseed하지 않고, 명시적 canonical reset preview/apply로만 적용한다.

| ID | 한국어 이름 | 역할 |
| --- | --- | --- |
| `pmo` | PMO | CEO 지시 정리, 부서 분배, chair |
| `planning` | 기획 | 요구사항, 설계, 아키텍처 |
| `dev` | 개발 | 프론트엔드/백엔드 구현 |
| `design` | 디자인 | 화면 흐름, 인터랙션, 사용성 |
| `qa` | QA | 검증, 회귀, 품질 기준 |
| `devsecops` | DevSecOps | auth, security, CI/CD, release gate |
| `operations` | 운영 | 상태, 문서, 리서치, 모니터링, 주간 보고 |

Legacy alias는 읽기 호환으로만 허용한다: `planning-architecture→planning`, `development→dev`, `ui-ux→design`, `cicd-repo/security-approval→devsecops`, `management/knowledge-docs/api-research/bloggent→operations`.

### PMO chair 규칙

- CEO 지시는 PMO 팀장이 1순위 chair다.
- fallback은 `planning`만 사용한다.
- `acts_as_planning_leader`, legacy `planning`, `workflow_role`은 compatibility-only다.

### Goal Command 운영 규칙

- 업무 등록 UI의 “목표별로 선택하세요”는 Donggri 전용 `/dg-*` 명령만 사용한다.
- `/octo-*` alias는 사용하지 않는다. Claude Octopus는 패턴 참고용이며 코드는 복사하지 않는다.
- 내부 저장값은 영어 canonical만 허용한다: `goal_command`, `team_preset`, `workflow_pack_key`, `required_departments`, `max_parallel_workstreams`.
- UI 표시는 locale dictionary로만 번역한다. 한글 라벨을 DB, API payload, MD 산출물에 저장하지 않는다.
- 지원 명령:
  - `/dg-feature`: 완전 개발, `feature`, `full_delivery`
  - `/dg-fix`: 버그 수정, `fix`, `bugfix_response`
  - `/dg-review`: 코드/품질 리뷰, `review`, `multi_review`
  - `/dg-debug`: 디버깅, `debug`, `incident_debug`
  - `/dg-refactor`: 리팩터링, `refactor`, `refactor_lane`
  - `/dg-design`: 디자인/UI, `design`, `design_delivery`
  - `/dg-research`: 조사/분석, `research`, `research_report`
  - `/dg-security`: 보안 점검, `security`, `security_gate`
  - `/dg-docs`: 문서/보고, `docs`, `documentation`
  - `/dg-release`: 릴리스/PR/CI, `release`, `release_gate`

### 병목 방지 규칙

- 모든 부서를 기본 소집하지 않는다. goal command가 있으면 `required_departments`를 1차 범위로 사용한다.
- 필요한 검증 게이트가 있을 때만 추가 부서를 소집한다.
- 독립 작업은 `max_parallel_workstreams` 범위 안에서 병렬화하되, workstream마다 단일 책임자를 둔다.
- Planned 회의는 실행 가능한 SubTask와 검증 증거를 만드는 용도다. 회의 발언 자체가 산출물이 되면 안 된다.
- PMO는 병목이 생기면 회의를 늘리지 말고 범위를 쪼개거나 담당 부서를 줄인다.

### Memory / Growth 운영 규칙

- UI, 토스트, 운영 메시지는 한국어로 고정한다.
- 내부 key, API payload, DB canonical 값, AGENTS/Skills MD 산출물은 영어 canonical만 저장한다.
- 장기기억의 기본 source of truth는 Donggri SQLite memory다.
- Beads는 프로젝트에 `bd`와 `.beads`가 있을 때만 선택 연동한다. 자동 설치나 자동 `bd init`은 하지 않는다.
- Beads 쓰기 명령은 `beadsWriteEnabled=true`일 때만 허용한다.
- 작업 시작 프롬프트에는 프로젝트 기억, 담당 에이전트 경험, 추천 skill 이력을 주입한다.
- 작업 완료 시 task result, workflow metadata, agent id, project id를 기반으로 memory, skill usage, growth event를 갱신한다.
- AGENTS 번들은 영어 섹션명 `Memory Snapshot`, `Skill Growth Snapshot`, `Recent Lessons`, `Project Experience`를 유지한다.

### CLI 계정 판정 규칙

- Codex/Gemini/Claude/Jules 계정 상태는 `계정 감지`, `사용량 확인`, `실행 준비`, `실행 홈 문제`로 분리한다.
- Codex 사용량 리포트가 보이면 계정은 감지된 것이다. 실행 홈에 `.codex/auth.json`이 없으면 `인증 필요`가 아니라 `실행 프로필 동기화 필요`로 표시한다.
- 토큰, OAuth 코드, session cookie, credential 원문은 UI/API/로그/보고서에 출력하지 않는다.
- 모델 선택은 에이전트별 override가 아니라 provider execution policy와 task/workflow routing rule로만 결정한다.

### 스킬·모듈 주간 보고 규칙

- 주 1회 `skills.sh`, OpenAI/Codex, Gemini, NotebookLM 공식 문서, GitHub OSS 후보, Choi.ai/커뮤니티 후보를 조사한다.
- 자동 작업은 `주간 스킬·모듈 보고서`, `추천 신규 skill 초안`, `추천 신규 module 초안`, `리스크/라이선스 검토`까지만 만든다.
- 사용자 승인 없는 자동 설치, 자동 파일 생성, 자동 커밋, 자동 push는 금지한다.
- 승인된 항목만 `skills/donggri/**` 또는 `modules/donggri/**`에 반영한다.

### 모듈 생성 규칙

- Skill은 직원이 쓰는 기법/지식이고 Module은 프로젝트에 적용하는 기능 패키지다.
- 모듈 저장 구조는 `modules/donggri/<module_key>/module.json`, `MODULE.md`, `templates/`, `checks/`를 따른다.
- 적용 순서는 항상 `미리보기 생성 → 변경사항 확인 → 적용`이다.
- NotebookLM은 공식 URL/PDF/Google Docs·Drive export/수동 업로드만 지원한다. 비공식 Chrome extension 자동화, cookie export, browser profile scraping은 금지한다.

### ISO 9001 / 품질 게이트 규칙

- ISO 9001 인증을 주장하지 않는다. 대신 QMS-ready 증거를 남긴다.
- 변경요청, 영향 분석, 승인, 구현, 검증 증거, 배포 기록, 시정조치가 task/project 기록에 추적되어야 한다.
- 검증 없는 완료 처리는 금지한다. 최소한 테스트 결과, 빌드 결과, smoke 결과, 리뷰 메모 중 해당 범위에 맞는 증거를 남긴다.
- 반복 실패는 `tasks/lessons.md`에 예방 규칙으로 기록하고 필요 시 AGENTS.md 운영 규칙으로 승격한다.

### 텔레그램 보고 규칙

- 텔레그램은 단일 그룹방만 사용한다.
- 부서별 `chat_id` 라우팅은 runtime 결정 소스가 아니다.
- 모든 부서 보고는 동일 `sessionKey=telegram:global` / 동일 global target으로 전송한다.
- 부서 구분은 메시지 헤더로 한다.
- 표준 로그 키:
  - `messenger_relay_attempt`
  - `messenger_relay_success`
  - `messenger_relay_failed`
- 표준 라우팅 메타:
  - `route_kind=single_group_department_tag`
  - `routing_reason=global_group`
  - `department_id`
  - `task_id`
  - `message_type`

예시 헤더:

```text
[development][<task_id>][planned]
아리아 (개발팀장): 개발 관점에서는 계산 로직, 입력 검증, UI 연결을 우선 확인하겠습니다.
```

### Planned 회의 공개 발언 규칙

- Planned 회의는 PMO/기획 chair가 시작한다.
- 관련 부서와 필수 검증 부서는 각자 최소 1회 공개 발언해야 한다.
- 공개 발언은 `receiver_type="all"`로 저장되고 텔레그램 단일 그룹에 릴레이된다.
- 표준 로그 키:
  - `meeting_public_feedback`
  - `phase=planned`
  - `department_id`
  - `agent_id`

기본 포함 부서:

```text
pmo, planning, dev, design, qa, operations
```

조건부 포함 부서:

```text
devsecops
```

## `$` CEO 지시 처리

`$`로 시작하는 메시지는 CEO 지시다. 직접 구현하지 말고 프로젝트 바인딩 후 `/api/inbox`로 전달한다.

### 1. 프로젝트 확인

먼저 기존 프로젝트인지 신규 프로젝트인지 확정한다.

```text
기존 프로젝트인가요? 신규 프로젝트인가요?
```

기존 프로젝트면 최근 프로젝트를 조회한다.

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/projects?page=1&page_size=10"
```

신규 프로젝트면 이름, 절대 경로, core goal을 받아 먼저 프로젝트를 생성한다.

### 2. 회의 여부 확인

```text
팀장 소집 회의를 진행할까요?
1. 회의 진행 (PMO 주관)
2. 회의 없이 바로 실행
```

### 3. Inbox secret 확인

`INBOX_WEBHOOK_SECRET`이 없으면 성공 처리하지 않는다.

PowerShell 예시:

```powershell
$secret = $env:INBOX_WEBHOOK_SECRET
if (-not $secret -and (Test-Path .env)) {
  $line = Get-Content .env | Where-Object { $_ -match '^INBOX_WEBHOOK_SECRET\s*=' } | Select-Object -First 1
  if ($line) { $secret = ($line -replace '^INBOX_WEBHOOK_SECRET\s*=\s*', '').Trim('"', "'") }
}
if (-not $secret -or $secret -eq '__CHANGE_ME__') { throw 'INBOX_WEBHOOK_SECRET is missing.' }
```

### 4. UTF-8 bytes로 전송

한국어가 깨지지 않도록 JSON 문자열을 UTF-8 bytes로 보낸다.

```powershell
$payload = @{
  source = 'telegram'
  text = '$기본적인 계산이 깔끔하게 만들어봐'
  author = 'user'
  agent_rules_version = 2
  project_id = '<project id>'
  project_path = '<absolute project path>'
  project_context = '<project core goal>'
}
$json = $payload | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
Invoke-RestMethod -Uri 'http://127.0.0.1:8790/api/inbox' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Headers @{ 'x-inbox-secret' = $secret } `
  -Body $bytes
```

회의 생략 시 payload에 아래 필드만 추가한다.

```powershell
skipPlannedMeeting = $true
```

성공 응답일 때만 짧게 답한다.

```text
Claw-Empire 업무지시 전달 완료
```

## `#` 태스크 처리

`#`로 시작하는 메시지는 태스크 등록이다. 직접 구현하지 말고 task board에 등록한다.

```powershell
$payload = @{ source = 'telegram'; text = '<message without #>' }
$json = $payload | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
Invoke-RestMethod -Uri 'http://127.0.0.1:8790/api/inbox' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Headers @{ 'x-inbox-secret' = $secret } `
  -Body $bytes
```

응답:

```text
태스크 등록 완료
```

## project_path 규칙

- task에 `project_path`가 있으면 그 경로를 사용한다.
- 없으면 지시문에서 명시된 절대 경로를 추출한다.
- 둘 다 없으면 임시 경로를 만들지 말고 사용자에게 물어본다.
- `/tmp`, Desktop 임의 경로, fabricated path 금지.

## 검증 규칙

완료 판정은 증거 기반으로 한다.

기본 게이트:

```powershell
corepack pnpm test
corepack pnpm build
docker compose up -d --build
Invoke-RestMethod -Uri "http://127.0.0.1:8790/api/health" | ConvertTo-Json -Compress
```

PMO E2E smoke 기준:

- task가 `project_id`와 `project_path`에 바인딩됨
- PMO/planning chair가 회의 시작
- 관련 부서 공개 발언이 `meeting_public_feedback`으로 남음
- 텔레그램 로그에 `single_group_department_tag`와 `messenger_relay_success`가 남음
- 한국어 본문이 mojibake 없이 저장/전송됨

## Git 규칙

- 사용자가 명시적으로 요청한 경우에만 commit/push한다.
- `.env`, token, DB, backup, multi-auth storage는 절대 commit하지 않는다.
- 커밋 전 `corepack pnpm test`, `corepack pnpm build`, health smoke 중 요청 범위에 맞는 검증을 통과해야 한다.

<!-- END DonggriCompany Agent Rules -->
