import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AgentMonitorEntry } from "../board/scene-types";
import { AgentMonitorGrid } from "./AgentMonitorGrid";

const entries: AgentMonitorEntry[] = [
  {
    id: "main",
    name: "Main",
    role: "Lead Agent",
    roleLabel: "리드 에이전트",
    stateLabel: "작업 중",
    fatigue: 78,
    usagePercent: 64,
    modelLabel: "CODEX / codex-main-a",
    locationLabel: "작업 구역",
    spriteId: "char_0",
    animState: "walk"
  }
];

describe("AgentMonitorGrid", () => {
  it("renders compact monitor cards with usage + fatigue", () => {
    render(<AgentMonitorGrid entries={entries} providerLabel="CODEX / codex-main-a" />);

    const grid = screen.getByTestId("center-agent-monitor-grid");
    const card = within(grid).getByTestId("center-agent-monitor-card");

    expect(card.className).toContain("office-monitor-card");
    expect(within(card).getByText("Main")).not.toBeNull();
    expect(within(card).getByText("리드 에이전트")).not.toBeNull();
    expect(within(card).getByText("작업 중")).not.toBeNull();
    expect(within(card).getByText("64%")).not.toBeNull();
    expect(within(card).getByText("78% | Critical")).not.toBeNull();
    expect(within(card).getByText("CODEX / codex-main-a")).not.toBeNull();
    expect(within(card).getByText("작업 구역")).not.toBeNull();
    expect(within(card).getByRole("progressbar", { name: "Usage" }).getAttribute("aria-valuenow")).toBe("64");
  });
});
