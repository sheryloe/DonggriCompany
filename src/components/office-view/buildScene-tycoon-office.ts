import { Container, Graphics, Text, TextStyle, type Texture } from "pixi.js";
import { buildSpriteMap } from "../AgentAvatar";
import type { Agent } from "../../types";
import { createAgentWalkActor } from "./spriteActors";
import { detachNode, type RoomRect } from "./model";
import { blendColor, hashStr } from "./drawing-core";
import type { BuildOfficeSceneContext } from "./buildScene-types";
import {
  buildTycoonOfficeLayout,
  type TycoonBuilding,
  type TycoonMapMode,
  type TycoonProjectDock,
  type TycoonWorkStatus,
  type TycoonWorkToken,
} from "./tycoonOfficeLayout";

const WORLD_W = 860;
const WORLD_H = 560;
const TILE = 16;

type OfficePalette = {
  floorA: number;
  floorB: number;
  floorC: number;
  wall: number;
  wallTop: number;
  rail: number;
  belt: number;
  beltEdge: number;
  ink: number;
  paper: number;
  muted: number;
  shadow: number;
  glass: number;
};

function palette(isDark: boolean): OfficePalette {
  return isDark
    ? {
        floorA: 0x111827,
        floorB: 0x182235,
        floorC: 0x243044,
        wall: 0x0b1220,
        wallTop: 0x263247,
        rail: 0x3b4a63,
        belt: 0x334155,
        beltEdge: 0x06b6d4,
        ink: 0xe5f7ff,
        paper: 0x102033,
        muted: 0x94a3b8,
        shadow: 0x020617,
        glass: 0x0e7490,
      }
    : {
        floorA: 0xe8f6e8,
        floorB: 0xd9eddd,
        floorC: 0xc7e3d0,
        wall: 0xcbd5e1,
        wallTop: 0xf8fafc,
        rail: 0x94a3b8,
        belt: 0xdbeafe,
        beltEdge: 0x0284c7,
        ink: 0x0f172a,
        paper: 0xffffff,
        muted: 0x64748b,
        shadow: 0x475569,
        glass: 0x38bdf8,
      };
}

function rect(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  g.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).fill({ color, alpha });
}

function strokedRect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  stroke: number,
  alpha = 1,
): void {
  g.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    .fill({ color: fill, alpha })
    .stroke({ color: stroke, width: 2, alpha: 0.86 });
}

function pixelText(text: string, size: number, fill: number, weight: "normal" | "bold" = "normal"): Text {
  return new Text({
    text,
    style: new TextStyle({
      fontFamily: "monospace",
      fontSize: size,
      fontWeight: weight,
      fill,
      letterSpacing: 0,
      lineHeight: Math.round(size * 1.16),
    }),
  });
}

function statusColor(status: TycoonBuilding["status"] | TycoonWorkStatus): number {
  if (status === "watch" || status === "approval" || status === "review") return 0xf59e0b;
  if (status === "active" || status === "working" || status === "done") return 0x22c55e;
  if (status === "blocked") return 0xf43f5e;
  return 0x38bdf8;
}

function focusIncludes(mode: TycoonMapMode, focusIds: string[], id: string): boolean {
  return mode === "overview" || focusIds.includes(id);
}

function addHitTarget(container: Container, x: number, y: number, w: number, h: number): void {
  const hit = new Graphics();
  rect(hit, x, y, w, h, 0xffffff, 0.001);
  container.addChild(hit);
}

function drawOfficeFloor(stage: Container, colors: OfficePalette, isDark: boolean): void {
  const g = new Graphics();
  rect(g, 0, 0, WORLD_W, WORLD_H, isDark ? 0x07111d : 0xdcefdc);
  rect(g, 24, 24, WORLD_W - 48, WORLD_H - 48, colors.floorA);

  for (let y = 24; y < WORLD_H - 24; y += TILE) {
    for (let x = 24; x < WORLD_W - 24; x += TILE) {
      const seed = (x * 19 + y * 31 + ((x / TILE) ^ (y / TILE)) * 17) % 13;
      const color = seed < 5 ? colors.floorB : seed === 9 ? colors.floorC : colors.floorA;
      rect(g, x, y, TILE, TILE, color, seed === 9 ? 0.56 : 0.86);
      if (seed === 3) rect(g, x + 5, y + 5, 2, 2, colors.rail, 0.28);
    }
  }

  rect(g, 24, 24, WORLD_W - 48, 8, colors.wallTop);
  rect(g, 24, 32, WORLD_W - 48, 10, colors.wall, 0.78);
  rect(g, 24, WORLD_H - 34, WORLD_W - 48, 10, colors.wall, 0.78);
  rect(g, 24, 24, 10, WORLD_H - 48, colors.wall, 0.78);
  rect(g, WORLD_W - 34, 24, 10, WORLD_H - 48, colors.wall, 0.78);
  rect(g, 34, 42, WORLD_W - 68, 2, colors.rail, 0.56);
  stage.addChild(g);
}

