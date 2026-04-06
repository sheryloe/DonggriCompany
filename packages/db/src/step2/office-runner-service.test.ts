import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { OfficeRunnerService } from "../index.js";
import { runMigrations } from "../migrate.js";
import { runSeed } from "../seed.js";

const createSeededDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step6-runner-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

test("OfficeRunnerService enforces max active and FIFO promotion", () => {
  const dbPath = createSeededDbPath();
  const service = new OfficeRunnerService(dbPath);

  try {
    const first = service.ensureRunner({
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      containerName: "runner-codex-pro",
      requestJson: JSON.stringify({ source: "test-a" }),
      maxActive: 1
    });
    assert.equal(first.queued, false);
    assert.equal(first.runner.status, "active");

    const second = service.ensureRunner({
      provider: "codex",
      accountPoolId: "pool_codex_plus_main",
      containerName: "runner-codex-plus",
      requestJson: JSON.stringify({ source: "test-b" }),
      maxActive: 1
    });
    assert.equal(second.queued, true);
    assert.equal(second.queueItem.status, "queued");

    const queue = service.listQueue(10);
    assert.equal(queue.length >= 1, true);
    assert.equal(queue[0]?.accountPoolId, "pool_codex_plus_main");

    service.deactivateRunner({
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      containerName: "runner-codex-pro",
      status: "stopped"
    });

    const promoted = service.promoteNextQueued(1, (provider, accountPoolId) => {
      return `runner-${provider}-${accountPoolId}`;
    });
    assert.ok(promoted);
    assert.equal(promoted?.runner.accountPoolId, "pool_codex_plus_main");
    assert.equal(promoted?.runner.status, "active");
    assert.equal(promoted?.queueItem.status, "done");
  } finally {
    rmSync(dbPath, { force: true });
  }
});
