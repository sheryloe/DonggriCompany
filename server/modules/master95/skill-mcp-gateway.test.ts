import { describe, expect, it } from "vitest";
import { Master95McpGateway, createMaster95DefaultSkillRegistry } from "./skill-mcp-gateway.ts";

const request = (overrides = {}) => ({
  skill_id: "routing.preview",
  agent_id: "OPS" as const,
  project_id: "project:BloggerGent",
  trace_id: "trace:mcp:test",
  input: { lane_id: "google-travel-en" },
  estimated_cost: 0,
  ...overrides,
});

describe("Master95 Skill Registry and MCP Gateway", () => {
  it("lists versioned Tools, Resources, and Prompts", () => {
    const gateway = new Master95McpGateway(createMaster95DefaultSkillRegistry());
    expect(gateway.listTools()).toHaveLength(6);
    expect(gateway.listResources()).toHaveLength(1);
    expect(gateway.listPrompts()).toHaveLength(1);
  });

  it("completes an allowed registered Skill", async () => {
    const gateway = new Master95McpGateway(createMaster95DefaultSkillRegistry());
    gateway.registerHandler("routing.preview", async (input) => ({ ok: true, ...input }));
    await expect(gateway.callTool(request())).resolves.toMatchObject({
      status: "completed",
      reason_code: "skill_completed",
    });
  });

  it("blocks unregistered, wrong Agent, wrong Project, and over-cost calls", async () => {
    const gateway = new Master95McpGateway(createMaster95DefaultSkillRegistry());
    await expect(gateway.callTool(request({ skill_id: "unknown" }))).resolves.toMatchObject({
      status: "block",
      reason_code: "skill_not_registered",
    });
    await expect(
      gateway.callTool(request({ skill_id: "repo.patch", agent_id: "OPS", approval_id: "APR-1" })),
    ).resolves.toMatchObject({ status: "block", reason_code: "agent_not_allowed" });
    await expect(
      gateway.callTool(
        request({
          skill_id: "repo.patch",
          agent_id: "IMPLEMENT",
          project_id: "project:BloggerGent",
          approval_id: "APR-1",
        }),
      ),
    ).resolves.toMatchObject({ status: "block", reason_code: "project_not_allowed" });
    await expect(gateway.callTool(request({ estimated_cost: 2 }))).resolves.toMatchObject({
      status: "block",
      reason_code: "cost_limit_exceeded",
    });
  });

  it("requires approval for high-risk Skills", async () => {
    const gateway = new Master95McpGateway(createMaster95DefaultSkillRegistry());
    await expect(
      gateway.callTool(
        request({ skill_id: "repo.patch", agent_id: "IMPLEMENT", project_id: "project:DonggriCompany" }),
      ),
    ).resolves.toMatchObject({ status: "approval_required", reason_code: "approval_id_required" });
  });

  it("supports cancellation before handler execution", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const gateway = new Master95McpGateway(createMaster95DefaultSkillRegistry());
    gateway.registerHandler("routing.preview", async () => {
      calls += 1;
      return {};
    });
    await expect(gateway.callTool(request({ signal: controller.signal }))).resolves.toMatchObject({
      status: "canceled",
    });
    expect(calls).toBe(0);
  });

  it("opens a per-Skill circuit after three failures without affecting another Skill", async () => {
    const gateway = new Master95McpGateway(createMaster95DefaultSkillRegistry());
    gateway.registerHandler("routing.preview", async () => {
      throw new Error("provider_down");
    });
    for (let index = 0; index < 3; index += 1) {
      await expect(gateway.callTool(request())).resolves.toMatchObject({
        status: "failed",
        reason_code: "provider_down",
      });
    }
    await expect(gateway.callTool(request())).resolves.toMatchObject({
      status: "block",
      reason_code: "skill_circuit_open",
    });
    gateway.registerHandler("control-plane.read", async () => ({ healthy: true }));
    await expect(
      gateway.callTool(request({ skill_id: "control-plane.read", agent_id: "CONTROL" })),
    ).resolves.toMatchObject({ status: "completed" });
  });
});
