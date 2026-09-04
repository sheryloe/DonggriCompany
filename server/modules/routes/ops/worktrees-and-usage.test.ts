import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWorktreeLifecycleTools } from "../../workflow/core/worktree/lifecycle.ts";
import { registerWorktreeAndUsageRoutes, runJulesSessionListWithHostIsolation } from "./worktrees-and-usage.ts";

type RouteHandler = (req: any, res: any) => any;

type FakeResponse = {
  statusCode: number;
  payload: unknown;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
};

describe("runJulesSessionListWithHostIsolation", () => {
  it("uses an authoritative profile, minimal environment, resolved argv, and shell:false", async () => {
    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jules-session-isolation-"));
    const profileHome = path.join(profileRoot, "jules", "jules-main");
    fs.mkdirSync(profileHome, { recursive: true });
    const calls: Array<{ executable: string; argv: readonly string[]; options: any }> = [];
    const fakeExecutable = process.platform === "win32" ? "C:\\safe\\jules.exe" : "/safe/jules";
    try {
      const output = await runJulesSessionListWithHostIsolation(profileHome, {
        accountPoolId: "jules-main",
        profileRoot,
        sourceEnv: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          DONGGRI_JULES_SECRET: "must-not-reach-child",
        },
        platform: process.platform,
        resolveExecutable: ((input: any) => ({
          ok: true,
          executable: fakeExecutable,
          argv: [...(input.argv ?? [])],
          commandPath: fakeExecutable,
          source: "native",
          shell: false,
        })) as any,
        execFile: ((executable: string, argv: readonly string[], options: any, callback: any) => {
          calls.push({ executable, argv: [...argv], options });
          queueMicrotask(() => callback(null, '{"sessions":[]}', ""));
          return {};
        }) as any,
        providerLiveExecutionGate: (request) => request.gateId === "G-PROVIDER-LIVE",
      });

      expect(output).toBe('{"sessions":[]}');
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        executable: fakeExecutable,
        argv: ["remote", "list", "--session"],
        options: { shell: false },
      });
      expect(calls[0].options.env.HOME).toBe(fs.realpathSync.native(profileHome));
      expect(calls[0].options.env.DONGGRI_JULES_SECRET).toBeUndefined();
    } finally {
      fs.rmSync(profileRoot, { recursive: true, force: true });
    }
  });

  it("rejects external profiles and environment-only approval before exec", async () => {
    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jules-session-root-"));
    const outsideHome = fs.mkdtempSync(path.join(os.tmpdir(), "jules-session-outside-"));
    const execFile = vi.fn();
    process.env.G_PROVIDER_LIVE = "true";
    try {
      await expect(
        runJulesSessionListWithHostIsolation(outsideHome, {
          accountPoolId: "jules-main",
          profileRoot,
          resolveExecutable: (() => ({
            ok: true,
            executable: process.platform === "win32" ? "C:\\safe\\jules.exe" : "/safe/jules",
            argv: [],
            commandPath: "jules",
            source: "native",
            shell: false,
          })) as any,
          execFile: execFile as any,
        }),
      ).rejects.toThrow("jules_profile_home_authority_mismatch");
      const canonicalHome = path.join(profileRoot, "jules", "jules-main");
      fs.mkdirSync(canonicalHome, { recursive: true });
      await expect(
        runJulesSessionListWithHostIsolation(canonicalHome, {
          accountPoolId: "jules-main",
          profileRoot,
          resolveExecutable: (() => ({
            ok: true,
            executable: process.platform === "win32" ? "C:\\safe\\jules.exe" : "/safe/jules",
            argv: [],
            commandPath: "jules",
            source: "native",
            shell: false,
          })) as any,
          execFile: execFile as any,
        }),
      ).rejects.toThrow("G-PROVIDER-LIVE");
      expect(execFile).not.toHaveBeenCalled();
    } finally {
      delete process.env.G_PROVIDER_LIVE;
      fs.rmSync(profileRoot, { recursive: true, force: true });
      fs.rmSync(outsideHome, { recursive: true, force: true });
    }
  });
});

function createFakeResponse(): FakeResponse {
  return {
    statusCode: 200,
    payload: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: "pipe", timeout: 15000 }).toString().trim();
}

