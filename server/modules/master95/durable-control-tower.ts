import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createMaster95DefaultProjectRegistry, type Master95ProjectRegistry } from "./project-registry.js";

export const MASTER95_CONTROL_TOWER_RUNTIME_ROOT =
  "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\master95\\control-tower";

export const MASTER95_CONTROL_TOWER_EVENT_TYPES = [
  "control.project_created",
  "control.agent_deployed",
  "control.agent_rolled_back",
  "control.agent_revoked",
  "control.task_created",
  "control.owner_recommended",
  "control.owner_changed",
  "control.run_started",
  "control.run_paused",
  "control.run_resumed",
  "control.run_canceled",
  "control.run_failed",
  "control.approval_requested",
  "control.approval_decided",
  "control.run_retried",
  "control.handoff_created",
  "control.handoff_accepted",
  "control.run_completed",
  "control.artifact_registered",
  "control.artifact_verified",
  "control.task_closed",
  "control.action_completed",
  "control.journey_completed",
] as const;

export const MASTER95_CONTROL_TOWER_JOURNEYS = [
  "project-agent",
  "task-progress",
  "approval",
  "failure-retry",
  "artifact-close",
] as const;

export const MASTER95_CONTROL_TOWER_ACTIONS = [
  "owner-recommend",
  "agent-recommend",
  "owner-change",
  "run-pause",
  "run-resume",
  "run-cancel",
  "approval-approve",
  "approval-reject",
  "run-retry",
  "run-escalate",
  "agent-rollback",
  "agent-revoke",
] as const;

const NonEmpty = z.string().trim().min(1);
const Timestamp = z.iso.datetime({ offset: true });

export const Master95ControlTowerEventSchema = z
  .object({
    event_id: NonEmpty,
    event_type: z.enum(MASTER95_CONTROL_TOWER_EVENT_TYPES),
    root_project_id: NonEmpty,
    sequence: z.number().int().positive(),
    idempotency_key: NonEmpty,
    occurred_at: Timestamp,
    task_id: z.string().nullable(),
    run_id: z.string().nullable(),
    trace_id: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type Master95ControlTowerEvent = z.infer<typeof Master95ControlTowerEventSchema>;
export type Master95ControlTowerEventInput = Omit<Master95ControlTowerEvent, "event_id" | "sequence">;
export type Master95ControlTowerJourneyId = (typeof MASTER95_CONTROL_TOWER_JOURNEYS)[number];
export type Master95ControlTowerActionId = (typeof MASTER95_CONTROL_TOWER_ACTIONS)[number];

export type Master95ControlTowerProject = {
  project_id: string;
  root_project_id: string;
  display_name: string;
  created_at: string;
  sandbox_only: true;
};

export type Master95ControlTowerDeployment = {
  deployment_id: string;
  project_id: string;
  agent_id: string;
  version: string;
  lifecycle: "active" | "rolled_back" | "revoked";
  deployed_at: string;
  process_started: false;
  rollback_from_version?: string | null;
  revoked_at?: string | null;
};

export type Master95ControlTowerTask = {
  task_id: string;
  project_id: string;
  title: string;
  owner_department: string;
  recommended_owner: string;
  recommended_agent?: string;
  status: "SUBMITTED" | "WORKING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELED";
  risk_level: "low" | "medium" | "high";
  memory_status: "not_requested" | "skipped" | "stored";
  created_at: string;
  closed_at: string | null;
};

export type Master95ControlTowerSpan = {
  span_id: string;
  name: string;
  status: "ok" | "error";
  started_at: string;
  ended_at: string | null;
};

export type Master95ControlTowerRun = {
  run_id: string;
  project_id: string;
  task_id: string;
  trace_id: string;
  parent_run_id: string | null;
  child_run_ids: string[];
  owner_department: string;
  agent_version?: string;
  skill_version?: string;
  memory_version?: string;
  status: "running" | "paused" | "completed" | "failed" | "canceled";
  failure_reason: string | null;
  next_action: string | null;
  token_count: number;
  cost_usd: number;
  spans: Master95ControlTowerSpan[];
  started_at: string;
  completed_at: string | null;
};

export type Master95ControlTowerApproval = {
  approval_id: string;
  project_id: string;
  task_id: string;
  run_id: string;
  operation: string;
  scope: string;
  reason: string;
  expires_at: string;
  next_action: string;
  status: "pending" | "approved" | "rejected";
  decided_by: "CONTROL" | null;
  decided_at: string | null;
};

export type Master95ControlTowerHandoff = {
  handoff_id: string;
  project_id: string;
  task_id: string;
  run_id: string;
  trace_id: string;
  from_department: string;
  to_department: "CONTROL";
  purpose: string;
  scope: string;
  constraints: string[];
  artifact_refs: string[];
  acceptance_criteria: string[];
  status: "pending" | "accepted";
  accepted_at: string | null;
};

export type Master95ControlTowerArtifact = {
  artifact_id: string;
  project_id: string;
  task_id: string;
  run_id: string;
  trace_id: string;
  mime_type: "text/plain" | "application/json";
  content_preview: string;
  sha256: string;
  verified: boolean;
  created_at: string;
  verified_at: string | null;
};

export type Master95ControlTowerJourneyResult = {
  journey_id: Master95ControlTowerJourneyId;
  attempt_id: string;
  project_id: string;
  task_id: string | null;
  run_id: string | null;
  trace_id: string | null;
  completed_at: string;
  external_effect: false;
};

export type Master95ControlTowerActionResult = {
  action_id: Master95ControlTowerActionId;
  attempt_id: string;
  target_id: string;
  event_ids: string[];
  completed_at: string;
  external_effect: false;
};

export type Master95ControlTowerSnapshot = {
  root_project_id: string;
  root_project: {
    project_id: string;
    project_key: string;
    display_name: string;
    owner_department: "OPS";
    implementation_delegate: "IMPLEMENT";
    lifecycle_status: string;
    role_agents: string[];
    lanes: Array<{
      lane_id: string;
      group_id: string;
      role_agent: string;
      operating_mode: string;
    }>;
  };
  projects: Master95ControlTowerProject[];
  deployments: Master95ControlTowerDeployment[];
  tasks: Master95ControlTowerTask[];
  runs: Master95ControlTowerRun[];
  approvals: Master95ControlTowerApproval[];
  handoffs: Master95ControlTowerHandoff[];
  artifacts: Master95ControlTowerArtifact[];
  journeys: Master95ControlTowerJourneyResult[];
  event_count: number;
};

export interface Master95ControlTowerJournalAdapter {
  readAll(): Master95ControlTowerEvent[];
  append(event: Master95ControlTowerEvent): void;
}

export class Master95MemoryControlTowerJournal implements Master95ControlTowerJournalAdapter {
  readonly events: Master95ControlTowerEvent[] = [];

  readAll() {
    return structuredClone(this.events);
  }

  append(event: Master95ControlTowerEvent) {
    this.events.push(structuredClone(event));
  }
}

export class Master95JsonlControlTowerJournal implements Master95ControlTowerJournalAdapter {
  constructor(readonly filePath: string) {}

  readAll() {
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return [];
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return Master95ControlTowerEventSchema.parse(JSON.parse(line));
        } catch (error) {
          throw new Error(`control_tower_journal_corrupt_at_line_${index + 1}:${String(error)}`);
        }
      });
  }

  append(event: Master95ControlTowerEvent) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, { encoding: "utf8", flush: true });
  }
}

