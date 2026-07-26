import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { Express, Request, Response } from "express";

import { ALLOWED_ORIGINS, RELEASE_IDENTITY } from "../../../config/runtime.ts";
import { hasValidCsrfToken, isAuthenticated } from "../../../security/auth.ts";
import { createControlPlaneEnvelope, createControlPlaneProblem } from "../../control-plane/api-contract.ts";
import { readRegisteredImageParentSha256 } from "../../control-plane/image-lineage-authority.ts";
import { MutationAuthorizer } from "../../control-plane/mutation-authorizer.ts";
import { SqliteMutationAuthorizerPersistence } from "../../control-plane/mutation-authorizer-sqlite.ts";
import { ProjectionService } from "../../control-plane/projection-service.ts";
import type { ControlPlaneSourceAdapter } from "../../control-plane/source-adapter.ts";
import { MASTER95_IMAGE_RUNTIME_ROOT } from "../../master95/durable-image-workbench.ts";
import {
  registerControlPlaneV2MutationRoutes,
  type ControlPlaneV2OperationRegistry,
  type ControlPlaneV2SecurityContext,
} from "./control-plane-v2.ts";
import {
  registerControlPlaneV2ReadOperationRoutes,
  type ControlPlaneV2ReadOperations,
} from "./control-plane-v2-read-operations.ts";
import {
  CONTROL_TOWER_V2_EXECUTABLE_ID,
  createControlTowerV2OperationRegistry,
  type ControlTowerV2RuntimeLoader,
} from "./control-plane-v2-control-tower.ts";
import {
  registerImageWorkbenchV2UploadRoutes,
  type ImageWorkbenchV2PreviewAuthorityInput,
  type ImageWorkbenchV2StoreInput,
} from "./image-workbench-v2.ts";

export const CONTROL_PLANE_V2_STATE_PATH = "/api/control-plane/v2/state";
export const IMAGE_WORKBENCH_V2_ARTIFACTS_PATH = "/api/control-plane/v2/image-workbench/projects/:projectId/artifacts";
export const IMAGE_WORKBENCH_STORE_EXECUTABLE_ID = "image-workbench-v2-store";
export const DONGGRI_V1_WORKTREE_CWD_REF = "worktree:DonggriCompany-v1-stabilization";
export const DONGGRI_V1_STABILIZATION_SPEC_ID = "20260725-donggricompany-v1-stabilization-certification-v1";
export const IMAGE_WORKBENCH_V2_RUNTIME_ROOT = path.join(MASTER95_IMAGE_RUNTIME_ROOT, "v2-assets");

type SourceAdapter = Pick<ControlPlaneSourceAdapter, "readSnapshot">;
type ImageArtifactDb = Pick<DatabaseSync, "exec" | "prepare">;
type ImageStorageResult = Record<string, string | number | boolean>;

export type ControlPlaneImageArtifactRecord = {
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
  storage: ImageStorageResult;
  filename: string;
  mime_type: string;
  byte_length: number;
  width: number;
  height: number;
  pixel_count: number;
  request_id: string;
  recorded_at: string;
};

export type ImageArtifactLedgerRecoveryEvidence = {
  schema_version: "1.0.0";
  failure_class: "image_artifact_ledger_insert_failed";
  occurred_at: string;
  error: string;
  artifact: ControlPlaneImageArtifactRecord;
};

export type ControlPlaneV2RuntimeDependencies = {
  source_adapter: SourceAdapter;
  read_operations: ControlPlaneV2ReadOperations;
  load_control_tower?: ControlTowerV2RuntimeLoader;
  allowed_origins?: readonly string[];
  resolve_security?: (request: Request) => ControlPlaneV2SecurityContext;
  create_request_id?: () => string;
  candidate_id?: string;
  image_store?: (input: ImageWorkbenchV2StoreInput) => Promise<ImageStorageResult>;
  image_runtime_root?: string;
  write_recovery_manifest?: (evidence: ImageArtifactLedgerRecoveryEvidence) => Promise<void>;
  now?: () => Date;
};

