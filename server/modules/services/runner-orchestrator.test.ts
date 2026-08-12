import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { applyOAuthRunnerIsolationSchema } from "../bootstrap/schema/oauth-runner-isolation.ts";
import { OfficeRunnerOrchestrator } from "./runner-orchestrator.ts";

describe("OfficeRunnerOrchestrator", () => {
  let db: DatabaseSync;
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousEnv = { ...process.env };
    process.env.OFFICE_RUNNER_DOCKER_ENABLED = "0";
    process.env.OFFICE_RUNNER_MAX_ACTIVE = "5";
    process.env.OFFICE_RUNNER_IDLE_TTL_MS = "900000";
    db = new DatabaseSync(":memory:");
    applyOAuthRunnerIsolationSchema(db);
  });

  afterEach(() => {
    process.env = previousEnv;
    db.close();
  });

  it("limits active runners to maxActive and queues overflow in FIFO", () => {
    const events: Array<{ type: string; payload: unknown }> = [];
    const orchestrator = new OfficeRunnerOrchestrator({
      db,
      nowMs: () => Date.now(),
      broadcast: (type, payload) => events.push({ type, payload }),
    });

    const requests: Array<{ provider: "jules" | "codex" | "agy"; pool: string }> = [
      { provider: "jules", pool: "pool-1" },
      { provider: "codex", pool: "pool-2" },
      { provider: "agy", pool: "pool-3" },
      { provider: "jules", pool: "pool-4" },
      { provider: "codex", pool: "pool-5" },
      { provider: "agy", pool: "pool-6" },
    ];

    const results = requests.map((entry) =>
      orchestrator.requestRunner(entry.provider, entry.pool, {
        kind: "activate",
      }),
    );

    expect(results.filter((r) => r.status === "active")).toHaveLength(5);
    expect(results.filter((r) => r.status === "queued")).toHaveLength(1);

    const activeRunners = orchestrator.listRunners().filter((row) => row.status === "active");
    expect(activeRunners).toHaveLength(5);
    const queued = orchestrator.listQueue().filter((item) => item.status === "queued");
    expect(queued).toHaveLength(1);
    expect(queued[0].accountPoolId).toBe("pool-6");

    const firstActive = activeRunners[0];
    orchestrator.deactivateRunner(firstActive.provider, firstActive.accountPoolId);

    const promoted = orchestrator
      .listRunners()
      .find((runner) => runner.provider === "agy" && runner.accountPoolId === "pool-6");
    expect(promoted?.status).toBe("active");
    expect(orchestrator.listQueue().filter((item) => item.status === "queued")).toHaveLength(0);
    expect(events.length).toBeGreaterThan(0);
  });

  it("keeps same provider+pool request on existing active runner without queueing", () => {
    const orchestrator = new OfficeRunnerOrchestrator({
      db,
      nowMs: () => Date.now(),
      broadcast: () => undefined,
    });

    const first = orchestrator.requestRunner("jules", "default", { kind: "activate" });
    const second = orchestrator.requestRunner("jules", "default", { kind: "activate" });

    expect(first.status).toBe("active");
    expect(second.status).toBe("active");
    expect(orchestrator.listRunners().filter((row) => row.status === "active")).toHaveLength(1);
    expect(orchestrator.listQueue().filter((item) => item.status === "queued")).toHaveLength(0);
  });
});
