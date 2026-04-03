import assert from "node:assert/strict";
import test from "node:test";

import { UsageNormalizer, mapFatigueState, scoreConfidence } from "./usage-normalizer.js";

test("mapFatigueState maps thresholds and unknown correctly", () => {
  assert.equal(mapFatigueState(0, true), "fresh");
  assert.equal(mapFatigueState(39, true), "fresh");
  assert.equal(mapFatigueState(40, true), "warm");
  assert.equal(mapFatigueState(64, true), "warm");
  assert.equal(mapFatigueState(65, true), "hot");
  assert.equal(mapFatigueState(84, true), "hot");
  assert.equal(mapFatigueState(85, true), "critical");
  assert.equal(mapFatigueState(100, true), "critical");
  assert.equal(mapFatigueState(10, false), "unknown");
});

test("scoreConfidence reflects precision priority and degraded penalty", () => {
  assert.equal(scoreConfidence("official", "ok"), 0.95);
  assert.equal(scoreConfidence("derived", "ok"), 0.75);
  assert.equal(scoreConfidence("manual", "ok"), 0.55);
  assert.equal(scoreConfidence("official", "degraded"), 0.75);
  assert.equal(scoreConfidence("derived", "degraded"), 0.55);
  assert.ok(Math.abs(scoreConfidence("manual", "degraded") - 0.35) < 1e-9);
});

test("UsageNormalizer computes normalized usage from direct probe signal", () => {
  const normalizer = new UsageNormalizer();
  const result = normalizer.normalize({
    provider: "codex",
    precision: "official",
    status: "success",
    usageValue: 42,
    limitValue: 100,
    unit: "percent",
    observedAt: "2026-04-03T00:00:00.000Z",
    fallbackSnapshot: null
  });

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.usage.normalizedPercent, 42);
  assert.equal(result.usage.status, "ok");
  assert.equal(result.usage.precision, "official");
  assert.equal(result.fatigueState, "warm");
  assert.equal(result.confidenceScore, 0.95);
});

test("UsageNormalizer falls back to last known snapshot when raw usage is unavailable", () => {
  const normalizer = new UsageNormalizer();
  const result = normalizer.normalize({
    provider: "claude",
    precision: "derived",
    status: "failure",
    usageValue: null,
    limitValue: null,
    unit: null,
    observedAt: "2026-04-03T00:00:00.000Z",
    fallbackSnapshot: {
      accountPoolId: "pool_claude_pro_main",
      precision: "manual",
      rawUsageValue: 7,
      rawLimitValue: 10,
      rawUnit: "requests",
      normalizedPercent: 70,
      fatigueState: "hot",
      confidenceScore: 0.55,
      observedAt: "2026-04-02T00:00:00.000Z"
    }
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.usage.status, "degraded");
  assert.equal(result.usage.precision, "manual");
  assert.equal(result.usage.normalizedPercent, 70);
  assert.equal(result.fatigueState, "hot");
  assert.ok(Math.abs(result.confidenceScore - 0.35) < 1e-9);
});

test("UsageNormalizer ignores stale fallback snapshot older than 24h", () => {
  const normalizer = new UsageNormalizer();
  const result = normalizer.normalize({
    provider: "claude",
    precision: "derived",
    status: "failure",
    usageValue: null,
    limitValue: null,
    unit: null,
    observedAt: "2026-04-03T01:00:00.000Z",
    fallbackSnapshot: {
      accountPoolId: "pool_claude_pro_main",
      precision: "manual",
      rawUsageValue: 7,
      rawLimitValue: 10,
      rawUnit: "requests",
      normalizedPercent: 70,
      fatigueState: "hot",
      confidenceScore: 0.55,
      observedAt: "2026-04-01T00:00:00.000Z"
    }
  });

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.usage.normalizedPercent, 0);
  assert.equal(result.usage.status, "degraded");
  assert.equal(result.fatigueState, "unknown");
});

test("UsageNormalizer returns unknown fatigue without direct or fallback signal", () => {
  const normalizer = new UsageNormalizer();
  const result = normalizer.normalize({
    provider: "gemini",
    precision: "official",
    status: "failure",
    usageValue: null,
    limitValue: null,
    unit: null,
    observedAt: "2026-04-03T00:00:00.000Z",
    fallbackSnapshot: null
  });

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.usage.normalizedPercent, 0);
  assert.equal(result.usage.status, "degraded");
  assert.equal(result.fatigueState, "unknown");
});
