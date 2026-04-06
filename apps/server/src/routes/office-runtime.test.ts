import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runMigrations, runSeed } from "@workspace/db";

import { createServer } from "../app.js";

const setupDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-office-runtime-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

test("office runtime routes: command/thread/log lifecycle and persistence", async () => {
  const dbPath = setupDbPath();
  const previousDbPath = process.env.WORKSPACE_DB_PATH;
  const previousWriteToken = process.env.OFFICE_WRITE_TOKEN;
  process.env.WORKSPACE_DB_PATH = dbPath;
  process.env.OFFICE_WRITE_TOKEN = "step6-write-token";

  const server = createServer();
  try {
    const stateResponse = await server.inject({
      method: "GET",
      url: "/api/office/runtime/state"
    });
    assert.equal(stateResponse.statusCode, 200);
    const stateBody = JSON.parse(stateResponse.body) as {
      state: { loopState: string; tick: number };
    };
    assert.ok(typeof stateBody.state.tick === "number");
    assert.equal(stateBody.state.loopState, "idle");

    const deniedCommand = await server.inject({
      method: "POST",
      url: "/api/office/runtime/command",
      payload: { command: "runProbe" }
    });
    assert.equal(deniedCommand.statusCode, 400);

    const commandResponse = await server.inject({
      method: "POST",
      url: "/api/office/runtime/command",
      headers: { "x-office-write-token": "step6-write-token" },
      payload: { command: "runProbe", phase: "committed", detail: "backend-success" }
    });
    assert.equal(commandResponse.statusCode, 200);
    const commandBody = JSON.parse(commandResponse.body) as {
      state: { loopState: string };
    };
    assert.equal(commandBody.state.loopState, "moving_to_task");

    const logsResponse = await server.inject({
      method: "GET",
      url: "/api/office/logs?limit=20"
    });
    assert.equal(logsResponse.statusCode, 200);
    const logsBody = JSON.parse(logsResponse.body) as {
      logs: Array<{ message: string }>;
    };
    assert.equal(
      logsBody.logs.some((item) => item.message.includes("HUD committed: runProbe")),
      true
    );

    const createThreadResponse = await server.inject({
      method: "POST",
      url: "/api/office/threads",
      headers: { "x-office-write-token": "step6-write-token" },
      payload: {
        recipient: "pm",
        summary: "Prepare PM report",
        body: "Please start preparing release report."
      }
    });
    assert.equal(createThreadResponse.statusCode, 200);
    const createThreadBody = JSON.parse(createThreadResponse.body) as {
      thread: { id: string; status: string };
    };
    assert.equal(createThreadBody.thread.status, "sent");

    const feedbackResponse = await server.inject({
      method: "POST",
      url: `/api/office/threads/${createThreadBody.thread.id}/messages`,
      headers: { "x-office-write-token": "step6-write-token" },
      payload: {
        sender: "pm",
        body: "PM feedback has been reflected."
      }
    });
    assert.equal(feedbackResponse.statusCode, 200);

    const closeThreadResponse = await server.inject({
      method: "PATCH",
      url: `/api/office/threads/${createThreadBody.thread.id}/status`,
      headers: { "x-office-write-token": "step6-write-token" },
      payload: {
        status: "closed"
      }
    });
    assert.equal(closeThreadResponse.statusCode, 200);

    const threadListResponse = await server.inject({
      method: "GET",
      url: "/api/office/threads"
    });
    assert.equal(threadListResponse.statusCode, 200);
    const threadListBody = JSON.parse(threadListResponse.body) as {
      threads: Array<{ id: string; status: string; messages: Array<{ body: string }> }>;
    };
    const target = threadListBody.threads.find(
      (item) => item.id === createThreadBody.thread.id
    );
    assert.ok(target);
    assert.equal(target?.status, "closed");
    assert.equal(
      target?.messages.some((message) => message.body.includes("PM feedback")),
      true
    );
  } finally {
    await server.close();
  }

  const restarted = createServer();
  try {
    const stateResponse = await restarted.inject({
      method: "GET",
      url: "/api/office/runtime/state"
    });
    assert.equal(stateResponse.statusCode, 200);

    const threadsResponse = await restarted.inject({
      method: "GET",
      url: "/api/office/threads"
    });
    assert.equal(threadsResponse.statusCode, 200);
    const threadsBody = JSON.parse(threadsResponse.body) as {
      threads: Array<{ id: string }>;
    };
    assert.equal(threadsBody.threads.length > 0, true);
  } finally {
    await restarted.close();
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
    rmSync(dbPath, { force: true });
  }
});