export type ControlPlaneV2Runtime = {
  persistence: SqliteMutationAuthorizerPersistence;
  authorizer: MutationAuthorizer;
  projection_service: ProjectionService;
  operations: ControlPlaneV2OperationRegistry;
  get_epoch_authority: () => { source_epoch: string; projection_epoch: string };
  get_source_epoch: () => string;
  get_projection_epoch: () => string;
  resolve_security: (request: Request) => ControlPlaneV2SecurityContext;
  allowed_origins: readonly string[];
  candidate_id: string;
  store_image: (input: ImageWorkbenchV2StoreInput) => Promise<ImageStorageResult>;
};

function requestId(request: Request, createId: () => string): string {
  const supplied = request.header("x-request-id")?.trim() ?? "";
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(supplied) ? supplied : createId();
}

/**
 * The app has one local authenticated principal. Requester and approver
 * identities are therefore server-owned session identities, never client
 * supplied headers or body fields.
 */
export function resolveLocalControlPlaneV2Security(request: Request): ControlPlaneV2SecurityContext {
  const authenticated = isAuthenticated(request);
  return {
    authenticated,
    csrf_valid: hasValidCsrfToken(request),
    requester: authenticated ? "local-authenticated-session" : null,
    approver: authenticated ? "local-authenticated-session" : null,
  };
}

function safeStorageSegment(value: string, field: string): string {
  const logicalId = value.replace(/^project:/, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/.test(logicalId)) {
    throw new Error(`${field}_invalid`);
  }
  const slug = logicalId.replace(/:/g, "_").slice(0, 120);
  const digest = createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
  return `${slug}-${digest}`;
}

function safeReferenceId(value: string, field: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/.test(value) || /(^|[\\/])\.\.([\\/]|$)/.test(value)) {
    throw new Error(`${field}_invalid`);
  }
  return value;
}

