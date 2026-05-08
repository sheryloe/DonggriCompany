import { describe, expect, it } from "vitest";
import type { Department } from "../types";
import {
  buildOfficePackPresentation,
  buildOfficePackStarterAgents,
  resolveOfficePackSeedProvider,
} from "./office-workflow-pack";

function makeDepartment(id: string): Department {
  return {
    id,
    name: id.toUpperCase(),
    name_ko: `${id}-ko`,
    name_ja: `${id}-ja`,
    name_zh: `${id}-zh`,
    icon: "📦",
    color: "#64748b",
    description: null,
    prompt: null,
    sort_order: 1,
    created_at: 1,
  };
}

describe("buildOfficePackStarterAgents", () => {
  it("returns no starter agents for development pack", () => {
    const starters = buildOfficePackStarterAgents({
      packKey: "development",
      departments: [makeDepartment("planning"), makeDepartment("dev")],
    });
    expect(starters).toHaveLength(0);
  });

  it("creates default leads and members for report pack", () => {
    const starters = buildOfficePackStarterAgents({
      packKey: "report",
      departments: [
        makeDepartment("planning"),
        makeDepartment("dev"),
        makeDepartment("design"),
        makeDepartment("qa"),
        makeDepartment("operations"),
      ],
      targetCount: 8,
    });

    expect(starters.length).toBeGreaterThanOrEqual(8);
    const leaderCount = starters.filter((agent) => agent.role === "team_leader").length;
    expect(leaderCount).toBeGreaterThanOrEqual(4);
    expect(starters.every((agent) => !!agent.department_id)).toBe(true);
  });

  it("creates at least 12 starter agents for donggri pack", () => {
    const starters = buildOfficePackStarterAgents({
      packKey: "donggri",
      departments: [
        makeDepartment("planning"),
        makeDepartment("dev"),
        makeDepartment("design"),
        makeDepartment("qa"),
        makeDepartment("operations"),
        makeDepartment("devsecops"),
      ],
    });
    expect(starters.length).toBeGreaterThanOrEqual(12);
  });

  it("assigns codex-main to Codex starter agents and leaves non-Codex agents unlocked", () => {
    const starters = buildOfficePackStarterAgents({
      packKey: "donggri",
      departments: [
        makeDepartment("planning"),
        makeDepartment("dev"),
        makeDepartment("design"),
        makeDepartment("qa"),
        makeDepartment("operations"),
        makeDepartment("devsecops"),
      ],
    });
    expect(starters.some((agent) => agent.cli_provider === "codex")).toBe(true);
    expect(
      starters.filter((agent) => agent.cli_provider === "codex").every((agent) => agent.cli_account_pool_id === "codex-main"),
    ).toBe(true);
    expect(
      starters.filter((agent) => agent.cli_provider !== "codex").every((agent) => agent.cli_account_pool_id === null),
    ).toBe(true);
  });

  it("generates locale-aware personality text", () => {
    const startersEn = buildOfficePackStarterAgents({
      packKey: "report",
      departments: [makeDepartment("planning"), makeDepartment("dev"), makeDepartment("design"), makeDepartment("qa")],
      targetCount: 4,
      locale: "en",
    });
    expect(startersEn.some((agent) => (agent.personality ?? "").includes("Prioritizes evidence quality"))).toBe(true);

    const startersJa = buildOfficePackStarterAgents({
      packKey: "report",
      departments: [makeDepartment("planning"), makeDepartment("dev"), makeDepartment("design"), makeDepartment("qa")],
      targetCount: 4,
      locale: "ja",
    });
    expect(startersJa.some((agent) => !!agent.personality && agent.personality.length > 0)).toBe(true);
  });

  it("tracks per-department seed order", () => {
    const starters = buildOfficePackStarterAgents({
      packKey: "report",
      departments: [makeDepartment("planning"), makeDepartment("dev"), makeDepartment("design"), makeDepartment("qa")],
      targetCount: 8,
    });
    const planningOrders = starters
      .filter((agent) => agent.department_id === "planning")
      .map((agent) => agent.seed_order_in_department);
    expect(planningOrders.length).toBeGreaterThan(1);
    expect(planningOrders[0]).toBe(1);
    expect(planningOrders[1]).toBe(2);
  });

  it("assigns unique sprite numbers", () => {
    const starters = buildOfficePackStarterAgents({
      packKey: "video_preprod",
      departments: [
        makeDepartment("planning"),
        makeDepartment("dev"),
        makeDepartment("design"),
        makeDepartment("qa"),
        makeDepartment("operations"),
        makeDepartment("devsecops"),
      ],
      targetCount: 10,
    });
    const spriteNumbers = starters.map((agent) => agent.sprite_number);
    const unique = new Set(spriteNumbers);
    expect(unique.size).toBe(spriteNumbers.length);
  });
});

describe("resolveOfficePackSeedProvider", () => {
  it("alternates claude/codex for planning", () => {
    expect(
      resolveOfficePackSeedProvider({
        packKey: "report",
        departmentId: "planning",
        role: "team_leader",
        seedIndex: 1,
        seedOrderInDepartment: 1,
      }),
    ).toBe("claude");
    expect(
      resolveOfficePackSeedProvider({
        packKey: "report",
        departmentId: "planning",
        role: "senior",
        seedIndex: 5,
        seedOrderInDepartment: 2,
      }),
    ).toBe("codex");
  });

  it("uses claude for dev/design and codex for others", () => {
    expect(
      resolveOfficePackSeedProvider({ packKey: "report", departmentId: "dev", role: "senior", seedIndex: 2 }),
    ).toBe("claude");
    expect(
      resolveOfficePackSeedProvider({ packKey: "report", departmentId: "design", role: "senior", seedIndex: 3 }),
    ).toBe("claude");
    expect(
      resolveOfficePackSeedProvider({ packKey: "report", departmentId: "devsecops", role: "senior", seedIndex: 4 }),
    ).toBe("codex");
    expect(
      resolveOfficePackSeedProvider({ packKey: "report", departmentId: "operations", role: "senior", seedIndex: 5 }),
    ).toBe("codex");
    expect(resolveOfficePackSeedProvider({ packKey: "report", departmentId: "qa", role: "senior", seedIndex: 6 })).toBe(
      "codex",
    );
  });
});

describe("buildOfficePackPresentation", () => {
  it("applies locale-aware department description and prompt", () => {
    const presentationEn = buildOfficePackPresentation({
      packKey: "report",
      locale: "en",
      departments: [makeDepartment("planning")],
      agents: [],
      customRoomThemes: {},
    });
    expect(presentationEn.departments[0]?.description).toContain("team");
    expect(presentationEn.departments[0]?.prompt).toContain("[Department Role]");

    const presentationKo = buildOfficePackPresentation({
      packKey: "report",
      locale: "ko",
      departments: [makeDepartment("planning")],
      agents: [],
      customRoomThemes: {},
    });
    expect(presentationKo.departments[0]?.description).toContain("작업");
    expect(presentationKo.departments[0]?.prompt).toContain("[부서 역할]");
  });
});
