import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn, type SpawnOptions } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOneShotRunner } from "./one-shot-runner.ts";
import { PROVIDER_LIVE_EXECUTION_GATE_ID } from "../agents/cli-runtime.ts";
import { resolveHostExecutable } from "../agents/host-executable-resolver.ts";

type Harness = {
  db: DatabaseSync;
  root: string;
  profileHome: string;
};

const harnesses: Harness[] = [];
const originalSecret = process.env.DONGGRI_ONE_SHOT_SECRET;
const originalLiveGateEnv = process.env.G_PROVIDER_LIVE;

function createHarness(): Harness {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "one-shot-runner-"));
  const profileHome = path.join(root, "office-accounts", "codex", "codex-main");
  const authPath = path.join(profileHome, ".codex", "auth.json");
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(
    authPath,
    JSON.stringify({ tokens: { access_token: "test-access", account_id: "test-account" } }),
    "utf8",
  );
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE cli_account_pools (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      account_pool_id TEXT NOT NULL,
      label TEXT,
      profile_home TEXT NOT NULL,
      status TEXT NOT NULL,
      last_verified_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.prepare(
    `INSERT INTO cli_account_pools
     (id, provider, account_pool_id, label, profile_home, status, last_verified_at, created_at, updated_at)
     VALUES (?, 'codex', 'codex-main', 'Codex Main', ?, 'connected', 1, 1, 1)`,
  ).run(randomUUID(), profileHome);
  const harness = { db, root, profileHome };
  harnesses.push(harness);
  return harness;
}

function makeRunner(
  harness: Harness,
  buildAgentArgs: () => string[],
  spawnProcess: typeof spawn,
  approveLiveExecution = true,
  terminationAckTimeoutMs = 50,
  killPidTree: (pid: number) => void = () => {},
) {
  return createOneShotRunner({
    db: harness.db,
    logsDir: harness.root,
    broadcast: () => {},
    getProviderModelConfig: () => ({}),
    executeApiProviderAgent: async () => {},
    executeCopilotAgent: async () => {},
    executeAntigravityAgent: async () => {},
    killPidTree,
    prettyStreamJson: (raw) => raw,
    getPreferredLanguage: () => "ko",
    normalizeStreamChunk: (raw) => String(raw),
    hasStructuredJsonLines: () => false,
    normalizeConversationReply: (raw) => raw.trim(),
    buildAgentArgs,
    withCliPathFallback: (value) => value ?? process.env.PATH ?? "",
    spawnProcess,
    providerLiveExecutionGate: approveLiveExecution
      ? (request) => request.gateId === PROVIDER_LIVE_EXECUTION_GATE_ID
      : undefined,
    resolveExecutable: (input) => resolveHostExecutable({ ...input, allowedCommands: ["node"] }),
    terminationAckTimeoutMs,
    cliAccountProfileRoot: path.join(harness.root, "office-accounts"),
  });
}

