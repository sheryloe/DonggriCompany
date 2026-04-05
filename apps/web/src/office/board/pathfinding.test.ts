import { describe, expect, it } from "vitest";

import { findTilePath } from "./pathfinding";

describe("findTilePath", () => {
  it("returns a path around blocked tiles", () => {
    const blocked = new Set<string>(["1:0", "1:1", "1:2"]);
    const result = findTilePath({
      start: { x: 0, y: 0 },
      goal: { x: 3, y: 0 },
      blocked,
      width: 5,
      height: 5
    });

    expect(result).not.toBeNull();
    expect(result?.[0]).toEqual({ x: 0, y: 0 });
    expect(result?.[result.length - 1]).toEqual({ x: 3, y: 0 });
  });

  it("returns null when no route exists", () => {
    const blocked = new Set<string>(["1:0", "1:1", "1:2", "0:1", "2:1"]);
    const result = findTilePath({
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 2 },
      blocked,
      width: 3,
      height: 3
    });
    expect(result).toBeNull();
  });

  it("returns start tile when already at goal", () => {
    const result = findTilePath({
      start: { x: 4, y: 2 },
      goal: { x: 4, y: 2 },
      blocked: new Set<string>(),
      width: 10,
      height: 10
    });
    expect(result).toEqual([{ x: 4, y: 2 }]);
  });
});
