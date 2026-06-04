import { describe, expect, it } from "vitest";
import type { Agent, Department } from "../../types";
import { buildOfficeFloorPlan, estimateOfficeSceneWidth } from "./officeFloorPlan";

const departments: Department[] = [
  "planning",
  "development",
  "dev",
  "design",
  "quality",
  "qa",
  "operations",
  "instructor",
].map((id, index) => ({
  id,
  name: id,
  name_ko: id,
  icon: id.slice(0, 2).toUpperCase(),
  color: "#0ea5e9",
  description: null,
  prompt: null,
  sort_order: index + 1,
  created_at: 0,
}));

const agents: Agent[] = departments.map((department, index) => ({
  id: `agent-${department.id}`,
  name: `agent-${department.id}`,
  name_ko: `agent-${department.id}`,
  department_id: department.id,
  role: "senior",
  cli_provider: "codex",
  avatar_emoji: "AG",
  personality: null,
  status: index % 2 === 0 ? "working" : "idle",
  current_task_id: null,
  stats_tasks_done: 0,
  stats_xp: 0,
  created_at: 0,
}));

describe("8bit office floor plan", () => {
  it("places department aliases in office zones instead of overflow floors", () => {
    const layout = buildOfficeFloorPlan({ officeW: 1280, departments, agents });

    for (const id of ["planning", "development", "dev", "design", "quality", "qa", "operations", "instructor"]) {
      expect(layout.roomLayouts.has(id)).toBe(true);
      expect(layout.roomLayouts.get(id)?.floorLabel).not.toBe("확장 구역");
    }

    expect(layout.roomLayouts.get("development")?.floorId).toBe("production");
    expect(layout.roomLayouts.get("dev")?.floorId).toBe("production");
    expect(layout.roomLayouts.get("quality")?.floorId).toBe("quality");
    expect(layout.roomLayouts.get("qa")?.floorId).toBe("quality");
    expect(layout.roomLayouts.get("operations")?.floorId).toBe("quality");
    expect(layout.roomLayouts.get("instructor")?.floorId).toBe("quality");
  });

  it("uses readable office area labels and role activity spaces", () => {
    const layout = buildOfficeFloorPlan({ officeW: 1280, departments, agents });
    const visibleText = [
      ...layout.floorBands.flatMap((band) => [band.level, band.label]),
      ...Array.from(layout.roomLayouts.values()).map((room) => room.floorLabel),
      ...layout.sharedFacilities.map((facility) => facility.label),
      ...layout.roleSpaces.flatMap((space) => [space.label, space.caption]),
    ].join(" ");

    for (const removedLabel of ["1F", "RF", "2F", "3F", "4F"]) {
      expect(visibleText).not.toContain(removedLabel);
    }
    expect(visibleText).toContain("기억 서고");
    expect(visibleText).toContain("프로젝트 보드");
    expect(visibleText).toContain("검토/운영 구역");
    expect(visibleText).toContain("역할 활동 구역");
    expect(visibleText).toContain("업무 좌석");
    expect(visibleText).toContain("회의실");
    expect(visibleText).toContain("운영 코너");
    expect(visibleText).toContain("학습실");
  });

  it("keeps the office scene wide enough for pixel rooms and props", () => {
    expect(estimateOfficeSceneWidth({ viewportW: 960, departments })).toBeGreaterThanOrEqual(1180);
  });
});
