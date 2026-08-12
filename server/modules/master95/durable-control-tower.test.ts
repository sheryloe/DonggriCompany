import { describe, expect, it } from "vitest";
import {
  MASTER95_CONTROL_TOWER_JOURNEYS,
  Master95DurableControlTower,
  Master95MemoryControlTowerJournal,
} from "./durable-control-tower.js";

const BLOGGERGENT = "project:BloggerGent";
const CARD_NEWS = "project:CardNewsAgent";
const NOW = "2026-07-15T04:30:00+09:00";

function runFiveJourneys(store: Master95DurableControlTower, attemptPrefix = "proof") {
  return MASTER95_CONTROL_TOWER_JOURNEYS.map((journeyId, index) =>
    store.runJourney({
      root_project_id: BLOGGERGENT,
      journey_id: journeyId,
      attempt_id: `${attemptPrefix}-${index + 1}`,
      occurred_at: NOW,
    }),
  );
}

describe("Master95DurableControlTower", () => {
  it("materializes all five original Control Tower journeys with linked operating evidence", () => {
    const store = new Master95DurableControlTower(new Master95MemoryControlTowerJournal());
    const results = runFiveJourneys(store);
    const snapshot = store.snapshot(BLOGGERGENT);

    expect(results.every((result) => !result.duplicate && !result.result.external_effect)).toBe(true);
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.projects[0]).toMatchObject({ root_project_id: BLOGGERGENT, sandbox_only: true });
    expect(snapshot.deployments).toEqual([
      expect.objectContaining({ agent_id: "OPS", version: "1.0.0", process_started: false }),
    ]);
    expect(snapshot.tasks).toHaveLength(4);
    expect(snapshot.runs).toHaveLength(5);
    expect(snapshot.approvals).toHaveLength(3);
    expect(snapshot.approvals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "approved",
          decided_by: "CONTROL",
          operation: "local-control-tower-proof",
          scope: expect.stringContaining(BLOGGERGENT),
          reason: "Step 18 approval clarity evidence",
          next_action: expect.stringContaining("승인 또는 거절"),
        }),
      ]),
    );
    expect(snapshot.approvals.filter((approval) => approval.status === "pending")).toHaveLength(2);
    expect(snapshot.handoffs).toEqual([
      expect.objectContaining({
        from_department: "OPS",
        to_department: "CONTROL",
        status: "accepted",
        constraints: ["no external effect", "same Project only"],
      }),
    ]);
    expect(snapshot.artifacts).toEqual([
      expect.objectContaining({ verified: true, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
    expect(snapshot.journeys).toHaveLength(5);
    expect(snapshot.event_count).toBe(32);

    const failedParent = snapshot.runs.find((run) => run.status === "failed");
    const retryChild = snapshot.runs.find((run) => run.parent_run_id === failedParent?.run_id);
    expect(failedParent).toMatchObject({
      failure_reason: "provider_timeout_after_checkpoint",
      next_action: expect.stringContaining("새 Run lineage"),
      child_run_ids: [retryChild?.run_id],
    });
    expect(retryChild).toMatchObject({ status: "completed", trace_id: expect.stringContaining(":2") });
    expect(retryChild?.spans).toHaveLength(6);
    expect(snapshot.tasks.find((task) => task.title.includes("Artifact"))).toMatchObject({
      status: "COMPLETED",
      memory_status: "skipped",
    });
  });

  it("is idempotent for a completed journey attempt", () => {
    const store = new Master95DurableControlTower(new Master95MemoryControlTowerJournal());
    const input = {
      root_project_id: BLOGGERGENT,
      journey_id: "artifact-close" as const,
      attempt_id: "same-attempt",
      occurred_at: NOW,
    };
    const first = store.runJourney(input);
    const second = store.runJourney(input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(store.snapshot(BLOGGERGENT).event_count).toBe(7);
  });

  it("rebuilds exactly the same state after journal replay", () => {
    const journal = new Master95MemoryControlTowerJournal();
    const first = new Master95DurableControlTower(journal);
    runFiveJourneys(first, "restart");
    const before = first.snapshot(BLOGGERGENT);

    const restarted = new Master95DurableControlTower(journal);
    expect(restarted.snapshot(BLOGGERGENT)).toEqual(before);
    expect(restarted.events(BLOGGERGENT).map((event) => event.sequence)).toEqual(
      Array.from({ length: 32 }, (_, index) => index + 1),
    );
  });

  it("denies cross-Project Run and Artifact reads", () => {
    const store = new Master95DurableControlTower(new Master95MemoryControlTowerJournal());
    runFiveJourneys(store, "isolation");
    const bloggerGent = store.snapshot(BLOGGERGENT);
    const runId = bloggerGent.runs[0].run_id;
    const artifactId = bloggerGent.artifacts[0].artifact_id;

    expect(() => store.getRun(CARD_NEWS, runId)).toThrow("control_tower_cross_project_access_denied");
    expect(() => store.getArtifact(CARD_NEWS, artifactId)).toThrow("control_tower_cross_project_access_denied");
    expect(store.snapshot(CARD_NEWS)).toMatchObject({ event_count: 0, tasks: [], runs: [], artifacts: [] });
  });

  it("passes 100 complete five-journey repetitions without loss or external effects", () => {
    const store = new Master95DurableControlTower(new Master95MemoryControlTowerJournal());
    let completed = 0;
    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const results = runFiveJourneys(store, `repeat-${attempt}`);
      if (results.length === 5 && results.every((result) => !result.duplicate && !result.result.external_effect)) {
        completed += 1;
      }
    }
    const snapshot = store.snapshot(BLOGGERGENT);

    expect(completed).toBe(100);
    expect(snapshot.journeys).toHaveLength(500);
    expect(snapshot.projects).toHaveLength(100);
    expect(snapshot.deployments).toHaveLength(100);
    expect(snapshot.tasks).toHaveLength(400);
    expect(snapshot.runs).toHaveLength(500);
    expect(snapshot.approvals).toHaveLength(300);
    expect(snapshot.handoffs).toHaveLength(100);
    expect(snapshot.artifacts).toHaveLength(100);
    expect(snapshot.artifacts.every((artifact) => artifact.verified)).toBe(true);
    expect(snapshot.event_count).toBe(3_200);
  });

  it("applies every explicit operator control with isolation, lineage, and idempotency", () => {
    const store = new Master95DurableControlTower(new Master95MemoryControlTowerJournal());
    runFiveJourneys(store, "controls");
    const initial = store.snapshot(BLOGGERGENT);
    const task = initial.tasks.find((item) => item.title.includes("진행 확인"))!;
    const run = initial.runs.find((item) => item.task_id === task.task_id)!;
    const failed = initial.runs.find((item) => item.status === "failed")!;
    const deployment = initial.deployments[0];
    const pending = initial.approvals.filter((approval) => approval.status === "pending");
    let attempt = 0;
    const act = (
      action_id: Parameters<Master95DurableControlTower["performAction"]>[0]["action_id"],
      target_id: string,
      value?: string,
    ) =>
      store.performAction({
        root_project_id: BLOGGERGENT,
        action_id,
        target_id,
        value,
        attempt_id: `control-${++attempt}`,
        occurred_at: NOW,
      });

    act("agent-recommend", task.task_id, "ops-db-quality");
    act("owner-change", task.task_id, "REVIEW");
    act("run-pause", run.run_id);
    act("run-resume", run.run_id);
    act("run-cancel", run.run_id);
    act("approval-approve", pending[0].approval_id);
    act("approval-reject", pending[1].approval_id);
    act("run-retry", failed.run_id);
    act("run-escalate", failed.run_id);
    act("agent-rollback", deployment.deployment_id, "0.9.0");
    const revoke = act("agent-revoke", deployment.deployment_id);

    const snapshot = store.snapshot(BLOGGERGENT);
    expect(snapshot.tasks.find((item) => item.task_id === task.task_id)).toMatchObject({
      recommended_owner: "OPS",
      recommended_agent: "ops-db-quality",
      owner_department: "REVIEW",
      status: "CANCELED",
    });
    expect(snapshot.approvals.map((approval) => approval.status)).toEqual(
      expect.arrayContaining(["approved", "approved", "rejected"]),
    );
    expect(snapshot.runs.filter((item) => item.parent_run_id === failed.run_id)).toHaveLength(2);
    expect(snapshot.handoffs.some((handoff) => handoff.purpose === "operator escalation")).toBe(true);
    expect(snapshot.deployments[0]).toMatchObject({
      lifecycle: "revoked",
      version: "0.9.0",
      rollback_from_version: "1.0.0",
      process_started: false,
    });
    expect(snapshot.event_count).toBe(54);

    const duplicate = store.performAction({
      root_project_id: BLOGGERGENT,
      action_id: "agent-revoke",
      target_id: deployment.deployment_id,
      attempt_id: "control-11",
      occurred_at: NOW,
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.result).toEqual(revoke.result);
    expect(store.snapshot(BLOGGERGENT).event_count).toBe(54);
    expect(() =>
      store.performAction({
        root_project_id: CARD_NEWS,
        action_id: "run-pause",
        target_id: run.run_id,
        attempt_id: "cross-control",
        occurred_at: NOW,
      }),
    ).toThrow("control_tower_cross_project_access_denied");
  });
});
