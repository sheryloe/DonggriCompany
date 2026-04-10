import path from "node:path";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { getDepartmentPromptForPack } from "../packs/department-scope.ts";
import { ensureVideoPreprodRemotionBestPracticesSkill } from "../core/video-skill-bootstrap.ts";
import { buildWorkflowPackExecutionGuidance } from "../packs/execution-guidance.ts";
import { resolveVideoArtifactSpecForTask } from "../packs/video-artifact.ts";
import { resolveProviderRuntimeKind } from "../agents/provider-runtime-kind.ts";
import { resolveConstrainedAgentScopeForTask } from "../../routes/core/tasks/execution-run-auto-assign.ts";
import { isPrimaryAuthorProfile, resolveAgentWorkflowProfile } from "../agents/workflow-profile.ts";
import {
  buildInterruptPromptBlock,
  consumeInterruptPrompts,
  loadPendingInterruptPrompts,
} from "../core/interrupt-injection-tools.ts";

type CreateExecutionStartTaskToolsDeps = {
  nowMs: RuntimeContext["nowMs"];
  db: RuntimeContext["db"];
  logsDir: RuntimeContext["logsDir"];
  appendTaskLog: RuntimeContext["appendTaskLog"];
  broadcast: RuntimeContext["broadcast"];
  ensureTaskExecutionSession: RuntimeContext["ensureTaskExecutionSession"];
  resolveLang: RuntimeContext["resolveLang"];
  notifyTaskStatus: (...args: any[]) => any;
  resolveProjectPath: RuntimeContext["resolveProjectPath"];
  createWorktree: RuntimeContext["createWorktree"];
  getDeptRoleConstraint: RuntimeContext["getDeptRoleConstraint"];
  getRecentConversationContext: RuntimeContext["getRecentConversationContext"];
  getTaskContinuationContext: RuntimeContext["getTaskContinuationContext"];
  getRecentChanges: RuntimeContext["getRecentChanges"];
  ensureClaudeMd: RuntimeContext["ensureClaudeMd"];
  pickL: RuntimeContext["pickL"];
  l: RuntimeContext["l"];
  buildAvailableSkillsPromptBlock: RuntimeContext["buildAvailableSkillsPromptBlock"];
  buildTaskExecutionPrompt: RuntimeContext["buildTaskExecutionPrompt"];
  hasExplicitWarningFixRequest: RuntimeContext["hasExplicitWarningFixRequest"];
  getNextHttpAgentPid: RuntimeContext["getNextHttpAgentPid"];
  launchApiProviderAgent: RuntimeContext["launchApiProviderAgent"];
  launchHttpAgent: RuntimeContext["launchHttpAgent"];
  getProviderModelConfig: RuntimeContext["getProviderModelConfig"];
  spawnCliAgent: RuntimeContext["spawnCliAgent"];
  handleTaskRunComplete: RuntimeContext["handleTaskRunComplete"];
  notifyCeo: RuntimeContext["notifyCeo"];
  startProgressTimer: RuntimeContext["startProgressTimer"];
};

