import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupCiArtifacts, previewCiArtifactCleanup } from "./cleanup-ci-artifacts.ts";

const tempDirs: string[] = [];

function createDb(): DatabaseSync {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-ci-cleanup-"));
  tempDirs.push(dir);
  const db = new DatabaseSync(path.join(dir, "claw-empire.sqlite"));
  db.exec(`
    CREATE TABLE departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      department_id TEXT,
      current_task_id TEXT
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_path TEXT,
      core_goal TEXT
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      department_id TEXT,
      assigned_agent_id TEXT,
      project_id TEXT,
      source_task_id TEXT
    );
    CREATE TABLE subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      assigned_agent_id TEXT,
      target_department_id TEXT,
      delegated_task_id TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      content TEXT
    );
    CREATE TABLE task_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      message TEXT
    );
    CREATE TABLE meeting_minutes (
      id TEXT PRIMARY KEY,
      task_id TEXT
    );
    CREATE TABLE meeting_minute_entries (
      id TEXT PRIMARY KEY,
      meeting_id TEXT,
      speaker_agent_id TEXT
    );
    CREATE TABLE review_revision_history (
      id TEXT PRIMARY KEY,
      task_id TEXT
    );
    CREATE TABLE task_interrupt_injections (
      id TEXT PRIMARY KEY,
      task_id TEXT
    );
    CREATE TABLE task_report_archives (
      id TEXT PRIMARY KEY,
      root_task_id TEXT,
      generated_by_agent_id TEXT
    );
    CREATE TABLE task_creation_audits (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      department_id TEXT,
      assigned_agent_id TEXT,
      source_task_id TEXT
    );
    CREATE TABLE project_agents (
      project_id TEXT,
      agent_id TEXT
    );
    CREATE TABLE project_review_decision_events (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      task_id TEXT,
      meeting_id TEXT
    );
    CREATE TABLE project_review_decision_states (
      project_id TEXT PRIMARY KEY,
      planner_agent_id TEXT
    );
    CREATE TABLE review_round_decision_states (
      meeting_id TEXT PRIMARY KEY,
      planner_agent_id TEXT
    );
    CREATE TABLE review_round_feedback_items (
      id TEXT PRIMARY KEY,
      meeting_id TEXT,
      task_id TEXT,
      agent_id TEXT
    );
  `);
  return db;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("cleanupCiArtifacts", () => {
  it("ci_* 테스트 아티팩트만 제거하고 기본 데이터는 남긴다", () => {
    const db = createDb();
    try {
      db.prepare("INSERT INTO departments (id, name) VALUES (?, ?)").run("planning", "Planning");
      db.prepare("INSERT INTO departments (id, name) VALUES (?, ?)").run("ci_run_dept_seed", "Run Dept seed");

      db.prepare("INSERT INTO agents (id, name, department_id, current_task_id) VALUES (?, ?, ?, ?)").run(
        "agent-core",
        "Core Agent",
        "planning",
        null,
      );
      db.prepare("INSERT INTO agents (id, name, department_id, current_task_id) VALUES (?, ?, ?, ?)").run(
        "agent-ci",
        "run-agent-seed",
        "ci_run_dept_seed",
        "task-ci",
      );

      db.prepare("INSERT INTO projects (id, name, project_path, core_goal) VALUES (?, ?, ?, ?)").run(
        "project-core",
        "real-project",
        "D:/real-project",
        "Real work",
      );
      db.prepare("INSERT INTO projects (id, name, project_path, core_goal) VALUES (?, ?, ?, ?)").run(
        "project-ci",
        "ci-run-project-seed",
        "D:/repo/test-results/ci-e2e/seed",
        "Verify task run route and inbox webhook in CI",
      );

      db.prepare(
        "INSERT INTO tasks (id, title, department_id, assigned_agent_id, project_id, source_task_id) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("task-core", "real-task", "planning", "agent-core", "project-core", null);
      db.prepare(
        "INSERT INTO tasks (id, title, department_id, assigned_agent_id, project_id, source_task_id) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("task-ci", "ci-run-task-seed", "ci_run_dept_seed", "agent-ci", "project-ci", null);
      db.prepare(
        "INSERT INTO tasks (id, title, department_id, assigned_agent_id, project_id, source_task_id) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("task-ci-child", "child-task", "ci_run_dept_seed", "agent-ci", "project-ci", "task-ci");

      db.prepare(
        "INSERT INTO subtasks (id, task_id, assigned_agent_id, target_department_id, delegated_task_id) VALUES (?, ?, ?, ?, ?)",
      ).run("subtask-ci", "task-ci", "agent-ci", "ci_run_dept_seed", "task-ci-child");
      db.prepare("INSERT INTO messages (id, task_id, content) VALUES (?, ?, ?)").run("message-ci", "task-ci", "hello");
      db.prepare("INSERT INTO task_logs (id, task_id, message) VALUES (?, ?, ?)").run("log-ci", "task-ci", "log");
      db.prepare("INSERT INTO meeting_minutes (id, task_id) VALUES (?, ?)").run("meeting-ci", "task-ci");
      db.prepare("INSERT INTO meeting_minute_entries (id, meeting_id, speaker_agent_id) VALUES (?, ?, ?)").run(
        "meeting-entry-ci",
        "meeting-ci",
        "agent-ci",
      );
      db.prepare("INSERT INTO review_revision_history (id, task_id) VALUES (?, ?)").run("review-ci", "task-ci");
      db.prepare("INSERT INTO task_interrupt_injections (id, task_id) VALUES (?, ?)").run("interrupt-ci", "task-ci");
      db.prepare(
        "INSERT INTO task_report_archives (id, root_task_id, generated_by_agent_id) VALUES (?, ?, ?)",
      ).run("archive-ci", "task-ci", "agent-ci");
      db.prepare(
        "INSERT INTO task_creation_audits (id, task_id, department_id, assigned_agent_id, source_task_id) VALUES (?, ?, ?, ?, ?)",
      ).run("audit-ci", "task-ci", "ci_run_dept_seed", "agent-ci", "task-ci");
      db.prepare("INSERT INTO project_agents (project_id, agent_id) VALUES (?, ?)").run("project-ci", "agent-ci");
      db.prepare(
        "INSERT INTO project_review_decision_events (id, project_id, task_id, meeting_id) VALUES (?, ?, ?, ?)",
      ).run("project-event-ci", "project-ci", "task-ci", "meeting-ci");
      db.prepare("INSERT INTO project_review_decision_states (project_id, planner_agent_id) VALUES (?, ?)").run(
        "project-ci",
        "agent-ci",
      );
      db.prepare("INSERT INTO review_round_decision_states (meeting_id, planner_agent_id) VALUES (?, ?)").run(
        "meeting-ci",
        "agent-ci",
      );
      db.prepare(
        "INSERT INTO review_round_feedback_items (id, meeting_id, task_id, agent_id) VALUES (?, ?, ?, ?)",
      ).run("feedback-ci", "meeting-ci", "task-ci", "agent-ci");

      const preview = previewCiArtifactCleanup(db);
      expect(preview.departmentIds).toEqual(["ci_run_dept_seed"]);
      expect(preview.projectIds).toEqual(["project-ci"]);
      expect(preview.agentIds).toEqual(["agent-ci"]);
      expect(preview.taskIds.sort()).toEqual(["task-ci", "task-ci-child"].sort());
      expect(preview.tableCounts.departments).toBe(1);
      expect(preview.tableCounts.agents).toBe(1);
      expect(preview.tableCounts.tasks).toBe(2);

      cleanupCiArtifacts(db);

      expect(db.prepare("SELECT COUNT(*) AS count FROM departments WHERE id = 'planning'").get()).toMatchObject({
        count: 1,
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM departments WHERE id = 'ci_run_dept_seed'").get()).toMatchObject(
        { count: 0 },
      );
      expect(db.prepare("SELECT COUNT(*) AS count FROM agents WHERE id = 'agent-ci'").get()).toMatchObject({
        count: 0,
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM projects WHERE id = 'project-ci'").get()).toMatchObject({
        count: 0,
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id LIKE 'task-ci%'").get()).toMatchObject({
        count: 0,
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM messages WHERE id = 'message-ci'").get()).toMatchObject({
        count: 0,
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM meeting_minutes WHERE id = 'meeting-ci'").get()).toMatchObject({
        count: 0,
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = 'task-core'").get()).toMatchObject({
        count: 1,
      });
    } finally {
      db.close();
    }
  });
});
