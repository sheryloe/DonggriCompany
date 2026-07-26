import {
  type ControlPlaneV2ApprovalReceipt,
  type ControlPlaneV2Envelope,
  type ControlPlaneV2Preview,
  issueControlPlaneV2MutationApproval,
} from "./control-plane-v2";
import { makeIdempotencyKey, post, postMultipartWithIdempotency, request } from "./core";

export const MASTER95_IMAGE_DURABLE_APPROVAL_ID = "APR-M95-IMAGE-WORKBENCH-DURABLE-001";
export const MASTER95_IMAGE_CONFIRMATION = "CONFIRM_LOCAL_IMAGE_ARTIFACT_WRITE";
const BASE = "/api/control-plane/v1/master-95/image-workbench";

type Guard = {
  approval_id: typeof MASTER95_IMAGE_DURABLE_APPROVAL_ID;
  confirm: typeof MASTER95_IMAGE_CONFIRMATION;
  idempotency_key: string;
};

type ImageWorkbenchVersionInput = {
  id: string;
  projectId: string;
  taskId: string;
  runId: string;
  traceId: string;
  createdByAgentId: string;
  skillId: string;
  skillVersion: string;
  model: string;
  promptVersion: string;
  operation: "input" | "generate" | "edit" | "background_remove" | "resize" | "format_convert" | "analyze" | "restore";
  version: number;
  parentId: string | null;
  sourceIds: string[];
  sourceName: string;
  outputName: string;
  blob: Blob;
  sha256: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  rightsSource: string;
  createdAt: string;
  modifiedAt: string;
  processingStatus: "complete" | "partial" | "failed";
  failureReason: string | null;
  analysisSummary: string | null;
};

export type DurableImageArtifact = {
  artifact_id: string;
  project_id: string;
  task_id: string;
  run_id: string;
  trace_id: string;
  created_by_agent_id: string;
  skill_id: string;
  skill_version: string;
  model: string;
  prompt_version: string;
  operation: ImageWorkbenchVersionInput["operation"];
  version: number;
  parent_artifact_id: string | null;
  source_artifact_ids: string[];
  source_uri: string;
  output_uri: string;
  sha256: string;
  mime_type: string;
  width: number;
  height: number;
  rights_source: string;
  created_at: string;
  modified_at: string;
  processing_status: "complete" | "partial" | "failed";
  failure_reason: string | null;
  analysis_summary: string | null;
  approval_status: "draft" | "pending" | "approved" | "rejected" | "discarded";
  exported_at: string | null;
};

export type DurableImageProjectState = {
  ok: true;
  project_id: string;
  artifacts: DurableImageArtifact[];
  handoffs: Array<Record<string, unknown>>;
  event_count: number;
};

export type V2ImageArtifactRecord = {
  candidate_id: string;
  source_epoch: string;
  project_id: string;
  artifact_id: string;
  original_sha256: string;
  derived_sha256: string;
  parent_sha256: string[];
  approval_id: string;
  receipt_sha256: string;
  export_target_ref: string;
  storage_ref: string;
  storage: Record<string, unknown>;
  filename: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  byte_length: number;
  width: number;
  height: number;
  pixel_count: number;
  request_id: string;
  recorded_at: string;
};

export type V2ImageArtifactLedgerState = {
  candidate_id: string;
  project_id: string;
  artifacts: V2ImageArtifactRecord[];
};

export type V2ImageArtifactLedgerResponse = V2ImageArtifactLedgerState & {
  source_epoch: string;
};

export type DurableImageUploadFingerprint = {
  project_id: string;
  artifact_id: string;
  filename: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  byte_length: number;
  width: number;
  height: number;
  pixel_count: number;
  original_sha256: string;
  parent_sha256: string[];
  candidate_id: string;
};

export type DurableImageUploadPreview = {
  preview: ControlPlaneV2Preview;
  upload_fingerprint: DurableImageUploadFingerprint;
};

export type V2ImageParentLedgerScope = {
  candidate_id: string;
  source_epoch: string;
  project_id: string;
};

function sameProjectScope(left: string, right: string): boolean {
  return left.replace(/^project:/, "") === right.replace(/^project:/, "");
}

export function resolveRegisteredParentSha256(
  sourceArtifactIds: readonly string[],
  artifacts: readonly V2ImageArtifactRecord[],
  scope: V2ImageParentLedgerScope,
): string[] {
  if (new Set(sourceArtifactIds).size !== sourceArtifactIds.length) {
    throw new Error("image_parent_source_id_duplicate");
  }
  return sourceArtifactIds.map((artifactId) => {
    const artifact = artifacts.find(
      (candidate) =>
        candidate.artifact_id === artifactId &&
        candidate.candidate_id === scope.candidate_id &&
        candidate.source_epoch === scope.source_epoch &&
        sameProjectScope(candidate.project_id, scope.project_id),
    );
    if (!artifact || !/^[0-9a-f]{64}$/.test(artifact.derived_sha256)) {
      throw new Error(`image_parent_not_registered:${artifactId}`);
    }
    return artifact.derived_sha256;
  });
}

function guard(prefix: string): Guard {
  return {
    approval_id: MASTER95_IMAGE_DURABLE_APPROVAL_ID,
    confirm: MASTER95_IMAGE_CONFIRMATION,
    idempotency_key: `${prefix}:${crypto.randomUUID()}`,
  };
}

