import type { DatabaseSync, SQLInputValue } from "node:sqlite";

type CleanupSeed = {
  departmentIds?: string[];
  projectIds?: string[];
  agentIds?: string[];
  taskIds?: string[];
  subtaskIds?: string[];
};

type CleanupIds = {
  departmentIds: string[];
  projectIds: string[];
  agentIds: string[];
  taskIds: string[];
  subtaskIds: string[];
  meetingIds: string[];
};

export type CleanupPreview = CleanupIds & {
  tableCounts: Record<string, number>;
};

export type CleanupResult = CleanupPreview & {
  dryRun: boolean;
};

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function hasTable(db: DatabaseSync, tableName: string): boolean {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName) as { name?: unknown } | undefined;
    return String(row?.name ?? "") === tableName;
  } catch {
    return false;
  }
}

function selectIds(db: DatabaseSync, sql: string, params: unknown[] = []): string[] {
  const rows = db.prepare(sql).all(...(params as SQLInputValue[])) as Array<{ id?: unknown }>;
  return uniqueIds(rows.map((row) => String(row.id ?? "")));
}

function unionIds(current: string[], next: Array<string | null | undefined>): string[] {
  return uniqueIds([...current, ...next]);
}

function buildInClause(ids: string[]): string {
  return ids.map(() => "?").join(", ");
}

function buildOrClause(parts: string[]): string {
  return parts.length > 0 ? parts.join(" OR ") : "0 = 1";
}

function collectRelatedIds(db: DatabaseSync, seed: CleanupSeed): CleanupIds {
  let departmentIds = uniqueIds([
    ...(seed.departmentIds ?? []),
    ...selectIds(db, "SELECT id FROM departments WHERE id LIKE 'ci_%'"),
  ]);

  let projectIds = uniqueIds([
    ...(seed.projectIds ?? []),
    ...selectIds(
      db,
      `
        SELECT id
        FROM projects
        WHERE name LIKE 'ci-%'
           OR project_path LIKE '%test-results%ci-e2e%'
           OR core_goal LIKE 'Verify % in CI%'
           OR core_goal LIKE 'CI %'
      `,
    ),
  ]);

  let agentIds = uniqueIds([
    ...(seed.agentIds ?? []),
    ...selectIds(
      db,
      `
        SELECT id
        FROM agents
        WHERE department_id LIKE 'ci_%'
           OR name LIKE 'ci-%'
           OR name LIKE 'run-agent-%'
           OR name LIKE 'pause-agent-%'
      `,
    ),
  ]);

  let taskIds = uniqueIds([
    ...(seed.taskIds ?? []),
    ...selectIds(
      db,
      `
        SELECT id
        FROM tasks
        WHERE department_id LIKE 'ci_%'
           OR title LIKE 'ci-%'
      `,
    ),
  ]);

  let subtaskIds = uniqueIds(seed.subtaskIds ?? []);

  let changed = true;
  while (changed) {
    const before = JSON.stringify({ departmentIds, projectIds, agentIds, taskIds, subtaskIds });

    if (departmentIds.length > 0) {
      const inDepartments = buildInClause(departmentIds);
      agentIds = unionIds(
        agentIds,
        selectIds(
          db,
          `SELECT id FROM agents WHERE department_id IN (${inDepartments})`,
          departmentIds,
        ),
      );
      taskIds = unionIds(
        taskIds,
        selectIds(
          db,
          `SELECT id FROM tasks WHERE department_id IN (${inDepartments})`,
          departmentIds,
        ),
      );
      subtaskIds = unionIds(
        subtaskIds,
        selectIds(
          db,
          `SELECT id FROM subtasks WHERE target_department_id IN (${inDepartments})`,
          departmentIds,
        ),
      );
    }

    if (projectIds.length > 0) {
      const inProjects = buildInClause(projectIds);
      taskIds = unionIds(
        taskIds,
        selectIds(
          db,
          `SELECT id FROM tasks WHERE project_id IN (${inProjects})`,
          projectIds,
        ),
      );
    }

    if (agentIds.length > 0) {
      const inAgents = buildInClause(agentIds);
      taskIds = unionIds(
        taskIds,
        selectIds(
          db,
          `SELECT id FROM tasks WHERE assigned_agent_id IN (${inAgents})`,
          agentIds,
        ),
      );
      subtaskIds = unionIds(
        subtaskIds,
        selectIds(
          db,
          `SELECT id FROM subtasks WHERE assigned_agent_id IN (${inAgents})`,
          agentIds,
        ),
      );
    }

    if (taskIds.length > 0) {
      const inTasks = buildInClause(taskIds);
      projectIds = unionIds(
        projectIds,
        selectIds(
          db,
          `SELECT project_id AS id FROM tasks WHERE project_id IS NOT NULL AND id IN (${inTasks})`,
          taskIds,
        ),
      );
      departmentIds = unionIds(
        departmentIds,
        selectIds(
          db,
          `SELECT department_id AS id FROM tasks WHERE department_id IS NOT NULL AND id IN (${inTasks})`,
          taskIds,
        ),
      );
      agentIds = unionIds(
        agentIds,
        selectIds(
          db,
          `SELECT assigned_agent_id AS id FROM tasks WHERE assigned_agent_id IS NOT NULL AND id IN (${inTasks})`,
          taskIds,
        ),
      );
      taskIds = unionIds(
        taskIds,
        selectIds(
          db,
          `SELECT id FROM tasks WHERE source_task_id IN (${inTasks})`,
          taskIds,
        ),
      );
      subtaskIds = unionIds(
        subtaskIds,
        selectIds(
          db,
          `
            SELECT id
            FROM subtasks
            WHERE task_id IN (${inTasks})
               OR delegated_task_id IN (${inTasks})
          `,
          [...taskIds, ...taskIds],
        ),
      );
    }

    const after = JSON.stringify({ departmentIds, projectIds, agentIds, taskIds, subtaskIds });
    changed = before !== after;
  }

  if (taskIds.length > 0) {
    const inTasks = buildInClause(taskIds);
    subtaskIds = unionIds(
      subtaskIds,
      selectIds(
        db,
        `
          SELECT id
          FROM subtasks
          WHERE task_id IN (${inTasks})
             OR delegated_task_id IN (${inTasks})
        `,
        [...taskIds, ...taskIds],
      ),
    );
  }

  const meetingIds =
    taskIds.length > 0
      ? selectIds(
          db,
          `SELECT id FROM meeting_minutes WHERE task_id IN (${buildInClause(taskIds)})`,
          taskIds,
        )
      : [];

  return {
    departmentIds,
    projectIds,
    agentIds,
    taskIds,
    subtaskIds,
    meetingIds,
  };
}

