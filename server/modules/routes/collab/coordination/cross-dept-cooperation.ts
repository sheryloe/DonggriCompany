import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Lang } from "../../../../types/lang.ts";
import { getDepartmentPromptForPack } from "../../../workflow/packs/department-scope.ts";
import { resolveWorkflowPackKeyForTask } from "../../../workflow/packs/task-pack-resolver.ts";
import { resolveProviderRuntimeKind } from "../../../workflow/agents/provider-runtime-kind.ts";
import { resolveProviderExecutionPolicy } from "../../../workflow/agents/provider-policy-resolver.ts";
import { previewCanonicalRouting } from "../../../company/canonical-policy.ts";
import { resolveCanonicalIdentity } from "../../../company/canonical-identity.ts";
import { resolveConstrainedAgentScopeForTask } from "../../core/tasks/execution-run-auto-assign.ts";
import { formatDelegationTrace } from "../delegation-log.ts";
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
      const blockingReason = "no_cross_dept_leader";
      appendTaskLog(
        taskId,
        "system",
        `Cross-dept delegation blocked for ${getDeptName(crossDeptId)}: ${formatDelegationTrace({
          label: "Delegation decision",
          family: "none",
          specialization: "none",
          fallbackReason: "department_fallback_none",
          authorityReason: "missing_team_leader",
          blockingReason,
        })}`,
      );
      notifyCeo(
        pickL(
          l(
            [
              `'${taskTitle}' 협업 라우팅 중 ${getDeptName(crossDeptId)} 부서 팀장을 찾지 못해 해당 부서 위임을 건너뜁니다. (${blockingReason})`,
            ],
            [
              `While routing collaboration for '${taskTitle}', no team leader was found in ${getDeptName(crossDeptId)}. Skipping that department. (${blockingReason})`,
            ],
            [
              `'${taskTitle}' の協業ルーティング中に ${getDeptName(crossDeptId)} のチームリーダーが見つからなかったため、その部門はスキップします。(${blockingReason})`,
            ],
            [
              `在 '${taskTitle}' 协作路由中未找到 ${getDeptName(crossDeptId)} 的组长，已跳过该部门。(${blockingReason})`,
            ],
          ),
          lang,
        ),
        taskId,
      );
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
          lang === "ko"
            ? l(
                [`협업 요청 전송 중: ${crossDeptName} (${index + 1}/${deptIds.length}, 대기 ${remaining}개 팀)`],
                [
                  `Collaboration request in progress: ${crossDeptName} (${index + 1}/${deptIds.length}, ${remaining} team(s) remaining in queue)`,
                ],
                [
                  `Collaboration request in progress: ${crossDeptName} (${index + 1}/${deptIds.length}, ${remaining} team(s) remaining in queue)`,
                ],
                [
                  `Collaboration request in progress: ${crossDeptName} (${index + 1}/${deptIds.length}, ${remaining} team(s) remaining in queue)`,
                ],
              )
            : l(
                [`협업 요청 전송 중: ${crossDeptName} (${index + 1}/${deptIds.length}, 대기 ${remaining}개 팀)`],
                [
                  `Collaboration request in progress: ${crossDeptName} (${index + 1}/${deptIds.length}, ${remaining} team(s) remaining in queue)`,
                ],
                [`連携依頼を送信中: ${crossDeptName} (${index + 1}/${deptIds.length}, 残り ${remaining} チーム)`],
                [`协作请求发送中: ${crossDeptName} (${index + 1}/${deptIds.length}, 剩余 ${remaining} 个团队)`],
              ),
          lang,
        ),
        taskId,
      );
    }

    const coopReq = pickL(
      lang === "ko"
        ? l(
            [
              `${crossCoordinatorName}님, 대표님 지시로 "${taskTitle}" 작업에 ${crossDeptName}의 협업이 필요합니다. 지원 부탁드립니다.`,
              `${crossCoordinatorName}님, "${taskTitle}" 작업과 관련해 ${crossDeptName} 검토가 필요합니다. 가능할 때 바로 연결 부탁드립니다.`,
            ],
            [
              `Hi ${crossCoordinatorName}! We're working on "${taskTitle}" per CEO's directive and need ${crossDeptName}'s support. Could you help?`,
              `${crossCoordinatorName}, we need ${crossDeptName}'s input on "${taskTitle}". Let's sync when you have a moment.`,
            ],
            [
              `CEO instructed ${crossCoordinatorName} to delegate "${taskTitle}" to ${crossDeptName} for collaboration.`,
            ],
            [
              `CEO instructed ${crossCoordinatorName} to delegate "${taskTitle}" to ${crossDeptName} for collaboration.`,
            ],
          )
        : l(
            [
              `${crossCoordinatorName}님, 대표님 지시로 "${taskTitle}" 작업에 ${crossDeptName}의 협업이 필요합니다. 지원 부탁드립니다.`,
              `${crossCoordinatorName}님, "${taskTitle}" 작업과 관련해 ${crossDeptName} 검토가 필요합니다. 가능할 때 바로 연결 부탁드립니다.`,
            ],
            [
              `Hi ${crossCoordinatorName}! We're working on "${taskTitle}" per CEO's directive and need ${crossDeptName}'s support. Could you help?`,
              `${crossCoordinatorName}, we need ${crossDeptName}'s input on "${taskTitle}". Let's sync when you have a moment.`,
            ],
            [
              `${crossCoordinatorName}さん、CEO 指示の "${taskTitle}" 対応に ${crossDeptName} の協力が必要です。支援をお願いします。`,
            ],
            [`${crossCoordinatorName}，根据 CEO 指示，处理“${taskTitle}”需要 ${crossDeptName} 协作支持，请帮忙。`],
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
      try {
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
        const execCanonicalIdentity = resolveCanonicalIdentity(execAgent);
        const execName = lang === "ko" ? execAgent.name_ko || execAgent.name : execAgent.name;
        const fallbackReason = crossSubAtRun
          ? "specialization_second_subordinate"
          : crossLeaderAllowed
            ? "specialization_second_team_lead"
            : manualPoolFallbackAtRun
              ? "department_fallback_manual_pool"
              : "department_fallback_leader";
        const authorityReason = `canonical_stage=${execCanonicalIdentity.career_stage};authority_level=${execCanonicalIdentity.authority_level}`;
        const blockingReason =
          crossSubAtRun
            ? "none"
            : crossLeaderAllowed
              ? "no_subordinate_found"
              : manualPoolFallbackAtRun
                ? "team_lead_out_of_scope_manual_pool_used"
                : "team_lead_out_of_scope_no_manual_pool";
        appendTaskLog(
          taskId,
          "system",
          formatDelegationTrace({
            label: "Cross-dept delegation decision",
            family: execCanonicalIdentity.family,
            specialization: execCanonicalIdentity.specialization_key,
            fallbackReason,
            authorityReason,
            blockingReason,
          }),
        );

        const crossAckMsg =
          execAgent.id !== crossCoordinator.id
            ? pickL(
                lang === "ko"
                  ? l(
                      [
                        `${leaderName}님, 확인했습니다. ${execName}이(가) ${crossDeptName} 측 협업을 바로 맡겠습니다.`,
                        `${execName}에게 ${crossDeptName} 협업을 바로 배정하고 진행 상황을 공유드리겠습니다.`,
                      ],
                      [
                        `Sure, ${leaderName}! I'll assign ${execName} to support right away.`,
                        `Got it! ${execName} will handle the ${crossDeptName} side. I'll keep you posted.`,
                      ],
                      [`Sure, ${leaderName}! I'll assign ${execName} to support right away.`],
                      [`Sure, ${leaderName}! I'll assign ${execName} to support right away.`],
                    )
                  : l(
                      [
                        `${leaderName}님, 확인했습니다. ${execName}에게 바로 배정하겠습니다.`,
                        `${execName}에게 ${crossDeptName} 협업을 바로 배정하고 진행 상황을 공유드리겠습니다.`,
                      ],
                      [
                        `Sure, ${leaderName}! I'll assign ${execName} to support right away.`,
                        `Got it! ${execName} will handle the ${crossDeptName} side. I'll keep you posted.`,
                      ],
                      [`${leaderName}さん、承知しました。${execName} をすぐに割り当てます。`],
                      [`${leaderName}，收到。我会立即把任务分配给 ${execName}。`],
                    ),
                lang,
              )
            : pickL(
                lang === "ko"
                  ? l(
                      [`${leaderName}님, 확인했습니다. 제가 직접 진행하겠습니다.`],
                      [`Sure, ${leaderName}! I'll handle it personally.`],
                      [`Sure, ${leaderName}! I'll handle it personally.`],
                      [`Sure, ${leaderName}! I'll handle it personally.`],
                    )
                  : l(
                      [`${leaderName}님, 확인했습니다. 제가 직접 진행하겠습니다.`],
                      [`Sure, ${leaderName}! I'll handle it personally.`],
                      [`承知しました、${leaderName}さん。私が直接進めます。`],
                      [`收到，${leaderName}。我会直接处理。`],
                    ),
                lang,
              );
        sendAgentMessage(crossCoordinator, crossAckMsg, "chat", "agent", null, taskId);

        // Create actual task in the cross-department
        const crossTaskId = randomUUID();
        const ct = nowMs();
        const crossTaskTitle = pickL(
          l(
            [`[협업] ${taskTitle}`],
            [`[Collaboration] ${taskTitle}`],
            [`[協業] ${taskTitle}`],
            [`[协作] ${taskTitle}`],
          ),
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
        appendTaskLog(
          crossTaskId,
          "system",
          formatDelegationTrace({
            label: "Delegation decision",
            family: execCanonicalIdentity.family,
            specialization: execCanonicalIdentity.specialization_key,
            fallbackReason,
            authorityReason,
            blockingReason,
          }),
        );
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
        appendTaskLog(crossTaskId, "system", `${crossCoordinatorName} → ${execName}`);

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
                    ["위 작업을 충분히 수행하세요. 필요하면 위 대화 맥락을 참고하세요."],
                    ["Please complete the task above thoroughly. Use the conversation context above if relevant."],
                    ["上記の作業を十分に遂行してください。必要に応じて会話コンテキストを参照してください。"],
                    ["请充分完成上述任务，并在需要时参考上方对话上下文。"],
                  ),
                  taskLang,
                ),
              ],
              {
                allowWarningFix: hasExplicitWarningFixRequest(crossTaskData.title, crossTaskData.description),
                agent: execAgent,
                lang: taskLang,
              },
            );
            const executionSession = ensureTaskExecutionSession(crossTaskId, execAgent.id, execProvider);
            const canonicalExecutionPolicy = previewCanonicalRouting({
              text: [crossTaskData.title, crossTaskData.description ?? ""].filter(Boolean).join("\n"),
              projectPath: projPath,
              workflowPackKey: crossTaskData.workflow_pack_key,
              providerModelConfig: getProviderModelConfig(),
              defaultProvider: execProvider,
              policyVersion: executionSession.policyVersion,
            });
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
              const crossPolicy = resolveProviderExecutionPolicy({
                provider: execProvider,
                providerModelConfig: getProviderModelConfig(),
                canonicalOverride: canonicalExecutionPolicy,
              });
              const child = spawnCliAgent(
                crossTaskId,
                execProvider,
                sessionPrompt,
                projPath,
                logFilePath,
                crossPolicy.model,
                crossPolicy.reasoningLevel,
                execAgent.cli_account_pool_id ?? null,
              );
              child.on("close", (code: number | null) => finalizeCrossDeptRun(code ?? 1));
            }

            notifyCeo(
              pickL(
                l(
                  [`${crossDeptName} ${execName}이(가) '${taskTitle}' 협업 작업을 시작했습니다.`],
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
      } catch (err) {
        console.error(`[Claw-Empire] Cross-dept cooperation crashed (taskId=${taskId}, dept=${crossDeptId}):`, err);
      }
    }, crossAckDelay);
  }

  return {
    recoverCrossDeptQueueAfterMissingCallback,
    startCrossDeptCooperation,
  };
}
