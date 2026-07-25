import {
  type ControlPlaneV2ApprovalReceipt,
  type ControlPlaneV2Preview,
  createControlPlaneV2MutationPreview,
  executeControlPlaneV2Mutation,
  issueControlPlaneV2MutationApproval,
} from "./control-plane-v2";
import { bootstrapSession, request } from "./core";

const BASE = "/api/control-plane/v1/master-95/control-tower";
const V2_OPERATION_PREFIX = "control-tower";

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

export type DurableControlTowerStateResponse = {
  ok: true;
  external_effect: false;
  source_epoch: string;
  projection_epoch: string;
  snapshot_version: string;
} & DurableControlTowerSnapshot;

export type ControlTowerStreamStatus = "connecting" | "connected" | "reconnecting" | "unsupported";

export type ControlTowerStreamSnapshot = {
  reason: "connected" | "journey" | "action" | "projection";
  emitted_at: string;
  cursor: string;
  snapshot_version: string;
  source_epoch: string;
  projection_epoch: string;
  snapshot: DurableControlTowerSnapshot;
};

export type ControlTowerStreamReset = {
  reason: "cursor_invalid" | "cursor_expired" | "cursor_ahead" | "projection_changed";
  emitted_at: string;
  cursor: string;
  snapshot_version: string;
  source_epoch: string;
  projection_epoch: string;
};

export type PreparedControlTowerMutation = {
  label: string;
  preview: ControlPlaneV2Preview;
  approval_receipt: ControlPlaneV2ApprovalReceipt;
};

export type ExecutedControlTowerMutation = {
  status: "executed" | "replayed";
  result: {
    result: unknown;
    duplicate: boolean;
    snapshot: DurableControlTowerSnapshot;
  };
  approval_id: string;
  receipt_sha256: string;
};

export async function subscribeDurableControlTowerState(
  rootProjectId: string,
  callbacks: {
    onStatus: (status: ControlTowerStreamStatus) => void;
    onSnapshot: (event: ControlTowerStreamSnapshot) => void;
    onReset?: (event: ControlTowerStreamReset) => void;
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
  source.addEventListener("reset", (event) => {
    try {
      callbacks.onReset?.(JSON.parse((event as MessageEvent<string>).data) as ControlTowerStreamReset);
    } catch (error) {
      callbacks.onError?.(
        `실시간 재동기화 이벤트를 해석하지 못했습니다. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  return () => source.close();
}

export function readDurableControlTowerState(rootProjectId: string, signal?: AbortSignal) {
  return request<DurableControlTowerStateResponse>(`${BASE}/projects/${encodeURIComponent(rootProjectId)}/state`, {
    signal,
  });
}

async function prepareControlTowerMutation(
  operation: string,
  rootProjectId: string,
  parameters: Record<string, string>,
  label: string,
): Promise<PreparedControlTowerMutation> {
  const previewResponse = await createControlPlaneV2MutationPreview(operation, rootProjectId, parameters);
  const approvalResponse = await issueControlPlaneV2MutationApproval(previewResponse.data.preview.preview_id);
  if (
    previewResponse.source_epoch !== approvalResponse.source_epoch ||
    approvalResponse.data.approval_receipt.preview_id !== previewResponse.data.preview.preview_id ||
    approvalResponse.data.approval_receipt.source_epoch !== previewResponse.data.preview.source_epoch
  ) {
    throw new Error("control_tower_v2_approval_binding_mismatch");
  }
  return {
    label,
    preview: previewResponse.data.preview,
    approval_receipt: approvalResponse.data.approval_receipt,
  };
}

export function runDurableControlTowerJourney(
  rootProjectId: string,
  journeyId: ControlTowerJourneyId,
  label: string = journeyId,
): Promise<PreparedControlTowerMutation> {
  return prepareControlTowerMutation(`${V2_OPERATION_PREFIX}.journey.${journeyId}`, rootProjectId, {}, label);
}

export function runDurableControlTowerAction(
  rootProjectId: string,
  actionId: ControlTowerActionId,
  targetId: string,
  value?: string,
  label: string = actionId,
): Promise<PreparedControlTowerMutation> {
  return prepareControlTowerMutation(
    `${V2_OPERATION_PREFIX}.action.${actionId}`,
    rootProjectId,
    { target_id: targetId, ...(value ? { value } : {}) },
    label,
  );
}

export async function executeDurableControlTowerMutation(
  pending: PreparedControlTowerMutation,
  confirmationText: string,
): Promise<ExecutedControlTowerMutation> {
  const response = await executeControlPlaneV2Mutation({
    preview_id: pending.preview.preview_id,
    approval_id: pending.approval_receipt.approval_id,
    source_epoch: pending.preview.source_epoch,
    confirmation_text: confirmationText,
  });
  if (response.source_epoch !== pending.preview.source_epoch) {
    throw new Error("control_tower_v2_execution_epoch_mismatch");
  }
  return response.data as ExecutedControlTowerMutation;
}
