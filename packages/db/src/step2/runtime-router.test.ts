import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { withDatabase } from "../database.js";
import { runMigrations } from "../migrate.js";
import { runSeed } from "../seed.js";
import { RuntimeRouter } from "../index.js";

const createSeededDbPath = (): string => {
  const dbPath = path.join(tmpdir(), `donggri-step2-${randomUUID()}.sqlite`);
  runMigrations(dbPath);
  runSeed(dbPath);
  return dbPath;
};

const cleanupDbPath = (dbPath: string): void => {
  rmSync(dbPath, { force: true });
};

test("RuntimeRouter prefers explicit task/role match over generic rule", () => {
  const dbPath = createSeededDbPath();
  const router = new RuntimeRouter(dbPath);

  try {
    withDatabase((db) => {
      db.prepare(
        `
        INSERT INTO routing_rules (
          id,
          key,
          label,
          task_type,
          role_key,
          workspace_mode,
          priority,
          is_enabled,
          match_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        "rule_generic_any",
        "generic-any",
        "Generic Any Task",
        null,
        null,
        null,
        1,
        1,
        "{}",
        new Date().toISOString(),
        new Date().toISOString()
      );

      db.prepare(
        `
        INSERT INTO routing_rule_targets (
          id,
          routing_rule_id,
          runtime_profile_id,
          target_order,
          min_confidence,
          max_fatigue_percent,
          fallback_only,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        randomUUID(),
        "rule_generic_any",
        "rt_codex_builder_plus_a",
        1,
        0,
        null,
        0,
        new Date().toISOString()
      );
    }, dbPath);

    const request = {
      taskType: "coding",
      roleKey: "builder",
      requiredCapabilities: ["coding"]
    };

    const simulated = router.simulate(request);
    const resolved = router.resolve(request);

    assert.equal(simulated.decisionState, "resolved");
    assert.equal(simulated.selectedRuntimeProfileKey, "codex-builder-pro-a");
    assert.equal(resolved.decisionState, "resolved");
    assert.equal(resolved.selectedRuntimeProfileKey, "codex-builder-pro-a");
    assert.equal(simulated.decisionId, null);
    assert.ok(typeof resolved.decisionId === "string" && resolved.decisionId.length > 0);
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("RuntimeRouter applies fallback when primary target exceeds fatigue threshold", () => {
  const dbPath = createSeededDbPath();
  const router = new RuntimeRouter(dbPath);

  try {
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
        "pool_codex_pro_main",
        "derived",
        JSON.stringify({ source: "test" }),
        90,
        100,
        "percent",
        90,
        "critical",
        0.85,
        new Date().toISOString()
      );
    }, dbPath);

    const decision = router.simulate({
      taskType: "coding",
      roleKey: "builder",
      requiredCapabilities: ["coding"]
    });

    assert.equal(decision.decisionState, "fallback");
    assert.equal(decision.selectedRuntimeProfileKey, "claude-builder-a");
    assert.ok(decision.fallbackChain.includes("claude-builder-a"));
  } finally {
    cleanupDbPath(dbPath);
  }
});

test("RuntimeRouter returns no_route when all candidates are disabled", () => {
  const dbPath = createSeededDbPath();
  const router = new RuntimeRouter(dbPath);

  try {
    withDatabase((db) => {
      db.prepare(
        `
        UPDATE account_pools
        SET is_enabled = 0,
            status = 'disabled',
            updated_at = ?
        WHERE id IN ('pool_codex_pro_main', 'pool_claude_pro_main')
        `
      ).run(new Date().toISOString());
    }, dbPath);

    const decision = router.simulate({
      taskType: "coding",
      roleKey: "builder"
    });

    assert.equal(decision.decisionState, "no_route");
    assert.equal(decision.selectedRuntimeProfileKey, null);
    assert.match(decision.reasonText, /POOL_DISABLED/);
  } finally {
    cleanupDbPath(dbPath);
  }
});
