import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { registerControlPlaneRoutes } from "./control-plane.ts";

type RouteHandler = (req: any, res: any) => any;

function createFakeApp() {
  const routes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, handler: RouteHandler) {
      routes.set(`GET ${path}`, handler);
      return this;
    },
    post(path: string, handler: RouteHandler) {
      routes.set(`POST ${path}`, handler);
      return this;
    },
  };
  return { app, routes };
}

function createFakeResponse() {
  return {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

function createFakeDb() {
  return {
    prepare() {
      return {
        all() {
          return [];
        },
      };
    },
  };
}

describe("control plane routes", () => {
  it("returns read-only Control Plane state without raw document bodies", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("GET /api/control-plane/state")?.({}, res);

    const payload = res.payload as any;
    expect(res.statusCode).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.root.path).toBe("G:\\Donggri_DevDrive");
    expect(payload.root.repo_estate_root.path).toBe("G:\\Donggri_DevDrive\\repos");
    expect(payload.root.runtime_projection_app.path).toBe("G:\\Donggri_DevDrive\\repos\\DonggriCompany");
    expect(payload.active_spec.id).toMatch(/^2026052[2-3]-/);
    expect(payload.registry.projects).toEqual(expect.any(Array));
    expect(payload.registry.repo_estate_root).toBe("G:\\Donggri_DevDrive\\repos");
    expect(payload.sync.tables_exist).toBe(false);
    expect(payload.runner.tables_exist).toBe(false);
    expect(payload.codex_assets.exposure_policy).toBe("summary-only-no-raw-config-no-secrets-no-transcripts");
    expect(payload.ver1.version).toBe("Donggri Root Control SDD Ver.1");
    expect(payload.ver1.hard_gates.has_kiro_dir).toBe(false);
    expect(payload.ver1.department_agents.map((agent: any) => agent.id)).toEqual([
      "CONTROL",
      "SPEC",
      "EXPLORE",
      "IMPLEMENT",
      "REVIEW",
      "OPS",
    ]);
    expect(payload.dongri_grigri.project_operators).toEqual(expect.any(Array));
    expect(payload.dongri_grigri.project_operators.filter((operator: any) => operator.enabled)).toHaveLength(10);
    expect(payload.dongri_grigri.project_operators.filter((operator: any) => !operator.enabled)).toHaveLength(2);
    expect(payload.dongri_grigri.project_operators.every((operator: any) => operator.can_write_repo === false)).toBe(true);
    expect(payload.memory.health.available).toBe(false);
    expect(payload.memory.integration_mode).toBe("functional-safe-proxy");
    expect(payload.memory.capabilities.package).toBe("@agentmemory/agentmemory");
    expect(JSON.stringify(payload)).not.toContain("developer_instructions");
    vi.restoreAllMocks();
  });

  it("exposes Ver.1 read-only projection endpoints", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/quality/score")?.({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      ok: true,
      quality: {
        target: 95,
      },
    });
    vi.restoreAllMocks();
  });

  it("keeps memory search read-only and validates query input", async () => {
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("GET /api/control-plane/memory/search")?.({ query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: false, error: "query_required", results: [] });
  });

  it("exposes AgentMemory functional capabilities without requiring the runtime", async () => {
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/memory/agentmemory/capabilities")?.({}, res);

    const payload = res.payload as any;
    expect(res.statusCode).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.capabilities).toMatchObject({
      package: "@agentmemory/agentmemory",
      observed_version: "0.9.21",
      observed_rest_path_count: 124,
    });
    expect(payload.capabilities.mcp_tools.observed_memory_tool_count).toBe(53);
    expect(payload.capabilities.safety.delete_forget_import_hooks_mcp).toBe("blocked-until-explicit-approval");
  });

  it("blocks AgentMemory remember without per-call confirmation", async () => {
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/memory/agentmemory/remember")?.(
      { body: { text: "운영 메모" } },
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatchObject({ ok: false, error: "confirmation_required", captured: false });
  });

  it("returns an unavailable result when AgentMemory context runtime is offline", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/memory/agentmemory/context")?.(
      { body: { query: "auth policy", scope: "root-control" } },
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(res.payload).toMatchObject({ ok: false, available: false, error: expect.any(String) });
    vi.restoreAllMocks();
  });

  it("exposes project operator manifests with disabled candidates", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/project-operators")?.({}, res);

    const payload = res.payload as any;
    expect(res.statusCode).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.counts).toMatchObject({ total: 12, enabled: 10, disabled: 2 });
    expect(payload.policy).toMatchObject({
      owner_department: "OPS",
      authority: "operations-only",
      implementation_delegate: "IMPLEMENT",
    });
    expect(payload.project_operators.find((operator: any) => operator.project_key === "alpha-shop")).toMatchObject({
      enabled: false,
      status: "disabled-candidate",
      can_write_repo: false,
    });
    vi.restoreAllMocks();
  });

  it("applies approved Control Plane sync only into control_plane tables", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, project_path TEXT)");
    db.prepare("INSERT INTO projects (id, name, project_path) VALUES (?, ?, ?)").run(
      "project-donggri",
      "DonggriCompany",
      "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
    );
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });

    const previewRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/sync/preview")?.({ body: {} }, previewRes);
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.payload).toMatchObject({
      ok: true,
      mode: "preview",
      writes: false,
    });

    const applyRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/sync/apply")?.(
      { body: { confirm: "apply-control-plane-sync" } },
      applyRes,
    );

    const snapshotCount = db.prepare("SELECT COUNT(*) AS count FROM control_plane_snapshots").get() as { count: number };
    const projectLinkCount = db
      .prepare("SELECT COUNT(*) AS count FROM control_plane_project_links")
      .get() as { count: number };
    const specTaskCount = db
      .prepare("SELECT COUNT(*) AS count FROM control_plane_spec_task_links")
      .get() as { count: number };

    expect(applyRes.statusCode).toBe(200);
    expect(applyRes.payload).toMatchObject({
      ok: true,
      mode: "apply",
      writes: true,
    });
    expect(snapshotCount.count).toBeGreaterThan(0);
    expect(projectLinkCount.count).toBeGreaterThan(0);
    expect(specTaskCount.count).toBeGreaterThan(0);
    db.close();
    vi.restoreAllMocks();
  });

  it("applies project operator sync only into control_plane project operator tables", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, project_path TEXT)");
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });

    const previewRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/project-operators/sync/preview")?.({ body: {} }, previewRes);
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.payload).toMatchObject({
      ok: true,
      mode: "preview",
      writes: false,
      counts: {
        operators: 12,
        enabled: 10,
        disabled: 2,
        direct_repo_write_allowed: 0,
      },
    });

    const applyRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/project-operators/sync/apply")?.(
      { body: { confirm: "apply-project-operators-sync" } },
      applyRes,
    );

    const operatorCount = db
      .prepare("SELECT COUNT(*) AS count FROM control_plane_project_operators")
      .get() as { count: number };
    const memoryLinkCount = db
      .prepare("SELECT COUNT(*) AS count FROM control_plane_project_operator_memory_links")
      .get() as { count: number };
    const disabledCount = db
      .prepare("SELECT COUNT(*) AS count FROM control_plane_project_operators WHERE enabled = 0")
      .get() as { count: number };

    expect(applyRes.statusCode).toBe(200);
    expect(applyRes.payload).toMatchObject({
      ok: true,
      mode: "apply",
      writes: true,
    });
    expect(operatorCount.count).toBe(12);
    expect(memoryLinkCount.count).toBe(12);
    expect(disabledCount.count).toBe(2);
    db.close();
    vi.restoreAllMocks();
  });

  it("prepares a dedicated Control Plane run and accepts a read-only persona", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, project_path TEXT)");
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });

    const prepareRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/runs/prepare")?.(
      {
        body: {
          department_agent: "CONTROL",
          objective: "test autonomy runner",
          persona_needed: true,
          confidence: "high",
        },
      },
      prepareRes,
    );
    expect(prepareRes.statusCode).toBe(200);
    expect(prepareRes.payload).toMatchObject({
      ok: true,
      run: {
        department_agent: "CONTROL",
        status: "prepared",
      },
    });

    const runId = (prepareRes.payload as any).run.id;
    const startRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/runs/:runId/start")?.({ params: { runId }, body: {} }, startRes);
    expect(startRes.statusCode).toBe(200);
    expect(startRes.payload).toMatchObject({ ok: true, run: { status: "running" } });

    const personaRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/runs/:runId/personas")?.(
      {
        params: { runId },
        body: {
          parent_agent: "CONTROL",
          persona_id: "control-readonly-001",
          objective: "read-only test persona",
          write_policy: "read-only",
          allowed_paths: { read: ["G:/Donggri_DevDrive/storage/codex-control"], write: [] },
          return_schema: ["summary", "evidence_path"],
        },
      },
      personaRes,
    );
    expect(personaRes.statusCode).toBe(200);
    expect((personaRes.payload as any).personas[0]).toMatchObject({
      persona_id: "control-readonly-001",
      status: "created",
      write_policy: "read-only",
    });

    const decisionRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/personas/:personaId/decision")?.(
      {
        params: { personaId: "control-readonly-001" },
        body: {
          decision: "accept",
          reason: "evidence-backed",
          evidence_refs: ["EV-TEST-001"],
        },
      },
      decisionRes,
    );
    expect(decisionRes.statusCode).toBe(200);
    expect((decisionRes.payload as any).personas[0]).toMatchObject({
      persona_id: "control-readonly-001",
      status: "accepted",
    });

    const writeBlockRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/runs/:runId/personas")?.(
      {
        params: { runId },
        body: {
          parent_agent: "CONTROL",
          objective: "blocked write persona",
          write_policy: "approved-task-files",
          allowed_paths: { read: [], write: ["G:/Donggri_DevDrive/repos/DonggriCompany/README.md"] },
          approval_ref: "APR-AGENT-001",
        },
      },
      writeBlockRes,
    );
    expect(writeBlockRes.statusCode).toBe(400);
    expect(writeBlockRes.payload).toMatchObject({ ok: false, error: "repo_write_requires_implement_parent" });

    db.close();
    vi.restoreAllMocks();
  });
});
