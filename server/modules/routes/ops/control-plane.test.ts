import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  ControlPlaneSourceAdapter,
  type ControlPlaneSourceFile,
  type ControlPlaneSourceSnapshot,
} from "../../control-plane/source-adapter.ts";
import { registerControlPlaneRoutes } from "./control-plane.ts";

vi.setConfig({ testTimeout: 15_000 });

type RouteHandler = (req: any, res: any) => any;

function createFakeApp() {
  const routes = new Map<string, RouteHandler>();
  const app = {
    use(_path: string, _handler: RouteHandler) {
      return this;
    },
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

const FIXTURE_CONTROL_ROOT = "G:\\Donggri_DevDrive";
const FIXTURE_CONTROL_PLANE_ROOT = `${FIXTURE_CONTROL_ROOT}\\storage\\codex-control`;
const FIXTURE_ACTIVE_SPEC_ID = "20260725-control-plane-route-fixture-v1";
const FIXTURE_SECONDARY_SPEC_ID = "20260725-secondary-route-fixture-v1";
const nativeExistsSync = fs.existsSync.bind(fs);
const nativeReadFileSync = fs.readFileSync.bind(fs);
const nativeStatSync = fs.statSync.bind(fs);

function normalizeFixturePath(file: fs.PathLike | number): string {
  return String(file).replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
}

function fixtureSourceFile(relativePath: string, content: string): ControlPlaneSourceFile {
  return {
    relative_path: relativePath,
    absolute_path: `${FIXTURE_CONTROL_ROOT}\\${relativePath.replace(/\//g, "\\")}`,
    exists: true,
    size: Buffer.byteLength(content),
    mtime: "2026-07-25T00:00:00.000Z",
    sha256: "1".repeat(64),
    content,
    error: null,
  };
}

const fixtureActiveSpecs = [
  {
    id: FIXTURE_ACTIVE_SPEC_ID,
    status: "implementation",
    phase: "preflight",
    related_repo: `${FIXTURE_CONTROL_ROOT}\\repos\\DonggriCompany`,
    related_repos: [`${FIXTURE_CONTROL_ROOT}\\repos\\DonggriCompany`],
    scope: "Control Plane route fixture",
    heading: "Current Active Spec (Control Plane route fixture)",
    line: 1,
    next_recommended_action: null,
  },
  {
    id: FIXTURE_SECONDARY_SPEC_ID,
    status: "review",
    phase: "fixture-review",
    related_repo: `${FIXTURE_CONTROL_ROOT}\\repos\\BloggerGent`,
    related_repos: [`${FIXTURE_CONTROL_ROOT}\\repos\\BloggerGent`],
    scope: "Secondary route fixture",
    heading: "Current Active Spec (Secondary route fixture)",
    line: 8,
    next_recommended_action: null,
  },
];

const fixtureProjects: ControlPlaneSourceSnapshot["projects"] = [
  {
    key: "DonggriCompany",
    path: "repos/DonggriCompany",
    type: "git-repo",
    has_agents: true,
    status: "active",
    summary: "Primary runtime projection fixture.",
    operation_agent: null,
    enabled: true,
  },
  {
    key: "BloggerGent",
    path: "repos/BloggerGent",
    type: "git-repo",
    has_agents: true,
    status: "active",
    summary: "Publishing fixture.",
    operation_agent: null,
    enabled: true,
  },
  {
    key: "DonggrolGameBook",
    path: "repos/DonggrolGameBook",
    type: "git-repo",
    has_agents: true,
    status: "active",
    summary: "GameBook fixture.",
    operation_agent: null,
    enabled: true,
  },
  {
    key: "CardNewsAgent",
    path: "repos/CardNewsAgent",
    type: "git-repo",
    has_agents: true,
    status: "archived",
    summary: "Archived fixture.",
    operation_agent: null,
    enabled: false,
  },
  {
    key: "alpha-shop",
    path: "repos/alpha-shop",
    type: "folder",
    has_agents: false,
    status: "candidate",
    summary: "Disabled candidate fixture.",
    operation_agent: null,
    enabled: false,
  },
];

const fixtureProjectsSource = fixtureSourceFile(
  "storage/codex-control/registry/projects.yaml",
  "projects:\n  DonggriCompany:\n    path: repos/DonggriCompany\n    status: active\n",
);
const fixtureActiveSpecsSource = fixtureSourceFile(
  "storage/codex-control/specs/_active.md",
  `- Spec ID: \`${FIXTURE_ACTIVE_SPEC_ID}\`\n- Spec ID: \`${FIXTURE_SECONDARY_SPEC_ID}\`\n`,
);
const fixtureSnapshot: ControlPlaneSourceSnapshot = {
  generated_at: "2026-07-25T00:00:00.000Z",
  source_epoch: `sha256:${"a".repeat(64)}`,
  projection_epoch: `sha256:${"b".repeat(64)}`,
  degraded: false,
  parse_errors: [],
  active_specs: fixtureActiveSpecs,
  active_spec: fixtureActiveSpecs[0],
  next_recommended_action: null,
  projects: fixtureProjects,
  files: {
    projects: fixtureProjectsSource,
    active_specs: fixtureActiveSpecsSource,
  },
};

const fixtureFileContents = new Map<string, string>();
const registerFixtureFile = (absolutePath: string, content: string) => {
  fixtureFileContents.set(normalizeFixturePath(absolutePath), content);
};

registerFixtureFile(
  `${FIXTURE_CONTROL_PLANE_ROOT}\\specs\\${FIXTURE_ACTIVE_SPEC_ID}\\approvals.md`,
  "# Fixture approval ledger\n",
);
for (const name of [
  "metadata.md",
  "requirements.md",
  "design.md",
  "tasks.md",
  "repo-map.md",
  "approvals.md",
  "evidence.md",
  "handoff.md",
  "learnings.md",
]) {
  registerFixtureFile(
    `${FIXTURE_CONTROL_PLANE_ROOT}\\specs\\20260714-donggricompany-95-master-operating-system-v1\\${name}`,
    `# ${name} route fixture\n`,
  );
}
registerFixtureFile(
  `${FIXTURE_CONTROL_PLANE_ROOT}\\quality\\master-95\\QUALITY_SCORECARD.md`,
  "# Master95 route fixture\n",
);
registerFixtureFile(
  `${FIXTURE_CONTROL_PLANE_ROOT}\\quality\\master-95\\SCORING_RULES.json`,
  JSON.stringify({
    certification_state: "not_certified_foundation_in_progress",
    targets: {
      design_specification: 98,
      implementation_execution_evidence: 97,
      aggregate: 97.45,
      agy_each_axis_minimum: 950,
    },
    aggregate_formula: {},
    hard_gates: Array.from({ length: 10 }, (_, index) => ({
      id: `M95-G${String(index + 1).padStart(2, "0")}`,
      name: `fixture_gate_${index + 1}`,
      required: true,
      failure_effect: "block_certification",
    })),
  }),
);
registerFixtureFile(
  `${FIXTURE_CONTROL_PLANE_ROOT}\\quality\\master-95\\EVIDENCE_INDEX.yaml`,
  "certification_state: not_certified_foundation_in_progress\nevidence: []\nhard_gates: {}\n",
);
registerFixtureFile(
  `${FIXTURE_CONTROL_PLANE_ROOT}\\quality\\master-95\\requirements-traceability.yaml`,
  `requirements:
  - id: M95-R001
    title: Hermetic route fixture
    priority: must
    status: implemented
    design_refs: []
    interfaces: []
    tests: []
    evidence_refs:
      - EV-FIXTURE-001
`,
);

function isFixtureControlPath(file: fs.PathLike | number): boolean {
  const normalized = normalizeFixturePath(file);
  return normalized === "g:/donggri_devdrive" || normalized.startsWith("g:/donggri_devdrive/");
}

function fixtureExistsSync(file: fs.PathLike): boolean {
  const normalized = normalizeFixturePath(file);
  if (fixtureFileContents.has(normalized)) return true;
  if (normalized === "g:/donggri_devdrive/repos/alpha-shop") return true;
  if (isFixtureControlPath(file)) return false;
  return nativeExistsSync(file);
}

function fixtureReadFileSync(file: fs.PathOrFileDescriptor, options?: unknown): string | Buffer {
  const normalized = normalizeFixturePath(file);
  const content = fixtureFileContents.get(normalized);
  if (content !== undefined) {
    const encoding = typeof options === "string" ? options : (options as { encoding?: string } | undefined)?.encoding;
    return encoding ? content : Buffer.from(content);
  }
  if (isFixtureControlPath(file)) {
    const error = Object.assign(new Error(`ENOENT: no such file or directory, open '${String(file)}'`), {
      code: "ENOENT",
    });
    throw error;
  }
  return (nativeReadFileSync as (...args: unknown[]) => string | Buffer)(file, options);
}

function fixtureStatSync(file: fs.PathLike, options?: unknown): fs.Stats {
  const normalized = normalizeFixturePath(file);
  const content = fixtureFileContents.get(normalized);
  if (content !== undefined) {
    const mtime = new Date("2026-07-25T00:00:00.000Z");
    return {
      size: Buffer.byteLength(content),
      mtime,
      mtimeMs: mtime.getTime(),
      isFile: () => true,
      isDirectory: () => false,
    } as fs.Stats;
  }
  if (normalized === "g:/donggri_devdrive/repos/alpha-shop") {
    return {
      size: 0,
      mtime: new Date("2026-07-25T00:00:00.000Z"),
      mtimeMs: Date.parse("2026-07-25T00:00:00.000Z"),
      isFile: () => false,
      isDirectory: () => true,
    } as fs.Stats;
  }
  if (isFixtureControlPath(file)) {
    const error = Object.assign(new Error(`ENOENT: no such file or directory, stat '${String(file)}'`), {
      code: "ENOENT",
    });
    throw error;
  }
  return (nativeStatSync as (...args: unknown[]) => fs.Stats)(file, options);
}

beforeEach(() => {
  vi.spyOn(ControlPlaneSourceAdapter.prototype, "readSnapshot").mockImplementation(() =>
    structuredClone(fixtureSnapshot),
  );
  vi.spyOn(fs, "existsSync").mockImplementation(fixtureExistsSync);
  vi.spyOn(fs, "readFileSync").mockImplementation(fixtureReadFileSync as typeof fs.readFileSync);
  vi.spyOn(fs, "statSync").mockImplementation(fixtureStatSync as typeof fs.statSync);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockHarnessMetaApprovalLedger() {
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
    return fixtureReadFileSync(file, options) as never;
  });
}

function mockHarnessRunApprovalLedger() {
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
    return fixtureReadFileSync(file, options) as never;
  });
}

