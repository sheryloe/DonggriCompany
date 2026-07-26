import { describe, expect, it } from "vitest";
import {
  AGENT_SPRITE_DIRECTIONS,
  AGENT_SPRITE_WALK_FRAMES,
  buildAgentSpriteKey,
  buildAgentSpriteUrl,
  getAgentWalkDirection,
} from "./spriteAssets";

describe("spriteAssets", () => {
  it("defines four-direction three-frame runtime sprite contract", () => {
    expect(AGENT_SPRITE_DIRECTIONS).toEqual(["D", "L", "B", "R"]);
    expect(AGENT_SPRITE_WALK_FRAMES).toEqual([1, 2, 3]);
    expect(buildAgentSpriteKey(12, "B", 3)).toBe("12-B-3");
    expect(buildAgentSpriteUrl(12, "B", 3)).toBe("/sprites/12-B-3.png?v=agent-visual-v2");
    expect(buildAgentSpriteUrl(12, "B", 3, "donggri_visual_v2")).toBe(
      "/sprites/donggri-visual-v2/12-B-3.png?v=donggri-visual-v2-quality-20260716",
    );
  });

  it("maps movement vectors to sprite directions", () => {
    expect(getAgentWalkDirection(0, 0, 10, 2)).toBe("R");
    expect(getAgentWalkDirection(10, 0, 0, 2)).toBe("L");
    expect(getAgentWalkDirection(0, 10, 1, 0)).toBe("B");
    expect(getAgentWalkDirection(0, 0, 1, 10)).toBe("D");
  });
});
