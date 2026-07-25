import { describe, expect, it } from "vitest";
import {
  MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS,
  Master95AgentVersionRegistry,
  createMaster95DefaultAgentRegistry,
} from "./agent-registry.ts";

const change = (reason = "test change") => ({
  actor_agent_id: "CONTROL" as const,
  trace_id: "trace:agent-registry:test",
  reason,
  occurred_at: "2026-07-14T01:00:00+09:00",
});

describe("Master95 Agent Version Registry", () => {
  it("registers and activates six immutable canonical manifests", () => {
    const registry = createMaster95DefaultAgentRegistry();
    expect(registry.listRecords()).toHaveLength(6);
    expect(registry.listRecords().every((record) => record.lifecycle === "active")).toBe(true);
    const manifest = registry.getManifest("IMPLEMENT", "1.0.0");
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest?.allowed_skills)).toBe(true);
  });

  it("rejects invalid, duplicate, and permission-overlap manifests", () => {
    const registry = new Master95AgentVersionRegistry();
    const manifest = MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS[0];
    registry.register(manifest, "trace:register");
    expect(() => registry.register(manifest, "trace:duplicate")).toThrow("agent_version_already_registered");
    expect(() =>
      registry.register(
        {
          ...manifest,
          version: "1.0",
          manifest_id: "bad",
          allowed_skills: ["repo.write"],
          denied_skills: ["repo.write"],
        },
        "trace:bad",
      ),
    ).toThrow();
  });

  it("blocks execution when no manifest or no active version exists", () => {
    const empty = new Master95AgentVersionRegistry();
    for (const manifest of MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS) {
      expect(empty.authorizeExecution(requestFor(manifest))).toMatchObject({
        decision: "block",
        reason_code: "manifest_missing",
      });
    }

    const candidate = new Master95AgentVersionRegistry();
    candidate.register(
      MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS.find((item) => item.agent_id === "IMPLEMENT"),
      "trace:candidate",
    );
    expect(candidate.authorizeExecution(request())).toMatchObject({
      decision: "block",
      reason_code: "manifest_version_not_active",
    });
  });

  it("blocks every unlisted project, skill, tool, and operation fixture across all departments", () => {
    const registry = createMaster95DefaultAgentRegistry();
    for (const manifest of MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS) {
      const valid = requestFor(manifest);
      expect(registry.authorizeExecution(valid)).toMatchObject({
        decision: "allow",
        reason_code: "authorized_by_active_manifest",
        version: "1.0.0",
      });
      expect(registry.authorizeExecution({ ...valid, skill_id: manifest.denied_skills[0] })).toMatchObject({
        decision: "block",
        reason_code: "skill_denied",
      });
      expect(registry.authorizeExecution({ ...valid, skill_id: "unknown.skill" })).toMatchObject({
        decision: "block",
        reason_code: "skill_not_allowed",
      });
      expect(registry.authorizeExecution({ ...valid, tool_id: "unknown.tool" })).toMatchObject({
        decision: "block",
        reason_code: "tool_not_allowed",
      });
      expect(registry.authorizeExecution({ ...valid, operation_class: "deploy" })).toMatchObject({
        decision: "block",
        reason_code: "operation_not_allowed",
      });
      expect(registry.authorizeExecution({ ...valid, project_id: "workspace:unscoped" })).toMatchObject({
        decision: "block",
        reason_code: "project_not_allowed",
      });
    }
  });

  it("requires CONTROL authority for activate, revoke, and rollback", () => {
    const registry = createMaster95DefaultAgentRegistry();
    const v2 = {
      ...MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS.find((item) => item.agent_id === "IMPLEMENT")!,
      manifest_id: "manifest:implement:1.1.0",
      version: "1.1.0",
      rollback_target_version: "1.0.0",
    };
    registry.register(v2, "trace:v2");
    expect(() => registry.activate("IMPLEMENT", "1.1.0", { ...change(), actor_agent_id: "OPS" })).toThrow(
      "control_authority_required",
    );
    registry.activate("IMPLEMENT", "1.1.0", change("activate v2"));
    expect(registry.getActiveVersion("IMPLEMENT")).toBe("1.1.0");
    registry.rollback("IMPLEMENT", "1.0.0", change("rollback v2"));
    expect(registry.getActiveVersion("IMPLEMENT")).toBe("1.0.0");
    expect(
      registry
        .listEvents()
        .some((event) => event.event_type === "agent.version.rolled_back" && event.previous_version === "1.1.0"),
    ).toBe(true);
  });

  it("never reactivates a revoked version", () => {
    const registry = createMaster95DefaultAgentRegistry();
    const v2 = {
      ...MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS.find((item) => item.agent_id === "IMPLEMENT")!,
      manifest_id: "manifest:implement:1.1.0-revoke-test",
      version: "1.1.0",
      rollback_target_version: "1.0.0",
    };
    registry.register(v2, "trace:v2-revoke-test");
    registry.activate("IMPLEMENT", "1.1.0", change("activate v2 before revoke"));
    registry.revoke("IMPLEMENT", "1.0.0", change("security revoke"));
    expect(() => registry.activate("IMPLEMENT", "1.0.0", change())).toThrow("revoked_agent_version_cannot_activate");
    expect(() => registry.rollback("IMPLEMENT", "1.0.0", change("invalid rollback"))).toThrow(
      "rollback_target_revoked",
    );
    expect(registry.authorizeExecution(request({ version: "1.0.0" }))).toMatchObject({
      decision: "block",
      reason_code: "manifest_version_not_active",
    });
  });

  it("enforces step, handoff, timeout, and evidence termination conditions", () => {
    const registry = createMaster95DefaultAgentRegistry();
    expect(
      registry.evaluateLimits("IMPLEMENT", "1.0.0", {
        steps: 120,
        handoffs: 8,
        elapsed_seconds: 3600,
        evidence_refs: ["EV-1"],
      }),
    ).toEqual({ allowed: true, violations: [] });
    expect(
      registry.evaluateLimits("IMPLEMENT", "1.0.0", {
        steps: 121,
        handoffs: 9,
        elapsed_seconds: 3601,
        evidence_refs: [],
      }),
    ).toEqual({
      allowed: false,
      violations: ["max_steps_exceeded", "max_handoffs_exceeded", "timeout_exceeded", "evidence_required"],
    });
  });
});

function request(overrides = {}) {
  return {
    agent_id: "IMPLEMENT" as const,
    project_id: "project:DonggriCompany",
    skill_id: "repo.write",
    tool_id: "repo.patch",
    operation_class: "write_repo_code" as const,
    ...overrides,
  };
}

function requestFor(manifest: (typeof MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS)[number]) {
  return {
    agent_id: manifest.agent_id,
    project_id: "project:DonggriCompany",
    skill_id: manifest.allowed_skills[0],
    tool_id: manifest.allowed_tools[0],
    operation_class: manifest.allowed_operations[0],
  };
}