type MutableState = {
  projects: Map<string, Master95ControlTowerProject>;
  deployments: Map<string, Master95ControlTowerDeployment>;
  tasks: Map<string, Master95ControlTowerTask>;
  runs: Map<string, Master95ControlTowerRun>;
  approvals: Map<string, Master95ControlTowerApproval>;
  handoffs: Map<string, Master95ControlTowerHandoff>;
  artifacts: Map<string, Master95ControlTowerArtifact>;
  journeys: Map<string, Master95ControlTowerJourneyResult>;
};

export class Master95DurableControlTower {
  readonly #events: Master95ControlTowerEvent[] = [];
  readonly #idempotency = new Map<string, Master95ControlTowerEvent>();
  readonly #sequences = new Map<string, number>();
  readonly #state: MutableState = {
    projects: new Map(),
    deployments: new Map(),
    tasks: new Map(),
    runs: new Map(),
    approvals: new Map(),
    handoffs: new Map(),
    artifacts: new Map(),
    journeys: new Map(),
  };

  constructor(
    readonly adapter: Master95ControlTowerJournalAdapter,
    readonly projectRegistry: Master95ProjectRegistry = createMaster95DefaultProjectRegistry(),
  ) {
    for (const event of adapter.readAll()) this.#acceptReplayed(event);
  }

  snapshot(rootProjectId: string): Master95ControlTowerSnapshot {
    const rootProject = this.projectRegistry.require(this.#requireRoot(rootProjectId));
    const scoped = <T extends { project_id: string }>(values: Iterable<T>) =>
      [...values]
        .filter((value) => this.#belongsToRoot(rootProjectId, value.project_id))
        .map((value) => structuredClone(value));
    return {
      root_project_id: rootProjectId,
      root_project: {
        project_id: rootProject.project_id,
        project_key: rootProject.project_key,
        display_name: rootProject.display_name,
        owner_department: rootProject.owner_department,
        implementation_delegate: rootProject.implementation_delegate,
        lifecycle_status: rootProject.lifecycle_status,
        role_agents: [...new Set(rootProject.lanes.map((lane) => lane.role_agent))],
        lanes: rootProject.lanes.map((lane) => ({
          lane_id: lane.lane_id,
          group_id: lane.group_id,
          role_agent: lane.role_agent,
          operating_mode: lane.operating_mode,
        })),
      },
      projects: [...this.#state.projects.values()]
        .filter((project) => project.root_project_id === rootProjectId)
        .map((project) => structuredClone(project)),
      deployments: scoped(this.#state.deployments.values()),
      tasks: scoped(this.#state.tasks.values()),
      runs: scoped(this.#state.runs.values()),
      approvals: scoped(this.#state.approvals.values()),
      handoffs: scoped(this.#state.handoffs.values()),
      artifacts: scoped(this.#state.artifacts.values()),
      journeys: scoped(this.#state.journeys.values()),
      event_count: this.#events.filter((event) => event.root_project_id === rootProjectId).length,
    };
  }

  events(rootProjectId: string) {
    this.#requireRoot(rootProjectId);
    return this.#events
      .filter((event) => event.root_project_id === rootProjectId)
      .map((event) => structuredClone(event));
  }

  getRun(rootProjectId: string, runId: string) {
    this.#requireRoot(rootProjectId);
    const run = this.#run(rootProjectId, required(runId, "run_id"));
    return {
      run: structuredClone(run),
      task: structuredClone(this.#task(rootProjectId, run.task_id)),
      handoffs: [...this.#state.handoffs.values()]
        .filter((handoff) => handoff.run_id === run.run_id)
        .map((handoff) => structuredClone(handoff)),
      artifacts: [...this.#state.artifacts.values()]
        .filter((artifact) => artifact.run_id === run.run_id)
        .map((artifact) => structuredClone(artifact)),
      events: this.#events
        .filter((event) => event.root_project_id === rootProjectId && event.run_id === run.run_id)
        .map((event) => structuredClone(event)),
    };
  }

  getArtifact(rootProjectId: string, artifactId: string) {
    this.#requireRoot(rootProjectId);
    return structuredClone(this.#artifact(rootProjectId, required(artifactId, "artifact_id")));
  }

  runJourney(input: {
    root_project_id: string;
    journey_id: Master95ControlTowerJourneyId;
    attempt_id: string;
    occurred_at: string;
  }) {
    const rootProjectId = this.#requireRoot(input.root_project_id);
    const journeyId = z.enum(MASTER95_CONTROL_TOWER_JOURNEYS).parse(input.journey_id);
    const attemptId = required(input.attempt_id, "attempt_id");
    const occurredAt = Timestamp.parse(input.occurred_at);
    const journeyKey = `${rootProjectId}:${journeyId}:${attemptId}`;
    const existing = this.#state.journeys.get(journeyKey);
    if (existing) return { result: structuredClone(existing), duplicate: true, snapshot: this.snapshot(rootProjectId) };

    const ids = createJourneyIds(rootProjectId, journeyId, attemptId);
    if (journeyId === "project-agent") this.#runProjectAgentJourney(ids, occurredAt);
    if (journeyId === "task-progress") this.#runTaskProgressJourney(ids, occurredAt);
    if (journeyId === "approval") this.#runApprovalJourney(ids, occurredAt);
    if (journeyId === "failure-retry") this.#runFailureRetryJourney(ids, occurredAt);
    if (journeyId === "artifact-close") this.#runArtifactCloseJourney(ids, occurredAt);

    const result: Master95ControlTowerJourneyResult = {
      journey_id: journeyId,
      attempt_id: attemptId,
      project_id: ids.projectId,
      task_id: journeyId === "project-agent" ? null : ids.taskId,
      run_id: journeyId === "project-agent" ? null : journeyId === "failure-retry" ? ids.childRunId : ids.runId,
      trace_id: journeyId === "project-agent" ? null : journeyId === "failure-retry" ? ids.childTraceId : ids.traceId,
      completed_at: occurredAt,
      external_effect: false,
    };
    this.#append({
      rootProjectId,
      eventType: "control.journey_completed",
      idempotencyKey: `${journeyId}:${attemptId}:completed`,
      occurredAt,
      taskId: result.task_id,
      runId: result.run_id,
      traceId: result.trace_id,
      payload: { journey_key: journeyKey, ...result },
    });
    return { result, duplicate: false, snapshot: this.snapshot(rootProjectId) };
  }

  performAction(input: {
    root_project_id: string;
    action_id: Master95ControlTowerActionId;
    attempt_id: string;
    target_id: string;
    value?: string;
    occurred_at: string;
  }) {
    const rootProjectId = this.#requireRoot(input.root_project_id);
    const actionId = z.enum(MASTER95_CONTROL_TOWER_ACTIONS).parse(input.action_id);
    const attemptId = required(input.attempt_id, "attempt_id").replace(/[^A-Za-z0-9._-]/g, "-");
    const targetId = required(input.target_id, "target_id");
    const occurredAt = Timestamp.parse(input.occurred_at);
    const key = `action:${actionId}:${attemptId}`;
    const completion = this.#idempotency.get(`${rootProjectId}:${key}:completed`);
    if (completion) {
      return {
        result: structuredClone(completion.payload) as Master95ControlTowerActionResult,
        duplicate: true,
        snapshot: this.snapshot(rootProjectId),
      };
    }

    const eventIds: string[] = [];
    const append = (
      eventType: Master95ControlTowerEvent["event_type"],
      projectId: string,
      payload: Record<string, unknown>,
      taskId?: string | null,
      runId?: string | null,
      traceId?: string | null,
    ) => {
      const appended = this.#append({
        rootProjectId,
        eventType,
        idempotencyKey: `${key}:${eventIds.length + 1}`,
        occurredAt,
        taskId,
        runId,
        traceId,
        payload: { project_id: projectId, ...payload },
      });
      eventIds.push(appended.event.event_id);
    };

    if (actionId === "owner-recommend" || actionId === "agent-recommend" || actionId === "owner-change") {
      const task = this.#task(rootProjectId, targetId);
      if (actionId === "owner-recommend" || actionId === "agent-recommend") {
        const recommendation = required(
          input.value ?? this.#recommendedAgent(rootProjectId),
          actionId === "agent-recommend" ? "recommended_agent" : "recommended_owner",
        );
        append(
          "control.owner_recommended",
          task.project_id,
          {
            task_id: task.task_id,
            ...(actionId === "agent-recommend"
              ? { recommended_agent: recommendation }
              : { recommended_owner: recommendation }),
          },
          task.task_id,
        );
      } else {
        const owner = required(input.value ?? "REVIEW", "owner_department");
        const run = this.#latestRunForTask(rootProjectId, task.task_id);
        append(
          "control.owner_changed",
          task.project_id,
          { task_id: task.task_id, run_id: run.run_id, owner_department: owner, changed_by: "CONTROL" },
          task.task_id,
          run.run_id,
          run.trace_id,
        );
      }
    }

    if (actionId === "run-pause" || actionId === "run-resume" || actionId === "run-cancel") {
      const run = this.#run(rootProjectId, targetId);
      const eventType =
        actionId === "run-pause"
          ? "control.run_paused"
          : actionId === "run-resume"
            ? "control.run_resumed"
            : "control.run_canceled";
      append(
        eventType,
        run.project_id,
        { run_id: run.run_id, acted_by: "CONTROL" },
        run.task_id,
        run.run_id,
        run.trace_id,
      );
    }

    if (actionId === "approval-approve" || actionId === "approval-reject") {
      const approval = this.#approval(rootProjectId, targetId);
      append(
        "control.approval_decided",
        approval.project_id,
        {
          approval_id: approval.approval_id,
          decision: actionId === "approval-reject" ? "rejected" : "approved",
          decided_by: "CONTROL",
          decided_at: occurredAt,
        },
        approval.task_id,
        approval.run_id,
        this.#run(rootProjectId, approval.run_id).trace_id,
      );
    }

    if (actionId === "run-retry") {
      const parent = this.#run(rootProjectId, targetId);
      const childRunId = `${parent.run_id}:retry:${attemptId}`;
      const childTraceId = `${parent.trace_id}:retry:${attemptId}`;
      append(
        "control.run_retried",
        parent.project_id,
        {
          task_id: parent.task_id,
          parent_run_id: parent.run_id,
          child_run_id: childRunId,
          child_trace_id: childTraceId,
          owner_department: parent.owner_department,
          token_count: 418,
          cost_usd: 0.0127,
          spans: defaultSpans(childTraceId, occurredAt),
        },
        parent.task_id,
        parent.run_id,
        parent.trace_id,
      );
    }

    if (actionId === "run-escalate") {
      const run = this.#run(rootProjectId, targetId);
      append(
        "control.handoff_created",
        run.project_id,
        {
          handoff_id: `handoff:control-tower:action:${projectSlug(rootProjectId)}:${attemptId}`,
          task_id: run.task_id,
          run_id: run.run_id,
          trace_id: run.trace_id,
          from_department: run.owner_department,
          to_department: "CONTROL",
          purpose: "operator escalation",
          scope: `${run.project_id}:${run.task_id}:${run.run_id}`,
          constraints: ["no external effect", "same Project only"],
          artifact_refs: [],
          acceptance_criteria: ["cause visible", "next action visible", "CONTROL acceptance required"],
          status: "pending",
          accepted_at: null,
        },
        run.task_id,
        run.run_id,
        run.trace_id,
      );
    }

    if (actionId === "agent-rollback" || actionId === "agent-revoke") {
      const deployment = this.#deployment(rootProjectId, targetId);
      append(
        actionId === "agent-rollback" ? "control.agent_rolled_back" : "control.agent_revoked",
        deployment.project_id,
        actionId === "agent-rollback"
          ? {
              deployment_id: deployment.deployment_id,
              from_version: deployment.version,
              to_version: required(input.value ?? "0.9.0", "rollback_version"),
              process_started: false,
            }
          : { deployment_id: deployment.deployment_id, revoked_at: occurredAt, process_started: false },
      );
    }

    const result: Master95ControlTowerActionResult = {
      action_id: actionId,
      attempt_id: attemptId,
      target_id: targetId,
      event_ids: eventIds,
      completed_at: occurredAt,
      external_effect: false,
    };
    this.#append({
      rootProjectId,
      eventType: "control.action_completed",
      idempotencyKey: `${key}:completed`,
      occurredAt,
      payload: result,
    });
    return { result, duplicate: false, snapshot: this.snapshot(rootProjectId) };
  }

  #runProjectAgentJourney(ids: JourneyIds, occurredAt: string) {
    this.#append({
      rootProjectId: ids.rootProjectId,
      eventType: "control.project_created",
      idempotencyKey: `${ids.key}:project`,
      occurredAt,
      payload: {
        project_id: ids.projectId,
        root_project_id: ids.rootProjectId,
        display_name: `Control Tower ${ids.attemptId}`,
        created_at: occurredAt,
        sandbox_only: true,
      },
    });
    this.#append({
      rootProjectId: ids.rootProjectId,
      eventType: "control.agent_deployed",
      idempotencyKey: `${ids.key}:deployment`,
      occurredAt,
      payload: {
        deployment_id: ids.deploymentId,
        project_id: ids.projectId,
        agent_id: "OPS",
        version: "1.0.0",
        lifecycle: "active",
        deployed_at: occurredAt,
        process_started: false,
        rollback_from_version: null,
        revoked_at: null,
      },
    });
  }

  #runTaskProgressJourney(ids: JourneyIds, occurredAt: string) {
    this.#createTaskAndRun(ids, occurredAt, "작업 요청과 진행 확인", "low");
    this.#appendAction(ids, "control.owner_recommended", `${ids.key}:owner-recommended`, occurredAt, {
      project_id: ids.projectId,
      task_id: ids.taskId,
      recommended_owner: "OPS",
      reason: "Project scope operations request",
    });
    this.#appendAction(ids, "control.owner_changed", `${ids.key}:owner-changed`, occurredAt, {
      project_id: ids.projectId,
      task_id: ids.taskId,
      run_id: ids.runId,
      owner_department: "OPS",
      changed_by: "CONTROL",
    });
    this.#appendAction(ids, "control.run_paused", `${ids.key}:paused`, occurredAt, {
      project_id: ids.projectId,
      run_id: ids.runId,
      reason: "operator inspection",
    });
    this.#appendAction(ids, "control.run_resumed", `${ids.key}:resumed`, occurredAt, {
      project_id: ids.projectId,
      run_id: ids.runId,
      resumed_by: "CONTROL",
    });
  }

  #runApprovalJourney(ids: JourneyIds, occurredAt: string) {
    this.#createTaskAndRun(ids, occurredAt, "위험 작업 승인 처리", "high");
    this.#appendAction(ids, "control.approval_requested", `${ids.key}:approval-requested`, occurredAt, {
      approval_id: ids.approvalId,
      project_id: ids.projectId,
      task_id: ids.taskId,
      run_id: ids.runId,
      operation: "local-control-tower-proof",
      scope: `${ids.projectId}:task:${ids.taskId}`,
      reason: "Step 18 approval clarity evidence",
      expires_at: plusMinutes(occurredAt, 30),
      next_action: "CONTROL이 범위·이유·만료를 확인한 뒤 승인 또는 거절하세요.",
      status: "pending",
      decided_by: null,
      decided_at: null,
    });
    this.#appendAction(ids, "control.approval_decided", `${ids.key}:approval-decided`, occurredAt, {
      project_id: ids.projectId,
      approval_id: ids.approvalId,
      decision: "approved",
      decided_by: "CONTROL",
      decided_at: occurredAt,
    });
    for (const decision of ["approve", "reject"] as const) {
      this.#appendAction(ids, "control.approval_requested", `${ids.key}:approval-${decision}-candidate`, occurredAt, {
        approval_id: `${ids.approvalId}:${decision}-candidate`,
        project_id: ids.projectId,
        task_id: ids.taskId,
        run_id: ids.runId,
        operation: `local-control-tower-${decision}-candidate`,
        scope: `${ids.projectId}:task:${ids.taskId}:${decision}`,
        reason: `${decision} control evidence candidate`,
        expires_at: plusMinutes(occurredAt, 30),
        next_action: `CONTROL이 ${decision === "approve" ? "승인" : "거절"} 버튼을 검증하세요.`,
        status: "pending",
        decided_by: null,
        decided_at: null,
      });
    }
  }

  #runFailureRetryJourney(ids: JourneyIds, occurredAt: string) {
    this.#createTaskAndRun(ids, occurredAt, "실패 원인 확인과 재실행", "medium");
    this.#appendAction(ids, "control.run_failed", `${ids.key}:failed`, occurredAt, {
      project_id: ids.projectId,
      run_id: ids.runId,
      failure_reason: "provider_timeout_after_checkpoint",
      next_action: "CONTROL 승인 범위에서 새 Run lineage로 재시도하세요.",
    });
    this.#appendAction(ids, "control.run_retried", `${ids.key}:retried`, occurredAt, {
      project_id: ids.projectId,
      task_id: ids.taskId,
      parent_run_id: ids.runId,
      child_run_id: ids.childRunId,
      child_trace_id: ids.childTraceId,
      owner_department: "OPS",
      token_count: 418,
      cost_usd: 0.0127,
      spans: defaultSpans(ids.childTraceId, occurredAt),
    });
    this.#appendAction(ids, "control.handoff_created", `${ids.key}:handoff`, occurredAt, {
      handoff_id: ids.handoffId,
      project_id: ids.projectId,
      task_id: ids.taskId,
      run_id: ids.childRunId,
      trace_id: ids.childTraceId,
      from_department: "OPS",
      to_department: "CONTROL",
      purpose: "retry lineage review",
      scope: `${ids.projectId}:${ids.taskId}:${ids.childRunId}`,
      constraints: ["no external effect", "same Project only"],
      artifact_refs: [],
      acceptance_criteria: ["parent Run preserved", "new Trace issued", "cause and next action visible"],
      status: "pending",
      accepted_at: null,
    });
    this.#appendAction(ids, "control.handoff_accepted", `${ids.key}:handoff-accepted`, occurredAt, {
      project_id: ids.projectId,
      handoff_id: ids.handoffId,
      accepted_by: "CONTROL",
      accepted_at: occurredAt,
    });
    this.#appendAction(
      { ...ids, runId: ids.childRunId, traceId: ids.childTraceId },
      "control.run_completed",
      `${ids.key}:child-completed`,
      occurredAt,
      { project_id: ids.projectId, run_id: ids.childRunId, completed_at: occurredAt },
    );
  }

  #runArtifactCloseJourney(ids: JourneyIds, occurredAt: string) {
    this.#createTaskAndRun(ids, occurredAt, "결과 Artifact 확인 및 종료", "low");
    const contentPreview = JSON.stringify({ result: "verified", attempt_id: ids.attemptId });
    const sha256 = crypto.createHash("sha256").update(contentPreview).digest("hex");
    this.#appendAction(ids, "control.artifact_registered", `${ids.key}:artifact`, occurredAt, {
      artifact_id: ids.artifactId,
      project_id: ids.projectId,
      task_id: ids.taskId,
      run_id: ids.runId,
      trace_id: ids.traceId,
      mime_type: "application/json",
      content_preview: contentPreview,
      sha256,
      verified: false,
      created_at: occurredAt,
      verified_at: null,
    });
    this.#appendAction(ids, "control.artifact_verified", `${ids.key}:artifact-verified`, occurredAt, {
      project_id: ids.projectId,
      artifact_id: ids.artifactId,
      actual_sha256: sha256,
      verified_at: occurredAt,
    });
    this.#appendAction(ids, "control.run_completed", `${ids.key}:run-completed`, occurredAt, {
      project_id: ids.projectId,
      run_id: ids.runId,
      completed_at: occurredAt,
    });
    this.#appendAction(ids, "control.task_closed", `${ids.key}:task-closed`, occurredAt, {
      project_id: ids.projectId,
      task_id: ids.taskId,
      artifact_id: ids.artifactId,
      memory_status: "skipped",
      closed_at: occurredAt,
    });
  }

  #createTaskAndRun(ids: JourneyIds, occurredAt: string, title: string, riskLevel: "low" | "medium" | "high") {
    this.#append({
      rootProjectId: ids.rootProjectId,
      eventType: "control.task_created",
      idempotencyKey: `${ids.key}:task`,
      occurredAt,
      taskId: ids.taskId,
      runId: ids.runId,
      traceId: ids.traceId,
      payload: {
        task_id: ids.taskId,
        project_id: ids.projectId,
        title,
        owner_department: "OPS",
        recommended_owner: "OPS",
        recommended_agent: this.#recommendedAgent(ids.rootProjectId),
        status: riskLevel === "high" ? "WAITING_APPROVAL" : "WORKING",
        risk_level: riskLevel,
        memory_status: "not_requested",
        created_at: occurredAt,
        closed_at: null,
      },
    });
    this.#appendAction(ids, "control.run_started", `${ids.key}:run`, occurredAt, {
      run_id: ids.runId,
      project_id: ids.projectId,
      task_id: ids.taskId,
      trace_id: ids.traceId,
      parent_run_id: null,
      child_run_ids: [],
      owner_department: "OPS",
      agent_version: "OPS@1.0.0",
      skill_version: "control-tower-operations@1.0.0",
      memory_version: "read-only@1.0.0",
      status: "running",
      failure_reason: null,
      next_action: null,
      token_count: 367,
      cost_usd: 0.0109,
      spans: defaultSpans(ids.traceId, occurredAt),
      started_at: occurredAt,
      completed_at: null,
    });
  }

  #appendAction(
    ids: JourneyIds,
    eventType: Master95ControlTowerEvent["event_type"],
    idempotencyKey: string,
    occurredAt: string,
    payload: Record<string, unknown>,
  ) {
    return this.#append({
      rootProjectId: ids.rootProjectId,
      eventType,
      idempotencyKey,
      occurredAt,
      taskId: ids.taskId,
      runId: ids.runId,
      traceId: ids.traceId,
      payload,
    });
  }

  #append(input: {
    rootProjectId: string;
    eventType: Master95ControlTowerEvent["event_type"];
    idempotencyKey: string;
    occurredAt: string;
    taskId?: string | null;
    runId?: string | null;
    traceId?: string | null;
    payload: Record<string, unknown>;
  }) {
    const rootProjectId = this.#requireRoot(input.rootProjectId);
    const idempotencyIndex = `${rootProjectId}:${required(input.idempotencyKey, "idempotency_key")}`;
    const existing = this.#idempotency.get(idempotencyIndex);
    if (existing) {
      const same =
        existing.event_type === input.eventType && JSON.stringify(existing.payload) === JSON.stringify(input.payload);
      if (!same) throw new Error("control_tower_idempotency_key_conflict");
      return { event: structuredClone(existing), duplicate: true };
    }
    const sequence = (this.#sequences.get(rootProjectId) ?? 0) + 1;
    const event = Master95ControlTowerEventSchema.parse({
      event_id: `event:control-tower:${projectSlug(rootProjectId)}:${sequence}`,
      event_type: input.eventType,
      root_project_id: rootProjectId,
      sequence,
      idempotency_key: input.idempotencyKey,
      occurred_at: input.occurredAt,
      task_id: input.taskId ?? null,
      run_id: input.runId ?? null,
      trace_id: input.traceId ?? null,
      payload: input.payload,
    });
    this.#apply(event);
    this.adapter.append(event);
    this.#events.push(event);
    this.#index(event);
    return { event: structuredClone(event), duplicate: false };
  }

  #acceptReplayed(event: Master95ControlTowerEvent) {
    Master95ControlTowerEventSchema.parse(event);
    this.#requireRoot(event.root_project_id);
    const expected = (this.#sequences.get(event.root_project_id) ?? 0) + 1;
    if (event.sequence !== expected) throw new Error(`control_tower_event_sequence_gap:${expected}:${event.sequence}`);
    if (event.event_id !== `event:control-tower:${projectSlug(event.root_project_id)}:${event.sequence}`) {
      throw new Error("control_tower_event_id_sequence_mismatch");
    }
    this.#apply(event);
    this.#events.push(structuredClone(event));
    this.#index(event);
  }

  #index(event: Master95ControlTowerEvent) {
    const key = `${event.root_project_id}:${event.idempotency_key}`;
    if (this.#idempotency.has(key)) throw new Error(`control_tower_duplicate_idempotency_key:${key}`);
    this.#idempotency.set(key, event);
    this.#sequences.set(event.root_project_id, event.sequence);
  }

  #apply(event: Master95ControlTowerEvent) {
    const p = event.payload;
    if (event.event_type === "control.project_created") {
      const project = p as Master95ControlTowerProject;
      if (!project.project_id.startsWith(`${event.root_project_id}:sandbox:`))
        throw new Error("sandbox_project_scope_denied");
      if (project.root_project_id !== event.root_project_id) throw new Error("sandbox_project_root_mismatch");
      this.#putNew(this.#state.projects, project.project_id, project, "control_tower_project_exists");
      return;
    }
    if (event.event_type === "control.action_completed") return;

    const projectId = required(String(p.project_id ?? ""), "project_id");
    this.#requireResourceProject(event.root_project_id, projectId);
    if (event.event_type === "control.agent_deployed") {
      const deployment = p as Master95ControlTowerDeployment;
      this.#putNew(this.#state.deployments, deployment.deployment_id, deployment, "control_tower_deployment_exists");
      return;
    }
    if (event.event_type === "control.agent_rolled_back") {
      const deployment = this.#deployment(
        event.root_project_id,
        required(String(p.deployment_id ?? ""), "deployment_id"),
      );
      if (deployment.lifecycle === "revoked") throw new Error("control_tower_deployment_already_revoked");
      deployment.rollback_from_version = deployment.version;
      deployment.version = required(String(p.to_version ?? ""), "to_version");
      deployment.lifecycle = "rolled_back";
      return;
    }
    if (event.event_type === "control.agent_revoked") {
      const deployment = this.#deployment(
        event.root_project_id,
        required(String(p.deployment_id ?? ""), "deployment_id"),
      );
      if (deployment.lifecycle === "revoked") throw new Error("control_tower_deployment_already_revoked");
      deployment.lifecycle = "revoked";
      deployment.revoked_at = required(String(p.revoked_at ?? ""), "revoked_at");
      return;
    }
    if (event.event_type === "control.task_created") {
      const task = p as Master95ControlTowerTask;
      this.#putNew(this.#state.tasks, task.task_id, task, "control_tower_task_exists");
      return;
    }
    if (event.event_type === "control.owner_recommended") {
      const task = this.#task(event.root_project_id, required(String(p.task_id ?? ""), "task_id"));
      if (p.recommended_owner) task.recommended_owner = required(String(p.recommended_owner), "recommended_owner");
      if (p.recommended_agent) task.recommended_agent = required(String(p.recommended_agent), "recommended_agent");
      return;
    }
    if (event.event_type === "control.owner_changed") {
      const owner = required(String(p.owner_department ?? ""), "owner_department");
      this.#task(event.root_project_id, required(String(p.task_id ?? ""), "task_id")).owner_department = owner;
      this.#run(event.root_project_id, required(String(p.run_id ?? ""), "run_id")).owner_department = owner;
      return;
    }
    if (event.event_type === "control.run_started") {
      const run = p as Master95ControlTowerRun;
      this.#task(event.root_project_id, run.task_id);
      this.#putNew(this.#state.runs, run.run_id, run, "control_tower_run_exists");
      return;
    }
    if (event.event_type === "control.run_paused") {
      this.#run(event.root_project_id, required(String(p.run_id ?? ""), "run_id")).status = "paused";
      return;
    }
    if (event.event_type === "control.run_resumed") {
      const run = this.#run(event.root_project_id, required(String(p.run_id ?? ""), "run_id"));
      if (run.status !== "paused") throw new Error("control_tower_run_not_paused");
      run.status = "running";
      return;
    }
    if (event.event_type === "control.run_canceled") {
      const run = this.#run(event.root_project_id, required(String(p.run_id ?? ""), "run_id"));
      run.status = "canceled";
      this.#task(event.root_project_id, run.task_id).status = "CANCELED";
      return;
    }
    if (event.event_type === "control.run_failed") {
      const run = this.#run(event.root_project_id, required(String(p.run_id ?? ""), "run_id"));
      run.status = "failed";
      run.failure_reason = required(String(p.failure_reason ?? ""), "failure_reason");
      run.next_action = required(String(p.next_action ?? ""), "next_action");
      run.completed_at = event.occurred_at;
      this.#task(event.root_project_id, run.task_id).status = "FAILED";
      return;
    }
    if (event.event_type === "control.approval_requested") {
      const approval = p as Master95ControlTowerApproval;
      this.#task(event.root_project_id, approval.task_id);
      this.#run(event.root_project_id, approval.run_id);
      this.#putNew(this.#state.approvals, approval.approval_id, approval, "control_tower_approval_exists");
      return;
    }
    if (event.event_type === "control.approval_decided") {
      const approval = this.#approval(event.root_project_id, required(String(p.approval_id ?? ""), "approval_id"));
      if (approval.status !== "pending") throw new Error("control_tower_approval_already_decided");
      approval.status = p.decision === "rejected" ? "rejected" : "approved";
      approval.decided_by = "CONTROL";
      approval.decided_at = required(String(p.decided_at ?? ""), "decided_at");
      const task = this.#task(event.root_project_id, approval.task_id);
      task.status = approval.status === "approved" ? "WORKING" : "FAILED";
      return;
    }
    if (event.event_type === "control.run_retried") {
      const parent = this.#run(event.root_project_id, required(String(p.parent_run_id ?? ""), "parent_run_id"));
      if (parent.status !== "failed") throw new Error("control_tower_retry_requires_failed_parent");
      const childRunId = required(String(p.child_run_id ?? ""), "child_run_id");
      const child: Master95ControlTowerRun = {
        run_id: childRunId,
        project_id: projectId,
        task_id: parent.task_id,
        trace_id: required(String(p.child_trace_id ?? ""), "child_trace_id"),
        parent_run_id: parent.run_id,
        child_run_ids: [],
        owner_department: required(String(p.owner_department ?? ""), "owner_department"),
        agent_version: String(p.agent_version ?? parent.agent_version ?? "OPS@1.0.0"),
        skill_version: String(p.skill_version ?? parent.skill_version ?? "control-tower-operations@1.0.0"),
        memory_version: String(p.memory_version ?? parent.memory_version ?? "read-only@1.0.0"),
        status: "running",
        failure_reason: null,
        next_action: null,
        token_count: Number(p.token_count ?? 0),
        cost_usd: Number(p.cost_usd ?? 0),
        spans: p.spans as Master95ControlTowerSpan[],
        started_at: event.occurred_at,
        completed_at: null,
      };
      parent.child_run_ids.push(childRunId);
      this.#putNew(this.#state.runs, childRunId, child, "control_tower_retry_run_exists");
      this.#task(event.root_project_id, parent.task_id).status = "WORKING";
      return;
    }
    if (event.event_type === "control.handoff_created") {
      const handoff = p as Master95ControlTowerHandoff;
      this.#run(event.root_project_id, handoff.run_id);
      this.#putNew(this.#state.handoffs, handoff.handoff_id, handoff, "control_tower_handoff_exists");
      return;
    }
    if (event.event_type === "control.handoff_accepted") {
      const handoff = this.#handoff(event.root_project_id, required(String(p.handoff_id ?? ""), "handoff_id"));
      handoff.status = "accepted";
      handoff.accepted_at = required(String(p.accepted_at ?? ""), "accepted_at");
      return;
    }
    if (event.event_type === "control.run_completed") {
      const run = this.#run(event.root_project_id, required(String(p.run_id ?? ""), "run_id"));
      run.status = "completed";
      run.completed_at = required(String(p.completed_at ?? ""), "completed_at");
      return;
    }
    if (event.event_type === "control.artifact_registered") {
      const artifact = p as Master95ControlTowerArtifact;
      this.#run(event.root_project_id, artifact.run_id);
      this.#putNew(this.#state.artifacts, artifact.artifact_id, artifact, "control_tower_artifact_exists");
      return;
    }
    if (event.event_type === "control.artifact_verified") {
      const artifact = this.#artifact(event.root_project_id, required(String(p.artifact_id ?? ""), "artifact_id"));
      const actual = crypto.createHash("sha256").update(artifact.content_preview).digest("hex");
      if (actual !== artifact.sha256 || actual !== p.actual_sha256)
        throw new Error("control_tower_artifact_integrity_failed");
      artifact.verified = true;
      artifact.verified_at = required(String(p.verified_at ?? ""), "verified_at");
      return;
    }
    if (event.event_type === "control.task_closed") {
      const task = this.#task(event.root_project_id, required(String(p.task_id ?? ""), "task_id"));
      const artifact = this.#artifact(event.root_project_id, required(String(p.artifact_id ?? ""), "artifact_id"));
      if (!artifact.verified) throw new Error("control_tower_verified_artifact_required");
      const run = this.#run(event.root_project_id, artifact.run_id);
      if (run.status !== "completed") throw new Error("control_tower_completed_run_required");
      task.status = "COMPLETED";
      task.memory_status = p.memory_status === "stored" ? "stored" : "skipped";
      task.closed_at = required(String(p.closed_at ?? ""), "closed_at");
      return;
    }
    if (event.event_type === "control.journey_completed") {
      const result = p as unknown as Master95ControlTowerJourneyResult & { journey_key: string };
      this.#state.journeys.set(required(result.journey_key, "journey_key"), {
        journey_id: result.journey_id,
        attempt_id: result.attempt_id,
        project_id: result.project_id,
        task_id: result.task_id,
        run_id: result.run_id,
        trace_id: result.trace_id,
        completed_at: result.completed_at,
        external_effect: false,
      });
    }
  }

  #putNew<T>(map: Map<string, T>, key: string, value: T, error: string) {
    required(key, "entity_id");
    if (map.has(key)) throw new Error(error);
    map.set(key, structuredClone(value));
  }

  #requireRoot(projectId: string) {
    return this.projectRegistry.require(required(projectId, "root_project_id")).project_id;
  }

  #belongsToRoot(rootProjectId: string, projectId: string) {
    return projectId === rootProjectId || this.#state.projects.get(projectId)?.root_project_id === rootProjectId;
  }

  #requireResourceProject(rootProjectId: string, projectId: string) {
    if (!this.#belongsToRoot(rootProjectId, projectId)) throw new Error("control_tower_cross_project_access_denied");
  }

  #task(rootProjectId: string, taskId: string) {
    const value = this.#state.tasks.get(taskId);
    if (!value) throw new Error("control_tower_task_not_found");
    this.#requireResourceProject(rootProjectId, value.project_id);
    return value;
  }

  #run(rootProjectId: string, runId: string) {
    const value = this.#state.runs.get(runId);
    if (!value) throw new Error("control_tower_run_not_found");
    this.#requireResourceProject(rootProjectId, value.project_id);
    return value;
  }

  #approval(rootProjectId: string, approvalId: string) {
    const value = this.#state.approvals.get(approvalId);
    if (!value) throw new Error("control_tower_approval_not_found");
    this.#requireResourceProject(rootProjectId, value.project_id);
    return value;
  }

  #handoff(rootProjectId: string, handoffId: string) {
    const value = this.#state.handoffs.get(handoffId);
    if (!value) throw new Error("control_tower_handoff_not_found");
    this.#requireResourceProject(rootProjectId, value.project_id);
    return value;
  }

  #artifact(rootProjectId: string, artifactId: string) {
    const value = this.#state.artifacts.get(artifactId);
    if (!value) throw new Error("control_tower_artifact_not_found");
    this.#requireResourceProject(rootProjectId, value.project_id);
    return value;
  }

  #deployment(rootProjectId: string, deploymentId: string) {
    const value = this.#state.deployments.get(deploymentId);
    if (!value) throw new Error("control_tower_deployment_not_found");
    this.#requireResourceProject(rootProjectId, value.project_id);
    return value;
  }

  #latestRunForTask(rootProjectId: string, taskId: string) {
    const task = this.#task(rootProjectId, taskId);
    const runs = [...this.#state.runs.values()].filter((run) => run.task_id === task.task_id);
    const run = runs.at(-1);
    if (!run) throw new Error("control_tower_task_run_not_found");
    this.#requireResourceProject(rootProjectId, run.project_id);
    return run;
  }

  #recommendedAgent(rootProjectId: string) {
    const project = this.projectRegistry.require(rootProjectId);
    // Recommendation is registry-derived routing metadata; it never starts an Agent process.
    return project.lanes.find((lane) => lane.role_agent === "ops-db-quality")?.role_agent ?? "OPS";
  }
}

