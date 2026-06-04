import type { MutableRefObject } from "react";
import { Container, Graphics, Sprite, Text, TextStyle, type Application, type Texture } from "pixi.js";
import type { Agent } from "../../types";
import { localeName } from "../../i18n";
import type { CallbackSnapshot, BreakAnimItem } from "./buildScene-types";
import { BREAK_ROOM_H, TARGET_CHAR_H, type RoomTheme, type WallClockVisual } from "./model";
import { BREAK_CHAT_MESSAGES, BREAK_SPOTS, type SupportedLocale } from "./themes-locale";
import {
  blendColor,
  contrastTextColor,
  drawAmbientGlow,
  drawBunting,
  drawCeilingLight,
  drawPictureFrame,
  drawRoomAtmosphere,
  drawTiledFloor,
  drawTrashCan,
  drawWallClock,
  hashStr,
} from "./drawing-core";
import { drawPlant, drawWhiteboard } from "./drawing-furniture-a";
import {
  drawBookshelf,
  drawCoffeeMachine,
  drawCoffeeTable,
  drawHighTable,
  drawSofa,
  drawVendingMachine,
  drawWallMonitor,
} from "./drawing-furniture-b";
import type { OfficeFloorBand, SharedFacilityLayout } from "./officeFloorPlan";
import { addOfficePropSprite, type OfficeAssetKey } from "./officePropAtlas";
import { getSharedFacilityWorkplaceDensity, isLoungeFurnitureAllowed } from "./officeWorkplaceDensity";

interface BuildBreakRoomParams {
  app: Application;
  textures: Record<string, Texture>;
  agents: Agent[];
  spriteMap: Map<string, number>;
  activeLocale: SupportedLocale;
  breakTheme: RoomTheme;
  isDark: boolean;
  breakRoomY: number;
  OFFICE_W: number;
  sharedFacilities?: SharedFacilityLayout[];
  floorBands?: OfficeFloorBand[];
  cbRef: MutableRefObject<CallbackSnapshot>;
  breakAnimItemsRef: MutableRefObject<BreakAnimItem[]>;
  breakBubblesRef: MutableRefObject<Container[]>;
  breakSteamParticlesRef: MutableRefObject<Container | null>;
  breakRoomRectRef: MutableRefObject<{ x: number; y: number; w: number; h: number } | null>;
  wallClocksRef: MutableRefObject<WallClockVisual[]>;
  agentPosRef: MutableRefObject<Map<string, { x: number; y: number }>>;
}

