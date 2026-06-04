import path from "node:path";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { getDepartmentPromptForPack } from "../packs/department-scope.ts";
import { ensureVideoPreprodRemotionBestPracticesSkill } from "../core/video-skill-bootstrap.ts";
import { buildWorkflowPackExecutionGuidance } from "../packs/execution-guidance.ts";
import { resolveVideoArtifactSpecForTask } from "../packs/video-artifact.ts";
import { buildAgentPromptProfileBlock } from "../agents/agent-profile.ts";
import { resolveProviderExecutionPolicy } from "../agents/provider-policy-resolver.ts";
import { resolveProviderRuntimeKind } from "../agents/provider-runtime-kind.ts";
import { previewCanonicalRouting } from "../../company/canonical-policy.ts";
import { buildCanonicalCapabilityLabel } from "../../company/canonical-display.ts";
import { buildGoalCommandPromptBlock } from "../goal-commands.ts";
import { evaluateExecutionPathGate } from "../core/execution-path-gate.ts";
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

  function startTaskExecutionForAgent(
    taskId: string,
    requestedAgent: any,
    deptId: string | null,
    deptName: string,
  ): void {
    const execAgent = requestedAgent;
    const effectiveDeptId = deptId;
    const effectiveDeptName = deptName;
    if (
      String(execAgent.status ?? "").toLowerCase() === "working" &&
      String(execAgent.current_task_id ?? "").trim() &&
      String(execAgent.current_task_id ?? "").trim() !== taskId
    ) {
      appendTaskLog(
        taskId,
        "system",
        `Execution deferred: agent ${execAgent.name ?? execAgent.id} is busy on ${execAgent.current_task_id}`,
      );
      return;
    }
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
          workflow_meta_json: string | null;
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
            department_id: effectiveDeptId ?? taskData.department_id ?? null,
            workflow_pack_key: taskData.workflow_pack_key,
          })
        : null;
    const workflowPackGuidance = buildWorkflowPackExecutionGuidance(taskData.workflow_pack_key, taskLang, {
      videoArtifactRelativePath: videoArtifactSpec?.relativePath,
    });
    notifyTaskStatus(taskId, taskData.title, "in_progress", taskLang);

    if (!taskData.project_path && !taskData.project_id) {
      const legacyResolvedPath = resolveProjectPath(taskData);
      if (legacyResolvedPath) {
        appendTaskLog(taskId, "system", "compat_warning resolveProjectPath_fallback_ignored");
      }
    }
    const pathGate = evaluateExecutionPathGate({
      db: db as any,
      task: {
        project_id: taskData.project_id,
        project_path: taskData.project_path,
      },
    });
    if (!pathGate.ok) {
      const rollbackAt = nowMs();
      appendTaskLog(taskId, "system", `execution_blocked ${pathGate.error}`);
      appendTaskLog(taskId, "error", `Execution blocked (${pathGate.error}): ${pathGate.message}`);
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
          taskLang === "ko"
            ? l(
                [
                  `[EXECUTION BLOCKED] '${taskData.title}' 실행이 차단되었습니다. (${pathGate.error}) ${pathGate.message}`,
                ],
                [
                  `[EXECUTION BLOCKED] Blocked execution for '${taskData.title}' (${pathGate.error}): ${pathGate.message}`,
                ],
                [
                  `[EXECUTION BLOCKED] Blocked execution for "${taskData.title}" (${pathGate.error}): ${pathGate.message}`,
                ],
                [
                  `[EXECUTION BLOCKED] Blocked execution for "${taskData.title}" (${pathGate.error}): ${pathGate.message}`,
                ],
              )
            : l(
                [
                  `[EXECUTION BLOCKED] '${taskData.title}' 실행이 차단되었습니다. (${pathGate.error}) ${pathGate.message}`,
                ],
                [
                  `[EXECUTION BLOCKED] Blocked execution for '${taskData.title}' (${pathGate.error}): ${pathGate.message}`,
                ],
                [
                  `[EXECUTION BLOCKED] Blocked execution for "${taskData.title}" (${pathGate.error}): ${pathGate.message}`,
                ],
                [
                  `[EXECUTION BLOCKED] Blocked execution for "${taskData.title}" (${pathGate.error}): ${pathGate.message}`,
                ],
              ),
          taskLang,
        ),
        taskId,
      );
      return;
    }
    const projPath = pathGate.projectPath;
    const worktreePath = createWorktree(projPath, taskId, execAgent.name, taskData.base_branch ?? undefined);
    if (!worktreePath) {
      const rollbackAt = nowMs();
      appendTaskLog(taskId, "system", "execution_blocked git_repo_required");
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
          taskLang === "ko"
            ? l(
                [
                  `[git_repo_required] '${taskData.title}' 실행이 차단되었습니다. Git 저장소 기반의 격리 worktree가 필요해 실행을 중단했습니다.`,
                ],
                [
                  `[git_repo_required] Blocked execution for '${taskData.title}'. Git repository based isolated worktree execution is required, so the run was blocked.`,
                ],
                [
                  `[git_repo_required] Blocked execution for "${taskData.title}". Git repository based isolated worktree execution is required, so the run was blocked.`,
                ],
                [
                  `[git_repo_required] Blocked execution for "${taskData.title}". Git repository based isolated worktree execution is required, so the run was blocked.`,
                ],
              )
            : l(
                [
                  `[git_repo_required] '${taskData.title}' 실행이 차단되었습니다. Git 저장소 기반의 격리 worktree가 필요해 실행을 중단했습니다.`,
                ],
                [
                  `[git_repo_required] Blocked execution for '${taskData.title}'. Git repository based isolated worktree execution is required, so the run was blocked.`,
                ],
                [
                  `[git_repo_required] Blocked execution for "${taskData.title}". Git repository based isolated worktree execution is required, so the run was blocked.`,
                ],
                [
                  `[git_repo_required] Blocked execution for "${taskData.title}". Git repository based isolated worktree execution is required, so the run was blocked.`,
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
    const capabilityLabel = buildCanonicalCapabilityLabel(execAgent, taskLang);
    const deptConstraint = effectiveDeptId ? getDeptRoleConstraint(effectiveDeptId, effectiveDeptName) : "";
    const deptPromptRaw = effectiveDeptId
      ? getDepartmentPromptForPack(db as any, taskData.workflow_pack_key, effectiveDeptId)
      : null;
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
          taskLang === "ko"
            ? l(
                ["연속 실행입니다: 담당을 유지하고, 인사/시작 멘트는 생략하고, 미해결 리뷰 항목부터 즉시 처리하세요."],
                [
                  "Continuation run: keep ownership, skip greetings/kickoff narration, and execute unresolved review items immediately.",
                ],
                [
                  "Continuation run: keep ownership, skip greetings/kickoff narration, and execute unresolved review items immediately.",
                ],
                [
                  "Continuation run: keep ownership, skip greetings/kickoff narration, and execute unresolved review items immediately.",
                ],
              )
            : l(
                ["연속 실행입니다: 담당을 유지하고, 인사/시작 멘트는 생략하고, 미해결 리뷰 항목부터 즉시 처리하세요."],
                [
                  "Continuation run: keep ownership, skip greetings/kickoff narration, and execute unresolved review items immediately.",
                ],
                [
                  "Continuation run: keep ownership, skip greetings/kickoff narration, and execute unresolved review items immediately.",
                ],
                [
                  "Continuation run: keep ownership, skip greetings/kickoff narration, and execute unresolved review items immediately.",
                ],
              ),
          taskLang,
        )
      : pickL(
          taskLang === "ko"
            ? l(
                ["서두 설명 없이 바로 실행하고, 메시지는 간결하게 유지하세요."],
                ["Execute directly without long preamble and keep messages concise."],
                ["Execute directly without long preamble and keep messages concise."],
                ["Execute directly without long preamble and keep messages concise."],
              )
            : l(
                ["서두 설명 없이 바로 실행하고, 메시지는 간결하게 유지하세요."],
                ["Execute directly without long preamble and keep messages concise."],
                ["Execute directly without long preamble and keep messages concise."],
                ["Execute directly without long preamble and keep messages concise."],
              ),
          taskLang,
        );
    const runInstruction = pickL(
      taskLang === "ko"
        ? l(
            ["위 작업을 누락 없이 완료하세요. 필요하면 위의 연속 실행 브리프와 대화 컨텍스트를 활용하세요."],
            [
              "Please complete the task above thoroughly. Use the continuation brief and conversation context above if relevant.",
            ],
            [
              "Please complete the task above thoroughly. Use the continuation brief and conversation context above if relevant.",
            ],
            [
              "Please complete the task above thoroughly. Use the continuation brief and conversation context above if relevant.",
            ],
          )
        : l(
            ["위 작업을 누락 없이 완료하세요. 필요하면 위의 연속 실행 브리프와 대화 컨텍스트를 활용하세요."],
            [
              "Please complete the task above thoroughly. Use the continuation brief and conversation context above if relevant.",
            ],
            [
              "Please complete the task above thoroughly. Use the continuation brief and conversation context above if relevant.",
            ],
            [
              "Please complete the task above thoroughly. Use the continuation brief and conversation context above if relevant.",
            ],
          ),
      taskLang,
    );
    const availableSkillsPromptBlock = buildAvailableSkillsPromptBlock(provider);
    const agentProfileBlock = buildAgentPromptProfileBlock(execAgent);
    const goalCommandPromptBlock = buildGoalCommandPromptBlock(taskData.workflow_meta_json);
    const canonicalExecutionPolicy =
      typeof executionSession.policyResolutionJson === "string" && executionSession.policyResolutionJson.trim()
        ? (JSON.parse(executionSession.policyResolutionJson) as ReturnType<typeof previewCanonicalRouting>)
        : previewCanonicalRouting({
            text: [taskData.title, taskData.description ?? ""].filter(Boolean).join("\n"),
            projectPath: taskData.project_path,
            workflowPackKey: taskData.workflow_pack_key,
            providerModelConfig: getProviderModelConfig(),
            defaultProvider: provider,
            policyVersion: executionSession.policyVersion,
          });
    const spawnPrompt = buildTaskExecutionPrompt(
      [
        availableSkillsPromptBlock,
        `[Task Session] id=${executionSession.sessionId} owner=${executionSession.agentId} provider=${executionSession.provider}`,
        "This session is scoped to this task only. Keep context continuity inside this task session and do not mix with other projects.",
        recentChanges ? `[Recent Changes]\n${recentChanges}` : "",
        `[Task] ${taskData.title}`,
        taskData.description ? `\n${taskData.description}` : "",
        goalCommandPromptBlock,
        workflowPackGuidance ? `\n[Workflow Pack Execution Rules]\n${workflowPackGuidance}` : "",
        `\n[Canonical Policy]\nversion=${canonicalExecutionPolicy.policyVersion}\nfamily=${canonicalExecutionPolicy.family}\nstage=${canonicalExecutionPolicy.stage}\ntier=${canonicalExecutionPolicy.tier}\nspecialization=${canonicalExecutionPolicy.specialization ?? "none"}`,
        continuationCtx,
        conversationCtx,
        `\n---`,
        `Agent: ${execAgent.name} (${capabilityLabel}, ${effectiveDeptName})`,
        agentProfileBlock,
        deptConstraint,
        deptPromptBlock,
        `NOTE: You are working in an isolated Git worktree branch (climpire/${taskId.slice(0, 8)}). Do not commit, push, merge, reset, clean, stash, or rewrite history. Leave edits in the worktree; approved Git mutation is handled by the Donggri Ver.1 review gate.`,
        interruptPromptBlock,
        continuationInstruction,
        runInstruction,
      ],
      {
        allowWarningFix: hasExplicitWarningFixRequest(taskData.title, taskData.description),
        agent: execAgent,
        lang: taskLang,
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
      const executionPolicy = resolveProviderExecutionPolicy({
        provider,
        providerModelConfig: getProviderModelConfig(),
        canonicalOverride: canonicalExecutionPolicy,
      });
      const child = spawnCliAgent(
        taskId,
        provider,
        spawnPrompt,
        agentCwd,
        logFilePath,
        executionPolicy.model,
        executionPolicy.reasoningLevel,
        execAgent.cli_account_pool_id ?? null,
      );
      child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
        const forcedAfterFinalOutput = Boolean((child as any).__clawForcedAfterFinalOutput);
        const normalizedCode = forcedAfterFinalOutput ? 0 : (code ?? 1);
        if (forcedAfterFinalOutput) {
          appendTaskLog(
            taskId,
            "system",
            `RUN close normalized to success after final output (signal=${signal ?? "none"})`,
          );
        }
        handleTaskRunComplete(taskId, normalizedCode);
      });
    }

    const worktreeNote = pickL(
      taskLang === "ko"
        ? l(
            [` (격리 브랜치: climpire/${taskId.slice(0, 8)})`],
            [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
            [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
            [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
          )
        : l(
            [` (격리 브랜치: climpire/${taskId.slice(0, 8)})`],
            [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
            [` (分離ブランチ: climpire/${taskId.slice(0, 8)})`],
            [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
          ),
      taskLang,
    );
    notifyCeo(
      pickL(
        taskLang === "ko"
          ? l(
              [`${execName}가 '${taskData.title}' 작업을 시작했습니다.${worktreeNote}`],
              [`${execName} started work on '${taskData.title}'.${worktreeNote}`],
              [`${execName} started work on '${taskData.title}'.${worktreeNote}`],
              [`${execName} started work on '${taskData.title}'.${worktreeNote}`],
            )
          : l(
              [`${execName}가 '${taskData.title}' 작업을 시작했습니다.${worktreeNote}`],
              [`${execName} started work on '${taskData.title}'.${worktreeNote}`],
              [`${execName} が '${taskData.title}' の作業を開始しました。${worktreeNote}`],
              [`${execName} 已开始处理 '${taskData.title}'。${worktreeNote}`],
            ),
        taskLang,
      ),
      taskId,
    );
    startProgressTimer(taskId, taskData.title, effectiveDeptId);
  }

  return {
    startTaskExecutionForAgent,
  };
}
