import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { resolveCliAccountPoolEnv } from "./cli-account-pool-env.ts";

type Harness = { db: DatabaseSync; root: string };
const harnesses: Harness[] = [];

function createHarness(): Harness {
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
  const harness = { db, root: fs.mkdtempSync(path.join(os.tmpdir(), "cli-account-pool-")) };
  harnesses.push(harness);
  return harness;
}

function addPool(
  harness: Harness,
  input: { provider: string; poolId: string; status?: string; authPath: string },
): string {
  const profileHome = path.join(harness.root, input.provider, input.poolId);
  const authPath = path.join(profileHome, input.authPath);
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  const payload =
    input.provider === "codex"
      ? { tokens: { access_token: "test-access", account_id: "test-account" } }
      : input.provider === "claude"
        ? { claudeAiOauth: { accessToken: "test-access", refreshToken: "test-refresh" } }
        : { access_token: "test-access", refresh_token: "test-refresh" };
  fs.writeFileSync(authPath, JSON.stringify(payload), "utf8");
  harness.db
    .prepare(
      `INSERT INTO cli_account_pools
       (id, provider, account_pool_id, label, profile_home, status, last_verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1)`,
    )
    .run(randomUUID(), input.provider, input.poolId, input.poolId, profileHome, input.status ?? "connected");
  return profileHome;
}

afterEach(() => {
  while (harnesses.length > 0) {
    const harness = harnesses.pop()!;
    harness.db.close();
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});

describe("resolveCliAccountPoolEnv authoritative isolation", () => {
  it("fails closed when an authoritative Codex account pool is absent", () => {
    const harness = createHarness();
    expect(resolveCliAccountPoolEnv({ db: harness.db as any, provider: "codex" })).toEqual({
      ok: false,
      reason: "authoritative_cli_account_pool_required: provider=codex",
    });
  });

  it("supports an isolated connected Claude profile without using the host HOME", () => {
    const harness = createHarness();
    const profileHome = addPool(harness, {
      provider: "claude",
      poolId: "claude-main",
      authPath: path.join(".claude", ".credentials.json"),
    });
    const resolved = resolveCliAccountPoolEnv({
      db: harness.db as any,
      provider: "claude",
      cliAccountPoolId: "claude-main",
      platform: "win32",
      profileRoot: harness.root,
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.poolId).toBe("claude-main");
      expect(resolved.selectedBy).toBe("explicit");
      expect(resolved.envPatch).toEqual({ HOME: profileHome, USERPROFILE: profileHome });
    }
  });

  it("rejects a disconnected explicit pool", () => {
    const harness = createHarness();
    addPool(harness, {
      provider: "codex",
      poolId: "codex-main",
      status: "disconnected",
      authPath: path.join(".codex", "auth.json"),
    });
    expect(
      resolveCliAccountPoolEnv({ db: harness.db as any, provider: "codex", cliAccountPoolId: "codex-main" }),
    ).toEqual({
      ok: false,
      reason: "cli_account_pool_not_connected: provider=codex account_pool_id=codex-main",
    });
  });

  it("rejects account-pool identity metacharacters before a database lookup", () => {
    const db = {
      prepare: () => {
        throw new Error("database must not be queried");
      },
    };
    expect(resolveCliAccountPoolEnv({ db, provider: "codex", cliAccountPoolId: "codex-main & whoami" })).toEqual({
      ok: false,
      reason: "cli_account_pool_identity_invalid: provider=codex account_pool_id=codex-main & whoami",
    });
  });

  it("rejects noncanonical account-pool case before a database lookup", () => {
    const db = {
      prepare: () => {
        throw new Error("database must not be queried");
      },
    };
    expect(resolveCliAccountPoolEnv({ db, provider: "codex", cliAccountPoolId: "Codex-Main" })).toEqual({
      ok: false,
      reason: "cli_account_pool_identity_invalid: provider=codex account_pool_id=Codex-Main",
    });
  });

  it("rejects account-only metadata that has no provider credential identity", () => {
    const harness = createHarness();
    const profileHome = addPool(harness, {
      provider: "codex",
      poolId: "codex-main",
      authPath: path.join(".codex", "auth.json"),
    });
    fs.writeFileSync(
      path.join(profileHome, ".codex", "auth.json"),
      JSON.stringify({ account: { name: "metadata-only" } }),
      "utf8",
    );

    const resolved = resolveCliAccountPoolEnv({
      db: harness.db as any,
      provider: "codex",
      cliAccountPoolId: "codex-main",
      profileRoot: harness.root,
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toContain("auth_artifact_missing");
  });

  it("auto-selects a connected authoritative pool but never falls back to process HOME", () => {
    const harness = createHarness();
    const profileHome = addPool(harness, {
      provider: "codex",
      poolId: "codex-main",
      authPath: path.join(".codex", "auth.json"),
    });
    const resolved = resolveCliAccountPoolEnv({
      db: harness.db as any,
      provider: "codex",
      profileRoot: harness.root,
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.selectedBy).toBe("auto");
      expect(resolved.profileHome).toBe(profileHome);
      expect(resolved.envPatch.HOME).toBe(profileHome);
    }
  });

  it("fails unsupported provider execution closed unless an explicit non-execution policy opts out", () => {
    const db = {
      prepare: () => {
        throw new Error("database must not be queried");
      },
    };
    expect(resolveCliAccountPoolEnv({ db, provider: "kimi" })).toEqual({
      ok: false,
      reason: "authoritative_cli_account_pool_unsupported: provider=kimi",
    });
    expect(
      resolveCliAccountPoolEnv({ db, provider: "kimi", policy: { requireAuthoritativePool: false } }),
    ).toMatchObject({
      ok: true,
      provider: "kimi",
      poolId: null,
      selectedBy: "none",
    });
    expect(resolveCliAccountPoolEnv({ db, provider: "kimi", cliAccountPoolId: "kimi-main" })).toEqual({
      ok: false,
      reason: "cli_account_pool_unsupported: provider=kimi account_pool_id=kimi-main",
    });
  });
});
