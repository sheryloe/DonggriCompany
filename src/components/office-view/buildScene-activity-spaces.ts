import type { MutableRefObject } from "react";
import { Container, Graphics, Sprite, Text, TextStyle, type Application, type Texture } from "pixi.js";
import type { Agent, MeetingPresence, SubAgent, Task } from "../../types";
import type { CallbackSnapshot } from "./buildScene-types";
import { blendColor, hashStr } from "./drawing-core";
import { addOfficePropSprite, type OfficeAssetKey } from "./officePropAtlas";
import {
  countOfficeActivitySignals,
  deriveOfficeAgentActivityPlacements,
  type OfficeActivityMode,
  type OfficeAgentActivityPlacement,
  type OfficeRoleSpaceId,
  type OfficeRoleSpaceLayout,
} from "./officeActivitySpaces";
import {
  deriveOfficeOpsDashboardSnapshot,
  officeOpsToneColor,
  type OfficeOpsDashboardSnapshot,
} from "./officeOperationalRealism";
import { getRoleSpaceWorkplaceDensity } from "./officeWorkplaceDensity";

interface BuildActivitySpacesParams {
  app: Application;
  textures: Record<string, Texture>;
  agents: Agent[];
  tasks: Task[];
  subAgents: SubAgent[];
  meetingPresence?: MeetingPresence[];
  roleSpaces: OfficeRoleSpaceLayout[];
  spriteMap: Map<string, number>;
  cbRef: MutableRefObject<CallbackSnapshot>;
  activeMeetingTaskIdRef: MutableRefObject<string | null>;
  meetingMinutesOpenRef: MutableRefObject<((taskId: string) => void) | undefined>;
}

const MODE_LABEL: Record<OfficeActivityMode, string> = {
  work: "작업 중",
  meeting: "회의 중",
  ops: "운영 연결",
  study: "학습 중",
  break: "휴게 중",
  idle: "대기 중",
  offline: "오프라인",
};

const MODE_COLOR: Record<OfficeActivityMode, number> = {
  work: 0x38bdf8,
  meeting: 0xf59e0b,
  ops: 0x22c55e,
  study: 0xa78bfa,
  break: 0xf97316,
  idle: 0x94a3b8,
  offline: 0x64748b,
};

type SpaceAction = "onOpenTasks" | "onOpenProjects" | "onOpenMemory";

const SPACE_ACTION: Partial<Record<OfficeRoleSpaceId, SpaceAction>> = {
  "work-bay": "onOpenTasks",
  "ops-corner": "onOpenProjects",
  "study-room": "onOpenMemory",
  "memory-archive": "onOpenMemory",
};

export function buildActivitySpaces({
  app,
  textures,
  agents,
  tasks,
  subAgents,
  meetingPresence,
  roleSpaces,
  spriteMap,
  cbRef,
  activeMeetingTaskIdRef,
  meetingMinutesOpenRef,
}: BuildActivitySpacesParams): void {
  if (roleSpaces.length === 0) return;

  const placements = deriveOfficeAgentActivityPlacements({ agents, tasks, meetingPresence });
  const signals = countOfficeActivitySignals({ placements, subAgents });
  const opsSnapshot = deriveOfficeOpsDashboardSnapshot({ agents, tasks, subAgents, meetingPresence });
  const layer = new Container();

  for (const space of roleSpaces) {
    const spacePlacements = placements.filter((placement) => placement.spaceId === space.id);
    const zone = drawRoleSpaceShell(layer, space, spacePlacements.length);
    zone.eventMode = "static";
    zone.cursor = "pointer";
    zone.on("pointerdown", () => {
      if (space.id === "meeting-room") {
        const taskId = activeMeetingTaskIdRef.current;
        if (taskId && meetingMinutesOpenRef.current) {
          meetingMinutesOpenRef.current(taskId);
          return;
        }
        cbRef.current.onOpenTasks?.();
        return;
      }
      const action = SPACE_ACTION[space.id];
      if (action) cbRef.current[action]?.();
    });

    drawRoleSpaceProps(layer, textures, space, signals, opsSnapshot);
    drawRoleSpaceAgents(layer, textures, space, spacePlacements, spriteMap, opsSnapshot);
  }

  app.stage.addChild(layer);
}

