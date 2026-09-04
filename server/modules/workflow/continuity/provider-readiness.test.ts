import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { readProviderReadiness } from "./provider-readiness.ts";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cli_account_pools (
    id TEXT PRIMARY KEY, provider TEXT, account_pool_id TEXT, label TEXT, profile_home TEXT,
    status TEXT, last_verified_at INTEGER, last_error TEXT, created_at INTEGER, updated_at INTEGER
  )`);
  return db;
}

describe("provider readiness", () => {
  it("distinguishes missing, auth-required and ready accounts", () => {
    const db = database();
    const now = 1_777_777_777_000;
    expect(readProviderReadiness(db, "claude", "missing").state).toBe("install_required");
    db.prepare("INSERT INTO cli_account_pools VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "pool-1",
      "claude",
      "primary",
      "Claude primary",
      "C:\\fixture",
      "auth_required",
      null,
      null,
      1,
      1,
    );
    expect(readProviderReadiness(db, "claude", "primary")).toMatchObject({
      account_pool_id: "primary",
      account_label: "Claude primary",
      state: "auth_required",
    });
    db.prepare("UPDATE cli_account_pools SET status = 'connected', last_verified_at = ?").run(now);
    expect(readProviderReadiness(db, "claude", "primary", now).state).toBe("ready");
    expect(readProviderReadiness(db, "claude", "Claude primary").state).toBe("install_required");
    db.close();
  });

  it("reports exhaustion only from an observed provider error", () => {
    const db = database();
    db.prepare("INSERT INTO cli_account_pools VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "pool-1",
      "codex",
      "primary",
      "Codex primary",
      "C:\\fixture",
      "connected",
      1_777_777_777_000,
      "usage limit exhausted",
      1,
      2,
    );
    expect(readProviderReadiness(db, "codex", "primary", 1_777_777_777_000)).toMatchObject({
      state: "observed_exhausted",
    });
    db.close();
  });

  it("fails closed when a connected account observation is stale or missing", () => {
    const db = database();
    const now = 1_777_777_777_000;
    db.prepare("INSERT INTO cli_account_pools VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "pool-1",
      "codex",
      "primary",
      "Codex primary",
      "C:\\fixture",
      "connected",
      now - 5 * 60 * 1_000 - 1,
      null,
      1,
      2,
    );
    expect(readProviderReadiness(db, "codex", "primary", now)).toMatchObject({
      state: "degraded",
      reason: "readiness_observation_stale",
    });
    db.prepare("UPDATE cli_account_pools SET last_verified_at = NULL").run();
    expect(readProviderReadiness(db, "codex", "primary", now)).toMatchObject({
      state: "degraded",
      observed_at: null,
    });
    db.close();
  });
});
