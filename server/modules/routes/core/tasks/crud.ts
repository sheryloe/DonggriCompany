import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import type { MeetingMinuteEntryRow, MeetingMinutesRow } from "../../shared/types.ts";
import {
  DEFAULT_WORKFLOW_PACK_KEY,
  isWorkflowPackKey,
  type WorkflowPackKey,
} from "../../../workflow/packs/definitions.ts";
import { getCanonicalSnapshotByVersion, previewCanonicalRouting } from "../../../company/canonical-policy.ts";
import { applyProjectArtifactPatch, syncProjectArtifactProjection } from "../../../company/project-artifacts.ts";
import { classifyWorkflowPackText } from "../../../workflow/packs/text-routing.ts";
import { resolveWorkflowPackKeyForTask } from "../../../workflow/packs/task-pack-resolver.ts";
import { normalizeSubtaskTitleForDisplay } from "../../../workflow/subtasks/title-normalizer.ts";
import { resolveGoalCommandForTaskCreate } from "../../../workflow/goal-commands.ts";

export type TaskCrudRouteDeps = Pick<
  RuntimeContext,
  | "app"
  | "db"
  | "nowMs"
  | "firstQueryValue"
  | "reconcileCrossDeptSubtasks"
  | "normalizeTextField"
  | "recordTaskCreationAudit"
  | "appendTaskLog"
  | "broadcast"
  | "setTaskCreationAuditCompletion"
  | "clearTaskWorkflowState"
  | "endTaskExecutionSession"
  | "activeProcesses"
  | "stopRequestedTasks"
  | "killPidTree"
  | "logsDir"
>;