export function buildBreakRoom({
  app,
  textures,
  agents,
  spriteMap,
  activeLocale,
  breakTheme,
  isDark,
  breakRoomY,
  OFFICE_W,
  sharedFacilities,
  floorBands,
  cbRef,
  breakAnimItemsRef,
  breakBubblesRef,
  breakSteamParticlesRef,
  breakRoomRectRef,
  wallClocksRef,
  agentPosRef,
}: BuildBreakRoomParams): void {
  const breakAgents = agents.filter((agent) => agent.status === "break");
  breakAnimItemsRef.current = [];
  breakBubblesRef.current = [];

  const breakRoom = new Container();
  const brx = 4;
  const bry = breakRoomY;
  const sharedContentRight = Math.max(0, ...(sharedFacilities ?? []).map((facility) => facility.x + facility.w));
  const sharedContentBottom = Math.max(
    bry + BREAK_ROOM_H,
    ...(sharedFacilities ?? []).map((facility) => facility.y + facility.h),
    ...(floorBands ?? [])
      .filter((band) => band.id === "shared" || band.id === "rooftop")
      .map((band) => band.y + band.h),
  );
  const brw = Math.min(OFFICE_W - 8, Math.max(360, sharedContentRight + 8));
  const brh = Math.max(BREAK_ROOM_H, sharedContentBottom - bry + 8);
  breakRoomRectRef.current = { x: brx, y: bry, w: brw, h: brh };

  const brFloor = new Graphics();
  drawTiledFloor(brFloor, brx, bry, brw, brh, breakTheme.floor1, breakTheme.floor2);
  breakRoom.addChild(brFloor);
  drawRoomAtmosphere(breakRoom, brx, bry, brw, brh, breakTheme.wall, breakTheme.accent);

  const brBorder = new Graphics();
  brBorder.roundRect(brx, bry, brw, brh, 3).stroke({ width: 2, color: breakTheme.wall });
  brBorder.roundRect(brx - 1, bry - 1, brw + 2, brh + 2, 4).stroke({ width: 1, color: breakTheme.accent, alpha: 0.25 });
  breakRoom.addChild(brBorder);

  drawSharedFloorHeader(breakRoom, brx, bry, brw, breakTheme.accent, floorBands);
  drawSharedFacilities(breakRoom, sharedFacilities ?? [], breakTheme, textures, cbRef);

  drawAmbientGlow(breakRoom, brx + brw / 2, bry + brh / 2, brw * 0.3, breakTheme.accent, 0.05);
  drawCeilingLight(breakRoom, brx + brw / 3, bry + 6, breakTheme.accent);
  drawCeilingLight(breakRoom, brx + (brw * 2) / 3, bry + 6, breakTheme.accent);
  drawBunting(
    breakRoom,
    brx + 14,
    bry + 16,
    brw - 28,
    blendColor(0xb5d6cf, 0xffffff, 0.18),
    blendColor(0xdcb7bf, 0xffffff, 0.08),
    0.64,
  );

  drawOfficeReceptionSpine(breakRoom, brx + 16, bry + 22, brw - 32, breakTheme.accent);

  drawPictureFrame(breakRoom, brx + brw / 2 - 8, bry + 14);
  wallClocksRef.current.push(drawWallClock(breakRoom, brx + brw / 2 + 30, bry + 18));
  drawTrashCan(breakRoom, brx + 40, bry + brh - 14);

  const brSignW = 84;
  const brSignBg = new Graphics();
  brSignBg.roundRect(brx + brw / 2 - brSignW / 2 + 1, bry - 3, brSignW, 18, 4).fill({ color: 0x000000, alpha: 0.12 });
  brSignBg.roundRect(brx + brw / 2 - brSignW / 2, bry - 4, brSignW, 18, 4).fill(breakTheme.accent);
  breakRoom.addChild(brSignBg);
  const breakSignTextColor = isDark ? 0xffffff : contrastTextColor(breakTheme.accent);
  const brSignTxt = new Text({
    text: "공용 사무 구역",
    style: new TextStyle({
      fontSize: 9,
      fill: breakSignTextColor,
      fontWeight: "bold",
      fontFamily: "system-ui, sans-serif",
      dropShadow: isDark ? { alpha: 0.6, blur: 2, distance: 1, color: 0x000000 } : undefined,
    }),
  });
  brSignTxt.anchor.set(0.5, 0.5);
  brSignTxt.position.set(brx + brw / 2, bry + 5);
  breakRoom.addChild(brSignTxt);

  drawOfficeCirculationPath(breakRoom, brx + 28, bry + brh / 2 + 10, brw - 56, breakTheme.accent);

  const steamContainer = new Container();
  breakRoom.addChild(steamContainer);
  breakSteamParticlesRef.current = steamContainer;

  breakAgents.forEach((agent, index) => {
    const spot = BREAK_SPOTS[index % BREAK_SPOTS.length];
    const seed = hashStr(agent.id);
    const offsetX = (seed % 7) - 3;
    const offsetY = ((seed % 5) - 2) * 0.6;

    const spotX = spot.x >= 0 ? brx + spot.x + offsetX : brx + brw - 16 + spot.x + offsetX;
    const spotY = bry + spot.y + offsetY;

    agentPosRef.current.set(agent.id, { x: spotX, y: spotY });

    const spriteNum = spriteMap.get(agent.id) ?? (seed % 44) + 1;
    const charContainer = new Container();
    charContainer.position.set(spotX, spotY);
    charContainer.eventMode = "static";
    charContainer.cursor = "pointer";
    charContainer.on("pointerdown", () => cbRef.current.onSelectAgent(agent));

    const dirKey = `${spriteNum}-${spot.dir}-1`;
    const fallbackKey = `${spriteNum}-D-1`;
    const texture = textures[dirKey] || textures[fallbackKey];

    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      const scale = (TARGET_CHAR_H * 0.85) / sprite.texture.height;
      sprite.scale.set(scale);
      charContainer.addChild(sprite);
    } else {
      const fallback = new Text({ text: agent.avatar_emoji || "AG", style: new TextStyle({ fontSize: 12 }) });
      fallback.anchor.set(0.5, 1);
      charContainer.addChild(fallback);
    }
    breakRoom.addChild(charContainer);

    breakAnimItemsRef.current.push({
      sprite: charContainer,
      baseX: spotX,
      baseY: spotY,
    });

    const breakLabel = new Text({
      text: "\uD734\uC2DD",
      style: new TextStyle({ fontSize: 7, fill: 0x4a3a2a, fontFamily: "system-ui, sans-serif" }),
    });
    breakLabel.anchor.set(0.5, 0.5);
    breakLabel.position.set(spotX + 16, spotY - 10);
    breakRoom.addChild(breakLabel);

    const nameTag = new Text({
      text: localeName(activeLocale, agent),
      style: new TextStyle({ fontSize: 6, fill: 0x4a3a2a, fontFamily: "system-ui, sans-serif" }),
    });
    nameTag.anchor.set(0.5, 0);
    const ntW = nameTag.width + 4;
    const ntBg = new Graphics();
    ntBg.roundRect(spotX - ntW / 2, spotY + 2, ntW, 9, 2).fill({ color: 0xffffff, alpha: 0.8 });
    breakRoom.addChild(ntBg);
    nameTag.position.set(spotX, spotY + 3);
    breakRoom.addChild(nameTag);
  });

  if (breakAgents.length > 0) {
    const phase = Math.floor(Date.now() / 4000);
    const speakerCount = Math.min(2, breakAgents.length);
    for (let speakerIndex = 0; speakerIndex < speakerCount; speakerIndex++) {
      const speakerIdx = (phase + speakerIndex) % breakAgents.length;
      const agent = breakAgents[speakerIdx];
      const spot = BREAK_SPOTS[speakerIdx % BREAK_SPOTS.length];
      const seed = hashStr(agent.id);
      const spotX = spot.x >= 0 ? brx + spot.x + ((seed % 7) - 3) : brx + brw - 16 + spot.x + ((seed % 7) - 3);
      const spotY = bry + spot.y + ((seed % 5) - 2) * 0.6;

      const chatPool = BREAK_CHAT_MESSAGES[activeLocale] || BREAK_CHAT_MESSAGES.ko;
      const msg = chatPool[(seed + phase) % chatPool.length];
      const bubbleText = new Text({
        text: msg,
        style: new TextStyle({ fontSize: 7, fill: 0x333333, fontFamily: "system-ui, sans-serif" }),
      });
      bubbleText.anchor.set(0.5, 1);
      const bw = bubbleText.width + 10;
      const bh = bubbleText.height + 6;
      const bubbleTop = spotY - TARGET_CHAR_H * 0.85 - bh - 4;

      const bubbleG = new Graphics();
      bubbleG.roundRect(spotX - bw / 2, bubbleTop, bw, bh, 4).fill(0xfff8f0);
      bubbleG.roundRect(spotX - bw / 2, bubbleTop, bw, bh, 4).stroke({
        width: 1.2,
        color: breakTheme.accent,
        alpha: 0.5,
      });
      bubbleG
        .moveTo(spotX - 3, bubbleTop + bh)
        .lineTo(spotX, bubbleTop + bh + 4)
        .lineTo(spotX + 3, bubbleTop + bh)
        .fill(0xfff8f0);
      breakRoom.addChild(bubbleG);
      bubbleText.position.set(spotX, bubbleTop + bh - 3);
      breakRoom.addChild(bubbleText);

      const bubbleContainer = new Container();
      bubbleContainer.addChild(bubbleG);
      breakRoom.removeChild(bubbleG);
      breakRoom.removeChild(bubbleText);
      bubbleContainer.addChild(bubbleG);
      bubbleContainer.addChild(bubbleText);
      breakRoom.addChild(bubbleContainer);
      breakBubblesRef.current.push(bubbleContainer);
    }
  }

  app.stage.addChild(breakRoom);
}

