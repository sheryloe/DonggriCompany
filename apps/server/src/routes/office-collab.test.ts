import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { OAuthSessionService, runMigrations, runSeed } from "@workspace/db";

import { createServer } from "../app.js";

const setupDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-office-collab-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

test("office collab routes: kanban/meeting/cli lifecycle", async () => {
  const dbPath = setupDbPath();
  const previousDbPath = process.env.WORKSPACE_DB_PATH;
  const previousWriteToken = process.env.OFFICE_WRITE_TOKEN;
  const previousTimeout = process.env.TASK_RUN_HARD_TIMEOUT_MS;
  process.env.WORKSPACE_DB_PATH = dbPath;
  process.env.OFFICE_WRITE_TOKEN = "step6-collab-token";
  process.env.TASK_RUN_HARD_TIMEOUT_MS = "60000";
  const oauthService = new OAuthSessionService(dbPath);
  oauthService.upsertConnectedSession({
    provider: "codex",
    accountPoolId: "pool_codex_pro_main",
    accessTokenEncrypted: "test-token",
    refreshTokenEncrypted: null,
    tokenType: "Bearer",
    scope: "profile",
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
  });

  const server = createServer();

  try {
    const kanbanList = await server.inject({ method: "GET", url: "/api/office/kanban/tasks" });
    assert.equal(kanbanList.statusCode, 200);
    const kanbanBody = JSON.parse(kanbanList.body) as {
      departments: Array<{ id: string }>;
      tasks: Array<{ id: string }>;
    };
    assert.equal(kanbanBody.departments.length > 0, true);

    const deniedCreate = await server.inject({
      method: "POST",
      url: "/api/office/kanban/tasks",
      payload: { title: "Denied" }
    });
    assert.equal(deniedCreate.statusCode, 400);

    const createdTaskRes = await server.inject({
      method: "POST",
      url: "/api/office/kanban/tasks",
      headers: { "x-office-write-token": "step6-collab-token" },
      payload: {
        title: "Step6 Kanban Task",
        status: "planned",
        departmentId: "dept-runtime",
        priority: 2
      }
    });
    assert.equal(createdTaskRes.statusCode, 201);
    const createdTask = JSON.parse(createdTaskRes.body) as { task: { id: string; status: string } };
    assert.equal(createdTask.task.status, "planned");

    const updatedTaskRes = await server.inject({
      method: "PATCH",
      url: `/api/office/kanban/tasks/${createdTask.task.id}`,
      headers: { "x-office-write-token": "step6-collab-token" },
      payload: {
        status: "in_progress",
        assigneeAgentId: "actor-runtime"
      }
    });
    assert.equal(updatedTaskRes.statusCode, 200);

    const createMeetingRes = await server.inject({
      method: "POST",
      url: "/api/office/meetings",
      headers: { "x-office-write-token": "step6-collab-token" },
      payload: {
        title: "Runtime Sync",
        taskId: createdTask.task.id,
        departmentId: "dept-runtime",
        participants: ["pm", "runtime"]
      }
    });
    assert.equal(createMeetingRes.statusCode, 201);
    const createdMeeting = JSON.parse(createMeetingRes.body) as { meeting: { id: string; status: string } };
    assert.equal(createdMeeting.meeting.status, "scheduled");

    const startMeetingRes = await server.inject({
      method: "POST",
      url: `/api/office/meetings/${createdMeeting.meeting.id}/start`,
      headers: { "x-office-write-token": "step6-collab-token" }
    });
    assert.equal(startMeetingRes.statusCode, 200);

    const completeMeetingRes = await server.inject({
      method: "POST",
      url: `/api/office/meetings/${createdMeeting.meeting.id}/complete`,
      headers: { "x-office-write-token": "step6-collab-token" },
      payload: { summary: "Done" }
    });
    assert.equal(completeMeetingRes.statusCode, 200);

    const deleteMeetingRes = await server.inject({
      method: "DELETE",
      url: `/api/office/meetings/${createdMeeting.meeting.id}`,
      headers: { "x-office-write-token": "step6-collab-token" }
    });
    assert.equal(deleteMeetingRes.statusCode, 200);

    const runCliRes = await server.inject({
      method: "POST",
      url: "/api/office/cli/run",
      headers: { "x-office-write-token": "step6-collab-token" },
      payload: {
        taskId: "task-step6-cli",
        provider: "codex",
        accountPoolId: "pool_codex_pro_main",
        prompt: "- [ ] collect logs\n- [x] summarize",
        projectPath: "/app"
      }
    });
    assert.equal(runCliRes.statusCode, 200);
    const runCliBody = JSON.parse(runCliRes.body) as { run: { taskId: string; status: string } };
    assert.equal(runCliBody.run.status, "running");

    const cliActiveRes = await server.inject({ method: "GET", url: "/api/office/cli/active" });
    assert.equal(cliActiveRes.statusCode, 200);
    const cliActiveBody = JSON.parse(cliActiveRes.body) as { runs: Array<{ taskId: string }> };
    assert.equal(cliActiveBody.runs.some((run) => run.taskId === "task-step6-cli"), true);

    const cliLogsRes = await server.inject({
      method: "GET",
      url: "/api/office/cli/logs/task-step6-cli?limit=10"
    });
    assert.equal(cliLogsRes.statusCode, 200);
    const cliLogsBody = JSON.parse(cliLogsRes.body) as { logs: Array<{ line: string }> };
    assert.equal(cliLogsBody.logs.length > 0, true);

    const cliSubtasksRes = await server.inject({
      method: "GET",
      url: "/api/office/cli/subtasks/task-step6-cli"
    });
    assert.equal(cliSubtasksRes.statusCode, 200);
    const cliSubtasksBody = JSON.parse(cliSubtasksRes.body) as { subtasks: Array<{ label: string }> };
    assert.equal(cliSubtasksBody.subtasks.length, 2);

    const stopCliRes = await server.inject({
      method: "POST",
      url: "/api/office/cli/stop/task-step6-cli",
      headers: { "x-office-write-token": "step6-collab-token" }
    });
    assert.equal(stopCliRes.statusCode, 200);
    const stopCliBody = JSON.parse(stopCliRes.body) as { stopped: boolean };
    assert.equal(stopCliBody.stopped, true);
  } finally {
    await server.close();
    if (previousDbPath === undefined) {
      delete process.env.WORKSPACE_DB_PATH;
    } else {
      process.env.WORKSPACE_DB_PATH = previousDbPath;
    }
    if (previousWriteToken === undefined) {
      delete process.env.OFFICE_WRITE_TOKEN;
    } else {
      process.env.OFFICE_WRITE_TOKEN = previousWriteToken;
    }
    if (previousTimeout === undefined) {
      delete process.env.TASK_RUN_HARD_TIMEOUT_MS;
    } else {
      process.env.TASK_RUN_HARD_TIMEOUT_MS = previousTimeout;
    }
    rmSync(dbPath, { force: true });
  }
});
