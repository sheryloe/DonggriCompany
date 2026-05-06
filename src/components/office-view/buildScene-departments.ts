import type { MutableRefObject } from "react";
import { Container, Graphics, Text, TextStyle, type Application, type Texture } from "pixi.js";
import type { Agent, Department, SubAgent, Task } from "../../types";
import { localeName } from "../../i18n";
import type { CallbackSnapshot, AnimItem, SubCloneAnimItem } from "./buildScene-types";
import {
  COLS_PER_ROW,
  DESK_W,
  ROOM_PAD,
  SLOT_H,
  SLOT_W,
  TARGET_CHAR_H,
  type RoomRect,
  type SubCloneBurstParticle,
  type WallClockVisual,
  emitSubCloneSmokeBurst,
} from "./model";
import { DEPT_THEME, LOCALE_TEXT, type SupportedLocale, pickLocale } from "./themes-locale";
import {
  blendColor,
  contrastTextColor,
  drawAmbientGlow,
  drawBunting,
  drawCeilingLight,
  drawPictureFrame,
  drawRug,
  drawRoomAtmosphere,
  drawTiledFloor,
  drawTrashCan,
  drawWallClock,
  drawWindow,
} from "./drawing-core";
import { drawChair, drawDesk, drawPlant, drawWhiteboard } from "./drawing-furniture-a";
import { drawBookshelf, drawWallMonitor } from "./drawing-furniture-b";
import { renderDeskAgentAndSubClones } from "./buildScene-department-agent";
import type { OfficeRoomLayout } from "./officeFloorPlan";

interface BuildDepartmentRoomsParams {
  app: Application;
  textures: Record<string, Texture>;
  departments: Department[];
  agents: Agent[];
  tasks: Task[];
  subAgents: SubAgent[];
  unread?: Set<string>;
  customThemes?: Record<string, { floor1: number; floor2: number; wall: number; accent: number }>;
  activeLocale: SupportedLocale;
  gridCols: number;
  roomStartX: number;
  roomW: number;
  roomH: number;
  roomGap: number;
  deptStartY: number;
  agentRows: number;
  roomLayouts?: Map<string, OfficeRoomLayout>;
  spriteMap: Map<string, number>;
  cbRef: MutableRefObject<CallbackSnapshot>;
  roomRectsRef: MutableRefObject<RoomRect[]>;
  agentPosRef: MutableRefObject<Map<string, { x: number; y: number }>>;
  animItemsRef: MutableRefObject<AnimItem[]>;
  subCloneAnimItemsRef: MutableRefObject<SubCloneAnimItem[]>;
  subCloneBurstParticlesRef: MutableRefObject<SubCloneBurstParticle[]>;
  wallClocksRef: MutableRefObject<WallClockVisual[]>;
  removedSubBurstsByParent: Map<string, Array<{ x: number; y: number }>>;
  addedWorkingSubIds: Set<string>;
  nextSubSnapshot: Map<string, { parentAgentId: string; x: number; y: number }>;
}