function initRepo(basePrefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), basePrefix));
  try {
    runGit(dir, ["init", "-b", "main"]);
  } catch {
    runGit(dir, ["init"]);
    runGit(dir, ["checkout", "-B", "main"]);
  }
  runGit(dir, ["config", "user.name", "Claw-Empire Test"]);
  runGit(dir, ["config", "user.email", "claw-empire-test@example.local"]);
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n", "utf8");
  runGit(dir, ["add", "."]);
  runGit(dir, ["commit", "-m", "seed"]);
  return dir;
}

function createHarness(
  taskWorktrees: Map<string, { worktreePath: string; branchName: string; projectPath: string }>,
  deps: {
    runJulesSessionList?: (profileHome: string, accountPoolId: string) => Promise<string>;
    cliAccountProfileRoot?: string;
  } = {},
) {
  const appendLogCalls: Array<{ taskId: string | null; kind: string; message: string }> = [];
  const getRoutes = new Map<string, RouteHandler>();
  const postRoutes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, handler: RouteHandler) {
      getRoutes.set(path, handler);
      return this;
    },
    post(path: string, handler: RouteHandler) {
      postRoutes.set(path, handler);
      return this;
    },
  };

  const db = new DatabaseSync(":memory:");
  registerWorktreeAndUsageRoutes(
    {
      app: app as any,
      taskWorktrees,
      mergeWorktree: () => ({ success: true, message: "merged", conflicts: [] }),
      cleanupWorktree: () => {},
      appendTaskLog: (taskId: string | null, kind: string, message: string) => {
        appendLogCalls.push({ taskId, kind, message });
      },
      resolveLang: () => "en",
      pickL: (value: string) => value,
      l: (_ko: string[], en: string[]) => en.join(""),
      notifyCeo: () => {},
      db: db as any,
      nowMs: () => Date.now(),
      CLI_TOOLS: [],
      fetchClaudeUsage: async () => ({ windows: [], error: "not_implemented" }),
      fetchCodexUsage: async () => ({ windows: [], error: "not_implemented" }),
      fetchGeminiUsage: async () => ({ windows: [], error: "not_implemented" }),
      getGeminiProjectId: async () => "test-gemini-project",
      broadcast: () => {},
    } as any,
    deps,
  );

  return { db, getRoutes, postRoutes, appendLogCalls };
}

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("worktree verify-commit route", () => {
  it("worktree가 없으면 no_worktree 판정을 돌려준다", () => {
    const { db, getRoutes } = createHarness(new Map());
    try {
      const handler = getRoutes.get("/api/tasks/:id/verify-commit");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ params: { id: "task-1" } }, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({
        ok: true,
        hasWorktree: false,
        hasCommit: false,
        verdict: "no_worktree",
      });
    } finally {
      db.close();
    }
  }, 20_000);

  it("커밋 없이 변경만 있으면 dirty_without_commit 판정을 돌려준다", () => {
    const repo = initRepo("climpire-verify-dirty-");
    tempDirs.push(repo);
    const taskId = "verify-dirty-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = tools.createWorktree(repo, taskId, "Tester");
    expect(worktreePath).toBeTruthy();

    fs.writeFileSync(path.join(String(worktreePath), "src-dirty.ts"), "export const dirty = true;\n", "utf8");

    const { db, getRoutes } = createHarness(taskWorktrees);
    try {
      const handler = getRoutes.get("/api/tasks/:id/verify-commit");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ params: { id: taskId } }, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({
        ok: true,
        hasWorktree: true,
        hasCommit: false,
        hasUncommittedChanges: true,
        verdict: "dirty_without_commit",
      });
    } finally {
      db.close();
      tools.cleanupWorktree(repo, taskId);
    }
  }, 20_000);

  it("커밋된 코드 변경이 있으면 ok 판정을 돌려준다", () => {
    const repo = initRepo("climpire-verify-ok-");
    tempDirs.push(repo);
    const taskId = "verify-okay-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = tools.createWorktree(repo, taskId, "Tester");
    expect(worktreePath).toBeTruthy();

    const worktreeDir = String(worktreePath);
    fs.mkdirSync(path.join(worktreeDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(worktreeDir, "src", "verify.ts"), "export const verified = true;\n", "utf8");
    runGit(worktreeDir, ["add", "."]);
    runGit(worktreeDir, ["commit", "-m", "feat: add verify file"]);

    const { db, getRoutes } = createHarness(taskWorktrees);
    try {
      const handler = getRoutes.get("/api/tasks/:id/verify-commit");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ params: { id: taskId } }, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({
        ok: true,
        hasWorktree: true,
        hasCommit: true,
        verdict: "ok",
      });
      expect(res.payload).toMatchObject({
        files: ["src/verify.ts"],
      });
    } finally {
      db.close();
      tools.cleanupWorktree(repo, taskId);
    }
  }, 20_000);

  it("수동 merge 전에 최종 브랜치 검증 통과 로그를 남긴다", () => {
    const repo = initRepo("climpire-verify-merge-");
    tempDirs.push(repo);
    const taskId = "verify-merge-0000-0000-0000-000000000000";
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const tools = createWorktreeLifecycleTools({ appendTaskLog: () => {}, taskWorktrees });
    const worktreePath = tools.createWorktree(repo, taskId, "Tester");
    expect(worktreePath).toBeTruthy();

    const worktreeDir = String(worktreePath);
    fs.mkdirSync(path.join(worktreeDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(worktreeDir, "src", "verify.ts"), "export const verified = true;\n", "utf8");
    runGit(worktreeDir, ["add", "."]);
    runGit(worktreeDir, ["commit", "-m", "feat: ready for merge"]);

    const { db, postRoutes, appendLogCalls } = createHarness(taskWorktrees);
    try {
      const handler = postRoutes.get("/api/tasks/:id/merge");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      handler?.({ params: { id: taskId } }, res);

      expect(res.statusCode).toBe(200);
      expect(appendLogCalls.some((entry) => entry.message.includes("Final branch verification: passed"))).toBe(true);
    } finally {
      db.close();
      tools.cleanupWorktree(repo, taskId);
    }
  }, 20_000);
});