export function createExecutionStartTaskTools(deps: CreateExecutionStartTaskToolsDeps) {
  const {
    nowMs,
    db,
    logsDir,
    appendTaskLog,
    broadcast,
    ensureTaskExecutionSession,
    resolveLang,
    notifyTaskStatus,
    resolveProjectPath,
    createWorktree,
    getDeptRoleConstraint,
    getRecentConversationContext,
    getTaskContinuationContext,
    getRecentChanges,
    ensureClaudeMd,
    pickL,
    l,
    buildAvailableSkillsPromptBlock,
    buildTaskExecutionPrompt,
    hasExplicitWarningFixRequest,
    getNextHttpAgentPid,
    launchApiProviderAgent,
    launchHttpAgent,
    getProviderModelConfig,
    spawnCliAgent,
    handleTaskRunComplete,
    notifyCeo,
    startProgressTimer,
  } = deps;

  function startTaskExecutionForAgent(taskId: string, execAgent: any, deptId: string | null, deptName: string): void {
    const execName = execAgent.name_ko || execAgent.name;
    const t = nowMs();
    db.prepare(
      "UPDATE tasks SET status = 'in_progress', assigned_agent_id = ?, started_at = ?, updated_at = ? WHERE id = ?",
    ).run(execAgent.id, t, t, taskId);
    db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(taskId, execAgent.id);
    appendTaskLog(taskId, "system", `${execName} started (approved)`);

    broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId));
    broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(execAgent.id));

    const provider = execAgent.cli_provider || "claude";
    const runtimeKind = resolveProviderRuntimeKind(provider);
    if (!runtimeKind) return;
    const executionSession = ensureTaskExecutionSession(taskId, execAgent.id, provider);
    const pendingInterruptPrompts = loadPendingInterruptPrompts(db as any, taskId, executionSession.sessionId);
    const interruptPromptBlock = buildInterruptPromptBlock(pendingInterruptPrompts);

    const taskData = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as
      | {
          title: string;
          description: string | null;
          project_id: string | null;
          project_path: string | null;
          department_id: string | null;
          base_branch: string | null;
          workflow_pack_key: string | null;
        }
      | undefined;
    if (!taskData) return;
    ensureVideoPreprodRemotionBestPracticesSkill({
      db: db as any,
      nowMs,
      workflowPackKey: taskData.workflow_pack_key,
      provider,
      taskId,
      appendTaskLog,
    });
    const taskLang = resolveLang(taskData.description ?? taskData.title);
    const videoArtifactSpec =
      taskData.workflow_pack_key === "video_preprod"
        ? resolveVideoArtifactSpecForTask(db as any, {
            project_id: taskData.project_id,
            project_path: taskData.project_path,
            department_id: deptId ?? taskData.department_id ?? null,
            workflow_pack_key: taskData.workflow_pack_key,
          })
        : null;
    const workflowPackGuidance = buildWorkflowPackExecutionGuidance(taskData.workflow_pack_key, taskLang, {
      videoArtifactRelativePath: videoArtifactSpec?.relativePath,
    });
    notifyTaskStatus(taskId, taskData.title, "in_progress", taskLang);

    const projPath = resolveProjectPath(taskData);
    const worktreePath = createWorktree(projPath, taskId, execAgent.name, taskData.base_branch ?? undefined);
    if (!worktreePath) {
      const rollbackAt = nowMs();
      appendTaskLog(
        taskId,
        "error",
        `Execution blocked: isolated worktree creation failed for project path '${projPath}'`,
      );
      db.prepare("UPDATE tasks SET status = 'pending', started_at = NULL, updated_at = ? WHERE id = ?").run(
        rollbackAt,
        taskId,
      );
      db.prepare(
        "UPDATE agents SET status = 'idle', current_task_id = CASE WHEN current_task_id = ? THEN NULL ELSE current_task_id END WHERE id = ?",
      ).run(taskId, execAgent.id);
      broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId));
      broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(execAgent.id));
      notifyTaskStatus(taskId, taskData.title, "pending", taskLang);
      notifyCeo(
        pickL(
          l(
            [
              `[WORKTREE REQUIRED] '${taskData.title}' ?ㅽ뻾??李⑤떒?덉뒿?덈떎. 寃⑸━ worktree ?앹꽦???ㅽ뙣???꾨줈?앺듃 猷⑦듃 ?ㅼ뿼??諛⑹??섍린 ?꾪빐 以묐떒?섏뿀?듬땲??`,
            ],
            [
              `[WORKTREE REQUIRED] Blocked execution for '${taskData.title}'. Isolated worktree creation failed, so run was aborted to protect the project root.`,
            ],
            [
              `[WORKTREE REQUIRED] Blocked execution for "${taskData.title}". Isolated worktree creation failed, so run was aborted to protect the project root.`,
            ],
            [
              `[WORKTREE REQUIRED] Blocked execution for "${taskData.title}". Isolated worktree creation failed, so run was aborted to protect the project root.`,
            ],
          ),
          taskLang,
        ),
        taskId,
      );
      return;
    }
    const agentCwd = worktreePath;
    appendTaskLog(taskId, "system", `Git worktree created: ${worktreePath} (branch: climpire/${taskId.slice(0, 8)})`);
    const logFilePath = path.join(logsDir, `${taskId}.log`);
    const roleLabels: Record<string, string> = {
      team_leader: "Team Leader",
      senior: "Senior",
      junior: "Junior",
      intern: "Intern",
    };
    const roleLabel = roleLabels[execAgent.role] ?? execAgent.role;
    const deptConstraint = deptId ? getDeptRoleConstraint(deptId, deptName) : "";
    const deptPromptRaw = deptId ? getDepartmentPromptForPack(db as any, taskData.workflow_pack_key, deptId) : null;
    const deptPrompt = typeof deptPromptRaw === "string" ? deptPromptRaw.trim() : "";
    const deptPromptBlock = deptPrompt ? `[Department Shared Prompt]\n${deptPrompt}` : "";
    const conversationCtx = getRecentConversationContext(execAgent.id);
    const continuationCtx = getTaskContinuationContext(taskId);
    const recentChanges = getRecentChanges(projPath, taskId);
    if (provider === "claude") {
      ensureClaudeMd(projPath, worktreePath);
    }
    const continuationInstruction = continuationCtx
      ? pickL(
          l(
            ["?곗냽 ?ㅽ뻾: ?뚯쑀 而⑦뀓?ㅽ듃瑜??좎??섍퀬 ?몄궗/李⑹닔 硫섑듃 ?놁씠 誘명빐寃?寃????ぉ??利됱떆 諛섏쁺?섏꽭??"],
            [
              "Continuation run: keep ownership, skip greetings/kickoff narration, and execute unresolved review items immediately.",
            ],
            ["Continuation run: keep ownership, skip greetings/kickoff narration, and execute unresolved review items immediately."],
            ["Continuation run: keep ownership, skip greetings/kickoff narration, and execute unresolved review items immediately."],
          ),
          taskLang,
        )
      : pickL(
          l(
            ["湲??쒕줎 ?놁씠 諛붾줈 ?ㅽ뻾?섍퀬, 硫붿떆吏??媛꾧껐?섍쾶 ?좎??섏꽭??"],
            ["Execute directly without long preamble and keep messages concise."],
            ["Execute directly without long preamble and keep messages concise."],
            ["Execute directly without long preamble and keep messages concise."],
          ),
          taskLang,
        );
    const runInstruction = pickL(
      l(
        ["???묒뾽??異⑸텇???꾩닔?섏꽭?? ?꾩슂 ???곗냽 ?ㅽ뻾 ?붿빟怨????留λ씫??李멸퀬?섏꽭??"],
        [
          "Please complete the task above thoroughly. Use the continuation brief and conversation context above if relevant.",
        ],
        ["Please complete the task above thoroughly. Use the continuation brief and conversation context above if relevant."],
        ["Please complete the task above thoroughly. Use the continuation brief and conversation context above if relevant."],
      ),
      taskLang,
    );
    const availableSkillsPromptBlock = buildAvailableSkillsPromptBlock(provider);
    const spawnPrompt = buildTaskExecutionPrompt(
      [
        availableSkillsPromptBlock,
        `[Task Session] id=${executionSession.sessionId} owner=${executionSession.agentId} provider=${executionSession.provider}`,
        "This session is scoped to this task only. Keep context continuity inside this task session and do not mix with other projects.",
        recentChanges ? `[Recent Changes]\n${recentChanges}` : "",
        `[Task] ${taskData.title}`,
        taskData.description ? `\n${taskData.description}` : "",
        workflowPackGuidance ? `\n[Workflow Pack Execution Rules]\n${workflowPackGuidance}` : "",
        continuationCtx,
        conversationCtx,
        `\n---`,
        `Agent: ${execAgent.name} (${roleLabel}, ${deptName})`,
        execAgent.personality ? `Personality: ${execAgent.personality}` : "",
        deptConstraint,
        deptPromptBlock,
        `NOTE: You are working in an isolated Git worktree branch (climpire/${taskId.slice(0, 8)}). Commit your changes normally.`,
        interruptPromptBlock,
        continuationInstruction,
        runInstruction,
      ],
      {
        allowWarningFix: hasExplicitWarningFixRequest(taskData.title, taskData.description),
      },
    );

    if (pendingInterruptPrompts.length > 0) {
      consumeInterruptPrompts(
        db as any,
        pendingInterruptPrompts.map((row) => row.id),
        nowMs(),
      );
      appendTaskLog(
        taskId,
        "system",
        `INJECT consumed (${pendingInterruptPrompts.length}) for session ${executionSession.sessionId}`,
      );
    }

    appendTaskLog(taskId, "system", `RUN start (agent=${execAgent.name}, provider=${provider})`);
    if (runtimeKind === "api") {
      const controller = new AbortController();
      const fakePid = getNextHttpAgentPid();
      launchApiProviderAgent(
        taskId,
        execAgent.api_provider_id ?? null,
        execAgent.api_model ?? null,
        spawnPrompt,
        agentCwd,
        logFilePath,
        controller,
        fakePid,
      );
    } else if (runtimeKind === "http_stream") {
      const controller = new AbortController();
      const fakePid = getNextHttpAgentPid();
      launchHttpAgent(
        taskId,
        provider,
        spawnPrompt,
        agentCwd,
        logFilePath,
        controller,
        fakePid,
        execAgent.oauth_account_id ?? null,
      );
    } else {
      const modelConfig = getProviderModelConfig();
      const modelForProvider = execAgent.cli_model || modelConfig[provider]?.model || undefined;
      const reasoningLevel =
        provider === "codex"
          ? execAgent.cli_reasoning_level || modelConfig[provider]?.reasoningLevel || undefined
          : modelConfig[provider]?.reasoningLevel || undefined;
      const child = spawnCliAgent(
        taskId,
        provider,
        spawnPrompt,
        agentCwd,
        logFilePath,
        modelForProvider,
        reasoningLevel,
        execAgent.cli_account_pool_id ?? null,
      );
      child.on("close", (code: number | null) => {
        handleTaskRunComplete(taskId, code ?? 1);
      });
    }

    const worktreeNote = pickL(
      l(
        [` (寃⑸━ 釉뚮옖移? climpire/${taskId.slice(0, 8)})`],
        [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
        [` (?녽썴?뽧꺀?녈긽: climpire/${taskId.slice(0, 8)})`],
        [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
      ),
      taskLang,
    );
    notifyCeo(
      pickL(
        l(
          [`${execName}媛 '${taskData.title}' ?묒뾽???쒖옉?덉뒿?덈떎.${worktreeNote}`],
          [`${execName} started work on '${taskData.title}'.${worktreeNote}`],
          [`${execName}??'${taskData.title}' ??퐳璵?굮?뗥쭓?쀣겲?쀣걼??{worktreeNote}`],
          [`${execName} 藥꿨?冶뗥쨪??'${taskData.title}'??{worktreeNote}`],
        ),
        taskLang,
      ),
      taskId,
    );
    startProgressTimer(taskId, taskData.title, deptId);
  }

  return {
    startTaskExecutionForAgent,
  };
}
