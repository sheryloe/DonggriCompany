import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createCliRuntimeTools } from "./cli-runtime.ts";

type RuntimeHarness = {
  db: DatabaseSync;
  logsDir: string;
  close: () => void;
};

function createHarness(): RuntimeHarness {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE cli_account_pools (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      account_pool_id TEXT NOT NULL,
      label TEXT NOT NULL,
      profile_home TEXT NOT NULL,
      status TEXT NOT NULL,
      last_verified_at INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      UNIQUE(provider, account_pool_id)
    );
  `);
  const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-runtime-test-"));
  return {
    db,
    logsDir,
    close() {
      db.close();
      fs.rmSync(logsDir, { recursive: true, force: true });
    },
  };
}

async function waitForClose(child: { on: (event: "close", listener: (code: number | null) => void) => void }) {
  await new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code));
  });
}

describe("spawnCliAgent codex cli account pool", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      cleanup?.();
    }
  });

  it("applies pool profile_home to HOME and USERPROFILE (win32)", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const scriptPath = path.join(harness.logsDir, "print-env.js");
    fs.writeFileSync(
      scriptPath,
      [
        "process.stdout.write(`ENV_HOME=${process.env.HOME ?? ''}\\n`);",
        "process.stdout.write(`ENV_USERPROFILE=${process.env.USERPROFILE ?? ''}\\n`);",
      ].join("\n"),
      "utf8",
    );
    const profileHome = path.join(harness.logsDir, "codex-main-home");
    fs.mkdirSync(profileHome, { recursive: true });
    harness.db
      .prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
         VALUES (?, 'codex', 'codex-main', 'Main Codex', ?, 'connected', 1, 1)`,
      )
      .run(randomUUID(), profileHome);

    const logs: string[] = [];
    const runtime = createCliRuntimeTools({
      db: harness.db as any,
      logsDir: harness.logsDir,
      buildAgentArgs: () => ["node", scriptPath],
      clearCliOutputDedup: () => {},
      normalizeStreamChunk: (chunk: Buffer | string) => String(chunk),
      shouldSkipDuplicateCliOutput: () => false,
      broadcast: () => {},
      TASK_RUN_IDLE_TIMEOUT_MS: 0,
      TASK_RUN_HARD_TIMEOUT_MS: 0,
      killPidTree: (pid: number) => {
        try {
          process.kill(pid);
        } catch {
          // ignore
        }
      },
      appendTaskLog: (_taskId, _kind, message) => {
        logs.push(message);
      },
      activeProcesses: new Map(),
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
    });

    const logPath = path.join(harness.logsDir, "task-1.log");
    const child = runtime.spawnCliAgent(
      "task-1",
      "codex",
      "test prompt",
      harness.logsDir,
      logPath,
      undefined,
      undefined,
      "codex-main",
    );
    await waitForClose(child);
    const logText = fs.readFileSync(logPath, "utf8");

    expect(logText).toContain(`ENV_HOME=${profileHome}`);
    if (process.platform === "win32") {
      expect(logText).toContain(`ENV_USERPROFILE=${profileHome}`);
    }
    expect(logs.some((entry) => entry.includes("RUN FAILED"))).toBe(false);
  });

  it("keeps existing HOME when cli account pool is not specified", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const scriptPath = path.join(harness.logsDir, "print-home.js");
    fs.writeFileSync(scriptPath, "process.stdout.write(`ENV_HOME=${process.env.HOME ?? ''}\\n`);", "utf8");

    const previousHome = process.env.HOME;
    const forcedHome = path.join(harness.logsDir, "default-home");
    fs.mkdirSync(forcedHome, { recursive: true });
    process.env.HOME = forcedHome;
    cleanups.push(() => {
      if (typeof previousHome === "string") process.env.HOME = previousHome;
      else delete process.env.HOME;
    });

    const runtime = createCliRuntimeTools({
      db: harness.db as any,
      logsDir: harness.logsDir,
      buildAgentArgs: () => ["node", scriptPath],
      clearCliOutputDedup: () => {},
      normalizeStreamChunk: (chunk: Buffer | string) => String(chunk),
      shouldSkipDuplicateCliOutput: () => false,
      broadcast: () => {},
      TASK_RUN_IDLE_TIMEOUT_MS: 0,
      TASK_RUN_HARD_TIMEOUT_MS: 0,
      killPidTree: (pid: number) => {
        try {
          process.kill(pid);
        } catch {
          // ignore
        }
      },
      appendTaskLog: () => {},
      activeProcesses: new Map(),
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
    });

    const logPath = path.join(harness.logsDir, "task-2.log");
    const child = runtime.spawnCliAgent("task-2", "codex", "test prompt", harness.logsDir, logPath);
    await waitForClose(child);
    const logText = fs.readFileSync(logPath, "utf8");

    expect(logText).toContain(`ENV_HOME=${forcedHome}`);
  });

  it("auto-assigns single connected pool when cli account pool is not specified", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const scriptPath = path.join(harness.logsDir, "print-auto-home.js");
    fs.writeFileSync(scriptPath, "process.stdout.write(`ENV_HOME=${process.env.HOME ?? ''}\\n`);", "utf8");
    const profileHome = path.join(harness.logsDir, "gemini-main-home");
    fs.mkdirSync(profileHome, { recursive: true });
    harness.db
      .prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
         VALUES (?, 'gemini', 'gemini-main', 'Main Gemini', ?, 'connected', 1, 1)`,
      )
      .run(randomUUID(), profileHome);

    const runtime = createCliRuntimeTools({
      db: harness.db as any,
      logsDir: harness.logsDir,
      buildAgentArgs: () => ["node", scriptPath],
      clearCliOutputDedup: () => {},
      normalizeStreamChunk: (chunk: Buffer | string) => String(chunk),
      shouldSkipDuplicateCliOutput: () => false,
      broadcast: () => {},
      TASK_RUN_IDLE_TIMEOUT_MS: 0,
      TASK_RUN_HARD_TIMEOUT_MS: 0,
      killPidTree: (pid: number) => {
        try {
          process.kill(pid);
        } catch {
          // ignore
        }
      },
      appendTaskLog: () => {},
      activeProcesses: new Map(),
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
    });

    const logPath = path.join(harness.logsDir, "task-3.log");
    const child = runtime.spawnCliAgent("task-3", "gemini", "test prompt", harness.logsDir, logPath);
    await waitForClose(child);
    const logText = fs.readFileSync(logPath, "utf8");

    expect(logText).toContain(`ENV_HOME=${profileHome}`);
    expect(logText).toContain("provider=gemini");
    expect(logText).toContain("selected_by=auto");
  });

  it("auto-selects one connected pool when multiple pools exist and no explicit selection is provided", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const profileA = path.join(harness.logsDir, "codex-home-a");
    const profileB = path.join(harness.logsDir, "codex-home-b");
    fs.mkdirSync(profileA, { recursive: true });
    fs.mkdirSync(profileB, { recursive: true });
    const insertPool = harness.db.prepare(
      `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
       VALUES (?, 'codex', ?, ?, ?, 'connected', 1, 1)`,
    );
    insertPool.run(randomUUID(), "codex-a", "Codex A", profileA);
    insertPool.run(randomUUID(), "codex-b", "Codex B", profileB);

    const scriptPath = path.join(harness.logsDir, "print-selected-home.js");
    fs.writeFileSync(scriptPath, "process.stdout.write(`ENV_HOME=${process.env.HOME ?? ''}\\n`);", "utf8");
    const taskLogs: string[] = [];
    const runtime = createCliRuntimeTools({
      db: harness.db as any,
      logsDir: harness.logsDir,
      buildAgentArgs: () => ["node", scriptPath],
      clearCliOutputDedup: () => {},
      normalizeStreamChunk: (chunk: Buffer | string) => String(chunk),
      shouldSkipDuplicateCliOutput: () => false,
      broadcast: () => {},
      TASK_RUN_IDLE_TIMEOUT_MS: 0,
      TASK_RUN_HARD_TIMEOUT_MS: 0,
      killPidTree: (pid: number) => {
        try {
          process.kill(pid);
        } catch {
          // ignore
        }
      },
      appendTaskLog: (_taskId, _kind, message) => {
        taskLogs.push(message);
      },
      activeProcesses: new Map(),
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
    });

    const logPath = path.join(harness.logsDir, "task-4.log");
    const child = runtime.spawnCliAgent("task-4", "codex", "test prompt", harness.logsDir, logPath);
    await waitForClose(child);
    const logText = fs.readFileSync(logPath, "utf8");

    expect(logText).toContain("ENV_HOME=");
    const envHome = logText.match(/ENV_HOME=([^\n\r]*)/i)?.[1] ?? "";
    expect([profileA, profileB]).toContain(envHome);
    expect(logText).toContain("selected_by=auto");
    expect(logText).not.toContain("RUN FAILED (cli account pool)");
    expect(taskLogs.some((entry) => entry.includes("RUN FAILED (cli account pool)"))).toBe(false);
  });

  it("fails when jules pool is not explicitly selected", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const profileHome = path.join(harness.logsDir, "jules-home-main");
    fs.mkdirSync(profileHome, { recursive: true });
    harness.db
      .prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
         VALUES (?, 'jules', 'jules-main', 'Jules Main', ?, 'connected', 1, 1)`,
      )
      .run(randomUUID(), profileHome);

    const taskLogs: string[] = [];
    const runtime = createCliRuntimeTools({
      db: harness.db as any,
      logsDir: harness.logsDir,
      buildAgentArgs: () => ["node", "-e", "process.stdout.write('should-not-run')"],
      clearCliOutputDedup: () => {},
      normalizeStreamChunk: (chunk: Buffer | string) => String(chunk),
      shouldSkipDuplicateCliOutput: () => false,
      broadcast: () => {},
      TASK_RUN_IDLE_TIMEOUT_MS: 0,
      TASK_RUN_HARD_TIMEOUT_MS: 0,
      killPidTree: (pid: number) => {
        try {
          process.kill(pid);
        } catch {
          // ignore
        }
      },
      appendTaskLog: (_taskId, _kind, message) => {
        taskLogs.push(message);
      },
      activeProcesses: new Map(),
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
    });

    const logPath = path.join(harness.logsDir, "task-jules.log");
    const child = runtime.spawnCliAgent("task-jules", "jules", "test prompt", harness.logsDir, logPath);
    await waitForClose(child);
    const logText = fs.readFileSync(logPath, "utf8");

    expect(logText).toContain("RUN FAILED (cli account pool)");
    expect(logText).toContain("explicit_pool_selection_required");
    expect(taskLogs.some((entry) => entry.includes("explicit_pool_selection_required"))).toBe(true);
  });
});
