import path from "node:path";
import { notifyTaskStatus } from "../../../../gateway/client.ts";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import type { AgentRow } from "../../shared/types.ts";
import { resolveConstrainedAgentScopeForTask, selectAutoAssignableAgentForTask } from "./execution-run-auto-assign.ts";
import { resolveProviderRuntimeKind } from "../../../workflow/agents/provider-runtime-kind.ts";
import { buildWorkflowPackExecutionGuidance } from "../../../workflow/packs/execution-guidance.ts";
import { resolveVideoArtifactSpecForTask } from "../../../workflow/packs/video-artifact.ts";
import { ensureVideoPreprodRemotionBestPracticesSkill } from "../../../workflow/core/video-skill-bootstrap.ts";
import {
  buildInterruptPromptBlock,
  consumeInterruptPrompts,
  loadPendingInterruptPrompts,
} from "../../../workflow/core/interrupt-injection-tools.ts";

export type TaskRunRouteDeps = Pick<
  RuntimeContext,
  | "app"
  | "db"
  | "activeProcesses"
  | "appendTaskLog"
  | "nowMs"
  | "resolveLang"
  | "ensureTaskExecutionSession"
  | "resolveProjectPath"
  | "logsDir"
  | "createWorktree"
  | "generateProjectContext"
  | "getRecentChanges"
  | "ensureClaudeMd"
  | "getDeptRoleConstraint"
  | "normalizeTextField"
  | "getRecentConversationContext"
  | "getTaskContinuationContext"
  | "pickL"
  | "l"
  | "getProviderModelConfig"
  | "buildTaskExecutionPrompt"
  | "hasExplicitWarningFixRequest"
  | "getNextHttpAgentPid"
  | "broadcast"
  | "getAgentDisplayName"
  | "notifyCeo"
  | "startProgressTimer"
  | "launchApiProviderAgent"
  | "launchHttpAgent"
  | "spawnCliAgent"
  | "handleTaskRunComplete"
  | "buildAvailableSkillsPromptBlock"
>;

