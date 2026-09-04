import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCliRuntimeTools as createCliRuntimeToolsBase,
  PROVIDER_LIVE_EXECUTION_GATE_ID,
  type ProviderLiveExecutionGate,
} from "./cli-runtime.ts";
import { createCliTools } from "../core/cli-tools.ts";
import { resolveCliAccountPoolEnv } from "./cli-account-pool-env.ts";
import { resolveHostExecutable, type ResolveHostExecutableInput } from "./host-executable-resolver.ts";

const approveTestProviderExecution: ProviderLiveExecutionGate = (request) =>
  request.gateId === PROVIDER_LIVE_EXECUTION_GATE_ID;

function resolveTestNodeExecutable(input: ResolveHostExecutableInput) {
  return resolveHostExecutable({ ...input, allowedCommands: ["node"] });
}

function createCliRuntimeTools(deps: Parameters<typeof createCliRuntimeToolsBase>[0]) {
  return createCliRuntimeToolsBase({
    ...deps,
    providerLiveExecutionGate: approveTestProviderExecution,
    resolveExecutable: resolveTestNodeExecutable,
    cliAccountProfileRoot: deps.cliAccountProfileRoot ?? path.join(deps.logsDir, "office-accounts"),
  });
}

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

function writeAuthArtifact(profileHome: string, provider: "codex" | "claude" | "gemini" | "jules" = "codex"): void {
  const relativePath =
    provider === "gemini"
      ? path.join(".gemini", "oauth_creds.json")
      : provider === "claude"
        ? path.join(".claude", ".credentials.json")
        : path.join(`.${provider}`, "auth.json");
  const authPath = path.join(profileHome, relativePath);
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  const payload =
    provider === "codex"
      ? { tokens: { access_token: "test-access", account_id: "test-account" } }
      : provider === "claude"
        ? { claudeAiOauth: { accessToken: "test-access", refreshToken: "test-refresh" } }
        : provider === "gemini"
          ? { access_token: "test-access", refresh_token: "test-refresh" }
          : { access_token: "test-access", refresh_token: "test-refresh" };
  fs.writeFileSync(authPath, JSON.stringify(payload), "utf8");
}

function registerConnectedPool(
  harness: RuntimeHarness,
  provider: "codex" | "claude" | "gemini" | "jules",
  poolId = `${provider}-main`,
): string {
  const profileHome = path.join(harness.logsDir, "office-accounts", provider, poolId);
  fs.mkdirSync(profileHome, { recursive: true });
  writeAuthArtifact(profileHome, provider);
  harness.db
    .prepare(
      `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'connected', 1, 1)`,
    )
    .run(randomUUID(), provider, poolId, poolId, profileHome);
  return profileHome;
}