function drawSharedFloorHeader(
  breakRoom: Container,
  brx: number,
  bry: number,
  brw: number,
  accent: number,
  floorBands: OfficeFloorBand[] | undefined,
): void {
  const floor = floorBands?.find((band) => band.id === "shared");
  drawFloorSectionHeader(
    breakRoom,
    brx,
    bry,
    brw,
    `${floor?.label ?? "공용 사무 구역"} / 입구 / 휴게실 / 기억 서고 / 프로젝트 보드`,
    accent,
  );

  const rooftop = floorBands?.find((band) => band.id === "rooftop");
  if (rooftop) {
    drawFloorSectionHeader(
      breakRoom,
      brx,
      rooftop.y,
      brw,
      `${rooftop.label} / 전망 휴게 / 식물 정원 / 리뷰 테라스`,
      rooftop.accent,
    );
  }
}

function drawFloorSectionHeader(
  breakRoom: Container,
  brx: number,
  bry: number,
  brw: number,
  text: string,
  accent: number,
): void {
  const header = new Text({
    text,
    style: new TextStyle({
      fontSize: 9,
      fill: 0xffffff,
      fontWeight: "bold",
      fontFamily: "system-ui, sans-serif",
    }),
  });
  const bg = new Graphics();
  bg.roundRect(brx + 10, bry + 8, Math.min(brw - 20, header.width + 20), 18, 5).fill({
    color: accent,
    alpha: 0.86,
  });
  breakRoom.addChild(bg);
  header.position.set(brx + 20, bry + 12);
  breakRoom.addChild(header);
}

