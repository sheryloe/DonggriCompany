import { describe, expect, it, vi } from "vitest";
import type { AnimatedSprite, Texture } from "pixi.js";

vi.mock("pixi.js", () => ({
  AnimatedSprite: class MockAnimatedSprite {},
  Container: class MockContainer {},
  Text: class MockText {},
  TextStyle: class MockTextStyle {},
}));

import { applyAgentWalkDirection, collectAgentWalkFrames } from "./spriteActors";

function texture(id: string): Texture {
  return { label: id } as unknown as Texture;
}

function walkSprite(): AnimatedSprite {
  return {
    visible: false,
    play: vi.fn(),
    stop: vi.fn(),
  } as unknown as AnimatedSprite;
}

describe("spriteActors", () => {
  it("collects three frames for each requested walk direction", () => {
    const textures: Record<string, Texture> = {
      "7-L-1": texture("7-L-1"),
      "7-L-2": texture("7-L-2"),
      "7-L-3": texture("7-L-3"),
    };

    expect(collectAgentWalkFrames(textures, 7, "L")).toEqual([textures["7-L-1"], textures["7-L-2"], textures["7-L-3"]]);
  });

  it("falls back to down frames when a directional strip is missing", () => {
    const textures: Record<string, Texture> = {
      "9-D-1": texture("9-D-1"),
      "9-D-2": texture("9-D-2"),
      "9-D-3": texture("9-D-3"),
    };

    expect(collectAgentWalkFrames(textures, 9, "R")).toEqual([textures["9-D-1"], textures["9-D-2"], textures["9-D-3"]]);
  });

  it("plays only the active direction sprite", () => {
    const down = walkSprite();
    const right = walkSprite();

    applyAgentWalkDirection({ D: down, R: right }, "R");

    expect(down.visible).toBe(false);
    expect(right.visible).toBe(true);
    expect(down.stop).toHaveBeenCalledOnce();
    expect(right.play).toHaveBeenCalledOnce();
  });
});
