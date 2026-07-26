import express, { type Request } from "express";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyControlPlaneMutationSchema } from "../../bootstrap/schema/control-plane-mutation-schema.ts";
import { MutationAuthorizer } from "../../control-plane/mutation-authorizer.ts";
import { SqliteMutationAuthorizerPersistence } from "../../control-plane/mutation-authorizer-sqlite.ts";
import {
  CONTROL_PLANE_V2_MUTATION_PATHS,
  createLegacyControlPlaneV1MutationGuard,
  createLegacyMutationGoneHandler,
  registerControlPlaneV2MutationRoutes,
  type ControlPlaneV2Operation,
  type ControlPlaneV2SecurityContext,
} from "./control-plane-v2.ts";

const SOURCE_EPOCH = "sha256:v2-source-epoch";
const PROJECTION_EPOCH = "sha256:v2-projection-epoch";
const NEXT_PROJECTION_EPOCH = "sha256:v2-projection-epoch-next";
const ALLOWED_ORIGIN = "https://approved.example.test";

function securityFromRequest(req: Request): ControlPlaneV2SecurityContext {
  return {
    authenticated: req.header("x-test-auth") === "valid",
    csrf_valid: req.header("x-csrf-token") === "valid",
    requester: req.header("x-test-requester") ?? null,
    approver: req.header("x-test-approver") ?? null,
  };
}

function mutationHeaders(idempotencyKey: string) {
  return {
    origin: ALLOWED_ORIGIN,
    "x-test-auth": "valid",
    "x-csrf-token": "valid",
    "x-test-requester": "requester",
    "x-test-approver": "approver",
    "idempotency-key": idempotencyKey,
  };
}

