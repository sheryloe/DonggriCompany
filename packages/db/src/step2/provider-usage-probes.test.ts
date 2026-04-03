import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { withDatabase } from "../database.js";
import { DbServiceError } from "../index.js";
import { runMigrations } from "../migrate.js";
import { runSeed } from "../seed.js";
import {
  type ProbeSpawnCommand,
  ProviderUsageProbeService,
  runProviderAdapterWithSpawn
} from "./provider-usage-probes.js";

const createSeededDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step2-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

const cleanupDbPath = (dbPath: string): void => {
  rmSync(dbPath, { force: true });
};

const getWriteCounts = (dbPath: string): { probeRunCount: number; fatigueSnapshotCount: number } => {
  return withDatabase((db) => {
    const probeRunCountRow = db.prepare("SELECT COUNT(1) as count FROM provider_probe_runs").get() as { count: number };
    const fatigueSnapshotCountRow = db.prepare("SELECT COUNT(1) as count FROM fatigue_snapshots").get() as { count: number };
    return {
      probeRunCount: probeRunCountRow.count,
      fatigueSnapshotCount: fatigueSnapshotCountRow.count
    };
  }, dbPath);
};

const assertBadRequest = (execute: () => unknown): void => {
  assert.throws(execute, (error: unknown) => {
    assert.ok(error instanceof DbServiceError);
    assert.equal(error.code, "BAD_REQUEST");
    assert.equal(error.statusCode, 400);
    return true;
  });
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

    const history = service.listHistory({ limit: 10 });
    assert.ok(history.some((run) => run.id === result.run.id));
  } finally {
    process.env.PATH = originalPath;
    cleanupDbPath(dbPath);
  }
});

test("ProviderUsageProbeService rejects provider/accountPool mismatch without persisting writes", () => {
  const dbPath = createSeededDbPath();
  const service = new ProviderUsageProbeService(dbPath);

  try {
    const before = getWriteCounts(dbPath);

    assertBadRequest(() =>
      service.run({
        provider: "claude",
        accountPoolId: "pool_codex_pro_main",
        persistSnapshot: true
      })
    );

    const after = getWriteCounts(dbPath);
    assert.equal(after.probeRunCount, before.probeRunCount);
    assert.equal(after.fatigueSnapshotCount, before.fatigueSnapshotCount);
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("ProviderUsageProbeService rejects provider/runtimeProfile mismatch without persisting writes", () => {
  const dbPath = createSeededDbPath();
  const service = new ProviderUsageProbeService(dbPath);

  try {
    const before = getWriteCounts(dbPath);

    assertBadRequest(() =>
      service.run({
        provider: "gemini",
        runtimeProfileId: "rt_codex_builder_pro_a",
        persistSnapshot: true
      })
    );

    const after = getWriteCounts(dbPath);
    assert.equal(after.probeRunCount, before.probeRunCount);
    assert.equal(after.fatigueSnapshotCount, before.fatigueSnapshotCount);
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("ProviderUsageProbeService rejects runtimeProfile/accountPool ownership mismatch", () => {
  const dbPath = createSeededDbPath();
  const service = new ProviderUsageProbeService(dbPath);

  try {
    const before = getWriteCounts(dbPath);

    assertBadRequest(() =>
      service.run({
        provider: "codex",
        runtimeProfileId: "rt_codex_builder_pro_a",
        accountPoolId: "pool_codex_plus_main",
        persistSnapshot: true
      })
    );

    const after = getWriteCounts(dbPath);
    assert.equal(after.probeRunCount, before.probeRunCount);
    assert.equal(after.fatigueSnapshotCount, before.fatigueSnapshotCount);
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("runProviderAdapterWithSpawn keeps fallback chain when first command exits 0 but parse is insufficient", () => {
  const calls: string[] = [];
  const probeSpawnCommand: ProbeSpawnCommand = (_binary, args) => {
    calls.push(args.join(" "));
    if (args[0] === "usage" && args[1] === "--json") {
      return { status: 0, stdoutText: JSON.stringify({ usage: 40 }), stderrText: "" };
    }
    if (args[0] === "usage") {
      return { status: 0, stdoutText: JSON.stringify({ used: 20, limit: 100, unit: "percent" }), stderrText: "" };
    }
    return { status: 1, stdoutText: "", stderrText: "not reached" };
  };

  const result = runProviderAdapterWithSpawn("codex", probeSpawnCommand);

  assert.equal(calls.length, 2);
  assert.equal(result.status, "success");
  assert.equal(result.precision, "derived");
  assert.equal(result.usageValue, 20);
  assert.equal(result.limitValue, 100);
});

test("runProviderAdapterWithSpawn returns partial only after all fallback commands are exhausted", () => {
  const calls: string[] = [];
  const probeSpawnCommand: ProbeSpawnCommand = (_binary, args) => {
    calls.push(args.join(" "));
    if (args[0] === "usage" && args[1] === "--json") {
      return { status: 0, stdoutText: JSON.stringify({ usage: 70 }), stderrText: "" };
    }
    if (args[0] === "usage") {
      return { status: 0, stdoutText: JSON.stringify({ current: 7 }), stderrText: "" };
    }
    return { status: 0, stdoutText: "codex version 1.0.0", stderrText: "" };
  };

  const result = runProviderAdapterWithSpawn("codex", probeSpawnCommand);

  assert.equal(calls.length, 3);
  assert.equal(result.status, "partial");
  assert.equal(result.degraded, true);
  assert.equal(result.commandText, "codex --version");
});

test("ProviderUsageProbeService listHistory supports provider/accountPool/runtimeProfile filters", () => {
  const dbPath = createSeededDbPath();
  const probeSpawnCommand: ProbeSpawnCommand = (_binary, _args) => {
    return { status: 0, stdoutText: JSON.stringify({ used: 10, limit: 100 }), stderrText: "" };
  };
  const service = new ProviderUsageProbeService(dbPath, { probeSpawnCommand });

  try {
    service.run({
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      runtimeProfileId: "rt_codex_builder_pro_a",
      persistSnapshot: false
    });
    service.run({
      provider: "claude",
      accountPoolId: "pool_claude_pro_main",
      runtimeProfileId: "rt_claude_builder_a",
      persistSnapshot: false
    });

    const codexRuns = service.listHistory({ provider: "codex", limit: 20 });
    assert.ok(codexRuns.length >= 1);
    assert.ok(codexRuns.every((run) => run.provider === "codex"));

    const claudePoolRuns = service.listHistory({
      accountPoolId: "pool_claude_pro_main",
      limit: 20
    });
    assert.ok(claudePoolRuns.length >= 1);
    assert.ok(claudePoolRuns.every((run) => run.accountPoolId === "pool_claude_pro_main"));

    const profileRuns = service.listHistory({
      runtimeProfileId: "rt_codex_builder_pro_a",
      limit: 20
    });
    assert.ok(profileRuns.length >= 1);
    assert.ok(profileRuns.every((run) => run.runtimeProfileId === "rt_codex_builder_pro_a"));

    const latestSingle = service.listHistory({
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      runtimeProfileId: "rt_codex_builder_pro_a",
      limit: 1
    });
    assert.equal(latestSingle.length, 1);
  } finally {
    cleanupDbPath(dbPath);
  }
});
