import { post, request } from "./core";

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

function guard(prefix: string): Guard {
  return {
    approval_id: MASTER95_IMAGE_DURABLE_APPROVAL_ID,
    confirm: MASTER95_IMAGE_CONFIRMATION,
    idempotency_key: `${prefix}:${crypto.randomUUID()}`,
  };
}

export async function readDurableImageProject(projectId: string) {
  return request<DurableImageProjectState>(`${BASE}/projects/${encodeURIComponent(projectId)}/artifacts`);
}

export async function registerDurableImageArtifact(version: ImageWorkbenchVersionInput) {
  const metadata = {
    artifact_id: version.id,
    project_id: version.projectId,
    task_id: version.taskId,
    run_id: version.runId,
    trace_id: version.traceId,
    created_by_agent_id: version.createdByAgentId,
    skill_id: version.skillId,
    skill_version: version.skillVersion,
    model: version.model,
    prompt_version: version.promptVersion,
    operation: version.operation,
    version: version.version,
    parent_artifact_id: version.parentId,
    source_artifact_ids: [...version.sourceIds],
    source_uri: `browser-local://${encodeURIComponent(version.sourceName)}`,
    output_uri: `pending://${encodeURIComponent(version.outputName)}`,
    sha256: version.sha256,
    mime_type: version.mimeType,
    width: version.width,
    height: version.height,
    rights_source: version.rightsSource,
    created_at: version.createdAt,
    modified_at: version.modifiedAt,
    processing_status: version.processingStatus,
    failure_reason: version.failureReason,
    analysis_summary: version.analysisSummary,
    approval_status: "draft" as const,
    exported_at: null,
  };
  return post<{ ok: true; duplicate: boolean; artifact: DurableImageArtifact }>(`${BASE}/artifacts/register`, {
    ...guard(`register:${version.id}`),
    artifact: metadata,
    asset_base64: await blobToBase64(version.blob),
  });
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

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