export async function readDurableImageProject(projectId: string, signal?: AbortSignal) {
  const response = await request<ControlPlaneV2Envelope<V2ImageArtifactLedgerState>>(
    `/api/control-plane/v2/image-workbench/projects/${encodeURIComponent(projectId)}/artifacts`,
    { signal },
  );
  return { ...response.data, source_epoch: response.source_epoch };
}

function imageMultipart(version: ImageWorkbenchVersionInput, metadata: Record<string, unknown>) {
  const body = new FormData();
  body.append("metadata", JSON.stringify(metadata));
  body.append("file", version.blob, version.outputName);
  return body;
}

export function previewDurableImageArtifactUpload(
  version: ImageWorkbenchVersionInput,
  parentSha256: string[],
  idempotencyKey = makeIdempotencyKey("image-workbench-v2-preview"),
): Promise<ControlPlaneV2Envelope<DurableImageUploadPreview>> {
  return postMultipartWithIdempotency(
    "/api/control-plane/v2/image-workbench/uploads/preview",
    imageMultipart(version, {
      project_id: version.projectId,
      artifact_id: version.id,
      parent_sha256: [...parentSha256],
    }),
    idempotencyKey,
  );
}

export async function approveDurableImageArtifactUpload(
  previewId: string,
): Promise<ControlPlaneV2Envelope<{ approval_receipt: ControlPlaneV2ApprovalReceipt }>> {
  return issueControlPlaneV2MutationApproval(previewId);
}

export function executeDurableImageArtifactUpload(
  version: ImageWorkbenchVersionInput,
  parentSha256: string[],
  preview: ControlPlaneV2Preview,
  fingerprint: DurableImageUploadFingerprint,
  approval: ControlPlaneV2ApprovalReceipt,
  confirmationText: string,
  idempotencyKey = makeIdempotencyKey("image-workbench-v2-execute"),
): Promise<
  ControlPlaneV2Envelope<{
    status: "executed" | "replayed";
    upload: {
      project_id: string;
      artifact_id: string;
      storage: unknown;
    };
    approval_id: string;
    receipt_sha256: string;
  }>
> {
  if (
    parentSha256.length !== fingerprint.parent_sha256.length ||
    parentSha256.some((parentSha, index) => parentSha !== fingerprint.parent_sha256[index])
  ) {
    throw new Error("image_parent_preview_binding_mismatch");
  }
  return postMultipartWithIdempotency(
    "/api/control-plane/v2/image-workbench/uploads",
    imageMultipart(version, {
      project_id: version.projectId,
      artifact_id: version.id,
      candidate_id: fingerprint.candidate_id,
      source_epoch: preview.source_epoch,
      preview_id: preview.preview_id,
      approval_id: approval.approval_id,
      confirmation_text: confirmationText,
      export_target_ref: preview.resolved_target,
      parent_sha256: [...parentSha256],
      expected_original_sha256: fingerprint.original_sha256,
      expected_width: fingerprint.width,
      expected_height: fingerprint.height,
    }),
    idempotencyKey,
  );
}

export async function decideDurableImageArtifact(
  version: ImageWorkbenchVersionInput,
  decision: "approved" | "rejected" | "discarded",
  durableApprovalStatus: DurableImageArtifact["approval_status"],
) {
  if (durableApprovalStatus === "draft") {
    await post(`${BASE}/artifacts/submit`, {
      ...guard(`submit:${version.id}`),
      project_id: version.projectId,
      artifact_id: version.id,
    });
  }
  return post<{ ok: true; artifact: DurableImageArtifact }>(`${BASE}/artifacts/decision`, {
    ...guard(`decision:${decision}:${version.id}`),
    project_id: version.projectId,
    artifact_id: version.id,
    actor: "CONTROL",
    decision,
  });
}

export async function handoffDurableImageArtifact(version: ImageWorkbenchVersionInput) {
  const suffix = crypto.randomUUID();
  return post<{ ok: true; dispatched: true; accepted: true; delivery_mode: "local-durable-inbox" }>(
    `${BASE}/artifacts/handoff`,
    {
      ...guard(`handoff:${version.id}`),
      handoff: {
        handoff_id: `handoff:image-workbench:${suffix}`,
        artifact_id: version.id,
        project_id: version.projectId,
        task_id: version.taskId,
        run_id: version.runId,
        trace_id: `trace:image-workbench:handoff:${suffix}`,
        from_agent_id: version.createdByAgentId,
        to_agent_id: "IMPLEMENT",
        occurred_at: new Date().toISOString(),
      },
    },
  );
}

export async function recordDurableImagePartialFailure(version: ImageWorkbenchVersionInput, failureReason: string) {
  return post<{ ok: true; artifact: DurableImageArtifact }>(`${BASE}/artifacts/partial-failure`, {
    ...guard(`partial-failure:${version.id}`),
    project_id: version.projectId,
    artifact_id: version.id,
    failure_reason: failureReason,
  });
}

export async function exportDurableImageArtifact(version: ImageWorkbenchVersionInput) {
  return post<{ ok: true; published: false; content_url: string }>(`${BASE}/artifacts/export`, {
    ...guard(`export:${version.id}`),
    project_id: version.projectId,
    artifact_id: version.id,
  });
}
