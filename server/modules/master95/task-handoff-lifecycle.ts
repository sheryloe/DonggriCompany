import { z } from "zod";
import {
  MASTER95_TASK_STATUSES,
  transitionMaster95TaskStatus,
  type Master95Department,
  type Master95TaskStatus,
} from "./agent-runtime.js";
import { createMaster95DefaultProjectRegistry, type Master95ProjectRegistry } from "./project-registry.js";

const NonEmpty = z.string().trim().min(1);
export const Master95LifecycleTaskSchema = z
  .object({
    task_id: NonEmpty,
    context_id: NonEmpty,
    project_id: NonEmpty,
    run_id: NonEmpty,
    trace_id: NonEmpty,
    status: z.enum(MASTER95_TASK_STATUSES),
    objective: NonEmpty,
    acceptance_criteria: z.array(NonEmpty).min(1),
    artifact_ids: z.array(NonEmpty),
    additional_inputs: z.array(NonEmpty),
    remaining_time_seconds: z.number().int().nonnegative(),
    remaining_cost_units: z.number().nonnegative(),
    remaining_handoffs: z.number().int().nonnegative(),
    completion_criteria: z.array(NonEmpty).min(1),
    pause_reason: NonEmpty.nullable(),
  })
  .strict();

export const Master95HandoffContextSchema = z
  .object({
    handoff_id: NonEmpty,
    task_id: NonEmpty,
    run_id: NonEmpty,
    trace_id: NonEmpty,
    project_id: NonEmpty,
    from_agent: z.enum(["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"]),
    to_agent: z.enum(["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"]),
    purpose: NonEmpty,
    work_scope: z.array(NonEmpty).min(1),
    constraints: z.array(NonEmpty).min(1),
    results_so_far: z.array(NonEmpty).min(1),
    artifact_ids: z.array(NonEmpty),
    memory_refs: z.array(NonEmpty),
    acceptance_criteria: z.array(NonEmpty).min(1),
    remaining_time_seconds: z.number().int().nonnegative(),
    remaining_cost_units: z.number().nonnegative(),
    approval_status: z.enum(["not_required", "pending", "approved", "rejected"]),
    remaining_handoffs: z.number().int().nonnegative(),
    completion_criteria: z.array(NonEmpty).min(1),
    status: z.enum(["created", "accepted", "rejected"]),
  })
  .strict()
  .refine((handoff) => handoff.from_agent !== handoff.to_agent, { message: "handoff_agents_must_differ" });

export type Master95LifecycleTask = z.infer<typeof Master95LifecycleTaskSchema>;
export type Master95HandoffContext = z.infer<typeof Master95HandoffContextSchema>;

export class Master95TaskHandoffLifecycle {
  readonly #tasks = new Map<string, Master95LifecycleTask>();
  readonly #handoffs = new Map<string, Master95HandoffContext>();
  readonly #toolCalls: Array<{ task_id: string; run_id: string; tool_call_id: string }> = [];

  constructor(readonly projects: Master95ProjectRegistry = createMaster95DefaultProjectRegistry()) {}

