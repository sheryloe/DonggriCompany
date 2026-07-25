import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  Master95DurableImageWorkbench,
  Master95MemoryImageAssetStore,
  Master95MemoryImageJournal,
} from "../../master95/durable-image-workbench.js";
import {
  MASTER95_IMAGE_CONFIRMATION,
  MASTER95_IMAGE_DURABLE_APPROVAL_ID,
  registerMaster95ImageWorkbenchRoutes,
} from "./image-workbench.js";

type RouteHandler = (req: any, res: any) => unknown;

function createFakeApp() {
  const routes = new Map<string, RouteHandler>();
  const app = {
    get(route: string, handler: RouteHandler) {
      routes.set(`GET ${route}`, handler);
      return this;
    },
    post(route: string, handler: RouteHandler) {
      routes.set(`POST ${route}`, handler);
      return this;
    },
  };
  return { app, routes };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: new Map<string, string>(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
    send(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

function setup() {
  const { app, routes } = createFakeApp();
  const workbench = new Master95DurableImageWorkbench(new Master95MemoryImageJournal());
  const assets = new Master95MemoryImageAssetStore();
  registerMaster95ImageWorkbenchRoutes(app as any, {
    workbench,
    assets,
    now: () => "2026-07-15T00:00:00.000Z",
  });
  return { routes, workbench, assets };
}

const bytes = Buffer.from("local-image-content");
const hash = crypto.createHash("sha256").update(bytes).digest("hex");

function artifact() {
  return {
    artifact_id: "artifact:image:api:1",
    project_id: "project:DonggriCompany",
    task_id: "task:image:api",
    run_id: "run:image:api",
    trace_id: "trace:image:api:1",
    created_by_agent_id: "design-worker:1",
    skill_id: "image.local-workbench",
    skill_version: "1.0.0",
    model: "browser-canvas",
    prompt_version: "local-preview-v1",
    operation: "generate",
    version: 1,
    parent_artifact_id: null,
    source_artifact_ids: [],
    source_uri: "browser://local-preview.png",
    output_uri: "pending://local-preview.png",
    sha256: hash,
    mime_type: "image/png",
    width: 1200,
    height: 630,
    rights_source: "user-supplied-local",
    created_at: "2026-07-15T00:00:00.000Z",
    modified_at: "2026-07-15T00:00:00.000Z",
    processing_status: "complete",
    failure_reason: null,
    analysis_summary: null,
    approval_status: "draft",
    exported_at: null,
  };
}

function guard(idempotencyKey: string) {
  return {
    approval_id: MASTER95_IMAGE_DURABLE_APPROVAL_ID,
    confirm: MASTER95_IMAGE_CONFIRMATION,
    idempotency_key: idempotencyKey,
  };
}

describe("Master95 image Workbench API", () => {
  it("denies a mutation without the exact approval guard", () => {
    const { routes } = setup();
    const response = createResponse();
    routes.get("POST /api/control-plane/v1/master-95/image-workbench/artifacts/register")?.(
      { body: { artifact: artifact(), asset_base64: bytes.toString("base64") } },
      response,
    );
    expect(response.statusCode).toBe(403);
    expect(response.body).toMatchObject({ ok: false, error: "master95_image_workbench_request_failed" });
  });

  it("registers verified content and exposes project-scoped metadata and bytes", () => {
    const { routes } = setup();
    const registerResponse = createResponse();
    routes.get("POST /api/control-plane/v1/master-95/image-workbench/artifacts/register")?.(
      {
        body: {
          ...guard("register:api:1"),
          artifact: artifact(),
          asset_base64: bytes.toString("base64"),
        },
      },
      registerResponse,
    );
    expect(registerResponse.statusCode).toBe(201);
    expect(registerResponse.body).toMatchObject({
      ok: true,
      duplicate: false,
      artifact: { output_uri: `DonggriCompany/${hash}.png` },
      asset: { size_bytes: bytes.length },
    });

    const listResponse = createResponse();
    routes.get("GET /api/control-plane/v1/master-95/image-workbench/projects/:projectId/artifacts")?.(
      { params: { projectId: "project:DonggriCompany" } },
      listResponse,
    );
    expect(listResponse.body).toMatchObject({ ok: true, event_count: 1 });
    expect(listResponse.body.artifacts).toHaveLength(1);

    const contentResponse = createResponse();
    routes.get(
      "GET /api/control-plane/v1/master-95/image-workbench/projects/:projectId/artifacts/:artifactId/content",
    )?.({ params: { projectId: "project:DonggriCompany", artifactId: "artifact:image:api:1" } }, contentResponse);
    expect(contentResponse.statusCode).toBe(200);
    expect(contentResponse.body).toEqual(bytes);
  });

  it("records approval, Handoff intent, and export without dispatch or publish", () => {
    const { routes } = setup();
    const call = (route: string, body: Record<string, unknown>) => {
      const response = createResponse();
      routes.get(`POST ${route}`)?.({ body }, response);
      expect(response.statusCode).toBeLessThan(300);
      return response.body;
    };
    call("/api/control-plane/v1/master-95/image-workbench/artifacts/register", {
      ...guard("register:flow"),
      artifact: artifact(),
      asset_base64: bytes.toString("base64"),
    });
    call("/api/control-plane/v1/master-95/image-workbench/artifacts/submit", {
      ...guard("submit:flow"),
      project_id: "project:DonggriCompany",
      artifact_id: "artifact:image:api:1",
    });
    call("/api/control-plane/v1/master-95/image-workbench/artifacts/decision", {
      ...guard("approve:flow"),
      project_id: "project:DonggriCompany",
      artifact_id: "artifact:image:api:1",
      actor: "CONTROL",
      decision: "approved",
    });
    const handoff = call("/api/control-plane/v1/master-95/image-workbench/artifacts/handoff", {
      ...guard("handoff:flow"),
      handoff: {
        handoff_id: "handoff:image:api:1",
        artifact_id: "artifact:image:api:1",
        project_id: "project:DonggriCompany",
        task_id: "task:image:api",
        run_id: "run:image:api",
        trace_id: "trace:image:handoff:api:1",
        from_agent_id: "design-worker:1",
        to_agent_id: "IMPLEMENT",
        occurred_at: "2026-07-15T00:03:00.000Z",
      },
    });
    expect(handoff).toMatchObject({
      ok: true,
      dispatched: true,
      accepted: true,
      delivery_mode: "local-durable-inbox",
      external_effect: false,
      receipt: { receiver_agent_id: "IMPLEMENT", receiver_agent_version: "1.0.0" },
    });
    const exported = call("/api/control-plane/v1/master-95/image-workbench/artifacts/export", {
      ...guard("export:flow"),
      project_id: "project:DonggriCompany",
      artifact_id: "artifact:image:api:1",
    });
    expect(exported).toMatchObject({ ok: true, published: false });
  });

  it("rejects corrupt base64 content before writing state", () => {
    const { routes, workbench } = setup();
    const response = createResponse();
    routes.get("POST /api/control-plane/v1/master-95/image-workbench/artifacts/register")?.(
      {
        body: {
          ...guard("register:bad-content"),
          artifact: artifact(),
          asset_base64: Buffer.from("different").toString("base64"),
        },
      },
      response,
    );
    expect(response.statusCode).toBe(400);
    expect(workbench.list("project:DonggriCompany")).toHaveLength(0);
  });

  it("persists an actionable partial failure without losing the asset", () => {
    const { routes, workbench, assets } = setup();
    const call = (route: string, body: Record<string, unknown>) => {
      const response = createResponse();
      routes.get(`POST ${route}`)?.({ body }, response);
      return response;
    };
    expect(
      call("/api/control-plane/v1/master-95/image-workbench/artifacts/register", {
        ...guard("register:partial"),
        artifact: artifact(),
        asset_base64: bytes.toString("base64"),
      }).statusCode,
    ).toBe(201);
    const partial = call("/api/control-plane/v1/master-95/image-workbench/artifacts/partial-failure", {
      ...guard("partial:api:1"),
      project_id: "project:DonggriCompany",
      artifact_id: "artifact:image:api:1",
      failure_reason: "background edge needs manual review",
    });
    expect(partial.body).toMatchObject({
      ok: true,
      artifact: {
        processing_status: "partial",
        failure_reason: "background edge needs manual review",
      },
    });
    const saved = workbench.get("project:DonggriCompany", "artifact:image:api:1");
    expect(assets.read(saved.output_uri)).toEqual(bytes);
  });
});