function drawBeltSegment(g: Graphics, colors: OfficePalette, x: number, y: number, horizontal: boolean, focused: boolean): void {
  const main = focused ? blendColor(colors.belt, 0x22d3ee, 0.2) : colors.belt;
  rect(g, x, y, horizontal ? TILE : 8, horizontal ? 8 : TILE, main, focused ? 0.98 : 0.82);
  rect(g, x, y, horizontal ? TILE : 8, 2, colors.beltEdge, focused ? 0.8 : 0.34);
  if (horizontal) {
    rect(g, x + 5, y + 3, 6, 2, colors.rail, 0.55);
  } else {
    rect(g, x + 3, y + 5, 2, 6, colors.rail, 0.55);
  }
}

function drawBelt(stage: Container, colors: OfficePalette, points: Array<[number, number]>, focused: boolean): void {
  const g = new Graphics();
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 12));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      drawBeltSegment(g, colors, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, horizontal, focused);
    }
  }
  stage.addChild(g);
}

function drawFocusFrame(stage: Container, x: number, y: number, w: number, h: number, accent: number, focused: boolean): void {
  if (!focused) return;
  const g = new Graphics();
  rect(g, x - 6, y - 6, w + 12, 3, accent, 0.88);
  rect(g, x - 6, y - 6, 3, h + 12, accent, 0.88);
  rect(g, x - 6, y + h + 3, w + 12, 3, accent, 0.88);
  rect(g, x + w + 3, y - 6, 3, h + 12, accent, 0.88);
  rect(g, x - 2, y - 2, w + 4, h + 4, accent, 0.08);
  stage.addChild(g);
}

function drawStationSign(stage: Container, colors: OfficePalette, building: TycoonBuilding): void {
  const g = new Graphics();
  const w = Math.max(38, building.shortLabel.length * 13 + 18);
  rect(g, building.x + 10, building.y - 14, w, 18, colors.paper, 0.96);
  rect(g, building.x + 10, building.y - 14, w, 3, building.accent, 0.92);
  rect(g, building.x + 10, building.y + 2, w, 2, colors.shadow, 0.18);
  stage.addChild(g);
  const text = pixelText(building.shortLabel, 10, colors.ink, "bold");
  text.position.set(building.x + 18, building.y - 10);
  stage.addChild(text);
}

function drawDesk(g: Graphics, x: number, y: number, color: number, colors: OfficePalette): void {
  rect(g, x, y, 28, 16, color);
  rect(g, x + 3, y + 3, 22, 4, blendColor(color, 0xffffff, 0.18));
  rect(g, x + 4, y + 17, 4, 8, colors.shadow, 0.55);
  rect(g, x + 20, y + 17, 4, 8, colors.shadow, 0.55);
  rect(g, x + 9, y - 8, 12, 8, colors.glass, 0.66);
}

