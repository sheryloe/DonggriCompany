import { describe, expect, it } from "vitest";
import {
  AGENT_VISUAL_PROFILE_SEEDS,
  LEGACY_DEPARTMENT_ID_MAP,
  ORGANIZATION_AGENT_SEEDS,
  ORGANIZATION_DEPARTMENTS,
  ORGANIZATION_MANIFEST_SCOPE,
  RESERVE_VISUAL_PROFILE_POLICY,
  buildSeedAgentProfile,
  mapLegacyDepartmentId,
} from "./organization-manifest.ts";

describe("organization manifest v5", () => {
  it("labels organization staffing as separate from Ver.1 SDD department agents", () => {
    expect(ORGANIZATION_MANIFEST_SCOPE).toBe("business-staffing-projection-not-sdd-department-agents");
    expect(ORGANIZATION_DEPARTMENTS.map((department) => department.id)).not.toEqual([
      "CONTROL",
      "SPEC",
      "EXPLORE",
      "IMPLEMENT",
      "REVIEW",
      "OPS",
    ]);
  });

  it("uses exactly eight canonical departments with PMO one-person command and three staff elsewhere", () => {
    expect(ORGANIZATION_DEPARTMENTS.map((department) => department.id)).toEqual([
      "pmo",
      "planning",
      "dev",
      "design",
      "qa",
      "devsecops",
      "operations",
      "strategic_maintenance",
    ]);
    expect(ORGANIZATION_AGENT_SEEDS).toHaveLength(22);

    const counts = new Map<string, number>();
    for (const seed of ORGANIZATION_AGENT_SEEDS) {
      const departmentId = mapLegacyDepartmentId(seed.department_id);
      counts.set(departmentId ?? "", (counts.get(departmentId ?? "") ?? 0) + 1);
      expect(seed.role).not.toBe("junior");
      expect(seed.department_id).toBe(departmentId);
    }

    expect(Object.fromEntries([...counts.entries()].sort())).toEqual({
      design: 3,
      dev: 3,
      devsecops: 3,
      operations: 3,
      planning: 3,
      pmo: 1,
      qa: 3,
      strategic_maintenance: 3,
    });
  });

  it("keeps legacy aliases as read compatibility only", () => {
    expect(LEGACY_DEPARTMENT_ID_MAP.management).toBe("operations");
    expect(LEGACY_DEPARTMENT_ID_MAP["api-research"]).toBe("operations");
    expect(LEGACY_DEPARTMENT_ID_MAP.development).toBe("dev");
  });

  it("defines visual profiles and stores subagent supervision in canonical profile data", () => {
    expect(AGENT_VISUAL_PROFILE_SEEDS).toHaveLength(35);
    expect(AGENT_VISUAL_PROFILE_SEEDS.filter((profile) => profile.status === "active")).toHaveLength(22);
    expect(AGENT_VISUAL_PROFILE_SEEDS.filter((profile) => profile.status === "reserve")).toHaveLength(13);
    expect(RESERVE_VISUAL_PROFILE_POLICY).toMatchObject({
      status: "reserve_until_approved",
      approval_gate: "ceo_or_pmo",
      active_staff_profile_limit: 22,
    });

    const devLead = ORGANIZATION_AGENT_SEEDS.find((seed) => seed.id === "seed-dev-lead");
    expect(devLead).toBeTruthy();
    const profile = buildSeedAgentProfile(devLead!);
    expect(profile).toMatchObject({
      visual_profile_key: "agent-visual-11",
      preferred_subagents: ["backend-developer", "frontend-developer", "typescript-pro", "database-optimizer"],
    });
  });
});