function drawSharedFacilities(
  breakRoom: Container,
  facilities: SharedFacilityLayout[],
  breakTheme: RoomTheme,
  textures: Record<string, Texture>,
  cbRef: MutableRefObject<CallbackSnapshot>,
): void {
  for (const facility of facilities) {
    const zone = new Graphics();
    const density = getSharedFacilityWorkplaceDensity(facility.id);
    const zoneColor =
      facility.id === "lobby"
        ? 0xf4ead8
        : facility.id === "memory"
          ? 0xddebf6
          : facility.id === "project-board"
            ? 0xdcdff0
            : facility.id === "smoking"
              ? 0xd9e1dc
              : facility.id === "roof-garden"
                ? 0xdcefd7
                : facility.id === "roof-lounge"
                  ? 0xe8e7d4
                  : 0xffeadb;
    drawFacilityShell(breakRoom, facility, zoneColor, breakTheme.accent);
    zone.roundRect(facility.x, facility.y, facility.w, facility.h, 6).fill({ color: zoneColor, alpha: 0.72 });
    zone.roundRect(facility.x, facility.y, facility.w, facility.h, 6).stroke({
      width: 1,
      color: breakTheme.accent,
      alpha: 0.36,
    });
    if (facility.id === "memory") {
      zone.eventMode = "static";
      zone.cursor = "pointer";
      zone.on("pointerdown", () => cbRef.current.onOpenMemory?.());
    }
    if (facility.id === "project-board") {
      zone.eventMode = "static";
      zone.cursor = "pointer";
      zone.on("pointerdown", () => cbRef.current.onOpenProjects?.());
    }
    breakRoom.addChild(zone);

    const label = new Text({
      text: facility.label,
      style: new TextStyle({
        fontSize: 8,
        fill: 0x3f3424,
        fontWeight: "bold",
        fontFamily: "system-ui, sans-serif",
      }),
    });
    label.position.set(facility.x + 8, facility.y + 6);
    breakRoom.addChild(label);

    if (facility.id === "lobby") {
      drawWallMonitor(breakRoom, facility.x + facility.w - 70, facility.y + 12, breakTheme.accent, 52, 26);
      drawPlant(breakRoom, facility.x + 18, facility.y + facility.h - 20, 1);
      drawReceptionDesk(breakRoom, facility.x + 46, facility.y + facility.h - 48, Math.min(96, facility.w - 126), breakTheme.accent);
      drawFacilityWindowRow(
        breakRoom,
        facility.x + 82,
        facility.y + 16,
        Math.max(42, facility.w - 164),
        breakTheme.accent,
      );
    } else if (facility.id === "break" && density.loungeAllowed) {
      addFacilityPropOrFallback(breakRoom, textures, "lounge", facility.x + 82, facility.y + facility.h - 30, 92, 58, () => {
        drawSofa(breakRoom, facility.x + 14, facility.y + facility.h - 28, 0xd49aa4);
        drawCoffeeTable(breakRoom, facility.x + 100, facility.y + facility.h - 32);
      });
      addFacilityPropOrFallback(breakRoom, textures, "coffee", facility.x + facility.w - 50, facility.y + 52, 58, 56, () =>
        drawCoffeeMachine(breakRoom, facility.x + facility.w - 44, facility.y + 18),
      );
      drawVendingMachine(breakRoom, facility.x + facility.w - 74, facility.y + 18);
      drawMiniPendantLights(breakRoom, facility.x + 24, facility.y + 10, facility.w - 48, 0xf8d488);
    } else if (facility.id === "memory") {
      addFacilityPropOrFallback(breakRoom, textures, "archiveCabinet", facility.x + 34, facility.y + 62, 48, 74, () =>
        drawBookshelf(breakRoom, facility.x + 12, facility.y + 22),
      );
      addFacilityPropOrFallback(breakRoom, textures, "memoryBoxes", facility.x + facility.w - 58, facility.y + facility.h - 32, 72, 48, () =>
        drawWhiteboard(breakRoom, facility.x + facility.w - 58, facility.y + 18),
      );
      drawHighTable(breakRoom, facility.x + Math.max(46, facility.w / 2 - 18), facility.y + facility.h - 44);
      drawFacilityStatusBadge(breakRoom, facility.x + facility.w - 74, facility.y + 18, "기억 준비", 0x22c55e);
      drawMiniPendantLights(breakRoom, facility.x + 24, facility.y + 10, facility.w - 48, 0x93c5fd);
    } else if (facility.id === "project-board") {
      drawProjectWarDesk(breakRoom, facility.x + 14, facility.y + facility.h - 48, Math.min(104, facility.w - 134), 0x8192c8);
      addFacilityPropOrFallback(breakRoom, textures, "projectBoard", facility.x + facility.w - 72, facility.y + 50, 72, 52, () =>
        drawWallMonitor(breakRoom, facility.x + facility.w - 66, facility.y + 14, 0x8192c8, 48, 24),
      );
      addFacilityPropOrFallback(breakRoom, textures, "serverRack", facility.x + 70, facility.y + facility.h - 38, 38, 48, () =>
        drawProjectScopePins(breakRoom, facility.x + 64, facility.y + 26),
      );
      drawProjectScopePins(breakRoom, facility.x + facility.w - 118, facility.y + 20);
      drawPlant(breakRoom, facility.x + facility.w - 24, facility.y + facility.h - 20, 2);
      drawFacilityWindowRow(breakRoom, facility.x + 74, facility.y + 17, Math.max(36, facility.w - 154), 0x8192c8);
    } else if (facility.id === "smoking") {
      drawSmokingRoom(breakRoom, facility, breakTheme.accent);
    } else if (facility.id === "roof-garden") {
      drawRoofGarden(breakRoom, facility);
    } else {
      drawRoofLounge(breakRoom, facility, breakTheme.accent);
    }
  }
}

