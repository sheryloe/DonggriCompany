import type { RoomItemKind, RoomItemVariantId, RoomTileItem, TileCoord } from "./scene-types";
import { getDefaultRoomPropVariantId, roomPropVariants } from "./office-props";

export const TILE_SIZE = 32;
export const GRID_COLS = 30;
export const GRID_ROWS = 18;
export const ROOM_LAYOUT_STORAGE_KEY = "office-room-layout-v3";
export const LEGACY_ROOM_LAYOUT_STORAGE_KEY = "office-room-layout-v2";

type ItemShape = {
  width: number;
  height: number;
};

export const roomItemKinds: Array<{ value: RoomItemKind; label: string }> = [
  { value: "desk", label: "Task Desk" },
  { value: "terminal", label: "Terminal Rack" },
  { value: "plant", label: "Plant" },
  { value: "sofa", label: "Lounge Sofa" },
  { value: "board", label: "Wall Board" }
];

const roomItemShapeByKind: Record<RoomItemKind, ItemShape> = {
  desk: { width: 3, height: 2 },
  terminal: { width: 2, height: 2 },
  plant: { width: 1, height: 1 },
  sofa: { width: 3, height: 2 },
  board: { width: 2, height: 1 }
};

const tileKey = (tile: TileCoord): string => `${tile.x}:${tile.y}`;

