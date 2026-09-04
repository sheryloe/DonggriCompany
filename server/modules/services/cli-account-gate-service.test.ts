import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyOAuthRunnerIsolationSchema } from "../bootstrap/schema/oauth-runner-isolation.ts";
import { CliAccountGateError, CliAccountGateService } from "./cli-account-gate-service.ts";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);
const originalAccountGateSecret = process.env.DONGGRI_ACCOUNT_GATE_SECRET;
const mockedResolveExecutable = vi.fn((input: { command: string; argv?: readonly string[] }): any => ({
  ok: true as const,
  executable: input.command,
  argv: [...(input.argv ?? [])],
  commandPath: input.command,
  source: "native" as const,
  shell: false as const,
}));

describe("CliAccountGateService", () => {
  let db: DatabaseSync;
  let profileRoot: string;
  let nowValue = Date.now();

  beforeEach(() => {
    mockedExecFileSync.mockReset();
    mockedResolveExecutable.mockClear();
    db = new DatabaseSync(":memory:");
    applyOAuthRunnerIsolationSchema(db);
    profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-cli-pools-"));
    nowValue = Date.now();
  });

  afterEach(() => {
    if (typeof originalAccountGateSecret === "string") {
      process.env.DONGGRI_ACCOUNT_GATE_SECRET = originalAccountGateSecret;
    } else {
      delete process.env.DONGGRI_ACCOUNT_GATE_SECRET;
    }
    db.close();
    fs.rmSync(profileRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function createService(
    options: {
      approveProviderExecution?: boolean;
      gateRequests?: Array<Record<string, unknown>>;
    } = {},
  ) {
    return new CliAccountGateService({
      db,
      nowMs: () => nowValue++,
      profileRoot,
      resolveExecutable: mockedResolveExecutable,
      execFileCommand: mockedExecFileSync as any,
      providerLiveExecutionGate: options.approveProviderExecution
        ? (request) => {
            options.gateRequests?.push(request);
            return request.gateId === "G-PROVIDER-LIVE";
          }
        : undefined,
    });
  }

  it("creates pool with deterministic profile path", () => {
    const service = createService();
    const pool = service.createPool("codex", "codex-main", "Codex Main");

    expect(pool.provider).toBe("codex");
    expect(pool.accountPoolId).toBe("codex-main");
    expect(pool.profileHome).toBe(path.join(profileRoot, "codex", "codex-main"));
    expect(pool.status).toBe("auth_required");
  });

  it("keeps canonical dot and dash pool identities isolated and rejects noncanonical case", () => {
    const service = createService();
    const dotted = service.createPool("codex", "account.one");
    const dashed = service.createPool("codex", "account-one");

    expect(dotted.profileHome).toBe(path.join(profileRoot, "codex", "account.one"));
    expect(dashed.profileHome).toBe(path.join(profileRoot, "codex", "account-one"));
    expect(dotted.profileHome).not.toBe(dashed.profileHome);
    expect(() => service.createPool("codex", "Account.One")).toThrowError(
      expect.objectContaining({ code: "cli_account_pool_invalid", status: 400 }),
    );
  });

  it("rejects a corrupted database row whose profile path escapes the canonical account root", () => {
    const service = createService();
    const outsideProfile = path.join(os.tmpdir(), `outside-cli-profile-${Date.now()}`);
    db.prepare(
      `INSERT INTO cli_account_pools
       (id, provider, account_pool_id, label, profile_home, status, created_at, updated_at)
       VALUES ('corrupt-pool', 'codex', 'codex-main', 'Corrupt', ?, 'connected', 1, 1)`,
    ).run(outsideProfile);

    expect(() => service.verifyPool("codex", "codex-main")).toThrowError(
      expect.objectContaining({ code: "cli_profile_error", status: 409 }),
    );
    expect(fs.existsSync(outsideProfile)).toBe(false);
  });

  it("throws cli_not_connected when pool is missing", () => {
    const service = createService();
    expect(() => service.ensureProviderPoolReady("codex", "missing-pool")).toThrowError(CliAccountGateError);
    try {
      service.ensureProviderPoolReady("codex", "missing-pool");
    } catch (error) {
      const typed = error as CliAccountGateError;
      expect(typed.code).toBe("cli_not_connected");
      expect(typed.status).toBe(412);
    }
  });

  it("detects auth artifact when profile has provider credentials", () => {
    const service = createService();
    const created = service.createPool("codex", "pool-a", "Pool A");
    const authDir = path.posix.join(created.profileHome, ".codex");
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(
      path.posix.join(authDir, "auth.json"),
      JSON.stringify({ tokens: { access_token: "test-access", account_id: "test-account" } }),
      "utf8",
    );

    const result = service.verifyPool("codex", "pool-a");
    if (result.binaryInstalled) {
      expect(result.pool.status).toBe("connected");
      expect(result.authArtifactFound).toBe(true);
    } else {
      expect(result.pool.status).toBe("install_required");
      expect(result.authArtifactFound).toBe(false);
    }
  });

  it("recognizes only the isolated Claude credentials contract", () => {
    const service = createService();
    const created = service.createPool("claude", "claude-main", "Claude Main");
    const credentialsPath = path.join(created.profileHome, ".claude", ".credentials.json");
    fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });
    fs.writeFileSync(
      credentialsPath,
      JSON.stringify({ claudeAiOauth: { accessToken: "test-access", refreshToken: "test-refresh" } }),
      "utf8",
    );

    const result = service.verifyPool("claude", "claude-main");

    expect(result.binaryInstalled).toBe(true);
    expect(result.authArtifactFound).toBe(true);
    expect(result.pool.status).toBe("connected");
  });

  it("fails closed instead of returning a legacy Docker login command", () => {
    const service = createService();
    service.createPool("codex", "codex-main", "Codex Main");

    try {
      service.getLoginCommand("codex", "codex-main");
      throw new Error("expected getLoginCommand to fail closed");
    } catch (error) {
      const typed = error as CliAccountGateError;
      expect(typed.code).toBe("runner_supervisor_unbound");
      expect(typed.status).toBe(503);
      expect(typed.message).not.toContain("docker exec");
    }
  });

  it("syncs codex pools from auth report and includes usage metadata", () => {
    const previousSecret = process.env.DONGGRI_ACCOUNT_GATE_SECRET;
    process.env.DONGGRI_ACCOUNT_GATE_SECRET = "must-not-reach-child";
    mockedExecFileSync.mockImplementation((command: string, args?: readonly string[]) => {
      const commandName = String(command);
      const argv = Array.isArray(args) ? args.map(String) : [];
      if ((commandName === "which" || commandName === "where") && argv[0] === "codex") {
        return Buffer.from("");
      }
      if (commandName === "codex-multi-auth" && argv[0] === "auth" && argv[1] === "report") {
        return (
          "\uFEFF" +
          JSON.stringify({
            accounts: [
              {
                enabled: true,
                accountLabel: "Account 1",
                email: "a1@example.com",
                lastUsed: 1710000000000,
                expiresAt: 1711000000000,
              },
              {
                enabled: true,
                accountLabel: "Account 2",
                email: "a2@example.com",
                lastUsed: 1710000001000,
                expiresAt: 1711000001000,
              },
            ],
            activeIndex: 0,
            forecast: {
              accounts: [
                {
                  index: 0,
                  label: "Account 1",
                  isCurrent: true,
                  availability: "ready",
                  riskScore: 0,
                  waitMs: 0,
                  liveQuota: { summary: "5h 99% left" },
                },
                {
                  index: 1,
                  label: "Account 2",
                  isCurrent: false,
                  availability: "ready",
                  riskScore: 1,
                  waitMs: 250,
                  liveQuota: { summary: "5h 91% left" },
                },
              ],
            },
          })
        );
      }
      return Buffer.from("");
    });

    const gateRequests: Array<Record<string, unknown>> = [];
    const service = createService({ approveProviderExecution: true, gateRequests });
    const result = service.syncCodexPoolsFromMultiAuth({ live: true });

    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[0]?.poolId).toBe("codex-main");
    expect(result.accounts[1]?.poolId).toBe("codex-main-2");
    expect(result.accounts[0]?.source).toBe("auth_report");
    expect(result.accounts[0]?.usageSummary).toContain("5h");
    expect(result.accounts[0]?.lastUsedAt).toBe(1710000000000);
    expect(result.accounts[0]?.expiresAt).toBe(1711000000000);
    expect(JSON.stringify(result.accounts)).not.toContain("refreshToken");
    expect(result.pools.length).toBeGreaterThanOrEqual(2);
    const providerCalls = mockedExecFileSync.mock.calls.filter(([command]) => String(command) === "codex-multi-auth");
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]?.[2]).toMatchObject({ shell: false });
    expect((providerCalls[0]?.[2]?.env as NodeJS.ProcessEnv).DONGGRI_ACCOUNT_GATE_SECRET).toBeUndefined();
    expect(gateRequests).toContainEqual(
      expect.objectContaining({
        gateId: "G-PROVIDER-LIVE",
        operation: "account_diagnostic",
        provider: "codex",
        taskId: null,
        runId: null,
      }),
    );
    if (typeof previousSecret === "string") process.env.DONGGRI_ACCOUNT_GATE_SECRET = previousSecret;
    else delete process.env.DONGGRI_ACCOUNT_GATE_SECRET;
  });

  it("fails closed before provider invocation when executable identity cannot be resolved", () => {
    mockedResolveExecutable.mockImplementationOnce(() => ({
      ok: false as const,
      reason: "executable_not_found: codex",
    }));
    const service = createService();

    expect(() => service.syncCodexPoolsFromMultiAuth()).toThrowError("Codex CLI is not installed");
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it("repairs legacy /app profile paths during codex sync", () => {
    db.prepare(
      `INSERT INTO cli_account_pools (
         id, provider, account_pool_id, label, profile_home, status, created_at, updated_at
       ) VALUES (?, 'codex', 'codex-main', 'Legacy Main', '/app/.office-accounts/codex/codex-main', 'auth_required', 1, 1)`,
    ).run("legacy-pool");

    mockedExecFileSync.mockImplementation((command: string, args?: readonly string[]) => {
      const commandName = String(command);
      const argv = Array.isArray(args) ? args.map(String) : [];
      if ((commandName === "which" || commandName === "where") && argv[0] === "codex") {
        return Buffer.from("");
      }
      if (commandName === "codex-multi-auth" && argv[0] === "auth" && argv[1] === "report") {
        return JSON.stringify({
          accounts: [{ enabled: true, accountLabel: "Account 1" }],
          activeIndex: 0,
          forecast: { accounts: [{ index: 0, label: "Account 1", isCurrent: true }] },
        });
      }
      return Buffer.from("");
    });

    const service = createService({ approveProviderExecution: true });
    service.syncCodexPoolsFromMultiAuth({ live: true });

    const row = db
      .prepare("SELECT profile_home FROM cli_account_pools WHERE provider = 'codex' AND account_pool_id = 'codex-main'")
      .get() as { profile_home: string };
    expect(row.profile_home).toBe(path.join(profileRoot, "codex", "codex-main"));
  });

  it("falls back to local storage snapshot when auth report is unavailable", () => {
    const storagePath = path.join(profileRoot, "openai-codex-accounts.json");
    fs.writeFileSync(
      storagePath,
      JSON.stringify({
        accounts: [
          {
            enabled: true,
            accountLabel: "Primary",
            email: "p@example.com",
            lastUsed: 1710100000000,
            expiresAt: 1711100000000,
            refreshToken: "secret",
          },
          { enabled: false, accountLabel: "Disabled", email: "x@example.com", refreshToken: "secret" },
          {
            enabled: true,
            accountLabel: "Backup",
            email: "b@example.com",
            lastUsed: 1710100001000,
            expiresAt: 1711100001000,
            refreshToken: "secret",
          },
        ],
        activeIndex: 2,
      }),
      "utf8",
    );

    mockedExecFileSync.mockImplementation((command: string, args?: readonly string[]) => {
      const commandName = String(command);
      const argv = Array.isArray(args) ? args.map(String) : [];
      if ((commandName === "which" || commandName === "where") && argv[0] === "codex") {
        return Buffer.from("");
      }
      if (
        (commandName === "codex-multi-auth" || commandName === "codex") &&
        argv[0] === "auth" &&
        argv[1] === "report"
      ) {
        throw new Error("unrecognized subcommand 'report'");
      }
      return Buffer.from("");
    });

    const previousStoragePath = process.env.CODEX_MULTI_AUTH_STORAGE_PATH;
    process.env.CODEX_MULTI_AUTH_STORAGE_PATH = storagePath;
    try {
      const service = createService();
      const result = service.syncCodexPoolsFromMultiAuth({ live: true });

      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0]?.poolId).toBe("codex-main");
      expect(result.accounts[1]?.poolId).toBe("codex-main-2");
      expect(result.accounts[0]?.source).toBe("storage_fallback");
      expect(result.accounts[1]?.isCurrent).toBe(true);
      expect(result.accounts[0]?.usageSummary).toBeNull();
      expect(JSON.stringify(result.accounts)).not.toContain("refreshToken");
      expect(mockedExecFileSync).not.toHaveBeenCalled();
    } finally {
      if (typeof previousStoragePath === "string") {
        process.env.CODEX_MULTI_AUTH_STORAGE_PATH = previousStoragePath;
      } else {
        delete process.env.CODEX_MULTI_AUTH_STORAGE_PATH;
      }
    }
  });

  it("does not allow an environment variable to bypass diagnostic provider gates", () => {
    const previousLive = process.env.G_PROVIDER_LIVE;
    const previousStoragePath = process.env.CODEX_MULTI_AUTH_STORAGE_PATH;
    process.env.G_PROVIDER_LIVE = "true";
    process.env.CODEX_MULTI_AUTH_STORAGE_PATH = path.join(profileRoot, "missing-storage.json");
    try {
      const service = createService();
      expect(() => service.syncCodexPoolsFromMultiAuth({ live: true })).toThrowError(
        expect.objectContaining({ code: "cli_sync_failed" }),
      );
      expect(mockedExecFileSync).not.toHaveBeenCalled();
    } finally {
      if (typeof previousLive === "string") process.env.G_PROVIDER_LIVE = previousLive;
      else delete process.env.G_PROVIDER_LIVE;
      if (typeof previousStoragePath === "string") process.env.CODEX_MULTI_AUTH_STORAGE_PATH = previousStoragePath;
      else delete process.env.CODEX_MULTI_AUTH_STORAGE_PATH;
    }
  });

  it("gates Jules remote health and Codex login status before injected execution", () => {
    const service = createService();
    const jules = service.createPool("jules", "jules-main", "Jules Main");
    const julesAuth = path.join(jules.profileHome, ".jules", "cache", "oauth_creds.json");
    fs.mkdirSync(path.dirname(julesAuth), { recursive: true });
    fs.writeFileSync(julesAuth, JSON.stringify({ access_token: "access", refresh_token: "refresh" }), "utf8");

    const julesResult = service.verifyPool("jules", "jules-main");
    expect(julesResult.pool.status).toBe("auth_required");
    expect(julesResult.pool.lastError).toContain("G-PROVIDER-LIVE");

    service.createPool("codex", "codex-status", "Codex Status");
    const codexResult = service.verifyPool("codex", "codex-status");
    expect(codexResult.authArtifactFound).toBe(false);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });
});
