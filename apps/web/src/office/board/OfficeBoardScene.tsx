import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";

import { mapProbeStateToPresentation } from "../lib/probe-presentation";
import type { BoardEmphasisTarget } from "../lib/probe-presentation";
import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";
import { getLoopLabel, officeNpcProfiles } from "./office-agents";
import { BoardZone } from "./BoardZone";
import {
  SPRITE_SCALE,
  buildSpriteSheetFrames,
  getCharacterSpritePath,
  getLeadSpriteId,
  getMainSpriteAnimationSpeed,
  getNpcSpriteAnimationSpeed,
  getSpriteAnimStateFromLoop,
  spriteCharacterIds,
  type SpriteSheetFrameSet
} from "./pixel-atlas";
import {
  GRID_COLS,
  GRID_ROWS,
  TILE_SIZE,
  autoPlaceRoomTileItem,
  buildBlockedTileSet,
  clampTile,
  createDefaultRoomItems,
  findRoomItemAtTile,
  loadRoomLayout,
  moveRoomTileItem,
  placeRoomTileItemAt,
  removeRoomTileItem,
  roomItemKinds,
  saveRoomLayout,
  toggleRoomTileItemLock
} from "./office-tilemap";
import {
  getDefaultRoomPropVariantId,
  getToneNormalizationForVariant,
  getRoomPropVariant,
  listRoomPropVariants,
  roomPropVariants
} from "./office-props";
import { findTilePath } from "./pathfinding";
import type {
  AgentWorkLoopState,
  FacingDir,
  NpcActorState,
  RoomItemKind,
  RoomItemVariantId,
  RoomTileItem,
  SceneEditorAction,
  SceneSyncState,
  SpriteAnimState,
  SpriteCharacterId,
  TileCoord
} from "./scene-types";

export type { AgentWorkLoopState } from "./scene-types";

type OfficeBoardSceneProps = {
  accountPoolZone?: ReactNode;
  runtimeProfileZone?: ReactNode;
  probeMonitorZone?: ReactNode;
  historyBoardZone?: ReactNode;
  sceneSync: SceneSyncState;
  agentName: string;
  emphasisTarget: BoardEmphasisTarget;
  pmName?: string;
  onEditorAction?: (action: SceneEditorAction) => void;
  showStatusPanel?: boolean;
  t?: OfficeTranslator;
};

type EditorMode = "select" | "place" | "move";

type PixiRuntime = {
  app: import("pixi.js").Application;
  pixi: typeof import("pixi.js");
  root: import("pixi.js").Container;
  staticLayer: import("pixi.js").Container;
  backgroundLayer: import("pixi.js").Container;
  furnitureLayer: import("pixi.js").Container;
  selectionLayer: import("pixi.js").Container;
  actorLayer: import("pixi.js").Container;
  frameCache: Map<SpriteCharacterId, SpriteSheetFrameSet>;
  actorVisuals: Map<string, ActorVisual>;
  propTextures: Map<string, import("pixi.js").Texture> | null;
};

type ActorVisual = {
  container: import("pixi.js").Container;
  sprite: import("pixi.js").AnimatedSprite;
  label: import("pixi.js").Text;
  spriteId: SpriteCharacterId;
  animState: SpriteAnimState;
  animSpeed: number;
  facing: FacingDir;
  lastTile: TileCoord;
};

const TASK_TILE: TileCoord = { x: 6, y: 4 };
const PM_TILE: TileCoord = { x: 23, y: 4 };
const IDLE_TILE: TileCoord = { x: 15, y: 9 };
const OFFICE_BACKGROUND_PATH = "/pixel-tycoon/office_room_bg.png";

const getLoopTargetTile = (state: AgentWorkLoopState): TileCoord => {
  switch (state) {
    case "moving_to_task":
    case "working":
      return TASK_TILE;
    case "moving_to_pm":
    case "reporting":
    case "waiting_review":
      return PM_TILE;
    case "blocked":
      return IDLE_TILE;
    default:
      return IDLE_TILE;
  }
};

const getZoneClassName = (target: BoardEmphasisTarget, zone: BoardEmphasisTarget): string => {
  if (target === "none") {
    return "";
  }
  if (target === zone) {
    return "board-zone-primary";
  }
  return "board-zone-muted";
};

const cloneRoomItems = (items: RoomTileItem[]): RoomTileItem[] => {
  return items.map((item) => ({
    ...item,
    tile: { ...item.tile }
  }));
};

export const monitorActors: Array<
  Pick<NpcActorState, "id" | "name" | "role" | "tone" | "spriteId"> & { tile: TileCoord; actorRole: string }
> = [
  { id: "npc-router", name: officeNpcProfiles.router.displayName, role: officeNpcProfiles.router.roleLabel, tone: "mint", spriteId: officeNpcProfiles.router.spriteId, actorRole: "router", tile: { x: 5, y: 8 } },
  { id: "npc-runtime", name: officeNpcProfiles.runtime.displayName, role: officeNpcProfiles.runtime.roleLabel, tone: "indigo", spriteId: officeNpcProfiles.runtime.spriteId, actorRole: "runtime", tile: { x: 8, y: 12 } },
  { id: "npc-probe", name: officeNpcProfiles.probe.displayName, role: officeNpcProfiles.probe.roleLabel, tone: "violet", spriteId: officeNpcProfiles.probe.spriteId, actorRole: "probe", tile: { x: 14, y: 7 } },
  { id: "npc-history", name: officeNpcProfiles.history.displayName, role: officeNpcProfiles.history.roleLabel, tone: "slate", spriteId: officeNpcProfiles.history.spriteId, actorRole: "history", tile: { x: 18, y: 12 } },
  { id: "npc-review", name: officeNpcProfiles["pm-liaison"].displayName, role: officeNpcProfiles["pm-liaison"].roleLabel, tone: "rose", spriteId: officeNpcProfiles["pm-liaison"].spriteId, actorRole: "pm-liaison", tile: { x: 22, y: 9 } }
];

