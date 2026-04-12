import path from "node:path";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { getDepartmentPromptForPack } from "../packs/department-scope.ts";
import { ensureVideoPreprodRemotionBestPracticesSkill } from "../core/video-skill-bootstrap.ts";
import { buildWorkflowPackExecutionGuidance } from "../packs/execution-guidance.ts";
import { resolveVideoArtifactSpecForTask } from "../packs/video-artifact.ts";
import { buildAgentPromptProfileBlock } from "../agents/agent-profile.ts";
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

  function startTaskExecutionForAgent(
    taskId: string,
    requestedAgent: any,
    deptId: string | null,
    deptName: string,
  ): void {
    let execAgent = requestedAgent;
    let effectiveDeptId = deptId;
    let effectiveDeptName = deptName;
    try {
      const taskMeta = db
        .prepare("SELECT source_task_id, project_id, workflow_pack_key, department_id, title FROM tasks WHERE id = ?")
        .get(taskId) as
        | {
            source_task_id: string | null;
            project_id: string | null;
            workflow_pack_key: string | null;
            department_id: string | null;
            title: string;
          }
        | undefined;
      if (taskMeta && !taskMeta.source_task_id) {
        const constrainedAgentIds = resolveConstrainedAgentScopeForTask(db as any, {
          project_id: taskMeta.project_id,
          workflow_pack_key: taskMeta.workflow_pack_key,
          department_id: taskMeta.department_id ?? effectiveDeptId ?? null,
        });
        const scopedIds = Array.isArray(constrainedAgentIds)
          ? [...new Set(constrainedAgentIds.map((id) => String(id ?? "").trim()).filter(Boolean))]
          : null;
        if (!Array.isArray(scopedIds) || scopedIds.length > 0) {
          const scopeClause = Array.isArray(scopedIds) ? `AND a.id IN (${scopedIds.map(() => "?").join(", ")})` : "";
          const candidates = db
            .prepare(
              `
                SELECT a.*
                FROM agents a
                WHERE a.status != 'offline'
                  ${scopeClause}
                ORDER BY
                  CASE WHEN LOWER(COALESCE(a.cli_provider, '')) = 'jules' THEN 0 ELSE 1 END,
                  CASE WHEN LOWER(COALESCE(a.name, '')) = 'jules' THEN 0 ELSE 1 END,
                  a.created_at ASC
              `,
            )
            .all(...(scopedIds ?? [])) as Array<Record<string, unknown>>;
          const preferred = candidates.find((candidate) => {
            const profile = resolveAgentWorkflowProfile({
              workflowProfileRaw: candidate.workflow_profile ?? null,
              agentName: candidate.name,
              cliProvider: candidate.cli_provider,
              departmentId: candidate.department_id,
            });
            return isPrimaryAuthorProfile(profile);
          });
          if (preferred && preferred.id) {
            const preferredId = String(preferred.id);
            const preferredBusy =
              String(preferred.status ?? "").toLowerCase() === "working" &&
              String(preferred.current_task_id ?? "").trim() &&
              String(preferred.current_task_id ?? "").trim() !== taskId;
            if (preferredBusy) {
              const taskLang = resolveLang(taskMeta.title ?? "");
              db.prepare("UPDATE tasks SET assigned_agent_id = ?, updated_at = ? WHERE id = ?").run(
                preferredId,
                nowMs(),
                taskId,
              );
              appendTaskLog(
                taskId,
                "system",
                `Primary-author gate: ${String(preferred.name ?? preferredId)} is busy on ${String(preferred.current_task_id ?? "")}; execution deferred`,
              );
              notifyCeo(
                pickL(
                  l(
                    [
                      `[PRIMARY AUTHOR] '${taskMeta.title}' 작업은 Jules(primary_author) 우선 정책에 따라 대기합니다. Jules가 다른 작업(${String(preferred.current_task_id ?? "")})을 수행 중입니다.`,
                    ],
                    [
                      `[PRIMARY AUTHOR] '${taskMeta.title}' is waiting due to primary-author policy. Jules is busy on another task (${String(preferred.current_task_id ?? "")}).`,
                    ],
                    [
                      `[PRIMARY AUTHOR] '${taskMeta.title}' は primary_author ポリシーにより待機中です。Jules が別タスク (${String(preferred.current_task_id ?? "")}) を実行中です。`,
                    ],
                    [
                      `[PRIMARY AUTHOR] '${taskMeta.title}' 因 primary_author 策略进入等待。Jules 正在处理其他任务 (${String(preferred.current_task_id ?? "")})。`,
                    ],
                  ),
                  taskLang,
                ),
                taskId,
              );
              return;
            }
            if (preferredId !== String(execAgent.id)) {
              execAgent = preferred;
              effectiveDeptId = (preferred.department_id as string | null) ?? effectiveDeptId ?? null;
              if (effectiveDeptId) {
                const deptRow = db.prepare("SELECT name FROM departments WHERE id = ? LIMIT 1").get(effectiveDeptId) as
                  | { name?: string | null }
                  | undefined;
                effectiveDeptName = String(deptRow?.name ?? effectiveDeptName ?? "Unassigned");
              }
              appendTaskLog(
                taskId,
                "system",
                `Primary-author override: ${requestedAgent.name ?? requestedAgent.id} -> ${String(preferred.name ?? preferred.id)}`,
              );
            }
            db.prepare(
              "UPDATE tasks SET assigned_agent_id = ?, department_id = COALESCE(department_id, ?), updated_at = ? WHERE id = ?",
            ).run(preferredId, effectiveDeptId, nowMs(), taskId);
          }
        }
      }
    } catch (err: any) {
      appendTaskLog(taskId, "system", `Primary-author override skipped (${String(err?.message ?? err)})`);
    }
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
          taskLang === "ko"
            ? l(
                [
                  `[WORKTREE REQUIRED] '${taskData.title}' 실행이 차단되었습니다. 격리 worktree 생성에 실패해 프로젝트 루트를 보호하기 위해 실행을 중단했습니다.`,
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
              )
            : l(
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
                [
                  "이어달리기 실행: 인수인계를 유지하고, 인사말이나 착수 멘트는 생략한 뒤, 남은 리뷰 항목부터 바로 처리하세요.",
                ],
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
                [
                  "?곗냽 ?ㅽ뻾: ?뚯쑀 而⑦뀓?ㅽ듃瑜??좎??섍퀬 ?몄궗/李⑹닔 硫섑듃 ?놁씠 誘명빐寃?寃????ぉ??利됱떆 諛섏쁺?섏꽭??",
                ],
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
                ["긴 서두 없이 바로 실행하고, 메시지는 간결하게 유지하세요."],
                ["Execute directly without long preamble and keep messages concise."],
                ["Execute directly without long preamble and keep messages concise."],
                ["Execute directly without long preamble and keep messages concise."],
              )
            : l(
                ["湲??쒕줎 ?놁씠 諛붾줈 ?ㅽ뻾?섍퀬, 硫붿떆吏??媛꾧껐?섍쾶 ?좎??섏꽭??"],
                ["Execute directly without long preamble and keep messages concise."],
                ["Execute directly without long preamble and keep messages concise."],
                ["Execute directly without long preamble and keep messages concise."],
              ),
          taskLang,
        );
    const runInstruction = pickL(
      taskLang === "ko"
        ? l(
            ["위 작업을 빠짐없이 완료하세요. 필요하면 위의 이어달리기 브리프와 대화 문맥을 활용하세요."],
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
            ["???묒뾽??異⑸텇???꾩닔?섏꽭?? ?꾩슂 ???곗냽 ?ㅽ뻾 ?붿빟怨????留λ씫??李멸퀬?섏꽭??"],
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
        `Agent: ${execAgent.name} (${roleLabel}, ${effectiveDeptName})`,
        agentProfileBlock,
        deptConstraint,
        deptPromptBlock,
        `NOTE: You are working in an isolated Git worktree branch (climpire/${taskId.slice(0, 8)}). Commit your changes normally.`,
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
      taskLang === "ko"
        ? l(
            [` (격리 브랜치: climpire/${taskId.slice(0, 8)})`],
            [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
            [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
            [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
          )
        : l(
            [` (寃⑸━ 釉뚮옖移? climpire/${taskId.slice(0, 8)})`],
            [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
            [` (?녽썴?뽧꺀?녈긽: climpire/${taskId.slice(0, 8)})`],
            [` (isolated branch: climpire/${taskId.slice(0, 8)})`],
          ),
      taskLang,
    );
    notifyCeo(
      pickL(
        taskLang === "ko"
          ? l(
              [`${execName}이(가) '${taskData.title}' 작업을 시작했습니다.${worktreeNote}`],
              [`${execName} started work on '${taskData.title}'.${worktreeNote}`],
              [`${execName} started work on '${taskData.title}'.${worktreeNote}`],
              [`${execName} started work on '${taskData.title}'.${worktreeNote}`],
            )
          : l(
              [`${execName}媛 '${taskData.title}' ?묒뾽???쒖옉?덉뒿?덈떎.${worktreeNote}`],
              [`${execName} started work on '${taskData.title}'.${worktreeNote}`],
              [`${execName}??'${taskData.title}' ??퐳璵?굮?뗥쭓?쀣겲?쀣걼??{worktreeNote}`],
              [`${execName} 藥꿨?冶뗥쨪??'${taskData.title}'??{worktreeNote}`],
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