export function buildDepartmentRooms({
  app,
  textures,
  departments,
  agents,
  tasks,
  subAgents,
  unread,
  customThemes,
  activeLocale,
  gridCols,
  roomStartX,
  roomW,
  roomH,
  roomGap,
  deptStartY,
  roomLayouts,
  spriteMap,
  cbRef,
  roomRectsRef,
  agentPosRef,
  animItemsRef,
  subCloneAnimItemsRef,
  subCloneBurstParticlesRef,
  wallClocksRef,
  removedSubBurstsByParent,
  addedWorkingSubIds,
  nextSubSnapshot,
}: BuildDepartmentRoomsParams): void {
  departments.forEach((dept, deptIdx) => {
    const col = deptIdx % gridCols;
    const row = Math.floor(deptIdx / gridCols);
    const layout = roomLayouts?.get(dept.id);
    const rx = layout?.x ?? roomStartX + col * (roomW + roomGap);
    const ry = layout?.y ?? deptStartY + row * (roomH + roomGap);
    const currentRoomW = layout?.w ?? roomW;
    const currentRoomH = layout?.h ?? roomH;
    const fallbackTheme = DEPT_THEME[dept.id] || DEPT_THEME.dev;
    const theme = ensureVisibleRoomTheme(customThemes?.[dept.id] || fallbackTheme, fallbackTheme);
    const deptAgents = agents.filter((agent) => agent.department_id === dept.id);
    const currentAgentRows = Math.max(1, Math.ceil(deptAgents.length / COLS_PER_ROW));
    roomRectsRef.current.push({ dept, x: rx, y: ry, w: currentRoomW, h: currentRoomH });

    const room = new Container();
    drawPremiumRoomShell(room, rx, ry, currentRoomW, currentRoomH, theme);

    const floorG = new Graphics();
    drawTiledFloor(floorG, rx, ry, currentRoomW, currentRoomH, theme.floor1, theme.floor2);
    room.addChild(floorG);
    drawRoomAtmosphere(room, rx, ry, currentRoomW, currentRoomH, theme.wall, theme.accent);
    drawRoomDepthDetails(room, rx, ry, currentRoomW, currentRoomH, theme, dept.id);

    const wallG = new Graphics();
    wallG.roundRect(rx, ry, currentRoomW, currentRoomH, 6).stroke({ width: 2.5, color: theme.wall });
    wallG.roundRect(rx + 3, ry + 3, currentRoomW - 6, currentRoomH - 6, 5).stroke({
      width: 1,
      color: blendColor(theme.accent, 0xffffff, 0.55),
      alpha: 0.32,
    });
    room.addChild(wallG);

    const doorG = new Graphics();
    doorG.rect(rx + currentRoomW / 2 - 16, ry - 2, 32, 5).fill(0xf5f0e8);
    room.addChild(doorG);

    const signW = 84;
    const signBg = new Graphics();
    signBg
      .roundRect(rx + currentRoomW / 2 - signW / 2 + 1, ry - 3, signW, 18, 4)
      .fill({ color: 0x000000, alpha: 0.12 });
    signBg.roundRect(rx + currentRoomW / 2 - signW / 2, ry - 4, signW, 18, 4).fill(theme.accent);
    signBg.eventMode = "static";
    signBg.cursor = "pointer";
    signBg.on("pointerdown", () => cbRef.current.onSelectDepartment(dept));
    room.addChild(signBg);
    const signTxt = new Text({
      text: `${dept.icon || "DEPT"} ${localeName(activeLocale, dept)}`,
      style: new TextStyle({
        fontSize: 9,
        fill: 0xffffff,
        fontWeight: "bold",
        fontFamily: "system-ui, sans-serif",
        dropShadow: { alpha: 0.2, distance: 1, color: 0x000000 },
      }),
    });
    signTxt.anchor.set(0.5, 0.5);
    signTxt.position.set(rx + currentRoomW / 2, ry + 5);
    room.addChild(signTxt);

    drawFloorLabel(room, layout?.floorLabel, rx, ry, currentRoomW, theme.accent);
    drawCeilingAndDecor(room, rx, ry, currentRoomW, currentRoomH, theme, deptIdx, wallClocksRef);
    drawDepartmentFeatureWall(room, dept.id, rx, ry, currentRoomW, currentRoomH, theme);

    if (deptAgents.length > 0) {
      drawRug(
        room,
        rx + currentRoomW / 2,
        ry + 38 + (Math.min(currentAgentRows, 2) * SLOT_H) / 2,
        currentRoomW - 40,
        Math.min(currentAgentRows, 2) * SLOT_H - 10,
        theme.accent,
      );
    }

    if (deptAgents.length === 0) {
      const emptyText = new Text({
        text: pickLocale(activeLocale, LOCALE_TEXT.noAssignedAgent),
        style: new TextStyle({ fontSize: 10, fill: 0x9a8a7a, fontFamily: "system-ui, sans-serif" }),
      });
      emptyText.anchor.set(0.5, 0.5);
      emptyText.position.set(rx + currentRoomW / 2, ry + currentRoomH / 2);
      room.addChild(emptyText);
    }

    deptAgents.forEach((agent, agentIdx) => {
      const acol = agentIdx % COLS_PER_ROW;
      const arow = Math.floor(agentIdx / COLS_PER_ROW);
      const ax = rx + ROOM_PAD + acol * SLOT_W + SLOT_W / 2;
      const ay = ry + 38 + arow * SLOT_H;
      const isWorking = agent.status === "working";
      const isOffline = agent.status === "offline";
      const isBreak = agent.status === "break";

      const nameY = ay;
      const charFeetY = nameY + 24 + TARGET_CHAR_H;
      const deskY = charFeetY - 8;

      agentPosRef.current.set(agent.id, { x: ax, y: deskY });

      renderAgentHeader(room, ax, nameY, agent, theme.accent, unread, activeLocale);
      drawChair(room, ax, charFeetY - TARGET_CHAR_H * 0.18, theme.accent);

      const removedBursts = removedSubBurstsByParent.get(agent.id);
      if (removedBursts && removedBursts.length > 0) {
        for (const burst of removedBursts) {
          emitSubCloneSmokeBurst(room, subCloneBurstParticlesRef.current, burst.x, burst.y, "despawn");
        }
        removedSubBurstsByParent.delete(agent.id);
      }

      if (isBreak) {
        drawBreakAwayTag(room, ax, deskY, charFeetY, activeLocale, theme.accent);
      } else {
        renderDeskAgentAndSubClones({
          room,
          textures,
          spriteMap,
          agent,
          tasks,
          subAgents,
          ax,
          deskY,
          charFeetY,
          isWorking,
          isOffline,
          cbRef,
          animItemsRef,
          subCloneAnimItemsRef,
          subCloneBurstParticlesRef,
          addedWorkingSubIds,
          nextSubSnapshot,
          themeAccent: theme.accent,
        });
      }
    });

    app.stage.addChild(room);
  });
}

