import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
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

function mockHarnessMetaApprovalLedger() {
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const approvalsTable = `# Approvals

| approval_id | status | created_at | expires_at | requester_role | approver | scope | repo | resolved_paths | operation_class | command_digest | risk_level | policy_decision | approval_text_ref | preflight_result | postflight_result | evidence_ref | reason_code |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APR-HARNESS-META-001 | approved | 2026-05-27T00:00:00+09:00 | 2026-12-31T23:59:59+09:00 | CONTROL | user | Harness meta generator route test fixture | G:\\Donggri_DevDrive\\repos\\DonggriCompany | control_plane_harness_blueprints test tables | harness-meta | draft blueprint ledger only | medium | allow | test fixture | pass | pass | test | route-test |
`;
  return vi.spyOn(fs, "readFileSync").mockImplementation((file, options) => {
    const normalized = String(file).replace(/\\/g, "/");
    if (normalized.includes("/storage/codex-control/specs/") && normalized.endsWith("/approvals.md")) {
      return approvalsTable;
    }
    return originalReadFileSync(file, options as never);
  });
}

function mockHarnessRunApprovalLedger() {
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const approvalsTable = `# Approvals

| approval_id | status | created_at | expires_at | requester_role | approver | scope | repo | resolved_paths | operation_class | command_digest | risk_level | policy_decision | approval_text_ref | preflight_result | postflight_result | evidence_ref | reason_code |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APR-HARNESS-001 | approved | 2026-05-27T00:00:00+09:00 | 2026-12-31T23:59:59+09:00 | CONTROL | user | Harness run route test fixture | G:\\Donggri_DevDrive\\repos\\DonggriCompany | control_plane_agent_runs test tables | harness-run | thread activation ledger only | medium | allow | test fixture | pass | pass | test | route-test |
`;
  return vi.spyOn(fs, "readFileSync").mockImplementation((file, options) => {
    const normalized = String(file).replace(/\\/g, "/");
    if (normalized.includes("/storage/codex-control/specs/") && normalized.endsWith("/approvals.md")) {
      return approvalsTable;
    }
    return originalReadFileSync(file, options as never);
  });
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
    expect(payload.active_spec.id).toMatch(/^\d{8}-[a-z0-9-]+$/);
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
    expect(payload.dongri_grigri.project_operators.filter((operator: any) => operator.enabled)).toHaveLength(11);
    expect(payload.dongri_grigri.project_operators.filter((operator: any) => !operator.enabled)).toHaveLength(2);
    expect(payload.dongri_grigri.project_operators.every((operator: any) => operator.can_write_repo === false)).toBe(true);
    expect(payload.memory.health.available).toBe(false);
    expect(payload.memory.viewer_preflight).toMatchObject({
      viewer_url: "http://127.0.0.1:3113",
      viewer_port: 3113,
      reachable: false,
      embed_mode: "fallback",
      reason: "network_error",
    });
    expect(payload.memory.integration_mode).toBe("functional-safe-proxy");
    expect(payload.memory.approval_gate.runtime_connect_allowed).toBe(false);
    expect(payload.memory.capabilities.package).toBe("@agentmemory/agentmemory");
    expect(payload.quality_harness.certification_claim).toBe("not-certified");
    expect(payload.quality_harness.agentmemory_gate.runtime_connect_allowed).toBe(false);
    expect(payload.quality_harness.release_hygiene.policy).toContain("diagnostic-only");
    expect(JSON.stringify(payload)).not.toContain("developer_instructions");
    vi.restoreAllMocks();
  });

  it("marks AgentMemory viewer reachable only for 2xx responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url) === "http://127.0.0.1:3113") {
        return new Response("<main>viewer</main>", { status: 200, headers: { "content-type": "text/html" } });
      }
      throw new Error("agentmemory offline");
    });
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("GET /api/control-plane/state")?.({}, res);

    const payload = res.payload as any;
    expect(payload.memory.viewer_preflight).toMatchObject({
      reachable: true,
      status_code: 200,
      embed_mode: "iframe",
      reason: "ok",
    });
    fetchMock.mockRestore();
  });

  it("keeps AgentMemory viewer in fallback for non-2xx responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url) === "http://127.0.0.1:3113") {
        return new Response("not found", { status: 404 });
      }
      throw new Error("agentmemory offline");
    });
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("GET /api/control-plane/state")?.({}, res);

    const payload = res.payload as any;
    expect(payload.memory.viewer_preflight).toMatchObject({
      reachable: false,
      status_code: 404,
      embed_mode: "fallback",
      reason: "http_error",
    });
    fetchMock.mockRestore();
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

  it("blocks AgentMemory remember without active-spec approval", async () => {
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/memory/agentmemory/remember")?.(
      { body: { text: "운영 메모" } },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.payload).toMatchObject({ ok: false, error: "approval_required", required_approval: "APR-MEM-*" });
  });

  it("keeps unsafe AgentMemory remember payloads behind approval before runtime access", async () => {
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/memory/agentmemory/remember")?.(
      {
        body: {
          confirm: "remember-to-agentmemory",
          text: "User: raw\nAssistant: transcript\nTool: payload",
          evidence_refs: ["EV-MEM-TEST"],
        },
      },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.payload).toMatchObject({ ok: false, error: "approval_required", required_approval: "APR-MEM-*" });
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

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: false, available: false, error: "agentmemory_unavailable", reason: "network_error" });
    vi.restoreAllMocks();
  });

  it("returns an unavailable result card payload when AgentMemory search runtime is offline", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/memory/agentmemory/search")?.(
      { body: { query: "active spec", scope: "root" } },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: false, available: false, error: "agentmemory_unavailable", results: [] });
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
    expect(payload.counts).toMatchObject({ total: 13, enabled: 11, disabled: 2 });
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

  it("blocks Control Plane sync apply without an approved APR-DB ledger entry", async () => {
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

    expect(applyRes.statusCode).toBe(403);
    expect(applyRes.payload).toMatchObject({
      ok: false,
      error: "approval_required",
      required_approval: "APR-DB-*",
    });
    db.close();
    vi.restoreAllMocks();
  });

  it("blocks project operator sync apply without an approved APR-DB ledger entry", async () => {
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
        operators: 13,
        enabled: 11,
        disabled: 2,
        direct_repo_write_allowed: 0,
      },
    });

    const applyRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/project-operators/sync/apply")?.(
      { body: { confirm: "apply-project-operators-sync" } },
      applyRes,
    );

    expect(applyRes.statusCode).toBe(403);
    expect(applyRes.payload).toMatchObject({
      ok: false,
      error: "approval_required",
      required_approval: "APR-DB-*",
    });
    db.close();
    vi.restoreAllMocks();
  });

  it("blocks Control Plane mutation requests when an Express request has no Origin", async () => {
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/runs/prepare")?.(
      {
        get: () => undefined,
        body: {
          department_agent: "CONTROL",
          objective: "origin missing",
          task_id: "T-002",
        },
      },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.payload).toMatchObject({ ok: false, error: "control_plane_origin_blocked" });
  });

  it("blocks dedicated Control Plane runs when the active spec has no harness-run approval", async () => {
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
          task_id: "T-004",
          persona_needed: true,
          confidence: "high",
        },
      },
      prepareRes,
    );
    expect(prepareRes.statusCode).toBe(403);
    expect(prepareRes.payload).toMatchObject({ ok: false, error: "approval_required", required_approval: "APR-HARNESS-*" });
    db.close();
    vi.restoreAllMocks();
  });

  it("detects the current Codex thread but blocks activation without active-spec harness-run approval", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const oldThreadId = process.env.CODEX_THREAD_ID;
    process.env.CODEX_THREAD_ID = "019e4ad5-a24d-7711-924a-7fbf3f99ad88";
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, project_path TEXT)");
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });

    const currentRes = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/codex/thread/current")?.({}, currentRes);
    expect(currentRes.statusCode).toBe(200);
    expect(currentRes.payload).toMatchObject({
      ok: true,
      detected_thread: {
        thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
        source: "env:CODEX_THREAD_ID",
      },
      default_scope: {
        scope_key: "project:DonggriCompany",
      },
    });

    const activateRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/codex/thread/activate")?.(
      {
        body: {
          confirm: "activate-codex-thread",
          scope_type: "project",
          scope_value: "DonggriCompany",
          status: "observing",
        },
      },
      activateRes,
    );
    expect(activateRes.statusCode).toBe(403);
    expect(activateRes.payload).toMatchObject({ ok: false, error: "approval_required", required_approval: "APR-HARNESS-*" });
    if (oldThreadId === undefined) delete process.env.CODEX_THREAD_ID;
    else process.env.CODEX_THREAD_ID = oldThreadId;
    db.close();
    vi.restoreAllMocks();
  });

  it("keeps session-file Codex candidates manual-only when CODEX_THREAD_ID is missing", async () => {
    mockHarnessRunApprovalLedger();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const oldThreadId = process.env.CODEX_THREAD_ID;
    delete process.env.CODEX_THREAD_ID;
    const sessionThreadId = "019e6290-f27f-7763-bf2a-71940ebd6945";
    const originalExistsSync = fs.existsSync.bind(fs);
    const originalReaddirSync = fs.readdirSync.bind(fs);
    const originalStatSync = fs.statSync.bind(fs);

    vi.spyOn(fs, "existsSync").mockImplementation((file) => {
      const normalized = String(file).replace(/\\/g, "/");
      if (normalized.endsWith("/.codex/sessions")) return true;
      return originalExistsSync(file);
    });
    vi.spyOn(fs, "readdirSync").mockImplementation((dir, options) => {
      const normalized = String(dir).replace(/\\/g, "/");
      if (normalized.endsWith("/.codex/sessions")) {
        return [
          {
            name: `rollout-2026-05-30T09-00-00-${sessionThreadId}.jsonl`,
            isDirectory: () => false,
            isFile: () => true,
          },
        ] as never;
      }
      return originalReaddirSync(dir, options as never) as never;
    });
    vi.spyOn(fs, "statSync").mockImplementation((file, options) => {
      if (String(file).includes(sessionThreadId)) {
        return {
          size: 1024,
          mtimeMs: Date.parse("2026-05-30T09:00:00.000Z"),
          mtime: new Date("2026-05-30T09:00:00.000Z"),
          isFile: () => true,
        } as never;
      }
      return originalStatSync(file, options as never) as never;
    });

    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, project_path TEXT)");
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });

    const currentRes = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/codex/thread/current")?.({}, currentRes);
    expect(currentRes.statusCode).toBe(200);
    expect(currentRes.payload).toMatchObject({
      ok: true,
      detected_thread: {
        thread_id: null,
        source: "none",
      },
      session_candidates: [
        {
          thread_id: sessionThreadId,
          source: "session-file",
        },
      ],
    });

    const activateRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/codex/thread/activate")?.(
      {
        get: (name: string) => (name.toLowerCase() === "origin" ? "http://127.0.0.1:8800" : undefined),
        body: {
          confirm: "activate-codex-thread",
          scope_type: "project",
          scope_value: "DonggriCompany",
          status: "observing",
        },
      },
      activateRes,
    );
    expect(activateRes.statusCode).toBe(400);
    expect(activateRes.payload).toMatchObject({ ok: false, error: "invalid_thread_id" });

    if (oldThreadId === undefined) delete process.env.CODEX_THREAD_ID;
    else process.env.CODEX_THREAD_ID = oldThreadId;
    db.close();
    vi.restoreAllMocks();
  });

  it("rejects Codex thread finish when the handoff path does not exist", async () => {
    mockHarnessRunApprovalLedger();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const oldThreadId = process.env.CODEX_THREAD_ID;
    process.env.CODEX_THREAD_ID = "019e4ad5-a24d-7711-924a-7fbf3f99ad88";
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, project_path TEXT)");
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });

    const activateRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/codex/thread/activate")?.(
      {
        get: (name: string) => (name.toLowerCase() === "origin" ? "http://127.0.0.1:8800" : undefined),
        body: {
          confirm: "activate-codex-thread",
          thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
          scope_type: "project",
          scope_value: "DonggriCompany",
          status: "observing",
        },
      },
      activateRes,
    );
    expect(activateRes.statusCode).toBe(200);

    const finishRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/codex/thread/:runId/finish")?.(
      {
        get: (name: string) => (name.toLowerCase() === "origin" ? "http://127.0.0.1:8800" : undefined),
        params: { runId: (activateRes.payload as any).run.id },
        body: {
          confirm: "finish-codex-thread",
          final_status: "completed",
          evidence_refs: ["storage/codex-control/specs/current/evidence.md"],
          handoff_path: "storage/codex-control/specs/missing-thread-finish/handoff.md",
        },
      },
      finishRes,
    );
    expect(finishRes.statusCode).toBe(400);
    expect(finishRes.payload).toMatchObject({ ok: false, error: "handoff_path_not_found" });

    if (oldThreadId === undefined) delete process.env.CODEX_THREAD_ID;
    else process.env.CODEX_THREAD_ID = oldThreadId;
    db.close();
    vi.restoreAllMocks();
  });

  it("previews harness blueprints without DB writes and rejects invalid input", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const db = new DatabaseSync(":memory:");
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });

    const previewRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/harness/blueprints/preview")?.(
      {
        body: {
          target_mode: "both",
          project_key: "DonggriCompany",
          objective: "Build a product-grade producer reviewer harness",
          preferred_pattern: "auto",
        },
      },
      previewRes,
    );

    expect(previewRes.statusCode).toBe(200);
    const payload = previewRes.payload as any;
    expect(payload).toMatchObject({
      ok: true,
      writes: false,
      blueprint: {
        target_mode: "both",
        target_scope_key: "DonggriCompany",
      },
    });
    expect(payload.blueprint.phases.map((phase: any) => phase.owner_department).slice(0, 6)).toEqual([
      "CONTROL",
      "SPEC",
      "EXPLORE",
      "IMPLEMENT",
      "REVIEW",
      "OPS",
    ]);
    expect(payload.blueprint.suggested_personas.every((persona: any) => persona.disposable === true)).toBe(true);
    expect(JSON.stringify(payload.blueprint.phases)).not.toContain(".claude");
    expect(JSON.stringify(payload.blueprint.phases)).not.toContain("plugin install");
    const tableCount = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'control_plane_harness_blueprints'").get() as { count: number };
    expect(tableCount.count).toBe(0);

    const invalidProjectRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/harness/blueprints/preview")?.(
      { body: { target_mode: "project", project_key: "missing-project", objective: "invalid project" } },
      invalidProjectRes,
    );
    expect(invalidProjectRes.statusCode).toBe(400);
    expect(invalidProjectRes.payload).toMatchObject({ ok: false, error: "invalid_project_key" });

    const invalidPatternRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/harness/blueprints/preview")?.(
      { body: { target_mode: "department", objective: "invalid pattern", preferred_pattern: "claude-plugin" } },
      invalidPatternRes,
    );
    expect(invalidPatternRes.statusCode).toBe(400);
    expect(invalidPatternRes.payload).toMatchObject({ ok: false, error: "invalid_preferred_pattern" });

    db.close();
    vi.restoreAllMocks();
  });

  it("saves harness blueprint drafts with meta approval and blocks v1 apply without apply approval", async () => {
    mockHarnessMetaApprovalLedger();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const db = new DatabaseSync(":memory:");
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });

    const draftRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/harness/blueprints/drafts")?.(
      {
        body: {
          target_mode: "both",
          project_key: "DonggriCompany",
          objective: "Save department and project harness blueprint",
          preferred_pattern: "producer-reviewer",
          evidence_refs: ["EV-HARNESS-META-TEST"],
        },
      },
      draftRes,
    );

    expect(draftRes.statusCode).toBe(200);
    const draftPayload = draftRes.payload as any;
    expect(draftPayload).toMatchObject({
      ok: true,
      writes: true,
      draft: {
        status: "draft",
        pattern: "producer-reviewer",
      },
      harness_blueprints: {
        draft_count: 1,
        department_draft_count: 1,
        project_draft_count: 1,
        evidence_backed_count: 1,
      },
    });
    expect(JSON.stringify(draftPayload)).toContain("APR-HARNESS-META-001");
    expect(draftPayload.blueprint.suggested_personas.every((persona: any) => persona.disposable === true)).toBe(true);

    const statusRes = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/harness/blueprints/status")?.({}, statusRes);
    expect(statusRes.payload).toMatchObject({
      ok: true,
      harness_blueprints: {
        draft_count: 1,
      },
    });

    const applyRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/harness/blueprints/:id/apply")?.(
      {
        get: (name: string) => (name.toLowerCase() === "origin" ? "http://127.0.0.1:8800" : undefined),
        params: { id: draftPayload.blueprint_id },
        body: {},
      },
      applyRes,
    );
    expect(applyRes.statusCode).toBe(403);
    expect(applyRes.payload).toMatchObject({
      ok: false,
      error: "approval_required",
      required_approval: "APR-HARNESS-APPLY-*",
    });

    db.close();
    vi.restoreAllMocks();
  });
});
