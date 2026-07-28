import { beforeEach, describe, expect, it, vi } from "vitest";

import { __resetApiRuntimeForTests } from "./core";
import {
  type DurableImageUploadFingerprint,
  executeDurableImageArtifactUpload,
  previewDurableImageArtifactUpload,
  readDurableImageProject,
  resolveRegisteredParentSha256,
  type V2ImageArtifactRecord,
} from "./image-workbench";

import type { ControlPlaneV2ApprovalReceipt, ControlPlaneV2Preview } from "./control-plane-v2";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const version = {
  id: "artifact-1",
  projectId: "project:DonggriCompany",
  taskId: "task-1",
  runId: "run-1",
  traceId: "trace-1",
  createdByAgentId: "DESIGN",
  skillId: "image-workbench",
  skillVersion: "1.0.0",
  model: "browser-canvas",
  promptVersion: "v1",
  operation: "input" as const,
  version: 1,
  parentId: null,
  sourceIds: [],
  sourceName: "source.png",
  outputName: "artifact-1.png",
  blob: new Blob(["png-bytes"], { type: "image/png" }),
  sha256: "a".repeat(64),
  mimeType: "image/png" as const,
  width: 16,
  height: 16,
  rightsSource: "internal",
  createdAt: "2026-07-25T00:00:00.000Z",
  modifiedAt: "2026-07-25T00:00:00.000Z",
  processingStatus: "complete" as const,
  failureReason: null,
  analysisSummary: null,
};

const preview: ControlPlaneV2Preview = {
  schema_version: "1.0.0",
  preview_id: "preview-1",
  spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
  project_id: version.projectId,
  operation: "image-workbench.upload",
  resolved_target: "registered-export:project:DonggriCompany/artifact-1",
  scope: { artifact_id: version.id },
  command: {
    executable_id: "image-workbench-store",
    args: ["artifact-1"],
    cwd_ref: "worktree:DonggriCompany-v01-main",
  },
  target_digest: "b".repeat(64),
  scope_digest: "c".repeat(64),
  command_digest: "d".repeat(64),
  source_epoch: `sha256:${"e".repeat(64)}`,
  projection_epoch: `sha256:${"a".repeat(64)}`,
  requester: "local-user",
  confirmation_text: "승인 image-workbench.upload bbbbbbbbbbbb",
  issued_at: "2026-07-25T00:00:00.000Z",
  expires_at: "2026-07-25T00:05:00.000Z",
};

const fingerprint: DurableImageUploadFingerprint = {
  project_id: version.projectId,
  artifact_id: version.id,
  filename: version.outputName,
  mime_type: version.mimeType,
  byte_length: 9,
  width: version.width,
  height: version.height,
  pixel_count: version.width * version.height,
  original_sha256: version.sha256,
  parent_sha256: [],
  candidate_id: "dongri-grigri-v1-alpha.0",
};

const approval: ControlPlaneV2ApprovalReceipt = {
  approval_id: "approval-1",
  preview_id: preview.preview_id,
  spec_id: preview.spec_id,
  project_id: preview.project_id,
  operation: preview.operation,
  resolved_target: preview.resolved_target,
  target_digest: preview.target_digest,
  scope_digest: preview.scope_digest,
  command_digest: preview.command_digest,
  source_epoch: preview.source_epoch,
  projection_epoch: preview.projection_epoch,
  issued_at: preview.issued_at,
  expires_at: preview.expires_at,
  requester: preview.requester,
  approver: "local-user",
  receipt_sha256: "f".repeat(64),
};

const registeredParent: V2ImageArtifactRecord = {
  candidate_id: fingerprint.candidate_id,
  source_epoch: preview.source_epoch,
  project_id: version.projectId,
  artifact_id: "artifact-parent-1",
  original_sha256: "1".repeat(64),
  derived_sha256: "2".repeat(64),
  parent_sha256: [],
  approval_id: "approval-parent-1",
  receipt_sha256: "3".repeat(64),
  export_target_ref: "registered-export:image-workbench/parent-1",
  storage_ref: "candidate-image:parent-1",
  storage: {},
  filename: "parent-1.png",
  mime_type: "image/png",
  byte_length: 100,
  width: 16,
  height: 16,
  pixel_count: 256,
  request_id: "request-parent-1",
  recorded_at: "2026-07-25T00:00:00.000Z",
};