function drawRoleSpaceShell(parent: Container, space: OfficeRoleSpaceLayout, activeCount: number): Graphics {
  const g = new Graphics();
  const shadow = blendColor(space.accent, 0x0f172a, 0.78);
  g.roundRect(space.x + 4, space.y + 6, space.w, space.h, 8).fill({ color: 0x020617, alpha: 0.16 });
  g.roundRect(space.x, space.y, space.w, space.h, 8).fill({ color: blendColor(space.accent, 0xffffff, 0.82), alpha: 0.92 });
  g.roundRect(space.x, space.y, space.w, space.h, 8).stroke({ width: 2, color: space.accent, alpha: 0.48 });
  g.rect(space.x + 8, space.y + 26, space.w - 16, 2).fill({ color: space.accent, alpha: 0.28 });
  g.roundRect(space.x + 8, space.y + space.h - 16, space.w - 16, 5, 3).fill({ color: shadow, alpha: 0.16 });
  parent.addChild(g);

  const title = new Text({
    text: space.label,
    style: new TextStyle({
      fontFamily: "system-ui, sans-serif",
      fontSize: 10,
      fontWeight: "bold",
      fill: 0x172033,
    }),
  });
  title.position.set(space.x + 10, space.y + 8);
  parent.addChild(title);

  const caption = new Text({
    text: space.caption,
    style: new TextStyle({
      fontFamily: "system-ui, sans-serif",
      fontSize: 7,
      fill: 0x435064,
    }),
  });
  caption.position.set(space.x + 10, space.y + 23);
  parent.addChild(caption);

  const count = new Text({
    text: `${activeCount}`,
    style: new TextStyle({
      fontFamily: "monospace",
      fontSize: 12,
      fontWeight: "bold",
      fill: 0xffffff,
    }),
  });
  count.anchor.set(0.5, 0.5);
  const badge = new Graphics();
  badge.roundRect(space.x + space.w - 35, space.y + 8, 26, 18, 5).fill({ color: space.accent, alpha: 0.86 });
  badge.roundRect(space.x + space.w - 35, space.y + 8, 26, 18, 5).stroke({ width: 1, color: 0xffffff, alpha: 0.44 });
  parent.addChild(badge);
  count.position.set(space.x + space.w - 22, space.y + 17);
  parent.addChild(count);

  return g;
}

function drawRoleSpaceProps(
  parent: Container,
  textures: Record<string, Texture>,
  space: OfficeRoleSpaceLayout,
  signals: ReturnType<typeof countOfficeActivitySignals>,
  opsSnapshot: OfficeOpsDashboardSnapshot,
): void {
  const density = getRoleSpaceWorkplaceDensity(space.id);
  drawOfficeCableGrid(parent, space, density.density === "control" ? 0x0f766e : space.accent);

  if (space.id === "work-bay") {
    drawWorkstationIsland(parent, space, Math.max(4, opsSnapshot.counts.assignedAgents + signals.activeSubAgents));
    drawTicketQueue(
      parent,
      space.x + space.w - 86,
      space.y + 48,
      Math.max(2, opsSnapshot.counts.waiting + opsSnapshot.counts.active + opsSnapshot.counts.review),
      space.accent,
    );
    drawOperationalTicketLane(parent, space.x + 20, space.y + space.h - 54, space.w - 40, opsSnapshot);
    drawStatusStrip(parent, space.x + 18, space.y + space.h - 28, space.w - 36, [
      { label: "배정", count: opsSnapshot.counts.assignedAgents, color: MODE_COLOR.work },
      { label: "분신", count: signals.activeSubAgents, color: 0x60a5fa },
    ]);
    return;
  }

  if (space.id === "meeting-room") {
    drawGlassMeetingRoom(parent, space, signals.meeting);
    drawStatusStrip(parent, space.x + 18, space.y + space.h - 28, space.w - 36, [
      { label: "회의", count: signals.meeting, color: MODE_COLOR.meeting },
      { label: "검토", count: opsSnapshot.counts.review, color: 0xfb7185 },
    ]);
    return;
  }

  if (space.id === "ops-corner") {
    drawOpsControlCorner(parent, textures, space, signals.ops, opsSnapshot);
    drawStatusStrip(parent, space.x + 18, space.y + space.h - 28, space.w - 36, [
      { label: "운영", count: signals.ops, color: MODE_COLOR.ops },
      { label: "감시", count: opsSnapshot.counts.active + opsSnapshot.counts.review, color: 0x38bdf8 },
    ]);
    return;
  }

  drawStudyAndArchiveRoom(parent, textures, space, signals.study);
  drawStatusStrip(parent, space.x + 18, space.y + space.h - 28, space.w - 36, [
    { label: "학습", count: signals.study, color: MODE_COLOR.study },
    { label: "기억", count: 1, color: 0x60a5fa },
  ]);
}