afterEach(() => {
  if (typeof originalSecret === "string") process.env.DONGGRI_ONE_SHOT_SECRET = originalSecret;
  else delete process.env.DONGGRI_ONE_SHOT_SECRET;
  if (typeof originalLiveGateEnv === "string") process.env.G_PROVIDER_LIVE = originalLiveGateEnv;
  else delete process.env.G_PROVIDER_LIVE;
  while (harnesses.length > 0) {
    const harness = harnesses.pop()!;
    harness.db.close();
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});

describe("createOneShotRunner host-native execution", () => {
  it("passes metacharacters only as literal argv with shell:false and a minimal environment", async () => {
    const harness = createHarness();
    process.env.DONGGRI_ONE_SHOT_SECRET = "must-not-reach-child";
    const calls: Array<{ executable: string; argv: readonly string[]; options: SpawnOptions }> = [];
    const spawnSpy = vi.fn((executable: string, argv: readonly string[], options: SpawnOptions) => {
      calls.push({ executable, argv: [...argv], options });
      return spawn(executable, [...argv], options);
    }) as unknown as typeof spawn;
    const literalArgument = "literal & whoami | echo injected";
    const script = [
      "process.stdout.write(`ARG=${process.argv[1] ?? ''}\\n`);",
      "process.stdout.write(`SECRET=${process.env.DONGGRI_ONE_SHOT_SECRET ?? ''}\\n`);",
    ].join("");
    const runner = makeRunner(harness, () => ["node", "-e", script, literalArgument], spawnSpy as typeof spawn);

    const result = await runner.runAgentOneShot(
      { id: "agent-1", cli_provider: "codex", cli_account_pool_id: "codex-main" } as any,
      "test prompt",
      { projectPath: harness.root, timeoutMs: 5_000 },
    );

    expect(result.error).toBeUndefined();
    expect(result.text).toContain(`ARG=${literalArgument}`);
    expect(result.text).toContain("SECRET=");
    expect(result.text).not.toContain("must-not-reach-child");
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(calls[0].executable).toBe(fs.realpathSync.native(process.execPath));
    expect(calls[0].argv).toContain(literalArgument);
    expect(calls[0].options.shell).toBe(false);
    expect(calls[0].options.env).toMatchObject({ HOME: harness.profileHome });
    expect((calls[0].options.env as NodeJS.ProcessEnv).DONGGRI_ONE_SHOT_SECRET).toBeUndefined();
  });

  it("rejects command-token metacharacters before spawn", async () => {
    const harness = createHarness();
    const spawnSpy = vi.fn() as unknown as typeof spawn;
    const runner = makeRunner(harness, () => ["node & whoami", "--version"], spawnSpy);

    const result = await runner.runAgentOneShot(
      { id: "agent-2", cli_provider: "codex", cli_account_pool_id: "codex-main" } as any,
      "test prompt",
      { projectPath: harness.root, timeoutMs: 5_000 },
    );

    expect(spawnSpy).not.toHaveBeenCalled();
    expect(result.error).toContain("executable_command_metacharacter_rejected");
  });

  it("requires the injected G-PROVIDER-LIVE approval even when an environment flag is set", async () => {
    const harness = createHarness();
    process.env.G_PROVIDER_LIVE = "true";
    const spawnSpy = vi.fn() as unknown as typeof spawn;
    const runner = makeRunner(harness, () => ["node", "--version"], spawnSpy, false);

    const result = await runner.runAgentOneShot(
      { id: "agent-gate-denied", cli_provider: "codex", cli_account_pool_id: "codex-main" } as any,
      "test prompt",
      { projectPath: harness.root, timeoutMs: 5_000 },
    );

    expect(spawnSpy).not.toHaveBeenCalled();
    expect(result.error).toContain(`provider live execution approval required: ${PROVIDER_LIVE_EXECUTION_GATE_ID}`);
  });

  it("does not convert nonzero provider output into a successful one-shot result", async () => {
    const harness = createHarness();
    const spawnSpy = vi.fn((executable: string, argv: readonly string[], options: SpawnOptions) =>
      spawn(executable, [...argv], options),
    ) as unknown as typeof spawn;
    const runner = makeRunner(
      harness,
      () => ["node", "-e", "process.stdout.write('partial output'); process.exit(7);"],
      spawnSpy,
    );

    const result = await runner.runAgentOneShot(
      { id: "agent-nonzero", cli_provider: "codex", cli_account_pool_id: "codex-main" } as any,
      "test prompt",
      { projectPath: harness.root, timeoutMs: 5_000 },
    );

    expect(result.text).toContain("partial output");
    expect(result.error).toBe("codex exited with code 7");
  });

  it("returns an explicit error when a no-tools run emits a tool signal", async () => {
    const harness = createHarness();
    let spawnedChild: ReturnType<typeof spawn> | null = null;
    const spawnSpy = vi.fn((executable: string, argv: readonly string[], options: SpawnOptions) => {
      spawnedChild = spawn(executable, [...argv], options);
      return spawnedChild;
    }) as unknown as typeof spawn;
    const script =
      "process.stdout.write(JSON.stringify({type:'tool_use',toolName:'shell'})+'\\n'); setInterval(() => {}, 1000);";
    const runner = makeRunner(
      harness,
      () => ["node", "-e", script],
      spawnSpy,
      true,
      500,
      () => {
        spawnedChild?.kill("SIGTERM");
      },
    );

    const result = await runner.runAgentOneShot(
      { id: "agent-no-tools", cli_provider: "codex", cli_account_pool_id: "codex-main" } as any,
      "test prompt",
      { projectPath: harness.root, timeoutMs: 5_000, noTools: true },
    );

    expect(result.text).toContain("tool_use");
    expect(result.error).toBe("tool_use_blocked_by_no_tools_policy");
  });

  it("retains an unconfirmed child handle until a delayed close acknowledgement arrives", async () => {
    const harness = createHarness();
    const fakeChild = new EventEmitter() as any;
    fakeChild.pid = 43210;
    fakeChild.stdin = new PassThrough();
    fakeChild.stdout = new PassThrough();
    fakeChild.stderr = new PassThrough();
    fakeChild.kill = vi.fn(() => false);
    const spawnSpy = vi.fn(() => fakeChild) as unknown as typeof spawn;
    const runner = makeRunner(harness, () => ["node", "--version"], spawnSpy, true, 25);

    const result = await runner.runAgentOneShot(
      { id: "agent-timeout", cli_provider: "codex", cli_account_pool_id: "codex-main" } as any,
      "test prompt",
      { projectPath: harness.root, timeoutMs: 5 },
    );

    expect(result.error).toContain("termination_unconfirmed");
    expect(runner.getUnconfirmedTerminationCount()).toBe(1);
    fakeChild.emit("close", null);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(runner.getUnconfirmedTerminationCount()).toBe(0);
  });
});
