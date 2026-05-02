import { describe, expect, it } from "vitest";
import type { Agent, Department } from "../../types";
import { buildOfficeFloorPlan } from "./officeFloorPlan";

const departments: Department[] = ["pmo", "planning", "dev", "design", "qa", "devsecops", "operations"].map(
  (id, index) => ({
    id,
    name: id,
    name_ko: id,
    icon: id.toUpperCase(),
    color: "#000000",
    description: null,
    prompt: null,
    sort_order: index + 1,
    created_at: 0,
  }),
);

const agents: Agent[] = departments.flatMap((department) =>
  Array.from({ length: 3 }, (_, index) => ({
    id: `${department.id}-${index + 1}`,
    name: `${department.id}-${index + 1}`,
    name_ko: `${department.id}-${index + 1}`,
    department_id: department.id,
    role: index === 0 ? "team_leader" : "senior",
    cli_provider: "codex",
    avatar_emoji: "AG",
    personality: null,
    status: "idle",
    current_task_id: null,
    stats_tasks_done: 0,
    stats_xp: 0,
    created_at: 0,
  })),
);

describe("buildOfficeFloorPlan", () => {
  it("places seven canonical departments into four office floors", () => {
    const plan = buildOfficeFloorPlan({ officeW: 980, departments, agents });

    expect(plan.floorBands.map((floor) => `${floor.level} ${floor.label}`)).toEqual([
      "1F 공용층",
      "2F 전략층",
      "3F 제작층",
      "4F 품질/운영층",
    ]);
    expect([...plan.roomLayouts.keys()].sort()).toEqual(departments.map((department) => department.id).sort());
    expect(plan.roomLayouts.get("pmo")?.floorId).toBe("strategy");
    expect(plan.roomLayouts.get("dev")?.floorId).toBe("production");
    expect(plan.roomLayouts.get("operations")?.floorId).toBe("quality");
    expect(plan.sharedFacilities.map((facility) => facility.id)).toEqual(["lobby", "break", "study", "after-hours"]);
  });
});