function mockEngineSyncApprovalLedger({ includeAppServer = false } = {}) {
  const appServerRow = includeAppServer
    ? `| APR-CODEX-APP-SERVER-POC-001 | approved | 2026-07-25T00:00:00+09:00 | 2026-12-31T23:59:59+09:00 | CONTROL | user | Codex app-server read-only PoC fixture | G:\\Donggri_DevDrive\\repos\\DonggriCompany | control_plane_engine_* test tables | codex-app-server-poc | app-server status only | medium | allow | test fixture | pass | pass | EV-CODEX-APP-SERVER-POC | route-test |\n`
    : "";
  const approvalsTable = `# Approvals

| approval_id | status | created_at | expires_at | requester_role | approver | scope | repo | resolved_paths | operation_class | command_digest | risk_level | policy_decision | approval_text_ref | preflight_result | postflight_result | evidence_ref | reason_code |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APR-CODEX-ENGINE-SYNC-001 | approved | 2026-07-25T00:00:00+09:00 | 2026-12-31T23:59:59+09:00 | CONTROL | user | Codex engine sync route test fixture | G:\\Donggri_DevDrive\\repos\\DonggriCompany | control_plane_engine_* test tables | codex-engine-sync | summary hash refs only | medium | allow | test fixture | pass | pass | EV-CODEX-ENGINE-SYNC | route-test |
${appServerRow}`;
  return vi.spyOn(fs, "readFileSync").mockImplementation((file, options) => {
    const normalized = String(file).replace(/\\/g, "/");
    if (normalized.includes("/storage/codex-control/specs/") && normalized.endsWith("/approvals.md")) {
      return approvalsTable;
    }
    return fixtureReadFileSync(file, options) as never;
  });
}