function countWhere(db: DatabaseSync, tableName: string, whereClause: string, params: unknown[]): number {
  if (!hasTable(db, tableName)) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${whereClause}`)
    .get(...(params as SQLInputValue[])) as { count?: unknown } | undefined;
  return Number(row?.count ?? 0);
}

function buildPreview(db: DatabaseSync, ids: CleanupIds): CleanupPreview {
  const tableCounts: Record<string, number> = {};

  if (ids.departmentIds.length > 0) {
    tableCounts.departments = countWhere(
      db,
      "departments",
      `id IN (${buildInClause(ids.departmentIds)})`,
      ids.departmentIds,
    );
  }

  if (ids.projectIds.length > 0) {
    tableCounts.projects = countWhere(db, "projects", `id IN (${buildInClause(ids.projectIds)})`, ids.projectIds);
    tableCounts.project_agents = countWhere(
      db,
      "project_agents",
      buildOrClause([
        `project_id IN (${buildInClause(ids.projectIds)})`,
        ids.agentIds.length > 0 ? `agent_id IN (${buildInClause(ids.agentIds)})` : "",
      ].filter(Boolean)),
      [...ids.projectIds, ...ids.agentIds],
    );
    tableCounts.project_review_decision_events = countWhere(
      db,
      "project_review_decision_events",
      buildOrClause([
        `project_id IN (${buildInClause(ids.projectIds)})`,
        ids.taskIds.length > 0 ? `task_id IN (${buildInClause(ids.taskIds)})` : "",
        ids.meetingIds.length > 0 ? `meeting_id IN (${buildInClause(ids.meetingIds)})` : "",
      ].filter(Boolean)),
      [...ids.projectIds, ...ids.taskIds, ...ids.meetingIds],
    );
    tableCounts.project_review_decision_states = countWhere(
      db,
      "project_review_decision_states",
      buildOrClause([
        `project_id IN (${buildInClause(ids.projectIds)})`,
        ids.agentIds.length > 0 ? `planner_agent_id IN (${buildInClause(ids.agentIds)})` : "",
      ].filter(Boolean)),
      [...ids.projectIds, ...ids.agentIds],
    );
  }

  if (ids.agentIds.length > 0) {
    tableCounts.agents = countWhere(db, "agents", `id IN (${buildInClause(ids.agentIds)})`, ids.agentIds);
  }

  if (ids.taskIds.length > 0) {
    tableCounts.tasks = countWhere(db, "tasks", `id IN (${buildInClause(ids.taskIds)})`, ids.taskIds);
    tableCounts.task_logs = countWhere(
      db,
      "task_logs",
      `task_id IN (${buildInClause(ids.taskIds)})`,
      ids.taskIds,
    );
    tableCounts.messages = countWhere(
      db,
      "messages",
      `task_id IN (${buildInClause(ids.taskIds)})`,
      ids.taskIds,
    );
    tableCounts.meeting_minutes = countWhere(
      db,
      "meeting_minutes",
      `task_id IN (${buildInClause(ids.taskIds)})`,
      ids.taskIds,
    );
    tableCounts.review_revision_history = countWhere(
      db,
      "review_revision_history",
      `task_id IN (${buildInClause(ids.taskIds)})`,
      ids.taskIds,
    );
    tableCounts.task_interrupt_injections = countWhere(
      db,
      "task_interrupt_injections",
      `task_id IN (${buildInClause(ids.taskIds)})`,
      ids.taskIds,
    );
    tableCounts.task_report_archives = countWhere(
      db,
      "task_report_archives",
      buildOrClause([
        `root_task_id IN (${buildInClause(ids.taskIds)})`,
        ids.agentIds.length > 0 ? `generated_by_agent_id IN (${buildInClause(ids.agentIds)})` : "",
      ].filter(Boolean)),
      [...ids.taskIds, ...ids.agentIds],
    );
    tableCounts.task_creation_audits = countWhere(
      db,
      "task_creation_audits",
      buildOrClause([
        `task_id IN (${buildInClause(ids.taskIds)})`,
        `source_task_id IN (${buildInClause(ids.taskIds)})`,
        ids.departmentIds.length > 0 ? `department_id IN (${buildInClause(ids.departmentIds)})` : "",
        ids.agentIds.length > 0 ? `assigned_agent_id IN (${buildInClause(ids.agentIds)})` : "",
      ].filter(Boolean)),
      [...ids.taskIds, ...ids.taskIds, ...ids.departmentIds, ...ids.agentIds],
    );
  }

  if (ids.subtaskIds.length > 0 || ids.taskIds.length > 0 || ids.agentIds.length > 0 || ids.departmentIds.length > 0) {
    const subtaskClauses: string[] = [];
    const subtaskParams: unknown[] = [];
    if (ids.subtaskIds.length > 0) {
      subtaskClauses.push(`id IN (${buildInClause(ids.subtaskIds)})`);
      subtaskParams.push(...ids.subtaskIds);
    }
    if (ids.taskIds.length > 0) {
      subtaskClauses.push(`task_id IN (${buildInClause(ids.taskIds)})`);
      subtaskClauses.push(`delegated_task_id IN (${buildInClause(ids.taskIds)})`);
      subtaskParams.push(...ids.taskIds, ...ids.taskIds);
    }
    if (ids.agentIds.length > 0) {
      subtaskClauses.push(`assigned_agent_id IN (${buildInClause(ids.agentIds)})`);
      subtaskParams.push(...ids.agentIds);
    }
    if (ids.departmentIds.length > 0) {
      subtaskClauses.push(`target_department_id IN (${buildInClause(ids.departmentIds)})`);
      subtaskParams.push(...ids.departmentIds);
    }
    tableCounts.subtasks = countWhere(db, "subtasks", buildOrClause(subtaskClauses), subtaskParams);
  }

  if (ids.meetingIds.length > 0) {
    tableCounts.meeting_minute_entries = countWhere(
      db,
      "meeting_minute_entries",
      buildOrClause([
        `meeting_id IN (${buildInClause(ids.meetingIds)})`,
        ids.agentIds.length > 0 ? `speaker_agent_id IN (${buildInClause(ids.agentIds)})` : "",
      ].filter(Boolean)),
      [...ids.meetingIds, ...ids.agentIds],
    );
    tableCounts.review_round_decision_states = countWhere(
      db,
      "review_round_decision_states",
      buildOrClause([
        `meeting_id IN (${buildInClause(ids.meetingIds)})`,
        ids.agentIds.length > 0 ? `planner_agent_id IN (${buildInClause(ids.agentIds)})` : "",
      ].filter(Boolean)),
      [...ids.meetingIds, ...ids.agentIds],
    );
    tableCounts.review_round_feedback_items = countWhere(
      db,
      "review_round_feedback_items",
      buildOrClause([
        `meeting_id IN (${buildInClause(ids.meetingIds)})`,
        ids.taskIds.length > 0 ? `task_id IN (${buildInClause(ids.taskIds)})` : "",
        ids.agentIds.length > 0 ? `agent_id IN (${buildInClause(ids.agentIds)})` : "",
      ].filter(Boolean)),
      [...ids.meetingIds, ...ids.taskIds, ...ids.agentIds],
    );
  }

  return {
    ...ids,
    tableCounts,
  };
}

function deleteWhere(db: DatabaseSync, tableName: string, whereClause: string, params: unknown[]): void {
  if (!hasTable(db, tableName)) return;
  db.prepare(`DELETE FROM ${tableName} WHERE ${whereClause}`).run(...(params as SQLInputValue[]));
}

function updateWhere(db: DatabaseSync, tableName: string, setClause: string, whereClause: string, params: unknown[]): void {
  if (!hasTable(db, tableName)) return;
  db.prepare(`UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`).run(...(params as SQLInputValue[]));
}

function deleteFromDatabase(db: DatabaseSync, ids: CleanupIds): void {
  if (ids.meetingIds.length > 0 || ids.taskIds.length > 0 || ids.agentIds.length > 0) {
    const feedbackClauses: string[] = [];
    const feedbackParams: unknown[] = [];
    if (ids.meetingIds.length > 0) {
      feedbackClauses.push(`meeting_id IN (${buildInClause(ids.meetingIds)})`);
      feedbackParams.push(...ids.meetingIds);
    }
    if (ids.taskIds.length > 0) {
      feedbackClauses.push(`task_id IN (${buildInClause(ids.taskIds)})`);
      feedbackParams.push(...ids.taskIds);
    }
    if (ids.agentIds.length > 0) {
      feedbackClauses.push(`agent_id IN (${buildInClause(ids.agentIds)})`);
      feedbackParams.push(...ids.agentIds);
    }
    if (feedbackClauses.length > 0) {
      deleteWhere(db, "review_round_feedback_items", buildOrClause(feedbackClauses), feedbackParams);
    }
  }

  if (ids.meetingIds.length > 0 || ids.agentIds.length > 0) {
    const decisionClauses: string[] = [];
    const decisionParams: unknown[] = [];
    if (ids.meetingIds.length > 0) {
      decisionClauses.push(`meeting_id IN (${buildInClause(ids.meetingIds)})`);
      decisionParams.push(...ids.meetingIds);
    }
    if (ids.agentIds.length > 0) {
      decisionClauses.push(`planner_agent_id IN (${buildInClause(ids.agentIds)})`);
      decisionParams.push(...ids.agentIds);
    }
    if (decisionClauses.length > 0) {
      deleteWhere(db, "review_round_decision_states", buildOrClause(decisionClauses), decisionParams);
    }
  }

  if (ids.projectIds.length > 0 || ids.taskIds.length > 0 || ids.meetingIds.length > 0) {
    const eventClauses: string[] = [];
    const eventParams: unknown[] = [];
    if (ids.projectIds.length > 0) {
      eventClauses.push(`project_id IN (${buildInClause(ids.projectIds)})`);
      eventParams.push(...ids.projectIds);
    }
    if (ids.taskIds.length > 0) {
      eventClauses.push(`task_id IN (${buildInClause(ids.taskIds)})`);
      eventParams.push(...ids.taskIds);
    }
    if (ids.meetingIds.length > 0) {
      eventClauses.push(`meeting_id IN (${buildInClause(ids.meetingIds)})`);
      eventParams.push(...ids.meetingIds);
    }
    if (eventClauses.length > 0) {
      deleteWhere(db, "project_review_decision_events", buildOrClause(eventClauses), eventParams);
    }
  }

  if (ids.projectIds.length > 0 || ids.agentIds.length > 0) {
    const stateClauses: string[] = [];
    const stateParams: unknown[] = [];
    if (ids.projectIds.length > 0) {
      stateClauses.push(`project_id IN (${buildInClause(ids.projectIds)})`);
      stateParams.push(...ids.projectIds);
    }
    if (ids.agentIds.length > 0) {
      stateClauses.push(`planner_agent_id IN (${buildInClause(ids.agentIds)})`);
      stateParams.push(...ids.agentIds);
    }
    if (stateClauses.length > 0) {
      deleteWhere(db, "project_review_decision_states", buildOrClause(stateClauses), stateParams);
    }
  }

  if (ids.meetingIds.length > 0 || ids.agentIds.length > 0) {
    const entryClauses: string[] = [];
    const entryParams: unknown[] = [];
    if (ids.meetingIds.length > 0) {
      entryClauses.push(`meeting_id IN (${buildInClause(ids.meetingIds)})`);
      entryParams.push(...ids.meetingIds);
    }
    if (ids.agentIds.length > 0) {
      entryClauses.push(`speaker_agent_id IN (${buildInClause(ids.agentIds)})`);
      entryParams.push(...ids.agentIds);
    }
    if (entryClauses.length > 0) {
      deleteWhere(db, "meeting_minute_entries", buildOrClause(entryClauses), entryParams);
    }
  }

  if (ids.taskIds.length > 0) {
    const inTasks = buildInClause(ids.taskIds);
    deleteWhere(db, "task_logs", `task_id IN (${inTasks})`, ids.taskIds);
    deleteWhere(db, "messages", `task_id IN (${inTasks})`, ids.taskIds);
    deleteWhere(db, "review_revision_history", `task_id IN (${inTasks})`, ids.taskIds);
    deleteWhere(db, "task_interrupt_injections", `task_id IN (${inTasks})`, ids.taskIds);
    deleteWhere(db, "meeting_minutes", `task_id IN (${inTasks})`, ids.taskIds);
  }

  if (ids.taskIds.length > 0 || ids.agentIds.length > 0) {
    const archiveClauses: string[] = [];
    const archiveParams: unknown[] = [];
    if (ids.taskIds.length > 0) {
      archiveClauses.push(`root_task_id IN (${buildInClause(ids.taskIds)})`);
      archiveParams.push(...ids.taskIds);
    }
    if (ids.agentIds.length > 0) {
      archiveClauses.push(`generated_by_agent_id IN (${buildInClause(ids.agentIds)})`);
      archiveParams.push(...ids.agentIds);
    }
    if (archiveClauses.length > 0) {
      deleteWhere(db, "task_report_archives", buildOrClause(archiveClauses), archiveParams);
    }
  }

  if (ids.taskIds.length > 0 || ids.departmentIds.length > 0 || ids.agentIds.length > 0) {
    const auditClauses: string[] = [];
    const auditParams: unknown[] = [];
    if (ids.taskIds.length > 0) {
      auditClauses.push(`task_id IN (${buildInClause(ids.taskIds)})`);
      auditClauses.push(`source_task_id IN (${buildInClause(ids.taskIds)})`);
      auditParams.push(...ids.taskIds, ...ids.taskIds);
    }
    if (ids.departmentIds.length > 0) {
      auditClauses.push(`department_id IN (${buildInClause(ids.departmentIds)})`);
      auditParams.push(...ids.departmentIds);
    }
    if (ids.agentIds.length > 0) {
      auditClauses.push(`assigned_agent_id IN (${buildInClause(ids.agentIds)})`);
      auditParams.push(...ids.agentIds);
    }
    if (auditClauses.length > 0) {
      deleteWhere(db, "task_creation_audits", buildOrClause(auditClauses), auditParams);
    }
  }

  if (ids.subtaskIds.length > 0 || ids.taskIds.length > 0 || ids.agentIds.length > 0 || ids.departmentIds.length > 0) {
    const subtaskClauses: string[] = [];
    const subtaskParams: unknown[] = [];
    if (ids.subtaskIds.length > 0) {
      subtaskClauses.push(`id IN (${buildInClause(ids.subtaskIds)})`);
      subtaskParams.push(...ids.subtaskIds);
    }
    if (ids.taskIds.length > 0) {
      subtaskClauses.push(`task_id IN (${buildInClause(ids.taskIds)})`);
      subtaskClauses.push(`delegated_task_id IN (${buildInClause(ids.taskIds)})`);
      subtaskParams.push(...ids.taskIds, ...ids.taskIds);
    }
    if (ids.agentIds.length > 0) {
      subtaskClauses.push(`assigned_agent_id IN (${buildInClause(ids.agentIds)})`);
      subtaskParams.push(...ids.agentIds);
    }
    if (ids.departmentIds.length > 0) {
      subtaskClauses.push(`target_department_id IN (${buildInClause(ids.departmentIds)})`);
      subtaskParams.push(...ids.departmentIds);
    }
    deleteWhere(db, "subtasks", buildOrClause(subtaskClauses), subtaskParams);
  }

  if (ids.agentIds.length > 0) {
    const inAgents = buildInClause(ids.agentIds);
    updateWhere(db, "tasks", "assigned_agent_id = NULL", `assigned_agent_id IN (${inAgents})`, ids.agentIds);
    updateWhere(db, "subtasks", "assigned_agent_id = NULL", `assigned_agent_id IN (${inAgents})`, ids.agentIds);
    updateWhere(
      db,
      "meeting_minute_entries",
      "speaker_agent_id = NULL",
      `speaker_agent_id IN (${inAgents})`,
      ids.agentIds,
    );
    updateWhere(
      db,
      "task_report_archives",
      "generated_by_agent_id = NULL",
      `generated_by_agent_id IN (${inAgents})`,
      ids.agentIds,
    );
    updateWhere(
      db,
      "project_review_decision_states",
      "planner_agent_id = NULL",
      `planner_agent_id IN (${inAgents})`,
      ids.agentIds,
    );
    updateWhere(
      db,
      "review_round_decision_states",
      "planner_agent_id = NULL",
      `planner_agent_id IN (${inAgents})`,
      ids.agentIds,
    );
  }

  if (ids.projectIds.length > 0 || ids.agentIds.length > 0) {
    const projectAgentClauses: string[] = [];
    const projectAgentParams: unknown[] = [];
    if (ids.projectIds.length > 0) {
      projectAgentClauses.push(`project_id IN (${buildInClause(ids.projectIds)})`);
      projectAgentParams.push(...ids.projectIds);
    }
    if (ids.agentIds.length > 0) {
      projectAgentClauses.push(`agent_id IN (${buildInClause(ids.agentIds)})`);
      projectAgentParams.push(...ids.agentIds);
    }
    deleteWhere(db, "project_agents", buildOrClause(projectAgentClauses), projectAgentParams);
  }

  if (ids.taskIds.length > 0) {
    deleteWhere(db, "tasks", `id IN (${buildInClause(ids.taskIds)})`, ids.taskIds);
  }
  if (ids.agentIds.length > 0) {
    deleteWhere(db, "agents", `id IN (${buildInClause(ids.agentIds)})`, ids.agentIds);
  }
  if (ids.projectIds.length > 0) {
    deleteWhere(db, "projects", `id IN (${buildInClause(ids.projectIds)})`, ids.projectIds);
  }
  if (ids.departmentIds.length > 0) {
    deleteWhere(db, "departments", `id IN (${buildInClause(ids.departmentIds)})`, ids.departmentIds);
  }
}

export function previewCiArtifactCleanup(db: DatabaseSync, seed: CleanupSeed = {}): CleanupPreview {
  return buildPreview(db, collectRelatedIds(db, seed));
}

export function cleanupCiArtifacts(
  db: DatabaseSync,
  options: CleanupSeed & {
    dryRun?: boolean;
  } = {},
): CleanupResult {
  const ids = collectRelatedIds(db, options);
  const preview = buildPreview(db, ids);
  if (options.dryRun) {
    return {
      ...preview,
      dryRun: true,
    };
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    deleteFromDatabase(db, ids);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    ...preview,
    dryRun: false,
  };
}
