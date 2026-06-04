import {
  AnimatedSprite,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type Application,
  type Texture,
} from "pixi.js";
import { buildSpriteMap } from "../AgentAvatar";
import type { Agent, Department, Task } from "../../types";
import { buildCloudOpsLayout, type CloudOpsPanelMode, type CloudOpsServiceZone } from "./cloudOpsLayout";
import { TARGET_CHAR_H, detachNode, type RoomRect } from "./model";
import { blendColor, hashStr } from "./drawing-core";
import { collectAgentWalkFrames } from "./spriteActors";
import type { BuildOfficeSceneContext } from "./buildScene-types";

type NodeRect = { id: string; x: number; y: number; w: number; h: number; accent: number };

const MODE_NODE_IDS: Record<CloudOpsPanelMode, string[]> = {
  overview: ["core", "pipeline", "ops", "memory"],
  pipeline: ["pipeline", "CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"],
  build: ["development", "IMPLEMENT"],
  review: ["quality", "REVIEW"],
  ops: ["ops", "BloggerGent", "DonggriCompany", "JasoSul"],
  memory: ["memory", "core"],
};

function hexToNumber(value: string): number {
  return Number.parseInt(value.replace("#", ""), 16);
}

function isNodeFocused(mode: CloudOpsPanelMode, id: string): boolean {
  return MODE_NODE_IDS[mode]?.includes(id) ?? false;
}

function textNode(text: string, size: number, fill: number, weight: "normal" | "bold" = "normal"): Text {
  return new Text({
    text,
    style: new TextStyle({
      fontFamily: "system-ui, sans-serif",
      fontSize: size,
      fontWeight: weight,
      fill,
      letterSpacing: 0,
    }),
  });
}

function monoText(text: string, size: number, fill: number, weight: "normal" | "bold" = "normal"): Text {
  return new Text({
    text,
    style: new TextStyle({
      fontFamily: "monospace",
      fontSize: size,
      fontWeight: weight,
      fill,
      letterSpacing: 0,
    }),
  });
}

function drawPixelGrid(stage: Container, width: number, height: number, isDark: boolean): void {
  const bg = new Graphics();
  const base = isDark ? 0x07111f : 0xf3f8fb;
  bg.rect(0, 0, width, height).fill(base);

  const gridColor = isDark ? 0x164e63 : 0x67e8f9;
  for (let x = 0; x < width; x += 24) {
    bg.moveTo(x, 0).lineTo(x, height).stroke({ width: 1, color: gridColor, alpha: isDark ? 0.16 : 0.18 });
  }
  for (let y = 0; y < height; y += 24) {
    bg.moveTo(0, y).lineTo(width, y).stroke({ width: 1, color: gridColor, alpha: isDark ? 0.13 : 0.16 });
  }

  for (let x = 12; x < width; x += 96) {
    for (let y = 12; y < height; y += 96) {
      bg.rect(x, y, 2, 2).fill({ color: gridColor, alpha: 0.24 });
    }
  }
  stage.addChild(bg);
}

function drawConnector(stage: Container, from: NodeRect, to: NodeRect, active: boolean): void {
  const line = new Graphics();
  const color = active ? blendColor(from.accent, to.accent, 0.5) : 0x64748b;
  const fromX = from.x + from.w / 2;
  const fromY = from.y + from.h / 2;
  const toX = to.x + to.w / 2;
  const toY = to.y + to.h / 2;
  const midY = Math.floor((fromY + toY) / 2);

  line.moveTo(fromX, fromY);
  line.lineTo(fromX, midY);
  line.lineTo(toX, midY);
  line.lineTo(toX, toY);
  line.stroke({ width: active ? 2 : 1.2, color, alpha: active ? 0.72 : 0.28 });
  line.rect(fromX - 2, midY - 2, 4, 4).fill({ color, alpha: active ? 0.82 : 0.38 });
  stage.addChild(line);
}

