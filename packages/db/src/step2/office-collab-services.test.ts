import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import test from "node:test";

import { runMigrations } from "../migrate.js";
import { runSeed } from "../seed.js";
import {
  CliExecutionService,
  KanbanTaskService,
  MeetingService
} from "../index.js";

const createSeededDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step6-collab-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

const cleanupDbPath = (dbPath: string): void => {
  rmSync(dbPath, { force: true });
};

test("KanbanTaskService supports create and status transition", () => {
  const dbPath = createSeededDbPath();
  const service = new KanbanTaskService(dbPath);

  try {
    const listed = service.list();
    assert.equal(listed.ok, true);
    assert.equal(listed.departments.length > 0, true);

    const created = service.create({
      title: "Step6 task",
      description: "Implement kanban",
      departmentId: "dept-runtime",
      priority: 2
    });

    assert.equal(created.status, "inbox");
    assert.equal(created.departmentId, "dept-runtime");

    const updated = service.update(created.id, {
      status: "in_progress",
      assigneeAgentId: "actor-runtime"
    });

    assert.equal(updated.status, "in_progress");
    assert.equal(updated.assigneeAgentId, "actor-runtime");
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("MeetingService supports create/start/complete/delete lifecycle", () => {
  const dbPath = createSeededDbPath();
  const kanbanService = new KanbanTaskService(dbPath);
  const meetingService = new MeetingService(dbPath);

  try {
    const task = kanbanService.create({
      title: "Prepare PM review",
      departmentId: "dept-pm",
      status: "planned"
    });

    const created = meetingService.create({
      title: "PM review",
      taskId: task.id,
      departmentId: "dept-pm",
      agenda: "Status update",
      participants: ["pm", "runtime"]
    });

    assert.equal(created.meeting.status, "scheduled");
    assert.equal(created.meeting.participants.length, 2);

    const started = meetingService.start(created.meeting.id);
    assert.equal(started.meeting.status, "in_progress");

    const completed = meetingService.complete(created.meeting.id, {
      summary: "approved"
    });
    assert.equal(completed.meeting.status, "completed");

    const removed = meetingService.remove(created.meeting.id);
    assert.equal(removed.deleted, true);
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("CliExecutionService supports run/stop and timeout", async () => {
  const dbPath = createSeededDbPath();
  const previousTimeout = process.env.TASK_RUN_HARD_TIMEOUT_MS;
  process.env.TASK_RUN_HARD_TIMEOUT_MS = "25";

  try {
    const service = new CliExecutionService(dbPath);

    const running = service.run({
      taskId: "task-stop",
      provider: "codex",
      prompt: "- [ ] draft\n- [x] done",
      projectPath: "/workspace"
    });
    assert.equal(running.run.status, "running");

    const subtasks = service.listSubtasks("task-stop");
    assert.equal(subtasks.subtasks.length, 2);

    const stopped = service.stop("task-stop");
    assert.equal(stopped.stopped, true);

    const runAfterStop = service.getRun("task-stop");
    assert.equal(runAfterStop.status, "stopped");

    service.run({
      taskId: "task-timeout",
      provider: "gemini",
      prompt: "timeout me",
      projectPath: "/workspace"
    });

    await wait(60);

    const timeoutRun = service.getRun("task-timeout");
    assert.equal(timeoutRun.status, "timeout");

    const active = service.listActiveRuns();
    assert.equal(active.runs.some((run) => run.taskId === "task-timeout"), false);

    const logs = service.listLogs("task-timeout", 10);
    assert.equal(logs.logs.some((item) => item.line.includes("timed out")), true);
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.TASK_RUN_HARD_TIMEOUT_MS;
    } else {
      process.env.TASK_RUN_HARD_TIMEOUT_MS = previousTimeout;
    }
    cleanupDbPath(dbPath);
  }
});