describe("Control Plane v2 mutation routes", () => {
  let db: DatabaseSync;
  let executeOperation: ReturnType<typeof vi.fn>;
  let app: express.Express;
  let projectionEpoch: string;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    projectionEpoch = PROJECTION_EPOCH;
    db.exec("PRAGMA foreign_keys = ON");
    applyControlPlaneMutationSchema(db);
    const persistence = new SqliteMutationAuthorizerPersistence(db);
    const authorizer = new MutationAuthorizer({
      persistence,
      allowed_origins: [ALLOWED_ORIGIN],
      allowed_executable_ids: ["pnpm"],
      allowed_cwd_refs: ["worktree:donggri-v1"],
    });
    executeOperation = vi.fn(async ({ preview }) => ({
      executed_operation: preview.operation,
    }));
    const operation: ControlPlaneV2Operation = {
      async prepare({ project_id }) {
        return {
          spec_id: "spec-v1",
          resolved_target: `project:${project_id}`,
          scope: { project_id },
          command: {
            executable_id: "pnpm",
            args: ["run", "test:api"],
            cwd_ref: "worktree:donggri-v1",
          },
        };
      },
      execute: executeOperation,
    };

    app = express();
    app.use(express.json());
    registerControlPlaneV2MutationRoutes(app, {
      authorizer,
      persistence,
      operations: { verify: operation },
      get_source_epoch: () => SOURCE_EPOCH,
      get_projection_epoch: () => projectionEpoch,
      resolve_security: securityFromRequest,
      allowed_origins: [ALLOWED_ORIGIN],
      create_request_id: () => "generated-request-id",
    });
  });

  afterEach(() => {
    db.close();
  });

  async function createPreviewAndApproval() {
    const previewResponse = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.preview)
      .set(mutationHeaders("preview-key-0001"))
      .set("x-request-id", "request-preview-001")
      .send({ operation: "verify", project_id: "DonggriCompany" })
      .expect(200);
    const preview = previewResponse.body.data.preview;
    const approvalResponse = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.approval)
      .set(mutationHeaders("approval-key-0001"))
      .send({ preview_id: preview.preview_id })
      .expect(200);
    return {
      preview,
      receipt: approvalResponse.body.data.approval_receipt,
      previewResponse,
      approvalResponse,
    };
  }

  it("returns envelopes and executes only a registered operation with request identity propagation", async () => {
    const { preview, receipt, previewResponse, approvalResponse } = await createPreviewAndApproval();

    expect(previewResponse.body).toMatchObject({
      request_id: "request-preview-001",
      source_epoch: SOURCE_EPOCH,
      data: {
        preview: {
          operation: "verify",
          project_id: "DonggriCompany",
          resolved_target: "project:DonggriCompany",
          source_epoch: SOURCE_EPOCH,
          projection_epoch: PROJECTION_EPOCH,
        },
      },
    });
    expect(previewResponse.headers["x-request-id"]).toBe("request-preview-001");
    expect(approvalResponse.body).toMatchObject({
      request_id: "generated-request-id",
      source_epoch: SOURCE_EPOCH,
      data: {
        approval_receipt: {
          approval_id: receipt.approval_id,
          preview_id: preview.preview_id,
          approver: "approver",
          projection_epoch: PROJECTION_EPOCH,
        },
      },
    });

    const executeBody = {
      preview_id: preview.preview_id,
      approval_id: receipt.approval_id,
      source_epoch: SOURCE_EPOCH,
      confirmation_text: preview.confirmation_text,
    };
    const first = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.execute)
      .set(mutationHeaders("execute-key-0001"))
      .set("x-request-id", "request-execute-001")
      .send(executeBody)
      .expect(200);
    const replay = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.execute)
      .set(mutationHeaders("execute-key-0001"))
      .send(executeBody)
      .expect(200);

    expect(first.body).toMatchObject({
      request_id: "request-execute-001",
      source_epoch: SOURCE_EPOCH,
      data: {
        status: "executed",
        result: { executed_operation: "verify" },
        approval_id: receipt.approval_id,
      },
    });
    expect(replay.body.data.status).toBe("replayed");
    expect(executeOperation).toHaveBeenCalledTimes(1);
  });

  it("rejects projection drift before execution without accepting a client projection field", async () => {
    const { preview, receipt } = await createPreviewAndApproval();
    projectionEpoch = NEXT_PROJECTION_EPOCH;

    const response = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.execute)
      .set(mutationHeaders("execute-projection-drift-0001"))
      .send({
        preview_id: preview.preview_id,
        approval_id: receipt.approval_id,
        source_epoch: SOURCE_EPOCH,
        confirmation_text: preview.confirmation_text,
      })
      .expect(409);

    expect(response.body).toMatchObject({
      status: 409,
      code: "projection_epoch_mismatch",
      source_epoch: SOURCE_EPOCH,
    });
    expect(executeOperation).not.toHaveBeenCalled();
    expect(db.prepare("SELECT COUNT(*) AS count FROM control_plane_idempotency_results").get()).toMatchObject({
      count: 0,
    });
  });

  it.each([
    ["receipt", { receipt: { forged: true } }],
    ["command", { command: "pnpm run build && calc.exe" }],
    ["resolved target", { resolved_target: "G:\\forged" }],
    ["scope", { scope: { all: true } }],
    ["projection epoch", { projection_epoch: NEXT_PROJECTION_EPOCH }],
  ])("rejects a client-supplied %s field and never invokes the operation", async (_label, extra) => {
    const { preview, receipt } = await createPreviewAndApproval();
    const response = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.execute)
      .set(mutationHeaders(`execute-extra-${Object.keys(extra)[0]}-0001`))
      .send({
        preview_id: preview.preview_id,
        approval_id: receipt.approval_id,
        source_epoch: SOURCE_EPOCH,
        confirmation_text: preview.confirmation_text,
        ...extra,
      })
      .expect(400);

    expect(response.type).toBe("application/problem+json");
    expect(response.body).toMatchObject({
      status: 400,
      code: "invalid_request_body",
      request_id: "generated-request-id",
      source_epoch: SOURCE_EPOCH,
    });
    expect(executeOperation).not.toHaveBeenCalled();
  });

  it("rejects client-owned command fields during preview and approver fields during approval", async () => {
    const previewAttempt = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.preview)
      .set(mutationHeaders("preview-extra-0001"))
      .send({
        operation: "verify",
        project_id: "DonggriCompany",
        command: { executable_id: "pnpm", args: [], cwd_ref: "worktree:donggri-v1" },
      })
      .expect(400);
    expect(previewAttempt.body.code).toBe("invalid_request_body");

    const { preview } = await createPreviewAndApproval();
    const approvalAttempt = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.approval)
      .set(mutationHeaders("approval-extra-0002"))
      .send({ preview_id: preview.preview_id, approver: "client-forged" })
      .expect(400);
    expect(approvalAttempt.body.code).toBe("invalid_request_body");
  });

  it.each([
    [
      "not_authenticated",
      401,
      {
        origin: ALLOWED_ORIGIN,
        "x-csrf-token": "valid",
        "x-test-requester": "requester",
      },
    ],
    [
      "csrf_invalid",
      403,
      {
        origin: ALLOWED_ORIGIN,
        "x-test-auth": "valid",
        "x-test-requester": "requester",
      },
    ],
    [
      "origin_not_allowed",
      403,
      {
        origin: "https://sub.approved.example.test",
        "x-test-auth": "valid",
        "x-csrf-token": "valid",
        "x-test-requester": "requester",
      },
    ],
  ])("fails closed for %s before operation execution", async (code, status, headers) => {
    const { preview, receipt } = await createPreviewAndApproval();
    const response = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.execute)
      .set({ ...headers, "idempotency-key": `guard-${code}-0001` })
      .send({
        preview_id: preview.preview_id,
        approval_id: receipt.approval_id,
        source_epoch: SOURCE_EPOCH,
        confirmation_text: preview.confirmation_text,
      })
      .expect(status);

    expect(response.body.code).toBe(code);
    expect(executeOperation).not.toHaveBeenCalled();
  });

  it("requires Idempotency-Key and binds execution to the current source epoch", async () => {
    const { preview, receipt } = await createPreviewAndApproval();
    const body = {
      preview_id: preview.preview_id,
      approval_id: receipt.approval_id,
      source_epoch: SOURCE_EPOCH,
      confirmation_text: preview.confirmation_text,
    };
    const missingKey = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.execute)
      .set({
        origin: ALLOWED_ORIGIN,
        "x-test-auth": "valid",
        "x-csrf-token": "valid",
        "x-test-requester": "requester",
      })
      .send(body)
      .expect(428);
    expect(missingKey.body.code).toBe("idempotency_key_required");

    const stale = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.execute)
      .set(mutationHeaders("stale-epoch-key-0001"))
      .send({ ...body, source_epoch: "sha256:stale" })
      .expect(409);
    expect(stale.body.code).toBe("source_epoch_mismatch");
    expect(executeOperation).not.toHaveBeenCalled();
  });

  it("maps authorizer rejection to Problem Details without invoking the operation", async () => {
    const { preview, receipt } = await createPreviewAndApproval();
    const response = await request(app)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.execute)
      .set(mutationHeaders("confirmation-mismatch-0001"))
      .send({
        preview_id: preview.preview_id,
        approval_id: receipt.approval_id,
        source_epoch: SOURCE_EPOCH,
        confirmation_text: "자동으로 작성한 확인문",
      })
      .expect(422);

    expect(response.type).toBe("application/problem+json");
    expect(response.body).toMatchObject({
      status: 422,
      code: "confirmation_mismatch",
      source_epoch: SOURCE_EPOCH,
    });
    expect(executeOperation).not.toHaveBeenCalled();
  });

  it("rejects an operation registry that tries to return raw shell input", async () => {
    const persistence = new SqliteMutationAuthorizerPersistence(db);
    const unsafeApp = express();
    unsafeApp.use(express.json());
    registerControlPlaneV2MutationRoutes(unsafeApp, {
      authorizer: new MutationAuthorizer({
        persistence,
        allowed_origins: [ALLOWED_ORIGIN],
        allowed_executable_ids: ["pnpm"],
        allowed_cwd_refs: ["worktree:donggri-v1"],
      }),
      persistence,
      operations: {
        unsafe: {
          async prepare() {
            return {
              spec_id: "spec-v1",
              resolved_target: "candidate",
              scope: {},
              command: "pnpm run build && calc.exe",
            } as never;
          },
          execute: executeOperation,
        },
      },
      get_source_epoch: () => SOURCE_EPOCH,
      get_projection_epoch: () => projectionEpoch,
      resolve_security: securityFromRequest,
      allowed_origins: [ALLOWED_ORIGIN],
    });

    const response = await request(unsafeApp)
      .post(CONTROL_PLANE_V2_MUTATION_PATHS.preview)
      .set(mutationHeaders("unsafe-preview-key-0001"))
      .send({ operation: "unsafe", project_id: "DonggriCompany" })
      .expect(500);

    expect(response.body.code).toBe("operation_contract_invalid");
    expect(executeOperation).not.toHaveBeenCalled();
  });
});