function imageExtension(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  throw new Error("image_mime_type_not_supported");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeImmutableImage(target: string, bytes: Buffer, expectedSha256: string): Promise<boolean> {
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  try {
    const file = await fs.promises.open(target, "wx");
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await fs.promises.readFile(target);
    if (sha256(existing) !== expectedSha256) throw new Error("immutable_image_asset_conflict");
    return true;
  }
}

export function createCandidateImageStore(options: {
  root_path?: string;
  candidate_id: string;
}): (input: ImageWorkbenchV2StoreInput) => Promise<ImageStorageResult> {
  const root = path.resolve(options.root_path ?? IMAGE_WORKBENCH_V2_RUNTIME_ROOT);
  const candidateSegment = safeStorageSegment(options.candidate_id, "candidate_id");

  return async (input) => {
    const projectSegment = safeStorageSegment(input.upload.metadata.project_id, "project_id");
    const extension = imageExtension(input.upload.mime_type);
    const target = path.resolve(root, candidateSegment, projectSegment, `${input.lineage.derived_sha256}.${extension}`);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new Error("image_asset_path_escape_denied");
    }
    if (sha256(input.upload.bytes) !== input.lineage.derived_sha256) {
      throw new Error("image_asset_derived_sha256_mismatch");
    }
    const duplicate = await writeImmutableImage(target, input.upload.bytes, input.lineage.derived_sha256);
    const storageRef = [
      "candidate-image",
      candidateSegment,
      projectSegment,
      `${input.lineage.derived_sha256}.${extension}`,
    ].join(":");
    return {
      storage_ref: storageRef,
      sha256: input.lineage.derived_sha256,
      size_bytes: input.upload.byte_length,
      duplicate,
    };
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function canonicalActiveProject(sourceAdapter: SourceAdapter, projectId: string): string {
  const projectKey = projectId.replace(/^project:/, "");
  const project = sourceAdapter.readSnapshot().projects.find((candidate) => candidate.key === projectKey);
  if (!project || project.status !== "active" || !project.enabled) {
    throw new Error("image_export_project_not_active");
  }
  return project.key;
}

function storageReference(storage: ImageStorageResult): string {
  const value = storage.storage_ref;
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error("image_storage_ref_invalid");
  }
  return value.trim();
}

function buildImageArtifactRecord(input: {
  source_adapter: SourceAdapter;
  candidate_id: string;
  upload: ImageWorkbenchV2StoreInput;
  storage: ImageStorageResult;
  recorded_at: string;
}): ControlPlaneImageArtifactRecord {
  const { upload } = input;
  if (upload.upload.metadata.candidate_id !== input.candidate_id) {
    throw new Error("image_artifact_candidate_drift");
  }
  const currentEpoch = input.source_adapter.readSnapshot().source_epoch;
  if (upload.upload.metadata.source_epoch !== currentEpoch) {
    throw new Error("image_artifact_source_epoch_drift");
  }
  const projectId = canonicalActiveProject(input.source_adapter, upload.upload.metadata.project_id);
  return {
    candidate_id: input.candidate_id,
    source_epoch: currentEpoch,
    project_id: projectId,
    artifact_id: upload.upload.metadata.artifact_id,
    original_sha256: upload.lineage.original_sha256,
    derived_sha256: upload.lineage.derived_sha256,
    parent_sha256: [...upload.lineage.parent_sha256],
    approval_id: upload.approval_receipt.approval_id,
    receipt_sha256: upload.approval_receipt.receipt_sha256,
    export_target_ref: upload.lineage.export_target_ref,
    storage_ref: storageReference(input.storage),
    storage: structuredClone(input.storage),
    filename: upload.upload.filename,
    mime_type: upload.upload.mime_type,
    byte_length: upload.upload.byte_length,
    width: upload.upload.width,
    height: upload.upload.height,
    pixel_count: upload.upload.pixel_count,
    request_id: upload.request_id,
    recorded_at: input.recorded_at,
  };
}

export function persistControlPlaneImageArtifact(db: ImageArtifactDb, record: ControlPlaneImageArtifactRecord): void {
  const existingRow = db
    .prepare(
      `
      SELECT
        candidate_id, source_epoch, project_id, artifact_id,
        original_sha256, derived_sha256, parent_sha256_json,
        approval_id, receipt_sha256, export_target_ref,
        storage_ref, storage_json, filename, mime_type,
        byte_length, width, height, pixel_count, request_id, recorded_at
      FROM control_plane_image_artifacts
      WHERE candidate_id = ? AND source_epoch = ? AND project_id = ? AND artifact_id = ?
    `,
    )
    .get(record.candidate_id, record.source_epoch, record.project_id, record.artifact_id) as
    | Record<string, SQLOutputValue>
    | undefined;
  if (existingRow) {
    const existing = parseImageArtifactRow(existingRow);
    const sameLogicalArtifact =
      existing.original_sha256 === record.original_sha256 &&
      existing.derived_sha256 === record.derived_sha256 &&
      JSON.stringify(existing.parent_sha256) === JSON.stringify(record.parent_sha256) &&
      existing.approval_id === record.approval_id &&
      existing.receipt_sha256 === record.receipt_sha256 &&
      existing.export_target_ref === record.export_target_ref &&
      existing.storage_ref === record.storage_ref &&
      existing.filename === record.filename &&
      existing.mime_type === record.mime_type &&
      existing.byte_length === record.byte_length &&
      existing.width === record.width &&
      existing.height === record.height &&
      existing.pixel_count === record.pixel_count;
    if (!sameLogicalArtifact) throw new Error("image_artifact_reconciliation_conflict");
    return;
  }
  db.prepare(
    `
      INSERT INTO control_plane_image_artifacts (
        candidate_id, source_epoch, project_id, artifact_id,
        original_sha256, derived_sha256, parent_sha256_json,
        approval_id, receipt_sha256, export_target_ref,
        storage_ref, storage_json, filename, mime_type,
        byte_length, width, height, pixel_count, request_id, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    record.candidate_id,
    record.source_epoch,
    record.project_id,
    record.artifact_id,
    record.original_sha256,
    record.derived_sha256,
    JSON.stringify(record.parent_sha256),
    record.approval_id,
    record.receipt_sha256,
    record.export_target_ref,
    record.storage_ref,
    JSON.stringify(record.storage),
    record.filename,
    record.mime_type,
    record.byte_length,
    record.width,
    record.height,
    record.pixel_count,
    record.request_id,
    record.recorded_at,
  );
}

function parseImageArtifactRow(row: Record<string, SQLOutputValue>): ControlPlaneImageArtifactRecord {
  const parentSha = JSON.parse(String(row.parent_sha256_json)) as unknown;
  const storage = JSON.parse(String(row.storage_json)) as unknown;
  if (
    !Array.isArray(parentSha) ||
    !parentSha.every((value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) ||
    !storage ||
    typeof storage !== "object" ||
    Array.isArray(storage)
  ) {
    throw new Error("control_plane_image_artifact_row_corrupt");
  }
  const numeric = (value: SQLOutputValue, field: string): number => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${field}_corrupt`);
    return parsed;
  };
  const text = (value: SQLOutputValue, field: string): string => {
    if (typeof value !== "string" || !value) throw new Error(`${field}_corrupt`);
    return value;
  };
  return {
    candidate_id: text(row.candidate_id, "candidate_id"),
    source_epoch: text(row.source_epoch, "source_epoch"),
    project_id: text(row.project_id, "project_id"),
    artifact_id: text(row.artifact_id, "artifact_id"),
    original_sha256: text(row.original_sha256, "original_sha256"),
    derived_sha256: text(row.derived_sha256, "derived_sha256"),
    parent_sha256: parentSha,
    approval_id: text(row.approval_id, "approval_id"),
    receipt_sha256: text(row.receipt_sha256, "receipt_sha256"),
    export_target_ref: text(row.export_target_ref, "export_target_ref"),
    storage_ref: text(row.storage_ref, "storage_ref"),
    storage: storage as ImageStorageResult,
    filename: text(row.filename, "filename"),
    mime_type: text(row.mime_type, "mime_type"),
    byte_length: numeric(row.byte_length, "byte_length"),
    width: numeric(row.width, "width"),
    height: numeric(row.height, "height"),
    pixel_count: numeric(row.pixel_count, "pixel_count"),
    request_id: text(row.request_id, "request_id"),
    recorded_at: text(row.recorded_at, "recorded_at"),
  };
}

