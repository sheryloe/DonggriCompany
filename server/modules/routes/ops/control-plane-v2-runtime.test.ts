import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { deflateSync } from "node:zlib";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_AUTH_TOKEN } from "../../../config/runtime.ts";
import { getCsrfToken } from "../../../security/auth.ts";
import {
  applyControlPlaneMutationSchema,
  CONTROL_PLANE_MUTATION_TABLES,
} from "../../bootstrap/schema/control-plane-mutation-schema.ts";
import type { ControlPlaneSourceSnapshot } from "../../control-plane/source-adapter.ts";
import {
  Master95DurableControlTower,
  Master95MemoryControlTowerJournal,
} from "../../master95/durable-control-tower.ts";
import { controlTowerV2ActionOperation, controlTowerV2JourneyOperation } from "./control-plane-v2-control-tower.ts";
import type { ControlPlaneV2ReadOperations } from "./control-plane-v2-read-operations.ts";
import { CONTROL_PLANE_V2_MUTATION_PATHS } from "./control-plane-v2.ts";
import { IMAGE_WORKBENCH_V2_UPLOAD_PATH, IMAGE_WORKBENCH_V2_UPLOAD_PREVIEW_PATH } from "./image-workbench-v2.ts";
import {
  CONTROL_PLANE_V2_STATE_PATH,
  IMAGE_WORKBENCH_V2_ARTIFACTS_PATH,
  registerControlPlaneV2RuntimeRoutes,
} from "./control-plane-v2-runtime.ts";

const SOURCE_EPOCH = `sha256:${"a".repeat(64)}`;
const PROJECTION_EPOCH = `sha256:${"c".repeat(64)}`;
const NEXT_PROJECTION_EPOCH = `sha256:${"d".repeat(64)}`;
const CANDIDATE_ID = "dongri-v1-test-candidate";

function readOperations(): ControlPlaneV2ReadOperations {
  return {
    memory_search: async ({ query, scope }) => ({
      ok: true,
      available: true,
      query,
      scope,
      results: [],
      error: null,
    }),
    memory_context: async ({ query, scope }) => ({
      ok: true,
      available: true,
      query,
      scope: scope ?? "root",
      context: {},
      error: null,
    }),
    control_plane_sync_preview: () => ({ ok: true, mode: "preview", writes: false }),
    engine_route_preview: () => ({ ok: true, status: 200, writes: false, route: {} }),
    harness_blueprint_preview: () => ({ ok: true, status: 200, writes: false, blueprint: {} }),
  };
}

function sourceSnapshot(): ControlPlaneSourceSnapshot {
  const sourceFile = (relative_path: string) => ({
    relative_path,
    absolute_path: `G:\\Donggri_DevDrive\\${relative_path.replace(/\//g, "\\")}`,
    exists: true,
    size: 1,
    mtime: "2026-07-25T00:00:00.000Z",
    sha256: "b".repeat(64),
    content: "fixture",
    error: null,
  });
  return {
    generated_at: "2026-07-25T00:00:00.000Z",
    source_epoch: SOURCE_EPOCH,
    projection_epoch: PROJECTION_EPOCH,
    degraded: false,
    parse_errors: [],
    active_specs: [
      {
        id: "20260725-donggricompany-v1-stabilization-certification-v1",
        status: "implementation",
        phase: "g1-g2-implementation",
        related_repo: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
        related_repos: ["G:\\Donggri_DevDrive\\repos\\DonggriCompany"],
        scope: "DonggriCompany / V1 Stabilization",
        heading: "Current Active Spec (DonggriCompany / V1 Stabilization)",
        line: 1,
        next_recommended_action: null,
      },
    ],
    active_spec: null,
    next_recommended_action: null,
    projects: [
      {
        key: "DonggriCompany",
        path: "repos/DonggriCompany",
        type: "git-repo",
        has_agents: true,
        status: "active",
        summary: "fixture",
        operation_agent: null,
        enabled: true,
      },
      {
        key: "BloggerGent",
        path: "repos/BloggerGent",
        type: "git-repo",
        has_agents: true,
        status: "active",
        summary: "fixture",
        operation_agent: null,
        enabled: true,
      },
    ],
    files: {
      projects: sourceFile("storage/codex-control/registry/projects.yaml"),
      active_specs: sourceFile("storage/codex-control/specs/_active.md"),
    },
  };
}

