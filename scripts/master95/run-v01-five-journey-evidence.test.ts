import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeFiveJourneyEvidence } from "./run-v01-five-journey-evidence.ts";

const journeys = ["project-agent", "task-progress", "approval", "failure-retry", "artifact-close"] as const;

describe("V01 five-journey evidence summary", () => {
  it("derives exact candidate evidence counts without inventing successes", () => {
    const executions = Array.from({ length: 20 }, (_, index) => ({
      journey_id: journeys[index % journeys.length],
      attempt: Math.floor(index / journeys.length) + 1,
      success: index !== 19,
      error: index === 19 ? "failure" : null,
      preview_id: `preview-${index}`,
      approval_id: `approval-${index}`,
      approval_receipt_sha256: (index + 1).toString(16).padStart(64, "0"),
      idempotency_replay_verified: index !== 19,
      first_sequence: index === 19 ? null : index * 2 + 1,
      last_sequence: index === 19 ? null : index * 2 + 2,
    }));
    const result = summarizeFiveJourneyEvidence({
      executions,
      journalEventCount: 38,
      journalSha256: "a".repeat(64),
      checkpointSha256: "b".repeat(64),
      mutationDbSha256: "c".repeat(64),
      lastEventHash: "d".repeat(64),
      externalEffectCount: 0,
      crossProjectLeakCount: 0,
      sqliteRestartVerified: true,
    });

    assert.equal(result.attempt_count, 20);
    assert.equal(result.success_count, 19);
    assert.equal(result.success_rate, 0.95);
    assert.equal(result.approval_receipt_sha256.length, 19);
    assert.equal(result.idempotency_replay_count, 19);
    assert.equal(result.sqlite_restart_verified, true);
    assert.equal(result.journal_event_ranges.length, 19);
    assert.deepEqual(result.per_journey["artifact-close"], { attempts: 4, successes: 3 });
  });
});