function drawPanelShell(
  stage: Container,
  rect: NodeRect,
  title: string,
  subtitle: string,
  isDark: boolean,
  focused: boolean,
): Container {
  const panel = new Container();
  const shell = new Graphics();
  const face = isDark ? blendColor(rect.accent, 0x020617, 0.72) : blendColor(rect.accent, 0xffffff, 0.84);
  const header = isDark ? blendColor(rect.accent, 0x0f172a, 0.38) : blendColor(rect.accent, 0xffffff, 0.34);
  const textColor = isDark ? 0xf8fafc : 0x0f172a;
  const subColor = isDark ? 0xcbd5e1 : 0x475569;

  shell.rect(rect.x + 5, rect.y + 6, rect.w, rect.h).fill({ color: 0x020617, alpha: isDark ? 0.28 : 0.12 });
  shell.roundRect(rect.x, rect.y, rect.w, rect.h, 6).fill({ color: face, alpha: isDark ? 0.95 : 0.98 });
  shell.roundRect(rect.x + 3, rect.y + 3, rect.w - 6, 24, 4).fill({ color: header, alpha: 0.8 });
  shell.roundRect(rect.x, rect.y, rect.w, rect.h, 6).stroke({
    width: focused ? 3 : 1.4,
    color: rect.accent,
    alpha: focused ? 0.92 : 0.5,
  });
  shell.rect(rect.x + 10, rect.y + 12, 8, 8).fill({ color: focused ? 0x22c55e : 0x94a3b8, alpha: 0.95 });
  shell.rect(rect.x + rect.w - 18, rect.y + 12, 8, 8).fill({ color: rect.accent, alpha: 0.8 });
  panel.addChild(shell);

  const titleNode = textNode(title, rect.w < 110 ? 10 : 12, textColor, "bold");
  titleNode.anchor.set(0.5, 0);
  titleNode.position.set(rect.x + rect.w / 2, rect.y + 34);
  panel.addChild(titleNode);

  const subtitleNode = monoText(subtitle, rect.w < 110 ? 7 : 8, subColor, "bold");
  subtitleNode.anchor.set(0.5, 0);
  subtitleNode.position.set(rect.x + rect.w / 2, rect.y + 52);
  panel.addChild(subtitleNode);

  stage.addChild(panel);
  return panel;
}

function addNodeMetric(panel: Container, rect: NodeRect, label: string, value: string, isDark: boolean): void {
  const metric = monoText(`${label} ${value}`, 7, isDark ? 0xa5f3fc : 0x0369a1, "bold");
  metric.anchor.set(0.5, 0);
  metric.position.set(rect.x + rect.w / 2, rect.y + rect.h - 20);
  panel.addChild(metric);
}

function drawCore(stage: Container, rect: NodeRect, isDark: boolean, focused: boolean): void {
  const panel = drawPanelShell(stage, rect, "Root Control Core", "SDD / 승인 / 증거", isDark, focused);
  const core = monoText("CONTROL PLANE", 9, isDark ? 0x67e8f9 : 0x0e7490, "bold");
  core.anchor.set(0.5, 0);
  core.position.set(rect.x + rect.w / 2, rect.y + rect.h - 28);
  panel.addChild(core);
}

function drawServiceZone(
  stage: Container,
  zone: CloudOpsServiceZone,
  rect: NodeRect,
  isDark: boolean,
  focused: boolean,
  onClick: () => void,
): void {
  const panel = drawPanelShell(stage, rect, zone.labelKo, zone.labelEn, isDark, focused);
  panel.eventMode = "static";
  panel.cursor = "pointer";
  panel.on("pointerdown", onClick);
  addNodeMetric(panel, rect, `에이전트 ${zone.agents.length}`, `업무 ${zone.taskCount}`, isDark);
}

function drawPipelineNode(stage: Container, rect: NodeRect, label: string, status: string, isDark: boolean, focused: boolean): void {
  const panel = drawPanelShell(stage, rect, label, status === "gate" ? "승인 필요" : status === "active" ? "진행 중" : "대기", isDark, focused);
  const gate = new Graphics();
  gate.rect(rect.x + rect.w - 30, rect.y + rect.h - 18, 18, 5).fill({
    color: status === "gate" ? 0xf59e0b : status === "active" ? 0x22c55e : 0x64748b,
    alpha: 0.8,
  });
  panel.addChild(gate);
}

