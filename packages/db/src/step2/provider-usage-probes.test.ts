import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ProviderUsageProbeService } from "./provider-usage-probes.js";
import { runMigrations } from "../migrate.js";
import { runSeed } from "../seed.js";

const createSeededDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step2-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

const cleanupDbPath = (dbPath: string): void => {
  rmSync(dbPath, { force: true });
};

test("ProviderUsageProbeService degrades safely and persists run history on probe failure", () => {
  const dbPath = createSeededDbPath();
  const service = new ProviderUsageProbeService(dbPath);
  const originalPath = process.env.PATH;

  try {
    process.env.PATH = "";

    const result = service.run({
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      persistSnapshot: true
    });

    assert.equal(result.ok, true);
    assert.equal(result.run.provider, "codex");
    assert.equal(result.run.status, "failure");
    assert.equal(result.run.degraded, true);
    assert.equal(result.usage?.status, "degraded");
    assert.equal(result.usage?.precision, "manual");
    assert.equal(result.fatigueSnapshot?.accountPoolId, "pool_codex_pro_main");
    assert.equal(result.fatigueSnapshot?.fatigueState, "unknown");

    const history = service.listHistory(10);
    assert.ok(history.some((run) => run.id === result.run.id));
  } finally {
    process.env.PATH = originalPath;
    cleanupDbPath(dbPath);
  }
});
