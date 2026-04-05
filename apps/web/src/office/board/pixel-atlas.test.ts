import { describe, expect, it } from "vitest";

import {
  getMainSpriteAnimationSpeed,
  getLeadSpriteId,
  getNpcSpriteAnimationSpeed,
  getNpcSpriteId,
  getSpriteAnimStateFromLoop,
  getSpriteAnimStateFromProbeState
} from "./pixel-atlas";

describe("pixel-atlas sprite mapping", () => {
  it("maps probe states to lead sprite ids", () => {
    expect(getLeadSpriteId("success")).toBe("char_0");
    expect(getLeadSpriteId("partial")).toBe("char_1");
    expect(getLeadSpriteId("stale")).toBe("char_2");
    expect(getLeadSpriteId("no-signal")).toBe("char_4");
    expect(getLeadSpriteId("error")).toBe("char_3");
  });

  it("maps probe states to avatar anim states", () => {
    expect(getSpriteAnimStateFromProbeState("success")).toBe("walk");
    expect(getSpriteAnimStateFromProbeState("partial")).toBe("walk");
    expect(getSpriteAnimStateFromProbeState("stale")).toBe("idle");
    expect(getSpriteAnimStateFromProbeState("no-signal")).toBe("idle");
    expect(getSpriteAnimStateFromProbeState("error")).toBe("report");
  });

  it("maps loop states to room anim states", () => {
    expect(getSpriteAnimStateFromLoop("idle")).toBe("idle");
    expect(getSpriteAnimStateFromLoop("moving_to_task")).toBe("walk");
    expect(getSpriteAnimStateFromLoop("working")).toBe("walk");
    expect(getSpriteAnimStateFromLoop("moving_to_pm")).toBe("walk");
    expect(getSpriteAnimStateFromLoop("reporting")).toBe("report");
    expect(getSpriteAnimStateFromLoop("waiting_review")).toBe("report");
    expect(getSpriteAnimStateFromLoop("blocked")).toBe("idle");
  });

  it("maps npc roles to sprite ids", () => {
    expect(getNpcSpriteId("Router Ops")).toBe("char_5");
    expect(getNpcSpriteId("Runtime Ops")).toBe("char_2");
    expect(getNpcSpriteId("Probe Watch")).toBe("char_1");
    expect(getNpcSpriteId("History Desk")).toBe("char_4");
    expect(getNpcSpriteId("PM Liaison")).toBe("char_3");
    expect(getNpcSpriteId("Builder Agent")).toBe("char_0");
    expect(getNpcSpriteId("unknown-role")).toBe("char_5");
  });

  it("applies tuned animation speed for main and npc roles", () => {
    expect(getMainSpriteAnimationSpeed("walk")).toBeGreaterThan(getNpcSpriteAnimationSpeed("Runtime Ops", "walk"));
    expect(getNpcSpriteAnimationSpeed("PM Liaison", "report")).toBeGreaterThan(getNpcSpriteAnimationSpeed("History Desk", "report"));
    expect(getNpcSpriteAnimationSpeed("unknown-role", "walk")).toBe(0.2);
  });
});
