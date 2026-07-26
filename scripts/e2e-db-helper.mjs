#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const runtimeDir = path.resolve(process.cwd(), ".tmp", "e2e-runtime");
const dbPath = path.join(runtimeDir, "claw-empire.e2e.sqlite");
const action = String(process.argv[2] ?? "").trim();
const rawPayload = String(process.argv[3] ?? "{}");
const idPattern = /^[A-Za-z0-9._:-]{1,160}$/;
const readOnlyActions = new Set(["project-health-agent-current-task", "project-health-task-status"]);

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parsePayload() {
  const parsed = JSON.parse(rawPayload);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("E2E DB helper payload must be an object.");
  }
  return parsed;
}

function validateId(value, label) {
  const normalized = String(value ?? "").trim();
  if (!idPattern.test(normalized)) {
    throw new Error(`Invalid ${label}: ${normalized}`);
  }
  return normalized;
}

function validateIds(values, label) {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array.`);
  }
  return Array.from(new Set(values.map((value) => validateId(value, label))));
}

function placeholders(ids) {
  return ids.map(() => "?").join(", ");
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function insertProjectHealthTask(db, input) {
  db.prepare(
    `
      INSERT INTO tasks (
        id, title, description, department_id, assigned_agent_id, project_id, status,
        priority, task_type, workflow_pack_key, result, source_task_id, created_at, updated_at
      ) VALUES (?, ?, '', ?, ?, 'e2e-project-health', ?, 1, ?, 'development', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        department_id = excluded.department_id,
        assigned_agent_id = excluded.assigned_agent_id,
        project_id = excluded.project_id,
        status = excluded.status,
        task_type = excluded.task_type,
        result = excluded.result,
        source_task_id = excluded.source_task_id,
        updated_at = excluded.updated_at
    `,
  ).run(
    input.id,
    input.title,
    input.departmentId,
    input.assignedAgentId,
    input.status,
    input.taskType,
    input.result ?? null,
    input.sourceTaskId ?? null,
    input.now,
    input.now,
  );
}

function seedProjectHealth(db, payload) {
  const expectedProjectPath = path.join(runtimeDir, "project-health");
  const projectPath = path.resolve(String(payload.projectPath ?? ""));
  if (projectPath !== expectedProjectPath) {
    throw new Error(`Project Health fixture escaped its boundary: ${projectPath}`);
  }

  const now = 1_778_500_000_000;
  let inTransaction = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    inTransaction = true;
    db.prepare(
      `
        INSERT INTO projects (id, name, project_path, core_goal, last_used_at, created_at, updated_at)
        VALUES ('e2e-project-health', 'E2E Project Health', ?, 'Verify Project Health operator actions', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          project_path = excluded.project_path,
          core_goal = excluded.core_goal,
          last_used_at = excluded.last_used_at,
          updated_at = excluded.updated_at
      `,
    ).run(projectPath, now, now, now);

    for (const task of [
      {
        assignedAgentId: "master-development",
        departmentId: "development",
        id: "e2e-health-orphan",
        result: "Recovery watchdog moved orphan task to inbox.",
        sourceTaskId: "e2e-health-root",
        status: "inbox",
        taskType: "development",
        title: "E2E health orphan candidate",
      },
      {
        assignedAgentId: "master-planning",
        departmentId: "planning",
        id: "e2e-health-review",
        result: "Review gate: waiting for project-level decision.",
        status: "review",
        taskType: "general",
        title: "E2E health review waiting",
      },
      {
        assignedAgentId: "master-development",
        departmentId: "development",
        id: "e2e-health-path-blocked",
        status: "pending",
        taskType: "development",
        title: "E2E health path blocked rerun",
      },
      {
        assignedAgentId: "master-quality",
        departmentId: "quality",
        id: "e2e-health-done",
        result: "Completed but still held by agent.",
        status: "done",
        taskType: "general",
        title: "E2E health done stale owner",
      },
    ]) {
      insertProjectHealthTask(db, { ...task, now });
    }

    db.prepare("DELETE FROM task_logs WHERE task_id IN (?, ?, ?)").run(
      "e2e-health-orphan",
      "e2e-health-review",
      "e2e-health-path-blocked",
    );
    const insertLog = db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, ?, ?, ?)");
    insertLog.run("e2e-health-orphan", "system", "Recovery watchdog moved orphan task to inbox.", now);
    insertLog.run("e2e-health-review", "system", "Review gate: waiting for project-level decision.", now + 1);
    insertLog.run(
      "e2e-health-path-blocked",
      "error",
      "Execution blocked (project_path_not_allowed): Project path is outside allowed roots.",
      now + 2,
    );
    insertLog.run(
      "e2e-health-path-blocked",
      "system",
      "policy_snapshot_missing_on_legacy_row (api.tasks.list) -> bound 2026-05-06-26b847e3ba1d",
      now + 3,
    );
    db.exec("COMMIT");
    inTransaction = false;
    return { seeded: true };
  } catch (error) {
    if (inTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
    }
    throw error;
  }
}

function executeAction(db, payload) {
  if (action === "delete-subtasks") {
    const ids = validateIds(payload.ids, "subtask id");
    if (ids.length > 0) {
      db.prepare(`DELETE FROM subtasks WHERE id IN (${placeholders(ids)})`).run(...ids);
    }
    return { affected_ids: ids.length };
  }
  if (action === "delete-project-messages") {
    const ids = validateIds(payload.ids, "project id");
    if (ids.length > 0) {
      db.prepare(`DELETE FROM messages WHERE project_id IN (${placeholders(ids)})`).run(...ids);
    }
    return { affected_ids: ids.length };
  }
  if (action === "mark-agents-offline") {
    const ids = validateIds(payload.ids, "agent id");
    if (ids.length > 0) {
      db.prepare(`UPDATE agents SET status = 'offline' WHERE id IN (${placeholders(ids)})`).run(...ids);
    }
    return { affected_ids: ids.length };
  }
  if (action === "project-health-seed") {
    return seedProjectHealth(db, payload);
  }
  if (action === "project-health-stale-assignment") {
    db.prepare("UPDATE agents SET status = 'idle', current_task_id = ? WHERE id = 'master-quality'").run(
      "e2e-health-done",
    );
    return { updated: true };
  }
  if (action === "project-health-task-status") {
    const taskId = validateId(payload.taskId, "task id");
    const row = db.prepare("SELECT status, workflow_meta_json FROM tasks WHERE id = ?").get(taskId);
    if (!row) throw new Error(`Task not found: ${taskId}`);
    return row;
  }
  if (action === "project-health-agent-current-task") {
    const agentId = validateId(payload.agentId, "agent id");
    const row = db.prepare("SELECT current_task_id FROM agents WHERE id = ?").get(agentId);
    if (!row) throw new Error(`Agent not found: ${agentId}`);
    return row;
  }
  throw new Error(`Unsupported E2E DB helper action: ${action}`);
}

function main() {
  const payload = parsePayload();
  if (!fs.existsSync(dbPath)) {
    output({ ok: true, skipped: true, reason: "database_missing" });
    return;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    let db = null;
    let result = null;
    try {
      db = new DatabaseSync(dbPath, { readOnly: readOnlyActions.has(action) });
      db.exec("PRAGMA busy_timeout = 5000");
      result = executeAction(db, payload);
    } catch (error) {
      lastError = error;
      if (!String(error).toLowerCase().includes("database is locked") || attempt === 5) {
        break;
      }
    } finally {
      db?.close();
    }
    if (result) {
      output({ ok: true, action, ...result });
      return;
    }
    sleepSync(250 * attempt);
  }

  throw lastError;
}

main();