function drawPremiumRoomShell(
  room: Container,
  rx: number,
  ry: number,
  roomW: number,
  roomH: number,
  theme: { accent: number; wall: number },
): void {
  const shell = new Graphics();
  shell.roundRect(rx + 5, ry + 8, roomW, roomH, 8).fill({ color: 0x020617, alpha: 0.24 });
  shell.roundRect(rx + 2, ry + 4, roomW, roomH, 8).fill({ color: 0x000000, alpha: 0.1 });
  shell.roundRect(rx - 1, ry - 1, roomW + 2, roomH + 2, 7).stroke({
    width: 1.2,
    color: blendColor(theme.accent, 0xffffff, 0.3),
    alpha: 0.5,
  });
  room.addChild(shell);
}

function drawRoomDepthDetails(
  room: Container,
  rx: number,
  ry: number,
  roomW: number,
  roomH: number,
  theme: { floor1: number; floor2: number; wall: number; accent: number },
  departmentId: string,
): void {
  const g = new Graphics();
  const wallTop = Math.max(34, Math.min(48, roomH * 0.24));
  const sideShade = blendColor(theme.wall, 0x020617, 0.58);
  const floorShade = blendColor(theme.floor2, 0x020617, 0.18);

  g.rect(rx + 4, ry + wallTop, 7, roomH - wallTop - 8).fill({ color: sideShade, alpha: 0.18 });
  g.rect(rx + roomW - 11, ry + wallTop, 7, roomH - wallTop - 8).fill({ color: sideShade, alpha: 0.18 });
  g.rect(rx + 8, ry + roomH - 22, roomW - 16, 12).fill({ color: floorShade, alpha: 0.28 });
  g.rect(rx + 8, ry + wallTop, roomW - 16, 1).fill({ color: blendColor(theme.accent, 0xffffff, 0.55), alpha: 0.28 });

  for (let x = rx + 18; x < rx + roomW - 18; x += 36) {
    g.rect(x, ry + wallTop + 8, 14, 1).fill({ color: 0xffffff, alpha: 0.08 });
    g.rect(x + 7, ry + wallTop + 8, 1, roomH - wallTop - 38).fill({ color: 0x020617, alpha: 0.05 });
  }

  const laneColor =
    departmentId === "dev"
      ? 0x38bdf8
      : departmentId === "design"
        ? 0xc084fc
        : departmentId === "qa"
          ? 0xfb7185
          : departmentId === "operations"
            ? 0x4ade80
            : theme.accent;
  g.roundRect(rx + 14, ry + roomH - 14, roomW - 28, 3, 1.5).fill({ color: laneColor, alpha: 0.42 });
  room.addChild(g);
}

