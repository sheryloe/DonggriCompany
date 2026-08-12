import { createMaster95DefaultAgentRegistry, type Master95AgentVersionRegistry } from "./agent-registry.js";
import type { Master95DurableStateStore } from "./durable-state-store.js";
import {
  evaluateMaster95Policy,
  type Master95Department,
  type Master95RuntimeOperationClass,
} from "./agent-runtime.js";
import { createMaster95DefaultProjectRegistry, type Master95ProjectRegistry } from "./project-registry.js";

export type Master95CooExecutionInput = {
  project_id: string;
  task_id: string;
  run_id: string;
  trace_id: string;
  occurred_at?: string;
  objective: string;
  operation_class: Master95RuntimeOperationClass;
  target_path?: string | null;
  allowed_paths?: string[];
  approvals?: string[];
  lane_id?: string | null;
  role_agent?: string | null;
  max_iterations?: number;
  max_retries_per_phase?: number;
  cancel_after_step?: number | null;
};

export type Master95CooRoutingStep = {
  order: number;
  department: Master95Department;
  reason_code: string;
  skill_id: string;
  tool_id: string;
  operation_class: Master95RuntimeOperationClass;
};

export type Master95CooExecutionResult = {
  status: "completed" | "waiting_approval" | "failed" | "canceled" | "rejected";
  policy_decision: "allow" | "approval_required" | "block";
  routing: Master95CooRoutingStep[];
  executed_steps: number;
  retry_count: number;
  escalation_reason: string | null;
  run_id: string;
  trace_id: string;
};

export type Master95PhaseExecutor = (
  step: Master95CooRoutingStep,
  attempt: number,
) => { ok: true; evidence_refs?: string[] } | { ok: false; reason: string; retryable: boolean };

export class Master95CooOrchestrator {
  constructor(
    readonly state: Master95DurableStateStore,
    readonly agents: Master95AgentVersionRegistry = createMaster95DefaultAgentRegistry(),
    readonly projects: Master95ProjectRegistry = createMaster95DefaultProjectRegistry(),
    readonly executePhase: Master95PhaseExecutor = () => ({ ok: true, evidence_refs: ["EV-M95-ORCHESTRATOR-STEP"] }),
  ) {}

  execute(input: Master95CooExecutionInput): Master95CooExecutionResult {
    this.projects.require(input.project_id);
    const maxIterations = clamp(input.max_iterations ?? 20, 1, 20);
    const maxRetries = clamp(input.max_retries_per_phase ?? 2, 0, 3);
    if (input.lane_id || input.role_agent) {
      const lane = this.projects.authorizeLane({
        project_id: input.project_id,
        lane_id: required(input.lane_id, "lane_id"),
        role_agent: required(input.role_agent, "role_agent"),
      });
      if (lane.decision === "block") {
        return this.result(input, "rejected", "block", [], 0, 0, lane.reason_code);
      }
    }

    const policy = evaluateMaster95Policy({
      operation_class: input.operation_class,
      department: input.operation_class === "write_repo_code" ? "IMPLEMENT" : "CONTROL",
      path: input.target_path,
      approvals: input.approvals,
      allowed_paths: input.allowed_paths,
    });
    const routing = buildRouting(input.operation_class);
    this.state.append({
      ...eventBase(input, "task"),
      event_type: "task.created",
      payload: { objective: input.objective },
    });
    this.state.append({
      ...eventBase(input, "start"),
      event_type: "run.started",
      payload: { operation_class: input.operation_class, routing: routing.map((step) => step.department) },
    });

    if (policy.decision !== "allow") {
      this.state.append({
        ...eventBase(input, "policy"),
        event_type: "run.step_completed",
        payload: { department: "CONTROL", decision: policy.decision, reason_code: policy.reason_code },
      });
      return this.result(
        input,
        policy.decision === "approval_required" ? "waiting_approval" : "rejected",
        policy.decision,
        routing,
        1,
        0,
        policy.reason_code,
      );
    }

    let executedSteps = 0;
    let retryCount = 0;
    const visitedHandoffs = new Set<string>();
    for (const step of routing) {
      if (executedSteps >= maxIterations) {
        return this.fail(input, routing, executedSteps, retryCount, "max_iterations_exceeded");
      }
      if (step.order > 1) {
        const edge = `${routing[step.order - 2].department}->${step.department}`;
        if (visitedHandoffs.has(edge))
          return this.fail(input, routing, executedSteps, retryCount, "handoff_cycle_detected");
        visitedHandoffs.add(edge);
      }
      const authorization = this.agents.authorizeExecution({
        agent_id: step.department,
        project_id: input.project_id,
        skill_id: step.skill_id,
        tool_id: step.tool_id,
        operation_class: step.operation_class,
      });
      if (authorization.decision === "block") {
        return this.fail(input, routing, executedSteps, retryCount, `agent_authorization:${authorization.reason_code}`);
      }

      let phaseResult: ReturnType<Master95PhaseExecutor> = { ok: false, reason: "not_executed", retryable: false };
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        phaseResult = this.executePhase(step, attempt);
        if (phaseResult.ok) break;
        if (!phaseResult.retryable || attempt === maxRetries) break;
        retryCount += 1;
      }
      if (!phaseResult.ok)
        return this.fail(
          input,
          routing,
          executedSteps,
          retryCount,
          `phase_failed:${step.department}:${phaseResult.reason}`,
        );

      executedSteps += 1;
      this.state.append({
        ...eventBase(input, `step:${step.order}`),
        event_type: "run.step_completed",
        payload: {
          order: step.order,
          department: step.department,
          reason_code: step.reason_code,
          evidence_refs: phaseResult.evidence_refs ?? [],
        },
      });
      this.state.checkpoint({
        ...checkpointBase(input, `checkpoint:${step.order}`),
        step: step.order,
        state: { department: step.department, executed_steps: executedSteps, retry_count: retryCount },
      });
      if (input.cancel_after_step === executedSteps) {
        this.state.append({
          ...eventBase(input, "cancel"),
          event_type: "run.canceled",
          payload: { canceled_after_step: executedSteps },
        });
        return this.result(input, "canceled", "allow", routing, executedSteps, retryCount, "cancel_requested");
      }
    }