describe("cli usage route", () => {
  it("returns codex poolUsage for connected account pools", async () => {
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-profile-root-"));
    tempDirs.push(profileRoot);
    const { db, getRoutes } = createHarness(taskWorktrees, { cliAccountProfileRoot: profileRoot });
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cli_usage_cache (
          provider TEXT PRIMARY KEY,
          data_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS cli_account_pools (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          account_pool_id TEXT NOT NULL,
          label TEXT NOT NULL,
          profile_home TEXT NOT NULL,
          status TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      const profileHome = path.join(profileRoot, "codex", "codex-main");
      fs.mkdirSync(path.join(profileHome, ".codex"), { recursive: true });
      fs.writeFileSync(
        path.join(profileHome, ".codex", "auth.json"),
        JSON.stringify({
          tokens: { access_token: "test-access-token", account_id: "acct-001" },
        }),
        "utf8",
      );

      db.prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("pool-1", "codex", "codex-main", "Codex Main", profileHome, "connected", Date.now());

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          return new Response(
            JSON.stringify({
              rate_limit: {
                primary_window: { used_percent: 12, reset_at: 1_700_000_000 },
                secondary_window: { used_percent: 34, reset_at: 1_700_500_000 },
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }),
      );

      const handler = getRoutes.get("/api/cli-usage");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      await handler?.({}, res);

      expect(res.statusCode).toBe(200);
      const payload = res.payload as {
        ok: boolean;
        usage: Record<string, unknown>;
        poolUsage: Array<{
          key: string;
          provider: string;
          accountPoolId: string;
          label: string;
          usage: { windows: Array<{ label: string }> };
        }>;
      };
      expect(payload.ok).toBe(true);
      expect(Array.isArray(payload.poolUsage)).toBe(true);
      expect(payload.poolUsage).toHaveLength(1);
      expect(payload.poolUsage[0]).toMatchObject({
        key: "codex:codex-main",
        provider: "codex",
        accountPoolId: "codex-main",
        label: "Codex Main",
      });
      expect(payload.poolUsage[0].usage.windows.map((window) => window.label)).toEqual(["5-hour", "7-day"]);
    } finally {
      db.close();
    }
  });

  it("returns gemini poolUsage and jules sessionUsage from connected pool profiles", async () => {
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-profile-root-"));
    tempDirs.push(profileRoot);
    const runJulesSessionList = vi.fn(
      async () =>
        [
          '{"session_id":"j-1","status":"running","updated_at":"2026-04-10T00:00:00.000Z"}',
          '{"session_id":"j-2","status":"completed","updated_at":"2026-04-09T23:00:00.000Z"}',
        ].join("\n") + "\n",
    );
    const { db, getRoutes } = createHarness(taskWorktrees, {
      runJulesSessionList,
      cliAccountProfileRoot: profileRoot,
    });
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cli_usage_cache (
          provider TEXT PRIMARY KEY,
          data_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS cli_account_pools (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          account_pool_id TEXT NOT NULL,
          label TEXT NOT NULL,
          profile_home TEXT NOT NULL,
          status TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      const geminiHome = path.join(profileRoot, "gemini", "gemini-main");
      const julesHome = path.join(profileRoot, "jules", "jules-main");

      fs.mkdirSync(path.join(geminiHome, ".gemini"), { recursive: true });
      fs.writeFileSync(
        path.join(geminiHome, ".gemini", "oauth_creds.json"),
        JSON.stringify({ access_token: "gemini-token-1", refresh_token: "gemini-refresh-1" }),
        "utf8",
      );

      fs.mkdirSync(path.join(julesHome, ".jules", "cache"), { recursive: true });
      fs.writeFileSync(
        path.join(julesHome, ".jules", "cache", "oauth_creds.json"),
        JSON.stringify({ access_token: "jules-token-1", refresh_token: "jules-refresh-1" }),
        "utf8",
      );

      const now = Date.now();
      const insertPool = db.prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      insertPool.run("pool-gemini", "gemini", "gemini-main", "Gemini Main", geminiHome, "connected", now);
      insertPool.run("pool-jules", "jules", "jules-main", "Jules Main", julesHome, "connected", now + 1);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          return new Response(
            JSON.stringify({
              buckets: [
                { modelId: "gemini-3-flash", remainingFraction: 0.5, resetTime: "2026-04-10T00:00:00.000Z" },
                { modelId: "gemini-3-pro", remainingFraction: 0.25, resetTime: "2026-04-10T01:00:00.000Z" },
              ],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }),
      );

      const handler = getRoutes.get("/api/cli-usage");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      await handler?.({}, res);

      expect(res.statusCode).toBe(200);
      const payload = res.payload as {
        ok: boolean;
        poolUsage: Array<{
          key: string;
          provider: string;
          accountPoolId: string;
          usage: { windows: Array<{ label: string; utilization: number }> };
        }>;
        sessionUsage: Array<{
          provider: string;
          accountPoolId: string;
          sessions: {
            in_progress: number;
            completed: number;
          };
          error: string | null;
        }>;
      };
      expect(payload.ok).toBe(true);
      expect(Array.isArray(payload.poolUsage)).toBe(true);
      expect(payload.poolUsage).toHaveLength(1);

      const geminiEntry = payload.poolUsage.find((entry) => entry.provider === "gemini");
      expect(geminiEntry).toMatchObject({ key: "gemini:gemini-main", accountPoolId: "gemini-main" });
      expect(geminiEntry?.usage.windows.map((window) => window.label)).toEqual(["gemini-3-flash", "gemini-3-pro"]);
      expect(Array.isArray(payload.sessionUsage)).toBe(true);
      expect(payload.sessionUsage).toHaveLength(1);
      expect(payload.sessionUsage[0]).toMatchObject({
        provider: "jules",
        accountPoolId: "jules-main",
        error: null,
      });
      expect(payload.sessionUsage[0].sessions.in_progress).toBe(1);
      expect(payload.sessionUsage[0].sessions.completed).toBe(1);
      expect(runJulesSessionList).toHaveBeenCalledOnce();
      expect(runJulesSessionList).toHaveBeenCalledWith(julesHome, "jules-main");
    } finally {
      db.close();
    }
  });

  it("maps jules remote session command failure to usage_api_unavailable", async () => {
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-profile-root-"));
    tempDirs.push(profileRoot);
    const runJulesSessionList = vi.fn(async () => {
      throw new Error("permission denied");
    });
    const { db, getRoutes } = createHarness(taskWorktrees, {
      runJulesSessionList,
      cliAccountProfileRoot: profileRoot,
    });
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cli_usage_cache (
          provider TEXT PRIMARY KEY,
          data_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS cli_account_pools (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          account_pool_id TEXT NOT NULL,
          label TEXT NOT NULL,
          profile_home TEXT NOT NULL,
          status TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      const julesHome = path.join(profileRoot, "jules", "jules-main");
      fs.mkdirSync(path.join(julesHome, ".jules", "cache"), { recursive: true });
      fs.writeFileSync(
        path.join(julesHome, ".jules", "cache", "oauth_creds.json"),
        JSON.stringify({ access_token: "jules-token-scope-test", refresh_token: "jules-refresh-scope-test" }),
        "utf8",
      );

      db.prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("pool-jules", "jules", "jules-main", "Jules Main", julesHome, "connected", Date.now());

      const handler = getRoutes.get("/api/cli-usage");
      expect(handler).toBeTypeOf("function");

      const res = createFakeResponse();
      await handler?.({}, res);

      expect(res.statusCode).toBe(200);
      const payload = res.payload as {
        ok: boolean;
        sessionUsage: Array<{
          provider: string;
          error: string | null;
        }>;
      };
      expect(payload.ok).toBe(true);
      const julesEntry = payload.sessionUsage.find((entry) => entry.provider === "jules");
      expect(julesEntry?.error).toBe("usage_api_unavailable");
      expect(runJulesSessionList).toHaveBeenCalledOnce();
      expect(runJulesSessionList).toHaveBeenCalledWith(julesHome, "jules-main");
    } finally {
      db.close();
    }
  });

  it("fails closed before network, Jules exec, or refreshed credential writes for external profile rows", async () => {
    const taskWorktrees = new Map<string, { worktreePath: string; branchName: string; projectPath: string }>();
    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-profile-root-"));
    const externalGeminiHome = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-external-gemini-"));
    const externalJulesHome = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-external-jules-"));
    tempDirs.push(profileRoot, externalGeminiHome, externalJulesHome);
    const runJulesSessionList = vi.fn(async () => "");
    const { db, getRoutes } = createHarness(taskWorktrees, {
      runJulesSessionList,
      cliAccountProfileRoot: profileRoot,
    });
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cli_usage_cache (
          provider TEXT PRIMARY KEY,
          data_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cli_account_pools (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          account_pool_id TEXT NOT NULL,
          label TEXT NOT NULL,
          profile_home TEXT NOT NULL,
          status TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      fs.mkdirSync(path.join(externalGeminiHome, ".gemini"), { recursive: true });
      fs.writeFileSync(
        path.join(externalGeminiHome, ".gemini", "oauth_creds.json"),
        JSON.stringify({ access_token: "outside-access", refresh_token: "outside-refresh", expiry_date: 1 }),
        "utf8",
      );
      fs.mkdirSync(path.join(externalJulesHome, ".jules", "cache"), { recursive: true });
      fs.writeFileSync(
        path.join(externalJulesHome, ".jules", "cache", "oauth_creds.json"),
        JSON.stringify({ access_token: "outside-access", refresh_token: "outside-refresh" }),
        "utf8",
      );
      const insertPool = db.prepare(
        `INSERT INTO cli_account_pools (id, provider, account_pool_id, label, profile_home, status, updated_at)
         VALUES (?, ?, ?, ?, ?, 'connected', ?)`,
      );
      insertPool.run("outside-gemini", "gemini", "gemini-main", "Outside Gemini", externalGeminiHome, Date.now());
      insertPool.run("outside-jules", "jules", "jules-main", "Outside Jules", externalJulesHome, Date.now() + 1);

      const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchSpy);
      const writeSpy = vi.spyOn(fs, "writeFileSync");
      const handler = getRoutes.get("/api/cli-usage");
      const res = createFakeResponse();
      await handler?.({}, res);

      const payload = res.payload as {
        poolUsage: Array<{ provider: string; usage: { error: string | null } }>;
        sessionUsage: Array<{ provider: string; error: string | null }>;
      };
      expect(payload.poolUsage.find((entry) => entry.provider === "gemini")?.usage.error).toBe("profile_error");
      expect(payload.sessionUsage.find((entry) => entry.provider === "jules")?.error).toBe("profile_error");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(runJulesSessionList).not.toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
});