function drawStationProps(g: Graphics, building: TycoonBuilding, colors: OfficePalette): void {
  const baseColor = blendColor(building.accent, colors.paper, 0.64);
  if (building.kind === "tower") {
    const cx = building.x + building.w / 2;
    rect(g, cx - 4, building.y + 14, 8, building.h - 26, building.accent, 0.9);
    rect(g, cx - 27, building.y + 42, 54, 5, building.accent, 0.76);
    rect(g, cx - 22, building.y + 68, 44, 5, building.accent, 0.64);
    rect(g, cx - 12, building.y + 6, 24, 18, 0x2dd4bf, 0.88);
    rect(g, cx - 34, building.y + 19, 8, 4, 0x99f6e4, 0.66);
    rect(g, cx + 26, building.y + 19, 8, 4, 0x99f6e4, 0.66);
    return;
  }
  if (building.kind === "archive") {
    for (let i = 0; i < 4; i += 1) rect(g, building.x + 18 + i * 18, building.y + 28, 11, 42, i % 2 ? 0x93c5fd : 0xc4b5fd);
    rect(g, building.x + 16, building.y + 74, building.w - 32, 7, colors.shadow, 0.5);
    return;
  }
  if (building.kind === "keep") {
    rect(g, building.x + 18, building.y + 28, building.w - 36, 22, 0xfef3c7, 0.78);
    rect(g, building.x + 28, building.y + 34, building.w - 56, 4, 0xf59e0b, 0.9);
    rect(g, building.x + 28, building.y + 43, building.w - 56, 4, 0xf59e0b, 0.55);
  }
  if (building.kind === "forge") {
    rect(g, building.x + building.w - 42, building.y + 20, 24, 30, 0x334155);
    rect(g, building.x + building.w - 36, building.y + 14, 12, 10, 0xf97316, 0.9);
    rect(g, building.x + building.w - 38, building.y + 48, 20, 8, 0xfacc15, 0.75);
  }
  if (building.kind === "studio") {
    rect(g, building.x + 18, building.y + 26, 24, 32, 0xfdf2f8);
    rect(g, building.x + 23, building.y + 32, 14, 4, 0x38bdf8);
    rect(g, building.x + 23, building.y + 42, 14, 4, 0xf472b6);
  }
  if (building.kind === "academy") {
    rect(g, building.x + 22, building.y + 25, building.w - 44, 24, 0x312e81, 0.82);
    rect(g, building.x + 30, building.y + 32, 36, 3, 0xf8fafc, 0.82);
    rect(g, building.x + 30, building.y + 40, 48, 3, 0xf8fafc, 0.58);
  }
  if (building.kind === "gate") {
    rect(g, building.x + 20, building.y + 22, building.w - 40, 26, 0x0e7490, 0.72);
    rect(g, building.x + 28, building.y + 30, building.w - 56, 5, 0xa5f3fc, 0.75);
    rect(g, building.x + 28, building.y + 40, building.w - 70, 5, 0xa5f3fc, 0.52);
  }
  drawDesk(g, building.x + 20, building.y + building.h - 34, baseColor, colors);
  if (building.w > 120) drawDesk(g, building.x + building.w - 50, building.y + building.h - 34, baseColor, colors);
}

function drawBuilding(stage: Container, colors: OfficePalette, building: TycoonBuilding, focused: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  rect(g, building.x + 8, building.y + building.h - 2, building.w, 14, colors.shadow, 0.18);
  strokedRect(g, building.x, building.y, building.w, building.h, blendColor(building.accent, colors.paper, 0.82), building.accent, 0.92);
  rect(g, building.x, building.y, building.w, 9, blendColor(building.accent, colors.shadow, 0.25), 0.86);
  rect(g, building.x + 8, building.y + 13, building.w - 16, 5, colors.paper, 0.28);
  drawStationProps(g, building, colors);
  rect(g, building.x + building.w - 17, building.y + 11, 9, 9, colors.shadow, 0.18);
  rect(g, building.x + building.w - 16, building.y + 12, 7, 7, statusColor(building.status), 0.96);
  if (building.tasks.length > 0) {
    rect(g, building.x + 8, building.y + building.h - 16, Math.min(building.w - 16, 14 + building.tasks.length * 8), 5, building.accent, 0.72);
  }
  c.addChild(g);
  addHitTarget(c, building.x, building.y, building.w, building.h);
  stage.addChild(c);
  drawFocusFrame(stage, building.x, building.y, building.w, building.h, building.accent, focused);
  drawStationSign(stage, colors, building);
  return c;
}

function drawProjectDock(stage: Container, colors: OfficePalette, dock: TycoonProjectDock, focused: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  rect(g, dock.x + 5, dock.y + dock.h - 2, dock.w, 10, colors.shadow, 0.16);
  strokedRect(g, dock.x, dock.y, dock.w, dock.h, blendColor(dock.accent, colors.paper, 0.84), dock.accent, 0.9);
  rect(g, dock.x + 8, dock.y + 10, 4, 32, colors.rail, 0.72);
  rect(g, dock.x + 12, dock.y + 12, 26, 14, dock.accent, 0.94);
  rect(g, dock.x + 32, dock.y + 25, 9, 7, blendColor(dock.accent, 0xffffff, 0.26), 0.92);
  rect(g, dock.x + 52, dock.y + 13, 54, 6, colors.paper, 0.46);
  rect(g, dock.x + 52, dock.y + 25, 42, 6, colors.paper, 0.34);
  rect(g, dock.x + dock.w - 15, dock.y + 9, 7, 7, statusColor(dock.status), 0.95);
  c.addChild(g);
  addHitTarget(c, dock.x, dock.y, dock.w, dock.h);
  stage.addChild(c);
  drawFocusFrame(stage, dock.x, dock.y, dock.w, dock.h, dock.accent, focused);
  const label = pixelText(dock.label.replace("DonggriCompany", "Donggri"), 9, colors.ink, "bold");
  label.position.set(dock.x + 48, dock.y + 34);
  stage.addChild(label);
  return c;
}