    this.state.append({
      ...eventBase(input, "complete"),
      event_type: "run.completed",
      payload: { executed_steps: executedSteps, retry_count: retryCount },
    });
    return this.result(input, "completed", "allow", routing, executedSteps, retryCount, null);
  }

  fail(
    input: Master95CooExecutionInput,
    routing: Master95CooRoutingStep[],
    executedSteps: number,
    retryCount: number,
    reason: string,
  ) {
    this.state.append({
      ...eventBase(input, `fail:${executedSteps}:${retryCount}`),
      event_type: "run.failed",
      payload: { reason, escalation_department: "CONTROL" },
    });
    return this.result(input, "failed", "allow", routing, executedSteps, retryCount, reason);
  }

  result(
    input: Master95CooExecutionInput,
    status: Master95CooExecutionResult["status"],
    policyDecision: Master95CooExecutionResult["policy_decision"],
    routing: Master95CooRoutingStep[],
    executedSteps: number,
    retryCount: number,
    escalationReason: string | null,
  ): Master95CooExecutionResult {
    return {
      status,
      policy_decision: policyDecision,
      routing,
      executed_steps: executedSteps,
      retry_count: retryCount,
      escalation_reason: escalationReason,
      run_id: input.run_id,
      trace_id: input.trace_id,
    };
  }
}

export function buildRouting(operation: Master95RuntimeOperationClass): Master95CooRoutingStep[] {
  const departments: Master95Department[] =
    operation === "write_repo_code"
      ? ["SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"]
      : operation === "write_control_plane_docs"
        ? ["SPEC", "REVIEW", "OPS"]
        : operation === "read_repo"
          ? ["EXPLORE", "REVIEW", "OPS"]
          : operation === "read_control_plane"
            ? ["SPEC", "REVIEW", "OPS"]
            : operation === "runtime_preview"
              ? ["OPS", "REVIEW"]
              : ["CONTROL"];
  return departments.map((department, index) => ({
    order: index + 1,
    department,
    reason_code: routeReason(department, operation),
    ...agentCapability(department, operation),
  }));
}

function agentCapability(department: Master95Department, objectiveOperation: Master95RuntimeOperationClass) {
  switch (department) {
    case "CONTROL":
      return { skill_id: "routing.plan", tool_id: "policy.preview", operation_class: "runtime_preview" as const };
    case "SPEC":
      return { skill_id: "sdd.trace", tool_id: "control-plane.read", operation_class: "read_control_plane" as const };
    case "EXPLORE":
      return { skill_id: "repo.inspect", tool_id: "repo.read", operation_class: "read_repo" as const };
    case "IMPLEMENT":
      return {
        skill_id: "repo.write",
        tool_id: "repo.patch",
        operation_class:
          objectiveOperation === "write_repo_code" ? ("write_repo_code" as const) : ("runtime_preview" as const),
      };
    case "REVIEW":
      return {
        skill_id: "review.report",
        tool_id: "control-plane.read",
        operation_class: "read_control_plane" as const,
      };
    case "OPS":
      return { skill_id: "operations.report", tool_id: "runtime.preview", operation_class: "runtime_preview" as const };
  }
}

function routeReason(department: Master95Department, operation: Master95RuntimeOperationClass) {
  return `${operation}:${department.toLowerCase()}_responsibility`;
}

function eventBase(input: Master95CooExecutionInput, suffix: string) {
  return {
    project_id: input.project_id,
    task_id: input.task_id,
    run_id: input.run_id,
    trace_id: input.trace_id,
    idempotency_key: `${input.run_id}:${suffix}`,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
  };
}

function checkpointBase(input: Master95CooExecutionInput, suffix: string) {
  return eventBase(input, suffix);
}

function required(value: string | null | undefined, field: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.trunc(value), min), max);
}