export function readCurrentControlPlaneImageArtifacts(
  db: ImageArtifactDb,
  input: { candidate_id: string; source_epoch: string; project_id: string },
): ControlPlaneImageArtifactRecord[] {
  return (
    db
      .prepare(
        `
          SELECT
            candidate_id, source_epoch, project_id, artifact_id,
            original_sha256, derived_sha256, parent_sha256_json,
            approval_id, receipt_sha256, export_target_ref,
            storage_ref, storage_json, filename, mime_type,
            byte_length, width, height, pixel_count, request_id, recorded_at
          FROM control_plane_image_artifacts
          WHERE candidate_id = ? AND source_epoch = ? AND project_id = ?
          ORDER BY recorded_at DESC, artifact_id ASC
        `,
      )
      .all(input.candidate_id, input.source_epoch, input.project_id) as Array<Record<string, SQLOutputValue>>
  ).map(parseImageArtifactRow);
}

export function createImageArtifactRecoveryManifestWriter(
  options: {
    root_path?: string;
  } = {},
): (evidence: ImageArtifactLedgerRecoveryEvidence) => Promise<void> {
  const root = path.resolve(options.root_path ?? IMAGE_WORKBENCH_V2_RUNTIME_ROOT);
  return async (evidence) => {
    const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
    const manifestSha = createHash("sha256").update(serialized, "utf8").digest("hex");
    const candidateSegment = safeStorageSegment(evidence.artifact.candidate_id, "candidate_id");
    const sourceSegment = evidence.artifact.source_epoch.replace(/^sha256:/, "");
    const target = path.resolve(root, "recovery-manifests", candidateSegment, sourceSegment, `${manifestSha}.json`);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error("image_recovery_manifest_path_escape_denied");
    }
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    try {
      const file = await fs.promises.open(target, "wx");
      try {
        await file.writeFile(serialized, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await fs.promises.readFile(target, "utf8");
      if (existing !== serialized) throw new Error("image_recovery_manifest_immutable_conflict");
    }
  };
}

function resolveRegisteredImageExportTarget(
  sourceAdapter: SourceAdapter,
  input: ImageWorkbenchV2PreviewAuthorityInput,
): string {
  const projectKey = canonicalActiveProject(sourceAdapter, input.project_id);
  const candidate = safeReferenceId(input.candidate_id, "candidate_id");
  const artifact = safeReferenceId(input.artifact_id, "artifact_id");
  return `registered-export:image-workbench/${candidate}/${projectKey}/${artifact}/${input.original_sha256}`;
}

export function createControlPlaneV2Runtime(
  db: ImageArtifactDb,
  dependencies: ControlPlaneV2RuntimeDependencies,
): ControlPlaneV2Runtime {
  const persistence = new SqliteMutationAuthorizerPersistence(db);
  const allowedOrigins = [...(dependencies.allowed_origins ?? ALLOWED_ORIGINS)];
  const now = dependencies.now ?? (() => new Date());
  const authorizer = new MutationAuthorizer({
    persistence,
    allowed_origins: allowedOrigins,
    // These are logical, server-owned dispatch identifiers. Neither accepts a
    // raw shell string and both are bound to a registered cwd_ref.
    allowed_executable_ids: [IMAGE_WORKBENCH_STORE_EXECUTABLE_ID, CONTROL_TOWER_V2_EXECUTABLE_ID],
    allowed_cwd_refs: [DONGGRI_V1_WORKTREE_CWD_REF],
    now,
  });
  const getEpochAuthority = () => {
    const snapshot = dependencies.source_adapter.readSnapshot();
    return { source_epoch: snapshot.source_epoch, projection_epoch: snapshot.projection_epoch };
  };
  const getSourceEpoch = () => getEpochAuthority().source_epoch;
  const getProjectionEpoch = () => getEpochAuthority().projection_epoch;
  const candidateId = dependencies.candidate_id ?? RELEASE_IDENTITY.candidate_id;
  const operations = createControlTowerV2OperationRegistry({
    source_adapter: dependencies.source_adapter,
    load_control_tower:
      dependencies.load_control_tower ??
      (async () => {
        throw new Error("control_tower_runtime_unavailable");
      }),
    cwd_ref: DONGGRI_V1_WORKTREE_CWD_REF,
    spec_id: DONGGRI_V1_STABILIZATION_SPEC_ID,
    now,
  });
  const immutableStore =
    dependencies.image_store ??
    createCandidateImageStore({
      candidate_id: candidateId,
      root_path: dependencies.image_runtime_root,
    });
  const writeRecoveryManifest =
    dependencies.write_recovery_manifest ??
    createImageArtifactRecoveryManifestWriter({ root_path: dependencies.image_runtime_root });
  const storeImage = async (input: ImageWorkbenchV2StoreInput): Promise<ImageStorageResult> => {
    if (input.upload.metadata.candidate_id !== candidateId) {
      throw new Error("image_artifact_candidate_drift");
    }
    if (input.upload.metadata.source_epoch !== getSourceEpoch()) {
      throw new Error("image_artifact_source_epoch_drift");
    }
    canonicalActiveProject(dependencies.source_adapter, input.upload.metadata.project_id);

    const storage = await immutableStore(input);
    const record = buildImageArtifactRecord({
      source_adapter: dependencies.source_adapter,
      candidate_id: candidateId,
      upload: input,
      storage,
      recorded_at: now().toISOString(),
    });
    try {
      persistControlPlaneImageArtifact(db, record);
    } catch (error) {
      const evidence: ImageArtifactLedgerRecoveryEvidence = {
        schema_version: "1.0.0",
        failure_class: "image_artifact_ledger_insert_failed",
        occurred_at: now().toISOString(),
        error: errorMessage(error),
        artifact: record,
      };
      try {
        await writeRecoveryManifest(evidence);
      } catch (manifestError) {
        throw new Error(`image_artifact_ledger_failed_recovery_manifest_failed:${errorMessage(manifestError)}`);
      }
      throw new Error("image_artifact_ledger_persist_failed");
    }
    return storage;
  };

  return {
    persistence,
    authorizer,
    projection_service: new ProjectionService({ source_adapter: dependencies.source_adapter }),
    operations,
    get_epoch_authority: getEpochAuthority,
    get_source_epoch: getSourceEpoch,
    get_projection_epoch: getProjectionEpoch,
    resolve_security: dependencies.resolve_security ?? resolveLocalControlPlaneV2Security,
    allowed_origins: allowedOrigins,
    candidate_id: candidateId,
    store_image: storeImage,
  };
}

function sendRuntimeProblem(
  response: Response,
  input: {
    status: number;
    code: string;
    title: string;
    request_id: string;
    source_epoch: string;
    instance: string;
    detail: string;
  },
): Response {
  response.setHeader("x-request-id", input.request_id);
  response.type("application/problem+json");
  return response.status(input.status).json(
    createControlPlaneProblem({
      status: input.status,
      code: input.code,
      title: input.title,
      detail: input.detail,
      request_id: input.request_id,
      source_epoch: input.source_epoch,
      instance: input.instance,
    }),
  );
}

function optionalExactQueryValue(request: Request, name: string): string | null {
  const value = request.query[name];
  if (value === undefined) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name}_query_invalid`);
  }
  return value.trim();
}

export function registerControlPlaneV2RuntimeRoutes(
  ctx: { app: Pick<Express, "get" | "post">; db: Pick<DatabaseSync, "exec" | "prepare"> },
  dependencies: ControlPlaneV2RuntimeDependencies,
): ControlPlaneV2Runtime {
  const runtime = createControlPlaneV2Runtime(ctx.db, dependencies);
  const createId = dependencies.create_request_id ?? randomUUID;

  ctx.app.get(CONTROL_PLANE_V2_STATE_PATH, async (request, response) => {
    const resolvedRequestId = requestId(request, createId);
    try {
      const state = await runtime.projection_service.readState();
      response.setHeader("x-request-id", resolvedRequestId);
      return response.json(
        createControlPlaneEnvelope(state, {
          request_id: resolvedRequestId,
          source_epoch: state.source_epoch,
        }),
      );
    } catch (error) {
      let sourceEpoch = "unavailable";
      try {
        sourceEpoch = runtime.get_source_epoch();
      } catch {
        // The Problem response still fails closed when root projection is absent.
      }
      return sendRuntimeProblem(response, {
        status: 503,
        code: "control_plane_projection_unavailable",
        title: "Control Plane projection unavailable",
        request_id: resolvedRequestId,
        source_epoch: sourceEpoch,
        instance: request.originalUrl || request.url || CONTROL_PLANE_V2_STATE_PATH,
        detail: error instanceof Error ? error.message : "projection_failed",
      });
    }
  });

  ctx.app.get(IMAGE_WORKBENCH_V2_ARTIFACTS_PATH, (request, response) => {
    const resolvedRequestId = requestId(request, createId);
    let sourceEpoch = "unavailable";
    let projectionEpoch = "unavailable";
    const instance = request.originalUrl || request.url || IMAGE_WORKBENCH_V2_ARTIFACTS_PATH;
    try {
      const authority = runtime.get_epoch_authority();
      sourceEpoch = authority.source_epoch;
      projectionEpoch = authority.projection_epoch;
      const requestedCandidate = optionalExactQueryValue(request, "candidate_id");
      const requestedEpoch = optionalExactQueryValue(request, "source_epoch");
      if (requestedCandidate !== null && requestedCandidate !== runtime.candidate_id) {
        return sendRuntimeProblem(response, {
          status: 409,
          code: "candidate_id_mismatch",
          title: "Release candidate mismatch",
          request_id: resolvedRequestId,
          source_epoch: sourceEpoch,
          instance,
          detail: "Only the current release candidate can be queried.",
        });
      }
      if (requestedEpoch !== null && requestedEpoch !== sourceEpoch) {
        return sendRuntimeProblem(response, {
          status: 409,
          code: "source_epoch_mismatch",
          title: "Source epoch mismatch",
          request_id: resolvedRequestId,
          source_epoch: sourceEpoch,
          instance,
          detail: "Only the current Control Plane source epoch can be queried.",
        });
      }

      let projectId: string;
      try {
        projectId = canonicalActiveProject(dependencies.source_adapter, String(request.params.projectId ?? ""));
      } catch (error) {
        if (errorMessage(error) !== "image_export_project_not_active") throw error;
        return sendRuntimeProblem(response, {
          status: 404,
          code: "image_export_project_not_active",
          title: "Image export project is not active",
          request_id: resolvedRequestId,
          source_epoch: sourceEpoch,
          instance,
          detail: "The requested project is not active in the Control Plane registry.",
        });
      }

      const artifacts = readCurrentControlPlaneImageArtifacts(ctx.db, {
        candidate_id: runtime.candidate_id,
        source_epoch: sourceEpoch,
        project_id: projectId,
      });
      response.setHeader("x-request-id", resolvedRequestId);
      return response.json(
        createControlPlaneEnvelope(
          {
            candidate_id: runtime.candidate_id,
            projection_epoch: projectionEpoch,
            project_id: projectId,
            artifacts,
          },
          {
            request_id: resolvedRequestId,
            source_epoch: sourceEpoch,
          },
        ),
      );
    } catch (error) {
      const code = errorMessage(error);
      const invalidQuery = code.endsWith("_query_invalid");
      return sendRuntimeProblem(response, {
        status: invalidQuery ? 400 : 500,
        code: invalidQuery ? code : "image_artifact_ledger_unavailable",
        title: invalidQuery ? "Invalid artifact query" : "Image artifact ledger unavailable",
        request_id: resolvedRequestId,
        source_epoch: sourceEpoch,
        instance,
        detail: code,
      });
    }
  });

  registerControlPlaneV2MutationRoutes(ctx.app, {
    authorizer: runtime.authorizer,
    persistence: runtime.persistence,
    operations: runtime.operations,
    get_source_epoch: runtime.get_source_epoch,
    get_projection_epoch: runtime.get_projection_epoch,
    resolve_security: runtime.resolve_security,
    allowed_origins: runtime.allowed_origins,
    create_request_id: createId,
  });
  registerControlPlaneV2ReadOperationRoutes(ctx.app, {
    operations: dependencies.read_operations,
    get_epoch_authority: runtime.get_epoch_authority,
    resolve_security: runtime.resolve_security,
    allowed_origins: runtime.allowed_origins,
    create_request_id: createId,
  });
  registerImageWorkbenchV2UploadRoutes(ctx.app, {
    authorizer: runtime.authorizer,
    get_source_epoch: runtime.get_source_epoch,
    get_projection_epoch: runtime.get_projection_epoch,
    get_candidate_id: () => runtime.candidate_id,
    resolve_security: runtime.resolve_security,
    store: runtime.store_image,
    spec_id: DONGGRI_V1_STABILIZATION_SPEC_ID,
    resolve_registered_parent_sha256: (input) => {
      if (input.candidate_id !== runtime.candidate_id) throw new Error("image_parent_candidate_id_mismatch");
      if (input.source_epoch !== runtime.get_source_epoch()) throw new Error("image_parent_source_epoch_mismatch");
      const projectId = canonicalActiveProject(dependencies.source_adapter, input.project_id);
      return readRegisteredImageParentSha256(ctx.db, {
        candidate_id: runtime.candidate_id,
        source_epoch: input.source_epoch,
        project_id: projectId,
        parent_sha256: input.parent_sha256,
      });
    },
    resolve_export_target: (input) => resolveRegisteredImageExportTarget(dependencies.source_adapter, input),
    create_store_command: (input) => ({
      executable_id: IMAGE_WORKBENCH_STORE_EXECUTABLE_ID,
      args: ["persist", input.project_id, input.artifact_id, input.original_sha256, input.export_target_ref],
      cwd_ref: DONGGRI_V1_WORKTREE_CWD_REF,
    }),
    allowed_origins: runtime.allowed_origins,
    create_request_id: createId,
  });

  return runtime;
}