function mockNoEngineSyncApprovalLedger() {
  const approvalsTable = `# Approvals

| approval_id | status | created_at | expires_at | requester_role | approver | scope | repo | resolved_paths | operation_class | command_digest | risk_level | policy_decision | approval_text_ref | preflight_result | postflight_result | evidence_ref | reason_code |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APR-HARNESS-001 | approved | 2026-07-25T00:00:00+09:00 | 2026-12-31T23:59:59+09:00 | CONTROL | user | unrelated harness fixture | G:\\Donggri_DevDrive\\repos\\DonggriCompany | control_plane_agent_runs test tables | harness-run | unrelated | medium | allow | test fixture | pass | pass | test | route-test |
`;
  return vi.spyOn(fs, "readFileSync").mockImplementation((file, options) => {
    const normalized = String(file).replace(/\\/g, "/");
    if (normalized.includes("/storage/codex-control/specs/") && normalized.endsWith("/approvals.md")) {
      return approvalsTable;
    }
    return fixtureReadFileSync(file, options) as never;
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
    expect(payload.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.source_epoch).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(payload.degraded).toBe(false);
    expect(payload.parse_errors).toEqual([]);
    expect(payload.active_specs.length).toBeGreaterThan(1);
    expect(payload.active_spec.id).toMatch(/^\d{8}-[a-z0-9-]+$/);
    expect(payload.active_spec.id).toBe(payload.active_specs[0].id);
    expect(payload.active_spec).toMatchObject({
      deprecated: true,
      replacement: "active_specs[]",
    });
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
    expect(
      payload.dongri_grigri.project_operators.filter((operator: any) => operator.enabled).length +
        payload.dongri_grigri.project_operators.filter((operator: any) => !operator.enabled).length,
    ).toBe(payload.dongri_grigri.project_operators.length);
    expect(
      payload.dongri_grigri.project_operators.find((operator: any) => operator.project_key === "CardNewsAgent"),
    ).toMatchObject({
      enabled: false,
      project_status: "archived",
    });
    expect(payload.dongri_grigri.project_operators.every((operator: any) => operator.can_write_repo === false)).toBe(
      true,
    );
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

  it("propagates missing Control Plane sources as a degraded empty active-spec projection", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const sourceMissingErrors = [
      {
        source: "storage/codex-control/registry/projects.yaml",
        code: "source_missing",
        message: "Control Plane source file is missing",
        path: fixtureProjectsSource.absolute_path,
        line: null,
        column: null,
      },
      {
        source: "storage/codex-control/specs/_active.md",
        code: "source_missing",
        message: "Control Plane source file is missing",
        path: fixtureActiveSpecsSource.absolute_path,
        line: null,
        column: null,
      },
    ];
    vi.mocked(ControlPlaneSourceAdapter.prototype.readSnapshot).mockImplementation(() => ({
      ...structuredClone(fixtureSnapshot),
      degraded: true,
      parse_errors: structuredClone(sourceMissingErrors),
      active_specs: [],
      active_spec: null,
      projects: [],
      files: {
        projects: {
          ...fixtureProjectsSource,
          exists: false,
          size: null,
          mtime: null,
          sha256: null,
          content: null,
          error: "source_missing",
        },
        active_specs: {
          ...fixtureActiveSpecsSource,
          exists: false,
          size: null,
          mtime: null,
          sha256: null,
          content: null,
          error: "source_missing",
        },
      },
    }));
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/specs/active")?.({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      ok: true,
      degraded: true,
      active_specs: [],
      active_spec: {
        id: null,
        deprecated: true,
        replacement: "active_specs[]",
        parse_error: "active_spec_unavailable",
      },
      parse_errors: expect.arrayContaining([
        expect.objectContaining({
          source: "storage/codex-control/registry/projects.yaml",
          code: "source_missing",
        }),
        expect.objectContaining({
          source: "storage/codex-control/specs/_active.md",
          code: "source_missing",
        }),
      ]),
    });
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

  it("registers the complete AGY, Master95, engine, Control Tower, and Image Workbench route surface", () => {
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const expectedRoutes = [
      "GET /api/control-plane/v1/agy-review/latest",
      "GET /api/control-plane/v1/master-95/status",
      "GET /api/control-plane/v1/master-95/scorecard",
      "GET /api/control-plane/v1/master-95/traceability",
      "GET /api/control-plane/v1/engines/status",
      "GET /api/control-plane/v1/engines/runs/:id",
      "POST /api/control-plane/v1/engines/route-preview",
      "POST /api/control-plane/v1/engines/runs",
      "POST /api/control-plane/v1/engines/runs/:id/cancel",
      "POST /api/control-plane/v1/engines/threads/attach",
      "POST /api/control-plane/v1/engines/reconcile",
      "GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/state",
      "GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/events",
      "GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/runs/:runId",
      "GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/artifacts/:artifactId",
      "POST /api/control-plane/v1/master-95/control-tower/journeys",
      "POST /api/control-plane/v1/master-95/control-tower/actions",
      "GET /api/control-plane/v1/master-95/image-workbench/projects/:projectId/artifacts",
      "GET /api/control-plane/v1/master-95/image-workbench/projects/:projectId/artifacts/:artifactId",
      "GET /api/control-plane/v1/master-95/image-workbench/projects/:projectId/artifacts/:artifactId/content",
      "POST /api/control-plane/v1/master-95/image-workbench/artifacts/register",
      "POST /api/control-plane/v1/master-95/image-workbench/artifacts/submit",
      "POST /api/control-plane/v1/master-95/image-workbench/artifacts/decision",
      "POST /api/control-plane/v1/master-95/image-workbench/artifacts/partial-failure",
      "POST /api/control-plane/v1/master-95/image-workbench/artifacts/restore",
      "POST /api/control-plane/v1/master-95/image-workbench/artifacts/handoff",
      "POST /api/control-plane/v1/master-95/image-workbench/artifacts/export",
      "GET /api/control-plane/v2/state",
      "GET /api/control-plane/v2/image-workbench/projects/:projectId/artifacts",
      "POST /api/control-plane/v2/mutations/preview",
      "POST /api/control-plane/v2/mutations/approval",
      "POST /api/control-plane/v2/mutations/execute",
      "POST /api/control-plane/v2/image-workbench/uploads/preview",
      "POST /api/control-plane/v2/image-workbench/uploads",
    ];

    for (const route of expectedRoutes) expect(routes.has(route), route).toBe(true);
  });

  it("exposes the AGY review projection from the Ver.1 status", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("agentmemory offline"));
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const res = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/agy-review/latest")?.({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      ok: true,
      agy_review: {
        required: true,
        model: "Gemini 3.1 Pro (High)",
        status: "pending-local-verification",
        command_cwd: "G:\\Donggri_DevDrive",
      },
    });
    vi.restoreAllMocks();
  });

  it("exposes Master95 read-only status, scorecard, and traceability projections", async () => {
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: createFakeDb() as any });

    const statusRes = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/master-95/status")?.({}, statusRes);
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.payload).toMatchObject({
      ok: true,
      master_95: {
        spec_id: "20260714-donggricompany-95-master-operating-system-v1",
        companion_mode: true,
        phase: null,
        next_safe_action: null,
        docs: {
          missing_count: 0,
        },
      },
    });
    const master95 = (statusRes.payload as any).master_95;
    expect(master95.source_epoch).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(master95.approvals_required).not.toContain("git stage/commit/push");
    expect(master95.dirty_worktree.policy).toContain("local workspace inventory");
    expect(master95.bloggergent_ops).toMatchObject({
      department: "OPS",
      project_id: "project:BloggerGent",
      mode: "read-only-dry-run-routing-preview",
      implementation_delegate: "IMPLEMENT",
      review_delegate: "REVIEW",
      approval_owner: "CONTROL",
    });
    expect(master95.bloggergent_ops.role_agents).toHaveLength(7);
    expect(master95.bloggergent_ops.lanes).toHaveLength(8);
    expect(master95.agent_versions).toHaveLength(6);

    const scorecardRes = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/master-95/scorecard")?.({}, scorecardRes);
    expect(scorecardRes.statusCode).toBe(200);
    expect(scorecardRes.payload).toMatchObject({
      ok: true,
      scorecard: {
        certification_state: "not_certified_foundation_in_progress",
        targets: {
          aggregate: 97.45,
          agy_each_axis_minimum: 950,
        },
      },
    });
    expect((scorecardRes.payload as any).scorecard.hard_gates).toHaveLength(10);

    const traceabilityRes = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/master-95/traceability")?.({}, traceabilityRes);
    expect(traceabilityRes.statusCode).toBe(200);
    const traceability = (traceabilityRes.payload as any).traceability;
    expect(traceability.spec_id).toBe("20260714-donggricompany-95-master-operating-system-v1");
    expect(traceability.counts.total).toBe(traceability.requirements.length);
    expect(traceability.counts.implemented + traceability.counts.in_progress + traceability.counts.planned).toBe(
      traceability.counts.total,
    );
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
    await routes.get("POST /api/control-plane/v1/memory/agentmemory/remember")?.({ body: { text: "운영 메모" } }, res);

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
    expect(res.payload).toMatchObject({
      ok: false,
      available: false,
      error: "agentmemory_unavailable",
      reason: "network_error",
    });
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
    expect(payload.counts).toMatchObject({
      total: payload.project_operators.length,
      enabled: payload.project_operators.filter((operator: any) => operator.enabled).length,
      disabled: payload.project_operators.filter((operator: any) => !operator.enabled).length,
    });
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
    expect(payload.project_operators.find((operator: any) => operator.project_key === "CardNewsAgent")).toMatchObject({
      enabled: false,
      project_status: "archived",
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
    const previewPayload = previewRes.payload as any;
    expect(previewPayload).toMatchObject({
      ok: true,
      mode: "preview",
      writes: false,
      counts: {
        direct_repo_write_allowed: 0,
      },
    });
    expect(previewPayload.counts).toMatchObject({
      operators: previewPayload.operators.length,
      enabled: previewPayload.operators.filter((operator: any) => operator.enabled).length,
      disabled: previewPayload.operators.filter((operator: any) => !operator.enabled).length,
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
    expect(prepareRes.payload).toMatchObject({
      ok: false,
      error: "approval_required",
      required_approval: "APR-HARNESS-*",
    });
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
    expect(activateRes.payload).toMatchObject({
      ok: false,
      error: "approval_required",
      required_approval: "APR-HARNESS-*",
    });
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
    const originalExistsSync = fixtureExistsSync;
    const originalReaddirSync = fs.readdirSync.bind(fs);
    const originalStatSync = fixtureStatSync;

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
    const tableCount = db
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'control_plane_harness_blueprints'")
      .get() as { count: number };
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

  it("previews engine routing without creating the engine ledger", async () => {
    const db = new DatabaseSync(":memory:");
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });

    const previewRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/engines/route-preview")?.(
      {
        body: {
          objective: "Summarize the active SDD task and prepare a Codex CLI event bridge plan",
          provider: "codex_exec",
          scope_type: "project",
          scope_value: "DonggriCompany",
        },
      },
      previewRes,
    );

    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.payload).toMatchObject({
      ok: true,
      writes: false,
      route: {
        provider: "codex_exec",
        decision: "routeable",
        scope_key: "project:DonggriCompany",
        computer_use_required: false,
      },
    });
    const tableCount = db
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'control_plane_engine_%'")
      .get() as { count: number };
    expect(tableCount.count).toBe(0);

    const unsafeRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/engines/route-preview")?.(
      {
        body: {
          objective: "Review this payload",
          provider: "codex_exec",
          event_jsonl: `{"messages":[{"role":"user","content":"raw transcript"}]}`,
        },
      },
      unsafeRes,
    );
    expect(unsafeRes.statusCode).toBe(400);
    expect(unsafeRes.payload).toMatchObject({ ok: false, error: "raw_transcript_blocked" });

    db.close();
  });

  it("blocks engine mutations without engine sync approval", async () => {
    mockNoEngineSyncApprovalLedger();
    const db = new DatabaseSync(":memory:");
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });
    const reqBase = {
      get: (name: string) => (name.toLowerCase() === "origin" ? "http://127.0.0.1:8800" : undefined),
    };

    for (const [route, body, params] of [
      [
        "POST /api/control-plane/v1/engines/runs",
        {
          objective: "Create a guarded Codex engine run",
          provider: "codex_exec",
          scope_type: "project",
          scope_value: "DonggriCompany",
        },
        {},
      ],
      ["POST /api/control-plane/v1/engines/runs/:id/cancel", {}, { id: "missing-run" }],
      [
        "POST /api/control-plane/v1/engines/threads/attach",
        {
          provider: "codex_exec",
          external_thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
          scope_type: "project",
          scope_value: "DonggriCompany",
        },
        {},
      ],
      ["POST /api/control-plane/v1/engines/reconcile", {}, {}],
    ] as const) {
      const res = createFakeResponse();
      await routes.get(route)?.({ ...reqBase, body, params }, res);
      expect(res.statusCode, route).toBe(403);
      expect(res.payload, route).toMatchObject({
        ok: false,
        error: "approval_required",
        required_approval: "APR-CODEX-ENGINE-SYNC-*",
      });
    }

    db.close();
    vi.restoreAllMocks();
  });

  it("records, reads, cancels, attaches, and reconciles approved engine state safely", async () => {
    mockEngineSyncApprovalLedger({ includeAppServer: true });
    const db = new DatabaseSync(":memory:");
    const { app, routes } = createFakeApp();
    registerControlPlaneRoutes({ app: app as any, db: db as any });
    const reqBase = {
      get: (name: string) => (name.toLowerCase() === "origin" ? "http://127.0.0.1:8800" : undefined),
    };
    const eventJsonl = [
      JSON.stringify({ type: "thread.started", thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88" }),
      JSON.stringify({
        type: "turn.completed",
        thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
        turn_id: "turn-001",
      }),
    ].join("\n");

    const runRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/engines/runs")?.(
      {
        ...reqBase,
        body: {
          objective: "Collect Codex exec JSONL and summarize the output safely",
          provider: "codex_exec",
          scope_type: "project",
          scope_value: "DonggriCompany",
          evidence_refs: ["EV-CODEX-ENGINE-SYNC-TEST"],
          event_jsonl: eventJsonl,
        },
      },
      runRes,
    );

    expect(runRes.statusCode).toBe(200);
    const created = runRes.payload as any;
    expect(created).toMatchObject({
      ok: true,
      run: {
        run: {
          provider: "codex_exec",
          status: "completed",
          scope_key: "project:DonggriCompany",
          external_thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
        },
      },
      engine_sync: {
        tables_exist: true,
      },
    });
    expect(created.run.run.input_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.run.run.output_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(created)).not.toContain("messages");

    const runId = created.run.run.id as string;
    const readRes = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/engines/runs/:id")?.({ params: { id: runId } }, readRes);
    expect(readRes.statusCode).toBe(200);
    expect(readRes.payload).toMatchObject({ ok: true, run: { id: runId, status: "completed" } });

    const cancelRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/engines/runs/:id/cancel")?.(
      { ...reqBase, params: { id: runId }, body: {} },
      cancelRes,
    );
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.payload).toMatchObject({ ok: true, run: { run: { id: runId, status: "blocked" } } });
    expect((cancelRes.payload as any).run.events.at(-1)).toMatchObject({ event_type: "cancelled" });

    const attachRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/engines/threads/attach")?.(
      {
        ...reqBase,
        body: {
          provider: "codex_exec",
          external_thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
          scope_type: "project",
          scope_value: "DonggriCompany",
          title: "Observed Codex thread",
          summary: "사용자가 만든 Codex thread를 DonggriCompany 범위에 연결합니다.",
          evidence_refs: ["EV-CODEX-THREAD-ATTACH"],
        },
      },
      attachRes,
    );
    expect(attachRes.statusCode).toBe(200);
    expect(attachRes.payload).toMatchObject({
      ok: true,
      thread_link: {
        provider: "codex_exec",
        link_type: "observed",
        status: "linked",
        scope_key: "project:DonggriCompany",
      },
    });

    const reconcileRes = createFakeResponse();
    await routes.get("POST /api/control-plane/v1/engines/reconcile")?.({ ...reqBase, body: {} }, reconcileRes);
    expect(reconcileRes.statusCode).toBe(200);
    expect(reconcileRes.payload).toMatchObject({
      ok: true,
      reconciliation: {
        raw_transcript_read: false,
      },
    });

    const statusRes = createFakeResponse();
    await routes.get("GET /api/control-plane/v1/engines/status")?.({}, statusRes);
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.payload).toMatchObject({
      ok: true,
      engine_sync: {
        tables_exist: true,
        link_counts: { linked: 1 },
        app_server_poc: {
          approved: true,
          mode: "read-only-poc",
        },
      },
    });

    db.close();
    vi.restoreAllMocks();
  });
});