type JourneyIds = ReturnType<typeof createJourneyIds>;

function createJourneyIds(rootProjectId: string, journeyId: Master95ControlTowerJourneyId, attemptId: string) {
  const root = required(rootProjectId, "root_project_id");
  const journey = required(journeyId, "journey_id");
  const attempt = required(attemptId, "attempt_id").replace(/[^A-Za-z0-9._-]/g, "-");
  const key = `${journey}:${attempt}`;
  const scope = projectSlug(root);
  const projectId = journey === "project-agent" ? `${root}:sandbox:${attempt}` : root;
  return {
    rootProjectId: root,
    journeyId,
    attemptId: attempt,
    key,
    projectId,
    deploymentId: `deployment:${scope}:${journey}:${attempt}`,
    taskId: `task:control-tower:${scope}:${journey}:${attempt}`,
    runId: `run:control-tower:${scope}:${journey}:${attempt}:1`,
    traceId: `trace:control-tower:${scope}:${journey}:${attempt}:1`,
    childRunId: `run:control-tower:${scope}:${journey}:${attempt}:2`,
    childTraceId: `trace:control-tower:${scope}:${journey}:${attempt}:2`,
    approvalId: `approval:control-tower:${scope}:${journey}:${attempt}`,
    handoffId: `handoff:control-tower:${scope}:${journey}:${attempt}`,
    artifactId: `artifact:control-tower:${scope}:${journey}:${attempt}`,
  };
}

function defaultSpans(traceId: string, occurredAt: string): Master95ControlTowerSpan[] {
  return ["request", "routing", "agent", "skill", "memory", "artifact"].map((name, index) => ({
    span_id: `${traceId}:span:${index + 1}`,
    name,
    status: "ok",
    started_at: occurredAt,
    ended_at: occurredAt,
  }));
}

function plusMinutes(timestamp: string, minutes: number) {
  return new Date(Date.parse(timestamp) + minutes * 60_000).toISOString();
}

function projectSlug(projectId: string) {
  return projectId.replace(/[^A-Za-z0-9._-]/g, "-");
}

function required(value: string, field: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}

export function createMaster95DurableControlTower(runtimeRoot = MASTER95_CONTROL_TOWER_RUNTIME_ROOT) {
  // The API process is the sole runtime writer; tests and evidence scripts must stop it before appending.
  return new Master95DurableControlTower(new Master95JsonlControlTowerJournal(path.join(runtimeRoot, "events.jsonl")));
}
