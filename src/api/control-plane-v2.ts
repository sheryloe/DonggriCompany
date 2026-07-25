import { makeIdempotencyKey, postJsonWithIdempotencyHeader, request } from "./core";

const BASE = "/api/control-plane/v2";

export type ControlPlaneV2Envelope<T> = {
  data: T;
  request_id: string;
  source_epoch: string;
};

export type ControlPlaneV2Preview = {
  schema_version: "1.0.0";
  preview_id: string;
  spec_id: string;
  project_id: string;
  operation: string;
  resolved_target: string;
  scope: unknown;
  command: {
    executable_id: string;
    args: string[];
    cwd_ref: string;
  };
  target_digest: string;
  scope_digest: string;
  command_digest: string;
  source_epoch: string;
  projection_epoch: string;
  requester: string;
  confirmation_text: string;
  issued_at: string;
  expires_at: string;
};

export type ControlPlaneV2ApprovalReceipt = {
  approval_id: string;
  preview_id: string;
  spec_id: string;
  project_id: string;
  operation: string;
  resolved_target: string;
  target_digest: string;
  scope_digest: string;
  command_digest: string;
  source_epoch: string;
  projection_epoch: string;
  issued_at: string;
  expires_at: string;
  requester: string;
  approver: string;
  receipt_sha256: string;
};

export type ControlPlaneV2State = {
  generated_at: string;
  source_epoch: string;
  projection_epoch: string;
  degraded: boolean;
  parse_errors: unknown[];
  active_specs: unknown[];
  active_spec: unknown | null;
  projects: unknown[];
  runtime: unknown | null;
  evidence: unknown | null;
  provenance: {
    control_plane: "root-control-plane";
    runtime: "live-runtime" | "unavailable" | "discarded-source-epoch-mismatch" | "discarded-projection-epoch-mismatch";
    evidence:
      | "local-durable-evidence"
      | "unavailable"
      | "discarded-source-epoch-mismatch"
      | "discarded-projection-epoch-mismatch";
  };
};

export function readControlPlaneV2State(signal?: AbortSignal): Promise<ControlPlaneV2Envelope<ControlPlaneV2State>> {
  return request(`${BASE}/state`, { signal });
}

export function createControlPlaneV2MutationPreview(
  operation: string,
  projectId: string,
  parameters: unknown = {},
  idempotencyKey = makeIdempotencyKey("control-plane-v2-preview"),
): Promise<ControlPlaneV2Envelope<{ preview: ControlPlaneV2Preview }>> {
  return postJsonWithIdempotencyHeader(
    `${BASE}/mutations/preview`,
    { operation, project_id: projectId, parameters },
    idempotencyKey,
  );
}

export function issueControlPlaneV2MutationApproval(
  previewId: string,
  idempotencyKey = makeIdempotencyKey("control-plane-v2-approval"),
): Promise<ControlPlaneV2Envelope<{ approval_receipt: ControlPlaneV2ApprovalReceipt }>> {
  return postJsonWithIdempotencyHeader(`${BASE}/mutations/approval`, { preview_id: previewId }, idempotencyKey);
}

export function executeControlPlaneV2Mutation(
  input: {
    preview_id: string;
    approval_id: string;
    source_epoch: string;
    confirmation_text: string;
  },
  idempotencyKey = makeIdempotencyKey("control-plane-v2-execute"),
): Promise<
  ControlPlaneV2Envelope<{
    status: "executed" | "replayed";
    result: unknown;
    approval_id: string;
    receipt_sha256: string;
  }>
> {
  return postJsonWithIdempotencyHeader(`${BASE}/mutations/execute`, input, idempotencyKey);
}
