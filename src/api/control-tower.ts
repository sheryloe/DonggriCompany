import { bootstrapSession, post, request } from "./core";

export const MASTER95_CONTROL_TOWER_APPROVAL_ID = "APR-M95-CONTROL-TOWER-DURABLE-001";
export const MASTER95_CONTROL_TOWER_CONFIRMATION = "CONFIRM_LOCAL_CONTROL_TOWER_WRITE";
const BASE = "/api/control-plane/v1/master-95/control-tower";

export type ControlTowerJourneyId = "project-agent" | "task-progress" | "approval" | "failure-retry" | "artifact-close";
export type ControlTowerActionId =
  | "owner-recommend"
  | "agent-recommend"
  | "owner-change"
  | "run-pause"
  | "run-resume"
  | "run-cancel"
  | "approval-approve"
  | "approval-reject"
  | "run-retry"
  | "run-escalate"
  | "agent-rollback"
  | "agent-revoke";

export type DurableControlTowerSpan = {
  span_id: string;
  name: string;
  status: "ok" | "error";
  started_at: string;
  ended_at: string | null;
};

export type DurableControlTowerRun = {
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
  spans: DurableControlTowerSpan[];
  started_at: string;
  completed_at: string | null;
};

export type DurableControlTowerSnapshot = {
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
  projects: Array<{
    project_id: string;
    root_project_id: string;
    display_name: string;
    created_at: string;
    sandbox_only: true;
  }>;
  deployments: Array<{
    deployment_id: string;
    project_id: string;
    agent_id: string;
    version: string;
    lifecycle: "active" | "rolled_back" | "revoked";
    deployed_at: string;
    process_started: false;
    rollback_from_version?: string | null;
    revoked_at?: string | null;
  }>;
  tasks: Array<{
    task_id: string;
    project_id: string;
    title: string;
    owner_department: string;
    recommended_owner: string;
    recommended_agent?: string;
    status: string;
    risk_level: "low" | "medium" | "high";
    memory_status: "not_requested" | "skipped" | "stored";
    created_at: string;
    closed_at: string | null;
  }>;
  runs: DurableControlTowerRun[];
  approvals: Array<{
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
  }>;
  handoffs: Array<{
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
  }>;
  artifacts: Array<{
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
  }>;
  journeys: Array<{
    journey_id: ControlTowerJourneyId;
    attempt_id: string;
    project_id: string;
    task_id: string | null;
    run_id: string | null;
    trace_id: string | null;
    completed_at: string;
    external_effect: false;
  }>;
  event_count: number;
};

export type ControlTowerStreamStatus = "connecting" | "connected" | "reconnecting" | "unsupported";

export type ControlTowerStreamSnapshot = {
  reason: "connected" | "journey" | "action";
  emitted_at: string;
  snapshot: DurableControlTowerSnapshot;
};

export async function subscribeDurableControlTowerState(
  rootProjectId: string,
  callbacks: {
    onStatus: (status: ControlTowerStreamStatus) => void;
    onSnapshot: (event: ControlTowerStreamSnapshot) => void;
    onError?: (message: string) => void;
  },
): Promise<() => void> {
  callbacks.onStatus("connecting");
  if (typeof EventSource === "undefined") {
    callbacks.onStatus("unsupported");
    return () => undefined;
  }
  await bootstrapSession({ promptOnUnauthorized: false });

  const source = new EventSource(`${BASE}/projects/${encodeURIComponent(rootProjectId)}/events`);
  source.onopen = () => callbacks.onStatus("connected");
  source.onerror = () => callbacks.onStatus("reconnecting");
  source.addEventListener("snapshot", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent<string>).data) as ControlTowerStreamSnapshot;
      if (payload.snapshot.root_project_id !== rootProjectId) {
        callbacks.onError?.("Project 범위가 다른 실시간 상태를 차단했습니다.");
        return;
      }
      callbacks.onSnapshot(payload);
    } catch (error) {
      callbacks.onError?.(
        `실시간 상태를 해석하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  return () => source.close();
}

export function readDurableControlTowerState(rootProjectId: string) {
  return request<{ ok: true; external_effect: false } & DurableControlTowerSnapshot>(
    `${BASE}/projects/${encodeURIComponent(rootProjectId)}/state`,
  );
}

export function runDurableControlTowerJourney(rootProjectId: string, journeyId: ControlTowerJourneyId) {
  const attemptId = `${Date.now()}-${crypto.randomUUID()}`;
  return post<{
    ok: true;
    duplicate: boolean;
    external_effect: false;
    process_started: false;
    published: false;
    db_written: false;
    result: DurableControlTowerSnapshot["journeys"][number];
    snapshot: DurableControlTowerSnapshot;
  }>(`${BASE}/journeys`, {
    approval_id: MASTER95_CONTROL_TOWER_APPROVAL_ID,
    confirm: MASTER95_CONTROL_TOWER_CONFIRMATION,
    root_project_id: rootProjectId,
    journey_id: journeyId,
    attempt_id: attemptId,
  });
}

export function runDurableControlTowerAction(
  rootProjectId: string,
  actionId: ControlTowerActionId,
  targetId: string,
  value?: string,
) {
  const attemptId = `${Date.now()}-${crypto.randomUUID()}`;
  return post<{
    ok: true;
    duplicate: boolean;
    external_effect: false;
    process_started: false;
    published: false;
    db_written: false;
    result: {
      action_id: ControlTowerActionId;
      attempt_id: string;
      target_id: string;
      event_ids: string[];
      completed_at: string;
      external_effect: false;
    };
    snapshot: DurableControlTowerSnapshot;
  }>(`${BASE}/actions`, {
    approval_id: MASTER95_CONTROL_TOWER_APPROVAL_ID,
    confirm: MASTER95_CONTROL_TOWER_CONFIRMATION,
    root_project_id: rootProjectId,
    action_id: actionId,
    attempt_id: attemptId,
    target_id: targetId,
    ...(value ? { value } : {}),
  });
}
