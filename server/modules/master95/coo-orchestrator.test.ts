import { describe, expect, it } from "vitest";
import { Master95CooOrchestrator } from "./coo-orchestrator.ts";
import { Master95DurableStateStore, Master95MemoryEventJournal } from "./durable-state-store.ts";

const input = (suffix: string, overrides = {}) => ({
  project_id: "project:BloggerGent",
  task_id: `task:coo:${suffix}`,
  run_id: `run:coo:${suffix}`,
  trace_id: `trace:coo:${suffix}`,
  objective: "BloggerGent read-only routing preview",
  operation_class: "runtime_preview" as const,
  lane_id: "google-travel-en",
  role_agent: "blogger-travel-en",
  ...overrides,
});

describe("Master95 live COO orchestrator", () => {
  it("completes representative read, preview, docs, and bounded code routes", () => {
    const operations = [
      "read_control_plane",
      "read_repo",
      "runtime_preview",
      "write_control_plane_docs",
      "write_repo_code",
    ] as const;
    for (const [index, operation] of operations.entries()) {
      const orchestrator = new Master95CooOrchestrator(new Master95DurableStateStore(new Master95MemoryEventJournal()));
      const result = orchestrator.execute(
        input(String(index), {
          operation_class: operation,
          target_path:
            operation === "write_repo_code"
              ? "G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/coo-orchestrator.ts"
              : null,
          allowed_paths: ["G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/*"],
          approvals: ["APR-M95-DOCS-001", "APR-M95-RUNTIME-ALPHA-001"],
        }),
      );
      expect(result.status).toBe("completed");
      expect(result.executed_steps).toBe(result.routing.length);
      expect(result.routing.every((step) => step.reason_code.length > 0)).toBe(true);
    }
  });

  it("stops approval-gated operations before specialist execution", () => {
    const store = new Master95DurableStateStore(new Master95MemoryEventJournal());
    const result = new Master95CooOrchestrator(store).execute(input("deploy", { operation_class: "deploy" }));
    expect(result).toMatchObject({
      status: "waiting_approval",
      policy_decision: "approval_required",
      executed_steps: 1,
    });
    expect(store.listEvents().some((event) => event.event_type === "run.completed")).toBe(false);
  });

  it("retries bounded failures and then succeeds", () => {
    let attempts = 0;
    const orchestrator = new Master95CooOrchestrator(
      new Master95DurableStateStore(new Master95MemoryEventJournal()),
      undefined,
      undefined,
      () => {
        attempts += 1;
        return attempts === 1 ? { ok: false, reason: "transient", retryable: true } : { ok: true };
      },
    );
    expect(orchestrator.execute(input("retry"))).toMatchObject({ status: "completed", retry_count: 1 });
  });

  it("escalates exhausted failures to CONTROL", () => {
    const store = new Master95DurableStateStore(new Master95MemoryEventJournal());
    const orchestrator = new Master95CooOrchestrator(store, undefined, undefined, () => ({
      ok: false,
      reason: "persistent",
      retryable: true,
    }));
    expect(orchestrator.execute(input("fail", { max_retries_per_phase: 2 }))).toMatchObject({
      status: "failed",
      retry_count: 2,
      escalation_reason: "phase_failed:OPS:persistent",
    });
    expect(store.listEvents().at(-1)).toMatchObject({
      event_type: "run.failed",
      payload: { escalation_department: "CONTROL" },
    });
  });

  it("cancels without executing later phases", () => {
    const store = new Master95DurableStateStore(new Master95MemoryEventJournal());
    const result = new Master95CooOrchestrator(store).execute(
      input("cancel", {
        operation_class: "write_repo_code",
        target_path: "G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/coo-orchestrator.ts",
        allowed_paths: ["G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/*"],
        approvals: ["APR-M95-RUNTIME-ALPHA-001"],
        cancel_after_step: 2,
      }),
    );
    expect(result).toMatchObject({ status: "canceled", executed_steps: 2 });
    expect(store.listEvents().filter((event) => event.event_type === "run.step_completed")).toHaveLength(2);
  });

  it("rejects a mismatched BloggerGent lane role", () => {
    const result = new Master95CooOrchestrator(new Master95DurableStateStore(new Master95MemoryEventJournal())).execute(
      input("lane", { role_agent: "blogger-travel-es" }),
    );
    expect(result).toMatchObject({ status: "rejected", escalation_reason: "lane_role_mismatch" });
  });
});
