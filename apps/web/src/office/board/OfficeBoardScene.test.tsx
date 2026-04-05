import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { OfficeBoardScene } from "./OfficeBoardScene";
import { ROOM_LAYOUT_STORAGE_KEY } from "./office-tilemap";
import type { AgentWorkLoopState } from "./scene-types";

const renderScene = (loopState: AgentWorkLoopState = "idle") =>
  render(
    <OfficeBoardScene
      accountPoolZone={<div>pool-zone</div>}
      runtimeProfileZone={<div>runtime-zone</div>}
      probeMonitorZone={<div>probe-zone</div>}
      historyBoardZone={<div>history-zone</div>}
      sceneSync={{
        loopState,
        lastLoopEvent:
          loopState === "blocked"
            ? { type: "probeError", atTick: 12, source: "system", phase: "committed", detail: "probe-state=error" }
            : null,
        activeAgents: 7,
        actors: [],
        agentLoadById: {},
        selectedProvider: "codex",
        selectedPoolKey: "codex-plus-main",
        selectedProfileKey: "codex-plus-main-a",
        probeState: "success",
        lastActionAt: "test",
        kpi: {
          throughput: 3,
          queueDepth: 5,
          slaRisk: "low",
          probeConfidence: "high",
          avgAgentLoad: 23.4
        },
        simSpeed: "1x",
        isPaused: false
      }}
      agentName="CODEX Agent"
      emphasisTarget="none"
    />
  );

describe("OfficeBoardScene room editor", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps fallback renderer active in jsdom without breaking controls", () => {
    renderScene();

    expect(screen.getByText("Pixi renderer unavailable. Using fallback room map.")).not.toBeNull();
    expect(screen.getByText(/mode=select loop=Idle probe=/i)).not.toBeNull();
    expect(screen.getByText("Room Editor")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Zoom/i })).toBeNull();
    expect(document.querySelector(".office-board-map-scroll")?.getAttribute("data-pan-enabled")).toBe("true");
    const fallbackItem = document.querySelector(".office-map-fallback-item") as HTMLElement | null;
    expect(fallbackItem?.style.backgroundColor ?? "").toBe("");
  });

  it("does not render the legacy bottom actor status grid", () => {
    renderScene();
    expect(screen.queryByRole("heading", { name: "Agent Status" })).toBeNull();
  });

  it("keeps fallback renderer stable on blocked loop state", () => {
    renderScene("blocked");
    expect(screen.getByText(/mode=select loop=Blocked probe=/i)).not.toBeNull();
    expect(screen.getByText(/event=probeError:committed:probe-state=error/i)).not.toBeNull();
    expect(screen.getByText(/Rook \(Blocked\)/i)).not.toBeNull();
  });

  it("adds a new room item after opening the compact editor", async () => {
    const user = userEvent.setup();
    renderScene();

    await user.click(screen.getByText("Room Editor"));
    const before = screen.getAllByRole("button", { name: /Room item /i }).length;
    await user.click(screen.getByRole("button", { name: "Add Asset" }));
    const after = screen.getAllByRole("button", { name: /Room item /i }).length;

    expect(after).toBe(before + 1);
  });

  it("removes selected room item", async () => {
    const user = userEvent.setup();
    renderScene();

    await user.click(screen.getByText("Room Editor"));
    await user.click(screen.getByRole("button", { name: "Room item Probe Rack" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.queryByRole("button", { name: "Room item Probe Rack" })).toBeNull();
  });

  it("moves selected room item with directional controls", async () => {
    const user = userEvent.setup();
    renderScene();

    await user.click(screen.getByText("Room Editor"));
    await user.click(screen.getByRole("button", { name: "Room item Probe Rack" }));
    const before = screen.getByText(/^Selected:/).textContent ?? "";
    await user.click(screen.getByRole("button", { name: "Right" }));
    const after = screen.getByText(/^Selected:/).textContent ?? "";

    expect(after).not.toBe(before);
  });

  it("keeps current tile and marks path as unreachable when route search fails", async () => {
    window.localStorage.setItem(
      ROOM_LAYOUT_STORAGE_KEY,
      JSON.stringify([
        { id: "b1", kind: "plant", label: "B1", tile: { x: 14, y: 9 }, width: 1, height: 1, zIndex: 1, locked: true },
        { id: "b2", kind: "plant", label: "B2", tile: { x: 16, y: 9 }, width: 1, height: 1, zIndex: 1, locked: true },
        { id: "b3", kind: "plant", label: "B3", tile: { x: 15, y: 8 }, width: 1, height: 1, zIndex: 1, locked: true },
        { id: "b4", kind: "plant", label: "B4", tile: { x: 15, y: 10 }, width: 1, height: 1, zIndex: 1, locked: true }
      ])
    );

    renderScene("moving_to_task");

    expect(await screen.findByText("path: unreachable")).not.toBeNull();
  });
});
