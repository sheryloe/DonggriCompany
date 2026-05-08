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

describe("CliAccountGateService", () => {
  let db: DatabaseSync;
  let profileRoot: string;
  let nowValue = Date.now();

  beforeEach(() => {
    mockedExecFileSync.mockReset();
    db = new DatabaseSync(":memory:");
    applyOAuthRunnerIsolationSchema(db);
    profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-cli-pools-"));
    nowValue = Date.now();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(profileRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function createService() {
    return new CliAccountGateService({
      db,
      nowMs: () => nowValue++,
      profileRoot,
      containerName: "donggricompany",
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
    fs.writeFileSync(path.posix.join(authDir, "auth.json"), JSON.stringify({ token: "x" }), "utf8");

    const result = service.verifyPool("codex", "pool-a");
    if (result.binaryInstalled) {
      expect(result.pool.status).toBe("connected");
      expect(result.authArtifactFound).toBe(true);
    } else {
      expect(result.pool.status).toBe("install_required");
      expect(result.authArtifactFound).toBe(false);
    }
  });

  it("returns Codex login command with device auth in docker exec string", () => {
    const service = createService();
    service.createPool("codex", "codex-main", "Codex Main");

    const result = service.getLoginCommand("codex", "codex-main");
    expect(result.provider).toBe("codex");
    expect(result.accountPoolId).toBe("codex-main");
    expect(result.command).toContain("docker exec -it donggricompany sh -lc");
    expect(result.command).toContain("codex login --device-auth");
  });

  it("syncs codex pools from auth report and includes usage metadata", () => {
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

    const service = createService();
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

    const service = createService();
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
    } finally {
      if (typeof previousStoragePath === "string") {
        process.env.CODEX_MULTI_AUTH_STORAGE_PATH = previousStoragePath;
      } else {
        delete process.env.CODEX_MULTI_AUTH_STORAGE_PATH;
      }
    }
  });
});