function authenticatedMutation(
  requestBuilder: request.Test,
  origin = "https://approved.example",
  idempotencyKey = "runtime-integration-idempotency-0001",
) {
  return requestBuilder
    .set("authorization", `Bearer ${SESSION_AUTH_TOKEN}`)
    .set("x-csrf-token", getCsrfToken())
    .set("origin", origin)
    .set("idempotency-key", idempotencyKey);
}

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

describe("Control Plane v2 runtime integration", () => {
  let db: DatabaseSync;
  let app: express.Express;
  let imageStore: ReturnType<typeof vi.fn>;
  let controlTower: Master95DurableControlTower;
  let runtime: ReturnType<typeof registerControlPlaneV2RuntimeRoutes>;
  let currentSnapshot: ControlPlaneSourceSnapshot;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyControlPlaneMutationSchema(db);
    currentSnapshot = sourceSnapshot();
    app = express();
    app.use(express.json());
    imageStore = vi.fn(async ({ upload }) => ({
      storage_ref: `candidate-image:${upload.metadata.artifact_id}`,
      size_bytes: upload.byte_length,
      duplicate: false,
    }));
    controlTower = new Master95DurableControlTower(new Master95MemoryControlTowerJournal());
    runtime = registerControlPlaneV2RuntimeRoutes(
      { app, db },
      {
        source_adapter: { readSnapshot: () => currentSnapshot },
        read_operations: readOperations(),
        load_control_tower: async () => controlTower,
        allowed_origins: ["https://approved.example"],
        create_request_id: () => "runtime-request-001",
        candidate_id: CANDIDATE_ID,
        image_store: imageStore,
      },
    );
  });

  afterEach(() => {
    db.close();
  });

  it("registers the additive SQLite persistence and returns the v2 projection envelope", async () => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'control_plane_%'
         ORDER BY name`,
      )
      .all()
      .map((row) => String((row as { name: string }).name));
    for (const table of CONTROL_PLANE_MUTATION_TABLES) expect(tables).toContain(table);

    const response = await request(app)
      .get(CONTROL_PLANE_V2_STATE_PATH)
      .set("x-request-id", "projection-request-001")
      .expect(200);

    expect(response.headers["x-request-id"]).toBe("projection-request-001");
    expect(response.body).toMatchObject({
      request_id: "projection-request-001",
      source_epoch: SOURCE_EPOCH,
      data: {
        source_epoch: SOURCE_EPOCH,
        projection_epoch: PROJECTION_EPOCH,
        degraded: false,
        provenance: {
          control_plane: "root-control-plane",
          runtime: "unavailable",
          evidence: "unavailable",
        },
      },
    });
  });

  it("keeps the generic production registry empty and fails closed without persistence writes", async () => {
    const exact = await authenticatedMutation(request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.preview))
      .send({ operation: "not-registered", project_id: "DonggriCompany" })
      .expect(404);
    expect(exact.body).toMatchObject({
      code: "operation_not_registered",
      request_id: "runtime-request-001",
      source_epoch: SOURCE_EPOCH,
    });

    const persisted = db.prepare("SELECT COUNT(*) AS count FROM control_plane_mutation_previews").get() as {
      count: number;
    };
    expect(persisted.count).toBe(0);
  });

  it("registers all 17 Control Tower operations and executes journey/action only after manual confirmation", async () => {
    expect(Object.keys(runtime.operations)).toHaveLength(17);

    const journeyPreviewResponse = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.preview),
      "https://approved.example",
      "control-tower-journey-preview-0001",
    )
      .send({
        operation: controlTowerV2JourneyOperation("task-progress"),
        project_id: "project:BloggerGent",
        parameters: {},
      })
      .expect(200);
    const journeyPreview = journeyPreviewResponse.body.data.preview;
    expect(journeyPreview).toMatchObject({
      project_id: "project:BloggerGent",
      operation: "control-tower.journey.task-progress",
      scope: {
        external_effect: false,
        persistence: "append-only-event-journal",
      },
    });

    const journeyApprovalResponse = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.approval),
      "https://approved.example",
      "control-tower-journey-approval-0001",
    )
      .send({ preview_id: journeyPreview.preview_id })
      .expect(200);
    const journeyApproval = journeyApprovalResponse.body.data.approval_receipt;

    await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.execute),
      "https://approved.example",
      "control-tower-journey-execute-0001",
    )
      .send({
        preview_id: journeyPreview.preview_id,
        approval_id: journeyApproval.approval_id,
        source_epoch: SOURCE_EPOCH,
        confirmation_text: "자동 입력된 잘못된 확인문",
      })
      .expect(422);
    expect(controlTower.snapshot("project:BloggerGent").event_count).toBe(0);

    const journeyExecution = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.execute),
      "https://approved.example",
      "control-tower-journey-execute-0002",
    )
      .send({
        preview_id: journeyPreview.preview_id,
        approval_id: journeyApproval.approval_id,
        source_epoch: SOURCE_EPOCH,
        confirmation_text: journeyPreview.confirmation_text,
      })
      .expect(200);
    const journeySnapshot = journeyExecution.body.data.result.snapshot;
    expect(journeySnapshot.event_count).toBe(7);
    const running = journeySnapshot.runs.find((run: { status: string }) => run.status === "running");
    expect(running).toBeTruthy();

    const actionPreviewResponse = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.preview),
      "https://approved.example",
      "control-tower-action-preview-0001",
    )
      .send({
        operation: controlTowerV2ActionOperation("run-pause"),
        project_id: "project:BloggerGent",
        parameters: { target_id: running.run_id },
      })
      .expect(200);
    const actionPreview = actionPreviewResponse.body.data.preview;
    expect(actionPreview.resolved_target).toContain(running.run_id);

    const actionApprovalResponse = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.approval),
      "https://approved.example",
      "control-tower-action-approval-0001",
    )
      .send({ preview_id: actionPreview.preview_id })
      .expect(200);

    const actionExecution = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.execute),
      "https://approved.example",
      "control-tower-action-execute-0001",
    )
      .send({
        preview_id: actionPreview.preview_id,
        approval_id: actionApprovalResponse.body.data.approval_receipt.approval_id,
        source_epoch: SOURCE_EPOCH,
        confirmation_text: actionPreview.confirmation_text,
      })
      .expect(200);
    expect(
      actionExecution.body.data.result.snapshot.runs.find((run: { run_id: string }) => run.run_id === running.run_id)
        .status,
    ).toBe("paused");
  });

  it("rejects generic and image execution with zero effect after projects.yaml lifecycle projection drift", async () => {
    const journeyPreviewResponse = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.preview),
      "https://approved.example",
      "projection-drift-journey-preview-0001",
    )
      .send({
        operation: controlTowerV2JourneyOperation("task-progress"),
        project_id: "project:BloggerGent",
        parameters: {},
      })
      .expect(200);
    const journeyPreview = journeyPreviewResponse.body.data.preview;
    const journeyApprovalResponse = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.approval),
      "https://approved.example",
      "projection-drift-journey-approval-0001",
    )
      .send({ preview_id: journeyPreview.preview_id })
      .expect(200);

    const bytes = png(320, 240);
    const originalSha256 = createHash("sha256").update(bytes).digest("hex");
    const imagePreviewResponse = await authenticatedMutation(
      request(app).post(IMAGE_WORKBENCH_V2_UPLOAD_PREVIEW_PATH),
      "https://approved.example",
      "projection-drift-image-preview-0001",
    )
      .field(
        "metadata",
        JSON.stringify({
          project_id: "DonggriCompany",
          artifact_id: "artifact-projection-drift-001",
          parent_sha256: [],
        }),
      )
      .attach("image", bytes, { filename: "projection-drift.png", contentType: "image/png" })
      .expect(201);
    const imagePreview = imagePreviewResponse.body.data.preview;
    const imageApprovalResponse = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.approval),
      "https://approved.example",
      "projection-drift-image-approval-0001",
    )
      .send({ preview_id: imagePreview.preview_id })
      .expect(200);

    currentSnapshot = {
      ...currentSnapshot,
      projection_epoch: NEXT_PROJECTION_EPOCH,
      projects: currentSnapshot.projects.map((project) =>
        project.key === "DonggriCompany" || project.key === "BloggerGent"
          ? { ...project, status: "archived", enabled: false }
          : project,
      ),
    };

    const genericRejected = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.execute),
      "https://approved.example",
      "projection-drift-journey-execute-0001",
    )
      .send({
        preview_id: journeyPreview.preview_id,
        approval_id: journeyApprovalResponse.body.data.approval_receipt.approval_id,
        source_epoch: SOURCE_EPOCH,
        confirmation_text: journeyPreview.confirmation_text,
      })
      .expect(409);
    expect(genericRejected.body.code).toBe("projection_epoch_mismatch");

    const imageRejected = await authenticatedMutation(
      request(app).post(IMAGE_WORKBENCH_V2_UPLOAD_PATH),
      "https://approved.example",
      "projection-drift-image-execute-0001",
    )
      .field(
        "metadata",
        JSON.stringify({
          project_id: "DonggriCompany",
          artifact_id: "artifact-projection-drift-001",
          candidate_id: CANDIDATE_ID,
          source_epoch: SOURCE_EPOCH,
          preview_id: imagePreview.preview_id,
          approval_id: imageApprovalResponse.body.data.approval_receipt.approval_id,
          confirmation_text: imagePreview.confirmation_text,
          export_target_ref: imagePreview.resolved_target,
          parent_sha256: [],
          expected_original_sha256: originalSha256,
          expected_width: 320,
          expected_height: 240,
        }),
      )
      .attach("image", bytes, { filename: "projection-drift.png", contentType: "image/png" })
      .expect(409);
    expect(imageRejected.body.code).toBe("projection_epoch_mismatch");

    expect(controlTower.snapshot("project:BloggerGent").event_count).toBe(0);
    expect(imageStore).not.toHaveBeenCalled();
    expect(db.prepare("SELECT COUNT(*) AS count FROM control_plane_idempotency_results").get()).toMatchObject({
      count: 0,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM control_plane_image_artifacts").get()).toMatchObject({ count: 0 });
  });

  it("requires authentication, CSRF, and an exact or loopback origin", async () => {
    const body = { operation: "not-registered", project_id: "DonggriCompany" };

    const unauthenticated = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.preview)
      .set("origin", "https://approved.example")
      .set("idempotency-key", "runtime-auth-missing-0001")
      .send(body)
      .expect(401);
    expect(unauthenticated.body.code).toBe("not_authenticated");

    const csrfMissing = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.preview)
      .set("authorization", `Bearer ${SESSION_AUTH_TOKEN}`)
      .set("origin", "https://approved.example")
      .set("idempotency-key", "runtime-csrf-missing-0001")
      .send(body)
      .expect(403);
    expect(csrfMissing.body.code).toBe("csrf_invalid");

    const suffixMatch = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.preview),
      "https://sub.approved.example",
    )
      .send(body)
      .expect(403);
    expect(suffixMatch.body.code).toBe("origin_not_allowed");

    const loopback = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.preview),
      "http://127.0.0.1:8790",
    )
      .send(body)
      .expect(404);
    expect(loopback.body.code).toBe("operation_not_registered");
  });

  it("rejects a stale source epoch before touching a mutation preview", async () => {
    const response = await authenticatedMutation(request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.execute))
      .send({
        preview_id: "preview-missing",
        approval_id: "approval-missing",
        source_epoch: `sha256:${"f".repeat(64)}`,
        confirmation_text: "manual confirmation",
      })
      .expect(409);

    expect(response.body).toMatchObject({
      code: "source_epoch_mismatch",
      source_epoch: SOURCE_EPOCH,
    });
  });

  it("registers the Image Workbench preview/upload pair and persists its approval transaction", async () => {
    const bytes = png(640, 480);
    const originalSha256 = createHash("sha256").update(bytes).digest("hex");
    const preview = await authenticatedMutation(
      request(app).post(IMAGE_WORKBENCH_V2_UPLOAD_PREVIEW_PATH),
      "https://approved.example",
      "image-preview-idempotency-0001",
    )
      .field(
        "metadata",
        JSON.stringify({
          project_id: "DonggriCompany",
          artifact_id: "artifact-runtime-001",
          parent_sha256: [],
        }),
      )
      .attach("image", bytes, { filename: "runtime.png", contentType: "image/png" })
      .expect(201);

    expect(preview.body).toMatchObject({
      source_epoch: SOURCE_EPOCH,
      data: {
        preview: {
          project_id: "DonggriCompany",
          operation: "image-workbench.upload",
          source_epoch: SOURCE_EPOCH,
          command: {
            executable_id: "image-workbench-v2-store",
            cwd_ref: "worktree:DonggriCompany-v01-main",
          },
        },
        upload_fingerprint: {
          original_sha256: originalSha256,
          candidate_id: CANDIDATE_ID,
        },
      },
    });
    expect(imageStore).not.toHaveBeenCalled();

    const mutationPreview = preview.body.data.preview;
    const approval = await authenticatedMutation(
      request(app).post(CONTROL_PLANE_V2_MUTATION_PATHS.approval),
      "https://approved.example",
      "image-approval-idempotency-0001",
    )
      .send({ preview_id: mutationPreview.preview_id })
      .expect(200);
    const receipt = approval.body.data.approval_receipt;

    const metadata = {
      project_id: "DonggriCompany",
      artifact_id: "artifact-runtime-001",
      candidate_id: CANDIDATE_ID,
      source_epoch: SOURCE_EPOCH,
      preview_id: mutationPreview.preview_id,
      approval_id: receipt.approval_id,
      confirmation_text: mutationPreview.confirmation_text,
      export_target_ref: mutationPreview.resolved_target,
      parent_sha256: [],
      expected_original_sha256: originalSha256,
      expected_width: 640,
      expected_height: 480,
    };
    const uploaded = await authenticatedMutation(
      request(app).post(IMAGE_WORKBENCH_V2_UPLOAD_PATH),
      "https://approved.example",
      "image-execute-idempotency-0001",
    )
      .field("metadata", JSON.stringify(metadata))
      .attach("image", bytes, { filename: "runtime.png", contentType: "image/png" })
      .expect(201);

    expect(uploaded.body).toMatchObject({
      source_epoch: SOURCE_EPOCH,
      data: {
        status: "executed",
        approval_id: receipt.approval_id,
        upload: {
          project_id: "DonggriCompany",
          artifact_id: "artifact-runtime-001",
          lineage: {
            candidate_id: CANDIDATE_ID,
            source_epoch: SOURCE_EPOCH,
            original_sha256: originalSha256,
          },
          storage: {
            storage_ref: "candidate-image:artifact-runtime-001",
          },
        },
      },
    });
    expect(imageStore).toHaveBeenCalledTimes(1);

    const replayed = await authenticatedMutation(
      request(app).post(IMAGE_WORKBENCH_V2_UPLOAD_PATH),
      "https://approved.example",
      "image-execute-idempotency-0001",
    )
      .field("metadata", JSON.stringify(metadata))
      .attach("image", bytes, { filename: "runtime.png", contentType: "image/png" })
      .expect(200);
    expect(replayed.body).toMatchObject({
      source_epoch: SOURCE_EPOCH,
      data: {
        status: "replayed",
        approval_id: receipt.approval_id,
      },
    });
    expect(imageStore).toHaveBeenCalledTimes(1);

    expect(
      (
        db.prepare("SELECT COUNT(*) AS count FROM control_plane_mutation_previews").get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS count FROM control_plane_approval_receipts").get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS count FROM control_plane_idempotency_results").get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS count FROM control_plane_mutation_audit").get() as {
          count: number;
        }
      ).count,
    ).toBeGreaterThanOrEqual(4);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS count FROM control_plane_image_artifacts").get() as {
          count: number;
        }
      ).count,
    ).toBe(1);

    const restartedApp = express();
    restartedApp.use(express.json());
    const restartedStore = vi.fn(async () => ({
      storage_ref: "candidate-image:must-not-run-after-restart",
      duplicate: true,
    }));
    registerControlPlaneV2RuntimeRoutes(
      { app: restartedApp, db },
      {
        source_adapter: { readSnapshot: sourceSnapshot },
        read_operations: readOperations(),
        allowed_origins: ["https://approved.example"],
        create_request_id: () => "runtime-restart-request-001",
        candidate_id: CANDIDATE_ID,
        image_store: restartedStore,
      },
    );

    const replayedAfterRestart = await authenticatedMutation(
      request(restartedApp).post(IMAGE_WORKBENCH_V2_UPLOAD_PATH),
      "https://approved.example",
      "image-execute-idempotency-0001",
    )
      .field("metadata", JSON.stringify(metadata))
      .attach("image", bytes, { filename: "runtime.png", contentType: "image/png" })
      .expect(200);
    expect(replayedAfterRestart.body.data.status).toBe("replayed");
    expect(restartedStore).not.toHaveBeenCalled();

    const visible = await request(restartedApp)
      .get(IMAGE_WORKBENCH_V2_ARTIFACTS_PATH.replace(":projectId", "DonggriCompany"))
      .query({ candidate_id: CANDIDATE_ID, source_epoch: SOURCE_EPOCH })
      .expect(200);
    expect(visible.body).toMatchObject({
      request_id: "runtime-restart-request-001",
      source_epoch: SOURCE_EPOCH,
      data: {
        candidate_id: CANDIDATE_ID,
        project_id: "DonggriCompany",
        artifacts: [
          {
            candidate_id: CANDIDATE_ID,
            source_epoch: SOURCE_EPOCH,
            project_id: "DonggriCompany",
            artifact_id: "artifact-runtime-001",
            original_sha256: originalSha256,
            derived_sha256: originalSha256,
            parent_sha256: [],
            approval_id: receipt.approval_id,
            receipt_sha256: receipt.receipt_sha256,
            export_target_ref: mutationPreview.resolved_target,
            storage_ref: "candidate-image:artifact-runtime-001",
            filename: "runtime.png",
            mime_type: "image/png",
            byte_length: bytes.byteLength,
            width: 640,
            height: 480,
            pixel_count: 640 * 480,
          },
        ],
      },
    });

    const isolatedProject = await request(restartedApp)
      .get(IMAGE_WORKBENCH_V2_ARTIFACTS_PATH.replace(":projectId", "BloggerGent"))
      .expect(200);
    expect(isolatedProject.body.data).toMatchObject({
      candidate_id: CANDIDATE_ID,
      project_id: "BloggerGent",
      artifacts: [],
    });

    const staleCandidate = await request(restartedApp)
      .get(IMAGE_WORKBENCH_V2_ARTIFACTS_PATH.replace(":projectId", "DonggriCompany"))
      .query({ candidate_id: "different-candidate" })
      .expect(409);
    expect(staleCandidate.body).toMatchObject({
      code: "candidate_id_mismatch",
      source_epoch: SOURCE_EPOCH,
    });

    const staleEpoch = await request(restartedApp)
      .get(IMAGE_WORKBENCH_V2_ARTIFACTS_PATH.replace(":projectId", "DonggriCompany"))
      .query({ source_epoch: `sha256:${"f".repeat(64)}` })
      .expect(409);
    expect(staleEpoch.body).toMatchObject({
      code: "source_epoch_mismatch",
      source_epoch: SOURCE_EPOCH,
    });
  });

  it("preserves immutable storage recovery evidence when the artifact ledger insert fails", async () => {
    db.exec(`
      CREATE TRIGGER fail_control_plane_image_artifact_insert
      BEFORE INSERT ON control_plane_image_artifacts
      BEGIN
        SELECT RAISE(ABORT, 'forced_image_artifact_ledger_failure');
      END;
    `);
    const failureApp = express();
    failureApp.use(express.json());
    const immutableWrite = vi.fn(async ({ upload }) => ({
      storage_ref: `candidate-image:${upload.metadata.artifact_id}`,
      size_bytes: upload.byte_length,
      duplicate: false,
    }));
    const recoveryWrite = vi.fn(async () => undefined);
    registerControlPlaneV2RuntimeRoutes(
      { app: failureApp, db },
      {
        source_adapter: { readSnapshot: sourceSnapshot },
        read_operations: readOperations(),
        allowed_origins: ["https://approved.example"],
        create_request_id: () => "runtime-ledger-failure-001",
        candidate_id: CANDIDATE_ID,
        image_store: immutableWrite,
        write_recovery_manifest: recoveryWrite,
      },
    );

    const bytes = png(320, 240);
    const originalSha256 = createHash("sha256").update(bytes).digest("hex");
    const preview = await authenticatedMutation(
      request(failureApp).post(IMAGE_WORKBENCH_V2_UPLOAD_PREVIEW_PATH),
      "https://approved.example",
      "image-failure-preview-0001",
    )
      .field(
        "metadata",
        JSON.stringify({
          project_id: "DonggriCompany",
          artifact_id: "artifact-ledger-failure-001",
          parent_sha256: [],
        }),
      )
      .attach("image", bytes, { filename: "failure.png", contentType: "image/png" })
      .expect(201);
    const mutationPreview = preview.body.data.preview;
    const approval = await authenticatedMutation(
      request(failureApp).post(CONTROL_PLANE_V2_MUTATION_PATHS.approval),
      "https://approved.example",
      "image-failure-approval-0001",
    )
      .send({ preview_id: mutationPreview.preview_id })
      .expect(200);
    const receipt = approval.body.data.approval_receipt;

    const failed = await authenticatedMutation(
      request(failureApp).post(IMAGE_WORKBENCH_V2_UPLOAD_PATH),
      "https://approved.example",
      "image-failure-execute-0001",
    )
      .field(
        "metadata",
        JSON.stringify({
          project_id: "DonggriCompany",
          artifact_id: "artifact-ledger-failure-001",
          candidate_id: CANDIDATE_ID,
          source_epoch: SOURCE_EPOCH,
          preview_id: mutationPreview.preview_id,
          approval_id: receipt.approval_id,
          confirmation_text: mutationPreview.confirmation_text,
          export_target_ref: mutationPreview.resolved_target,
          parent_sha256: [],
          expected_original_sha256: originalSha256,
          expected_width: 320,
          expected_height: 240,
        }),
      )
      .attach("image", bytes, { filename: "failure.png", contentType: "image/png" })
      .expect(503);

    expect(failed.body).toMatchObject({
      code: "execution_reconciliation_required",
      source_epoch: SOURCE_EPOCH,
    });
    expect(failed.headers["retry-after"]).toBe("1");
    expect(immutableWrite).toHaveBeenCalledTimes(1);
    expect(recoveryWrite).toHaveBeenCalledTimes(1);
    expect(recoveryWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        schema_version: "1.0.0",
        failure_class: "image_artifact_ledger_insert_failed",
        artifact: expect.objectContaining({
          candidate_id: CANDIDATE_ID,
          source_epoch: SOURCE_EPOCH,
          project_id: "DonggriCompany",
          artifact_id: "artifact-ledger-failure-001",
          original_sha256: originalSha256,
          derived_sha256: originalSha256,
          approval_id: receipt.approval_id,
          receipt_sha256: receipt.receipt_sha256,
          storage_ref: "candidate-image:artifact-ledger-failure-001",
        }),
      }),
    );
    expect(
      (
        db.prepare("SELECT COUNT(*) AS count FROM control_plane_image_artifacts").get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
  });
});
