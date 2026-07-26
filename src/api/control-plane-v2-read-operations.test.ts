import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  activateCodexThread,
  applyControlPlaneSync,
  applyHarnessBlueprint,
  attachEngineThread,
  createControlPlanePersona,
  createEngineRun,
  decideControlPlanePersona,
  finishCodexThread,
  getAgentMemoryContext,
  prepareControlPlaneRun,
  previewControlPlaneSync,
  previewEngineRoute,
  previewHarnessBlueprint,
  reconcileEngineSync,
  rememberAgentMemory,
  saveHarnessBlueprintDraft,
  searchAgentMemoryFunctional,
  startControlPlaneRun,
} from "./control-plane";
import {
  CONTROL_PLANE_V2_READ_PATHS,
  previewControlPlaneSyncV2,
  previewEngineRouteV2,
  previewHarnessBlueprintV2,
  readAgentMemoryContextV2,
  searchAgentMemoryV2,
} from "./control-plane-v2-read-operations";
import { __resetApiRuntimeForTests } from "./core";

const SOURCE_EPOCH = `sha256:${"a".repeat(64)}`;
const PROJECTION_EPOCH = `sha256:${"b".repeat(64)}`;

function response(operation: string, result: unknown, overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      data: {
        operation,
        generated_at: "2026-07-25T01:02:03.000Z",
        source_epoch: SOURCE_EPOCH,
        projection_epoch: PROJECTION_EPOCH,
        writes: false,
        result,
        ...overrides,
      },
      request_id: "read-request-001",
      source_epoch: SOURCE_EPOCH,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

describe("Control Plane v2 read-operation API client", () => {
  beforeEach(() => {
    __resetApiRuntimeForTests();
    vi.restoreAllMocks();
  });

  it.each([
    [
      "memory.search",
      () => searchAgentMemoryV2({ query: "active spec", scope: "root" }),
      CONTROL_PLANE_V2_READ_PATHS.memorySearch,
      { query: "active spec", scope: "root" },
    ],
    [
      "memory.context",
      () => readAgentMemoryContextV2({ query: "handoff", project_key: "DonggriCompany" }),
      CONTROL_PLANE_V2_READ_PATHS.memoryContext,
      { query: "handoff", project_key: "DonggriCompany" },
    ],
    [
      "control-plane.sync.preview",
      () => previewControlPlaneSyncV2(),
      CONTROL_PLANE_V2_READ_PATHS.controlPlaneSyncPreview,
      {},
    ],
    [
      "engine.route.preview",
      () =>
        previewEngineRouteV2({
          objective: "Review",
          provider: "codex_exec",
          scope_type: "project",
          scope_value: "DonggriCompany",
        }),
      CONTROL_PLANE_V2_READ_PATHS.engineRoutePreview,
      {
        objective: "Review",
        provider: "codex_exec",
        scope_type: "project",
        scope_value: "DonggriCompany",
      },
    ],
    [
      "harness.blueprint.preview",
      () =>
        previewHarnessBlueprintV2({
          target_mode: "project",
          project_key: "DonggriCompany",
          objective: "Review",
          preferred_pattern: "producer-reviewer",
        }),
      CONTROL_PLANE_V2_READ_PATHS.harnessBlueprintPreview,
      {
        target_mode: "project",
        project_key: "DonggriCompany",
        objective: "Review",
        preferred_pattern: "producer-reviewer",
      },
    ],
  ] as const)("posts %s without approval, receipt, or Idempotency-Key", async (operation, invoke, path, body) => {
    const result = { ok: true, operation };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(operation, result));

    await expect(invoke()).resolves.toEqual(result);

    expect(fetchMock.mock.calls[0][0]).toBe(path);
    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(body);
    const headers = new Headers(init?.headers);
    expect(headers.has("Idempotency-Key")).toBe(false);
    expect(String(init?.body)).not.toContain("approval");
    expect(String(init?.body)).not.toContain("receipt");
    expect(String(init?.body)).not.toContain("confirmation");
  });

  it.each([
    [
      "memory.search",
      () => searchAgentMemoryFunctional({ query: "active spec", scope: "root" }),
      CONTROL_PLANE_V2_READ_PATHS.memorySearch,
    ],
    [
      "memory.context",
      () => getAgentMemoryContext({ query: "handoff", project_key: "DonggriCompany" }),
      CONTROL_PLANE_V2_READ_PATHS.memoryContext,
    ],
    [
      "control-plane.sync.preview",
      () => previewControlPlaneSync(),
      CONTROL_PLANE_V2_READ_PATHS.controlPlaneSyncPreview,
    ],
    [
      "engine.route.preview",
      () =>
        previewEngineRoute({
          objective: "Review",
          provider: "codex_exec",
          scope_type: "project",
          scope_value: "DonggriCompany",
        }),
      CONTROL_PLANE_V2_READ_PATHS.engineRoutePreview,
    ],
    [
      "harness.blueprint.preview",
      () =>
        previewHarnessBlueprint({
          target_mode: "project",
          project_key: "DonggriCompany",
          objective: "Review",
          preferred_pattern: "producer-reviewer",
        }),
      CONTROL_PLANE_V2_READ_PATHS.harnessBlueprintPreview,
    ],
  ] as const)("keeps the existing UI-facing %s caller on the documented v2 path", async (operation, invoke, path) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(operation, { ok: true }));

    await expect(invoke()).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe(path);
  });

  it.each([
    ["wrong operation", "memory.context", {}],
    ["source epoch drift", "memory.search", { source_epoch: `sha256:${"c".repeat(64)}` }],
    ["missing projection epoch", "memory.search", { projection_epoch: "" }],
    ["write marker", "memory.search", { writes: true }],
  ])("rejects an invalid read envelope: %s", async (_label, operation, overrides) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(operation, { ok: true }, overrides));

    await expect(searchAgentMemoryV2({ query: "active spec" })).rejects.toThrow(
      "control_plane_v2_read_envelope_invalid",
    );
  });

  it("keeps the remaining 13 mutation callers explicitly fail-closed", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const attempts = [
      () => rememberAgentMemory({ text: "summary", evidence_refs: ["EV-1"] }),
      () => applyControlPlaneSync(),
      () => createEngineRun({ objective: "Run", provider: "codex_exec" }),
      () => attachEngineThread({ external_thread_id: "thread-1" }),
      () => reconcileEngineSync(),
      () => activateCodexThread({ thread_id: "thread-1" }),
      () => finishCodexThread("run-1", {}),
      () => saveHarnessBlueprintDraft({ target_mode: "project", objective: "Draft" }),
      () => applyHarnessBlueprint("blueprint-1"),
      () => prepareControlPlaneRun({ department_agent: "IMPLEMENT", objective: "Run" }),
      () => startControlPlaneRun("run-1"),
      () => createControlPlanePersona("run-1", { parent_agent: "IMPLEMENT", objective: "Inspect" }),
      () => decideControlPlanePersona("persona-1", { decision: "reject" }),
    ];

    expect(attempts).toHaveLength(13);
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toThrow("legacy_v1_mutation_disabled");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
