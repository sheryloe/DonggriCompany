import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import express, { type Request } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  InMemoryMutationAuthorizerPersistence,
  MutationAuthorizer,
  type ApprovalReceipt,
  type MutationPreview,
} from "../../control-plane/mutation-authorizer.ts";
import {
  IMAGE_WORKBENCH_V2_UPLOAD_OPERATION,
  IMAGE_WORKBENCH_V2_UPLOAD_PATH,
  IMAGE_WORKBENCH_V2_UPLOAD_PREVIEW_PATH,
  registerImageWorkbenchV2UploadRoutes,
  type ImageWorkbenchV2ParentLineageLookupInput,
  type ImageWorkbenchV2PreviewAuthorityInput,
  type ImageWorkbenchV2StoreInput,
} from "./image-workbench-v2.ts";
import type { ControlPlaneV2SecurityContext } from "./control-plane-v2.ts";

const SOURCE_EPOCH = `sha256:${"a".repeat(64)}`;
const OTHER_SOURCE_EPOCH = `sha256:${"b".repeat(64)}`;
const PROJECTION_EPOCH = `sha256:${"c".repeat(64)}`;
const NEXT_PROJECTION_EPOCH = `sha256:${"d".repeat(64)}`;
const CANDIDATE_ID = "dongri-grigri-v1-beta.1";
const ALLOWED_ORIGIN = "https://images.example.test";
const EXPORT_TARGET = "registered-export:image-workbench";

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1;
  const scanlineBytes = Math.ceil(width / 8) + 1;
  const idat = deflateSync(Buffer.alloc(scanlineBytes * height), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function securityFromRequest(req: Request): ControlPlaneV2SecurityContext {
  return {
    authenticated: req.header("x-test-auth") === "valid",
    csrf_valid: req.header("x-csrf-token") === "valid",
    requester: req.header("x-test-requester") ?? null,
    approver: req.header("x-test-approver") ?? null,
  };
}

function uploadHeaders(idempotencyKey: string, origin = ALLOWED_ORIGIN) {
  return {
    origin,
    "x-test-auth": "valid",
    "x-csrf-token": "valid",
    "x-test-requester": "requester",
    "x-test-approver": "approver",
    "idempotency-key": idempotencyKey,
  };
}

describe("Control Plane v2 Image Workbench upload route", () => {
  let app: express.Express;
  let authorizer: MutationAuthorizer;
  let store: ReturnType<typeof vi.fn<(input: ImageWorkbenchV2StoreInput) => Promise<{ storage_ref: string }>>>;
  let resolveExportTarget: ReturnType<typeof vi.fn<(input: ImageWorkbenchV2PreviewAuthorityInput) => Promise<string>>>;
  let resolveRegisteredParentSha256: ReturnType<
    typeof vi.fn<(input: ImageWorkbenchV2ParentLineageLookupInput) => Promise<readonly string[]>>
  >;
  let createStoreCommand: ReturnType<typeof vi.fn>;
  let projectionEpoch: string;

  beforeEach(() => {
    const persistence = new InMemoryMutationAuthorizerPersistence();
    projectionEpoch = PROJECTION_EPOCH;
    authorizer = new MutationAuthorizer({
      persistence,
      allowed_origins: [ALLOWED_ORIGIN],
      allowed_executable_ids: ["image-store"],
      allowed_cwd_refs: ["worktree:donggri-v1"],
    });
    store = vi.fn(async ({ upload }) => ({
      storage_ref: `candidate-store:${upload.metadata.artifact_id}`,
    }));
    resolveExportTarget = vi.fn(async () => EXPORT_TARGET);
    resolveRegisteredParentSha256 = vi.fn(async (input) => input.parent_sha256);
    createStoreCommand = vi.fn((input: ImageWorkbenchV2PreviewAuthorityInput) => ({
      executable_id: "image-store",
      args: ["persist", input.artifact_id],
      cwd_ref: "worktree:donggri-v1",
    }));
    app = express();
    app.use(express.json({ limit: "1mb" }));
    registerImageWorkbenchV2UploadRoutes(app, {
      authorizer,
      get_source_epoch: () => SOURCE_EPOCH,
      get_projection_epoch: () => projectionEpoch,
      get_candidate_id: () => CANDIDATE_ID,
      resolve_security: securityFromRequest,
      store,
      spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
      resolve_registered_parent_sha256: resolveRegisteredParentSha256,
      resolve_export_target: resolveExportTarget,
      create_store_command: createStoreCommand,
      allowed_origins: [ALLOWED_ORIGIN],
      create_request_id: () => "image-upload-request-id",
    });
  });

  async function approveUpload(input?: {
    bytes?: Buffer;
    artifact_id?: string;
    source_epoch?: string;
    candidate_id?: string;
    export_target_ref?: string;
    scope_original_sha256?: string;
    parent_sha256?: string[];
  }): Promise<{
    bytes: Buffer;
    preview: MutationPreview;
    receipt: ApprovalReceipt;
    metadata: Record<string, unknown>;
  }> {
    const bytes = input?.bytes ?? png(640, 480);
    const artifactId = input?.artifact_id ?? "artifact-001";
    const sourceEpoch = input?.source_epoch ?? SOURCE_EPOCH;
    const candidateId = input?.candidate_id ?? CANDIDATE_ID;
    const exportTarget = input?.export_target_ref ?? EXPORT_TARGET;
    const originalSha = sha256(bytes);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const parentSha = input?.parent_sha256 ?? [];
    const preview = await authorizer.createPreview({
      spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
      project_id: "DonggriCompany",
      operation: IMAGE_WORKBENCH_V2_UPLOAD_OPERATION,
      resolved_target: exportTarget,
      scope: {
        artifact_id: artifactId,
        candidate_id: candidateId,
        source_epoch: sourceEpoch,
        export_target_ref: exportTarget,
        original_sha256: input?.scope_original_sha256 ?? originalSha,
        parent_sha256: parentSha,
        mime_type: "image/png",
        byte_length: bytes.length,
        width,
        height,
        pixel_count: width * height,
      },
      command: {
        executable_id: "image-store",
        args: ["persist", artifactId],
        cwd_ref: "worktree:donggri-v1",
      },
      source_epoch: sourceEpoch,
      projection_epoch: PROJECTION_EPOCH,
      requester: "requester",
    });
    const receipt = await authorizer.issueApproval(preview.preview_id, "approver");
    return {
      bytes,
      preview,
      receipt,
      metadata: {
        project_id: "DonggriCompany",
        artifact_id: artifactId,
        candidate_id: candidateId,
        source_epoch: sourceEpoch,
        preview_id: preview.preview_id,
        approval_id: receipt.approval_id,
        confirmation_text: preview.confirmation_text,
        export_target_ref: exportTarget,
        parent_sha256: parentSha,
        expected_original_sha256: originalSha,
      },
    };
  }

  function sendMultipart(
    approved: Awaited<ReturnType<typeof approveUpload>>,
    idempotencyKey: string,
    options?: {
      metadata?: Record<string, unknown>;
      origin?: string;
      filename?: string;
      mime?: string;
      headers?: Record<string, string>;
    },
  ) {
    let call = request(app).post(IMAGE_WORKBENCH_V2_UPLOAD_PATH).set(uploadHeaders(idempotencyKey, options?.origin));
    if (options?.headers) call = call.set(options.headers);
    return call
      .field("metadata", JSON.stringify(options?.metadata ?? approved.metadata))
      .attach("image", approved.bytes, {
        filename: options?.filename ?? "image.png",
        contentType: options?.mime ?? "image/png",
      });
  }

  function sendPreview(bytes: Buffer, metadata: Record<string, unknown>, idempotencyKey: string) {
    return request(app)
      .post(IMAGE_WORKBENCH_V2_UPLOAD_PREVIEW_PATH)
      .set(uploadHeaders(idempotencyKey))
      .field("metadata", JSON.stringify(metadata))
      .attach("image", bytes, {
        filename: "image.png",
        contentType: "image/png",
      });
  }

  it("creates a server-owned preview from a validated image fingerprint without storing image bytes", async () => {
    const bytes = png(720, 405);
    const parentSha = ["d".repeat(64)];
    const response = await sendPreview(
      bytes,
      {
        project_id: "DonggriCompany",
        artifact_id: "artifact-preview-001",
        parent_sha256: parentSha,
      },
      "upload-preview-0001",
    )
      .set("x-request-id", "image-preview-request-001")
      .expect(201);

    expect(response.body).toMatchObject({
      request_id: "image-preview-request-001",
      source_epoch: SOURCE_EPOCH,
      data: {
        preview: {
          spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
          project_id: "DonggriCompany",
          operation: IMAGE_WORKBENCH_V2_UPLOAD_OPERATION,
          resolved_target: EXPORT_TARGET,
          source_epoch: SOURCE_EPOCH,
          scope: {
            artifact_id: "artifact-preview-001",
            candidate_id: CANDIDATE_ID,
            source_epoch: SOURCE_EPOCH,
            export_target_ref: EXPORT_TARGET,
            original_sha256: sha256(bytes),
            parent_sha256: parentSha,
            mime_type: "image/png",
            byte_length: bytes.length,
            width: 720,
            height: 405,
            pixel_count: 291_600,
          },
          command: {
            executable_id: "image-store",
            args: ["persist", "artifact-preview-001"],
            cwd_ref: "worktree:donggri-v1",
          },
        },
        upload_fingerprint: {
          artifact_id: "artifact-preview-001",
          original_sha256: sha256(bytes),
          candidate_id: CANDIDATE_ID,
        },
      },
    });
    expect(response.body.data.preview.confirmation_text).toEqual(expect.any(String));
    expect(response.body.data.preview.confirmation_text.length).toBeGreaterThan(0);
    expect(resolveExportTarget).toHaveBeenCalledTimes(1);
    expect(resolveRegisteredParentSha256).toHaveBeenCalledWith({
      project_id: "DonggriCompany",
      parent_sha256: parentSha,
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      requester: "requester",
      request_id: "image-preview-request-001",
    });
    expect(resolveExportTarget.mock.calls[0]?.[0]).toMatchObject({
      project_id: "DonggriCompany",
      artifact_id: "artifact-preview-001",
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      original_sha256: sha256(bytes),
      requester: "requester",
      request_id: "image-preview-request-001",
    });
    expect(resolveExportTarget.mock.calls[0]?.[0]).not.toHaveProperty("bytes");
    expect(createStoreCommand).toHaveBeenCalledTimes(1);
    expect(store).not.toHaveBeenCalled();
  });

  it("rejects a missing parent before preview, receipt, command, or image storage", async () => {
    resolveRegisteredParentSha256.mockResolvedValueOnce([]);
    const missingParent = "1".repeat(64);
    const response = await sendPreview(
      png(320, 180),
      {
        project_id: "DonggriCompany",
        artifact_id: "artifact-missing-parent",
        parent_sha256: [missingParent],
      },
      "upload-preview-missing-parent",
    ).expect(422);

    expect(response.body).toMatchObject({
      code: "image_parent_lineage_not_registered",
      source_epoch: SOURCE_EPOCH,
    });
    expect(response.body).not.toHaveProperty("data.preview");
    expect(resolveExportTarget).not.toHaveBeenCalled();
    expect(createStoreCommand).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it.each([
    ["candidate", "dongri-grigri-v1-beta.2", SOURCE_EPOCH, "DonggriCompany"],
    ["source epoch", CANDIDATE_ID, OTHER_SOURCE_EPOCH, "DonggriCompany"],
    ["project", CANDIDATE_ID, SOURCE_EPOCH, "BloggerGent"],
  ] as const)(
    "rejects a parent found only in a different %s ledger scope without storing",
    async (_scope, recordCandidateId, recordSourceEpoch, recordProjectId) => {
      const parentSha = "2".repeat(64);
      const records = [
        {
          candidate_id: recordCandidateId,
          source_epoch: recordSourceEpoch,
          project_id: recordProjectId,
          derived_sha256: parentSha,
        },
      ];
      resolveRegisteredParentSha256.mockImplementationOnce(async (input) =>
        records
          .filter(
            (record) =>
              record.candidate_id === input.candidate_id &&
              record.source_epoch === input.source_epoch &&
              record.project_id === input.project_id,
          )
          .map((record) => record.derived_sha256),
      );

      const response = await sendPreview(
        png(320, 180),
        {
          project_id: "DonggriCompany",
          artifact_id: `artifact-cross-${_scope.replace(" ", "-")}`,
          parent_sha256: [parentSha],
        },
        `upload-preview-cross-${_scope.replace(" ", "-")}`,
      ).expect(422);

      expect(response.body.code).toBe("image_parent_lineage_not_registered");
      expect(resolveExportTarget).not.toHaveBeenCalled();
      expect(createStoreCommand).not.toHaveBeenCalled();
      expect(store).not.toHaveBeenCalled();
    },
  );

  it("rejects client-supplied target, scope, command, receipt, candidate, or source during preview", async () => {
    const bytes = png(320, 180);
    const response = await sendPreview(
      bytes,
      {
        project_id: "DonggriCompany",
        artifact_id: "artifact-client-authority",
        parent_sha256: [],
        candidate_id: "client-candidate",
        source_epoch: OTHER_SOURCE_EPOCH,
        export_target_ref: "registered-export:client-target",
        scope: { client: "owned" },
        command: { executable_id: "shell", args: [] },
        receipt: { approval_id: "client-receipt" },
      },
      "upload-preview-client-authority",
    ).expect(400);

    expect(response.body.code).toBe("image_multipart_invalid");
    expect(resolveExportTarget).not.toHaveBeenCalled();
    expect(createStoreCommand).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it("fails closed when the server resolver does not return a registered export target", async () => {
    resolveExportTarget.mockResolvedValueOnce("C:\\outside\\image.png");
    const response = await sendPreview(
      png(320, 180),
      {
        project_id: "DonggriCompany",
        artifact_id: "artifact-invalid-server-target",
        parent_sha256: [],
      },
      "upload-preview-invalid-target",
    ).expect(500);

    expect(response.body.code).toBe("image_upload_preview_contract_invalid");
    expect(createStoreCommand).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it("executes only when the second upload matches the server preview SHA, target, candidate, and epoch", async () => {
    const bytes = png(640, 360);
    const previewResponse = await sendPreview(
      bytes,
      {
        project_id: "DonggriCompany",
        artifact_id: "artifact-roundtrip",
        parent_sha256: [],
      },
      "upload-preview-roundtrip",
    ).expect(201);
    const preview = previewResponse.body.data.preview as MutationPreview;
    const receipt = await authorizer.issueApproval(preview.preview_id, "approver");
    const approved = {
      bytes,
      preview,
      receipt,
      metadata: {
        project_id: preview.project_id,
        artifact_id: "artifact-roundtrip",
        candidate_id: CANDIDATE_ID,
        source_epoch: preview.source_epoch,
        preview_id: preview.preview_id,
        approval_id: receipt.approval_id,
        confirmation_text: preview.confirmation_text,
        export_target_ref: preview.resolved_target,
        parent_sha256: [],
        expected_original_sha256: sha256(bytes),
      },
    };

    await sendMultipart(approved, "upload-execute-roundtrip").expect(201);
    expect(store).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed server projection epoch before storing image bytes", async () => {
    const approved = await approveUpload({ artifact_id: "artifact-projection-drift" });
    projectionEpoch = NEXT_PROJECTION_EPOCH;

    const response = await sendMultipart(approved, "upload-projection-drift").expect(409);

    expect(response.body).toMatchObject({
      status: 409,
      code: "projection_epoch_mismatch",
      source_epoch: SOURCE_EPOCH,
    });
    expect(store).not.toHaveBeenCalled();
  });

  it("does not store a changed image even when execute metadata truthfully declares its new SHA", async () => {
    const previewBytes = png(640, 360);
    const previewResponse = await sendPreview(
      previewBytes,
      {
        project_id: "DonggriCompany",
        artifact_id: "artifact-changed-after-preview",
        parent_sha256: [],
      },
      "upload-preview-change-detection",
    ).expect(201);
    const preview = previewResponse.body.data.preview as MutationPreview;
    const receipt = await authorizer.issueApproval(preview.preview_id, "approver");
    const changedBytes = Buffer.concat([previewBytes, Buffer.from([0x01])]);
    const changed = {
      bytes: changedBytes,
      preview,
      receipt,
      metadata: {
        project_id: preview.project_id,
        artifact_id: "artifact-changed-after-preview",
        candidate_id: CANDIDATE_ID,
        source_epoch: preview.source_epoch,
        preview_id: preview.preview_id,
        approval_id: receipt.approval_id,
        confirmation_text: preview.confirmation_text,
        export_target_ref: preview.resolved_target,
        parent_sha256: [],
        expected_original_sha256: sha256(changedBytes),
      },
    };

    const response = await sendMultipart(changed, "upload-execute-changed").expect(500);
    expect(response.body.code).toBe("mutation_callback_failed");
    expect(store).not.toHaveBeenCalled();
  });

  it("stores a multipart image only inside MutationAuthorizer.execute and returns a bound lineage envelope", async () => {
    const approved = await approveUpload();
    const response = await sendMultipart(approved, "upload-idempotency-0001")
      .set("x-request-id", "image-request-001")
      .expect(201);

    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["x-request-id"]).toBe("image-request-001");
    expect(response.body).toMatchObject({
      request_id: "image-request-001",
      source_epoch: SOURCE_EPOCH,
      data: {
        status: "executed",
        approval_id: approved.receipt.approval_id,
        receipt_sha256: approved.receipt.receipt_sha256,
        upload: {
          project_id: "DonggriCompany",
          artifact_id: "artifact-001",
          filename: "image.png",
          mime_type: "image/png",
          width: 640,
          height: 480,
          lineage: {
            candidate_id: CANDIDATE_ID,
            source_epoch: SOURCE_EPOCH,
            approval_id: approved.receipt.approval_id,
            export_target_ref: EXPORT_TARGET,
            original_sha256: sha256(approved.bytes),
            derived_sha256: sha256(approved.bytes),
          },
          storage: {
            storage_ref: "candidate-store:artifact-001",
          },
        },
      },
    });
    expect(store).toHaveBeenCalledTimes(1);
    expect(store.mock.calls[0]?.[0]).toMatchObject({
      request_id: "image-request-001",
      preview: { preview_id: approved.preview.preview_id },
      approval_receipt: { approval_id: approved.receipt.approval_id },
      lineage: {
        original_sha256: sha256(approved.bytes),
        derived_sha256: sha256(approved.bytes),
      },
    });
    expect(store.mock.calls[0]?.[0].upload.bytes.equals(approved.bytes)).toBe(true);
  });

  it("replays the same idempotent result without invoking the store twice", async () => {
    const approved = await approveUpload();
    await sendMultipart(approved, "upload-idempotency-replay").expect(201);
    const replay = await sendMultipart(approved, "upload-idempotency-replay").expect(200);

    expect(replay.body.data.status).toBe("replayed");
    expect(store).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of an idempotency key for a different approved upload", async () => {
    const first = await approveUpload({ artifact_id: "artifact-first" });
    await sendMultipart(first, "upload-idempotency-conflict").expect(201);
    const second = await approveUpload({
      artifact_id: "artifact-second",
      bytes: png(320, 200),
    });
    const conflict = await sendMultipart(second, "upload-idempotency-conflict").expect(409);

    expect(conflict.body.code).toBe("idempotency_conflict");
    expect(store).toHaveBeenCalledTimes(1);
  });

  it("rejects JSON/base64 and requires an Idempotency-Key before parsing bytes", async () => {
    const json = await request(app)
      .post(IMAGE_WORKBENCH_V2_UPLOAD_PATH)
      .set(uploadHeaders("upload-json-base64-0001"))
      .send({ image_base64: "iVBORw0KGgo=", metadata: {} })
      .expect(415);
    expect(json.body.code).toBe("multipart_required");

    const approved = await approveUpload();
    const missingKey = await request(app)
      .post(IMAGE_WORKBENCH_V2_UPLOAD_PATH)
      .set({
        origin: ALLOWED_ORIGIN,
        "x-test-auth": "valid",
        "x-csrf-token": "valid",
        "x-test-requester": "requester",
      })
      .field("metadata", JSON.stringify(approved.metadata))
      .attach("image", approved.bytes, { filename: "image.png", contentType: "image/png" })
      .expect(428);
    expect(missingKey.body.code).toBe("idempotency_key_required");
    expect(store).not.toHaveBeenCalled();
  });

  it.each([
    [
      "not_authenticated",
      {
        "x-test-auth": "invalid",
      },
      401,
    ],
    [
      "csrf_invalid",
      {
        "x-csrf-token": "invalid",
      },
      403,
    ],
  ] as const)("rejects %s before the store callback", async (code, headers, status) => {
    const approved = await approveUpload();
    const response = await sendMultipart(approved, `upload-guard-${code}`, { headers }).expect(status);

    expect(response.body.code).toBe(code);
    expect(store).not.toHaveBeenCalled();
  });

  it("allows loopback or an exact origin and rejects suffix matches", async () => {
    const loopback = await approveUpload({ artifact_id: "artifact-loopback" });
    await sendMultipart(loopback, "upload-loopback-0001", { origin: "http://127.0.0.1:8790" }).expect(201);

    const rejected = await approveUpload({ artifact_id: "artifact-rejected-origin" });
    const response = await sendMultipart(rejected, "upload-origin-0002", {
      origin: "https://sub.images.example.test",
    }).expect(403);
    expect(response.body.code).toBe("origin_not_allowed");
    expect(store).toHaveBeenCalledTimes(1);
  });

  it("rejects source epoch, candidate, approval, and manual confirmation mismatches", async () => {
    const source = await approveUpload();
    const wrongSource = await sendMultipart(source, "upload-source-mismatch", {
      metadata: { ...source.metadata, source_epoch: OTHER_SOURCE_EPOCH },
    }).expect(409);
    expect(wrongSource.body.code).toBe("source_epoch_mismatch");

    const candidate = await approveUpload({ artifact_id: "artifact-candidate" });
    const wrongCandidate = await sendMultipart(candidate, "upload-candidate-mismatch", {
      metadata: { ...candidate.metadata, candidate_id: "dongri-grigri-v1-beta.2" },
    }).expect(409);
    expect(wrongCandidate.body.code).toBe("candidate_id_mismatch");

    const approval = await approveUpload({ artifact_id: "artifact-approval" });
    const wrongApproval = await sendMultipart(approval, "upload-approval-mismatch", {
      metadata: { ...approval.metadata, approval_id: "approval-does-not-exist" },
    }).expect(404);
    expect(wrongApproval.body.code).toBe("approval_not_found");

    const confirmation = await approveUpload({ artifact_id: "artifact-confirmation" });
    const wrongConfirmation = await sendMultipart(confirmation, "upload-confirmation-mismatch", {
      metadata: { ...confirmation.metadata, confirmation_text: "자동 입력된 잘못된 확인문" },
    }).expect(422);
    expect(wrongConfirmation.body.code).toBe("confirmation_mismatch");
    expect(store).not.toHaveBeenCalled();
  });

  it("fails closed when preview scope does not bind the upload hash and never calls the store", async () => {
    const approved = await approveUpload({
      artifact_id: "artifact-scope-drift",
      scope_original_sha256: "c".repeat(64),
    });
    const response = await sendMultipart(approved, "upload-scope-drift-0001").expect(500);

    expect(response.body.code).toBe("mutation_callback_failed");
    expect(store).not.toHaveBeenCalled();
  });

  it("surfaces parser media and path defenses as Problem responses without storing", async () => {
    const approved = await approveUpload();
    const mime = await sendMultipart(approved, "upload-mime-spoof-0001", {
      mime: "image/jpeg",
    }).expect(415);
    expect(mime.body.code).toBe("image_media_type_invalid");

    const boundary = "donggri-path-traversal-boundary";
    const before = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(approved.metadata)}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="../image.png"\r\nContent-Type: image/png\r\n\r\n`,
      "utf8",
    );
    const after = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const pathTraversal = await request(app)
      .post(IMAGE_WORKBENCH_V2_UPLOAD_PATH)
      .set(uploadHeaders("upload-path-traversal-0002"))
      .set("content-type", `multipart/form-data; boundary=${boundary}`)
      .send(Buffer.concat([before, approved.bytes, after]))
      .expect(400);
    expect(pathTraversal.body.code).toBe("image_multipart_invalid");
    expect(store).not.toHaveBeenCalled();
  });
});