export function registerTaskRunRoute(deps: TaskRunRouteDeps): void {
  const {
    app,
    db,
    activeProcesses,
    appendTaskLog,
    nowMs,
    resolveLang,
    ensureTaskExecutionSession,
    resolveProjectPath,
    logsDir,
    createWorktree,
    generateProjectContext,
    getRecentChanges,
    ensureClaudeMd,
    getDeptRoleConstraint,
    normalizeTextField,
    getRecentConversationContext,
    getTaskContinuationContext,
    pickL,
    l,
    getProviderModelConfig,
    buildTaskExecutionPrompt,
    hasExplicitWarningFixRequest,
    getNextHttpAgentPid,
    broadcast,
    getAgentDisplayName,
    notifyCeo,
    startProgressTimer,
    launchApiProviderAgent,
    launchHttpAgent,
    spawnCliAgent,
    handleTaskRunComplete,
    buildAvailableSkillsPromptBlock,
  } = deps;

  app.post("/api/tasks/:id/run", (req, res) => {
    const id = String(req.params.id);
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | {
          id: string;
          title: string;
          description: string | null;
          assigned_agent_id: string | null;
          department_id: string | null;
          project_id: string | null;
          workflow_pack_key: string | null;
          project_path: string | null;
          status: string;
        }
      | undefined;
    if (!task) return res.status(404).json({ error: "not_found" });
    const taskLang = resolveLang(task.description ?? task.title);

    if (activeProcesses.has(id)) {
      const staleChild = activeProcesses.get(id);
      const stalePid = typeof staleChild?.pid === "number" ? staleChild.pid : null;
      let pidIsAlive = false;
      if (stalePid !== null && stalePid > 0) {
        try {
          process.kill(stalePid, 0);
          pidIsAlive = true;
        } catch {
          pidIsAlive = false;
        }
      }
      if (!pidIsAlive) {
        activeProcesses.delete(id);
        appendTaskLog(id, "system", `Cleaned up stale process handle (pid=${stalePid}) on re-run attempt`);
      }
    }

    if (task.status === "in_progress" || task.status === "collaborating") {
      if (activeProcesses.has(id)) {
        return res.status(400).json({ error: "already_running" });
      }
      const t = nowMs();
      db.prepare("UPDATE tasks SET status = 'pending', updated_at = ? WHERE id = ?").run(t, id);
      task.status = "pending";
      appendTaskLog(id, "system", `Reset stale in_progress status (no active process) for re-run`);
    }

    if (activeProcesses.has(id)) {
      return res.status(409).json({
        error: "process_still_active",
        message: "Previous run is still stopping. Please retry after a moment.",
      });
    }

    let agentId = task.assigned_agent_id || (req.body?.agent_id as string | undefined);
    if (agentId) {
      const constrainedAgentIds = resolveConstrainedAgentScopeForTask(db as any, {
        workflow_pack_key: task.workflow_pack_key,
        department_id: task.department_id,
        project_id: task.project_id,
      });
      if (
        Array.isArray(constrainedAgentIds) &&
        constrainedAgentIds.length > 0 &&
        !constrainedAgentIds.includes(agentId)
      ) {
        appendTaskLog(
          id,
          "system",
          `Assigned agent (${agentId}) is out of scope for workflow pack. Re-selecting by pack rules.`,
        );
        agentId = undefined;
      }
    }
    if (!agentId) {
      const autoSelected = selectAutoAssignableAgentForTask(db as any, {
        workflow_pack_key: task.workflow_pack_key,
        department_id: task.department_id,
        project_id: task.project_id,
      });
      if (autoSelected) {
        agentId = autoSelected.agent.id;
        const assignedAt = nowMs();
        db.prepare(
          "UPDATE tasks SET assigned_agent_id = ?, department_id = COALESCE(department_id, ?), status = CASE WHEN status = 'inbox' THEN 'planned' ELSE status END, updated_at = ? WHERE id = ?",
        ).run(agentId, autoSelected.agent.department_id, assignedAt, id);
        db.prepare("UPDATE agents SET current_task_id = ? WHERE id = ?").run(id, agentId);
        appendTaskLog(
          id,
          "system",
          `Auto-assigned by workflow pack (${autoSelected.packKey}): ${autoSelected.agent.name}`,
        );
      }
    }
    if (!agentId) {
      return res.status(400).json({
        error: "no_agent_assigned",
        message: "Assign an agent before running.",
      });
    }

    let agent:
      | {
          id: string;
          name: string;
          name_ko: string | null;
          role: string;
          cli_provider: string | null;
          oauth_account_id: string | null;
          api_provider_id: string | null;
          api_model: string | null;
          cli_model: string | null;
          cli_reasoning_level: string | null;
          cli_account_pool_id: string | null;
          personality: string | null;
          department_id: string | null;
          department_name: string | null;
          department_name_ko: string | null;
          department_prompt: string | null;
        }
      | undefined;
    try {
      agent = db
        .prepare(
          `
      SELECT
        a.*,
        COALESCE(opd.name, d.name) AS department_name,
        COALESCE(opd.name_ko, d.name_ko) AS department_name_ko,
        COALESCE(opd.prompt, d.prompt) AS department_prompt
      FROM agents a
      LEFT JOIN office_pack_departments opd
        ON opd.workflow_pack_key = COALESCE(?, 'development')
       AND opd.department_id = a.department_id
      LEFT JOIN departments d ON a.department_id = d.id
      WHERE a.id = ?
    `,
        )
        .get(task.workflow_pack_key, agentId) as
        | {
            id: string;
            name: string;
            name_ko: string | null;
            role: string;
            cli_provider: string | null;
            oauth_account_id: string | null;
            api_provider_id: string | null;
            api_model: string | null;
            cli_model: string | null;
            cli_reasoning_level: string | null;
            cli_account_pool_id: string | null;
            personality: string | null;
            department_id: string | null;
            department_name: string | null;
            department_name_ko: string | null;
            department_prompt: string | null;
          }
        | undefined;
    } catch {
      agent = db
        .prepare(
          `
      SELECT a.*, d.name AS department_name, d.name_ko AS department_name_ko, d.prompt AS department_prompt
      FROM agents a LEFT JOIN departments d ON a.department_id = d.id
      WHERE a.id = ?
    `,
        )
        .get(agentId) as
        | {
            id: string;
            name: string;
            name_ko: string | null;
            role: string;
            cli_provider: string | null;
            oauth_account_id: string | null;
            api_provider_id: string | null;
            api_model: string | null;
            cli_model: string | null;
            cli_reasoning_level: string | null;
            cli_account_pool_id: string | null;
            personality: string | null;
            department_id: string | null;
            department_name: string | null;
            department_name_ko: string | null;
            department_prompt: string | null;
          }
        | undefined;
    }
    if (!agent) return res.status(400).json({ error: "agent_not_found" });

    const agentBusy = activeProcesses.has(
      (
        db.prepare("SELECT current_task_id FROM agents WHERE id = ? AND status = 'working'").get(agentId) as
          | { current_task_id: string | null }
          | undefined
      )?.current_task_id ?? "",
    );
    if (agentBusy) {
      return res
        .status(400)
        .json({ error: "agent_busy", message: `${agent.name} is already working on another task.` });
    }

    const provider = agent.cli_provider || "claude";
    const runtimeKind = resolveProviderRuntimeKind(provider);
    if (!runtimeKind) {
      return res.status(400).json({ error: "unsupported_provider", provider });
    }
    ensureVideoPreprodRemotionBestPracticesSkill({
      db: db as any,
      nowMs,
      workflowPackKey: task.workflow_pack_key,
      provider,
      taskId: id,
      appendTaskLog,
    });
    const executionSession = ensureTaskExecutionSession(id, agentId, provider);
    const pendingInterruptPrompts = loadPendingInterruptPrompts(db as any, id, executionSession.sessionId);
    const interruptPromptBlock = buildInterruptPromptBlock(pendingInterruptPrompts);

    const projectPath = resolveProjectPath(task) || (req.body?.project_path as string | undefined) || process.cwd();
    const logPath = path.join(logsDir, `${id}.log`);

    const worktreePath = createWorktree(projectPath, id, agent.name);
    if (!worktreePath) {
      appendTaskLog(
        id,
        "error",
        `Execution blocked: isolated worktree creation failed for project path '${projectPath}'`,
      );
      return res.status(409).json({
        error: "worktree_required",
        message: "Isolated worktree creation failed. Task execution was blocked to protect the project root.",
      });
    }
    const agentCwd = worktreePath;

    appendTaskLog(id, "system", `Git worktree created: ${worktreePath} (branch: climpire/${id.slice(0, 8)})`);

    const projectContext = generateProjectContext(projectPath);
    const recentChanges = getRecentChanges(projectPath, id);

    if (provider === "claude") {
      ensureClaudeMd(projectPath, worktreePath);
    }

    const roleLabel =
      { team_leader: "Team Leader", senior: "Senior", junior: "Junior", intern: "Intern" }[agent.role] || agent.role;
    const deptConstraint = agent.department_id
      ? getDeptRoleConstraint(agent.department_id, agent.department_name || agent.department_id)
      : "";
    const departmentPrompt = normalizeTextField(agent.department_prompt);
    const departmentPromptBlock = departmentPrompt ? `[Department Shared Prompt]\n${departmentPrompt}` : "";
    const conversationCtx = getRecentConversationContext(agentId);
    const continuationCtx = getTaskContinuationContext(id);
    const continuationInstruction = continuationCtx
      ? pickL(
          l(
            ["?곗냽 ?ㅽ뻾: ?숈씪 ?뚯쑀 而⑦뀓?ㅽ듃瑜??좎??섍퀬, 遺덊븘?뷀븳 ?뚯씪 ?ы깘???놁씠 誘명빐寃???ぉ留?諛섏쁺?섏꽭??"],
            [
              "Continuation run: keep the same ownership context, avoid re-reading unrelated files, and apply only unresolved deltas.",
            ],
            ["Continuation run: keep the same ownership context, avoid re-reading unrelated files, and apply only unresolved deltas."],
            ["Continuation run: keep the same ownership context, avoid re-reading unrelated files, and apply only unresolved deltas."],
          ),
          taskLang,
        )
      : pickL(
          l(
            ["諛섎났?곸씤 李⑹닔 硫섑듃 ?놁씠 諛붾줈 ?ㅽ뻾?섏꽭??"],
            ["Execute directly without repeated kickoff narration."],
            ["Execute directly without repeated kickoff narration."],
            ["Execute directly without repeated kickoff narration."],
          ),
          taskLang,
        );
    const projectStructureBlock = continuationCtx
      ? ""
      : projectContext
        ? `[Project Structure]\n${projectContext.length > 4000 ? projectContext.slice(0, 4000) + "\n... (truncated)" : projectContext}`
        : "";
    const needsPlanInstruction = provider === "gemini" || provider === "copilot" || provider === "antigravity";
    const subtaskInstruction = needsPlanInstruction
      ? `\n\n${pickL(
          l(
            [
              `[?묒뾽 怨꾪쉷 異쒕젰 洹쒖튃]
?묒뾽???쒖옉?섍린 ?꾩뿉 ?꾨옒 JSON ?뺤떇?쇰줈 怨꾪쉷??異쒕젰?섏꽭??
\`\`\`json
{"subtasks": [{"title": "?쒕툕?쒖뒪???쒕ぉ1"}, {"title": "?쒕툕?쒖뒪???쒕ぉ2"}]}
\`\`\`
媛??쒕툕?쒖뒪?щ? ?꾨즺???뚮쭏???꾨옒 ?뺤떇?쇰줈 蹂닿퀬?섏꽭??
\`\`\`json
{"subtask_done": "?꾨즺???쒕툕?쒖뒪???쒕ぉ"}
\`\`\``,
            ],
            [
              `[Task Plan Output Rules]
Before starting work, print a plan in the JSON format below:
\`\`\`json
{"subtasks": [{"title": "Subtask title 1"}, {"title": "Subtask title 2"}]}
\`\`\`
Whenever you complete a subtask, report it in this format:
\`\`\`json
{"subtask_done": "Completed subtask title"}
\`\`\``,
            ],
            [
              `[鵝쒏?鼇덄뵽??눣?쎼꺂?쇈꺂]
鵝쒏??뗥쭓?띲겓?곫А??JSON 壤℡폀?㎬쮫?삠굮?뷴뒟?쀣겍?뤵걽?뺛걚:
\`\`\`json
{"subtasks": [{"title": "?듐깣?욍궧??"}, {"title": "?듐깣?욍궧??"}]}
\`\`\`
?꾠궢?뽧궭?밤궚?믣츑雅녴걲?뗣걼?녈겓?곫А??숱凉뤵겎?긷몜?쀣겍?뤵걽?뺛걚:
\`\`\`json
{"subtask_done": "done subtask title"}
\`\`\``,
            ],
            [
              `[餓삣뒦溫▼닋渦볟눣鰲꾢닕]
凉冶뗥램鵝쒎뎺竊뚩??됦툔瓦?JSON ?쇔폀渦볟눣溫▼닋:
\`\`\`json
{"subtasks": [{"title": "耶먧뻣??"}, {"title": "耶먧뻣??"}]}
\`\`\`
驪뤷츑?먧?訝ゅ춴餓삣뒦竊뚩??됦툔瓦경졏凉뤸콋??
\`\`\`json
{"subtask_done": "done subtask title"}
\`\`\``,
            ],
          ),
          taskLang,
        )}\n`
      : "";

    const modelConfig = getProviderModelConfig();
    const mainModel = agent.cli_model || modelConfig[provider]?.model || undefined;
    const subModel = modelConfig[provider]?.subModel || undefined;
    const mainReasoningLevel =
      provider === "codex"
        ? agent.cli_reasoning_level || modelConfig[provider]?.reasoningLevel || undefined
        : modelConfig[provider]?.reasoningLevel || undefined;
    const subReasoningLevel = modelConfig[provider]?.subModelReasoningLevel || undefined;
    const subModelHint =
      subModel && (provider === "claude" || provider === "codex")
        ? `\n[Sub-agent model preference] When spawning sub-agents (Task tool), prefer using model: ${subModel}${subReasoningLevel ? ` with reasoning effort: ${subReasoningLevel}` : ""}`
        : "";
    const runInstruction = pickL(
      l(
        [
          "???묒뾽??異⑸텇???꾩닔?섏꽭?? ?????留λ씫怨??꾨줈?앺듃 援ъ“瑜?李멸퀬?대룄 醫뗭?留? ?꾨줈?앺듃 援ъ“ ?먯깋???쒓컙???곗? 留덉꽭?? ?꾩슂??援ъ“???대? ?쒓났?섏뿀?듬땲??",
        ],
        [
          "Please complete the task above thoroughly. Use the continuation brief, conversation context, and project structure above if relevant. Do NOT spend time exploring the project structure again unless required by unresolved checklist items.",
        ],
        [
          "Please complete the task above thoroughly. Use the continuation brief, conversation context, and project structure above if relevant. Do NOT spend time exploring the project structure again unless required by unresolved checklist items.",
        ],
        [
          "Please complete the task above thoroughly. Use the continuation brief, conversation context, and project structure above if relevant. Do NOT spend time exploring the project structure again unless required by unresolved checklist items.",
        ],
      ),
      taskLang,
    );
    const videoArtifactSpec =
      task.workflow_pack_key === "video_preprod"
        ? resolveVideoArtifactSpecForTask(db as any, {
            project_id: task.project_id,
            project_path: task.project_path,
            department_id: task.department_id,
            workflow_pack_key: task.workflow_pack_key,
          })
        : null;
    const workflowPackGuidance = buildWorkflowPackExecutionGuidance(task.workflow_pack_key, taskLang, {
      videoArtifactRelativePath: videoArtifactSpec?.relativePath,
    });

    const prompt = buildTaskExecutionPrompt(
      [
        (
          buildAvailableSkillsPromptBlock ||
          ((providerName: string) => `[Available Skills][provider=${providerName || "unknown"}][unavailable]`)
        )(provider),
        `[Task Session] id=${executionSession.sessionId} owner=${executionSession.agentId} provider=${executionSession.provider}`,
        "This session is task-scoped. Keep continuity for this task only and do not cross-contaminate context from other projects.",
        projectStructureBlock,
        recentChanges ? `[Recent Changes]\n${recentChanges}` : "",
        `[Task] ${task.title}`,
        task.description ? `\n${task.description}` : "",
        workflowPackGuidance ? `\n[Workflow Pack Execution Rules]\n${workflowPackGuidance}` : "",
        continuationCtx,
        conversationCtx,
        `\n---`,
        `Agent: ${agent.name} (${roleLabel}, ${agent.department_name || "Unassigned"})`,
        agent.personality ? `Personality: ${agent.personality}` : "",
        deptConstraint,
        departmentPromptBlock,
        `NOTE: You are working in an isolated Git worktree branch (climpire/${id.slice(0, 8)}). Commit your changes normally.`,
        interruptPromptBlock,
        subtaskInstruction,
        subModelHint,
        continuationInstruction,
        runInstruction,
      ],
      {
        allowWarningFix: hasExplicitWarningFixRequest(task.title, task.description),
      },
    );

    if (pendingInterruptPrompts.length > 0) {
      consumeInterruptPrompts(
        db as any,
        pendingInterruptPrompts.map((row) => row.id),
        nowMs(),
      );
      appendTaskLog(
        id,
        "system",
        `INJECT consumed (${pendingInterruptPrompts.length}) for session ${executionSession.sessionId}`,
      );
    }

    appendTaskLog(id, "system", `RUN start (agent=${agent.name}, provider=${provider})`);

    if (runtimeKind === "api") {
      const controller = new AbortController();
      const fakePid = getNextHttpAgentPid();

      const t = nowMs();
      db.prepare(
        "UPDATE tasks SET status = 'in_progress', assigned_agent_id = ?, started_at = ?, updated_at = ? WHERE id = ?",
      ).run(agentId, t, t, id);
      db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(id, agentId);

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
      const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
      broadcast("task_update", updatedTask);
      broadcast("agent_status", updatedAgent);
      notifyTaskStatus(id, task.title, "in_progress", taskLang);

      const assigneeName = getAgentDisplayName(agent as unknown as AgentRow, taskLang);
      const worktreeNote = pickL(
        l(
          [` (寃⑸━ 釉뚮옖移? climpire/${id.slice(0, 8)})`],
          [` (isolated branch: climpire/${id.slice(0, 8)})`],
          [` (?녽썴?뽧꺀?녈긽: climpire/${id.slice(0, 8)})`],
          [` (isolated branch: climpire/${id.slice(0, 8)})`],
        ),
        taskLang,
      );
      notifyCeo(
        pickL(
          l(
            [`${assigneeName}媛 '${task.title}' ?묒뾽???쒖옉?덉뒿?덈떎.${worktreeNote}`],
            [`${assigneeName} started work on '${task.title}'.${worktreeNote}`],
            [`${assigneeName}??'${task.title}' ??퐳璵?굮?뗥쭓?쀣겲?쀣걼??{worktreeNote}`],
            [`${assigneeName} 藥꿨?冶뗥쨪??'${task.title}'??{worktreeNote}`],
          ),
          taskLang,
        ),
        id,
      );

      const taskRow = db.prepare("SELECT department_id FROM tasks WHERE id = ?").get(id) as
        | { department_id: string | null }
        | undefined;
      startProgressTimer(id, task.title, taskRow?.department_id ?? null);

      launchApiProviderAgent(
        id,
        agent.api_provider_id ?? null,
        agent.api_model ?? null,
        prompt,
        agentCwd,
        logPath,
        controller,
        fakePid,
      );
      return res.json({ ok: true, pid: fakePid, logPath, cwd: agentCwd, worktree: !!worktreePath });
    }

    if (runtimeKind === "http_stream") {
      const controller = new AbortController();
      const fakePid = getNextHttpAgentPid();

      const t = nowMs();
      db.prepare(
        "UPDATE tasks SET status = 'in_progress', assigned_agent_id = ?, started_at = ?, updated_at = ? WHERE id = ?",
      ).run(agentId, t, t, id);
      db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(id, agentId);

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
      const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
      broadcast("task_update", updatedTask);
      broadcast("agent_status", updatedAgent);
      notifyTaskStatus(id, task.title, "in_progress", taskLang);

      const assigneeName = getAgentDisplayName(agent as unknown as AgentRow, taskLang);
      const worktreeNote = pickL(
        l(
          [` (寃⑸━ 釉뚮옖移? climpire/${id.slice(0, 8)})`],
          [` (isolated branch: climpire/${id.slice(0, 8)})`],
          [` (?녽썴?뽧꺀?녈긽: climpire/${id.slice(0, 8)})`],
          [` (isolated branch: climpire/${id.slice(0, 8)})`],
        ),
        taskLang,
      );
      notifyCeo(
        pickL(
          l(
            [`${assigneeName}媛 '${task.title}' ?묒뾽???쒖옉?덉뒿?덈떎.${worktreeNote}`],
            [`${assigneeName} started work on '${task.title}'.${worktreeNote}`],
            [`${assigneeName}??'${task.title}' ??퐳璵?굮?뗥쭓?쀣겲?쀣걼??{worktreeNote}`],
            [`${assigneeName} 藥꿨?冶뗥쨪??'${task.title}'??{worktreeNote}`],
          ),
          taskLang,
        ),
        id,
      );

      const taskRow = db.prepare("SELECT department_id FROM tasks WHERE id = ?").get(id) as
        | { department_id: string | null }
        | undefined;
      startProgressTimer(id, task.title, taskRow?.department_id ?? null);

      launchHttpAgent(id, provider, prompt, agentCwd, logPath, controller, fakePid, agent.oauth_account_id ?? null);
      return res.json({ ok: true, pid: fakePid, logPath, cwd: agentCwd, worktree: !!worktreePath });
    }

    const child = spawnCliAgent(
      id,
      provider,
      prompt,
      agentCwd,
      logPath,
      mainModel,
      mainReasoningLevel,
      agent.cli_account_pool_id ?? null,
    );

    child.on("close", (code: number | null) => {
      handleTaskRunComplete(id, code ?? 1);
    });

    const t = nowMs();
    db.prepare(
      "UPDATE tasks SET status = 'in_progress', assigned_agent_id = ?, started_at = ?, updated_at = ? WHERE id = ?",
    ).run(agentId, t, t, id);
    db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(id, agentId);

    const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
    broadcast("task_update", updatedTask);
    broadcast("agent_status", updatedAgent);
    notifyTaskStatus(id, task.title, "in_progress", taskLang);

    const assigneeName = getAgentDisplayName(agent as unknown as AgentRow, taskLang);
    const worktreeNote = pickL(
      l(
        [` (寃⑸━ 釉뚮옖移? climpire/${id.slice(0, 8)})`],
        [` (isolated branch: climpire/${id.slice(0, 8)})`],
        [` (?녽썴?뽧꺀?녈긽: climpire/${id.slice(0, 8)})`],
        [` (isolated branch: climpire/${id.slice(0, 8)})`],
      ),
      taskLang,
    );
    notifyCeo(
      pickL(
        l(
          [`${assigneeName}媛 '${task.title}' ?묒뾽???쒖옉?덉뒿?덈떎.${worktreeNote}`],
          [`${assigneeName} started work on '${task.title}'.${worktreeNote}`],
          [`${assigneeName}??'${task.title}' ??퐳璵?굮?뗥쭓?쀣겲?쀣걼??{worktreeNote}`],
          [`${assigneeName} 藥꿨?冶뗥쨪??'${task.title}'??{worktreeNote}`],
        ),
        taskLang,
      ),
      id,
    );

    const taskRow = db.prepare("SELECT department_id FROM tasks WHERE id = ?").get(id) as
      | { department_id: string | null }
      | undefined;
    startProgressTimer(id, task.title, taskRow?.department_id ?? null);

    res.json({ ok: true, pid: child.pid ?? null, logPath, cwd: agentCwd, worktree: !!worktreePath });
  });
}