export function registerTaskCrudRoutes(deps: TaskCrudRouteDeps): void {
  const {
    app,
    db,
    nowMs,
    firstQueryValue,
    reconcileCrossDeptSubtasks,
    normalizeTextField,
    recordTaskCreationAudit,
    appendTaskLog,
    broadcast,
    setTaskCreationAuditCompletion,
    clearTaskWorkflowState,
    endTaskExecutionSession,
    activeProcesses,
    stopRequestedTasks,
    killPidTree,
    logsDir,
  } = deps;

  function normalizeProjectPathInput(raw: unknown): string | null {
    const value = normalizeTextField(raw);
    if (!value) return null;

    let candidate = value;
    if (candidate === "~") {
      candidate = os.homedir();
    } else if (candidate.startsWith("~/")) {
      candidate = path.join(os.homedir(), candidate.slice(2));
    } else if (candidate === "/Projects" || candidate.startsWith("/Projects/")) {
      const suffix = candidate.slice("/Projects".length).replace(/^\/+/, "");
      candidate = suffix ? path.join(os.homedir(), "Projects", suffix) : path.join(os.homedir(), "Projects");
    } else if (candidate === "/projects" || candidate.startsWith("/projects/")) {
      const suffix = candidate.slice("/projects".length).replace(/^\/+/, "");
      candidate = suffix ? path.join(os.homedir(), "projects", suffix) : path.join(os.homedir(), "projects");
    }

    const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    return path.normalize(absolute);
  }

  function parseHydratedPackList(raw: unknown): Set<string> {
    if (typeof raw !== "string" || !raw.trim()) return new Set<string>();
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set<string>();
      return new Set(parsed.map((entry) => normalizeTextField(entry)).filter((entry): entry is string => !!entry));
    } catch {
      return new Set<string>();
    }
  }

  function markOfficePackHydrated(packKey: WorkflowPackKey): void {
    void packKey;
  }

  function hasColumn(table: string, column: string): boolean {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
      return columns.some((item) => String(item.name ?? "").trim() === column);
    } catch {
      return false;
    }
  }

  const hasTaskPolicyVersionColumn = hasColumn("tasks", "policy_version");
  const hasTaskResolvedPolicyColumn = hasColumn("tasks", "resolved_execution_policy_json");
  const hasTaskRequiredArtifactsColumn = hasColumn("tasks", "required_artifacts_json");
  const hasTaskApprovalGateStateColumn = hasColumn("tasks", "approval_gate_state_json");

  function buildCanonicalTaskFields(params: {
    title: string;
    description: string;
    projectPath: string | null;
    workflowPackKey: WorkflowPackKey;
  }) {
    const policy = previewCanonicalRouting({
      text: `${params.title}\n${params.description}`.trim(),
      projectPath: params.projectPath,
      workflowPackKey: params.workflowPackKey,
    });
    return {
      policy,
      requiredArtifactsJson: JSON.stringify(policy.requiredArtifacts),
      approvalGateStateJson: JSON.stringify({
        gates: policy.approvalGates,
        blocked: policy.approvalGates.includes("artifact-health-block"),
        updatedAt: isoNowFromMs(nowMs()),
      }),
      resolvedPolicyJson: JSON.stringify(policy),
    };
  }

  function isoNowFromMs(timestamp: number): string {
    return new Date(timestamp).toISOString();
  }

  function updateTaskCanonicalProjection(
    taskId: string,
    policyFields: ReturnType<typeof buildCanonicalTaskFields>,
  ): void {
    const updates: string[] = [];
    const params: SQLInputValue[] = [];
    if (hasTaskPolicyVersionColumn) {
      updates.push("policy_version = ?");
      params.push(policyFields.policy.policyVersion);
    }
    if (hasTaskResolvedPolicyColumn) {
      updates.push("resolved_execution_policy_json = ?");
      params.push(policyFields.resolvedPolicyJson);
    }
    if (hasTaskRequiredArtifactsColumn) {
      updates.push("required_artifacts_json = ?");
      params.push(policyFields.requiredArtifactsJson);
    }
    if (hasTaskApprovalGateStateColumn) {
      updates.push("approval_gate_state_json = ?");
      params.push(policyFields.approvalGateStateJson);
    }
    if (updates.length === 0) return;
    params.push(taskId);
    db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  }

  function bindLegacyTaskPolicyVersion(
    taskRow: Record<string, unknown>,
    reason: string,
  ): ReturnType<typeof buildCanonicalTaskFields> {
    const taskId = String(taskRow.id ?? "");
    const policyFields = buildCanonicalTaskFields({
      title: normalizeTextField(taskRow.title) ?? "",
      description: normalizeTextField(taskRow.description) ?? "",
      projectPath: normalizeProjectPathInput(taskRow.project_path),
      workflowPackKey:
        (normalizeTextField(taskRow.workflow_pack_key) as WorkflowPackKey | null) ?? DEFAULT_WORKFLOW_PACK_KEY,
    });
    updateTaskCanonicalProjection(taskId, policyFields);
    appendTaskLog(
      taskId,
      "system",
      `policy_snapshot_missing_on_legacy_row (${reason}) -> bound ${policyFields.policy.policyVersion}`,
    );
    console.info("[tasks] policy_snapshot_bound_to_task", {
      taskId,
      policyVersion: policyFields.policy.policyVersion,
      reason,
    });
    return policyFields;
  }

  function normalizeTaskPolicySnapshotState(taskRow: Record<string, unknown>, reason: string): Record<string, unknown> {
    let normalizedTask = { ...taskRow };
    let policyVersion = hasTaskPolicyVersionColumn ? normalizeTextField(normalizedTask.policy_version) : null;

    if (hasTaskPolicyVersionColumn && !policyVersion) {
      const bound = bindLegacyTaskPolicyVersion(normalizedTask, reason);
      normalizedTask = {
        ...normalizedTask,
        policy_version: bound.policy.policyVersion,
        resolved_execution_policy_json: bound.resolvedPolicyJson,
        required_artifacts_json: bound.requiredArtifactsJson,
        approval_gate_state_json: bound.approvalGateStateJson,
      };
      policyVersion = bound.policy.policyVersion;
    }

    if (!policyVersion) {
      return {
        ...normalizedTask,
        policy_snapshot_found: false,
        policy_snapshot_missing: false,
      };
    }

    const snapshot = getCanonicalSnapshotByVersion(policyVersion);
    if (!snapshot) {
      appendTaskLog(String(taskRow.id ?? ""), "system", `policy_snapshot_lookup_failed (${policyVersion})`);
      console.warn("[tasks] policy_snapshot_lookup_failed", { taskId: String(taskRow.id ?? ""), policyVersion });
    }
    return {
      ...normalizedTask,
      policy_snapshot_found: Boolean(snapshot),
      policy_snapshot_missing: !snapshot,
    };
  }

  function readProjectContextByTaskFields(
    projectId: string | null,
    projectPath: string | null,
  ): {
    projectId: string | null;
    projectPath: string | null;
  } {
    if (projectId) {
      const row = db.prepare("SELECT id, project_path FROM projects WHERE id = ?").get(projectId) as
        | { id: string; project_path: string | null }
        | undefined;
      if (row) {
        return {
          projectId: row.id,
          projectPath: normalizeTextField(row.project_path) ?? projectPath,
        };
      }
    }
    return { projectId, projectPath };
  }

  app.get("/api/tasks", (req, res) => {
    try {
      reconcileCrossDeptSubtasks();
    } catch {
      // best-effort reconciliation only
    }
    const statusFilter = firstQueryValue(req.query.status);
    const deptFilter = firstQueryValue(req.query.department_id);
    const agentFilter = firstQueryValue(req.query.agent_id);
    const projectFilter = firstQueryValue(req.query.project_id);
    const workflowPackFilter = normalizeTextField(firstQueryValue(req.query.workflow_pack_key));

    if (workflowPackFilter && !isWorkflowPackKey(workflowPackFilter)) {
      return res.status(400).json({ error: "invalid_workflow_pack_key" });
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (statusFilter) {
      conditions.push("t.status = ?");
      params.push(statusFilter);
    }
    if (deptFilter) {
      conditions.push("t.department_id = ?");
      params.push(deptFilter);
    }
    if (agentFilter) {
      conditions.push("t.assigned_agent_id = ?");
      params.push(agentFilter);
    }
    if (projectFilter) {
      conditions.push("t.project_id = ?");
      params.push(projectFilter);
    }
    if (workflowPackFilter) {
      conditions.push("t.workflow_pack_key = ?");
      params.push(workflowPackFilter);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const subtaskTotalExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id)
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;
    const subtaskDoneExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done')
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND c.status = 'done'
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;

    let tasks: unknown[];
    try {
      tasks = db
        .prepare(
          `
      SELECT t.*,
        a.name AS agent_name,
        a.avatar_emoji AS agent_avatar,
        COALESCE(opd.name, d.name) AS department_name,
        COALESCE(opd.icon, d.icon) AS department_icon,
        p.name AS project_name,
        p.core_goal AS project_core_goal,
        ${subtaskTotalExpr} AS subtask_total,
        ${subtaskDoneExpr} AS subtask_done
      FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      LEFT JOIN office_pack_departments opd
        ON opd.workflow_pack_key = COALESCE(t.workflow_pack_key, 'development')
       AND opd.department_id = t.department_id
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      ${where}
      ORDER BY t.priority DESC, t.updated_at DESC
    `,
        )
        .all(...(params as SQLInputValue[]));
    } catch {
      tasks = db
        .prepare(
          `
      SELECT t.*,
        a.name AS agent_name,
        a.avatar_emoji AS agent_avatar,
        d.name AS department_name,
        d.icon AS department_icon,
        p.name AS project_name,
        p.core_goal AS project_core_goal,
        ${subtaskTotalExpr} AS subtask_total,
        ${subtaskDoneExpr} AS subtask_done
      FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      ${where}
      ORDER BY t.priority DESC, t.updated_at DESC
    `,
        )
        .all(...(params as SQLInputValue[]));
    }

    const normalizedTasks = Array.isArray(tasks)
      ? tasks.map((task) =>
          task && typeof task === "object"
            ? normalizeTaskPolicySnapshotState(task as Record<string, unknown>, "api.tasks.list")
            : task,
        )
      : tasks;
    res.json({ tasks: normalizedTasks });
  });

  app.post("/api/tasks", (req, res) => {
    const body = req.body ?? {};
    const id = randomUUID();
    const t = nowMs();

    const title = (body as any).title;
    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "title_required" });
    }

    const requestedProjectId = normalizeTextField((body as any).project_id);
    let resolvedProjectId: string | null = null;
    let resolvedProjectPath = normalizeProjectPathInput((body as any).project_path);
    if (requestedProjectId) {
      const project = db.prepare("SELECT id, project_path FROM projects WHERE id = ?").get(requestedProjectId) as
        | {
            id: string;
            project_path: string;
          }
        | undefined;
      if (!project) return res.status(400).json({ error: "project_not_found" });
      resolvedProjectId = project.id;
      if (!resolvedProjectPath) resolvedProjectPath = normalizeTextField(project.project_path);
    } else if (resolvedProjectPath) {
      const projectByPath = db
        .prepare(
          "SELECT id, project_path FROM projects WHERE project_path = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1",
        )
        .get(resolvedProjectPath) as { id: string; project_path: string } | undefined;
      if (projectByPath) {
        resolvedProjectId = projectByPath.id;
        resolvedProjectPath = normalizeTextField(projectByPath.project_path) ?? resolvedProjectPath;
      }
    }

    const descriptionText = normalizeTextField((body as any).description) ?? "";
    const goalCommandResolution = resolveGoalCommandForTaskCreate({
      title,
      description: descriptionText,
      workflowMeta: (body as any).workflow_meta_json,
    });
    if (goalCommandResolution.error) {
      return res.status(400).json({ error: goalCommandResolution.error });
    }
    const goalPreset = goalCommandResolution.preset;
    const explicitPackKey = normalizeTextField((body as any).workflow_pack_key) ?? goalPreset?.workflowPackKey ?? null;
    const routeText = `${title}\n${descriptionText}`.trim();
    const routedPackDecision = !explicitPackKey ? classifyWorkflowPackText(routeText) : null;
    const autoRoutedPackKey: WorkflowPackKey | null =
      routedPackDecision && routedPackDecision.packKey === "donggri" && routedPackDecision.confidence >= 0.72
        ? "donggri"
        : null;
    const resolvedWorkflowPackKey = resolveWorkflowPackKeyForTask({
      db: db as any,
      explicitPackKey: explicitPackKey ?? autoRoutedPackKey,
      projectId: resolvedProjectId,
    });
    const canonicalTaskFields = buildCanonicalTaskFields({
      title,
      description: descriptionText,
      projectPath: resolvedProjectPath,
      workflowPackKey: resolvedWorkflowPackKey,
    });
    const resolvedDepartmentId = normalizeTextField((body as any).department_id) ?? goalPreset?.departmentId ?? null;
    const resolvedAssignedAgentId = normalizeTextField((body as any).assigned_agent_id) ?? null;
    const resolvedTaskType = normalizeTextField((body as any).task_type) ?? goalPreset?.taskType ?? "general";
    const bodyPriority = Number((body as any).priority);
    const resolvedPriority = Number.isFinite(bodyPriority) ? bodyPriority : (goalPreset?.priority ?? 0);
    const resolvedWorkflowMetaJson =
      goalCommandResolution.workflowMetaJson ??
      (typeof (body as any).workflow_meta_json === "string"
        ? (body as any).workflow_meta_json
        : (body as any).workflow_meta_json
          ? JSON.stringify((body as any).workflow_meta_json)
          : null);

    const insertColumns = [
      "id",
      "title",
      "description",
      "department_id",
      "assigned_agent_id",
      "project_id",
      "status",
      "priority",
      "task_type",
      "workflow_pack_key",
      "workflow_meta_json",
      "output_format",
      "project_path",
      "base_branch",
      "created_at",
      "updated_at",
    ];
    const insertValues: SQLInputValue[] = [
      id,
      title,
      (body as any).description ?? null,
      resolvedDepartmentId,
      resolvedAssignedAgentId,
      resolvedProjectId,
      (body as any).status ?? "inbox",
      resolvedPriority,
      resolvedTaskType,
      resolvedWorkflowPackKey,
      resolvedWorkflowMetaJson,
      typeof (body as any).output_format === "string" ? (body as any).output_format : null,
      resolvedProjectPath,
      (body as any).base_branch ?? null,
      t,
      t,
    ];
    if (hasTaskPolicyVersionColumn) {
      insertColumns.push("policy_version");
      insertValues.push(canonicalTaskFields.policy.policyVersion);
    }
    if (hasTaskResolvedPolicyColumn) {
      insertColumns.push("resolved_execution_policy_json");
      insertValues.push(canonicalTaskFields.resolvedPolicyJson);
    }
    if (hasTaskRequiredArtifactsColumn) {
      insertColumns.push("required_artifacts_json");
      insertValues.push(canonicalTaskFields.requiredArtifactsJson);
    }
    if (hasTaskApprovalGateStateColumn) {
      insertColumns.push("approval_gate_state_json");
      insertValues.push(canonicalTaskFields.approvalGateStateJson);
    }

    db.prepare(
      `
    INSERT INTO tasks (${insertColumns.join(", ")})
    VALUES (${insertColumns.map(() => "?").join(", ")})
  `,
    ).run(...insertValues);
    if (autoRoutedPackKey && resolvedWorkflowPackKey === autoRoutedPackKey) {
      markOfficePackHydrated(autoRoutedPackKey);
    }
    recordTaskCreationAudit({
      taskId: id,
      taskTitle: title,
      taskStatus: String((body as any).status ?? "inbox"),
      departmentId: resolvedDepartmentId,
      assignedAgentId: resolvedAssignedAgentId,
      taskType: resolvedTaskType,
      projectPath: resolvedProjectPath,
      trigger: "api.tasks.create",
      triggerDetail: "POST /api/tasks",
      actorType: "api_client",
      req,
      body: typeof body === "object" && body ? (body as Record<string, unknown>) : null,
    });

    if (resolvedProjectId) {
      db.prepare("UPDATE projects SET last_used_at = ?, updated_at = ? WHERE id = ?").run(t, t, resolvedProjectId);
      if (resolvedProjectPath) {
        try {
          const artifactState = applyProjectArtifactPatch({
            projectId: resolvedProjectId,
            projectPath: resolvedProjectPath,
            actor: "api.tasks.create",
            packProfile: resolvedWorkflowPackKey,
            policyVersion: canonicalTaskFields.policy.policyVersion,
            note: `Task created: ${title}`,
            task: {
              id,
              title,
              status: String((body as any).status ?? "inbox"),
              priority: resolvedPriority,
              taskType: resolvedTaskType,
            },
          });
          syncProjectArtifactProjection(db, artifactState, resolvedProjectId);
        } catch {
          // best-effort canonical artifact sync only
        }
      }
    }

    appendTaskLog(id, "system", `Task created: ${title}`);
    if (goalPreset) {
      appendTaskLog(id, "system", `Goal command routed: ${goalPreset.key} team=${goalPreset.teamPreset}`);
    }

    const taskRow = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    const task =
      taskRow && typeof taskRow === "object"
        ? normalizeTaskPolicySnapshotState(taskRow as Record<string, unknown>, "api.tasks.create")
        : taskRow;
    broadcast("task_update", task);
    res.json({ id, task });
  });

  app.get("/api/tasks/:id", (req, res) => {
    const id = String(req.params.id);
    try {
      reconcileCrossDeptSubtasks(id);
    } catch {
      // best-effort reconciliation only
    }
    const subtaskTotalExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id)
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;
    const subtaskDoneExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done')
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND c.status = 'done'
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;
    let task: unknown;
    try {
      task = db
        .prepare(
          `
      SELECT t.*,
        a.name AS agent_name,
        a.avatar_emoji AS agent_avatar,
        a.cli_provider AS agent_provider,
        COALESCE(opd.name, d.name) AS department_name,
        COALESCE(opd.icon, d.icon) AS department_icon,
        p.name AS project_name,
        p.core_goal AS project_core_goal,
        ${subtaskTotalExpr} AS subtask_total,
        ${subtaskDoneExpr} AS subtask_done
      FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      LEFT JOIN office_pack_departments opd
        ON opd.workflow_pack_key = COALESCE(t.workflow_pack_key, 'development')
       AND opd.department_id = t.department_id
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?
    `,
        )
        .get(id);
    } catch {
      task = db
        .prepare(
          `
      SELECT t.*,
        a.name AS agent_name,
        a.avatar_emoji AS agent_avatar,
        a.cli_provider AS agent_provider,
        d.name AS department_name,
        d.icon AS department_icon,
        p.name AS project_name,
        p.core_goal AS project_core_goal,
        ${subtaskTotalExpr} AS subtask_total,
        ${subtaskDoneExpr} AS subtask_done
      FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?
    `,
        )
        .get(id);
    }
    if (!task) return res.status(404).json({ error: "not_found" });

    const logs = db.prepare("SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at DESC LIMIT 200").all(id);
    const subtasks = db
      .prepare("SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at")
      .all(id)
      .map((row) => {
        if (!row || typeof row !== "object") return row;
        const normalizedRow = row as Record<string, unknown>;
        return {
          ...normalizedRow,
          title: normalizeSubtaskTitleForDisplay(normalizedRow.title),
        };
      });

    const normalizedTask =
      task && typeof task === "object"
        ? normalizeTaskPolicySnapshotState(task as Record<string, unknown>, "api.tasks.detail")
        : task;

    res.json({ task: normalizedTask, logs, subtasks });
  });

  app.get("/api/tasks/:id/meeting-minutes", (req, res) => {
    const id = String(req.params.id);
    const task = db.prepare("SELECT id, source_task_id FROM tasks WHERE id = ?").get(id) as
      | { id: string; source_task_id: string | null }
      | undefined;
    if (!task) return res.status(404).json({ error: "not_found" });

    const taskIds = [id];
    if (task.source_task_id) taskIds.push(task.source_task_id);

    const meetings = db
      .prepare(
        `SELECT * FROM meeting_minutes WHERE task_id IN (${taskIds.map(() => "?").join(",")}) ORDER BY started_at DESC, round DESC`,
      )
      .all(...taskIds) as unknown as MeetingMinutesRow[];

    const data = meetings.map((meeting) => {
      const entries = db
        .prepare("SELECT * FROM meeting_minute_entries WHERE meeting_id = ? ORDER BY seq ASC, id ASC")
        .all(meeting.id) as unknown as MeetingMinuteEntryRow[];
      return { ...meeting, entries };
    });

    res.json({ meetings: data });
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const id = String(req.params.id);
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "not_found" });

    const body = { ...(req.body ?? {}) } as Record<string, unknown>;
    if ("workflow_pack_key" in body) {
      const workflowPackKey = normalizeTextField(body.workflow_pack_key);
      if (!workflowPackKey || !isWorkflowPackKey(workflowPackKey)) {
        return res.status(400).json({ error: "invalid_workflow_pack_key" });
      }
      body.workflow_pack_key = workflowPackKey;
    }
    if ("workflow_meta_json" in body) {
      const rawWorkflowMeta = body.workflow_meta_json;
      if (rawWorkflowMeta === null) {
        body.workflow_meta_json = null;
      } else if (typeof rawWorkflowMeta === "string") {
        body.workflow_meta_json = rawWorkflowMeta;
      } else {
        body.workflow_meta_json = JSON.stringify(rawWorkflowMeta);
      }
    }
    if ("output_format" in body && body.output_format !== null && typeof body.output_format !== "string") {
      return res.status(400).json({ error: "invalid_output_format" });
    }

    const allowedFields = [
      "title",
      "description",
      "department_id",
      "assigned_agent_id",
      "status",
      "priority",
      "task_type",
      "workflow_pack_key",
      "workflow_meta_json",
      "output_format",
      "project_path",
      "result",
      "hidden",
    ];

    const updates: string[] = ["updated_at = ?"];
    const updateTs = nowMs();
    const params: unknown[] = [updateTs];
    let touchedProjectId: string | null = null;

    for (const field of allowedFields) {
      if (field in body) {
        updates.push(`${field} = ?`);
        params.push(body[field]);
      }
    }

    if ("project_id" in (body as any)) {
      const requestedProjectId = normalizeTextField((body as any).project_id);
      if (!requestedProjectId) {
        updates.push("project_id = ?");
        params.push(null);
      } else {
        const project = db.prepare("SELECT id, project_path FROM projects WHERE id = ?").get(requestedProjectId) as
          | {
              id: string;
              project_path: string;
            }
          | undefined;
        if (!project) return res.status(400).json({ error: "project_not_found" });
        updates.push("project_id = ?");
        params.push(project.id);
        touchedProjectId = project.id;
        if (!("project_path" in (body as any))) {
          updates.push("project_path = ?");
          params.push(project.project_path);
        }
      }
    }

    if ((body as any).status === "done" && !("completed_at" in (body as any))) {
      updates.push("completed_at = ?");
      params.push(nowMs());
    }
    if ((body as any).status === "in_progress" && !("started_at" in (body as any))) {
      updates.push("started_at = ?");
      params.push(nowMs());
    }

    params.push(id);
    db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...(params as SQLInputValue[]));
    if (touchedProjectId) {
      db.prepare("UPDATE projects SET last_used_at = ?, updated_at = ? WHERE id = ?").run(
        updateTs,
        updateTs,
        touchedProjectId,
      );
    }

    const nextStatus = typeof (body as any).status === "string" ? (body as any).status : null;
    if (nextStatus) {
      setTaskCreationAuditCompletion(id, nextStatus === "done");
    }
    if (
      nextStatus &&
      (nextStatus === "cancelled" || nextStatus === "pending" || nextStatus === "done" || nextStatus === "inbox")
    ) {
      clearTaskWorkflowState(id);
      if (nextStatus === "done" || nextStatus === "cancelled") {
        endTaskExecutionSession(id, `task_status_${nextStatus}`);
      }
    }

    appendTaskLog(id, "system", `Task updated: ${Object.keys(body as object).join(", ")}`);

    let updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (updated) {
      const updatedProjectContext = readProjectContextByTaskFields(
        normalizeTextField(updated.project_id),
        normalizeProjectPathInput(updated.project_path),
      );
      const updatedWorkflowPackKey =
        (normalizeTextField(updated.workflow_pack_key) as WorkflowPackKey | null) ?? DEFAULT_WORKFLOW_PACK_KEY;
      const canonicalTaskFields =
        hasTaskPolicyVersionColumn && normalizeTextField(updated.policy_version)
          ? null
          : buildCanonicalTaskFields({
              title: normalizeTextField(updated.title) ?? "",
              description: normalizeTextField(updated.description) ?? "",
              projectPath: updatedProjectContext.projectPath,
              workflowPackKey: updatedWorkflowPackKey,
            });
      if (canonicalTaskFields) {
        updateTaskCanonicalProjection(id, canonicalTaskFields);
        appendTaskLog(id, "system", `policy_snapshot_bound_to_task (${canonicalTaskFields.policy.policyVersion})`);
      }
      updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;

      if (updatedProjectContext.projectId && updatedProjectContext.projectPath) {
        try {
          const effectivePolicyVersion =
            normalizeTextField(updated?.policy_version) ?? canonicalTaskFields?.policy.policyVersion ?? "";
          const artifactState = applyProjectArtifactPatch({
            projectId: updatedProjectContext.projectId,
            projectPath: updatedProjectContext.projectPath,
            actor: "api.tasks.patch",
            packProfile: updatedWorkflowPackKey,
            policyVersion: effectivePolicyVersion,
            note: `Task updated fields: ${Object.keys(body as object).join(", ")}`,
            task: {
              id,
              title: normalizeTextField(updated?.title) ?? null,
              status: normalizeTextField(updated?.status) ?? null,
              priority: Number.isFinite(Number(updated?.priority)) ? Number(updated?.priority) : null,
              taskType: normalizeTextField(updated?.task_type) ?? null,
            },
          });
          syncProjectArtifactProjection(db, artifactState, updatedProjectContext.projectId);
        } catch {
          // best-effort canonical artifact sync only
        }
      }
    }
    const normalizedUpdated =
      updated && typeof updated === "object"
        ? normalizeTaskPolicySnapshotState(updated as Record<string, unknown>, "api.tasks.patch")
        : updated;
    broadcast("task_update", normalizedUpdated);
    res.json({ ok: true, task: normalizedUpdated });
  });

  app.post("/api/tasks/bulk-hide", (req, res) => {
    const { statuses, hidden } = req.body ?? {};
    if (!Array.isArray(statuses) || statuses.length === 0 || (hidden !== 0 && hidden !== 1)) {
      return res.status(400).json({ error: "invalid_body" });
    }
    const placeholders = statuses.map(() => "?").join(",");
    const result = db
      .prepare(`UPDATE tasks SET hidden = ?, updated_at = ? WHERE status IN (${placeholders}) AND hidden != ?`)
      .run(hidden, nowMs(), ...statuses, hidden);
    broadcast("tasks_changed", {});
    res.json({ ok: true, affected: result.changes });
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const id = String(req.params.id);
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | {
          assigned_agent_id: string | null;
        }
      | undefined;
    if (!existing) return res.status(404).json({ error: "not_found" });

    endTaskExecutionSession(id, "task_deleted");
    clearTaskWorkflowState(id);

    const activeChild = activeProcesses.get(id);
    if (activeChild?.pid) {
      stopRequestedTasks.add(id);
      if (activeChild.pid < 0) {
        activeChild.kill();
      } else {
        killPidTree(activeChild.pid);
      }
      activeProcesses.delete(id);
    }

    if (existing.assigned_agent_id) {
      db.prepare("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ? AND current_task_id = ?").run(
        existing.assigned_agent_id,
        id,
      );
    }

    db.prepare("DELETE FROM task_logs WHERE task_id = ?").run(id);
    db.prepare("DELETE FROM messages WHERE task_id = ?").run(id);
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);

    for (const suffix of [".log", ".prompt.txt"]) {
      const filePath = path.join(logsDir, `${id}${suffix}`);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // log cleanup best-effort
      }
    }

    broadcast("task_update", { id, deleted: true });
    res.json({ ok: true });
  });
}
