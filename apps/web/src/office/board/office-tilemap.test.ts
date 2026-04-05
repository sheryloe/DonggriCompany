import { describe, expect, it } from "vitest";

import {
  GRID_COLS,
  GRID_ROWS,
  autoPlaceRoomTileItem,
  createDefaultRoomItems,
  loadRoomLayout,
  moveRoomTileItem,
  placeRoomTileItemAt,
  toggleRoomTileItemLock
} from "./office-tilemap";

const createMemoryStorage = (seed?: Record<string, string>): Storage => {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    get length() {
      return store.size;
    }
  };
};

describe("office tilemap", () => {
  it("places a room item on a requested tile", () => {
    const initial = createDefaultRoomItems();
    const placed = placeRoomTileItemAt(initial, "plant", "Plant A", { x: 1, y: 2 });
    expect(placed.added).not.toBeNull();
    expect(placed.added?.tile).toEqual({ x: 1, y: 2 });
  });

  it("auto-places an item into the first available tile", () => {
    const initial = createDefaultRoomItems();
    const placed = autoPlaceRoomTileItem(initial, "board", "");
    expect(placed.added).not.toBeNull();
    expect(placed.items.length).toBe(initial.length + 1);
  });

  it("blocks movement for locked items", () => {
    const initial = createDefaultRoomItems();
    const firstItem = initial[0];
    const locked = toggleRoomTileItemLock(initial, firstItem.id);
    const moved = moveRoomTileItem(locked.items, firstItem.id, { x: firstItem.tile.x + 1, y: firstItem.tile.y + 1 });
    expect(moved.moved).toBe(false);
  });

  it("treats same-tile movement as no-op", () => {
    const initial = createDefaultRoomItems();
    const firstItem = initial[0];
    const moved = moveRoomTileItem(initial, firstItem.id, { x: firstItem.tile.x, y: firstItem.tile.y });
    expect(moved.moved).toBe(false);
    expect(moved.items).toBe(initial);
  });

  it("falls back to defaults when storage payload is invalid", () => {
    const storage = createMemoryStorage({
      "office-room-layout-v3": "{not-json"
    });
    const loaded = loadRoomLayout(storage);
    expect(loaded.length).toBeGreaterThan(0);
  });

  it("normalizes legacy percent coordinates into tile coordinates", () => {
    const storage = createMemoryStorage({
      "office-room-layout-v2": JSON.stringify([
        { id: "legacy-1", kind: "desk", x: 50, y: 50, label: "Legacy Desk", zIndex: 1, locked: false }
      ])
    });
    const loaded = loadRoomLayout(storage);
    expect(loaded[0].tile.x).toBeGreaterThanOrEqual(0);
    expect(loaded[0].tile.y).toBeGreaterThanOrEqual(0);
    expect(loaded[0].tile.x).toBeLessThan(GRID_COLS);
    expect(loaded[0].tile.y).toBeLessThan(GRID_ROWS);
  });
});
