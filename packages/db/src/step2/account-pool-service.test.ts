import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runMigrations } from "../migrate.js";
import { runSeed } from "../seed.js";
import { withDatabase } from "../database.js";
import { AccountPoolService, DbServiceError } from "../index.js";

const createSeededDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step2-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

const cleanupDbPath = (dbPath: string): void => {
  rmSync(dbPath, { force: true });
};

test("AccountPoolService supports create, update, and latest fatigue join", () => {
  const dbPath = createSeededDbPath();
  const service = new AccountPoolService(dbPath);

  try {
    const created = service.create({
      key: "claude-temp-main",
      provider: "claude",
      label: "Claude Temp Main",
      fatigueMode: "derived",
      maxConcurrency: 2,
      isEnabled: true
    });

    assert.equal(created.key, "claude-temp-main");
    assert.equal(created.provider, "claude");
    assert.equal(created.latestFatigue, null);

    withDatabase((db) => {
      db.prepare(
        `
        INSERT INTO fatigue_snapshots (
          id,
          account_pool_id,
          source_type,
          raw_payload_json,
          raw_usage_value,
          raw_limit_value,
          raw_unit,
          normalized_percent,
          fatigue_state,
          confidence_score,
          observed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        randomUUID(),
        created.id,
        "derived",
        JSON.stringify({ source: "test" }),
        3,
        10,
        "requests",
        30,
        "fresh",
        0.75,
        new Date().toISOString()
      );
    }, dbPath);

    const updated = service.update(created.id, {
      label: "Claude Temp Main Updated",
      isEnabled: false,
      notes: "manual disable for test"
    });
    assert.equal(updated.label, "Claude Temp Main Updated");
    assert.equal(updated.isEnabled, false);
    assert.equal(updated.notes, "manual disable for test");
    assert.equal(updated.latestFatigue?.normalizedPercent, 30);
    assert.equal(updated.latestFatigue?.fatigueState, "fresh");

    const listed = service.list();
    const listedCreated = listed.find((pool) => pool.id === created.id);
    assert.ok(listedCreated);
    assert.equal(listedCreated?.latestFatigue?.precision, "derived");
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("AccountPoolService rejects duplicate keys with structured conflict error", () => {
  const dbPath = createSeededDbPath();
  const service = new AccountPoolService(dbPath);

  try {
    assert.throws(
      () =>
        service.create({
          key: "codex-pro-main",
          provider: "codex",
          label: "Duplicate Key",
          fatigueMode: "derived",
          maxConcurrency: 1
        }),
      (error: unknown) => {
        assert.ok(error instanceof DbServiceError);
        assert.equal(error.code, "CONFLICT");
        return true;
      }
    );
  } finally {
    cleanupDbPath(dbPath);
  }
});
