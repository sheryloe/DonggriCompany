import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  OFFICE_PROP_ATLAS_SIZE,
  OFFICE_PROP_ATLAS_URL,
  OFFICE_PROP_FRAMES,
  isOfficePropFrameInsideAtlas,
} from "./officePropAtlas";

vi.mock("pixi.js", () => ({
  Rectangle: class {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  },
  Sprite: class {},
  Texture: class {},
}));

describe("office renewal prop atlas", () => {
  it("keeps all manifest crops inside the generated atlas", () => {
    expect(OFFICE_PROP_ATLAS_SIZE.width).toBeGreaterThan(0);
    expect(OFFICE_PROP_ATLAS_SIZE.height).toBeGreaterThan(0);
    expect(Object.keys(OFFICE_PROP_FRAMES)).toEqual([
      "desk",
      "chair",
      "workstation",
      "plant",
      "documents",
      "stickyBoard",
      "coffee",
      "lounge",
      "serverRack",
      "projectBoard",
      "archiveCabinet",
      "memoryBoxes",
      "reviewGate",
      "warningBeacon",
      "designBoard",
      "lectureBoard",
    ]);

    for (const frame of Object.values(OFFICE_PROP_FRAMES)) {
      expect(isOfficePropFrameInsideAtlas(frame)).toBe(true);
    }
  });

  it("points to a repo-local generated asset", () => {
    expect(OFFICE_PROP_ATLAS_URL).toBe("/sprites/office-renewal-v2/office-props-atlas.png");
    expect(existsSync(join(process.cwd(), "public", OFFICE_PROP_ATLAS_URL))).toBe(true);
  });
});
