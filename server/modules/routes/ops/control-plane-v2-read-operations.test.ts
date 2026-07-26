import express, { type Request } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTROL_PLANE_V2_READ_OPERATION_IDS,
  CONTROL_PLANE_V2_READ_OPERATION_PATHS,
  registerControlPlaneV2ReadOperationRoutes,
  type ControlPlaneV2ReadOperations,
} from "./control-plane-v2-read-operations.ts";
import type { ControlPlaneV2SecurityContext } from "./control-plane-v2.ts";

const SOURCE_EPOCH = `sha256:${"a".repeat(64)}`;
const PROJECTION_EPOCH = `sha256:${"b".repeat(64)}`;
const ALLOWED_ORIGIN = "https://approved.example.test";

function securityFromRequest(req: Request): ControlPlaneV2SecurityContext {
  return {
    authenticated: req.header("x-test-auth") === "valid",
    csrf_valid: req.header("x-csrf-token") === "valid",
    requester: req.header("x-test-requester") ?? null,
    approver: null,
  };
}

function readHeaders() {
  return {
    origin: ALLOWED_ORIGIN,
    "x-test-auth": "valid",
    "x-csrf-token": "valid",
    "x-test-requester": "reader",
  };
}

function operationSpies(): ControlPlaneV2ReadOperations {
  return {
    memory_search: vi.fn(async (input) => ({
      ok: true,
      available: true,
      query: input.query,
      scope: input.scope,
      results: [],
      error: null,
    })),
    memory_context: vi.fn(async (input) => ({
      ok: true,
      available: true,
      query: input.query,
      scope: input.scope ?? "root",
      context: {},
      error: null,
    })),
    control_plane_sync_preview: vi.fn(() => ({
      ok: true,
      mode: "preview",
      writes: false,
      snapshot: { id: "snapshot-001" },
    })),
    engine_route_preview: vi.fn((input) => ({
      ok: true,
      status: 200,
      writes: false,
      route: { provider: input.provider ?? "codex_exec" },
    })),
    harness_blueprint_preview: vi.fn((input) => ({
      ok: true,
      status: 200,
      writes: false,
      blueprint: { target_mode: input.target_mode },
    })),
  };
}