function drawWorkToken(stage: Container, colors: OfficePalette, token: TycoonWorkToken, focused: boolean): void {
  const g = new Graphics();
  const color = statusColor(token.status);
  rect(g, token.x + 2, token.y + 12, 18, 5, colors.shadow, 0.18);
  strokedRect(g, token.x, token.y, 20, 15, blendColor(color, colors.paper, 0.35), color, focused ? 1 : 0.9);
  rect(g, token.x + 3, token.y + 3, 14, 2, colors.paper, 0.55);
  if (token.status === "blocked") rect(g, token.x + 4, token.y + 9, 12, 3, 0xf43f5e, 0.9);
  stage.addChild(g);
  const text = pixelText(token.label, 8, colors.ink, "bold");
  text.anchor.set(0.5, 0);
  text.position.set(token.x + 10, token.y + 5);
  stage.addChild(text);
}

function addSpriteForAgent(
  stage: Container,
  textures: Record<string, Texture>,
  spriteMap: Map<string, number>,
  agent: Agent,
  x: number,
  y: number,
  scaleBoost: number,
): Container {
  const spriteNumber = spriteMap.get(agent.id) ?? ((hashStr(agent.id) % 44) + 1);
  const { actor } = createAgentWalkActor({
    textures,
    spriteNumber,
    targetHeight: 34 * scaleBoost,
    fallbackText: agent.name_ko?.slice(0, 2) || "AG",
  });
  actor.position.set(x, y);
  actor.eventMode = "static";
  actor.cursor = "pointer";
  stage.addChild(actor);
  return actor;
}

function drawAgentAtStation(
  context: BuildOfficeSceneContext,
  stage: Container,
  spriteMap: Map<string, number>,
  agent: Agent,
  x: number,
  y: number,
): void {
  const actor = addSpriteForAgent(stage, context.texturesRef.current, spriteMap, agent, x, y, 0.82);
  actor.on("pointerdown", () => context.cbRef.current.onSelectAgent(agent));
  const particles = new Container();
  stage.addChild(particles);
  context.animItemsRef.current.push({
    sprite: actor,
    status: agent.status,
    baseX: actor.position.x,
    baseY: actor.position.y,
    particles,
    agentId: agent.id,
    cliProvider: agent.cli_provider,
  });
  context.agentPosRef.current.set(agent.id, { x: actor.position.x, y: actor.position.y });
}

function drawPlayerCursor(context: BuildOfficeSceneContext, stage: Container, colors: OfficePalette): void {
  const x = 118;
  const y = 238;
  const marker = new Graphics();
  rect(marker, x - 14, y + 8, 28, 6, 0x22d3ee, 0.24);
  stage.addChild(marker);
  const { actor } = createAgentWalkActor({
    textures: context.texturesRef.current,
    spriteNumber: 1,
    targetHeight: 38,
    fallbackText: "DG",
  });
  actor.position.set(x, y);
  stage.addChild(actor);
  const crown = pixelText("DG", 8, colors.ink, "bold");
  crown.anchor.set(0.5, 0);
  crown.position.set(0, -34);
  actor.addChild(crown);
  context.ceoSpriteRef.current = actor;
  context.ceoPosRef.current = { x, y };
  context.crownRef.current = crown;
}