async function waitForClose(
  child: { on: (event: "close", listener: (code: number | null) => void) => void },
  timeoutMs = 5_000,
) {
  await Promise.race([
    new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code));
    }),
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`child did not close within ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
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
        "process.stdout.write(`ENV_UNRELATED_SECRET=${process.env.DONGGRI_TEST_SECRET ?? ''}\\n`);",
      ].join("\n"),
      "utf8",
    );
    const profileHome = path.join(harness.logsDir, "office-accounts", "codex", "codex-main");
    fs.mkdirSync(profileHome, { recursive: true });
    writeAuthArtifact(profileHome, "codex");
    harness.db
      .prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
         VALUES (?, 'codex', 'codex-main', 'Main Codex', ?, 'connected', 1, 1)`,
      )
      .run(randomUUID(), profileHome);

    const logs: string[] = [];
    const previousSentinel = process.env.DONGGRI_TEST_SECRET;
    process.env.DONGGRI_TEST_SECRET = "must-not-reach-child";
    cleanups.push(() => {
      if (typeof previousSentinel === "string") process.env.DONGGRI_TEST_SECRET = previousSentinel;
      else delete process.env.DONGGRI_TEST_SECRET;
    });
    const spawnSpy = vi.fn((executable: string, argv: readonly string[], options: any) =>
      spawn(executable, [...argv], options),
    ) as unknown as typeof spawn;
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
          if (process.platform === "win32") {
            execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
          } else {
            process.kill(pid);
          }
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
      spawnProcess: spawnSpy,
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
    expect(logText).toContain("ENV_UNRELATED_SECRET=");
    expect(logText).not.toContain("must-not-reach-child");
    expect(logText).toContain("shell=false");
    expect(logs.some((entry) => entry.includes("RUN FAILED"))).toBe(false);
    expect(fs.readdirSync(harness.logsDir).filter((name) => name.endsWith(".prompt.txt"))).toEqual([]);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });

  it("normalizes legacy app-scoped profile_home to repo-scoped office account directory", () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const originalCwd = process.cwd();
    const repoRoot = path.join(harness.logsDir, "repo-root");
    const repoProfileHome = path.join(repoRoot, "data", "office-accounts", "codex", "codex-main");
    fs.mkdirSync(repoProfileHome, { recursive: true });
    writeAuthArtifact(repoProfileHome, "codex");
    process.chdir(repoRoot);
    cleanups.push(() => process.chdir(originalCwd));

    harness.db
      .prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
         VALUES (?, 'codex', 'codex-main', 'Main Codex', ?, 'connected', 1, 1)`,
      )
      .run(randomUUID(), "G:\\app\\.office-accounts\\codex\\codex-main");

    const resolved = resolveCliAccountPoolEnv({
      db: harness.db as any,
      provider: "codex",
      cliAccountPoolId: "codex-main",
      platform: "win32",
      profileRoot: path.join(repoRoot, "data", "office-accounts"),
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(path.normalize(resolved.profileHome ?? "")).toBe(path.normalize(repoProfileHome));
      expect(path.normalize(resolved.envPatch.HOME ?? "")).toBe(path.normalize(repoProfileHome));
    }
  });

  it("fails closed instead of inheriting process HOME when no authoritative pool exists", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const scriptPath = path.join(harness.logsDir, "print-home.js");
    fs.writeFileSync(
      scriptPath,
      [
        "process.stdout.write(`ENV_HOME=${process.env.HOME ?? ''}\\n`);",
        "process.stdout.write(`ENV_USERPROFILE=${process.env.USERPROFILE ?? ''}\\n`);",
      ].join("\n"),
      "utf8",
    );

    const previousHome = process.env.HOME;
    const forcedHome = path.join(harness.logsDir, "default-home");
    fs.mkdirSync(forcedHome, { recursive: true });
    process.env.HOME = forcedHome;
    cleanups.push(() => {
      if (typeof previousHome === "string") process.env.HOME = previousHome;
      else delete process.env.HOME;
    });

    const spawnSpy = vi.fn() as unknown as typeof spawn;
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
          if (process.platform === "win32") {
            execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
          } else {
            process.kill(pid);
          }
        } catch {
          // ignore
        }
      },
      appendTaskLog: () => {},
      activeProcesses: new Map(),
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
      spawnProcess: spawnSpy,
    });

    const logPath = path.join(harness.logsDir, "task-2.log");
    const child = runtime.spawnCliAgent("task-2", "codex", "test prompt", harness.logsDir, logPath);
    await waitForClose(child);
    const logText = fs.readFileSync(logPath, "utf8");

    expect(logText).toContain("RUN FAILED (cli account pool)");
    expect(logText).toContain("authoritative_cli_account_pool_required: provider=codex");
    expect(logText).not.toContain(`ENV_HOME=${forcedHome}`);
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("fails before provider argument construction when the explicit Claude pool is absent", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    let buildAgentArgsCalls = 0;
    const taskLogs: string[] = [];
    const runtime = createCliRuntimeTools({
      db: harness.db as any,
      logsDir: harness.logsDir,
      buildAgentArgs: () => {
        buildAgentArgsCalls += 1;
        return ["node", "-e", "process.stdout.write('should-not-run')"];
      },
      clearCliOutputDedup: () => {},
      normalizeStreamChunk: (chunk: Buffer | string) => String(chunk),
      shouldSkipDuplicateCliOutput: () => false,
      broadcast: () => {},
      TASK_RUN_IDLE_TIMEOUT_MS: 0,
      TASK_RUN_HARD_TIMEOUT_MS: 0,
      killPidTree: () => {},
      appendTaskLog: (_taskId, _kind, message) => {
        taskLogs.push(message);
      },
      activeProcesses: new Map(),
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
    });

    const logPath = path.join(harness.logsDir, "task-claude-explicit-pool.log");
    const child = runtime.spawnCliAgent(
      "task-claude-explicit-pool",
      "claude",
      "test prompt",
      harness.logsDir,
      logPath,
      undefined,
      undefined,
      "claude-main",
    );
    await waitForClose(child);
    const logText = fs.readFileSync(logPath, "utf8");

    expect(buildAgentArgsCalls).toBe(0);
    expect(logText).toContain("RUN FAILED (cli account pool)");
    expect(logText).toContain("cli_account_pool_not_found: provider=claude account_pool_id=claude-main");
    expect(logText).not.toContain("should-not-run");
    expect(taskLogs.some((entry) => entry.includes("cli_account_pool_not_found"))).toBe(true);
  });

  it("denies G-PROVIDER-LIVE by default without invoking the injected or OS spawn path", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());
    registerConnectedPool(harness, "codex");
    const previousBypass = process.env.G_PROVIDER_LIVE;
    process.env.G_PROVIDER_LIVE = "true";
    cleanups.push(() => {
      if (typeof previousBypass === "string") process.env.G_PROVIDER_LIVE = previousBypass;
      else delete process.env.G_PROVIDER_LIVE;
    });
    const spawnSpy = vi.fn() as unknown as typeof spawn;
    const activeProcesses = new Map();
    const runtime = createCliRuntimeToolsBase({
      db: harness.db as any,
      logsDir: harness.logsDir,
      buildAgentArgs: () => ["node", "-e", "process.stdout.write('must-not-run')"],
      clearCliOutputDedup: () => {},
      normalizeStreamChunk: (chunk: Buffer | string) => String(chunk),
      shouldSkipDuplicateCliOutput: () => false,
      broadcast: () => {},
      TASK_RUN_IDLE_TIMEOUT_MS: 0,
      TASK_RUN_HARD_TIMEOUT_MS: 0,
      killPidTree: () => {},
      appendTaskLog: () => {},
      activeProcesses,
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
      resolveExecutable: resolveTestNodeExecutable,
      spawnProcess: spawnSpy,
      cliAccountProfileRoot: path.join(harness.logsDir, "office-accounts"),
    });

    const logPath = path.join(harness.logsDir, "task-live-gate-denied.log");
    const child = runtime.spawnCliAgent(
      "task-live-gate-denied",
      "codex",
      "test prompt",
      harness.logsDir,
      logPath,
      undefined,
      undefined,
      "codex-main",
    );
    let closeCount = 0;
    child.on("close", () => {
      closeCount += 1;
    });
    await waitForClose(child);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(spawnSpy).not.toHaveBeenCalled();
    expect(activeProcesses.size).toBe(0);
    expect(child.pid).toBeUndefined();
    expect(closeCount).toBe(1);
    expect(fs.readFileSync(logPath, "utf8")).toContain(`RUN FAILED (approval): ${PROVIDER_LIVE_EXECUTION_GATE_ID}`);
  });

  it("runs a fake Claude child only through its authoritative isolated profile", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());
    const profileHome = registerConnectedPool(harness, "claude");
    const scriptPath = path.join(harness.logsDir, "print-claude-env.js");
    fs.writeFileSync(
      scriptPath,
      [
        "process.stdout.write(`ENV_HOME=${process.env.HOME ?? ''}\\n`);",
        "process.stdout.write(`ENV_CLAUDECODE=${process.env.CLAUDECODE ?? ''}\\n`);",
      ].join("\n"),
      "utf8",
    );
    const previousNested = process.env.CLAUDECODE;
    process.env.CLAUDECODE = "must-not-reach-child";
    cleanups.push(() => {
      if (typeof previousNested === "string") process.env.CLAUDECODE = previousNested;
      else delete process.env.CLAUDECODE;
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
      killPidTree: () => {},
      appendTaskLog: () => {},
      activeProcesses: new Map(),
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
    });

    const logPath = path.join(harness.logsDir, "task-claude-isolated.log");
    const child = runtime.spawnCliAgent(
      "task-claude-isolated",
      "claude",
      "test prompt",
      harness.logsDir,
      logPath,
      undefined,
      undefined,
      "claude-main",
    );
    await waitForClose(child);
    const logText = fs.readFileSync(logPath, "utf8");

    expect(logText).toContain(`ENV_HOME=${profileHome}`);
    expect(logText).toContain("ENV_CLAUDECODE=");
    expect(logText).not.toContain("must-not-reach-child");
    expect(logText).not.toContain("RUN FAILED");
  });

  it("returns a rejected child without invoking spawn when executable resolution fails", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());
    registerConnectedPool(harness, "codex");
    const spawnSpy = vi.fn() as unknown as typeof spawn;
    const runtime = createCliRuntimeToolsBase({
      db: harness.db as any,
      logsDir: harness.logsDir,
      buildAgentArgs: () => ["codex", "exec"],
      clearCliOutputDedup: () => {},
      normalizeStreamChunk: (chunk: Buffer | string) => String(chunk),
      shouldSkipDuplicateCliOutput: () => false,
      broadcast: () => {},
      TASK_RUN_IDLE_TIMEOUT_MS: 0,
      TASK_RUN_HARD_TIMEOUT_MS: 0,
      killPidTree: () => {},
      appendTaskLog: () => {},
      activeProcesses: new Map(),
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
      providerLiveExecutionGate: approveTestProviderExecution,
      resolveExecutable: () => ({ ok: false as const, reason: "executable_not_found: codex" }),
      spawnProcess: spawnSpy,
      cliAccountProfileRoot: path.join(harness.logsDir, "office-accounts"),
    });

    const logPath = path.join(harness.logsDir, "task-resolver-failed.log");
    const child = runtime.spawnCliAgent(
      "task-resolver-failed",
      "codex",
      "test prompt",
      harness.logsDir,
      logPath,
      undefined,
      undefined,
      "codex-main",
    );
    await waitForClose(child);

    expect(spawnSpy).not.toHaveBeenCalled();
    expect(fs.readFileSync(logPath, "utf8")).toContain("RUN FAILED (executable): executable_not_found: codex");
  });

  it("auto-assigns single connected pool when cli account pool is not specified", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const scriptPath = path.join(harness.logsDir, "print-auto-home.js");
    fs.writeFileSync(
      scriptPath,
      [
        "process.stdout.write(`ENV_HOME=${process.env.HOME ?? ''}\\n`);",
        "process.stdout.write(`ENV_USERPROFILE=${process.env.USERPROFILE ?? ''}\\n`);",
      ].join("\n"),
      "utf8",
    );
    const profileHome = path.join(harness.logsDir, "office-accounts", "gemini", "gemini-main");
    fs.mkdirSync(profileHome, { recursive: true });
    writeAuthArtifact(profileHome, "gemini");
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

    const isolatedRunRoot = path.join(harness.logsDir, ".cli-homes", "gemini");
    const isolatedRunHome = logText.match(/ENV_HOME=([^\n\r]*)/u)?.[1] ?? "";
    expect(isolatedRunHome.startsWith(path.join(isolatedRunRoot, "task-3--gemini-main--"))).toBe(true);
    if (process.platform === "win32") expect(logText).toContain(`ENV_USERPROFILE=${isolatedRunHome}`);
    expect(logText).not.toContain(`ENV_HOME=${profileHome}`);
    expect(logText).toContain("provider=gemini");
    expect(logText).toContain("selected_by=auto");
  });

  it("auto-selects one connected pool when multiple pools exist and no explicit selection is provided", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const profileA = path.join(harness.logsDir, "office-accounts", "codex", "codex-a");
    const profileB = path.join(harness.logsDir, "office-accounts", "codex", "codex-b");
    fs.mkdirSync(profileA, { recursive: true });
    fs.mkdirSync(profileB, { recursive: true });
    writeAuthArtifact(profileA, "codex");
    writeAuthArtifact(profileB, "codex");
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

  it("uses a fresh pool-bound Gemini run home when the same task changes account pools", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());
    registerConnectedPool(harness, "gemini", "gemini-a");
    registerConnectedPool(harness, "gemini", "gemini-b");
    const scriptPath = path.join(harness.logsDir, "print-gemini-pool-home.js");
    fs.writeFileSync(scriptPath, "process.stdout.write(`ENV_HOME=${process.env.HOME ?? ''}\\n`);", "utf8");
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
      killPidTree: () => {},
      appendTaskLog: () => {},
      activeProcesses: new Map(),
      createSubtaskFromCli: () => {},
      completeSubtaskFromCli: () => {},
    });

    const homes: string[] = [];
    for (const poolId of ["gemini-a", "gemini-b"]) {
      const logPath = path.join(harness.logsDir, `${poolId}.log`);
      const child = runtime.spawnCliAgent(
        "same-task",
        "gemini",
        "test prompt",
        harness.logsDir,
        logPath,
        undefined,
        undefined,
        poolId,
      );
      await waitForClose(child);
      homes.push(fs.readFileSync(logPath, "utf8").match(/ENV_HOME=([^\n\r]*)/u)?.[1] ?? "");
    }

    expect(homes[0]).toContain("same-task--gemini-a--");
    expect(homes[1]).toContain("same-task--gemini-b--");
    expect(homes[0]).not.toBe(homes[1]);
  });

  it.runIf(process.platform === "win32")(
    "rejects a Gemini run-root junction before copying credentials or invoking spawn",
    async () => {
      const harness = createHarness();
      cleanups.push(() => harness.close());
      registerConnectedPool(harness, "gemini", "gemini-main");
      const junctionTarget = path.join(harness.logsDir, "junction-target");
      const runRoot = path.join(harness.logsDir, ".cli-homes", "gemini");
      fs.mkdirSync(junctionTarget, { recursive: true });
      fs.mkdirSync(path.dirname(runRoot), { recursive: true });
      try {
        fs.symlinkSync(junctionTarget, runRoot, "junction");
      } catch {
        return;
      }
      const spawnSpy = vi.fn() as unknown as typeof spawn;
      const runtime = createCliRuntimeTools({
        db: harness.db as any,
        logsDir: harness.logsDir,
        buildAgentArgs: () => ["node", "--version"],
        clearCliOutputDedup: () => {},
        normalizeStreamChunk: (chunk: Buffer | string) => String(chunk),
        shouldSkipDuplicateCliOutput: () => false,
        broadcast: () => {},
        TASK_RUN_IDLE_TIMEOUT_MS: 0,
        TASK_RUN_HARD_TIMEOUT_MS: 0,
        killPidTree: () => {},
        appendTaskLog: () => {},
        activeProcesses: new Map(),
        createSubtaskFromCli: () => {},
        completeSubtaskFromCli: () => {},
        spawnProcess: spawnSpy,
      });

      const logPath = path.join(harness.logsDir, "gemini-junction.log");
      const child = runtime.spawnCliAgent(
        "gemini-junction",
        "gemini",
        "test prompt",
        harness.logsDir,
        logPath,
        undefined,
        undefined,
        "gemini-main",
      );
      await waitForClose(child);

      expect(spawnSpy).not.toHaveBeenCalled();
      expect(fs.readFileSync(logPath, "utf8")).toContain("gemini_run_root_reparse_rejected");
      expect(fs.readdirSync(junctionTarget)).toEqual([]);
    },
  );

  it("fails when jules pool is not explicitly selected", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const profileHome = path.join(harness.logsDir, "office-accounts", "jules", "jules-main");
    fs.mkdirSync(profileHome, { recursive: true });
    writeAuthArtifact(profileHome, "jules");
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

  it("fails before execution when selected pool has no auth artifact", () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());

    const profileHome = path.join(harness.logsDir, "office-accounts", "codex", "codex-main");
    fs.mkdirSync(profileHome, { recursive: true });
    harness.db
      .prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
         VALUES (?, 'codex', 'codex-main', 'Main Codex', ?, 'connected', 1, 1)`,
      )
      .run(randomUUID(), profileHome);

    const resolved = resolveCliAccountPoolEnv({
      db: harness.db as any,
      provider: "codex",
      cliAccountPoolId: "codex-main",
      platform: "win32",
      profileRoot: path.join(harness.logsDir, "office-accounts"),
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toContain("auth_artifact_missing");
    }
  });

  it("terminates a lingering codex process after final agent output", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());
    registerConnectedPool(harness, "codex");

    const previousGrace = process.env.TASK_RUN_FINAL_OUTPUT_GRACE_MS;
    process.env.TASK_RUN_FINAL_OUTPUT_GRACE_MS = "50";
    cleanups.push(() => {
      if (typeof previousGrace === "string") process.env.TASK_RUN_FINAL_OUTPUT_GRACE_MS = previousGrace;
      else delete process.env.TASK_RUN_FINAL_OUTPUT_GRACE_MS;
    });

    const scriptPath = path.join(harness.logsDir, "linger-after-final.js");
    fs.writeFileSync(
      scriptPath,
      [
        "const final = { type: 'item.completed', item: { type: 'agent_message', text: 'Done.' } };",
        "process.stdout.write(`${JSON.stringify(final)}\\n`);",
        "setInterval(() => {}, 1000);",
      ].join("\n"),
      "utf8",
    );

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
          if (process.platform === "win32") {
            execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
          } else {
            process.kill(pid);
          }
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

    const logPath = path.join(harness.logsDir, "task-linger.log");
    const child = runtime.spawnCliAgent(
      "task-linger",
      "codex",
      "test prompt",
      harness.logsDir,
      logPath,
      undefined,
      undefined,
      "codex-main",
    );
    await waitForClose(child, 5_000);
    const logText = fs.readFileSync(logPath, "utf8");

    expect((child as any).__clawForcedAfterFinalOutput).toBe(true);
    expect(logText).toContain("RUN FINAL OUTPUT OBSERVED");
    expect(taskLogs.some((entry) => entry.includes("RUN FINAL OUTPUT OBSERVED"))).toBe(true);
  });

  it("does not treat a non-completion agent message as successful final output", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());
    registerConnectedPool(harness, "codex");

    const previousGrace = process.env.TASK_RUN_FINAL_OUTPUT_GRACE_MS;
    process.env.TASK_RUN_FINAL_OUTPUT_GRACE_MS = "40";
    cleanups.push(() => {
      if (typeof previousGrace === "string") process.env.TASK_RUN_FINAL_OUTPUT_GRACE_MS = previousGrace;
      else delete process.env.TASK_RUN_FINAL_OUTPUT_GRACE_MS;
    });

    const scriptPath = path.join(harness.logsDir, "linger-after-non-final-message.js");
    fs.writeFileSync(
      scriptPath,
      [
        "const msg = { type: 'item.completed', item: { type: 'agent_message', text: 'I found corrupted docs and will apply a follow-up patch.' } };",
        "process.stdout.write(`${JSON.stringify(msg)}\\n`);",
        "setInterval(() => {}, 1000);",
      ].join("\n"),
      "utf8",
    );

    const taskLogs: string[] = [];
    const runtime = createCliRuntimeTools({
      db: harness.db as any,
      logsDir: harness.logsDir,
      buildAgentArgs: () => ["node", scriptPath],
      clearCliOutputDedup: () => {},
      normalizeStreamChunk: (chunk: Buffer | string) => String(chunk),
      shouldSkipDuplicateCliOutput: () => false,
      broadcast: () => {},
      TASK_RUN_IDLE_TIMEOUT_MS: 120,
      TASK_RUN_HARD_TIMEOUT_MS: 0,
      killPidTree: (pid: number) => {
        try {
          if (process.platform === "win32") {
            execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
          } else {
            process.kill(pid);
          }
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

    const logPath = path.join(harness.logsDir, "task-linger-non-final.log");
    const child = runtime.spawnCliAgent(
      "task-linger-non-final",
      "codex",
      "test prompt",
      harness.logsDir,
      logPath,
      undefined,
      undefined,
      "codex-main",
    );
    await waitForClose(child, 5_000);
    const logText = fs.readFileSync(logPath, "utf8");

    expect((child as any).__clawForcedAfterFinalOutput).not.toBe(true);
    expect(logText).not.toContain("RUN FINAL OUTPUT OBSERVED");
    expect(taskLogs.some((entry) => entry.includes("RUN FINAL OUTPUT OBSERVED"))).toBe(false);
    expect(taskLogs.some((entry) => entry.includes("RUN TIMEOUT"))).toBe(true);
  });

  it("does not reset idle timeout for ignorable Codex CLI noise", async () => {
    const harness = createHarness();
    cleanups.push(() => harness.close());
    registerConnectedPool(harness, "codex");

    const scriptPath = path.join(harness.logsDir, "codex-noise-only.js");
    fs.writeFileSync(
      scriptPath,
      [
        "setInterval(() => {",
        "  process.stderr.write('2026-05-08T03:34:43.000000Z ERROR codex_models_manager::manager: failed to refresh model catalog\\n');",
        "}, 20);",
      ].join("\n"),
      "utf8",
    );

    const cliTools = createCliTools({
      nowMs: () => Date.now(),
      cliOutputDedupWindowMs: 0,
    });
    const taskLogs: string[] = [];
    const runtime = createCliRuntimeTools({
      db: harness.db as any,
      logsDir: harness.logsDir,
      buildAgentArgs: () => ["node", scriptPath],
      clearCliOutputDedup: cliTools.clearCliOutputDedup,
      normalizeStreamChunk: cliTools.normalizeStreamChunk,
      shouldSkipDuplicateCliOutput: cliTools.shouldSkipDuplicateCliOutput,
      broadcast: () => {},
      TASK_RUN_IDLE_TIMEOUT_MS: 140,
      TASK_RUN_HARD_TIMEOUT_MS: 0,
      killPidTree: (pid: number) => {
        try {
          if (process.platform === "win32") {
            execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
          } else {
            process.kill(pid);
          }
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

    const logPath = path.join(harness.logsDir, "task-codex-noise-only.log");
    const child = runtime.spawnCliAgent(
      "task-codex-noise-only",
      "codex",
      "test prompt",
      harness.logsDir,
      logPath,
      undefined,
      undefined,
      "codex-main",
    );
    await waitForClose(child, 5_000);
    const logText = fs.readFileSync(logPath, "utf8");

    expect(logText).not.toContain("codex_models_manager::manager");
    expect(taskLogs.some((entry) => entry.includes("RUN TIMEOUT"))).toBe(true);
    expect((child as any).__clawForcedAfterFinalOutput).not.toBe(true);
  });
});
