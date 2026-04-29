import { describe, expect, it } from "vitest";
import { registerGoalCommandRoutes } from "./goal-commands.ts";

type RouteHandler = (req: any, res: any) => any;

function createFakeResponse() {
  return {
    payload: null as unknown,
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

describe("goal command routes", () => {
  it("returns canonical goal command presets", () => {
    const routes = new Map<string, RouteHandler>();
    const app = {
      get(path: string, handler: RouteHandler) {
        routes.set(`GET ${path}`, handler);
        return this;
      },
    };
    registerGoalCommandRoutes({ app: app as any });

    const res = createFakeResponse();
    routes.get("GET /api/goal-commands")?.({}, res);

    const payload = res.payload as { version: string; commands: Array<{ key: string; slashCommand: string }> };
    expect(payload.version).toBe("donggri_goal_commands_v1");
    expect(payload.commands).toHaveLength(10);
    expect(payload.commands[0]).toMatchObject({ key: "feature", slashCommand: "/dg-feature" });
  });
});
