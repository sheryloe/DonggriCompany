import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerCodexSubagentCatalogRoutes } from "./catalog-routes.ts";

type RouteHandler = (req: any, res: any) => any;

type FakeResponse = {
  statusCode: number;
  payload: unknown;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
};

const previousCatalogPath = process.env.CODEX_SUBAGENTS_CATALOG_PATH;
const tempRoots: string[] = [];

function createFakeResponse(): FakeResponse {
  return {
    statusCode: 200,
    payload: null,
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

function createHarness(): Map<string, RouteHandler> {
  const routes = new Map<string, RouteHandler>();
  const app = {
    get(routePath: string, handler: RouteHandler) {
      routes.set(`GET ${routePath}`, handler);
      return this;
    },
  };
  registerCodexSubagentCatalogRoutes({ app } as any);
  return routes;
}

afterEach(() => {
  for (const dir of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (previousCatalogPath === undefined) {
    delete process.env.CODEX_SUBAGENTS_CATALOG_PATH;
  } else {
    process.env.CODEX_SUBAGENTS_CATALOG_PATH = previousCatalogPath;
  }
});

describe("codex subagent catalog routes", () => {
  it("returns 503 when snapshot file is missing", () => {
    process.env.CODEX_SUBAGENTS_CATALOG_PATH = path.join(os.tmpdir(), `missing-${Date.now()}.json`);
    const routes = createHarness();
    const handler = routes.get("GET /api/subagents/catalog");
    expect(handler).toBeTypeOf("function");

    const res = createFakeResponse();
    handler?.({}, res);

    expect(res.statusCode).toBe(503);
    expect(res.payload).toMatchObject({ error: "codex_subagents_sync_needed" });
  });

  it("returns catalog with class stage fields", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-catalog-"));
    tempRoots.push(root);
    const snapshotPath = path.join(root, "catalog.json");
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify(
        {
          sourceRepo: "VoltAgent/awesome-codex-subagents",
          sourceRef: "main",
          sourceUrl: "https://github.com/VoltAgent/awesome-codex-subagents",
          generatedAt: "2026-04-14T00:00:00.000Z",
          total: 1,
          departmentSummary: { dev: 1 },
          agents: [
            {
              name: "backend-developer",
              description: "backend",
              upstreamCategory: "01-core-development",
              upstreamPath: "categories/01-core-development/backend-developer.toml",
              department: "dev",
              class_stage_1: "development-core",
              class_stage_2: "core-engineering",
              class_stage_3: "backend-developer",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    process.env.CODEX_SUBAGENTS_CATALOG_PATH = snapshotPath;

    const routes = createHarness();
    const handler = routes.get("GET /api/subagents/catalog");
    expect(handler).toBeTypeOf("function");

    const res = createFakeResponse();
    handler?.({}, res);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as { catalog: { agents: Array<Record<string, unknown>> } };
    expect(payload.catalog.agents).toHaveLength(1);
    expect(payload.catalog.agents[0].class_stage_1).toBe("development-core");
    expect(payload.catalog.agents[0].class_stage_2).toBe("core-engineering");
    expect(payload.catalog.agents[0].class_stage_3).toBe("backend-developer");
  });
});