const getNpcActors = (loopState: AgentWorkLoopState, tick: number, actorStates: SceneSyncState["actors"]): NpcActorState[] => {
  return monitorActors.map((npc, index) => {
    const offset = tick + index * 2;
    const actor = actorStates.find((item) => item.role === npc.actorRole);
    let state: AgentWorkLoopState = "idle";

    if (loopState === "blocked") {
      state = "blocked";
    } else if (npc.role === "PM Liaison") {
      state = loopState === "reporting" || loopState === "waiting_review" ? loopState : "idle";
    } else if (npc.role === "History Desk") {
      state = loopState === "waiting_review" ? "working" : loopState === "reporting" ? "reporting" : "idle";
    } else if (loopState === "idle") {
      state = offset % 5 === 0 ? "moving_to_task" : "idle";
    } else {
      const phase = offset % 6;
      state = phase <= 1 ? "moving_to_task" : phase <= 3 ? "working" : phase === 4 ? "moving_to_pm" : "reporting";
    }

    return {
      ...npc,
      state: actor?.fsmState ?? state,
      facing: actor?.facing ?? (offset % 4 < 2 ? "right" : "left"),
      tile: actor?.tile ?? npc.tile,
      target: null,
      path: []
    };
  });
};

const getKindColor = (kind: RoomItemKind): number => {
  switch (kind) {
    case "desk":
      return 0x264653;
    case "terminal":
      return 0x1d3557;
    case "plant":
      return 0x2a9d8f;
    case "sofa":
      return 0x9c6644;
    case "board":
      return 0x495057;
    default:
      return 0x374151;
  }
};