function addFacilityPropOrFallback(
  parent: Container,
  textures: Record<string, Texture>,
  assetKey: OfficeAssetKey,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  fallback: () => void,
): void {
  const sprite = addOfficePropSprite(parent, textures, assetKey, { x, y, maxW, maxH });
  if (!sprite) fallback();
}

function drawOfficeReceptionSpine(parent: Container, x: number, y: number, w: number, accent: number): void {
  const g = new Graphics();
  g.roundRect(x, y + 4, Math.min(150, w * 0.34), 28, 4).fill(0xd6b984).stroke({
    width: 1,
    color: 0x8b7358,
    alpha: 0.32,
  });
  g.roundRect(x + 10, y + 10, 38, 12, 2).fill(0x172033);
  g.roundRect(x + 13, y + 12, 32, 7, 1).fill({ color: blendColor(accent, 0xffffff, 0.44), alpha: 0.85 });
  g.rect(x + 26, y + 22, 5, 7).fill(0x475569);
  g.roundRect(x + 70, y + 12, 54, 8, 2).fill({ color: 0xffffff, alpha: 0.86 });
  g.rect(x + 76, y + 15, 34, 1.4).fill({ color: accent, alpha: 0.55 });

  const rackX = x + w - 132;
  g.roundRect(rackX, y, 118, 40, 5).fill({ color: 0x172033, alpha: 0.92 }).stroke({
    width: 1,
    color: accent,
    alpha: 0.44,
  });
  for (let i = 0; i < 4; i += 1) {
    const mx = rackX + 8 + i * 26;
    g.roundRect(mx, y + 8, 20, 14, 2).fill({ color: blendColor(accent, 0xffffff, 0.32), alpha: 0.72 });
    g.circle(mx + 15, y + 27, 2).fill(i % 2 === 0 ? 0x22c55e : 0xf59e0b);
  }
  parent.addChild(g);
}

