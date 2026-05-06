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

## Donggri Organization Runtime

`DONGGRI_ORG_V4_19_STAFF`

- Active staff is fixed to 19 people: PMO has 1 direct command owner, and the other 6 departments have 3 people each.
- Canonical departments are exactly `pmo`, `planning`, `dev`, `design`, `qa`, `devsecops`, `operations`.
- Legacy department ids are read-only aliases and must not be used for new seed agents, new MD bundles, or new API payloads.
- PMO keeps only one `team_leader`; `planning`, `dev`, `design`, `qa`, `devsecops`, and `operations` each keep one `team_leader` and two `senior` staff members. `junior` remains available only for growth/legacy compatibility, not default seeds.
- Staff members are internal owners/orchestrators. They supervise specialized Codex subagents instead of directly owning every specialty.
- Use the subagent catalog by task type:
  - `pmo`: `task-distributor`, `project-manager`, `risk-manager`
  - `planning`: `product-manager`, `architect-reviewer`, `research-analyst`
  - `dev`: `backend-developer`, `frontend-developer`, `typescript-pro`, `database-optimizer`
  - `design`: `ui-designer`, `ux-researcher`, `accessibility-tester`
  - `qa`: `test-automator`, `reviewer`, `performance-monitor`
  - `devsecops`: `security-auditor`, `devops-engineer`, GitHub workflow specialists
  - `operations`: `documentation-engineer`, `customer-success-manager`, `sre-engineer`
- Agent visual profiles are a tracked reserve pool. Profiles mapped to the 19 active staff are active; all other profiles are reserve candidates.
- Reserve visual profiles must stay inactive until a new hire, project pack, or staff replacement explicitly activates them. Activation requires a tracked seed/profile update and guide bundle regeneration.
- Office UI should present the company as floors: `1F shared`, `2F strategy`, `3F production`, `4F quality/operations`.
- Runtime character sprites must be generated through the tracked sprite normalization pipeline. Do not hand-edit individual runtime sprite PNG files unless the generator is also updated.
- User-facing UI, toast, and status text are Korean-only. Internal keys, API fields, DB values, generated MD, and policy text remain English canonical.

## Commit Hygiene Rule

`DONGGRI_COMMIT_SCOPE_GUARD_V1`

- Never commit runtime-only outputs: `.tmp/`, `reports/`, `data/`, `logs/`, `coverage/`, `dist/`, local DB files, auth storage, and token/secret material.
- `agents/archive/` is an operational backup area and must not be used as a tracked source of truth.
- If an analysis report must be committed, write it under `tasks/` or `docs/` with no secrets and no runtime-only absolute token paths.
- Generated runtime assets may be committed only when they are deterministic repo assets and the generator/source manifest is committed in the same change.
- Before commit, run a staged diff check and secret-pattern scan. If suspicious credentials appear, stop and remove them before committing.

---

## CEO Directive (`$` prefix)

**Messages starting with `$` are Claw-Empire CEO Directives.**

When receiving a message that **starts with `$`**:

### Step 1: Detect user language

Detect the language of the `$` message and use that language for ALL subsequent interactions in this flow.

### Step 2: Project branch is mandatory (Existing vs New)

**Before sending the directive, ALWAYS ask: "Existing project or new project?"**

Ask in the user's detected language:

- KO: `湲곗〈 ?꾨줈?앺듃?멸??? ?좉퇋 ?꾨줈?앺듃?멸???`
- EN: `Is this an existing project or a new project?`
- JA: `?℡춼?쀣꺆?멥궒??깉?㎯걲?뗰폕?계쫸?쀣꺆?멥궒??깉?㎯걲?뗰폕`
- ZH: `瓦숁삸藥꿩쐣窈밭쎅瓦섉삸?곈」??폕`

#### If user says "existing project"