describe("Control Plane v2 read-operation routes", () => {
  let app: express.Express;
  let operations: ControlPlaneV2ReadOperations;
  let writeEffects: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    operations = operationSpies();
    writeEffects = vi.fn();
    registerControlPlaneV2ReadOperationRoutes(app, {
      operations,
      get_epoch_authority: () => ({
        source_epoch: SOURCE_EPOCH,
        projection_epoch: PROJECTION_EPOCH,
      }),
      resolve_security: securityFromRequest,
      allowed_origins: [ALLOWED_ORIGIN],
      create_request_id: () => "generated-read-request-id",
      now: () => new Date("2026-07-25T01:02:03.000Z"),
    });
  });

  it.each([
    [
      "memory.search",
      CONTROL_PLANE_V2_READ_OPERATION_PATHS.memorySearch,
      { query: "active spec", scope: "project:DonggriCompany" },
      CONTROL_PLANE_V2_READ_OPERATION_IDS.memorySearch,
      "memory_search",
    ],
    [
      "memory.context",
      CONTROL_PLANE_V2_READ_OPERATION_PATHS.memoryContext,
      { query: "handoff", scope: "root", project_key: "DonggriCompany" },
      CONTROL_PLANE_V2_READ_OPERATION_IDS.memoryContext,
      "memory_context",
    ],
    [
      "control-plane.sync.preview",
      CONTROL_PLANE_V2_READ_OPERATION_PATHS.controlPlaneSyncPreview,
      {},
      CONTROL_PLANE_V2_READ_OPERATION_IDS.controlPlaneSyncPreview,
      "control_plane_sync_preview",
    ],
    [
      "engine.route.preview",
      CONTROL_PLANE_V2_READ_OPERATION_PATHS.engineRoutePreview,
      {
        objective: "Review the current contract",
        provider: "codex_exec",
        scope_type: "project",
        scope_value: "DonggriCompany",
      },
      CONTROL_PLANE_V2_READ_OPERATION_IDS.engineRoutePreview,
      "engine_route_preview",
    ],
    [
      "harness.blueprint.preview",
      CONTROL_PLANE_V2_READ_OPERATION_PATHS.harnessBlueprintPreview,
      {
        target_mode: "project",
        project_key: "DonggriCompany",
        objective: "Build a review blueprint",
        preferred_pattern: "producer-reviewer",
      },
      CONTROL_PLANE_V2_READ_OPERATION_IDS.harnessBlueprintPreview,
      "harness_blueprint_preview",
    ],
  ] as const)(
    "returns an authenticated read envelope for %s without approval, idempotency, or write effects",
    async (_label, path, body, operationId, spyName) => {
      const response = await request(app)
        .post(path)
        .set(readHeaders())
        .set("x-request-id", "read-request-001")
        .send(body)
        .expect(200);

      expect(response.body).toMatchObject({
        request_id: "read-request-001",
        source_epoch: SOURCE_EPOCH,
        data: {
          operation: operationId,
          generated_at: "2026-07-25T01:02:03.000Z",
          source_epoch: SOURCE_EPOCH,
          projection_epoch: PROJECTION_EPOCH,
          writes: false,
        },
      });
      expect(response.body.data).not.toHaveProperty("approval_receipt");
      expect(response.body.data).not.toHaveProperty("preview_id");
      expect(response.body.data).not.toHaveProperty("receipt_sha256");
      expect(operations[spyName]).toHaveBeenCalledTimes(1);
      expect(writeEffects).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing authentication", {}, 401, "not_authenticated"],
    [
      "missing CSRF",
      { origin: ALLOWED_ORIGIN, "x-test-auth": "valid", "x-test-requester": "reader" },
      403,
      "csrf_invalid",
    ],
    [
      "remote origin",
      {
        origin: "https://remote.example.test",
        "x-test-auth": "valid",
        "x-csrf-token": "valid",
        "x-test-requester": "reader",
      },
      403,
      "origin_not_allowed",
    ],
  ])("rejects %s before invoking a read delegate", async (_label, headers, status, code) => {
    const response = await request(app)
      .post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.memorySearch)
      .set(headers)
      .send({ query: "active spec" })
      .expect(status);

    expect(response.type).toBe("application/problem+json");
    expect(response.body).toMatchObject({
      status,
      code,
      source_epoch: SOURCE_EPOCH,
    });
    expect(operations.memory_search).not.toHaveBeenCalled();
  });

  it("rejects undocumented or client-owned mutation fields before invoking a delegate", async () => {
    const response = await request(app)
      .post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.engineRoutePreview)
      .set(readHeaders())
      .send({
        objective: "Review the current contract",
        command: "pnpm run build && calc.exe",
        approval_id: "forged",
      })
      .expect(400);

    expect(response.body).toMatchObject({
      status: 400,
      code: "invalid_request_body",
      source_epoch: SOURCE_EPOCH,
    });
    expect(operations.engine_route_preview).not.toHaveBeenCalled();
  });

  it("converts an existing preview-computation rejection into a typed Problem", async () => {
    vi.mocked(operations.engine_route_preview).mockReturnValue({
      ok: false,
      status: 400,
      error: "invalid_project_key",
    });

    const response = await request(app)
      .post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.engineRoutePreview)
      .set(readHeaders())
      .send({ objective: "Review", scope_type: "project", scope_value: "missing" })
      .expect(400);

    expect(response.body).toMatchObject({
      status: 400,
      code: "invalid_project_key",
      source_epoch: SOURCE_EPOCH,
    });
  });

  it("keeps AgentMemory unavailability as a successful read result and never calls capture endpoints", async () => {
    vi.mocked(operations.memory_search).mockResolvedValue({
      ok: false,
      available: false,
      results: [],
      status_code: 503,
      error: "agentmemory_unavailable",
    });

    const response = await request(app)
      .post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.memorySearch)
      .set(readHeaders())
      .send({ query: "active spec" })
      .expect(200);

    expect(response.body.data).toMatchObject({
      operation: "memory.search",
      writes: false,
      result: {
        ok: false,
        available: false,
        error: "agentmemory_unavailable",
      },
    });
    expect(operations.memory_search).toHaveBeenCalledWith({ query: "active spec", scope: "root" });
    expect(writeEffects).not.toHaveBeenCalled();
  });

  it.each([{ writes: true }, { writes: "unknown" }, { external_effects: true }, { mutated: true }])(
    "fails closed when a delegate violates the no-write result contract: %j",
    async (unsafeResult) => {
      vi.mocked(operations.control_plane_sync_preview).mockReturnValue({
        ok: true,
        ...unsafeResult,
      });

      const response = await request(app)
        .post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.controlPlaneSyncPreview)
        .set(readHeaders())
        .send({})
        .expect(500);

      expect(response.body).toMatchObject({
        status: 500,
        code: "read_operation_contract_violation",
        source_epoch: SOURCE_EPOCH,
      });
      expect(writeEffects).not.toHaveBeenCalled();
    },
  );

  it("fails closed when either epoch authority is missing", async () => {
    const isolated = express();
    isolated.use(express.json());
    registerControlPlaneV2ReadOperationRoutes(isolated, {
      operations,
      get_epoch_authority: () => ({ source_epoch: SOURCE_EPOCH, projection_epoch: "" }),
      resolve_security: securityFromRequest,
      allowed_origins: [ALLOWED_ORIGIN],
      create_request_id: () => "epoch-failure-request",
    });

    const response = await request(isolated)
      .post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.memorySearch)
      .set(readHeaders())
      .send({ query: "active spec" })
      .expect(503);

    expect(response.body).toMatchObject({
      status: 503,
      code: "epoch_authority_unavailable",
      source_epoch: "unavailable",
    });
    expect(operations.memory_search).not.toHaveBeenCalled();
  });
});
