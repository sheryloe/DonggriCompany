import { describe, expect, it } from "vitest";
import {
  MASTER95_BLOGGERGENT_ROLE_AGENTS,
  MASTER95_DEFAULT_PROJECT_MANIFESTS,
  MASTER95_NAMESPACE_KINDS,
  Master95ProjectRegistry,
  createMaster95DefaultProjectRegistry,
} from "./project-registry.ts";

describe("Master95 Project Registry and isolation", () => {
  it("registers three projects with unique six-kind namespaces", () => {
    const registry = createMaster95DefaultProjectRegistry();
    expect(registry.list()).toHaveLength(3);
    const namespaces = registry.list().flatMap((project) => Object.values(project.namespaces));
    expect(new Set(namespaces).size).toBe(18);
  });

  it("rejects every run that omits or invents project identity", () => {
    const registry = createMaster95DefaultProjectRegistry();
    expect(() => registry.createRunScope({ run_id: "run-1", trace_id: "trace-1" })).toThrow("project_id_required");
    expect(() =>
      registry.createRunScope({ project_id: "project:Unknown", run_id: "run-1", trace_id: "trace-1" }),
    ).toThrow("project_not_registered");
  });

  it("denies every cross-project access pair across every namespace kind", () => {
    const registry = createMaster95DefaultProjectRegistry();
    for (const requester of registry.list()) {
      for (const resource of registry.list()) {
        for (const kind of MASTER95_NAMESPACE_KINDS) {
          const decision = registry.authorizeAccess({
            requester_project_id: requester.project_id,
            resource_project_id: resource.project_id,
            namespace_kind: kind,
            namespace_value: resource.namespaces[kind],
          });
          expect(decision.decision).toBe(requester.project_id === resource.project_id ? "allow" : "block");
          if (requester.project_id !== resource.project_id)
            expect(decision.reason_code).toBe("cross_project_access_denied");
        }
      }
    }
  });

  it("rejects same-project namespace spoofing", () => {
    const registry = createMaster95DefaultProjectRegistry();
    expect(
      registry.authorizeAccess({
        requester_project_id: "project:BloggerGent",
        resource_project_id: "project:BloggerGent",
        namespace_kind: "memory",
        namespace_value: "project:DonggriCompany:memory",
      }),
    ).toMatchObject({ decision: "block", reason_code: "namespace_mismatch" });
  });

  it("projects BloggerGent under OPS with seven role agents and eight operating lanes", () => {
    const registry = createMaster95DefaultProjectRegistry();
    const project = registry.require("project:BloggerGent");
    expect(project.display_name).toBe("BloggerGent Project Scope");
    expect(project.owner_department).toBe("OPS");
    expect(project.implementation_delegate).toBe("IMPLEMENT");
    expect(project.lanes).toHaveLength(8);
    expect(new Set(project.lanes.map((lane) => lane.role_agent))).toEqual(new Set(MASTER95_BLOGGERGENT_ROLE_AGENTS));
    expect(project.lanes.find((lane) => lane.lane_id === "mystery-cloudflare")).toMatchObject({
      role_agent: "cloudflare-archive",
      metadata_tags: ["cloudflare:dongriarchive:mystery"],
    });
    expect(project.lanes.every((lane) => lane.operating_mode === "dry-run")).toBe(true);
  });

  it("blocks role agents from entering another BloggerGent lane", () => {
    const registry = createMaster95DefaultProjectRegistry();
    expect(
      registry.authorizeLane({
        project_id: "project:BloggerGent",
        lane_id: "google-travel-en",
        role_agent: "blogger-travel-es",
      }),
    ).toMatchObject({
      decision: "block",
      reason_code: "lane_role_mismatch",
    });
    expect(
      registry.authorizeLane({
        project_id: "project:BloggerGent",
        lane_id: "mystery-cloudflare",
        role_agent: "cloudflare-archive",
      }),
    ).toMatchObject({
      decision: "allow",
      reason_code: "lane_role_authorized",
    });
  });

  it("rejects duplicate projects and invalid namespace contracts", () => {
    const registry = new Master95ProjectRegistry();
    const project = MASTER95_DEFAULT_PROJECT_MANIFESTS[0];
    registry.register(project);
    expect(() => registry.register(project)).toThrow("project_already_registered");
    expect(() =>
      registry.register({
        ...MASTER95_DEFAULT_PROJECT_MANIFESTS[1],
        namespaces: { ...MASTER95_DEFAULT_PROJECT_MANIFESTS[1].namespaces, memory: "project:DonggriCompany:memory" },
      }),
    ).toThrow();
  });
});
