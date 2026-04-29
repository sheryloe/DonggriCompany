import { resolveConstrainedAgentScopeForTask } from "../../../routes/core/tasks/execution-run-auto-assign.ts";
import { isPrimaryAuthorProfile, resolveAgentWorkflowProfile } from "../../agents/workflow-profile.ts";
import { getCanonicalStageRank, resolveCanonicalIdentity } from "../../../company/canonical-identity.ts";
import { mapLegacyDepartmentId } from "../../../bootstrap/schema/organization-manifest.ts";

interface AgentRow {
  id: string;
  name: string;
  name_ko: string;
  role: string;
  personality: string | null;
  status: string;
  department_id: string | null;
  current_task_id: string | null;
  avatar_emoji: string;
  cli_provider: string | null;
  oauth_account_id: string | null;
  api_provider_id: string | null;
  api_model: string | null;
  cli_model: string | null;
  cli_reasoning_level: string | null;
  cli_account_pool_id?: string | null;
  workflow_profile?: {
    role: "primary_author" | "reviewer";
    review_lenses: string[];
    two_pass_required: boolean;
    max_review_rounds: number | null;
  } | null;
}

type LeaderSelectionDeps = {
  db: any;
  detectTargetDepartments: (text: string) => string[];
};

export function createMeetingLeaderSelectionTools(deps: LeaderSelectionDeps) {
  const { db, detectTargetDepartments } = deps;
  let cachedTaskColumns: Set<string> | null = null;

  function getTaskColumns(): Set<string> {
    if (cachedTaskColumns) return cachedTaskColumns;
    const rows = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    cachedTaskColumns = new Set(rows.map((row) => String(row.name ?? "").trim()).filter(Boolean));
    return cachedTaskColumns;
  }

  function getLeadersByDepartmentIds(deptIds: string[], candidateAgentIds?: string[] | null): AgentRow[] {
    const filteredDeptIds = deptIds.filter((deptId) => Boolean(deptId));
    if (filteredDeptIds.length <= 0) return [];
    const seen = new Set<string>();
    const out: AgentRow[] = [];

    const scopedIds = Array.isArray(candidateAgentIds)
      ? [...new Set(candidateAgentIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : null;
    if (Array.isArray(scopedIds) && scopedIds.length <= 0) return [];

    const scopeClause = Array.isArray(scopedIds) ? `AND a.id IN (${scopedIds.map(() => "?").join(",")})` : "";
    const candidates = db
      .prepare(
        `
        SELECT a.*
        FROM agents a
        WHERE a.role = 'team_leader'
          AND a.status != 'offline'
          AND a.department_id IN (${filteredDeptIds.map(() => "?").join(",")})
          ${scopeClause}
        ORDER BY a.department_id ASC, a.name ASC
        `,
      )
      .all(...filteredDeptIds, ...(scopedIds ?? [])) as unknown as AgentRow[];

    const departmentLeaders = new Map<string, AgentRow[]>();
    for (const row of candidates) {
      const deptId = String(row.department_id ?? "").trim();
      if (!deptId || !filteredDeptIds.includes(deptId)) continue;
      const list = departmentLeaders.get(deptId);
      if ((list?.length ?? 0) > 0) continue;
      if (list) {
        list.push(row);
      } else {
        departmentLeaders.set(deptId, [row]);
      }
    }

    for (const deptId of filteredDeptIds) {
      const picked = departmentLeaders.get(deptId)?.[0];
      if (!picked || seen.has(picked.id)) continue;
      out.push(picked);
      seen.add(picked.id);
    }
    return out;
  }

  function getAllActiveTeamLeaders(candidateAgentIds?: string[] | null): AgentRow[] {
    if (Array.isArray(candidateAgentIds) && candidateAgentIds.length <= 0) return [];
    const scopedIds = Array.isArray(candidateAgentIds)
      ? [...new Set(candidateAgentIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : null;
    if (Array.isArray(scopedIds) && scopedIds.length <= 0) return [];
    const scopeClause = Array.isArray(scopedIds) ? `AND a.id IN (${scopedIds.map(() => "?").join(",")})` : "";
    return db
      .prepare(
        `
    SELECT a.*
    FROM agents a
    LEFT JOIN departments d ON a.department_id = d.id
    WHERE a.role = 'team_leader' AND a.status != 'offline'
      ${scopeClause}
    ORDER BY d.sort_order ASC, a.name ASC
  `,
      )
      .all(...(scopedIds ?? [])) as unknown as AgentRow[];
  }

  function pickCanonicalPlanningChair(candidateAgentIds?: string[] | null): AgentRow | null {
    const leaders = getAllActiveTeamLeaders(candidateAgentIds);
    if (leaders.length <= 0) return null;

    return (
      leaders
        .map((leader) => ({
          leader,
          canonical: resolveCanonicalIdentity(leader),
        }))
        .sort((left, right) => {
          const leftPmoRank =
            left.canonical.family === "orchestrator" && mapLegacyDepartmentId(left.leader.department_id) === "pmo"
              ? 0
              : 1;
          const rightPmoRank =
            right.canonical.family === "orchestrator" && mapLegacyDepartmentId(right.leader.department_id) === "pmo"
              ? 0
              : 1;
          if (leftPmoRank !== rightPmoRank) return leftPmoRank - rightPmoRank;

          const leftFamilyRank = left.canonical.family === "orchestrator" ? 0 : 1;
          const rightFamilyRank = right.canonical.family === "orchestrator" ? 0 : 1;
          if (leftFamilyRank !== rightFamilyRank) return leftFamilyRank - rightFamilyRank;

          const leftStageRank = getCanonicalStageRank(left.canonical.career_stage);
          const rightStageRank = getCanonicalStageRank(right.canonical.career_stage);
          if (leftStageRank !== rightStageRank) return rightStageRank - leftStageRank;

          if (left.canonical.authority_level !== right.canonical.authority_level) {
            return right.canonical.authority_level - left.canonical.authority_level;
          }

          return String(left.leader.name ?? "").localeCompare(String(right.leader.name ?? ""));
        })[0]?.leader ?? null
    );
  }

  function listScopedActiveAgents(candidateAgentIds?: string[] | null): AgentRow[] {
    if (Array.isArray(candidateAgentIds) && candidateAgentIds.length <= 0) return [];
    const scopedIds = Array.isArray(candidateAgentIds)
      ? [...new Set(candidateAgentIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : null;
    if (Array.isArray(scopedIds) && scopedIds.length <= 0) return [];
    const scopeClause = Array.isArray(scopedIds) ? `AND a.id IN (${scopedIds.map(() => "?").join(",")})` : "";
    return db
      .prepare(
        `
    SELECT a.*
    FROM agents a
    WHERE a.status != 'offline'
      ${scopeClause}
    ORDER BY a.created_at ASC, a.name ASC
  `,
      )
      .all(...(scopedIds ?? [])) as AgentRow[];
  }

  function inferPackScopedAgentIds(workflowPackKey: string | null | undefined): string[] | null {
    const packKey = String(workflowPackKey ?? "").trim();
    if (!packKey || packKey === "development") return null;

    try {
      const agentColumns = new Set(
        (db.prepare("PRAGMA table_info(agents)").all() as Array<{ name?: string }>).map((row) =>
          String(row.name ?? ""),
        ),
      );
      if (agentColumns.has("workflow_pack_key")) {
        const byPackColumn = db.prepare("SELECT id FROM agents WHERE workflow_pack_key = ?").all(packKey) as Array<{
          id?: string;
        }>;
        const ids = byPackColumn.map((row) => String(row.id ?? "").trim()).filter(Boolean);
        if (ids.length > 0) return ids;
      }
    } catch {
      // ignore legacy schema gaps
    }

    const bySeedPrefix = db.prepare("SELECT id FROM agents WHERE id LIKE ?").all(`${packKey}-%`) as Array<{
      id?: string;
    }>;
    const ids = bySeedPrefix.map((row) => String(row.id ?? "").trim()).filter(Boolean);
    return ids.length > 0 ? ids : null;
  }

  function getPrimaryAuthorAndReviewers(
    taskMeta:
      | {
          status: string;
          assigned_agent_id: string | null;
          department_id: string | null;
        }
      | undefined,
    candidateAgentIds?: string[] | null,
  ): { primaryAuthor: AgentRow | null; reviewers: AgentRow[] } {
    if (!taskMeta || taskMeta.status !== "review") return { primaryAuthor: null, reviewers: [] };
    const activeAgents = listScopedActiveAgents(candidateAgentIds);
    if (activeAgents.length <= 0) return { primaryAuthor: null, reviewers: [] };

    const profileById = new Map<string, ReturnType<typeof resolveAgentWorkflowProfile>>();
    const canonicalById = new Map<string, ReturnType<typeof resolveCanonicalIdentity>>();
    for (const agent of activeAgents) {
      profileById.set(
        agent.id,
        resolveAgentWorkflowProfile({
          workflowProfileRaw: (agent as any).workflow_profile ?? null,
          agentName: agent.name,
          cliProvider: agent.cli_provider,
          departmentId: agent.department_id,
        }),
      );
      canonicalById.set(agent.id, resolveCanonicalIdentity(agent));
    }

    const assignedPrimary =
      activeAgents.find((agent) => {
        if (agent.id !== taskMeta.assigned_agent_id) return false;
        const profile = profileById.get(agent.id);
        const canonical = canonicalById.get(agent.id);
        return isPrimaryAuthorProfile(profile) || canonical?.family === "backend" || canonical?.family === "frontend";
      }) ?? null;

    const discoveredPrimary =
      assignedPrimary ??
      activeAgents.find((agent) => {
        const profile = profileById.get(agent.id);
        const canonical = canonicalById.get(agent.id);
        return isPrimaryAuthorProfile(profile) || canonical?.family === "backend" || canonical?.family === "frontend";
      }) ??
      null;

    const primaryAuthor = discoveredPrimary;
    const primaryId = primaryAuthor?.id ?? "";

    const reviewers = activeAgents
      .filter((agent) => agent.id !== primaryId)
      .filter((agent) => {
        const profile = profileById.get(agent.id);
        const canonical = canonicalById.get(agent.id);
        const stageRank = getCanonicalStageRank(canonical?.career_stage);
        if (canonical?.family === "reviewer" && stageRank >= getCanonicalStageRank("senior")) return true;
        if (canonical?.family === "qa" && stageRank >= getCanonicalStageRank("senior")) return true;
        if (
          (canonical?.family === "documenter" || canonical?.family === "product-manager") &&
          stageRank >= getCanonicalStageRank("senior")
        ) {
          return true;
        }
        return profile?.role === "reviewer";
      })
      .slice(0, 3);

    return { primaryAuthor, reviewers };
  }

  function getTaskRelatedDepartmentIds(
    taskId: string,
    fallbackDeptId: string | null,
    preloadedTask?: { title: string; description: string | null; department_id: string | null } | null,
  ): string[] {
    const task = (preloadedTask ??
      (db.prepare("SELECT title, description, department_id FROM tasks WHERE id = ?").get(taskId) as
        | { title: string; description: string | null; department_id: string | null }
        | undefined)) as { title: string; description: string | null; department_id: string | null } | undefined;

    const deptSet = new Set<string>();
    if (fallbackDeptId) deptSet.add(fallbackDeptId);
    if (task?.department_id) deptSet.add(task.department_id);

    const subtaskDepts = db
      .prepare(
        "SELECT DISTINCT target_department_id FROM subtasks WHERE task_id = ? AND target_department_id IS NOT NULL",
      )
      .all(taskId) as Array<{ target_department_id: string | null }>;
    for (const row of subtaskDepts) {
      if (row.target_department_id) deptSet.add(row.target_department_id);
    }

    const sourceText = `${task?.title ?? ""} ${task?.description ?? ""}`;
    for (const deptId of detectTargetDepartments(sourceText)) {
      deptSet.add(deptId);
    }

    return [...deptSet];
  }

  function getTaskReviewLeaders(
    taskId: string,
    fallbackDeptId: string | null,
    opts?: {
      minLeaders?: number;
      includePlanning?: boolean;
      fallbackAll?: boolean;
      requiredDepartmentIds?: string[];
    },
  ): AgentRow[] {
    const includePlanning = opts?.includePlanning ?? true;
    const minLeaders = opts?.minLeaders ?? 2;
    const fallbackAll = opts?.fallbackAll ?? true;
    const requiredDepartmentIds = (opts?.requiredDepartmentIds ?? [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean);

    const taskColumns = getTaskColumns();
    const selectColumns = [
      "project_id",
      "workflow_pack_key",
      "department_id",
      "title",
      "description",
      ...(taskColumns.has("status") ? ["status"] : []),
      ...(taskColumns.has("assigned_agent_id") ? ["assigned_agent_id"] : []),
    ];
    const taskMetaRaw = db.prepare(`SELECT ${selectColumns.join(", ")} FROM tasks WHERE id = ?`).get(taskId) as
      | {
          project_id?: string | null;
          workflow_pack_key?: string | null;
          department_id?: string | null;
          title?: string;
          description?: string | null;
          status?: string;
          assigned_agent_id?: string | null;
        }
      | undefined;
    const taskMeta = taskMetaRaw
      ? {
          project_id: taskMetaRaw.project_id ?? null,
          workflow_pack_key: taskMetaRaw.workflow_pack_key ?? null,
          department_id: taskMetaRaw.department_id ?? null,
          title: taskMetaRaw.title ?? "",
          description: taskMetaRaw.description ?? null,
          status: taskMetaRaw.status ?? "",
          assigned_agent_id: taskMetaRaw.assigned_agent_id ?? null,
        }
      : undefined;
    const resolvedConstrainedAgentIds = resolveConstrainedAgentScopeForTask(db as any, {
      project_id: taskMeta?.project_id ?? null,
      workflow_pack_key: taskMeta?.workflow_pack_key ?? null,
      department_id: taskMeta?.department_id ?? fallbackDeptId ?? null,
    });
    const resolvedPackScopedAgentIds = resolveConstrainedAgentScopeForTask(db as any, {
      project_id: null,
      workflow_pack_key: taskMeta?.workflow_pack_key ?? null,
      department_id: taskMeta?.department_id ?? fallbackDeptId ?? null,
    });
    const inferredPackAgentIds = inferPackScopedAgentIds(taskMeta?.workflow_pack_key ?? null);
    const constrainedAgentIds =
      Array.isArray(resolvedConstrainedAgentIds) && resolvedConstrainedAgentIds.length > 0
        ? resolvedConstrainedAgentIds
        : inferredPackAgentIds;
    const packScopedAgentIds =
      Array.isArray(resolvedPackScopedAgentIds) && resolvedPackScopedAgentIds.length > 0
        ? resolvedPackScopedAgentIds
        : inferredPackAgentIds;

    const { reviewers: avatarReviewers } = getPrimaryAuthorAndReviewers(taskMeta, constrainedAgentIds);
    if (avatarReviewers.length > 0) {
      return avatarReviewers;
    }

    // In manual assignment mode, include only leaders from explicitly assigned departments.
    if (taskMeta?.project_id) {
      const proj = db.prepare("SELECT assignment_mode FROM projects WHERE id = ?").get(taskMeta.project_id) as
        | { assignment_mode: string }
        | undefined;
      if (proj?.assignment_mode === "manual") {
        const assignedAgents = db
          .prepare(
            "SELECT DISTINCT a.department_id FROM project_agents pa JOIN agents a ON a.id = pa.agent_id WHERE pa.project_id = ?",
          )
          .all(taskMeta.project_id) as Array<{ department_id: string | null }>;
        const manualDeptIds = assignedAgents.map((r) => r.department_id).filter(Boolean) as string[];
        const relatedDeptIds = getTaskRelatedDepartmentIds(taskId, fallbackDeptId, taskMeta);
        const desiredDeptIds = [...new Set([...manualDeptIds, ...relatedDeptIds, ...requiredDepartmentIds])];

        const leaders = getLeadersByDepartmentIds(desiredDeptIds, constrainedAgentIds);
        const seen = new Set(leaders.map((l) => l.id));

        for (const deptId of relatedDeptIds) {
          const hasDeptLeader = leaders.some((leader) => leader.department_id === deptId);
          if (hasDeptLeader) continue;
          const fallbackLeader = getLeadersByDepartmentIds([deptId], packScopedAgentIds)[0];
          if (!fallbackLeader || seen.has(fallbackLeader.id)) continue;
          leaders.push(fallbackLeader);
          seen.add(fallbackLeader.id);
        }

        if (includePlanning) {
          const planningLeader =
            pickCanonicalPlanningChair(constrainedAgentIds) ?? pickCanonicalPlanningChair(packScopedAgentIds);
          if (planningLeader && !seen.has(planningLeader.id)) {
            leaders.unshift(planningLeader);
            seen.add(planningLeader.id);
          }
        }

        // In manual mode, if related leaders are insufficient, widen within scoped leader candidates.
        if (fallbackAll && leaders.length < minLeaders) {
          const fallbackScope =
            Array.isArray(packScopedAgentIds) && packScopedAgentIds.length > 0
              ? packScopedAgentIds
              : constrainedAgentIds;
          for (const leader of getAllActiveTeamLeaders(fallbackScope)) {
            if (seen.has(leader.id)) continue;
            leaders.push(leader);
            seen.add(leader.id);
          }
        }
        return leaders;
      }
    }

    const deptIds = [
      ...new Set([...getTaskRelatedDepartmentIds(taskId, fallbackDeptId, taskMeta), ...requiredDepartmentIds]),
    ];
    const leaders = getLeadersByDepartmentIds(deptIds, constrainedAgentIds);

    const seen = new Set(leaders.map((l) => l.id));
    for (const deptId of deptIds) {
      const hasDeptLeader = leaders.some((leader) => leader.department_id === deptId);
      if (hasDeptLeader) continue;
      const fallbackLeader = getLeadersByDepartmentIds([deptId], packScopedAgentIds)[0];
      if (!fallbackLeader || seen.has(fallbackLeader.id)) continue;
      leaders.push(fallbackLeader);
      seen.add(fallbackLeader.id);
    }
    if (includePlanning) {
      const planningLeader = pickCanonicalPlanningChair(constrainedAgentIds);
      if (planningLeader && !seen.has(planningLeader.id)) {
        leaders.unshift(planningLeader);
        seen.add(planningLeader.id);
      }
    }

    // If related departments are not detectable, expand to all team leaders
    // so approval is based on real multi-party communication.
    if (fallbackAll && leaders.length < minLeaders) {
      for (const leader of getAllActiveTeamLeaders(constrainedAgentIds)) {
        if (seen.has(leader.id)) continue;
        leaders.push(leader);
        seen.add(leader.id);
      }
    }

    return leaders;
  }

  return {
    getLeadersByDepartmentIds,
    getAllActiveTeamLeaders,
    getTaskRelatedDepartmentIds,
    getTaskReviewLeaders,
  };
}