function drawOpsTower(
  stage: Container,
  rect: NodeRect,
  isDark: boolean,
  focused: boolean,
  activeTaskCount: number,
  approvalQueue: number,
  onClick: () => void,
): void {
  const panel = drawPanelShell(stage, rect, "OPS 관제탑", "작은 Control Tower", isDark, focused);
  panel.eventMode = "static";
  panel.cursor = "pointer";
  panel.on("pointerdown", onClick);
  const tower = new Graphics();
  const centerX = rect.x + rect.w / 2;
  tower.rect(centerX - 8, rect.y + 64, 16, 30).fill({ color: rect.accent, alpha: 0.74 });
  tower.moveTo(centerX, rect.y + 50).lineTo(centerX - 30, rect.y + 92).lineTo(centerX + 30, rect.y + 92).lineTo(centerX, rect.y + 50);
  tower.stroke({ width: 1.4, color: rect.accent, alpha: 0.82 });
  tower.circle(centerX, rect.y + 50, 8).stroke({ width: 2, color: rect.accent, alpha: 0.9 });
  panel.addChild(tower);
  addNodeMetric(panel, rect, `실행 ${activeTaskCount}`, `승인 ${approvalQueue}`, isDark);
}

function drawSatellite(stage: Container, rect: NodeRect, label: string, hint: string, isDark: boolean, focused: boolean, onClick: () => void): void {
  const panel = drawPanelShell(stage, rect, label, hint, isDark, focused);
  panel.eventMode = "static";
  panel.cursor = "pointer";
  panel.on("pointerdown", onClick);
}

function drawMemoryNode(stage: Container, rect: NodeRect, isDark: boolean, focused: boolean, onClick: () => void): void {
  const panel = drawPanelShell(stage, rect, "기억 노드", "요약 / scope / 증거", isDark, focused);
  panel.eventMode = "static";
  panel.cursor = "pointer";
  panel.on("pointerdown", onClick);
  addNodeMetric(panel, rect, "raw 기록 차단", "안전 모드", isDark);
}

function addAgentSprite(
  stage: Container,
  textures: Record<string, Texture>,
  spriteMap: Map<string, number>,
  agent: Agent,
  x: number,
  y: number,
  cbRef: BuildOfficeSceneContext["cbRef"],
  animItemsRef: BuildOfficeSceneContext["animItemsRef"],
): void {
  const spriteNum = spriteMap.get(agent.id) ?? (hashStr(agent.id) % 44) + 1;
  const charContainer = new Container();
  charContainer.position.set(x, y);
  charContainer.eventMode = "static";
  charContainer.cursor = "pointer";
  charContainer.on("pointerdown", () => cbRef.current.onSelectAgent(agent));

  const frames = collectAgentWalkFrames(textures, spriteNum, "D");
  if (frames.length > 0) {
    const animSprite = new AnimatedSprite(frames);
    animSprite.anchor.set(0.5, 1);
    const scale = Math.min(1.45, TARGET_CHAR_H / animSprite.texture.height);
    animSprite.scale.set(scale);
    animSprite.gotoAndStop(hashStr(agent.id) % frames.length);
    if (agent.status === "offline") {
      animSprite.alpha = 0.35;
      animSprite.tint = 0x94a3b8;
    }
    charContainer.addChild(animSprite);
  } else {
    const fallback = monoText("AG", 12, 0xe2e8f0, "bold");
    fallback.anchor.set(0.5, 1);
    charContainer.addChild(fallback);
  }

  const shadow = new Graphics();
  shadow.ellipse(0, 3, 12, 4).fill({ color: 0x020617, alpha: 0.22 });
  charContainer.addChildAt(shadow, 0);

  const particles = new Container();
  stage.addChild(particles);
  stage.addChild(charContainer);
  animItemsRef.current.push({
    sprite: charContainer,
    status: agent.status,
    baseX: x,
    baseY: y,
    particles,
    agentId: agent.id,
    cliProvider: agent.cli_provider,
    cliUsageKey: agent.cli_provider,
  });
}

