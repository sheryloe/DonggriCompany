export type ImageWorkbenchOperation =
  | "input"
  | "generate"
  | "edit"
  | "background_remove"
  | "resize"
  | "format_convert"
  | "analyze"
  | "restore";

export type ImageWorkbenchApproval = "draft" | "pending" | "approved" | "rejected" | "discarded";

export interface ImageWorkbenchVersion {
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
  operation: ImageWorkbenchOperation;
  version: number;
  parentId: string | null;
  sourceIds: string[];
  sourceName: string;
  outputName: string;
  objectUrl: string;
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
  approvalStatus: ImageWorkbenchApproval;
  exportedAt: string | null;
}

export interface ImageWorkbenchArtifactMetadata {
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
  operation: ImageWorkbenchOperation;
  version: number;
  parent_artifact_id: string | null;
  source_artifact_ids: string[];
  source_name: string;
  output_name: string;
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
  approval_status: ImageWorkbenchApproval;
  exported_at: string | null;
}

export function buildImageArtifactMetadata(version: ImageWorkbenchVersion): ImageWorkbenchArtifactMetadata {
  return {
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
    source_name: version.sourceName,
    output_name: version.outputName,
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
    approval_status: version.approvalStatus,
    exported_at: version.exportedAt,
  };
}

export function deriveImageVersion(
  source: ImageWorkbenchVersion,
  input: {
    id: string;
    traceId: string;
    operation: Exclude<ImageWorkbenchOperation, "input" | "generate">;
    blob: Blob;
    objectUrl: string;
    sha256: string;
    mimeType: ImageWorkbenchVersion["mimeType"];
    width: number;
    height: number;
    outputName: string;
    createdAt: string;
    nextVersion?: number;
    analysisSummary?: string | null;
  },
): ImageWorkbenchVersion {
  return {
    ...source,
    id: input.id,
    traceId: input.traceId,
    operation: input.operation,
    version: input.nextVersion ?? source.version + 1,
    parentId: source.id,
    sourceIds: [source.id],
    outputName: input.outputName,
    objectUrl: input.objectUrl,
    blob: input.blob,
    sha256: input.sha256,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    createdAt: input.createdAt,
    modifiedAt: input.createdAt,
    processingStatus: "complete",
    failureReason: null,
    analysisSummary: input.analysisSummary ?? null,
    approvalStatus: "draft",
    exportedAt: null,
  };
}

export function restoreImageVersion(
  source: ImageWorkbenchVersion,
  input: {
    id: string;
    traceId: string;
    objectUrl: string;
    createdAt: string;
    nextVersion?: number;
    parent?: ImageWorkbenchVersion;
  },
): ImageWorkbenchVersion {
  const parent = input.parent ?? source;
  return {
    ...source,
    id: input.id,
    traceId: input.traceId,
    operation: "restore",
    version: input.nextVersion ?? parent.version + 1,
    parentId: parent.id,
    sourceIds: [source.id],
    blob: source.blob,
    objectUrl: input.objectUrl,
    sha256: source.sha256,
    mimeType: source.mimeType,
    width: source.width,
    height: source.height,
    outputName: source.outputName,
    createdAt: input.createdAt,
    analysisSummary: `버전 ${source.version} 결과를 새 초안으로 복원했습니다.`,
    modifiedAt: input.createdAt,
    processingStatus: "complete",
    failureReason: null,
    approvalStatus: "draft",
    exportedAt: null,
  };
}

export function derivePartialImageVersion(
  source: ImageWorkbenchVersion,
  input: {
    id: string;
    traceId: string;
    operation: Exclude<ImageWorkbenchOperation, "input" | "generate" | "restore" | "analyze">;
    createdAt: string;
    nextVersion: number;
    failureReason: string;
  },
): ImageWorkbenchVersion {
  return {
    ...source,
    id: input.id,
    traceId: input.traceId,
    operation: input.operation,
    version: input.nextVersion,
    parentId: source.id,
    sourceIds: [source.id],
    createdAt: input.createdAt,
    modifiedAt: input.createdAt,
    processingStatus: "partial",
    failureReason: input.failureReason,
    analysisSummary: `변환에 실패해 버전 ${source.version} 원본을 부분 결과로 보존했습니다.`,
    approvalStatus: "draft",
    exportedAt: null,
  };
}

export function canExportImageVersion(version: ImageWorkbenchVersion): boolean {
  return version.approvalStatus === "approved" && version.processingStatus === "complete";
}
