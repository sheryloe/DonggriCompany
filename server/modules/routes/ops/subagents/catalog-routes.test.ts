import { describe, expect, it } from "vitest";
import { registerCodexSubagentCatalogRoutes } from "./catalog-routes.ts";

type RouteHandler = (req: any, res: any) => any;

type FakeResponse = {
  statusCode: number;
  payload: unknown;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
};

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

describe("codex subagent catalog routes", () => {
  it("returns catalog with canonical family assignments", () => {
    const routes = createHarness();
    const handler = routes.get("GET /api/subagents/catalog");
    expect(handler).toBeTypeOf("function");

    const res = createFakeResponse();
    handler?.({}, res);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as { catalog: { agents: Array<Record<string, unknown>> } };
    expect(payload.catalog.agents.length).toBeGreaterThan(100);
    const backendDeveloper = payload.catalog.agents.find((item) => item.name === "backend-developer");
    expect(backendDeveloper).toMatchObject({
      class_stage_1: "development-core",
      class_stage_2: "core-engineering",
      class_stage_3: "backend-developer",
      family: "backend",
    });
  });
});
