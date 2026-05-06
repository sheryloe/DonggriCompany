import { describe, expect, it } from "vitest";
import type { Agent, Department } from "../../types";
import { buildOfficeFloorPlan, estimateOfficeSceneWidth } from "./officeFloorPlan";

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
  Array.from({ length: department.id === "pmo" ? 1 : 3 }, (_, index) => ({
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
    const officeW = estimateOfficeSceneWidth({ viewportW: 980, departments });
    const plan = buildOfficeFloorPlan({ officeW, departments, agents });

    expect(plan.floorBands.map((floor) => `${floor.level} ${floor.label}`)).toEqual([
      "1F 공용층",
      "RF 옥상층",
      "2F 전략층",
      "3F 제작층",
      "4F 품질/운영층",
    ]);
    expect([...plan.roomLayouts.keys()].sort()).toEqual(departments.map((department) => department.id).sort());
    expect(plan.roomLayouts.get("pmo")?.floorId).toBe("strategy");
    expect(plan.roomLayouts.get("dev")?.floorId).toBe("production");
    expect(plan.roomLayouts.get("operations")?.floorId).toBe("quality");
    expect(plan.sharedFacilities.map((facility) => facility.id)).toEqual([
      "lobby",
      "break",
      "study",
      "after-hours",
      "smoking",
      "roof-garden",
      "roof-lounge",
    ]);
    expect(plan.sharedFacilities.find((facility) => facility.id === "smoking")?.label).toBe("흡연실");
    expect(plan.transportCore?.h).toBeGreaterThan(700);
  });

  it("keeps the three-department quality floor wide instead of squeezing rooms", () => {
    const officeW = estimateOfficeSceneWidth({ viewportW: 390, departments });
    const plan = buildOfficeFloorPlan({ officeW, departments, agents });
    const qualityRooms = ["qa", "devsecops", "operations"].map((id) => plan.roomLayouts.get(id));

    expect(officeW).toBeGreaterThan(1000);
    for (const room of qualityRooms) {
      expect(room?.floorId).toBe("quality");
      expect(room?.w).toBeGreaterThanOrEqual(304);
    }
    expect(qualityRooms[0]!.x + qualityRooms[0]!.w).toBeLessThan(qualityRooms[1]!.x);
    expect(qualityRooms[1]!.x + qualityRooms[1]!.w).toBeLessThan(qualityRooms[2]!.x);
  });
});