function placeAgentsAroundNode(
  stage: Container,
  rect: NodeRect,
  agents: Agent[],
  textures: Record<string, Texture>,
  spriteMap: Map<string, number>,
  cbRef: BuildOfficeSceneContext["cbRef"],
  animItemsRef: BuildOfficeSceneContext["animItemsRef"],
  agentPosRef: BuildOfficeSceneContext["agentPosRef"],
): void {
  const visibleAgents = agents.slice(0, 4);
  visibleAgents.forEach((agent, index) => {
    const offsetX = (index - (visibleAgents.length - 1) / 2) * 28;
    const x = Math.max(rect.x + 22, Math.min(rect.x + rect.w - 22, rect.x + rect.w / 2 + offsetX));
    const y = rect.y + rect.h + 38 + (index % 2) * 5;
    agentPosRef.current.set(agent.id, { x, y });
    addAgentSprite(stage, textures, spriteMap, agent, x, y, cbRef, animItemsRef);
  });
}

function resolveRects(width: number): {
  totalH: number;
  core: NodeRect;
  pipeline: NodeRect[];
  zones: Record<string, NodeRect>;
  ops: NodeRect;
  satellites: Record<string, NodeRect>;
  memory: NodeRect;
} {
  const isMobile = width < 620;
  const totalH = isMobile ? 980 : width < 980 ? 860 : 760;
  const margin = isMobile ? 14 : 24;
  const coreW = Math.min(width - margin * 2, isMobile ? 330 : 300);
  const core: NodeRect = { id: "core", x: Math.floor((width - coreW) / 2), y: 24, w: coreW, h: 96, accent: 0x22d3ee };

  const pipeline: NodeRect[] = [];
  const pipeKeys = ["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"];
  if (isMobile) {
    const nodeW = Math.floor((width - margin * 2 - 10) / 2);
    pipeKeys.forEach((key, index) => {
      pipeline.push({
        id: key,
        x: margin + (index % 2) * (nodeW + 10),
        y: 146 + Math.floor(index / 2) * 74,
        w: nodeW,
        h: 58,
        accent: key === "REVIEW" ? 0xf59e0b : 0x38bdf8,
      });
    });
  } else {
    const nodeGap = 8;
    const nodeW = Math.floor((width - margin * 2 - nodeGap * 5) / 6);
    pipeKeys.forEach((key, index) => {
      pipeline.push({
        id: key,
        x: margin + index * (nodeW + nodeGap),
        y: 150,
        w: nodeW,
        h: 60,
        accent: key === "REVIEW" ? 0xf59e0b : 0x38bdf8,
      });
    });
  }

  const zones: Record<string, NodeRect> = {};
  const zoneKeys = ["planning", "development", "design", "quality", "instructor"];
  if (isMobile) {
    const zoneW = Math.floor((width - margin * 2 - 10) / 2);
    zoneKeys.forEach((key, index) => {
      zones[key] = {
        id: key,
        x: margin + (index % 2) * (zoneW + 10),
        y: 398 + Math.floor(index / 2) * 118,
        w: zoneW,
        h: 80,
        accent: 0x38bdf8,
      };
    });
  } else {
    const zoneGap = 12;
    const zoneW = Math.floor((width - margin * 2 - zoneGap * 4) / 5);
    zoneKeys.forEach((key, index) => {
      zones[key] = {
        id: key,
        x: margin + index * (zoneW + zoneGap),
        y: 282 + Math.sin(index * 1.2) * 16,
        w: zoneW,
        h: 94,
        accent: 0x38bdf8,
      };
    });
  }

  const ops: NodeRect = isMobile
    ? { id: "ops", x: margin, y: 760, w: Math.floor((width - margin * 2) * 0.48), h: 104, accent: 0x2dd4bf }
    : { id: "ops", x: width - margin - 170, y: 520, w: 170, h: 118, accent: 0x2dd4bf };

  const memory: NodeRect = isMobile
    ? {
        id: "memory",
        x: margin + Math.floor((width - margin * 2) * 0.52),
        y: 760,
        w: Math.floor((width - margin * 2) * 0.48),
        h: 104,
        accent: 0xa78bfa,
      }
    : { id: "memory", x: margin, y: 520, w: 190, h: 118, accent: 0xa78bfa };

  const satellites: Record<string, NodeRect> = {};
  const satelliteKeys = ["BloggerGent", "DonggriCompany", "JasoSul"];
  if (isMobile) {
    const satW = Math.floor((width - margin * 2 - 14) / 3);
    satelliteKeys.forEach((key, index) => {
      satellites[key] = { id: key, x: margin + index * (satW + 7), y: 890, w: satW, h: 64, accent: 0x38bdf8 };
    });
  } else {
    satelliteKeys.forEach((key, index) => {
      satellites[key] = {
        id: key,
        x: width - margin - 310 + index * 104,
        y: 660,
        w: 96,
        h: 58,
        accent: key === "DonggriCompany" ? 0x22c55e : 0x38bdf8,
      };
    });
  }

  return { totalH, core, pipeline, zones, ops, satellites, memory };
}