1. Fetch recent projects:
   ```bash
   curl -s "http://127.0.0.1:8900/api/projects?page=1&page_size=10"
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
   curl -X POST http://127.0.0.1:8900/api/projects \
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

- KO: `????뚯쭛 ?뚯쓽瑜?吏꾪뻾?좉퉴??\n1截뤴깵 ?뚯쓽 吏꾪뻾 (湲고쉷? 二쇨?)\n2截뤴깵 ?뚯쓽 ?놁씠 諛붾줈 ?ㅽ뻾`
- EN: `Convene a team leader meeting?\n1截뤴깵 Hold meeting (led by Planning)\n2截뤴깵 Execute without meeting`
- JA: `?곥꺖?졼꺁?쇈??쇌폏鈺겹굮?뗣걤?얇걲?뗰폕\n1截뤴깵 鴉싪??믧뼀?э펷鴉곭뵽?곥꺖?졽말弱롳펹\n2截뤴깵 鴉싪??ゃ걮?㎫쎍?ε츪烏?
- ZH: `?ч썓瀯꾦빣鴉싪??쀯폕\n1截뤴깵 ?у?鴉싪?竊덁펯?믥퍍訝삣?竊?n2截뤴깵 訝띶?鴉싩쎍?ζ돢烏?

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

**Option 1 ??With meeting (default):**

```bash
curl -X POST http://127.0.0.1:8900/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"$<message content>","author":"<sender>","agent_rules_version":2,"project_id":"<project id>","project_path":"<project path>","project_context":"<project core goal>"}'
```

**Option 2 ??Without meeting:**

```bash
curl -X POST http://127.0.0.1:8900/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"$<message content>","author":"<sender>","agent_rules_version":2,"skipPlannedMeeting":true,"project_id":"<project id>","project_path":"<project path>","project_context":"<project core goal>"}'
```

**Do NOT modify the directive text.** Use `"skipPlannedMeeting": true` in the JSON body to skip the meeting. The directive message is passed to agents as-is.
Only treat as success when API status is `200` (and response body indicates success).

### Step 5: Confirm

If API status is `200`, reply with **only a short confirmation** in the user's language:

- KO: `??Claw-Empire ?낅Т吏???꾨떖 ?꾨즺` (?뚯쓽 吏꾪뻾) / `??Claw-Empire ?낅Т吏???꾨떖 ?꾨즺 (?뚯쓽 ?앸왂)` (?뚯쓽 ?놁씠)
- EN: `??Directive sent` (with meeting) / `??Directive sent (no meeting)` (without meeting)
- JA: `???뉏빱?믧곦에?쀣겲?쀣걼` (鴉싪??귙굤) / `???뉏빱?믧곦에?쀣겲?쀣걼竊덁폏鈺겹겒?쀯펹` (鴉싪??ゃ걮)
- ZH: `???뉏빱藥꿨룕?? (?у?鴉싪?) / `???뉏빱藥꿨룕?곻펷?띴폏溫?펹` (訝띶?鴉?

If API status is non-`200`, do NOT send success text.

If status is `428` and response `error` is `agent_upgrade_required`, this is mandatory:

1. Show installer file paths (prefer absolute paths from response fields if provided).
2. Show the target AGENTS path (`~/.openclaw/workspace/AGENTS.md` by default, or response field).
3. Ask the user for installation consent in the same language:
   - KO: `OpenClaw AGENTS媛 援щ쾭?꾩엯?덈떎(HTTP 428). 理쒖떊 洹쒖튃 ?ㅼ튂媛 ?꾩슂?⑸땲?? ?ㅼ튂 ?뚯씪 寃쎈줈瑜??덈궡?쒕졇?듬땲?? 吏湲??쒓? 吏곸젒 ?ㅼ튂?대뱶由닿퉴?? (???꾨땲??`
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

## Automatic Project and Agent Routing

`DONGGRI_AUTO_ROUTING_V1`

- Normal task creation must not require the user to choose a project path or employee.
- The server resolver decides `project_id`, `project_path`, `workflow_pack_key`, `department_id`, `assigned_agent_id`, `routing_confidence`, `routing_reason`, and `routing_evidence`.
- Routing order is fixed: explicit project metadata -> source/session binding -> project name/path/alias match -> core goal/recent task similarity -> PMO triage.
- Low-confidence project routing must move the task to PMO triage instead of asking the user for a path.
- Manual assignment is an admin exception only. `POST /api/tasks/:id/assign` must include `override_reason` and leave an audit log.
- UI must hide normal employee assignment controls and show only the automatic routing result and reason.
- Never fabricate a project path or temporary workspace. Unknown routing is a PMO review case, not a user-blocking prompt.

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

1. Recognize it as a task request.
2. Strip the `#` prefix and POST to the API without asking for project or employee selection:
   ```bash
   curl -X POST http://127.0.0.1:8900/api/inbox \
     -H 'content-type: application/json' \
     -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
     -d '{"source":"telegram","text":"<message content>"}'
   ```
3. Validate HTTP status first. If non-`200`, report failure and stop.
4. Confirm to the user with only:
   - KO: "태스크 등록 완료"
   - EN: "Task registered"
5. If a reliable project signal exists, include it as `project_id`, `project_path`, or `project_hint`. If not, omit project fields and let automatic routing decide.
6. Low-confidence routing must move to PMO triage/DecisionInbox. Do not block the user by asking for a path in the normal flow.

### 2. Task Distribution

When a task appears in Inbox:

1. Run the central task routing resolver.
2. Resolve in this order: project -> workflow pack -> department -> responsible staff -> specialist subagent.
3. If routing confidence is low, set PMO triage metadata instead of asking the user for a project path.
4. Check for existing terminal logs before re-running a task.
5. Start execution only after the resolver has produced a valid project path and runnable responsible staff.

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

Task project and staff selection are automatic by default.

### Rules

1. **If `project_id` or `project_path` is set:** validate it and use it as routing evidence.
2. **If `project_hint` is set:** use it as non-binding routing evidence.
3. **If no project signal exists:** infer from project name/path/alias/core goal/recent task similarity.
4. **If confidence is low:** do not ask the user for a path; move the task to PMO triage.
5. **Never create a temporary directory or guess a new path.** No `/tmp/temp/`, no `~/Desktop/`, no fabricated paths.
6. **Manual employee assignment is an admin override only** and requires `override_reason`.

### Existing session check

Before starting a new agent run, check if the task already has previous runs:

```bash
curl "http://127.0.0.1:8900/api/tasks/<id>/terminal?lines=20"
```

If the terminal log exists and contains prior work, ask the user:

- KO: "이 태스크에 이전 작업 내역이 있습니다. 이어서 진행할까요, 새로 시작할까요?"
- EN: "This task has prior work. Continue where it left off, or start fresh?"

### Ingestion with routing hints

When creating tasks via webhook, include `project_id`, `project_path`, or `project_hint` only when it is known:

```bash
curl -X POST http://127.0.0.1:8900/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"fix the build","project_hint":"checkout service"}'
```

If the source message does not contain a project signal, do NOT include project fields. The server resolver will route it or send it to PMO triage.

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
curl http://127.0.0.1:8900/api/health

# List all tasks
curl http://127.0.0.1:8900/api/tasks

# List tasks by status
curl "http://127.0.0.1:8900/api/tasks?status=inbox"

# Create task via inbox webhook
curl -X POST http://127.0.0.1:8900/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"<message>"}'

# Send CEO directive ($ prefix included)
curl -X POST http://127.0.0.1:8900/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"$<directive message>"}'

# View task detail
curl http://127.0.0.1:8900/api/tasks/<id>

# Update task fields
curl -X PATCH http://127.0.0.1:8900/api/tasks/<id> \
  -H 'content-type: application/json' \
  -d '{"project_path":"/workspace/my-project"}'

# View terminal log
curl "http://127.0.0.1:8900/api/tasks/<id>/terminal?lines=50"

# Run agent on a task
curl -X POST http://127.0.0.1:8900/api/tasks/<id>/run

# Stop a running agent
curl -X POST http://127.0.0.1:8900/api/tasks/<id>/stop

# Admin-only manual assignment override
curl -X POST http://127.0.0.1:8900/api/tasks/<id>/assign \
  -H 'content-type: application/json' \
  -d '{"agent_id":"<agent-id>","override_reason":"<why automatic routing was overridden>"}'

# List agents
curl http://127.0.0.1:8900/api/agents

# List departments
curl http://127.0.0.1:8900/api/departments

# Get settings
curl http://127.0.0.1:8900/api/settings

# CLI provider status
curl http://127.0.0.1:8900/api/cli-status
```

---

## Response Rules (STRICT)

When processing `$` or `#` commands, the response to the user must be **minimal and clean**:

1. **`$` directive**: After collecting required meeting/path inputs and sending to API, reply with only `??Claw-Empire ?낅Т吏???꾨떖 ?꾨즺` (or language equivalent). Nothing else.
2. **`#` task**: Only `???쒖뒪???깅줉 ?꾨즺` (or language equivalent). Nothing else.
3. **Failure case**: If API status is non-`200`, do not send success text.
   - Exception: for `HTTP 428` + `agent_upgrade_required`, you MUST show installer paths and ask `吏湲??쒓? 吏곸젒 ?ㅼ튂?대뱶由닿퉴??` (language-matched).
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