export function OfficeBoardScene({
  accountPoolZone,
  runtimeProfileZone,
  probeMonitorZone,
  historyBoardZone,
  sceneSync,
  agentName,
  emphasisTarget,
  pmName = "PM Desk",
  onEditorAction,
  showStatusPanel: _showStatusPanel = true,
  t = createOfficeTranslator("en")
}: OfficeBoardSceneProps): JSX.Element {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const pixiRuntimeRef = useRef<PixiRuntime | null>(null);
  const mapCenteredRef = useRef<boolean>(false);
  const mapPanRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0
  });
  const dragStateRef = useRef<{ itemId: string | null }>({ itemId: null });
  const pointerStateRef = useRef<{
    editorMode: EditorMode;
    roomItems: RoomTileItem[];
    selectedItemId: string | null;
    selectedItem: RoomTileItem | null;
    placeItemOnTile: (tile: TileCoord) => void;
    moveItemToTile: (itemId: string, tile: TileCoord) => void;
    emitEditorAction: (action: SceneEditorAction) => void;
  } | null>(null);
  const undoStackRef = useRef<RoomTileItem[][]>([]);
  const redoStackRef = useRef<RoomTileItem[][]>([]);

  const [roomItems, setRoomItems] = useState(createDefaultRoomItems);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [newItemKind, setNewItemKind] = useState<RoomItemKind>("desk");
  const [newItemVariantId, setNewItemVariantId] = useState<RoomItemVariantId>(() =>
    getDefaultRoomPropVariantId("desk")
  );
  const [newItemLabel, setNewItemLabel] = useState<string>("");
  const [editorMode, setEditorMode] = useState<EditorMode>("select");
  const [rendererMode, setRendererMode] = useState<"loading" | "ready" | "fallback">("loading");
  const [isMapPanning, setIsMapPanning] = useState<boolean>(false);
  const [mainAgentTile, setMainAgentTile] = useState<TileCoord>(IDLE_TILE);
  const [mainAgentPath, setMainAgentPath] = useState<TileCoord[]>([]);
  const [isMainPathUnreachable, setIsMainPathUnreachable] = useState<boolean>(false);
  const [historyDepth, setHistoryDepth] = useState<{ undo: number; redo: number }>({ undo: 0, redo: 0 });

  const selectedItem = roomItems.find((item) => item.id === selectedItemId) ?? null;
  const loopTick = sceneSync.lastLoopEvent?.atTick ?? 0;
  const npcActors = useMemo(
    () => getNpcActors(sceneSync.loopState, loopTick, sceneSync.actors),
    [loopTick, sceneSync.actors, sceneSync.loopState]
  );
  const probePresentation = useMemo(() => mapProbeStateToPresentation(sceneSync.probeState), [sceneSync.probeState]);
  const sceneWidth = GRID_COLS * TILE_SIZE;
  const sceneHeight = GRID_ROWS * TILE_SIZE;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      setRoomItems(loadRoomLayout(window.localStorage));
      undoStackRef.current = [];
      redoStackRef.current = [];
      setHistoryDepth({ undo: 0, redo: 0 });
    } catch {
      setRoomItems(createDefaultRoomItems());
      undoStackRef.current = [];
      redoStackRef.current = [];
      setHistoryDepth({ undo: 0, redo: 0 });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      saveRoomLayout(window.localStorage, roomItems);
    } catch {
      // Ignore storage write errors to keep editor responsive.
    }
  }, [roomItems]);

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }
    if (!roomItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [roomItems, selectedItemId]);

  useEffect(() => {
    const blocked = buildBlockedTileSet(roomItems);
    const target = getLoopTargetTile(sceneSync.loopState);
    const path = findTilePath({
      start: mainAgentTile,
      goal: target,
      blocked,
      width: GRID_COLS,
      height: GRID_ROWS
    });
    if (!path) {
      setMainAgentPath([]);
      setIsMainPathUnreachable(mainAgentTile.x !== target.x || mainAgentTile.y !== target.y);
      return;
    }
    setIsMainPathUnreachable(false);
    setMainAgentPath(path.slice(1));
  }, [sceneSync.loopState, roomItems]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mainAgentPath.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      setMainAgentTile(mainAgentPath[0]);
      setMainAgentPath((previous) => previous.slice(1));
    }, 200);
    return () => clearTimeout(timer);
  }, [mainAgentPath]);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === "undefined") {
      return;
    }
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      setRendererMode("fallback");
      return;
    }

    const mount = async (): Promise<void> => {
      try {
        const PIXI = await import("pixi.js");
        if (cancelled || !mapHostRef.current) {
          return;
        }
        await Promise.all(
          spriteCharacterIds.map((spriteId) => PIXI.Assets.load(getCharacterSpritePath(spriteId)))
        );
        const app = new PIXI.Application();
        await app.init({
          width: sceneWidth,
          height: sceneHeight,
          background: 0x0e0e0e,
          antialias: false,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1
        });
        app.canvas.className = "pixel-room-canvas";
        app.canvas.style.imageRendering = "pixelated";
        app.stage.eventMode = "static";
        app.stage.hitArea = new PIXI.Rectangle(0, 0, sceneWidth, sceneHeight);
        const root = new PIXI.Container();
        const staticLayer = new PIXI.Container();
        const backgroundLayer = new PIXI.Container();
        const furnitureLayer = new PIXI.Container();
        const selectionLayer = new PIXI.Container();
        const actorLayer = new PIXI.Container();
        staticLayer.addChild(backgroundLayer);
        staticLayer.addChild(furnitureLayer);
        staticLayer.addChild(selectionLayer);
        root.addChild(staticLayer);
        root.addChild(actorLayer);
        app.stage.addChild(root);
        mapHostRef.current.innerHTML = "";
        mapHostRef.current.appendChild(app.canvas);
        pixiRuntimeRef.current = {
          app,
          pixi: PIXI,
          root,
          staticLayer,
          backgroundLayer,
          furnitureLayer,
          selectionLayer,
          actorLayer,
          frameCache: new Map<SpriteCharacterId, SpriteSheetFrameSet>(),
          actorVisuals: new Map<string, ActorVisual>(),
          propTextures: new Map<string, import("pixi.js").Texture>()
        };
        setRendererMode("ready");
      } catch {
        setRendererMode("fallback");
      }
    };

    void mount();

    return () => {
      cancelled = true;
      const runtime = pixiRuntimeRef.current;
      if (runtime) {
        runtime.app.destroy(true);
      }
      pixiRuntimeRef.current = null;
    };
  }, [sceneHeight, sceneWidth]);

  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport || mapCenteredRef.current) {
      return;
    }
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2 - 32);
    mapCenteredRef.current = true;
  }, [rendererMode]);

  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport) {
      return;
    }

    const canStartPan = (event: PointerEvent): boolean => {
      return event.button === 1 || (event.button === 0 && event.shiftKey);
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!canStartPan(event)) {
        return;
      }
      mapPanRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: viewport.scrollLeft,
        startScrollTop: viewport.scrollTop
      };
      setIsMapPanning(true);
      viewport.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent): void => {
      const pan = mapPanRef.current;
      if (!pan.active || pan.pointerId !== event.pointerId) {
        return;
      }
      viewport.scrollLeft = pan.startScrollLeft - (event.clientX - pan.startX);
      viewport.scrollTop = pan.startScrollTop - (event.clientY - pan.startY);
      event.preventDefault();
    };

    const stopPan = (event: PointerEvent): void => {
      const pan = mapPanRef.current;
      if (!pan.active || pan.pointerId !== event.pointerId) {
        return;
      }
      mapPanRef.current.active = false;
      mapPanRef.current.pointerId = null;
      setIsMapPanning(false);
      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
    };

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", stopPan);
    viewport.addEventListener("pointercancel", stopPan);

    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", stopPan);
      viewport.removeEventListener("pointercancel", stopPan);
    };
  }, []);

  const emitEditorAction = useCallback(
    (action: SceneEditorAction): void => {
      onEditorAction?.(action);
    },
    [onEditorAction]
  );

  const trackMutationHistory = useCallback((previousItems: RoomTileItem[]): void => {
    undoStackRef.current.push(cloneRoomItems(previousItems));
    if (undoStackRef.current.length > 40) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setHistoryDepth({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length
    });
  }, []);

  const applyRoomMutation = useCallback(
    (updater: (previous: RoomTileItem[]) => RoomTileItem[]): void => {
      setRoomItems((previous) => {
        const next = updater(previous);
        if (next === previous) {
          return previous;
        }
        trackMutationHistory(previous);
        return next;
      });
    },
    [trackMutationHistory]
  );

  const placeItemOnTile = useCallback(
    (tile: TileCoord): void => {
      applyRoomMutation((previous) => {
        const result = placeRoomTileItemAt(previous, newItemKind, newItemLabel, tile, newItemVariantId);
        if (!result.added) {
          emitEditorAction({ type: "add-blocked", kind: newItemKind, tile });
          return previous;
        }
        setSelectedItemId(result.added.id);
        setNewItemLabel("");
        emitEditorAction({
          type: "add",
          itemId: result.added.id,
          kind: result.added.kind,
          tile: result.added.tile
        });
        return result.items;
      });
    },
    [applyRoomMutation, emitEditorAction, newItemKind, newItemLabel, newItemVariantId]
  );

  const moveItemToTile = useCallback(
    (itemId: string, tile: TileCoord): void => {
      applyRoomMutation((previous) => {
        const moved = moveRoomTileItem(previous, itemId, tile);
        if (moved.moved && moved.from && moved.to) {
          emitEditorAction({ type: "move", itemId, from: moved.from, to: moved.to });
        }
        return moved.items;
      });
    },
    [applyRoomMutation, emitEditorAction]
  );

  useEffect(() => {
    pointerStateRef.current = {
      editorMode,
      roomItems,
      selectedItemId,
      selectedItem,
      placeItemOnTile,
      moveItemToTile,
      emitEditorAction
    };
  }, [editorMode, emitEditorAction, moveItemToTile, placeItemOnTile, roomItems, selectedItem, selectedItemId]);

  useEffect(() => {
    const runtime = pixiRuntimeRef.current;
    if (!runtime || rendererMode !== "ready") {
      return;
    }
    const { app } = runtime;
    const toTile = (x: number, y: number): TileCoord => ({
      x: Math.floor(x / TILE_SIZE),
      y: Math.floor(y / TILE_SIZE)
    });

    const onPointerDown = (event: { global: { x: number; y: number } }): void => {
      const state = pointerStateRef.current;
      if (!state) {
        return;
      }
      const tile = toTile(event.global.x, event.global.y);
      if (tile.x < 0 || tile.y < 0 || tile.x >= GRID_COLS || tile.y >= GRID_ROWS) {
        return;
      }
      if (state.editorMode === "place") {
        state.placeItemOnTile(tile);
        return;
      }

      const hitItem = findRoomItemAtTile(state.roomItems, tile);
      if (hitItem) {
        setSelectedItemId(hitItem.id);
        state.emitEditorAction({ type: "select", itemId: hitItem.id });
        if (!hitItem.locked && state.editorMode === "move") {
          dragStateRef.current.itemId = hitItem.id;
        }
        return;
      }

      if (state.editorMode === "move" && state.selectedItemId && state.selectedItem && !state.selectedItem.locked) {
        state.moveItemToTile(state.selectedItemId, tile);
      }
    };

    const onPointerMove = (event: { global: { x: number; y: number } }): void => {
      const state = pointerStateRef.current;
      const draggingId = dragStateRef.current.itemId;
      if (!draggingId || !state) {
        return;
      }
      const tile = toTile(event.global.x, event.global.y);
      state.moveItemToTile(draggingId, tile);
    };

    const onPointerUp = (): void => {
      dragStateRef.current.itemId = null;
    };

    app.stage.on("pointerdown", onPointerDown);
    app.stage.on("pointermove", onPointerMove);
    app.stage.on("pointerup", onPointerUp);
    app.stage.on("pointerupoutside", onPointerUp);

    return () => {
      app.stage.off("pointerdown", onPointerDown);
      app.stage.off("pointermove", onPointerMove);
      app.stage.off("pointerup", onPointerUp);
      app.stage.off("pointerupoutside", onPointerUp);
    };
  }, [rendererMode]);

  useEffect(() => {
    const runtime = pixiRuntimeRef.current;
    if (!runtime || rendererMode !== "ready") {
      return;
    }
    const { app, pixi: PIXI, backgroundLayer } = runtime;
    let cancelled = false;

    const renderBackground = async (): Promise<void> => {
      const oldChildren = backgroundLayer.removeChildren() as Array<{ destroy: () => void }>;
      oldChildren.forEach((child) => {
        child.destroy();
      });

      const texture = await PIXI.Assets.load(OFFICE_BACKGROUND_PATH);
      if (cancelled) {
        return;
      }

      const background = new PIXI.Sprite(texture);
      background.width = sceneWidth;
      background.height = sceneHeight;
      background.alpha = 0.98;
      backgroundLayer.addChild(background);

      const softLight = new PIXI.Graphics();
      softLight.rect(0, 0, sceneWidth, sceneHeight);
      softLight.fill({ color: 0xffffff, alpha: 0.03 });
      backgroundLayer.addChild(softLight);

      const vignette = new PIXI.Graphics();
      vignette.rect(0, 0, sceneWidth, sceneHeight);
      vignette.fill({ color: 0x0f172a, alpha: 0.06 });
      backgroundLayer.addChild(vignette);

      app.renderer.render(app.stage);
    };

    void renderBackground();

    return () => {
      cancelled = true;
    };
  }, [rendererMode, sceneHeight, sceneWidth]);

  useEffect(() => {
    const runtime = pixiRuntimeRef.current;
    if (!runtime || rendererMode !== "ready") {
      return;
    }
    let cancelled = false;
    const { app, pixi: PIXI, furnitureLayer } = runtime;

    const ensurePropTextures = async (): Promise<Map<string, import("pixi.js").Texture>> => {
      if (!runtime.propTextures) {
        runtime.propTextures = new Map<string, import("pixi.js").Texture>();
      }
      const cache = runtime.propTextures;
      const entries = Object.values(roomPropVariants).flat();
      await Promise.all(
        entries.map(async (variant) => {
          if (!cache.has(variant.id)) {
            const texture = await PIXI.Assets.load(variant.path);
            cache.set(variant.id, texture);
          }
        })
      );
      return cache;
    };

    const renderFurniture = async (): Promise<void> => {
      try {
        const textures = await ensurePropTextures();
        if (cancelled) {
          return;
        }
        const oldChildren = furnitureLayer.removeChildren() as Array<{ destroy: () => void }>;
        oldChildren.forEach((child) => {
          child.destroy();
        });

        const sortedItems = [...roomItems].sort((left, right) => left.zIndex - right.zIndex);
        sortedItems.forEach((item) => {
          const tileX = item.tile.x * TILE_SIZE;
          const tileY = item.tile.y * TILE_SIZE;
          const width = item.width * TILE_SIZE;
          const height = item.height * TILE_SIZE;
          const variant = getRoomPropVariant(item.kind, item.variantId);
          const texture = textures.get(variant.id);
          if (texture) {
            const sprite = new PIXI.Sprite(texture);
            sprite.x = tileX;
            sprite.y = tileY;
            sprite.width = width;
            sprite.height = height;
            sprite.roundPixels = true;
            const tone = getToneNormalizationForVariant(item.kind, item.variantId);
            sprite.tint = tone.tint;
            sprite.alpha = tone.alpha;
            furnitureLayer.addChild(sprite);
          } else {
            const block = new PIXI.Graphics();
            block.rect(tileX, tileY, width, height);
            block.stroke({
              color: item.locked ? 0x94a3b8 : 0x175b72,
              width: 1,
              alpha: 0.95
            });
            furnitureLayer.addChild(block);

            const placeholder = new PIXI.Text({
              text: item.kind.slice(0, 1).toUpperCase(),
              style: {
                fill: 0xcbd5f5,
                fontFamily: "monospace",
                fontSize: 10
              }
            });
            placeholder.x = tileX + 4;
            placeholder.y = tileY + 3;
            furnitureLayer.addChild(placeholder);
          }

          if (selectedItemId === item.id) {
            const label = new PIXI.Text({
              text: item.label,
              style: {
                fill: 0xe5e7eb,
                fontFamily: "monospace",
                fontSize: 10
              }
            });
            label.x = tileX + 4;
            label.y = tileY + 4;
            furnitureLayer.addChild(label);
          }
        });

        app.renderer.render(app.stage);
      } catch {
        if (cancelled) {
          return;
        }
      }
    };

    void renderFurniture();

    return () => {
      cancelled = true;
    };
  }, [rendererMode, roomItems, selectedItemId]);

  useEffect(() => {
    const runtime = pixiRuntimeRef.current;
    if (!runtime || rendererMode !== "ready") {
      return;
    }
    const { app, pixi: PIXI, selectionLayer } = runtime;
    const oldChildren = selectionLayer.removeChildren() as Array<{ destroy: () => void }>;
    oldChildren.forEach((child) => {
      child.destroy();
    });
    if (!selectedItemId) {
      app.renderer.render(app.stage);
      return;
    }
    const selectedItem = roomItems.find((item) => item.id === selectedItemId);
    if (!selectedItem) {
      app.renderer.render(app.stage);
      return;
    }
    const highlight = new PIXI.Graphics();
    highlight.rect(
      selectedItem.tile.x * TILE_SIZE,
      selectedItem.tile.y * TILE_SIZE,
      selectedItem.width * TILE_SIZE,
      selectedItem.height * TILE_SIZE
    );
    highlight.stroke({
      color: 0x9cff93,
      width: 2,
      alpha: 1
    });
    selectionLayer.addChild(highlight);

    app.renderer.render(app.stage);
  }, [rendererMode, roomItems, selectedItemId]);

  useEffect(() => {
    const runtime = pixiRuntimeRef.current;
    if (!runtime || rendererMode !== "ready") {
      return;
    }

    const { app, pixi: PIXI, actorLayer } = runtime;

    const ensureSpriteFrameSet = (spriteId: SpriteCharacterId): SpriteSheetFrameSet => {
      const cached = runtime.frameCache.get(spriteId);
      if (cached) {
        return cached;
      }
      const next = buildSpriteSheetFrames(PIXI, spriteId);
      runtime.frameCache.set(spriteId, next);
      return next;
    };

    const ensureActorVisual = (
      key: string,
      spriteId: SpriteCharacterId,
      animState: SpriteAnimState,
      animSpeed: number,
      facing: FacingDir,
      labelColor: number
    ): ActorVisual => {
      const existing = runtime.actorVisuals.get(key);
      if (existing) {
        return existing;
      }
      const frameSet = ensureSpriteFrameSet(spriteId);
      const container = new PIXI.Container();

      const shadow = new PIXI.Graphics();
      shadow.ellipse(0, 0, 11, 4);
      shadow.fill({ color: 0x000000, alpha: 0.34 });
      shadow.x = TILE_SIZE / 2;
      shadow.y = TILE_SIZE - 4;
      container.addChild(shadow);

      const sprite = new PIXI.AnimatedSprite(frameSet[animState]);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(SPRITE_SCALE);
      sprite.scale.x = facing === "left" ? -SPRITE_SCALE : SPRITE_SCALE;
      sprite.x = TILE_SIZE / 2;
      sprite.y = TILE_SIZE + 4;
      sprite.roundPixels = true;
      sprite.animationSpeed = animSpeed;
      sprite.play();
      container.addChild(sprite);

      const label = new PIXI.Text({
        text: "",
        style: {
          fill: labelColor,
          fontFamily: "monospace",
          fontSize: 9
        }
      });
      label.x = -6;
      label.y = TILE_SIZE + 8;
      container.addChild(label);

      actorLayer.addChild(container);
      const created: ActorVisual = {
        container,
        sprite,
        label,
        spriteId,
        animState,
        animSpeed,
        facing,
        lastTile: { x: 0, y: 0 }
      };
      runtime.actorVisuals.set(key, created);
      return created;
    };

    const updateActorVisual = (
      key: string,
      spriteId: SpriteCharacterId,
      animState: SpriteAnimState,
      animSpeed: number,
      tile: TileCoord,
      facingHint: FacingDir,
      labelText: string,
      labelColor: number
    ): void => {
      const visual = ensureActorVisual(key, spriteId, animState, animSpeed, facingHint, labelColor);
      const frameSet = ensureSpriteFrameSet(spriteId);
      if (
        visual.spriteId !== spriteId ||
        visual.animState !== animState ||
        Math.abs(visual.animSpeed - animSpeed) > 0.0001
      ) {
        visual.sprite.textures = frameSet[animState];
        visual.sprite.animationSpeed = animSpeed;
        visual.sprite.play();
        visual.spriteId = spriteId;
        visual.animState = animState;
        visual.animSpeed = animSpeed;
      }
      const isFirstRender = visual.label.text.length === 0;
      const inferredFacing: FacingDir = isFirstRender
        ? facingHint
        : tile.x > visual.lastTile.x
          ? "right"
          : tile.x < visual.lastTile.x
            ? "left"
            : visual.facing ?? facingHint;
      if (inferredFacing !== visual.facing) {
        visual.sprite.scale.x = inferredFacing === "left" ? -SPRITE_SCALE : SPRITE_SCALE;
        visual.facing = inferredFacing;
      } else if (visual.facing !== facingHint && tile.x === visual.lastTile.x) {
        visual.sprite.scale.x = facingHint === "left" ? -SPRITE_SCALE : SPRITE_SCALE;
        visual.facing = facingHint;
      }
      visual.container.x = tile.x * TILE_SIZE + 4;
      visual.container.y = tile.y * TILE_SIZE + 2;
      visual.label.text = labelText;
      visual.lastTile = { x: tile.x, y: tile.y };
    };

    const activeActorKeys = new Set<string>();
    npcActors.forEach((npc) => {
      const animState = getSpriteAnimStateFromLoop(npc.state === "idle" ? "idle" : npc.state);
      updateActorVisual(
        npc.id,
        npc.spriteId,
        animState,
        getNpcSpriteAnimationSpeed(npc.role, animState),
        npc.tile,
        npc.facing,
        npc.name,
        0xa7f3d0
      );
      activeActorKeys.add(npc.id);
    });

    const mainActorKey = "main-agent";
    const mainFacingHint: FacingDir = getLoopTargetTile(sceneSync.loopState).x >= mainAgentTile.x ? "right" : "left";
    updateActorVisual(
      mainActorKey,
      getLeadSpriteId(sceneSync.probeState),
      getSpriteAnimStateFromLoop(sceneSync.loopState),
      getMainSpriteAnimationSpeed(getSpriteAnimStateFromLoop(sceneSync.loopState)),
      mainAgentTile,
      mainFacingHint,
      `${agentName} - ${getLoopLabel(sceneSync.loopState)}`,
      0xffffff
    );
    activeActorKeys.add(mainActorKey);

    runtime.actorVisuals.forEach((visual, key) => {
      if (activeActorKeys.has(key)) {
        return;
      }
      actorLayer.removeChild(visual.container);
      visual.container.destroy({ children: true });
      runtime.actorVisuals.delete(key);
    });

    app.renderer.render(app.stage);
  }, [agentName, mainAgentTile, npcActors, rendererMode, sceneSync]);

  const onAddRoomItem = (): void => {
    applyRoomMutation((previous) => {
      const result = autoPlaceRoomTileItem(previous, newItemKind, newItemLabel, newItemVariantId);
      if (!result.added) {
        emitEditorAction({ type: "add-blocked", kind: newItemKind, tile: { x: 0, y: 0 } });
        return previous;
      }
      setSelectedItemId(result.added.id);
      setNewItemLabel("");
      emitEditorAction({
        type: "add",
        itemId: result.added.id,
        kind: result.added.kind,
        tile: result.added.tile
      });
      return result.items;
    });
  };

  const onRemoveSelectedItem = (): void => {
    if (!selectedItemId) {
      return;
    }
    applyRoomMutation((previous) => {
      const result = removeRoomTileItem(previous, selectedItemId);
      if (!result.removed) {
        return previous;
      }
      emitEditorAction({ type: "remove", itemId: selectedItemId });
      return result.items;
    });
    setSelectedItemId(null);
  };

  const onResetRoomLayout = (): void => {
    const defaults = createDefaultRoomItems();
    setRoomItems(defaults);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryDepth({ undo: 0, redo: 0 });
    setSelectedItemId(null);
    setMainAgentTile(IDLE_TILE);
    setMainAgentPath([]);
    emitEditorAction({ type: "reset" });
  };

  const nudgeSelectedItem = (deltaX: number, deltaY: number): void => {
    if (!selectedItemId || !selectedItem || selectedItem.locked) {
      return;
    }
    const target = clampTile(
      {
        x: selectedItem.tile.x + deltaX,
        y: selectedItem.tile.y + deltaY
      },
      selectedItem.width,
      selectedItem.height
    );
    moveItemToTile(selectedItemId, target);
  };

  const onToggleSelectedLock = (): void => {
    if (!selectedItemId) {
      return;
    }
    applyRoomMutation((previous) => {
      const toggled = toggleRoomTileItemLock(previous, selectedItemId);
      if (toggled.locked === null) {
        return previous;
      }
      emitEditorAction({ type: "toggle-lock", itemId: selectedItemId, locked: toggled.locked });
      return toggled.items;
    });
  };

  const onBringSelectedFront = (): void => {
    if (!selectedItemId) {
      return;
    }
    applyRoomMutation((previous) => {
      const top = previous.reduce((max, item) => Math.max(max, item.zIndex), 1);
      return previous.map((item) =>
        item.id === selectedItemId
          ? {
              ...item,
              zIndex: top + 1
            }
          : item
      );
    });
  };

  const onUndo = (): void => {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) {
      return;
    }
    setRoomItems((current) => {
      redoStackRef.current.push(cloneRoomItems(current));
      setHistoryDepth({
        undo: undoStackRef.current.length,
        redo: redoStackRef.current.length
      });
      return cloneRoomItems(snapshot);
    });
    emitEditorAction({ type: "reset" });
  };

  const onRedo = (): void => {
    const snapshot = redoStackRef.current.pop();
    if (!snapshot) {
      return;
    }
    setRoomItems((current) => {
      undoStackRef.current.push(cloneRoomItems(current));
      setHistoryDepth({
        undo: undoStackRef.current.length,
        redo: redoStackRef.current.length
      });
      return cloneRoomItems(snapshot);
    });
    emitEditorAction({ type: "reset" });
  };

  const onNewItemKindChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const nextKind = event.target.value as RoomItemKind;
    setNewItemKind(nextKind);
    setNewItemVariantId(getDefaultRoomPropVariantId(nextKind));
  };

  const onNewItemVariantChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    setNewItemVariantId(event.target.value as RoomItemVariantId);
  };

  const onNewItemLabelChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setNewItemLabel(event.target.value);
  };

  const onSelectedVariantChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    if (!selectedItemId) {
      return;
    }
    const nextVariant = event.target.value as RoomItemVariantId;
    applyRoomMutation((previous) =>
      previous.map((item) => (item.id === selectedItemId ? { ...item, variantId: nextVariant } : item))
    );
  };

  const newItemVariants = listRoomPropVariants(newItemKind);
  const selectedItemVariants = selectedItem ? listRoomPropVariants(selectedItem.kind) : [];
  const selectedVariantLabel = selectedItem
    ? getRoomPropVariant(selectedItem.kind, selectedItem.variantId).label
    : "none";

  const selectedItemSummary = useMemo(() => {
    if (!selectedItem) {
      return "none";
    }
    return `${selectedItem.label} (${selectedVariantLabel}) [${selectedItem.tile.x}, ${selectedItem.tile.y}]${selectedItem.locked ? " [locked]" : ""}`;
  }, [selectedItem, selectedVariantLabel]);

  const canMoveSelected = Boolean(selectedItem && !selectedItem.locked);
  const isRendererFallback = rendererMode === "fallback";
  const loopEventCause = sceneSync.lastLoopEvent
    ? `${sceneSync.lastLoopEvent.type}:${sceneSync.lastLoopEvent.phase}${sceneSync.lastLoopEvent.detail ? `:${sceneSync.lastLoopEvent.detail}` : ""}`
    : "none";
  const pathStatusLabel = isMainPathUnreachable ? "unreachable" : "ok";
  const showLegacyZones = Boolean(accountPoolZone || runtimeProfileZone || probeMonitorZone || historyBoardZone);

  return (
    <section className="office-board-scene">
      <div className="office-board-chrome">
        <span className="office-lamp">{t("board.badge.room")}</span>
        <span className="office-memo">{t("board.badge.grid", { cols: GRID_COLS, rows: GRID_ROWS })}</span>
        <span className="office-memo">{t("board.badge.agents", { count: sceneSync.activeAgents })}</span>
        <span className="office-memo">{getLoopLabel(sceneSync.loopState, t)}</span>
      </div>

      <details className="office-room-toolbar card compact">
        <summary className="office-room-toolbar-summary">
          <div>
            <strong>{t("board.editorTitle")}</strong>
            <p className="hint">{t("board.editorSubtitle")}</p>
          </div>
          <div className="office-room-toolbar-summary-meta">
            <span>{editorMode}</span>
            <span>{roomItems.length} assets</span>
            <span>{selectedItem ? selectedItem.label : "no selection"}</span>
          </div>
        </summary>
        <div className="office-room-toolbar-grid">
          <label>
            <span>{t("board.assetType")}</span>
            <select aria-label={t("board.assetType")} value={newItemKind} onChange={onNewItemKindChange}>
              {roomItemKinds.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("board.assetVariant")}</span>
            <select
              aria-label={t("board.assetVariant")}
              value={newItemVariantId}
              onChange={onNewItemVariantChange}
              disabled={newItemVariants.length <= 1}
            >
              {newItemVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("board.assetLabel")}</span>
            <input
              aria-label={t("board.assetLabel")}
              value={newItemLabel}
              onChange={onNewItemLabelChange}
              placeholder={t("board.assetPlaceholder")}
            />
          </label>
          <div className="row-actions">
            <button type="button" onClick={onAddRoomItem}>
              {t("board.addAsset")}
            </button>
            <button type="button" className="secondary" onClick={() => setEditorMode("place")}>
              {t("board.placeMode")}
            </button>
            <button type="button" className="secondary" onClick={() => setEditorMode("move")}>
              {t("board.moveMode")}
            </button>
            <button type="button" className="secondary" onClick={() => setEditorMode("select")}>
              {t("board.selectMode")}
            </button>
            <button type="button" className="secondary" onClick={onUndo} disabled={historyDepth.undo === 0}>
              {t("board.undo")}
            </button>
            <button type="button" className="secondary" onClick={onRedo} disabled={historyDepth.redo === 0}>
              {t("board.redo")}
            </button>
            <button type="button" className="secondary" onClick={onRemoveSelectedItem} disabled={!selectedItemId || !!selectedItem?.locked}>
              {t("board.removeSelected")}
            </button>
            <button type="button" className="secondary" onClick={onResetRoomLayout}>
              {t("board.resetRoom")}
            </button>
          </div>
        </div>

        <div className="room-item-control-grid">
          <div className="room-item-move-panel" aria-label="Selected item controls">
            <p className="hint">{t("board.selected", { item: selectedItemSummary })}</p>
            <div className="room-move-pad">
              <button type="button" className="secondary" onClick={() => nudgeSelectedItem(0, -1)} disabled={!canMoveSelected}>
                {t("board.up")}
              </button>
              <button type="button" className="secondary" onClick={() => nudgeSelectedItem(-1, 0)} disabled={!canMoveSelected}>
                {t("board.left")}
              </button>
              <button type="button" className="secondary" onClick={() => nudgeSelectedItem(1, 0)} disabled={!canMoveSelected}>
                {t("board.right")}
              </button>
              <button type="button" className="secondary" onClick={() => nudgeSelectedItem(0, 1)} disabled={!canMoveSelected}>
                {t("board.down")}
              </button>
            </div>
          </div>

          <div className="room-item-extra-controls">
            <label>
              <span>{t("board.assetVariant")}</span>
              <select
                aria-label={t("board.assetVariant")}
                value={selectedItem?.variantId ?? ""}
                onChange={onSelectedVariantChange}
                disabled={!selectedItemId || selectedItemVariants.length <= 1}
              >
                {selectedItemVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="secondary" onClick={onToggleSelectedLock} disabled={!selectedItemId}>
              {selectedItem?.locked ? t("board.unlockSelected") : t("board.lockSelected")}
            </button>
            <button type="button" className="secondary" onClick={onBringSelectedFront} disabled={!selectedItemId}>
              {t("board.bringFront")}
            </button>
          </div>
        </div>

        <div className="office-tile-roster" aria-label="Room items">
          {roomItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`room-item-row${selectedItemId === item.id ? " active" : ""}`}
              onClick={() => {
                setSelectedItemId(item.id);
                emitEditorAction({ type: "select", itemId: item.id });
              }}
              aria-label={`Room item ${item.label}`}
            >
              <strong>{item.label}</strong>
              <span>
                {item.kind} · {getRoomPropVariant(item.kind, item.variantId).label} [{item.tile.x},{item.tile.y}]{" "}
                {item.locked ? "locked" : "open"}
              </span>
            </button>
          ))}
        </div>
      </details>

      <div className="office-board-map-wrap">
        <div className="office-board-map" aria-label="Office pixel room map">
          <div
            className={`office-board-map-scroll${isMapPanning ? " is-panning" : ""}`}
            data-pan-enabled="true"
            ref={mapViewportRef}
          >
            <div className="pixel-room-stage" ref={mapHostRef} />
          </div>
          {isRendererFallback ? (
            <div className="office-map-fallback">
              <p>{t("board.fallback")}</p>
              <p className="hint">
                mode={editorMode} loop={getLoopLabel(sceneSync.loopState, t)} probe={probePresentation.stateLabel}
              </p>
              <p className="hint">event={loopEventCause} path={pathStatusLabel}</p>
              <div className="office-map-fallback-grid">
                {roomItems.map((item) => (
                  <div
                    key={`fallback-${item.id}`}
                    className={`office-map-fallback-item${selectedItemId === item.id ? " selected" : ""}`}
                    style={{
                      left: `${(item.tile.x / GRID_COLS) * 100}%`,
                      top: `${(item.tile.y / GRID_ROWS) * 100}%`
                    }}
                  >
                    {item.label}
                  </div>
                ))}
                <div
                  className="office-map-fallback-agent"
                  style={{
                    left: `${(mainAgentTile.x / GRID_COLS) * 100}%`,
                    top: `${(mainAgentTile.y / GRID_ROWS) * 100}%`
                  }}
                >
                  {agentName}
                </div>
                {npcActors.map((npc) => (
                  <div
                    key={`fallback-npc-${npc.id}`}
                    className="office-map-fallback-agent"
                    style={{
                      left: `${(npc.tile.x / GRID_COLS) * 100}%`,
                      top: `${(npc.tile.y / GRID_ROWS) * 100}%`
                    }}
                  >
                    {`${npc.name} (${getLoopLabel(npc.state, t)})`}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="office-map-minimap" aria-label="Office minimap">
          <header>
            <strong>{t("board.minimap")}</strong>
            <span>{t("board.assets", { count: roomItems.length })}</span>
          </header>
          <div className="office-map-minimap-canvas">
            <span className="minimap-zone minimap-work" />
            <span className="minimap-zone minimap-pm" />
            <span className="minimap-zone minimap-infra" />
            <span className="minimap-zone minimap-history" />
            {roomItems.map((item) => (
              <span
                key={`mini-${item.id}`}
                className={`minimap-item minimap-item-${item.kind}${selectedItemId === item.id ? " active" : ""}`}
                style={{ left: `${(item.tile.x / GRID_COLS) * 100}%`, top: `${(item.tile.y / GRID_ROWS) * 100}%`, zIndex: item.zIndex }}
                aria-hidden="true"
              />
            ))}
            {npcActors.map((npc) => (
              <span
                key={`mini-agent-${npc.id}`}
                className={`minimap-agent-dot minimap-agent-ambient tone-${npc.tone}`}
                style={{ left: `${(npc.tile.x / GRID_COLS) * 100}%`, top: `${(npc.tile.y / GRID_ROWS) * 100}%` }}
                aria-hidden="true"
              />
            ))}
            <span
              className="minimap-agent-dot"
              style={{ left: `${(mainAgentTile.x / GRID_COLS) * 100}%`, top: `${(mainAgentTile.y / GRID_ROWS) * 100}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="hint">state={probePresentation.stateLabel} | loop={getLoopLabel(sceneSync.loopState, t)}</p>
          <p className="hint">event: {loopEventCause}</p>
          <p className="hint">{t("board.path")}: {pathStatusLabel}</p>
          <p className="hint">{t("board.lastAction")}: {sceneSync.lastActionAt}</p>
          <p className="hint">{t("board.undoRedo", { undo: historyDepth.undo, redo: historyDepth.redo })}</p>
          <p className="hint">{pmName}</p>
        </aside>
      </div>

      {showLegacyZones ? (
        <div className="office-board-grid">
          {accountPoolZone ? (
            <BoardZone
              title="Account Pool Zone"
              subtitle="Provider resource tanks and fatigue"
              className={getZoneClassName(emphasisTarget, "account-pool")}
            >
              {accountPoolZone}
            </BoardZone>
          ) : null}
          {runtimeProfileZone ? (
            <BoardZone
              title="Runtime Profile Cabinet"
              subtitle="Profile lifecycle and safe delete"
              className={getZoneClassName(emphasisTarget, "runtime-profile")}
            >
              {runtimeProfileZone}
            </BoardZone>
          ) : null}
          {probeMonitorZone ? (
            <BoardZone
              title="Probe Monitor Panel"
              subtitle="Run probe and inspect latest classification"
              className={getZoneClassName(emphasisTarget, "probe-monitor")}
            >
              {probeMonitorZone}
            </BoardZone>
          ) : null}
          {historyBoardZone ? (
            <BoardZone
              title="History Board"
              subtitle="Filtered records with retry and empty guidance"
              className={getZoneClassName(emphasisTarget, "history-board")}
            >
              {historyBoardZone}
            </BoardZone>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
