import { describe, expect, it } from "vitest";
import {
  Master95TaskHandoffLifecycle,
  createMaster95LifecycleTask,
  type Master95HandoffContext,
} from "./task-handoff-lifecycle.ts";

describe("Master95 Task and Handoff lifecycle", () => {
  it("queries, pauses, resumes the same Task with additional input, and cancels", () => {
    const lifecycle = new Master95TaskHandoffLifecycle();
    const task = lifecycle.createTask(createMaster95LifecycleTask("basic"));
    lifecycle.accept(task.task_id);
    lifecycle.pause(task.task_id, "operator input needed");
    expect(lifecycle.resume(task.task_id, "continue with EN lane only")).toMatchObject({
      task_id: task.task_id,
      status: "WORKING",
      additional_inputs: ["continue with EN lane only"],
    });
    expect(lifecycle.cancel(task.task_id)).toMatchObject({ status: "CANCELED" });
    expect(lifecycle.queryTask(task.task_id).task.task_id).toBe(task.task_id);
  });

  it("requires complete Handoff context", () => {
    const lifecycle = workingLifecycle("context");
    expect(() => lifecycle.createHandoff({ ...handoff("context", "CONTROL", "SPEC"), purpose: "" })).toThrow();
  });

  it("blocks circular Handoffs", () => {
    const lifecycle = workingLifecycle("cycle");
    lifecycle.createHandoff(handoff("cycle", "CONTROL", "SPEC", 4));
    expect(() => lifecycle.createHandoff(handoff("cycle", "SPEC", "CONTROL", 3, "handoff:cycle:2"))).toThrow(
      "circular_handoff_blocked",
    );
  });

  it("binds Artifacts to the exact Task and Run", () => {
    const lifecycle = workingLifecycle("artifact");
    expect(() =>
      lifecycle.attachArtifact({ task_id: "task:lifecycle:artifact", run_id: "run:wrong", artifact_id: "artifact:1" }),
    ).toThrow("artifact_run_mismatch");
    lifecycle.attachArtifact({
      task_id: "task:lifecycle:artifact",
      run_id: "run:lifecycle:artifact",
      artifact_id: "artifact:1",
    });
    expect(lifecycle.queryTask("task:lifecycle:artifact").task.artifact_ids).toEqual(["artifact:1"]);
  });

  it("blocks Tool execution after cancellation", () => {
    const lifecycle = workingLifecycle("cancel-tool");
    lifecycle.cancel("task:lifecycle:cancel-tool");
    expect(() =>
      lifecycle.recordToolCall({
        task_id: "task:lifecycle:cancel-tool",
        run_id: "run:lifecycle:cancel-tool",
        tool_call_id: "tool:late",
      }),
    ).toThrow("terminal_task_tool_execution_denied");
    expect(lifecycle.queryTask("task:lifecycle:cancel-tool").tool_calls).toHaveLength(0);
  });

  it("decrements and enforces Handoff budget", () => {
    const lifecycle = workingLifecycle("budget");
    lifecycle.createHandoff(handoff("budget", "CONTROL", "SPEC", 4));
    expect(lifecycle.queryTask("task:lifecycle:budget").task.remaining_handoffs).toBe(4);
    expect(() => lifecycle.createHandoff(handoff("budget", "SPEC", "EXPLORE", 4, "handoff:budget:2"))).toThrow(
      "handoff_budget_invalid",
    );
  });
});

function workingLifecycle(suffix: string) {
  const lifecycle = new Master95TaskHandoffLifecycle();
  lifecycle.createTask(createMaster95LifecycleTask(suffix));
  lifecycle.accept(`task:lifecycle:${suffix}`);
  return lifecycle;
}

function handoff(
  suffix: string,
  from_agent: Master95HandoffContext["from_agent"],
  to_agent: Master95HandoffContext["to_agent"],
  remaining_handoffs = 4,
  handoff_id = `handoff:${suffix}:1`,
): Master95HandoffContext {
  return {
    handoff_id,
    task_id: `task:lifecycle:${suffix}`,
    run_id: `run:lifecycle:${suffix}`,
    trace_id: `trace:lifecycle:${suffix}`,
    project_id: "project:BloggerGent",
    from_agent,
    to_agent,
    purpose: "bounded lifecycle handoff",
    work_scope: ["read-only routing"],
    constraints: ["no external effects"],
    results_so_far: ["source read"],
    artifact_ids: [],
    memory_refs: [],
    acceptance_criteria: ["evidence recorded"],
    remaining_time_seconds: 1200,
    remaining_cost_units: 8,
    approval_status: "not_required",
    remaining_handoffs,
    completion_criteria: ["review passed"],
    status: "created",
  };
}