describe("legacy mutation gone helper", () => {
  it("returns a v2 Problem response without wiring or invoking a legacy mutation", async () => {
    const app = express();
    app.post(
      "/api/control-plane/v1/legacy-mutation",
      createLegacyMutationGoneHandler({
        get_source_epoch: () => SOURCE_EPOCH,
        create_request_id: () => "legacy-request-001",
      }),
    );

    const response = await request(app).post("/api/control-plane/v1/legacy-mutation").expect(410);

    expect(response.type).toBe("application/problem+json");
    expect(response.body).toMatchObject({
      status: 410,
      code: "legacy_mutation_gone",
      request_id: "legacy-request-001",
      source_epoch: SOURCE_EPOCH,
    });
  });
});

describe("legacy Control Plane v1 mutation guard", () => {
  const proof = "legacy-proof-0123456789-abcdefghijklmnop";

  function createGuardedApp(options: {
    compatibility_enabled?: boolean;
    compatibility_proof?: string;
    test_mode?: boolean;
  }) {
    const guardedApp = express();
    guardedApp.use(
      "/api/control-plane/v1",
      createLegacyControlPlaneV1MutationGuard({
        get_source_epoch: () => SOURCE_EPOCH,
        allowed_origins: [ALLOWED_ORIGIN],
        create_request_id: () => "legacy-guard-request-001",
        ...options,
      }),
    );
    guardedApp.get("/api/control-plane/v1/state", (_req, res) => res.json({ ok: true }));
    guardedApp.post("/api/control-plane/v1/mutation", (_req, res) => res.json({ ok: true }));
    return guardedApp;
  }

  it("preserves v1 reads but blocks mutations by default with 410", async () => {
    const guardedApp = createGuardedApp({});
    await request(guardedApp).get("/api/control-plane/v1/state").expect(200, { ok: true });
    const blocked = await request(guardedApp)
      .post("/api/control-plane/v1/mutation")
      .set("origin", "http://127.0.0.1:8800")
      .expect(410);
    expect(blocked.body).toMatchObject({
      code: "legacy_mutation_gone",
      request_id: "legacy-guard-request-001",
      source_epoch: SOURCE_EPOCH,
    });
  });

  it("allows only an explicit compatibility flag, exact origin, and constant-time proof", async () => {
    const guardedApp = createGuardedApp({
      compatibility_enabled: true,
      compatibility_proof: proof,
    });
    await request(guardedApp)
      .post("/api/control-plane/v1/mutation")
      .set("origin", ALLOWED_ORIGIN)
      .set("x-control-plane-v1-legacy-proof", proof)
      .expect(200, { ok: true });
    await request(guardedApp)
      .post("/api/control-plane/v1/mutation")
      .set("origin", "https://sub.approved.example.test")
      .set("x-control-plane-v1-legacy-proof", proof)
      .expect(410);
    await request(guardedApp)
      .post("/api/control-plane/v1/mutation")
      .set("origin", ALLOWED_ORIGIN)
      .set("x-control-plane-v1-legacy-proof", `${proof}-forged`)
      .expect(410);
  });

  it("permits the isolated test harness without creating a production bypass", async () => {
    const guardedApp = createGuardedApp({ test_mode: true });
    await request(guardedApp).post("/api/control-plane/v1/mutation").expect(200, { ok: true });
  });
});
