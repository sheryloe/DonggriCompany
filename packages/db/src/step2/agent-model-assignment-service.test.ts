import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AgentModelAssignmentService, DbServiceError } from "../index.js";
import { runMigrations } from "../migrate.js";
import { runSeed } from "../seed.js";

const createSeededDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step6-agent-model-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

const cleanupDbPath = (dbPath: string): void => {
  rmSync(dbPath, { force: true });
};

test("AgentModelAssignmentService upserts and lists agent assignment", () => {
  const dbPath = createSeededDbPath();
  const service = new AgentModelAssignmentService(dbPath);

  try {
    const assignment = service.upsert("router", {
      provider: "codex",
      accountPoolId: "pool_codex_pro_main",
      runtimeProfileId: "rt_codex_builder_pro_a"
    });

    assert.equal(assignment.agentId, "router");
    assert.equal(assignment.provider, "codex");
    assert.equal(assignment.accountPoolId, "pool_codex_pro_main");

    const listed = service.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.agentId, "router");
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("AgentModelAssignmentService rejects mismatched provider/pool/profile combinations", () => {
  const dbPath = createSeededDbPath();
  const service = new AgentModelAssignmentService(dbPath);

  try {
    assert.throws(
      () =>
        service.upsert("probe", {
          provider: "gemini",
          accountPoolId: "pool_codex_pro_main",
          runtimeProfileId: "rt_codex_builder_pro_a"
        }),
      (error: unknown) => {
        assert.ok(error instanceof DbServiceError);
        assert.equal(error.code, "BAD_REQUEST");
        return true;
      }
    );
  } finally {
    cleanupDbPath(dbPath);
  }
});