export function buildTycoonOfficeScene(context: BuildOfficeSceneContext): void {
  const app = context.appRef.current;
  if (!app) return;

  for (const child of [...app.stage.children]) {
    detachNode(child);
    child.destroy({ children: true });
  }

  context.animItemsRef.current = [];
  context.roomRectsRef.current = [];
  context.deliveriesRef.current = [];
  context.agentPosRef.current = new Map();
  context.ceoMeetingSeatsRef.current = [];
  context.ceoSpriteRef.current = null;
  context.crownRef.current = null;
  context.highlightRef.current = null;

  const data = context.dataRef.current;
  const callbacks = context.cbRef.current;
  const mode = data.tycoonFocusMode ?? "overview";
  const layout = buildTycoonOfficeLayout({
    departments: data.departments,
    agents: data.agents,
    tasks: data.tasks,
    subAgents: data.subAgents,
    mode,
  });
  const isDark = context.themeRef.current === "dark";
  const colors = palette(isDark);
  const spriteMap = buildSpriteMap(data.agents);
  context.spriteMapRef.current = spriteMap;
  const width = Math.max(360, Math.floor(context.officeWRef.current));
  const height = width < 560 ? 440 : Math.max(500, Math.min(660, Math.round(width * 0.66)));

  app.renderer.resize(width, height);
  context.totalHRef.current = height;

  const world = new Container();
  const fit = Math.min(width / WORLD_W, height / WORLD_H);
  const scale = fit * layout.camera.zoom;
  world.scale.set(scale);
  world.pivot.set(layout.camera.x, layout.camera.y);
  world.position.set(width / 2, height / 2);
  app.stage.addChild(world);

  drawOfficeFloor(world, colors, isDark);
  const pipelineFocused = mode === "pipeline" || mode === "overview";
  drawBelt(world, colors, [[166, 294], [270, 294], [270, 204], [270, 204]], pipelineFocused);
  drawBelt(world, colors, [[322, 202], [408, 252], [468, 356]], pipelineFocused || mode === "build");
  drawBelt(world, colors, [[342, 430], [396, 430]], pipelineFocused || mode === "build");
  drawBelt(world, colors, [[546, 410], [638, 336]], pipelineFocused || mode === "review");
  drawBelt(world, colors, [[640, 236], [642, 204]], pipelineFocused || mode === "ops");
  drawBelt(world, colors, [[596, 176], [704, 120]], mode === "ops");
  drawBelt(world, colors, [[574, 292], [182, 438]], pipelineFocused || mode === "memory");

  drawPlayerCursor(context, world, colors);

  for (const building of layout.buildings) {
    const focused = focusIncludes(mode, layout.camera.focusIds, building.id);
    const node = drawBuilding(world, colors, building, focused);
    node.eventMode = "static";
    node.cursor = "pointer";
    node.on("pointerdown", () => {
      if (building.id === "memory") {
        callbacks.onOpenMemory?.();
        return;
      }
      if (building.id === "intake") {
        callbacks.onOpenTasks?.();
        return;
      }
      const department = data.departments.find((candidate) => building.departmentIds.includes(candidate.id));
      if (department) callbacks.onSelectDepartment(department);
    });

    const department = data.departments.find((candidate) => building.departmentIds.includes(candidate.id));
    if (department) {
      context.roomRectsRef.current.push({ dept: department, x: building.x, y: building.y, w: building.w, h: building.h } satisfies RoomRect);
    }

    building.agents.slice(0, building.id === "operations" ? 1 : 2).forEach((agent, index) => {
      drawAgentAtStation(
        context,
        world,
        spriteMap,
        agent,
        building.x + 32 + index * 38,
        building.y + building.h - 8,
      );
    });
  }

  for (const dock of layout.projectDocks) {
    const focused = focusIncludes(mode, layout.camera.focusIds, dock.id);
    const node = drawProjectDock(world, colors, dock, focused);
    node.eventMode = "static";
    node.cursor = "pointer";
    node.on("pointerdown", () => callbacks.onOpenProjects?.());
  }

  const tokenFocused = mode === "pipeline" || mode === "overview";
  for (const token of layout.workTokens) {
    drawWorkToken(world, colors, token, tokenFocused || layout.camera.focusIds.includes(token.buildingId));
  }

  const frame = new Graphics();
  rect(frame, 0, 0, width, 3, isDark ? 0x0e7490 : 0x0284c7, 0.48);
  rect(frame, 0, height - 3, width, 3, isDark ? 0x0e7490 : 0x0284c7, 0.48);
  rect(frame, 0, 0, 3, height, isDark ? 0x0e7490 : 0x0284c7, 0.48);
  rect(frame, width - 3, 0, 3, height, isDark ? 0x0e7490 : 0x0284c7, 0.48);
  app.stage.addChild(frame);

  const label = pixelText(`TYCOON ${layout.camera.key.toUpperCase()}  WORK TOKENS ${layout.workTokens.length}`, 10, isDark ? 0xa5f3fc : 0x075985, "bold");
  label.position.set(14, 12);
  app.stage.addChild(label);

  context.setSceneRevision((value) => value + 1);
}