  createTask(input: unknown) {
    const task = Master95LifecycleTaskSchema.parse(input);
    this.projects.require(task.project_id);
    if (this.#tasks.has(task.task_id)) throw new Error("task_already_exists");
    this.#tasks.set(task.task_id, structuredClone(task));
    return structuredClone(task);
  }

  queryTask(taskId: string) {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error("task_not_found");
    return {
      task: structuredClone(task),
      handoffs: [...this.#handoffs.values()]
        .filter((handoff) => handoff.task_id === taskId)
        .map((item) => structuredClone(item)),
      tool_calls: this.#toolCalls.filter((call) => call.task_id === taskId).map((item) => ({ ...item })),
    };
  }

  accept(taskId: string) {
    return this.#transition(taskId, "accept");
  }

  pause(taskId: string, reason: string) {
    const task = this.#transition(taskId, "request_input");
    task.pause_reason = required(reason, "pause_reason");
    this.#tasks.set(taskId, task);
    return structuredClone(task);
  }

  resume(taskId: string, additionalInput: string) {
    const task = this.#transition(taskId, "resume");
    task.additional_inputs.push(required(additionalInput, "additional_input"));
    task.pause_reason = null;
    this.#tasks.set(taskId, task);
    return structuredClone(task);
  }

  cancel(taskId: string) {
    return this.#transition(taskId, "cancel");
  }

  createHandoff(input: unknown) {
    const handoff = Master95HandoffContextSchema.parse(input);
    const task = this.#requireTask(handoff.task_id);
    if (
      handoff.run_id !== task.run_id ||
      handoff.project_id !== task.project_id ||
      handoff.trace_id !== task.trace_id
    ) {
      throw new Error("handoff_task_context_mismatch");
    }
    if (task.status !== "WORKING") throw new Error("handoff_requires_working_task");
    if (task.remaining_handoffs <= 0 || handoff.remaining_handoffs >= task.remaining_handoffs) {
      throw new Error("handoff_budget_invalid");
    }
    if (this.#wouldCreateCycle(task.task_id, handoff.from_agent, handoff.to_agent))
      throw new Error("circular_handoff_blocked");
    for (const artifactId of handoff.artifact_ids) {
      if (!task.artifact_ids.includes(artifactId)) throw new Error("handoff_artifact_not_linked_to_task");
    }
    if (this.#handoffs.has(handoff.handoff_id)) throw new Error("handoff_already_exists");
    this.#handoffs.set(handoff.handoff_id, structuredClone(handoff));
    task.remaining_handoffs = handoff.remaining_handoffs;
    this.#tasks.set(task.task_id, task);
    return structuredClone(handoff);
  }

  attachArtifact(input: { task_id: string; run_id: string; artifact_id: string }) {
    const task = this.#requireTask(input.task_id);
    if (input.run_id !== task.run_id) throw new Error("artifact_run_mismatch");
    const artifactId = required(input.artifact_id, "artifact_id");
    if (!task.artifact_ids.includes(artifactId)) task.artifact_ids.push(artifactId);
    this.#tasks.set(task.task_id, task);
    return structuredClone(task);
  }

  recordToolCall(input: { task_id: string; run_id: string; tool_call_id: string }) {
    const task = this.#requireTask(input.task_id);
    if (["COMPLETED", "FAILED", "CANCELED", "REJECTED"].includes(task.status)) {
      throw new Error("terminal_task_tool_execution_denied");
    }
    if (input.run_id !== task.run_id) throw new Error("tool_call_run_mismatch");
    const record = {
      task_id: task.task_id,
      run_id: task.run_id,
      tool_call_id: required(input.tool_call_id, "tool_call_id"),
    };
    this.#toolCalls.push(record);
    return { ...record };
  }

  #transition(taskId: string, event: Parameters<typeof transitionMaster95TaskStatus>[1]) {
    const task = this.#requireTask(taskId);
    const transition = transitionMaster95TaskStatus(task.status, event);
    if (!transition.ok) throw new Error(transition.error);
    task.status = transition.to;
    this.#tasks.set(taskId, task);
    return task;
  }

  #requireTask(taskId: string) {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error("task_not_found");
    return structuredClone(task);
  }

  #wouldCreateCycle(taskId: string, fromAgent: Master95Department, toAgent: Master95Department) {
    const edges = [...this.#handoffs.values()]
      .filter((handoff) => handoff.task_id === taskId && handoff.status !== "rejected")
      .map((handoff) => [handoff.from_agent, handoff.to_agent] as const);
    edges.push([fromAgent, toAgent]);
    const graph = new Map<Master95Department, Master95Department[]>();
    for (const [from, to] of edges) graph.set(from, [...(graph.get(from) ?? []), to]);
    const seen = new Set<Master95Department>();
    const stack = new Set<Master95Department>();
    const visit = (node: Master95Department): boolean => {
      if (stack.has(node)) return true;
      if (seen.has(node)) return false;
      seen.add(node);
      stack.add(node);
      for (const next of graph.get(node) ?? []) if (visit(next)) return true;
      stack.delete(node);
      return false;
    };
    return [...graph.keys()].some(visit);
  }
}

export function createMaster95LifecycleTask(suffix: string): Master95LifecycleTask {
  return {
    task_id: `task:lifecycle:${suffix}`,
    context_id: `context:lifecycle:${suffix}`,
    project_id: "project:BloggerGent",
    run_id: `run:lifecycle:${suffix}`,
    trace_id: `trace:lifecycle:${suffix}`,
    status: "SUBMITTED",
    objective: "BloggerGent read-only lifecycle fixture",
    acceptance_criteria: ["evidence recorded"],
    artifact_ids: [],
    additional_inputs: [],
    remaining_time_seconds: 1800,
    remaining_cost_units: 10,
    remaining_handoffs: 5,
    completion_criteria: ["review passed"],
    pause_reason: null,
  };
}

function required(value: string | null | undefined, field: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}