function drawOfficeCirculationPath(parent: Container, x: number, y: number, w: number, accent: number): void {
  const g = new Graphics();
  g.roundRect(x, y, w, 18, 5).fill({ color: 0x64748b, alpha: 0.08 });
  for (let i = 0; i < 14; i += 1) {
    const px = x + 12 + i * Math.max(18, w / 15);
    g.rect(px, y + 8, 10, 2).fill({ color: accent, alpha: 0.18 });
  }
  parent.addChild(g);
}

function drawReceptionDesk(parent: Container, x: number, y: number, w: number, accent: number): void {
  const g = new Graphics();
  const safeW = Math.max(56, w);
  g.roundRect(x + 2, y + 4, safeW, 30, 4).fill({ color: 0x000000, alpha: 0.08 });
  g.roundRect(x, y, safeW, 30, 4).fill(0xd6b984).stroke({ width: 1, color: 0x8b7358, alpha: 0.34 });
  g.roundRect(x + 8, y + 7, 28, 12, 2).fill(0x172033);
  g.roundRect(x + 11, y + 9, 22, 7, 1).fill({ color: blendColor(accent, 0xffffff, 0.44), alpha: 0.82 });
  g.roundRect(x + safeW - 42, y + 9, 28, 12, 2).fill(0xffffff);
  g.rect(x + safeW - 37, y + 13, 17, 1.5).fill({ color: accent, alpha: 0.5 });
  g.roundRect(x + safeW / 2 - 14, y + 34, 28, 9, 4).fill({ color: 0x64748b, alpha: 0.48 });
  parent.addChild(g);
}

function drawProjectWarDesk(parent: Container, x: number, y: number, w: number, accent: number): void {
  const g = new Graphics();
  const safeW = Math.max(72, w);
  g.roundRect(x, y, safeW, 28, 4).fill(0xd6b984).stroke({ width: 1, color: 0x334155, alpha: 0.24 });
  for (let i = 0; i < 3; i += 1) {
    const px = x + 10 + i * 27;
    g.roundRect(px, y + 6, 20, 10, 2).fill(0x172033);
    g.rect(px + 4, y + 9, 12, 1.4).fill({ color: accent, alpha: 0.64 });
    g.circle(px + 16, y + 19, 2).fill(i === 1 ? 0xf59e0b : 0x22c55e);
  }
  g.roundRect(x + safeW / 2 - 16, y + 32, 32, 8, 4).fill({ color: 0x64748b, alpha: 0.46 });
  parent.addChild(g);
}