function drawDepartmentFeatureWall(
  room: Container,
  departmentId: string,
  rx: number,
  ry: number,
  roomW: number,
  roomH: number,
  theme: { accent: number; wall: number },
): void {
  const panel = new Graphics();
  const x = rx + 20;
  const y = ry + 52;
  const w = Math.min(88, Math.max(64, roomW * 0.24));
  const h = 34;
  const darkPanel = blendColor(theme.wall, 0x020617, 0.72);
  panel.roundRect(x + 2, y + 2, w, h, 5).fill({ color: 0x000000, alpha: 0.16 });
  panel.roundRect(x, y, w, h, 5).fill({ color: darkPanel, alpha: 0.88 });
  panel.roundRect(x, y, w, h, 5).stroke({ width: 1, color: blendColor(theme.accent, 0xffffff, 0.35), alpha: 0.55 });

  if (departmentId === "dev") {
    for (let i = 0; i < 4; i += 1) {
      panel.roundRect(x + 8, y + 8 + i * 5, w - 22 - i * 5, 1.5, 0.8).fill({
        color: i % 2 === 0 ? 0x7dd3fc : 0x93c5fd,
        alpha: 0.72,
      });
    }
    panel.circle(x + w - 11, y + 10, 3).fill({ color: 0x22c55e, alpha: 0.86 });
  } else if (departmentId === "design") {
    const colors = [0xf472b6, 0xc084fc, 0x60a5fa, 0x34d399];
    colors.forEach((color, index) => {
      panel.roundRect(x + 8 + index * 15, y + 9, 11, 11, 3).fill({ color, alpha: 0.82 });
    });
    panel.roundRect(x + 8, y + 25, w - 16, 2, 1).fill({ color: 0xffffff, alpha: 0.45 });
  } else if (departmentId === "qa") {
    for (let i = 0; i < 3; i += 1) {
      panel.roundRect(x + 8, y + 8 + i * 8, 5, 5, 1.5).stroke({ width: 1, color: 0xffffff, alpha: 0.62 });
      panel.roundRect(x + 18, y + 10 + i * 8, w - 30, 1.4, 0.7).fill({ color: 0xfda4af, alpha: 0.72 });
    }
  } else if (departmentId === "devsecops") {
    panel.roundRect(x + 9, y + 9, w - 18, 16, 3).stroke({ width: 1.2, color: 0xfb923c, alpha: 0.78 });
    panel
      .moveTo(x + 15, y + 21)
      .lineTo(x + 24, y + 14)
      .lineTo(x + 34, y + 20)
      .lineTo(x + 48, y + 11)
      .stroke({
        width: 1.4,
        color: 0xfde68a,
        alpha: 0.9,
      });
  } else if (departmentId === "operations") {
    for (let i = 0; i < 5; i += 1) {
      panel.roundRect(x + 8, y + 7 + i * 5, w - 18, 2, 1).fill({
        color: i % 2 === 0 ? 0x86efac : 0xbbf7d0,
        alpha: 0.62,
      });
    }
  } else {
    panel.circle(x + 20, y + 18, 9).stroke({ width: 1.4, color: theme.accent, alpha: 0.8 });
    panel.roundRect(x + 38, y + 11, w - 48, 3, 1.5).fill({ color: 0xffffff, alpha: 0.42 });
    panel.roundRect(x + 38, y + 19, w - 56, 3, 1.5).fill({ color: 0xffffff, alpha: 0.24 });
  }

  room.addChild(panel);
}

