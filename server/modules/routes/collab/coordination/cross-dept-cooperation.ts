import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Lang } from "../../../../types/lang.ts";
import { getDepartmentPromptForPack } from "../../../workflow/packs/department-scope.ts";
import { resolveWorkflowPackKeyForTask } from "../../../workflow/packs/task-pack-resolver.ts";
import { resolveProviderRuntimeKind } from "../../../workflow/agents/provider-runtime-kind.ts";
import { resolveConstrainedAgentScopeForTask } from "../../core/tasks/execution-run-auto-assign.ts";
import type { AgentRow } from "./types.ts";

interface CrossDeptContext {
  teamLeader: AgentRow;
  taskTitle: string;
  ceoMessage: string;
  leaderDeptId: string;
  leaderDeptName: string;
  leaderName: string;
  lang: Lang;
  taskId: string;
  projectId?: string | null;
  projectCandidateAgentIds?: string[] | null;
}
type CrossDeptCooperationDeps = any;

export function createCrossDeptCooperationTools(deps: CrossDeptCooperationDeps) {
  const {
    db,
    nowMs,
    appendTaskLog,
    broadcast,
    recordTaskCreationAudit,
    delegatedTaskToSubtask,
    crossDeptNextCallbacks,
    findTeamLeader,
    findBestSubordinate,
    resolveLang,
    getDeptName,
    getAgentDisplayName,
    sendAgentMessage,
    notifyCeo,
    l,
    pickL,
    startTaskExecutionForAgent,
    linkCrossDeptTaskToParentSubtask,
    detectProjectPath,
    resolveProjectPath,
    logsDir,
    getDeptRoleConstraint,
    getRecentConversationContext,
    buildAvailableSkillsPromptBlock,
    buildTaskExecutionPrompt,
    hasExplicitWarningFixRequest,
    ensureTaskExecutionSession,
    getProviderModelConfig,
    spawnCliAgent,
    launchApiProviderAgent,
    launchHttpAgent,
    getNextHttpAgentPid,
    handleSubtaskDelegationComplete,
    handleTaskRunComplete,
    startProgressTimer,
  } = deps;

  function getConstrainedAgentIds(
    workflowPackKey: string | null | undefined,
    projectId: string | null | undefined,
    departmentId: string | null | undefined,
  ): string[] | null {
    return resolveConstrainedAgentScopeForTask(db as any, {
      workflow_pack_key: workflowPackKey ?? null,
      project_id: projectId ?? null,
      department_id: departmentId ?? null,
    });
  }

  function pickManualPoolAgent(
    candidateAgentIds: string[],
    preferredDeptId?: string | null,
    excludeIds: string[] = [],
  ): AgentRow | null {
    const candidateIds = [
      ...new Set(candidateAgentIds.map((id) => String(id || "").trim()).filter((id) => id.length > 0)),
    ];
    if (candidateIds.length === 0) return null;

    const excludedIds = [...new Set(excludeIds.map((id) => String(id || "").trim()).filter((id) => id.length > 0))];
    const idPlaceholders = candidateIds.map(() => "?").join(",");
    const params: unknown[] = [...candidateIds];

    const deptClause = preferredDeptId ? "AND department_id = ?" : "";
    if (preferredDeptId) params.push(preferredDeptId);

    const excludeClause = excludedIds.length > 0 ? `AND id NOT IN (${excludedIds.map(() => "?").join(",")})` : "";
    if (excludedIds.length > 0) params.push(...excludedIds);

    const agents = db
      .prepare(
        `SELECT * FROM agents WHERE id IN (${idPlaceholders}) ${deptClause} ${excludeClause} ORDER BY
         CASE status WHEN 'idle' THEN 0 WHEN 'break' THEN 1 WHEN 'working' THEN 2 ELSE 3 END,
         CASE role WHEN 'senior' THEN 0 WHEN 'junior' THEN 1 WHEN 'intern' THEN 2 WHEN 'team_leader' THEN 3 ELSE 4 END`,
      )
      .all(...params) as unknown as AgentRow[];
    return agents[0] ?? null;
  }

  function recoverCrossDeptQueueAfterMissingCallback(completedChildTaskId: string): void {
    const child = db.prepare("SELECT source_task_id FROM tasks WHERE id = ?").get(completedChildTaskId) as
      | { source_task_id: string | null }
      | undefined;
    if (!child?.source_task_id) return;

    const parent = db
      .prepare(
        `
    SELECT id, title, description, department_id, project_id, workflow_pack_key, status, assigned_agent_id, started_at
    FROM tasks
    WHERE id = ?
  `,
      )
      .get(child.source_task_id) as
      | {
          id: string;
          title: string;
          description: string | null;
          department_id: string | null;
          project_id: string | null;
          workflow_pack_key: string | null;
          status: string;
          assigned_agent_id: string | null;
          started_at: number | null;
        }
      | undefined;
    if (!parent || parent.status !== "collaborating" || !parent.department_id) return;

    const activeSibling = db
      .prepare(
        `
    SELECT 1
    FROM tasks
    WHERE source_task_id = ?
      AND status IN ('planned', 'pending', 'collaborating', 'in_progress', 'review')
    LIMIT 1
  `,
      )
      .get(parent.id);
    if (activeSibling) return;

    const targetDeptRows = db
      .prepare(
        `
    SELECT target_department_id
    FROM subtasks
    WHERE task_id = ?
      AND target_department_id IS NOT NULL
    ORDER BY created_at ASC
  `,
      )
      .all(parent.id) as Array<{ target_department_id: string | null }>;
    const deptIds: string[] = [];
    const seen = new Set<string>();
    for (const row of targetDeptRows) {
      if (!row.target_department_id || seen.has(row.target_department_id)) continue;
      seen.add(row.target_department_id);
      deptIds.push(row.target_department_id);
    }
    if (deptIds.length === 0) return;

    const doneRows = db
      .prepare(
        `
    SELECT department_id
    FROM tasks
    WHERE source_task_id = ?
      AND status = 'done'
      AND department_id IS NOT NULL
  `,
      )
      .all(parent.id) as Array<{ department_id: string | null }>;
    const doneDept = new Set(doneRows.map((r) => r.department_id).filter((v): v is string => !!v));
    const nextIndex = deptIds.findIndex((deptId) => !doneDept.has(deptId));

    const projectCandidateAgentIds = getConstrainedAgentIds(
      parent.workflow_pack_key,
      parent.project_id,
      parent.department_id,
    );
    const leader = findTeamLeader(parent.department_id, projectCandidateAgentIds);
    if (!leader) return;
    const lang = resolveLang(parent.description ?? parent.title);

    const delegateMainTask = () => {
      const current = db
        .prepare("SELECT status, assigned_agent_id, started_at FROM tasks WHERE id = ?")
        .get(parent.id) as { status: string; assigned_agent_id: string | null; started_at: number | null } | undefined;
      if (!current || current.status !== "collaborating") return;
      if (current.assigned_agent_id || current.started_at) return;

      const subordinate = findBestSubordinate(parent.department_id!, leader.id, projectCandidateAgentIds);
      const manualPoolFallback =
        Array.isArray(projectCandidateAgentIds) && projectCandidateAgentIds.length > 0
          ? pickManualPoolAgent(projectCandidateAgentIds, parent.department_id, [leader.id]) ||
            pickManualPoolAgent(projectCandidateAgentIds, null, [leader.id])
          : null;
      const leaderAllowed = !Array.isArray(projectCandidateAgentIds) || projectCandidateAgentIds.includes(leader.id);
      const assignee = subordinate ?? (leaderAllowed ? leader : manualPoolFallback) ?? leader;
      const deptName = getDeptName(parent.department_id!);
      const t = nowMs();
      db.prepare("UPDATE tasks SET assigned_agent_id = ?, status = 'planned', updated_at = ? WHERE id = ?").run(
        assignee.id,
        t,
        parent.id,
      );
      db.prepare("UPDATE agents SET current_task_id = ? WHERE id = ?").run(parent.id, assignee.id);
      appendTaskLog(
        parent.id,
        "system",
        `Recovery: cross-dept queue completed, delegated to ${assignee.name_ko || assignee.name}`,
      );
      broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(parent.id));
      broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(assignee.id));
      startTaskExecutionForAgent(parent.id, assignee, parent.department_id, deptName);
    };

    if (nextIndex === -1) {
      delegateMainTask();
      return;
    }

    const ctx: CrossDeptContext = {
      teamLeader: leader,
      taskTitle: parent.title,
      ceoMessage: (parent.description ?? "").replace(/^\[CEO\]\s*/, ""),
      leaderDeptId: parent.department_id,
      leaderDeptName: getDeptName(parent.department_id),
      leaderName: getAgentDisplayName(leader, lang),
      lang,
      taskId: parent.id,
      projectId: parent.project_id,
      projectCandidateAgentIds,
    };
    const shouldResumeMainAfterAll = !parent.assigned_agent_id && !parent.started_at;
    startCrossDeptCooperation(deptIds, nextIndex, ctx, shouldResumeMainAfterAll ? delegateMainTask : undefined);
  }

  function startCrossDeptCooperation(
    deptIds: string[],
    index: number,
    ctx: CrossDeptContext,
    onAllDone?: () => void,
  ): void {
    if (index >= deptIds.length) {
      onAllDone?.();
      return;
    }

    const crossDeptId = deptIds[index];
    const { teamLeader, taskTitle, ceoMessage, leaderDeptId, leaderDeptName, leaderName, lang, taskId } = ctx;
    const resolvedProjectId =
      ctx.projectId ??
      (db.prepare("SELECT project_id FROM tasks WHERE id = ?").get(taskId) as { project_id: string | null } | undefined)
        ?.project_id ??
      null;
    const resolvedPackKey = (
      db.prepare("SELECT workflow_pack_key FROM tasks WHERE id = ?").get(taskId) as
        | { workflow_pack_key?: string | null }
        | undefined
    )?.workflow_pack_key;
    const projectCandidateAgentIds =
      ctx.projectCandidateAgentIds !== undefined
        ? ctx.projectCandidateAgentIds
        : getConstrainedAgentIds(resolvedPackKey ?? null, resolvedProjectId, ctx.leaderDeptId);
    const crossLeader = findTeamLeader(crossDeptId, projectCandidateAgentIds);
    if (!crossLeader) {
      // Skip this dept, try next
      startCrossDeptCooperation(deptIds, index + 1, ctx, onAllDone);
      return;
    }
    const nextCtx: CrossDeptContext =
      ctx.projectId === resolvedProjectId && ctx.projectCandidateAgentIds === projectCandidateAgentIds
        ? ctx
        : {
            ...ctx,
            projectId: resolvedProjectId,
            projectCandidateAgentIds,
          };

    const crossDeptName = getDeptName(crossDeptId);
    const manualScoped = Array.isArray(projectCandidateAgentIds);
    const crossSub = manualScoped
      ? findBestSubordinate(crossDeptId, crossLeader.id, projectCandidateAgentIds)
      : findBestSubordinate(crossDeptId, crossLeader.id);
    const crossLeaderAllowed = !manualScoped || projectCandidateAgentIds.includes(crossLeader.id);
    const manualPoolFallback =
      manualScoped && projectCandidateAgentIds.length > 0
        ? pickManualPoolAgent(projectCandidateAgentIds, crossDeptId, [teamLeader.id]) ||
          pickManualPoolAgent(projectCandidateAgentIds, null, [teamLeader.id]) ||
          pickManualPoolAgent(projectCandidateAgentIds, crossDeptId) ||
          pickManualPoolAgent(projectCandidateAgentIds, null)
        : null;
    const crossCoordinator = crossLeaderAllowed ? crossLeader : (crossSub ?? manualPoolFallback ?? crossLeader);
    const crossCoordinatorName =
      lang === "ko" ? crossCoordinator.name_ko || crossCoordinator.name : crossCoordinator.name;

    // Notify remaining queue
    if (deptIds.length > 1) {
      const remaining = deptIds.length - index;
      notifyCeo(
        pickL(
          l(
            [`?묒뾽 ?붿껌 吏꾪뻾 以? ${crossDeptName} (${index + 1}/${deptIds.length}, ?⑥? ${remaining}? ?쒖감 吏꾪뻾)`],
            [
              `Collaboration request in progress: ${crossDeptName} (${index + 1}/${deptIds.length}, ${remaining} team(s) remaining in queue)`,
            ],
            [`?붹?堊앶졏?꿱죱訝? ${crossDeptName} (${index + 1}/${deptIds.length}?곫츐??{remaining}?곥꺖??`],
            [`?뤶퐳瑥룡콆瓦쏂죱訝?폏${crossDeptName}竊?{index + 1}/${deptIds.length}竊뚪삜?쀥돥鵝?{remaining}訝ゅ썴?잞펹`],
          ),
          lang,
        ),
        taskId,
      );
    }

    const coopReq = pickL(
      l(
        [
          `${crossCoordinatorName}?? ?덈뀞?섏꽭?? ??쒕떂 吏?쒕줈 "${taskTitle}" ?낅Т 吏꾪뻾 以묒씤?? ${crossDeptName} ?묒“媛 ?꾩슂?⑸땲?? ?꾩? 遺?곷뱶?ㅼ슂! ?쩃`,
          `${crossCoordinatorName}?? "${taskTitle}" 嫄댁쑝濡?${crossDeptName} 吏?먯씠 ?꾩슂?⑸땲?? ?쒓컙 ?섏떆硫??묒쓽 遺?곷뱶由쎈땲??`,
        ],
        [
          `Hi ${crossCoordinatorName}! We're working on "${taskTitle}" per CEO's directive and need ${crossDeptName}'s support. Could you help? ?쩃`,
          `${crossCoordinatorName}, we need ${crossDeptName}'s input on "${taskTitle}". Let's sync when you have a moment.`,
        ],
        [`CEO instructed ${crossCoordinatorName} to delegate "${taskTitle}" to ${crossDeptName} for collaboration.`],
        [`CEO instructed ${crossCoordinatorName} to delegate "${taskTitle}" to ${crossDeptName} for collaboration.`],
      ),
      lang,
    );
    sendAgentMessage(
      teamLeader,
      coopReq,
      "chat",
      "agent",
      crossCoordinator.id === teamLeader.id ? null : crossCoordinator.id,
      taskId,
    );

    // Broadcast delivery animation event for UI
    broadcast("cross_dept_delivery", {
      from_agent_id: teamLeader.id,
      to_agent_id: crossCoordinator.id,
      task_title: taskTitle,
    });

    // Cross-department leader acknowledges AND creates a real task
    const crossAckDelay = 1500 + Math.random() * 1000;
    setTimeout(() => {
      const crossSubAtRun = manualScoped
        ? findBestSubordinate(crossDeptId, crossLeader.id, projectCandidateAgentIds)
        : findBestSubordinate(crossDeptId, crossLeader.id);
      const manualPoolFallbackAtRun =
        manualScoped && projectCandidateAgentIds.length > 0
          ? pickManualPoolAgent(projectCandidateAgentIds, crossDeptId, [teamLeader.id]) ||
            pickManualPoolAgent(projectCandidateAgentIds, null, [teamLeader.id]) ||
            pickManualPoolAgent(projectCandidateAgentIds, crossDeptId) ||
            pickManualPoolAgent(projectCandidateAgentIds, null)
          : null;
      const execAgent =
        crossSubAtRun ??
        (crossLeaderAllowed ? crossLeader : manualPoolFallbackAtRun) ??
        crossCoordinator ??
        crossLeader;
      const execName = lang === "ko" ? execAgent.name_ko || execAgent.name : execAgent.name;

      const crossAckMsg =
        execAgent.id !== crossCoordinator.id
          ? pickL(
              l(
                [
                  `?? ${leaderName}?? ?뺤씤?덉뒿?덈떎. ${execName}?먭쾶 諛붾줈 諛곗젙?섍쿋?듬땲???몟`,
                  `?뚭쿋?듬땲?? ${execName}媛 吏?먰븯?꾨줉 ?섍쿋?듬땲?? 吏꾪뻾 ?곹솴 怨듭쑀?쒕┫寃뚯슂.`,
                ],
                [
                  `Sure, ${leaderName}! I'll assign ${execName} to support right away ?몟`,
                  `Got it! ${execName} will handle the ${crossDeptName} side. I'll keep you posted.`,
                ],
                [`雅녻㎗?쀣겲?쀣걼??{leaderName}?뺛굯竊?{execName}?믣돯?듿퐪?╉겲???몟`],
                [`也썹쉪竊?{leaderName}竊곩츎??{execName}??뤃 ?몟`],
              ),
              lang,
            )
          : pickL(
              l(
                [`?? ${leaderName}?? ?뺤씤?덉뒿?덈떎. ?쒓? 吏곸젒 泥섎━?섍쿋?듬땲???몟`],
                [`Sure, ${leaderName}! I'll handle it personally ?몟`],
                [`雅녻㎗?쀣겲?쀣걼竊곭쭅?뚨쎍?ε?恙쒌걮?얇걲 ?몟`],
                [`也썹쉪竊곫닊雅꿱눎?ε쨪???몟`],
              ),
              lang,
            );
      sendAgentMessage(crossCoordinator, crossAckMsg, "chat", "agent", null, taskId);

      // Create actual task in the cross-department
      const crossTaskId = randomUUID();
      const ct = nowMs();
      const crossTaskTitle = pickL(
        l([`[?묒뾽] ${taskTitle}`], [`[Collaboration] ${taskTitle}`], [`[?붹?] ${taskTitle}`], [`[?뤶퐳] ${taskTitle}`]),
        lang,
      );
      const parentTaskPath = db
        .prepare("SELECT project_id, project_path, workflow_pack_key FROM tasks WHERE id = ?")
        .get(taskId) as
        | {
            project_id: string | null;
            project_path: string | null;
            workflow_pack_key: string | null;
          }
        | undefined;
      const crossDetectedPath = parentTaskPath?.project_path ?? detectProjectPath(ceoMessage);
      const crossWorkflowPackKey = resolveWorkflowPackKeyForTask({
        db: db as any,
        sourceTaskPackKey: parentTaskPath?.workflow_pack_key,
        sourceTaskId: taskId,
        projectId: parentTaskPath?.project_id ?? null,
      });
      db.prepare(
        `
      INSERT INTO tasks (id, title, description, department_id, assigned_agent_id, project_id, status, priority, task_type, workflow_pack_key, project_path, source_task_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'planned', 1, 'general', ?, ?, ?, ?, ?)
    `,
      ).run(
        crossTaskId,
        crossTaskTitle,
        `[Cross-dept from ${leaderDeptName}] ${ceoMessage}`,
        crossDeptId,
        crossCoordinator.id,
        parentTaskPath?.project_id ?? null,
        crossWorkflowPackKey,
        crossDetectedPath,
        taskId,
        ct,
        ct,
      );
      recordTaskCreationAudit({
        taskId: crossTaskId,
        taskTitle: crossTaskTitle,
        taskStatus: "planned",
        departmentId: crossDeptId,
        assignedAgentId: crossCoordinator.id,
        sourceTaskId: taskId,
        taskType: "general",
        projectPath: crossDetectedPath ?? null,
        trigger: "workflow.cross_dept_cooperation",
        triggerDetail: `from_dept=${leaderDeptId}; to_dept=${crossDeptId}`,
        actorType: "agent",
        actorId: crossCoordinator.id,
        actorName: crossCoordinator.name,
        body: {
          parent_task_id: taskId,
          ceo_message: ceoMessage,
          from_department_id: leaderDeptId,
          to_department_id: crossDeptId,
        },
      });
      if (parentTaskPath?.project_id) {
        db.prepare("UPDATE projects SET last_used_at = ?, updated_at = ? WHERE id = ?").run(
          ct,
          ct,
          parentTaskPath.project_id,
        );
      }
      appendTaskLog(crossTaskId, "system", `Cross-dept request from ${leaderName} (${leaderDeptName})`);
      broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(crossTaskId));
      const linkedSubtaskId = linkCrossDeptTaskToParentSubtask(taskId, crossDeptId, crossTaskId);
      if (linkedSubtaskId) {
        delegatedTaskToSubtask.set(crossTaskId, linkedSubtaskId);
      }

      // Delegate to cross-dept subordinate and spawn CLI
      const ct2 = nowMs();
      db.prepare(
        "UPDATE tasks SET assigned_agent_id = ?, status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?",
      ).run(execAgent.id, ct2, ct2, crossTaskId);
      db.prepare("UPDATE agents SET status = 'working', current_task_id = ? WHERE id = ?").run(
        crossTaskId,
        execAgent.id,
      );
      appendTaskLog(crossTaskId, "system", `${crossCoordinatorName} ??${execName}`);

      broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(crossTaskId));
      broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(execAgent.id));

      // Register callback to start next department when this one finishes
      if (index + 1 < deptIds.length) {
        crossDeptNextCallbacks.set(crossTaskId, () => {
          const nextDelay = 2000 + Math.random() * 1000;
          setTimeout(() => {
            startCrossDeptCooperation(deptIds, index + 1, nextCtx, onAllDone);
          }, nextDelay);
        });
      } else if (onAllDone) {
        // Last department in the queue: continue only after this cross task completes review.
        crossDeptNextCallbacks.set(crossTaskId, () => {
          const nextDelay = 1200 + Math.random() * 800;
          setTimeout(() => onAllDone(), nextDelay);
        });
      }

      // Actually spawn the CLI agent
      const execProvider = execAgent.cli_provider || "claude";
      const runtimeKind = resolveProviderRuntimeKind(execProvider);
      if (runtimeKind) {
        const crossTaskData = db.prepare("SELECT * FROM tasks WHERE id = ?").get(crossTaskId) as
          | {
              title: string;
              description: string | null;
              project_path: string | null;
              workflow_pack_key: string | null;
            }
          | undefined;
        if (crossTaskData) {
          const projPath = resolveProjectPath(crossTaskData);
          const logFilePath = path.join(logsDir, `${crossTaskId}.log`);
          const roleLabels: Record<string, string> = {
            team_leader: "Team Leader",
            senior: "Senior",
            junior: "Junior",
            intern: "Intern",
          };
          const roleLabel = roleLabels[execAgent.role] ?? execAgent.role;
          const deptConstraint = getDeptRoleConstraint(crossDeptId, crossDeptName);
          const deptPromptRaw = getDepartmentPromptForPack(db as any, crossTaskData.workflow_pack_key, crossDeptId);
          const deptPrompt = typeof deptPromptRaw === "string" ? deptPromptRaw.trim() : "";
          const deptPromptBlock = deptPrompt ? `[Department Shared Prompt]\n${deptPrompt}` : "";
          const crossConversationCtx = getRecentConversationContext(execAgent.id);
          const taskLang = resolveLang(crossTaskData.description ?? crossTaskData.title);
          const availableSkillsPromptBlock = buildAvailableSkillsPromptBlock(execProvider);
          const spawnPrompt = buildTaskExecutionPrompt(
            [
              availableSkillsPromptBlock,
              `[Task] ${crossTaskData.title}`,
              crossTaskData.description ? `\n${crossTaskData.description}` : "",
              crossConversationCtx,
              `\n---`,
              `Agent: ${execAgent.name} (${roleLabel}, ${crossDeptName})`,
              execAgent.personality ? `Personality: ${execAgent.personality}` : "",
              deptConstraint,
              deptPromptBlock,
              pickL(
                l(
                  ["???묒뾽??異⑸텇???꾩닔?섏꽭?? ?꾩슂 ???????留λ씫??李멸퀬?섏꽭??"],
                  ["Please complete the task above thoroughly. Use the conversation context above if relevant."],
                  ["Please complete the task above thoroughly and use the provided context as needed."],
                  ["Please complete the task above thoroughly and use the provided context as needed."],
                ),
                taskLang,
              ),
            ],
            {
              allowWarningFix: hasExplicitWarningFixRequest(crossTaskData.title, crossTaskData.description),
            },
          );
          const executionSession = ensureTaskExecutionSession(crossTaskId, execAgent.id, execProvider);
          const sessionPrompt = [
            `[Task Session] id=${executionSession.sessionId} owner=${executionSession.agentId} provider=${executionSession.provider}`,
            "Task-scoped session: keep continuity only for this collaboration task.",
            spawnPrompt,
          ].join("\n");
          const finalizeCrossDeptRun = (exitCode: number) => {
            const linked = delegatedTaskToSubtask.get(crossTaskId);
            if (linked) {
              handleSubtaskDelegationComplete(crossTaskId, linked, exitCode);
            } else {
              handleTaskRunComplete(crossTaskId, exitCode);
            }
          };

          appendTaskLog(crossTaskId, "system", `RUN start (agent=${execAgent.name}, provider=${execProvider})`);
          if (runtimeKind === "api") {
            const controller = new AbortController();
            const fakePid = getNextHttpAgentPid();
            launchApiProviderAgent(
              crossTaskId,
              execAgent.api_provider_id ?? null,
              execAgent.api_model ?? null,
              sessionPrompt,
              projPath,
              logFilePath,
              controller,
              fakePid,
              finalizeCrossDeptRun,
            );
          } else if (runtimeKind === "http_stream") {
            const controller = new AbortController();
            const fakePid = getNextHttpAgentPid();
            launchHttpAgent(
              crossTaskId,
              execProvider,
              sessionPrompt,
              projPath,
              logFilePath,
              controller,
              fakePid,
              execAgent.oauth_account_id ?? null,
              finalizeCrossDeptRun,
            );
          } else {
            const crossModelConfig = getProviderModelConfig();
            const crossModel = execAgent.cli_model || crossModelConfig[execProvider]?.model || undefined;
            const crossReasoningLevel =
              execProvider === "codex"
                ? execAgent.cli_reasoning_level || crossModelConfig[execProvider]?.reasoningLevel || undefined
                : crossModelConfig[execProvider]?.reasoningLevel || undefined;
            const child = spawnCliAgent(
              crossTaskId,
              execProvider,
              sessionPrompt,
              projPath,
              logFilePath,
              crossModel,
              crossReasoningLevel,
              execAgent.cli_account_pool_id ?? null,
            );
            child.on("close", (code: number | null) => finalizeCrossDeptRun(code ?? 1));
          }

          notifyCeo(
            pickL(
              l(
                [`${crossDeptName} ${execName}媛 '${taskTitle}' ?묒뾽 ?묒뾽???쒖옉?덉뒿?덈떎.`],
                [`${crossDeptName} ${execName} started collaboration work for '${taskTitle}'.`],
                [`${crossDeptName} ${execName} started collaboration work for "${taskTitle}".`],
                [`${crossDeptName} ${execName} started collaboration work for "${taskTitle}".`],
              ),
              lang,
            ),
            crossTaskId,
          );
          startProgressTimer(crossTaskId, crossTaskData.title, crossDeptId);
        }
      }
    }, crossAckDelay);
  }

  return {
    recoverCrossDeptQueueAfterMissingCallback,
    startCrossDeptCooperation,
  };
}