function drawFacilityStatusBadge(parent: Container, x: number, y: number, label: string, color: number): void {
  const text = new Text({
    text: label,
    style: new TextStyle({
      fontSize: 7,
      fill: 0xffffff,
      fontWeight: "bold",
      fontFamily: "system-ui, sans-serif",
    }),
  });
  text.anchor.set(0.5, 0.5);
  const badge = new Graphics();
  badge.roundRect(x, y, Math.max(52, text.width + 12), 16, 5).fill({ color, alpha: 0.82 });
  badge.circle(x + 8, y + 8, 3).fill(0xffffff);
  parent.addChild(badge);
  text.position.set(x + Math.max(52, text.width + 12) / 2 + 2, y + 8);
  parent.addChild(text);
}

function drawProjectScopePins(parent: Container, x: number, y: number): void {
  const projects = [
    { label: "BG", color: 0x14b8a6 },
    { label: "DG", color: 0x38bdf8 },
    { label: "JS", color: 0xa78bfa },
  ];
  projects.forEach((project, index) => {
    const px = x + index * 24;
    const pin = new Graphics();
    pin.roundRect(px, y, 20, 16, 4).fill({ color: project.color, alpha: 0.86 });
    pin.rect(px + 8, y + 14, 4, 9).fill({ color: project.color, alpha: 0.72 });
    parent.addChild(pin);
    const label = new Text({
      text: project.label,
      style: new TextStyle({ fontSize: 7, fill: 0xffffff, fontWeight: "bold", fontFamily: "monospace" }),
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(px + 10, y + 8);
    parent.addChild(label);
  });
}

function drawFacilityShell(parent: Container, facility: SharedFacilityLayout, zoneColor: number, accent: number): void {
  const g = new Graphics();
  g.roundRect(facility.x + 3, facility.y + 5, facility.w, facility.h, 8).fill({ color: 0x000000, alpha: 0.12 });
  g.roundRect(facility.x + 1, facility.y + 1, facility.w - 2, 20, 6).fill({
    color: blendColor(zoneColor, accent, 0.18),
    alpha: 0.46,
  });
  g.rect(facility.x + 8, facility.y + facility.h - 10, facility.w - 16, 3).fill({
    color: blendColor(accent, 0x000000, 0.34),
    alpha: 0.26,
  });
  g.roundRect(facility.x + 4, facility.y + 4, facility.w - 8, facility.h - 8, 5).stroke({
    width: 0.8,
    color: 0xffffff,
    alpha: 0.24,
  });
  parent.addChild(g);
}

function drawFacilityWindowRow(parent: Container, x: number, y: number, w: number, accent: number): void {
  const g = new Graphics();
  const safeW = Math.max(30, w);
  g.roundRect(x, y, safeW, 18, 4).fill({ color: 0x10243a, alpha: 0.12 });
  const paneCount = Math.max(1, Math.floor(safeW / 34));
  const gap = 5;
  const paneW = (safeW - gap * (paneCount + 1)) / paneCount;
  for (let i = 0; i < paneCount; i += 1) {
    const px = x + gap + i * (paneW + gap);
    g.roundRect(px, y + 4, paneW, 10, 2).fill({ color: blendColor(accent, 0xffffff, 0.72), alpha: 0.54 });
    g.rect(px + paneW / 2 - 0.5, y + 4, 1, 10).fill({ color: 0xffffff, alpha: 0.28 });
  }
  parent.addChild(g);
}

function drawMiniPendantLights(parent: Container, x: number, y: number, w: number, color: number): void {
  const g = new Graphics();
  const count = Math.max(2, Math.min(5, Math.floor(w / 46)));
  const step = w / count;
  for (let i = 0; i < count; i += 1) {
    const lx = x + step * i + step / 2;
    g.rect(lx, y, 1, 10).fill({ color: 0x5b4632, alpha: 0.5 });
    g.roundRect(lx - 7, y + 9, 14, 5, 2).fill({ color, alpha: 0.82 });
    g.ellipse(lx, y + 17, 18, 6).fill({ color, alpha: 0.08 });
  }
  parent.addChild(g);
}

function drawSmokingRoom(parent: Container, facility: SharedFacilityLayout, accent: number): void {
  const g = new Graphics();
  const boothX = facility.x + 16;
  const boothY = facility.y + 24;
  const boothW = Math.min(86, facility.w * 0.34);
  const boothH = Math.max(38, facility.h - 42);
  g.roundRect(boothX, boothY, boothW, boothH, 6).fill({ color: 0xe8f1ee, alpha: 0.86 });
  g.roundRect(boothX, boothY, boothW, boothH, 6).stroke({ width: 1.2, color: 0x7aa08e, alpha: 0.64 });
  g.rect(boothX + boothW / 2 - 1, boothY + 6, 2, boothH - 12).fill({ color: 0x7aa08e, alpha: 0.26 });
  g.roundRect(boothX + boothW - 20, boothY + 10, 10, 20, 2).fill({ color: 0x9bb7aa, alpha: 0.5 });
  g.roundRect(facility.x + facility.w - 72, facility.y + 22, 44, 18, 5).fill({ color: accent, alpha: 0.22 });
  g.circle(facility.x + facility.w - 52, facility.y + 50, 11).fill({ color: 0x80938a, alpha: 0.24 });
  g.rect(facility.x + facility.w - 60, facility.y + 49, 16, 2).fill({ color: 0x53645d, alpha: 0.54 });
  parent.addChild(g);

  const label = new Text({
    text: "환기 가동",
    style: new TextStyle({ fontSize: 7, fill: 0x47574f, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
  });
  label.position.set(facility.x + facility.w - 68, facility.y + 26);
  parent.addChild(label);
}

function drawRoofGarden(parent: Container, facility: SharedFacilityLayout): void {
  const g = new Graphics();
  g.roundRect(facility.x + 16, facility.y + 24, facility.w - 32, 18, 5).fill({ color: 0xb7d59d, alpha: 0.72 });
  g.roundRect(facility.x + 18, facility.y + facility.h - 30, facility.w - 36, 12, 5).fill({
    color: 0xa4784e,
    alpha: 0.58,
  });
  for (let i = 0; i < 8; i += 1) {
    const px = facility.x + 30 + i * Math.max(20, (facility.w - 60) / 7);
    g.circle(px, facility.y + facility.h - 36, 7 + (i % 2)).fill({
      color: i % 2 === 0 ? 0x4f9f5f : 0x6abf69,
      alpha: 0.84,
    });
    g.rect(px - 1, facility.y + facility.h - 33, 2, 10).fill({ color: 0x5b6f39, alpha: 0.58 });
  }
  parent.addChild(g);
  drawFacilityWindowRow(parent, facility.x + 28, facility.y + 20, Math.max(42, facility.w - 56), 0x22c55e);
}

function drawRoofLounge(parent: Container, facility: SharedFacilityLayout, accent: number): void {
  if (isLoungeFurnitureAllowed(facility.id)) {
    drawSofa(parent, facility.x + 16, facility.y + facility.h - 26, 0xd4bd83);
    drawCoffeeTable(parent, facility.x + 104, facility.y + facility.h - 30);
  } else {
    drawProjectWarDesk(parent, facility.x + 16, facility.y + facility.h - 48, Math.min(110, facility.w - 114), accent);
  }
  drawHighTable(parent, facility.x + facility.w - 82, facility.y + facility.h - 46);
  drawPlant(parent, facility.x + facility.w - 28, facility.y + facility.h - 20, 2);
  drawMiniPendantLights(parent, facility.x + 26, facility.y + 12, facility.w - 52, accent);
}