function colorLuma(color: number): number {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function ensureVisibleRoomTheme<T extends { floor1: number; floor2: number; wall: number; accent: number }>(
  theme: T,
  fallback: T,
): T {
  const averageFloorLuma = (colorLuma(theme.floor1) + colorLuma(theme.floor2)) / 2;
  if (averageFloorLuma >= 58) return theme;
  return {
    ...theme,
    floor1: blendColor(theme.floor1, fallback.floor1, 0.78),
    floor2: blendColor(theme.floor2, fallback.floor2, 0.78),
    wall: blendColor(theme.wall, fallback.wall, 0.62),
    accent: colorLuma(theme.accent) < 70 ? fallback.accent : theme.accent,
  };
}

function drawFloorLabel(
  room: Container,
  floorLabel: string | undefined,
  rx: number,
  ry: number,
  roomW: number,
  accent: number,
): void {
  if (!floorLabel) return;
  const label = new Text({
    text: floorLabel,
    style: new TextStyle({
      fontSize: 7,
      fill: 0xffffff,
      fontFamily: "system-ui, sans-serif",
      fontWeight: "bold",
    }),
  });
  label.anchor.set(0, 0.5);
  const width = Math.min(120, Math.max(72, label.width + 14), roomW - 16);
  const bg = new Graphics();
  bg.roundRect(rx + 8, ry + 16, width, 14, 4).fill({ color: accent, alpha: 0.78 });
  room.addChild(bg);
  label.position.set(rx + 14, ry + 23);
  room.addChild(label);
}

function drawCeilingAndDecor(
  room: Container,
  rx: number,
  ry: number,
  roomW: number,
  roomH: number,
  theme: { accent: number; wall: number },
  deptIdx: number,
  wallClocksRef: MutableRefObject<WallClockVisual[]>,
): void {
  drawCeilingLight(room, rx + roomW / 2, ry + 14, theme.accent);
  drawAmbientGlow(room, rx + roomW / 2, ry + roomH / 2, roomW * 0.4, theme.accent, 0.04);
  drawBunting(
    room,
    rx + 12,
    ry + 16,
    roomW - 24,
    blendColor(theme.accent, 0xffffff, 0.2),
    blendColor(theme.wall, 0xffffff, 0.4),
    0.52,
  );

  const wallPanel = new Graphics();
  const panelX = rx + Math.max(74, roomW * 0.22);
  const panelW = Math.max(64, roomW - (panelX - rx) - 16);
  wallPanel.roundRect(panelX, ry + 17, panelW, 22, 6).fill({
    color: blendColor(theme.wall, theme.accent, 0.28),
    alpha: 0.78,
  });
  wallPanel.roundRect(panelX + 4, ry + 21, panelW - 8, 2, 1).fill({ color: 0xffffff, alpha: 0.18 });
  wallPanel.roundRect(panelX + 4, ry + 34, panelW - 8, 1.5, 1).fill({ color: 0x000000, alpha: 0.12 });
  room.addChild(wallPanel);

  drawWhiteboard(room, rx + roomW - 54, ry + 17);
  drawBookshelf(room, rx + 12, ry + 32);
  if (roomW > 210) {
    drawBookshelf(room, rx + 44, ry + 32);
  }
  wallClocksRef.current.push(drawWallClock(room, rx + roomW - 16, ry + 12));
  drawWallMonitor(room, rx + roomW / 2 - 27, ry + 18, theme.accent);
  drawWindow(room, rx + roomW - 104, ry + 16, 34, 22);
  if (roomW > 250) {
    drawWindow(room, rx + roomW - 146, ry + 16, 34, 22);
  }
  if (roomW > 200) {
    drawPictureFrame(room, rx + 40, ry + 19);
  }

  drawPlant(room, rx + 8, ry + roomH - 14, deptIdx);
  drawPlant(room, rx + roomW - 12, ry + roomH - 14, deptIdx + 1);
  drawTrashCan(room, rx + roomW - 14, ry + roomH - 26);
}

function renderAgentHeader(
  room: Container,
  ax: number,
  nameY: number,
  agent: Agent,
  accent: number,
  unread: Set<string> | undefined,
  activeLocale: SupportedLocale,
): void {
  const nameText = new Text({
    text: localeName(activeLocale, agent),
    style: new TextStyle({
      fontSize: 7,
      fill: 0x3a3a4a,
      fontWeight: "bold",
      fontFamily: "system-ui, sans-serif",
    }),
  });
  nameText.anchor.set(0.5, 0);
  const nameTagW = nameText.width + 6;
  const nameTagBg = new Graphics();
  nameTagBg.roundRect(ax - nameTagW / 2, nameY, nameTagW, 12, 3).fill({ color: 0xffffff, alpha: 0.85 });
  room.addChild(nameTagBg);
  nameText.position.set(ax, nameY + 2);
  room.addChild(nameText);

  if (unread?.has(agent.id)) {
    const bangBg = new Graphics();
    const bangX = ax + nameTagW / 2 + 2;
    bangBg.circle(bangX, nameY + 6, 6).fill(0xff3333);
    bangBg.circle(bangX, nameY + 6, 6).stroke({ width: 1, color: 0xff0000, alpha: 0.6 });
    room.addChild(bangBg);
    const bangTxt = new Text({
      text: "!",
      style: new TextStyle({ fontSize: 8, fill: 0xffffff, fontWeight: "bold", fontFamily: "monospace" }),
    });
    bangTxt.anchor.set(0.5, 0.5);
    bangTxt.position.set(bangX, nameY + 6);
    room.addChild(bangTxt);
  }

  const roleText = new Text({
    text: pickLocale(
      activeLocale,
      LOCALE_TEXT.role[agent.role as keyof typeof LOCALE_TEXT.role] || {
        ko: agent.role,
        en: agent.role,
        ja: agent.role,
        zh: agent.role,
      },
    ),
    style: new TextStyle({
      fontSize: 6,
      fill: contrastTextColor(accent),
      fontFamily: "system-ui, sans-serif",
    }),
  });
  roleText.anchor.set(0.5, 0.5);
  const roleTagW = roleText.width + 5;
  const roleTagBg = new Graphics();
  roleTagBg.roundRect(ax - roleTagW / 2, nameY + 13, roleTagW, 9, 2).fill({ color: accent, alpha: 0.82 });
  room.addChild(roleTagBg);
  roleText.position.set(ax, nameY + 17.5);
  room.addChild(roleText);
}

function drawBreakAwayTag(
  room: Container,
  ax: number,
  deskY: number,
  charFeetY: number,
  activeLocale: SupportedLocale,
  accent: number,
): void {
  drawDesk(room, ax - DESK_W / 2, deskY, false);
  const awayTagY = charFeetY - TARGET_CHAR_H / 2;
  const awayTagBgColor = blendColor(accent, 0x101826, 0.78);
  const awayTag = new Text({
    text: pickLocale(activeLocale, LOCALE_TEXT.breakRoom),
    style: new TextStyle({
      fontSize: 8,
      fill: contrastTextColor(awayTagBgColor),
      fontWeight: "bold",
      fontFamily: "system-ui, sans-serif",
    }),
  });
  awayTag.anchor.set(0.5, 0.5);
  const awayTagW = awayTag.width + 10;
  const awayTagH = awayTag.height + 4;
  const awayTagBg = new Graphics();
  awayTagBg
    .roundRect(ax - awayTagW / 2, awayTagY - awayTagH / 2, awayTagW, awayTagH, 3)
    .fill({ color: awayTagBgColor, alpha: 0.9 });
  awayTagBg
    .roundRect(ax - awayTagW / 2, awayTagY - awayTagH / 2, awayTagW, awayTagH, 3)
    .stroke({ width: 1, color: blendColor(accent, 0xffffff, 0.2), alpha: 0.85 });
  room.addChild(awayTagBg);
  awayTag.position.set(ax, awayTagY + 0.5);
  room.addChild(awayTag);
}