function drawRoleSpaceAgents(
  parent: Container,
  textures: Record<string, Texture>,
  space: OfficeRoleSpaceLayout,
  placements: OfficeAgentActivityPlacement[],
  spriteMap: Map<string, number>,
  opsSnapshot: OfficeOpsDashboardSnapshot,
): void {
  const visiblePlacements = placements.slice(0, 5);
  const startX = space.x + 32;
  const baseY = space.y + space.h - 42;
  visiblePlacements.forEach((placement, index) => {
    const x = startX + index * 32;
    const y = baseY - (index % 2) * 8;
    drawMiniAgent(parent, textures, placement, spriteMap, opsSnapshot, x, y);
  });
  if (placements.length <= visiblePlacements.length) return;

  const more = new Text({
    text: `+${placements.length - visiblePlacements.length}`,
    style: new TextStyle({ fontSize: 8, fontWeight: "bold", fill: 0x172033, fontFamily: "monospace" }),
  });
  more.anchor.set(0.5, 0.5);
  more.position.set(space.x + space.w - 24, baseY - 12);
  parent.addChild(more);
}

function drawMiniAgent(
  parent: Container,
  textures: Record<string, Texture>,
  placement: OfficeAgentActivityPlacement,
  spriteMap: Map<string, number>,
  opsSnapshot: OfficeOpsDashboardSnapshot,
  x: number,
  y: number,
): void {
  const agent = placement.agent;
  const opsState = opsSnapshot.agentStates[agent.id];
  const seed = hashStr(agent.id);
  const spriteNum = spriteMap.get(agent.id) ?? (seed % 44) + 1;
  const texture = textures[`${spriteNum}-D-1`] || textures[`${spriteNum}-R-1`];
  const container = new Container();
  container.position.set(x, y);
  container.alpha = placement.mode === "offline" ? 0.4 : 1;
  parent.addChild(container);

  const floorMarker = new Graphics();
  floorMarker.ellipse(0, 2, 12, 4).fill({
    color: opsState ? officeOpsToneColor(opsState.tone) : MODE_COLOR[placement.mode],
    alpha: 0.22,
  });
  container.addChild(floorMarker);

  if (texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(Math.min(0.42, 24 / sprite.texture.height));
    container.addChild(sprite);
  } else {
    const fallback = new Text({
      text: agent.name_ko?.slice(0, 1) || agent.name.slice(0, 1) || "A",
      style: new TextStyle({ fontSize: 9, fill: 0x172033, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
    });
    fallback.anchor.set(0.5, 1);
    container.addChild(fallback);
  }

  const modeText = new Text({
    text: opsState?.shortLabel ?? MODE_LABEL[placement.mode],
    style: new TextStyle({ fontSize: 6, fill: 0xffffff, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
  });
  modeText.anchor.set(0.5, 0.5);
  const badge = new Graphics();
  const badgeW = Math.max(28, modeText.width + 8);
  badge.roundRect(-badgeW / 2, -34, badgeW, 10, 3).fill({
    color: opsState ? officeOpsToneColor(opsState.tone) : MODE_COLOR[placement.mode],
    alpha: 0.9,
  });
  container.addChild(badge);
  modeText.position.set(0, -29);
  container.addChild(modeText);

  const led = new Graphics();
  led.circle(-13, -10, 2.6).fill({
    color: opsState ? officeOpsToneColor(opsState.tone) : MODE_COLOR[placement.mode],
    alpha: placement.mode === "offline" ? 0.45 : 0.95,
  });
  led.circle(-13, -10, 4).stroke({ width: 0.8, color: 0xffffff, alpha: 0.45 });
  container.addChild(led);

  if (placement.taskCount > 0) {
    const taskText = new Text({
      text: `업무${Math.min(9, placement.taskCount)}`,
      style: new TextStyle({ fontSize: 5, fill: 0x172033, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
    });
    taskText.anchor.set(0.5, 0.5);
    const taskBadge = new Graphics();
    taskBadge.roundRect(4, -15, 25, 9, 2).fill({ color: 0xffffff, alpha: 0.88 });
    taskBadge.roundRect(4, -15, 25, 9, 2).stroke({ width: 0.5, color: 0x94a3b8, alpha: 0.6 });
    container.addChild(taskBadge);
    taskText.position.set(16.5, -10.5);
    container.addChild(taskText);
  }
}

function addPropOrFallback(
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

function drawOfficeCableGrid(parent: Container, space: OfficeRoleSpaceLayout, accent: number): void {
  const g = new Graphics();
  const floorY = space.y + 39;
  const floorH = Math.max(70, space.h - 78);
  g.rect(space.x + 10, floorY, space.w - 20, floorH).fill({ color: 0xffffff, alpha: 0.12 });
  for (let x = space.x + 22; x < space.x + space.w - 20; x += 38) {
    g.moveTo(x, floorY + 8)
      .lineTo(x, floorY + floorH - 8)
      .stroke({ width: 0.6, color: 0x475569, alpha: 0.12 });
  }
  for (let y = floorY + 18; y < floorY + floorH - 8; y += 24) {
    g.moveTo(space.x + 20, y)
      .lineTo(space.x + space.w - 20, y)
      .stroke({ width: 0.6, color: 0x475569, alpha: 0.1 });
  }
  g.moveTo(space.x + 18, space.y + space.h - 44)
    .lineTo(space.x + space.w - 28, space.y + space.h - 44)
    .stroke({ width: 2, color: accent, alpha: 0.2 });
  parent.addChild(g);
}

function drawWorkstationIsland(parent: Container, space: OfficeRoleSpaceLayout, visibleWorkCount: number): void {
  const cols = space.w >= 235 ? 3 : 2;
  const rows = 2;
  const deskW = Math.min(54, Math.floor((space.w - 54) / cols));
  const deskH = 34;
  const startX = space.x + 20;
  const startY = space.y + 50;
  const gapX = cols > 1 ? (space.w - 40 - deskW * cols) / (cols - 1) : 0;
  const gapY = 44;

  drawLowPartition(parent, space.x + 14, startY + 35, space.w - 28, space.accent);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const x = startX + col * (deskW + gapX);
      const y = startY + row * gapY;
      drawDeskPod(parent, x, y, deskW, deskH, space.accent, index < visibleWorkCount);
    }
  }
  drawCableTray(parent, space.x + 18, startY + rows * gapY + 8, space.w - 36, space.accent);
}

function drawDeskPod(
  parent: Container,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: number,
  active: boolean,
): void {
  const g = new Graphics();
  const desk = active ? blendColor(accent, 0xffffff, 0.68) : 0xe7d5b4;
  g.roundRect(x + 2, y + 4, w, h, 4).fill({ color: 0x000000, alpha: 0.08 });
  g.roundRect(x, y, w, h, 4).fill(desk).stroke({ width: 0.8, color: 0x8b7358, alpha: 0.32 });
  g.roundRect(x + 7, y + 7, Math.max(22, w - 16), 13, 3).fill(0x172033);
  g.roundRect(x + 10, y + 9, Math.max(16, w - 22), 8, 2).fill({
    color: active ? blendColor(accent, 0xffffff, 0.34) : 0x334155,
    alpha: 0.9,
  });
  g.rect(x + w / 2 - 2, y + 20, 4, 6).fill(0x475569);
  g.roundRect(x + w / 2 - 12, y + 26, 24, 3, 1).fill(0x64748b);
  g.roundRect(x + 8, y + h - 9, 18, 4, 1).fill(0x94a3b8);
  g.circle(x + w - 8, y + 8, 2.4).fill(active ? 0x22c55e : 0x94a3b8);
  g.roundRect(x + w / 2 - 14, y + h + 4, 28, 10, 4).fill({ color: 0x64748b, alpha: 0.5 });
  parent.addChild(g);
}

function drawLowPartition(parent: Container, x: number, y: number, w: number, accent: number): void {
  const g = new Graphics();
  const segments = Math.max(3, Math.floor(w / 58));
  const segmentW = w / segments;
  for (let i = 0; i < segments; i += 1) {
    const px = x + i * segmentW;
    g.roundRect(px + 3, y, segmentW - 6, 7, 2).fill({ color: blendColor(accent, 0xffffff, 0.72), alpha: 0.58 });
    g.rect(px + segmentW - 4, y - 6, 2, 20).fill({ color: 0x64748b, alpha: 0.3 });
  }
  parent.addChild(g);
}

function drawCableTray(parent: Container, x: number, y: number, w: number, accent: number): void {
  const g = new Graphics();
  g.roundRect(x, y, w, 8, 3).fill({ color: 0x1f2937, alpha: 0.28 });
  for (let i = 0; i < 7; i += 1) {
    const px = x + 12 + i * Math.max(18, w / 8);
    g.circle(px, y + 4, 2).fill(i % 2 === 0 ? accent : 0xf59e0b);
  }
  parent.addChild(g);
}

function drawGlassMeetingRoom(parent: Container, space: OfficeRoleSpaceLayout, meetingCount: number): void {
  const g = new Graphics();
  const roomX = space.x + 18;
  const roomY = space.y + 46;
  const roomW = space.w - 36;
  const roomH = Math.max(90, space.h - 88);
  g.roundRect(roomX, roomY, roomW, roomH, 7).fill({ color: 0xe0f2fe, alpha: 0.26 });
  g.roundRect(roomX, roomY, roomW, roomH, 7).stroke({ width: 1.4, color: 0x7dd3fc, alpha: 0.62 });
  g.rect(roomX + roomW / 2 - 1, roomY + 5, 2, roomH - 10).fill({ color: 0x7dd3fc, alpha: 0.22 });
  drawMeetingTable(parent, space);
  drawAgendaBoard(parent, roomX + roomW - 68, roomY + 12, 52, 34, space.accent);
  drawSpeechBubbles(parent, roomX + 22, roomY + 14, Math.max(1, meetingCount));
}

function drawAgendaBoard(parent: Container, x: number, y: number, w: number, h: number, accent: number): void {
  const g = new Graphics();
  g.roundRect(x, y, w, h, 4).fill(0xfffbeb).stroke({ width: 1, color: accent, alpha: 0.54 });
  g.rect(x + 7, y + 9, w - 18, 2).fill({ color: 0x92400e, alpha: 0.52 });
  g.rect(x + 7, y + 17, w - 24, 2).fill({ color: 0x92400e, alpha: 0.36 });
  g.rect(x + 7, y + 25, w - 30, 2).fill({ color: 0x92400e, alpha: 0.26 });
  parent.addChild(g);
}

function drawSpeechBubbles(parent: Container, x: number, y: number, count: number): void {
  const g = new Graphics();
  const safeCount = Math.min(3, count);
  for (let i = 0; i < safeCount; i += 1) {
    const bx = x + i * 34;
    g.roundRect(bx, y + (i % 2) * 8, 26, 13, 5).fill({ color: 0xffffff, alpha: 0.84 });
    g.rect(bx + 7, y + 5 + (i % 2) * 8, 12, 1.2).fill({ color: 0x64748b, alpha: 0.45 });
    g.rect(bx + 7, y + 9 + (i % 2) * 8, 8, 1.2).fill({ color: 0x64748b, alpha: 0.28 });
  }
  parent.addChild(g);
}

function drawOpsControlCorner(
  parent: Container,
  textures: Record<string, Texture>,
  space: OfficeRoleSpaceLayout,
  opsCount: number,
  opsSnapshot: OfficeOpsDashboardSnapshot,
): void {
  drawMonitorWall(parent, space.x + 18, space.y + 46, Math.min(118, space.w * 0.45), 62, space.accent, opsSnapshot);
  addPropOrFallback(parent, textures, "serverRack", space.x + space.w - 62, space.y + 76, 44, 62, () =>
    drawServerMini(parent, space.x + space.w - 84, space.y + 66, space.accent),
  );
  addPropOrFallback(parent, textures, "projectBoard", space.x + space.w - 88, space.y + 46, 82, 48, () =>
    drawProjectPins(parent, space.x + space.w - 124, space.y + 48),
  );
  drawOpsConsole(parent, space.x + 32, space.y + 118, Math.min(140, space.w - 72), space.accent, opsCount);
  drawProjectPins(parent, space.x + space.w - 126, space.y + space.h - 48);
}

function drawMonitorWall(
  parent: Container,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: number,
  opsSnapshot: OfficeOpsDashboardSnapshot,
): void {
  const g = new Graphics();
  g.roundRect(x, y, w, h, 5).fill(0x0f172a).stroke({ width: 1, color: accent, alpha: 0.55 });
  const cols = 3;
  const rows = 2;
  const pad = 6;
  const cellW = (w - pad * (cols + 1)) / cols;
  const cellH = (h - pad * (rows + 1)) / rows;
  const signalValues = [
    opsSnapshot.counts.active,
    opsSnapshot.counts.review,
    opsSnapshot.counts.waiting,
    opsSnapshot.counts.meetingAgents,
    opsSnapshot.counts.activeSubAgents,
    opsSnapshot.counts.offlineAgents,
  ];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const value = signalValues[index] ?? 0;
      const cx = x + pad + col * (cellW + pad);
      const cy = y + pad + row * (cellH + pad);
      g.roundRect(cx, cy, cellW, cellH, 2).fill({ color: blendColor(accent, 0xffffff, 0.36), alpha: 0.7 });
      g.rect(cx + 4, cy + 6, cellW - 12, 1.5).fill({ color: 0xffffff, alpha: 0.45 });
      g.rect(cx + 4, cy + cellH - 7, Math.max(4, Math.min(cellW - 9, value * 4 + 4)), 2).fill({
        color: index === 1 && value > 0 ? 0xfb7185 : value > 0 ? 0x22c55e : 0x64748b,
        alpha: 0.8,
      });
      g.circle(cx + cellW - 6, cy + 7, 2).fill(index === 1 && value > 0 ? 0xfb7185 : value > 0 ? 0x22c55e : 0xf59e0b);
    }
  }
  parent.addChild(g);
}

function drawOpsConsole(parent: Container, x: number, y: number, w: number, accent: number, opsCount: number): void {
  const g = new Graphics();
  g.roundRect(x, y, w, 26, 4).fill(0x334155).stroke({ width: 1, color: accent, alpha: 0.48 });
  g.roundRect(x + 8, y + 6, w * 0.34, 10, 2).fill({ color: 0x0f172a, alpha: 0.72 });
  g.roundRect(x + w * 0.45, y + 6, w * 0.38, 10, 2).fill({ color: 0x0f172a, alpha: 0.72 });
  for (let i = 0; i < Math.max(3, Math.min(6, opsCount + 3)); i += 1) {
    g.circle(x + 10 + i * 12, y + 21, 2).fill(i % 2 === 0 ? 0x22c55e : 0x38bdf8);
  }
  parent.addChild(g);
}

function drawStudyAndArchiveRoom(
  parent: Container,
  textures: Record<string, Texture>,
  space: OfficeRoleSpaceLayout,
  studyCount: number,
): void {
  addPropOrFallback(parent, textures, "lectureBoard", space.x + 36, space.y + 52, 74, 54, () =>
    drawLessonBoard(parent, space.x + 24, space.y + 48, space.accent),
  );
  addPropOrFallback(parent, textures, "archiveCabinet", space.x + space.w - 58, space.y + 72, 48, 70, () =>
    drawStudyShelf(parent, space.x + space.w - 86, space.y + 48, space.accent),
  );
  drawTrainingDesks(parent, space.x + 26, space.y + 112, Math.max(2, studyCount), space.accent);
}

function drawTrainingDesks(parent: Container, x: number, y: number, count: number, accent: number): void {
  const g = new Graphics();
  const safeCount = Math.min(4, count);
  for (let i = 0; i < safeCount; i += 1) {
    const px = x + i * 38;
    g.roundRect(px, y + (i % 2) * 5, 30, 18, 3).fill(0xe7d5b4).stroke({ width: 0.6, color: 0x8b7358, alpha: 0.28 });
    g.roundRect(px + 7, y + 4 + (i % 2) * 5, 16, 8, 2).fill(0x172033);
    g.rect(px + 11, y + 12 + (i % 2) * 5, 8, 2).fill(accent);
    g.roundRect(px + 7, y + 21 + (i % 2) * 5, 16, 7, 3).fill({ color: 0x64748b, alpha: 0.45 });
  }
  parent.addChild(g);
}

function drawPixelMonitor(parent: Container, x: number, y: number, accent: number): void {
  const g = new Graphics();
  g.roundRect(x, y, 50, 34, 4).fill(0x172033).stroke({ width: 1, color: accent, alpha: 0.55 });
  g.roundRect(x + 5, y + 5, 40, 20, 2).fill({ color: blendColor(accent, 0xffffff, 0.55), alpha: 0.75 });
  g.rect(x + 22, y + 34, 6, 8).fill(0x475569);
  g.rect(x + 14, y + 42, 22, 3).fill(0x475569);
  parent.addChild(g);
}

function drawTicketQueue(parent: Container, x: number, y: number, count: number, accent: number): void {
  const g = new Graphics();
  const safeCount = Math.min(6, count);
  for (let i = 0; i < safeCount; i += 1) {
    g.roundRect(x + i * 10, y - i * 3, 34, 20, 3).fill({ color: 0xffffff, alpha: 0.92 });
    g.rect(x + 7 + i * 10, y + 6 - i * 3, 18, 2).fill({ color: accent, alpha: 0.56 });
    g.rect(x + 7 + i * 10, y + 12 - i * 3, 12, 2).fill({ color: 0x64748b, alpha: 0.38 });
  }
  parent.addChild(g);
}

function drawOperationalTicketLane(
  parent: Container,
  x: number,
  y: number,
  w: number,
  opsSnapshot: OfficeOpsDashboardSnapshot,
): void {
  const g = new Graphics();
  const items = [
    { label: "대기", count: opsSnapshot.counts.waiting, color: 0xf59e0b },
    { label: "진행", count: opsSnapshot.counts.active, color: 0x22c55e },
    { label: "검토", count: opsSnapshot.counts.review, color: 0xfb7185 },
  ];
  g.roundRect(x, y, w, 18, 5).fill({ color: 0x0f172a, alpha: 0.2 });
  parent.addChild(g);
  const laneW = w / items.length;
  items.forEach((item, index) => {
    const lx = x + index * laneW + 6;
    const fillW = Math.max(8, Math.min(laneW - 20, 8 + item.count * 10));
    const chip = new Graphics();
    chip.roundRect(lx, y + 5, fillW, 8, 2).fill({ color: item.color, alpha: item.count > 0 ? 0.82 : 0.26 });
    parent.addChild(chip);
    const label = new Text({
      text: `${item.label} ${item.count}`,
      style: new TextStyle({ fontSize: 6, fill: 0x172033, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
    });
    label.anchor.set(0, 0.5);
    label.position.set(lx + fillW + 3, y + 9);
    parent.addChild(label);
  });
}

function drawMeetingTable(parent: Container, space: OfficeRoleSpaceLayout): void {
  const g = new Graphics();
  const cx = space.x + space.w / 2;
  const cy = space.y + 78;
  g.ellipse(cx, cy, 60, 26).fill({ color: 0xc08b5f, alpha: 0.9 });
  g.ellipse(cx, cy + 3, 54, 20).fill({ color: 0xe2b884, alpha: 0.72 });
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6;
    g.roundRect(cx + Math.cos(angle) * 70 - 8, cy + Math.sin(angle) * 34 - 6, 16, 12, 4).fill({
      color: i % 2 === 0 ? 0xf59e0b : 0x38bdf8,
      alpha: 0.68,
    });
  }
  g.roundRect(space.x + space.w - 82, space.y + 48, 58, 30, 4).fill(0xfffbeb).stroke({
    width: 1,
    color: space.accent,
    alpha: 0.56,
  });
  g.rect(space.x + space.w - 74, space.y + 58, 36, 2).fill({ color: 0x92400e, alpha: 0.5 });
  g.rect(space.x + space.w - 74, space.y + 66, 28, 2).fill({ color: 0x92400e, alpha: 0.34 });
  parent.addChild(g);
}

function drawServerMini(parent: Container, x: number, y: number, accent: number): void {
  const g = new Graphics();
  g.roundRect(x, y, 34, 54, 4).fill(0x1e293b).stroke({ width: 1, color: accent, alpha: 0.55 });
  for (let i = 0; i < 5; i += 1) {
    g.rect(x + 6, y + 7 + i * 9, 18, 3).fill(0x0f172a);
    g.circle(x + 27, y + 8.5 + i * 9, 2).fill(i % 2 === 0 ? 0x22c55e : 0x38bdf8);
  }
  parent.addChild(g);
}

function drawProjectPins(parent: Container, x: number, y: number): void {
  const projects = [
    { label: "BG", color: 0x14b8a6 },
    { label: "DG", color: 0x38bdf8 },
    { label: "JS", color: 0xa78bfa },
  ];
  projects.forEach((project, index) => {
    const px = x + index * 28;
    const pin = new Graphics();
    pin.roundRect(px, y, 22, 16, 4).fill({ color: project.color, alpha: 0.86 });
    pin.rect(px + 9, y + 14, 4, 11).fill({ color: project.color, alpha: 0.68 });
    parent.addChild(pin);
    const label = new Text({
      text: project.label,
      style: new TextStyle({ fontSize: 7, fill: 0xffffff, fontWeight: "bold", fontFamily: "monospace" }),
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(px + 11, y + 8);
    parent.addChild(label);
  });
}

function drawLessonBoard(parent: Container, x: number, y: number, accent: number): void {
  const g = new Graphics();
  g.roundRect(x, y, 64, 42, 4).fill(0xf8fafc).stroke({ width: 1, color: accent, alpha: 0.55 });
  g.circle(x + 17, y + 20, 9).stroke({ width: 1.4, color: accent, alpha: 0.72 });
  g.rect(x + 34, y + 12, 18, 2).fill({ color: 0x64748b, alpha: 0.5 });
  g.rect(x + 34, y + 20, 14, 2).fill({ color: 0x64748b, alpha: 0.36 });
  g.rect(x + 12, y + 32, 38, 2).fill({ color: accent, alpha: 0.35 });
  parent.addChild(g);
}

function drawStudyShelf(parent: Container, x: number, y: number, accent: number): void {
  const g = new Graphics();
  g.roundRect(x, y, 46, 56, 4).fill(0x8b5e3c).stroke({ width: 1, color: accent, alpha: 0.34 });
  for (let row = 0; row < 3; row += 1) {
    g.rect(x + 5, y + 10 + row * 14, 36, 2).fill(0x5b3926);
    for (let col = 0; col < 5; col += 1) {
      g.rect(x + 8 + col * 6, y + 3 + row * 14, 4, 9).fill({
        color: col % 2 === 0 ? 0x38bdf8 : 0xa78bfa,
        alpha: 0.72,
      });
    }
  }
  parent.addChild(g);
}

function drawStatusStrip(
  parent: Container,
  x: number,
  y: number,
  w: number,
  items: Array<{ label: string; count: number; color: number }>,
): void {
  const g = new Graphics();
  g.roundRect(x, y, w, 18, 5).fill({ color: 0x0f172a, alpha: 0.16 });
  parent.addChild(g);
  const step = Math.max(1, w / items.length);
  items.forEach((item, index) => {
    const label = new Text({
      text: `${item.label} ${item.count}`,
      style: new TextStyle({ fontSize: 7, fill: 0x172033, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
    });
    label.anchor.set(0.5, 0.5);
    const dot = new Graphics();
    dot.circle(x + step * index + 11, y + 9, 3).fill({ color: item.color, alpha: 0.86 });
    parent.addChild(dot);
    label.position.set(x + step * index + step / 2 + 3, y + 9);
    parent.addChild(label);
  });
}