function roomRectFromNode(dept: Department, rect: NodeRect): RoomRect {
  return { dept, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
}

function createCeoSprite(textures: Record<string, Texture>, x: number, y: number): Container {
  const container = new Container();
  container.position.set(x, y);
  const texture = textures.ceo;
  if (texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(Math.min(1, 48 / texture.height));
    container.addChild(sprite);
  } else {
    const fallback = monoText("DG", 16, 0xf8fafc, "bold");
    fallback.anchor.set(0.5, 1);
    container.addChild(fallback);
  }
  return container;
}

function resetSceneRefs(context: BuildOfficeSceneContext, preservedDeliverySprites: Set<Container>): void {
  const app = context.appRef.current;
  if (!app) return;
  const oldChildren = app.stage.removeChildren();
  for (const child of oldChildren) {
    if (preservedDeliverySprites.has(child)) continue;
    if (!child.destroyed) child.destroy({ children: true });
  }
  context.animItemsRef.current = [];
  context.roomRectsRef.current = [];
  context.agentPosRef.current.clear();
  context.breakAnimItemsRef.current = [];
  context.subCloneAnimItemsRef.current = [];
  context.subCloneBurstParticlesRef.current = [];
  context.breakBubblesRef.current = [];
  context.breakSteamParticlesRef.current = null;
  context.wallClocksRef.current = [];
  context.wallClockSecondRef.current = -1;
  context.ceoOfficeRectRef.current = null;
  context.breakRoomRectRef.current = null;
  context.ceoMeetingSeatsRef.current = [];
}

export function buildCloudOpsOfficeMapScene(context: BuildOfficeSceneContext): void {
  const app = context.appRef.current;
  if (!app) return;

  const preservedDeliverySprites = new Set<Container>();
  for (const delivery of context.deliveriesRef.current) {
    if (delivery.sprite.destroyed) continue;
    preservedDeliverySprites.add(delivery.sprite);
    detachNode(delivery.sprite);
  }
  resetSceneRefs(context, preservedDeliverySprites);

  const { departments, agents, tasks, subAgents, cloudOpsFocusMode } = context.dataRef.current;
  const focusMode = cloudOpsFocusMode ?? "overview";
  const textures = context.texturesRef.current;
  const isDark = context.themeRef.current === "dark";
  const width = Math.max(360, Math.floor(context.officeWRef.current));
  const rects = resolveRects(width);
  context.officeWRef.current = width;
  context.totalHRef.current = rects.totalH;
  app.renderer.resize(width, rects.totalH);

  const spriteMap = buildSpriteMap(agents);
  context.spriteMapRef.current = spriteMap;
  const layout = buildCloudOpsLayout({ departments, agents, tasks, subAgents });

  drawPixelGrid(app.stage, width, rects.totalH, isDark);

  const allRects = new Map<string, NodeRect>();
  allRects.set("core", rects.core);
  rects.pipeline.forEach((rect) => allRects.set(rect.id, rect));
  Object.values(rects.zones).forEach((rect) => allRects.set(rect.id, rect));
  allRects.set("ops", rects.ops);
  allRects.set("memory", rects.memory);
  Object.values(rects.satellites).forEach((rect) => allRects.set(rect.id, rect));

  for (const rect of rects.pipeline) drawConnector(app.stage, rects.core, rect, isNodeFocused(focusMode, rect.id));
  Object.values(rects.zones).forEach((rect) => drawConnector(app.stage, rects.core, rect, isNodeFocused(focusMode, rect.id)));
  drawConnector(app.stage, rects.core, rects.ops, isNodeFocused(focusMode, "ops"));
  drawConnector(app.stage, rects.core, rects.memory, isNodeFocused(focusMode, "memory"));
  Object.values(rects.satellites).forEach((rect) => drawConnector(app.stage, rects.ops, rect, isNodeFocused(focusMode, rect.id)));

  drawCore(app.stage, rects.core, isDark, isNodeFocused(focusMode, "core"));

  layout.pipelineNodes.forEach((node, index) => {
    const rect = rects.pipeline[index];
    if (!rect) return;
    drawPipelineNode(app.stage, rect, node.labelKo, node.status, isDark, isNodeFocused(focusMode, node.key));
  });

  layout.serviceZones.forEach((zone) => {
    const rect = rects.zones[zone.key];
    if (!rect) return;
    rect.accent = hexToNumber(zone.accent);
    const firstDepartment = zone.departments[0];
    if (firstDepartment) context.roomRectsRef.current.push(roomRectFromNode(firstDepartment, rect));
    drawServiceZone(app.stage, zone, rect, isDark, isNodeFocused(focusMode, zone.key), () => {
      if (firstDepartment) context.cbRef.current.onSelectDepartment(firstDepartment);
    });
    placeAgentsAroundNode(
      app.stage,
      rect,
      zone.agents,
      textures,
      spriteMap,
      context.cbRef,
      context.animItemsRef,
      context.agentPosRef,
    );
  });

  const opsDepartment = layout.controlTower.departments[0];
  if (opsDepartment) context.roomRectsRef.current.push(roomRectFromNode(opsDepartment, rects.ops));
  drawOpsTower(
    app.stage,
    rects.ops,
    isDark,
    isNodeFocused(focusMode, "ops"),
    layout.controlTower.activeTaskCount,
    layout.controlTower.approvalQueue,
    () => {
      if (opsDepartment) context.cbRef.current.onSelectDepartment(opsDepartment);
    },
  );
  placeAgentsAroundNode(
    app.stage,
    rects.ops,
    layout.controlTower.agents,
    textures,
    spriteMap,
    context.cbRef,
    context.animItemsRef,
    context.agentPosRef,
  );

  layout.satellites.forEach((satellite) => {
    const rect = rects.satellites[satellite.key];
    if (!rect) return;
    drawSatellite(app.stage, rect, satellite.label, satellite.evidenceHint, isDark, isNodeFocused(focusMode, satellite.key), () => {
      context.cbRef.current.onOpenProjects?.();
    });
  });

  drawMemoryNode(app.stage, rects.memory, isDark, isNodeFocused(focusMode, "memory"), () => {
    context.cbRef.current.onOpenMemory?.();
  });

  const ceo = createCeoSprite(textures, rects.core.x + rects.core.w / 2, rects.core.y + rects.core.h + 46);
  context.ceoPosRef.current = { x: ceo.position.x, y: ceo.position.y };
  context.ceoSpriteRef.current = ceo;
  app.stage.addChild(ceo);

  const crown = monoText("CTRL", 9, isDark ? 0xfef3c7 : 0x92400e, "bold");
  crown.anchor.set(0.5, 1);
  crown.position.set(0, -46);
  ceo.addChild(crown);
  context.crownRef.current = crown;

  const highlight = new Graphics();
  context.highlightRef.current = highlight;
  app.stage.addChild(highlight);

  const deliveryLayer = new Container();
  context.deliveryLayerRef.current = deliveryLayer;
  app.stage.addChild(deliveryLayer);
  for (const delivery of context.deliveriesRef.current) deliveryLayer.addChild(delivery.sprite);

  const focusedRects = MODE_NODE_IDS[focusMode]
    .map((id) => allRects.get(id))
    .filter((rect): rect is NodeRect => Boolean(rect));
  const focusLayer = new Graphics();
  for (const rect of focusedRects) {
    focusLayer.roundRect(rect.x - 5, rect.y - 5, rect.w + 10, rect.h + 10, 8).stroke({
      width: 2,
      color: rect.accent,
      alpha: 0.26,
    });
  }
  app.stage.addChild(focusLayer);

  context.setSceneRevision((value) => value + 1);
}