describe("Image Workbench v2 API client", () => {
  beforeEach(() => {
    __resetApiRuntimeForTests();
    vi.restoreAllMocks();
  });

  it("reads only the current candidate ledger through the v2 envelope", async () => {
    const ledger = {
      candidate_id: "dongri-grigri-v1-alpha.0",
      project_id: version.projectId,
      artifacts: [],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        data: ledger,
        request_id: "request-ledger-1",
        source_epoch: preview.source_epoch,
      }),
    );

    await expect(readDurableImageProject(version.projectId)).resolves.toEqual({
      ...ledger,
      source_epoch: preview.source_epoch,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/control-plane/v2/image-workbench/projects/project%3ADonggriCompany/artifacts",
    );
  });

  it("derives parent SHA only from the exact candidate, source epoch, and project ledger record", () => {
    expect(
      resolveRegisteredParentSha256(["artifact-parent-1"], [registeredParent], {
        candidate_id: registeredParent.candidate_id,
        source_epoch: registeredParent.source_epoch,
        project_id: "DonggriCompany",
      }),
    ).toEqual([registeredParent.derived_sha256]);
  });

  it.each([
    ["missing", []],
    ["candidate", [{ ...registeredParent, candidate_id: "dongri-grigri-v1-beta.2" }]],
    ["source epoch", [{ ...registeredParent, source_epoch: `sha256:${"4".repeat(64)}` }]],
    ["project", [{ ...registeredParent, project_id: "project:BloggerGent" }]],
  ] as const)("rejects a browser parent that is %s from the active ledger scope", (_scope, artifacts) => {
    expect(() =>
      resolveRegisteredParentSha256(["artifact-parent-1"], artifacts, {
        candidate_id: registeredParent.candidate_id,
        source_epoch: registeredParent.source_epoch,
        project_id: registeredParent.project_id,
      }),
    ).toThrow("image_parent_not_registered:artifact-parent-1");
  });

  it("uses multipart preview without JSON base64 or client-owned authority fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        data: { preview, upload_fingerprint: fingerprint },
        request_id: "request-1",
        source_epoch: preview.source_epoch,
      }),
    );

    await previewDurableImageArtifactUpload(version, [], "image-preview-idempotency-001");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/control-plane/v2/image-workbench/uploads/preview");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("image-preview-idempotency-001");
    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(JSON.parse(String(body.get("metadata")))).toEqual({
      project_id: version.projectId,
      artifact_id: version.id,
      parent_sha256: [],
    });
    expect(body.get("file")).toBeInstanceOf(Blob);
    expect(String(body.get("metadata"))).not.toContain("base64");
    expect(String(body.get("metadata"))).not.toContain("resolved_target");
    expect(String(body.get("metadata"))).not.toContain("command");
  });

  it("sends the second image with the manually typed confirmation and no receipt object", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        data: {
          status: "executed",
          upload: { project_id: version.projectId, artifact_id: version.id, storage: {} },
          approval_id: approval.approval_id,
          receipt_sha256: approval.receipt_sha256,
        },
        request_id: "request-2",
        source_epoch: preview.source_epoch,
      }),
    );
    const manualConfirmation = "사용자가 직접 입력한 확인문";

    await executeDurableImageArtifactUpload(
      version,
      [],
      preview,
      fingerprint,
      approval,
      manualConfirmation,
      "image-execute-idempotency-001",
    );

    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    const metadata = JSON.parse(String(body.get("metadata")));
    expect(metadata.confirmation_text).toBe(manualConfirmation);
    expect(metadata).not.toHaveProperty("receipt");
    expect(metadata).not.toHaveProperty("command");
    expect(metadata).not.toHaveProperty("scope");
    expect(metadata).not.toHaveProperty("target_digest");
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("rejects a browser-changed parent list before sending the approved upload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(() =>
      executeDurableImageArtifactUpload(
        version,
        ["9".repeat(64)],
        preview,
        fingerprint,
        approval,
        "manual confirmation",
        "image-execute-parent-drift-001",
      ),
    ).toThrow("image_parent_preview_binding_mismatch");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