const createRoomItemId = (): string => {
  return `room-item-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const clampTile = (tile: TileCoord, width: number, height: number): TileCoord => {
  return {
    x: clamp(tile.x, 0, GRID_COLS - width),
    y: clamp(tile.y, 0, GRID_ROWS - height)
  };
};

const toFiniteInt = (value: unknown, fallback: number): number => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Math.floor(normalized) : fallback;
};

const toSafeKind = (value: unknown): RoomItemKind => {
  if (typeof value !== "string") {
    return "desk";
  }
  return roomItemKinds.some((candidate) => candidate.value === value) ? (value as RoomItemKind) : "desk";
};

const toSafeVariantId = (kind: RoomItemKind, value: unknown): RoomItemVariantId => {
  if (typeof value !== "string") {
    return getDefaultRoomPropVariantId(kind);
  }
  const variants = roomPropVariants[kind] ?? [];
  return variants.some((variant) => variant.id === value) ? value : getDefaultRoomPropVariantId(kind);
};

const toSafeLabel = (kind: RoomItemKind, label: unknown): string => {
  if (typeof label === "string" && label.trim().length > 0) {
    return label.trim();
  }
  return roomItemKinds.find((candidate) => candidate.value === kind)?.label ?? "Room Asset";
};

const getShape = (kind: RoomItemKind): ItemShape => roomItemShapeByKind[kind];

export const getItemTiles = (item: RoomTileItem): TileCoord[] => {
  const tiles: TileCoord[] = [];
  for (let offsetY = 0; offsetY < item.height; offsetY += 1) {
    for (let offsetX = 0; offsetX < item.width; offsetX += 1) {
      tiles.push({
        x: item.tile.x + offsetX,
        y: item.tile.y + offsetY
      });
    }
  }
  return tiles;
};

export const buildBlockedTileSet = (items: RoomTileItem[], ignoreItemId?: string): Set<string> => {
  const blocked = new Set<string>();
  items.forEach((item) => {
    if (item.id === ignoreItemId) {
      return;
    }
    getItemTiles(item).forEach((tile) => {
      blocked.add(tileKey(tile));
    });
  });
  return blocked;
};

const isWithinGrid = (tile: TileCoord, width: number, height: number): boolean => {
  return tile.x >= 0 && tile.y >= 0 && tile.x + width <= GRID_COLS && tile.y + height <= GRID_ROWS;
};

export const canPlaceItem = (
  items: RoomTileItem[],
  candidate: Pick<RoomTileItem, "id" | "tile" | "width" | "height">,
  ignoreItemId?: string
): boolean => {
  if (!isWithinGrid(candidate.tile, candidate.width, candidate.height)) {
    return false;
  }
  const blocked = buildBlockedTileSet(items, ignoreItemId ?? candidate.id);
  for (let offsetY = 0; offsetY < candidate.height; offsetY += 1) {
    for (let offsetX = 0; offsetX < candidate.width; offsetX += 1) {
      if (
        blocked.has(
          tileKey({
            x: candidate.tile.x + offsetX,
            y: candidate.tile.y + offsetY
          })
        )
      ) {
        return false;
      }
    }
  }
  return true;
};

const normalizeRoomItem = (value: unknown, index: number): RoomTileItem | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<RoomTileItem> & { x?: number; y?: number };
  const kind = toSafeKind(candidate.kind);
  const shape = getShape(kind);
  const rawTile = {
    x: toFiniteInt(candidate.tile?.x ?? candidate.x, index % (GRID_COLS - shape.width)),
    y: toFiniteInt(candidate.tile?.y ?? candidate.y, 1 + Math.floor(index / 6))
  };
  const tile = clampTile(rawTile, shape.width, shape.height);
  return {
    id: typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : createRoomItemId(),
    kind,
    variantId: toSafeVariantId(kind, (candidate as { variantId?: unknown }).variantId),
    label: toSafeLabel(kind, candidate.label),
    tile,
    width: shape.width,
    height: shape.height,
    zIndex: toFiniteInt(candidate.zIndex, index + 1),
    locked: Boolean(candidate.locked)
  };
};

export const createDefaultRoomItems = (): RoomTileItem[] => {
  return [
    {
      id: "room-desk-a1",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room A Desk 1",
      tile: { x: 3, y: 3 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-a2",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room A Desk 2",
      tile: { x: 7, y: 3 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-a3",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room A Desk 3",
      tile: { x: 3, y: 5 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-a4",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room A Desk 4",
      tile: { x: 7, y: 5 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-b1",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room B Desk 1",
      tile: { x: 19, y: 3 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-b2",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room B Desk 2",
      tile: { x: 23, y: 3 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-b3",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room B Desk 3",
      tile: { x: 19, y: 5 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-b4",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room B Desk 4",
      tile: { x: 23, y: 5 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-c1",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room C Desk 1",
      tile: { x: 3, y: 11 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-c2",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room C Desk 2",
      tile: { x: 7, y: 11 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-c3",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room C Desk 3",
      tile: { x: 3, y: 13 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-c4",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room C Desk 4",
      tile: { x: 7, y: 13 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-d1",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room D Desk 1",
      tile: { x: 19, y: 11 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-d2",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room D Desk 2",
      tile: { x: 23, y: 11 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-d3",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room D Desk 3",
      tile: { x: 19, y: 13 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-desk-d4",
      kind: "desk",
      variantId: getDefaultRoomPropVariantId("desk"),
      label: "Room D Desk 4",
      tile: { x: 23, y: 13 },
      width: 3,
      height: 2,
      zIndex: 3,
      locked: true
    },
    {
      id: "room-terminal-core",
      kind: "terminal",
      variantId: getDefaultRoomPropVariantId("terminal"),
      label: "Core Terminal",
      tile: { x: 13, y: 8 },
      width: 2,
      height: 2,
      zIndex: 4,
      locked: true
    },
    {
      id: "room-sofa-pm",
      kind: "sofa",
      variantId: getDefaultRoomPropVariantId("sofa"),
      label: "PM Lounge",
      tile: { x: 17, y: 8 },
      width: 3,
      height: 2,
      zIndex: 2,
      locked: true
    },
    {
      id: "room-board-main",
      kind: "board",
      variantId: roomPropVariants.board[0]?.id ?? getDefaultRoomPropVariantId("board"),
      label: "Main Board",
      tile: { x: 14, y: 1 },
      width: 2,
      height: 1,
      zIndex: 2,
      locked: true
    },
    {
      id: "room-plant-lobby",
      kind: "plant",
      variantId: roomPropVariants.plant[0]?.id ?? getDefaultRoomPropVariantId("plant"),
      label: "Lobby Plant",
      tile: { x: 1, y: 1 },
      width: 1,
      height: 1,
      zIndex: 2,
      locked: true
    },
    {
      id: "room-plant-corner",
      kind: "plant",
      variantId: roomPropVariants.plant[1]?.id ?? getDefaultRoomPropVariantId("plant"),
      label: "Corner Plant",
      tile: { x: 28, y: 16 },
      width: 1,
      height: 1,
      zIndex: 2,
      locked: true
    }
  ];
};

const migrateLegacyLayout = (rawLegacy: string): RoomTileItem[] => {
  try {
    const parsed = JSON.parse(rawLegacy) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const migrated = parsed
      .map((item, index) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const candidate = item as { x?: number; y?: number; kind?: string; label?: string; zIndex?: number; locked?: boolean };
        const kind = toSafeKind(candidate.kind);
        const shape = getShape(kind);
        const tile = clampTile(
          {
            x: Math.round(((Number(candidate.x) || 0) / 100) * (GRID_COLS - 1)),
            y: Math.round(((Number(candidate.y) || 0) / 100) * (GRID_ROWS - 1))
          },
          shape.width,
          shape.height
        );
        return normalizeRoomItem(
          {
            id: createRoomItemId(),
            kind,
            label: candidate.label,
            tile,
            zIndex: candidate.zIndex ?? index + 1,
            locked: candidate.locked
          },
          index
        );
      })
      .filter((item): item is RoomTileItem => item !== null);

    return migrated.length > 0 ? migrated : [];
  } catch {
    return [];
  }
};

export const loadRoomLayout = (storage: Storage): RoomTileItem[] => {
  const rawCurrent = storage.getItem(ROOM_LAYOUT_STORAGE_KEY);
  if (rawCurrent) {
    try {
      const parsed = JSON.parse(rawCurrent) as unknown;
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((item, index) => normalizeRoomItem(item, index))
          .filter((item): item is RoomTileItem => item !== null);
        if (normalized.length > 0) {
          return normalized;
        }
      }
    } catch {
      return createDefaultRoomItems();
    }
  }

  const rawLegacy = storage.getItem(LEGACY_ROOM_LAYOUT_STORAGE_KEY);
  if (rawLegacy) {
    const migrated = migrateLegacyLayout(rawLegacy);
    if (migrated.length > 0) {
      storage.setItem(ROOM_LAYOUT_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  }

  return createDefaultRoomItems();
};

export const saveRoomLayout = (storage: Storage, items: RoomTileItem[]): void => {
  storage.setItem(ROOM_LAYOUT_STORAGE_KEY, JSON.stringify(items));
};

const getTopLayer = (items: RoomTileItem[]): number => {
  return items.reduce((max, item) => Math.max(max, item.zIndex), 1);
};

export const placeRoomTileItemAt = (
  items: RoomTileItem[],
  kind: RoomItemKind,
  label: string,
  tile: TileCoord,
  variantId?: RoomItemVariantId
): { items: RoomTileItem[]; added: RoomTileItem | null } => {
  const shape = getShape(kind);
  const normalizedTile = clampTile(tile, shape.width, shape.height);
  const nextItem: RoomTileItem = {
    id: createRoomItemId(),
    kind,
    variantId: toSafeVariantId(kind, variantId),
    label: label.trim() || `${roomItemKinds.find((item) => item.value === kind)?.label ?? "Room Asset"} ${items.length + 1}`,
    tile: normalizedTile,
    width: shape.width,
    height: shape.height,
    zIndex: getTopLayer(items) + 1,
    locked: false
  };
  if (!canPlaceItem(items, nextItem)) {
    return { items, added: null };
  }
  return { items: [...items, nextItem], added: nextItem };
};

export const autoPlaceRoomTileItem = (
  items: RoomTileItem[],
  kind: RoomItemKind,
  label: string,
  variantId?: RoomItemVariantId
): { items: RoomTileItem[]; added: RoomTileItem | null } => {
  const shape = getShape(kind);
  for (let y = 0; y <= GRID_ROWS - shape.height; y += 1) {
    for (let x = 0; x <= GRID_COLS - shape.width; x += 1) {
      const placed = placeRoomTileItemAt(items, kind, label, { x, y }, variantId);
      if (placed.added) {
        return placed;
      }
    }
  }
  return { items, added: null };
};

export const moveRoomTileItem = (
  items: RoomTileItem[],
  itemId: string,
  tile: TileCoord
): { items: RoomTileItem[]; moved: boolean; from: TileCoord | null; to: TileCoord | null } => {
  const target = items.find((item) => item.id === itemId);
  if (!target || target.locked) {
    return { items, moved: false, from: null, to: null };
  }
  const clamped = clampTile(tile, target.width, target.height);
  if (clamped.x === target.tile.x && clamped.y === target.tile.y) {
    return { items, moved: false, from: target.tile, to: clamped };
  }
  const next = {
    ...target,
    tile: clamped
  };
  if (!canPlaceItem(items, next, target.id)) {
    return { items, moved: false, from: target.tile, to: clamped };
  }
  return {
    items: items.map((item) => (item.id === itemId ? next : item)),
    moved: true,
    from: target.tile,
    to: clamped
  };
};

export const removeRoomTileItem = (
  items: RoomTileItem[],
  itemId: string
): { items: RoomTileItem[]; removed: boolean } => {
  const target = items.find((item) => item.id === itemId);
  if (!target || target.locked) {
    return { items, removed: false };
  }
  return {
    items: items.filter((item) => item.id !== itemId),
    removed: true
  };
};

export const toggleRoomTileItemLock = (
  items: RoomTileItem[],
  itemId: string
): { items: RoomTileItem[]; locked: boolean | null } => {
  const target = items.find((item) => item.id === itemId);
  if (!target) {
    return { items, locked: null };
  }
  const nextLocked = !target.locked;
  return {
    items: items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            locked: nextLocked
          }
        : item
    ),
    locked: nextLocked
  };
};

export const findRoomItemAtTile = (items: RoomTileItem[], tile: TileCoord): RoomTileItem | null => {
  const sorted = [...items].sort((left, right) => right.zIndex - left.zIndex);
  for (const item of sorted) {
    const withinX = tile.x >= item.tile.x && tile.x < item.tile.x + item.width;
    const withinY = tile.y >= item.tile.y && tile.y < item.tile.y + item.height;
    if (withinX && withinY) {
      return item;
    }
  }
  return null;
};
