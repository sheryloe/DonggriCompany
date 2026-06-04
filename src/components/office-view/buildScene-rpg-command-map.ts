import { Container, Graphics, Text, TextStyle, type Texture } from "pixi.js";
import { buildSpriteMap } from "../AgentAvatar";
import type { Agent } from "../../types";
import { buildRpgCommandMapLayout, type RpgMapNode } from "./rpgCommandMapLayout";
import { detachNode, type RoomRect } from "./model";
import { blendColor, hashStr } from "./drawing-core";
import { createAgentWalkActor } from "./spriteActors";
import type { BuildOfficeSceneContext } from "./buildScene-types";

const WORLD_W = 720;
const WORLD_H = 560;
const TILE = 16;

type PixelPalette = {
  grassA: number;
  grassB: number;
  grassC: number;
  dirtA: number;
  dirtB: number;
  dirtEdge: number;
  waterA: number;
  waterB: number;
  treeA: number;
  treeB: number;
  trunk: number;
  rockA: number;
  rockB: number;
  ink: number;
  paper: number;
  shadow: number;
};

function palette(isDark: boolean): PixelPalette {
  return isDark
    ? {
        grassA: 0x0d241c,
        grassB: 0x123423,
        grassC: 0x1c4b2e,
        dirtA: 0x8a6334,
        dirtB: 0xb17a35,
        dirtEdge: 0x4f351d,
        waterA: 0x063348,
        waterB: 0x0b7490,
        treeA: 0x14532d,
        treeB: 0x22c55e,
        trunk: 0x7c4a22,
        rockA: 0x475569,
        rockB: 0x94a3b8,
        ink: 0xe5f7ff,
        paper: 0x102033,
        shadow: 0x020617,
      }
    : {
        grassA: 0xcdf7c8,
        grassB: 0xb9efb8,
        grassC: 0x8fd88a,
        dirtA: 0xc9934a,
        dirtB: 0xe4b765,
        dirtEdge: 0x92662d,
        waterA: 0x9bdcf5,
        waterB: 0x38bdf8,
        treeA: 0x4d9f42,
        treeB: 0x7ed957,
        trunk: 0x9a6731,
        rockA: 0x94a3b8,
        rockB: 0xe2e8f0,
        ink: 0x0f172a,
        paper: 0xf8fafc,
        shadow: 0x475569,
      };
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
      lineHeight: Math.round(size * 1.15),
    }),
  });
}

function shortLabel(node: RpgMapNode): string {
  if (node.id === "castle") return "CONTROL";
  if (node.id === "ops") return "OPS";
  if (node.id === "memory") return "MEMORY";
  if (node.id.startsWith("project-")) return node.label.replace("DonggriCompany", "Donggri").slice(0, 10);
  if (node.label.includes("기획")) return "기획";
  if (node.label.includes("개발")) return "개발";
  if (node.label.includes("디자인")) return "디자인";
  if (node.label.includes("품질")) return "품질";
  if (node.label.includes("강사")) return "강사";
  return node.label.slice(0, 8);
}

function routeLabel(node: RpgMapNode): string {
  if (node.id.includes("control")) return "승인";
  if (node.id.includes("spec")) return "스펙";
  if (node.id.includes("explore")) return "탐색";
  if (node.id.includes("implement")) return "구현";
  if (node.id.includes("review")) return "검토";
  if (node.id.includes("ops")) return "운영";
  return node.label;
}

function statusColor(status: RpgMapNode["status"]): number {
  if (status === "watch") return 0xf59e0b;
  if (status === "active") return 0x22c55e;
  return 0x38bdf8;
}

function nodeIsFocused(focusNodeIds: string[], id: string): boolean {
  return focusNodeIds.includes(id);
}

function rect(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  g.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).fill({ color, alpha });
}

function drawPixelTerrain(stage: Container, colors: PixelPalette, isDark: boolean): void {
  const g = new Graphics();
  rect(g, 0, 0, WORLD_W, WORLD_H, colors.grassA);

  for (let y = 0; y < WORLD_H; y += TILE) {
    for (let x = 0; x < WORLD_W; x += TILE) {
      const seed = (x * 17 + y * 31 + ((x / TILE) ^ (y / TILE)) * 13) % 11;
      const color = seed < 3 ? colors.grassB : seed === 7 ? colors.grassC : colors.grassA;
      rect(g, x, y, TILE, TILE, color, seed === 7 ? 0.42 : 0.82);
      if (seed % 5 === 0) rect(g, x + 4, y + 5, 3, 3, isDark ? 0x2c7a3f : 0x60b855, 0.72);
      if (seed % 7 === 0) rect(g, x + 11, y + 10, 2, 2, isDark ? 0x6ee7b7 : 0x2f8a41, 0.55);
    }
  }

  drawWaterPatch(g, colors, 16, 402, 170, 76);
  drawWaterPatch(g, colors, 594, 30, 120, 58);
  drawWaterPatch(g, colors, 626, 420, 94, 72);
  drawCliffBand(g, colors, 0, 492, WORLD_W, isDark);
  stage.addChild(g);

  const decor = new Graphics();
  for (const [x, y] of [
    [44, 72],
    [84, 418],
    [146, 96],
    [210, 422],
    [462, 62],
    [628, 112],
    [666, 172],
    [504, 486],
    [36, 326],
    [276, 92],
  ]) {
    drawTree(decor, colors, x, y);
  }
  for (const [x, y] of [
    [132, 302],
    [222, 256],
    [474, 190],
    [602, 318],
    [410, 492],
    [318, 56],
  ]) {
    drawRock(decor, colors, x, y);
  }
  stage.addChild(decor);
}

function drawWaterPatch(g: Graphics, colors: PixelPalette, x: number, y: number, w: number, h: number): void {
  for (let yy = y; yy < y + h; yy += TILE) {
    for (let xx = x; xx < x + w; xx += TILE) {
      const edge = xx === x || yy === y || xx + TILE >= x + w || yy + TILE >= y + h;
      rect(g, xx, yy, TILE, TILE, edge ? colors.waterB : colors.waterA, edge ? 0.5 : 0.72);
      if ((xx + yy) % 48 === 0) rect(g, xx + 5, yy + 7, 8, 2, 0xffffff, 0.22);
    }
  }
}

function drawCliffBand(g: Graphics, colors: PixelPalette, x: number, y: number, w: number, isDark: boolean): void {
  for (let xx = x; xx < x + w; xx += TILE) {
    rect(g, xx, y, TILE, TILE, isDark ? 0x1f2937 : 0xb6c4b4, 0.68);
    if ((xx / TILE) % 2 === 0) {
      rect(g, xx + 1, y + 2, 14, 4, colors.rockB, 0.36);
      rect(g, xx + 3, y + 10, 6, 3, colors.shadow, 0.16);
    }
  }
}

function drawTree(g: Graphics, colors: PixelPalette, x: number, y: number): void {
  rect(g, x + 7, y + 16, 5, 12, colors.trunk);
  rect(g, x + 2, y + 9, 18, 10, colors.treeA);
  rect(g, x + 5, y + 4, 12, 10, colors.treeB, 0.94);
  rect(g, x + 8, y, 7, 8, colors.treeA);
  rect(g, x + 16, y + 12, 4, 4, colors.shadow, 0.16);
}

function drawRock(g: Graphics, colors: PixelPalette, x: number, y: number): void {
  rect(g, x + 2, y + 8, 18, 8, colors.rockA, 0.76);
  rect(g, x + 6, y + 4, 12, 6, colors.rockB, 0.68);
  rect(g, x + 1, y + 15, 20, 3, colors.shadow, 0.14);
}

function drawRoadTile(g: Graphics, colors: PixelPalette, x: number, y: number, focused: boolean): void {
  const tx = Math.round(x / TILE) * TILE;
  const ty = Math.round(y / TILE) * TILE;
  rect(g, tx, ty, TILE, TILE, colors.dirtA, focused ? 0.98 : 0.84);
  rect(g, tx + 2, ty + 2, 12, 12, colors.dirtB, focused ? 0.78 : 0.55);
  if ((tx + ty) % 32 === 0) rect(g, tx + 4, ty + 11, 4, 2, colors.dirtEdge, 0.4);
}

function drawTileRoad(stage: Container, colors: PixelPalette, points: Array<[number, number]>, focused: boolean): void {
  const g = new Graphics();
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 10));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      drawRoadTile(g, colors, x, y, focused);
      if (s % 3 === 0) drawRoadTile(g, colors, x + 8, y, focused);
    }
  }
  stage.addChild(g);
}

function drawPixelSign(stage: Container, x: number, y: number, label: string, colors: PixelPalette, accent: number): void {
  const g = new Graphics();
  rect(g, x + 5, y + 16, 3, 12, colors.trunk);
  rect(g, x, y, Math.max(38, label.length * 8 + 12), 15, colors.paper, 0.94);
  rect(g, x, y, Math.max(38, label.length * 8 + 12), 2, accent, 0.82);
  rect(g, x, y + 13, Math.max(38, label.length * 8 + 12), 2, colors.shadow, 0.2);
  stage.addChild(g);

  const text = pixelText(label, 8, colors.ink, "bold");
  text.position.set(x + 6, y + 3);
  stage.addChild(text);
}

function drawFocusCorners(stage: Container, node: RpgMapNode, focused: boolean, accent = node.accent): void {
  if (!focused) return;
  const g = new Graphics();
  const x = node.x - 10;
  const y = node.y - 14;
  const w = node.w + 20;
  const h = node.h + 28;
  const len = 18;
  const width = 4;
  rect(g, x, y, len, width, accent, 0.9);
  rect(g, x, y, width, len, accent, 0.9);
  rect(g, x + w - len, y, len, width, accent, 0.9);
  rect(g, x + w - width, y, width, len, accent, 0.9);
  rect(g, x, y + h - width, len, width, accent, 0.9);
  rect(g, x, y + h - len, width, len, accent, 0.9);
  rect(g, x + w - len, y + h - width, len, width, accent, 0.9);
  rect(g, x + w - width, y + h - len, width, len, accent, 0.9);
  stage.addChild(g);
}

function addHitTarget(container: Container, node: RpgMapNode): void {
  const hit = new Graphics();
  rect(hit, node.x - 10, node.y - 18, node.w + 20, node.h + 34, 0xffffff, 0.001);
  container.addChild(hit);
}

function drawBattlement(g: Graphics, x: number, y: number, w: number, color: number): void {
  for (let xx = x; xx < x + w; xx += 12) rect(g, xx, y, 8, 8, color);
}

function drawSteppedRoof(g: Graphics, x: number, y: number, w: number, color: number, shade: number): void {
  for (let row = 0; row < 5; row += 1) {
    const inset = row * 7;
    rect(g, x + inset, y + row * 5, w - inset * 2, 6, row < 2 ? color : shade);
  }
}

function drawCastle(stage: Container, node: RpgMapNode, colors: PixelPalette, focused: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  const stone = 0x8fa7b7;
  const stoneDark = 0x4b6375;
  const roof = focused ? 0x22d3ee : 0x3b82f6;
  rect(g, node.x + 8, node.y + 14, node.w, node.h, colors.shadow, 0.26);
  drawBattlement(g, node.x + 14, node.y + 18, node.w - 28, stoneDark);
  rect(g, node.x + 20, node.y + 26, node.w - 40, node.h - 28, stone);
  rect(g, node.x + 6, node.y + 34, 30, node.h - 28, stoneDark);
  rect(g, node.x + node.w - 36, node.y + 34, 30, node.h - 28, stoneDark);
  drawBattlement(g, node.x + 6, node.y + 28, 30, stone);
  drawBattlement(g, node.x + node.w - 36, node.y + 28, 30, stone);
  drawSteppedRoof(g, node.x + 16, node.y + 4, 38, roof, blendColor(roof, 0x020617, 0.28));
  drawSteppedRoof(g, node.x + node.w - 54, node.y + 4, 38, roof, blendColor(roof, 0x020617, 0.28));
  rect(g, node.x + node.w / 2 - 11, node.y + node.h - 22, 22, 22, 0x1e293b);
  rect(g, node.x + node.w / 2 - 3, node.y + node.h - 18, 6, 18, 0x0f172a);
  rect(g, node.x + 42, node.y + 44, 8, 8, 0xc7d2fe);
  rect(g, node.x + node.w - 52, node.y + 44, 8, 8, 0xc7d2fe);
  c.addChild(g);
  addHitTarget(c, node);
  stage.addChild(c);
  drawFocusCorners(stage, node, focused, 0x22d3ee);
  drawPixelSign(stage, node.x + node.w / 2 - 30, node.y + node.h + 4, "CONTROL", colors, 0x22d3ee);
  return c;
}

function drawGuildHall(g: Graphics, node: RpgMapNode, colors: PixelPalette): void {
  rect(g, node.x + 8, node.y + 34, node.w - 16, node.h - 36, 0x3b82f6);
  drawSteppedRoof(g, node.x + 2, node.y + 12, node.w - 4, 0x38bdf8, 0x0284c7);
  rect(g, node.x + 18, node.y + 46, 12, 14, 0xbfeeff);
  rect(g, node.x + node.w - 30, node.y + 46, 12, 14, 0xbfeeff);
  rect(g, node.x + node.w / 2 - 9, node.y + node.h - 22, 18, 22, colors.shadow, 0.72);
  rect(g, node.x + node.w / 2 - 3, node.y + node.h - 17, 6, 6, 0xfacc15);
}

function drawForge(g: Graphics, node: RpgMapNode, colors: PixelPalette): void {
  rect(g, node.x + 12, node.y + 34, node.w - 24, node.h - 34, 0x16a34a);
  drawSteppedRoof(g, node.x + 6, node.y + 10, node.w - 12, 0x22c55e, 0x15803d);
  rect(g, node.x + node.w - 30, node.y + 4, 14, 38, 0x475569);
  rect(g, node.x + node.w - 27, node.y, 8, 8, 0xf97316, 0.85);
  rect(g, node.x + 22, node.y + 50, 30, 10, 0x1f2937);
  rect(g, node.x + 30, node.y + 42, 14, 8, 0x334155);
  rect(g, node.x + node.w / 2 - 10, node.y + node.h - 22, 20, 22, colors.shadow, 0.75);
}

function drawAtelier(g: Graphics, node: RpgMapNode, colors: PixelPalette): void {
  rect(g, node.x + 10, node.y + 34, node.w - 20, node.h - 34, 0xb45380);
  drawSteppedRoof(g, node.x + 4, node.y + 11, node.w - 8, 0xf472b6, 0xbe185d);
  rect(g, node.x + 20, node.y + 48, 18, 24, 0xfdf2f8);
  rect(g, node.x + 23, node.y + 52, 12, 3, 0x38bdf8);
  rect(g, node.x + node.w - 42, node.y + 48, 18, 18, 0xfbcfe8);
  rect(g, node.x + node.w / 2 - 9, node.y + node.h - 22, 18, 22, colors.shadow, 0.7);
}

function drawKeep(g: Graphics, node: RpgMapNode, colors: PixelPalette): void {
  rect(g, node.x + 10, node.y + 30, node.w - 20, node.h - 30, 0xb7791f);
  drawBattlement(g, node.x + 12, node.y + 24, node.w - 24, 0xf59e0b);
  rect(g, node.x + 2, node.y + 38, 24, node.h - 34, 0x92400e);
  rect(g, node.x + node.w - 26, node.y + 38, 24, node.h - 34, 0x92400e);
  rect(g, node.x + 24, node.y + 52, 10, 10, 0xfef3c7);
  rect(g, node.x + node.w - 34, node.y + 52, 10, 10, 0xfef3c7);
  rect(g, node.x + node.w / 2 - 11, node.y + node.h - 22, 22, 22, colors.shadow, 0.74);
}

function drawAcademy(g: Graphics, node: RpgMapNode, colors: PixelPalette): void {
  rect(g, node.x + 10, node.y + 34, node.w - 20, node.h - 34, 0x7c3aed);
  drawSteppedRoof(g, node.x + 5, node.y + 11, node.w - 10, 0xa78bfa, 0x6d28d9);
  rect(g, node.x + 18, node.y + 48, 12, 16, 0xddd6fe);
  rect(g, node.x + node.w - 32, node.y + 48, 12, 16, 0xddd6fe);
  rect(g, node.x + node.w / 2 - 20, node.y + 46, 40, 8, 0x312e81);
  rect(g, node.x + node.w / 2 - 8, node.y + node.h - 20, 16, 20, colors.shadow, 0.72);
}

function drawArchive(g: Graphics, node: RpgMapNode, colors: PixelPalette): void {
  rect(g, node.x + 12, node.y + 34, node.w - 24, node.h - 32, 0x6366f1);
  drawSteppedRoof(g, node.x + 8, node.y + 10, node.w - 16, 0x818cf8, 0x4f46e5);
  for (let i = 0; i < 4; i += 1) {
    rect(g, node.x + 24 + i * 19, node.y + 48, 10, 18, i % 2 ? 0xc4b5fd : 0x93c5fd);
  }
  rect(g, node.x + node.w / 2 - 10, node.y + node.h - 20, 20, 20, colors.shadow, 0.72);
}

function drawSignalTower(g: Graphics, node: RpgMapNode, colors: PixelPalette, focused: boolean): void {
  const cx = node.x + node.w / 2;
  rect(g, node.x + 32, node.y + 42, 40, node.h - 42, 0x0f766e);
  rect(g, node.x + 42, node.y + node.h - 26, 20, 26, colors.shadow, 0.76);
  rect(g, cx - 4, node.y + 16, 8, 80, 0x14b8a6);
  rect(g, cx - 26, node.y + 94, 52, 5, 0x14b8a6);
  rect(g, cx - 20, node.y + 58, 40, 5, 0x14b8a6);
  rect(g, cx - 13, node.y + 26, 26, 5, 0x14b8a6);
  rect(g, cx - 8, node.y + 4, 16, 16, focused ? 0x5eead4 : 0x2dd4bf);
  rect(g, cx - 18, node.y, 36, 2, focused ? 0x99f6e4 : 0x14b8a6);
  rect(g, cx - 28, node.y + 10, 6, 3, 0x99f6e4, focused ? 0.7 : 0.3);
  rect(g, cx + 22, node.y + 10, 6, 3, 0x99f6e4, focused ? 0.7 : 0.3);
}

function drawPixelBuilding(stage: Container, node: RpgMapNode, colors: PixelPalette, focused: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  rect(g, node.x + 8, node.y + node.h - 4, node.w, 15, colors.shadow, 0.2);
  if (node.kind === "guild") drawGuildHall(g, node, colors);
  else if (node.kind === "forge") drawForge(g, node, colors);
  else if (node.kind === "atelier") drawAtelier(g, node, colors);
  else if (node.kind === "keep") drawKeep(g, node, colors);
  else if (node.kind === "academy") drawAcademy(g, node, colors);
  else if (node.kind === "archive") drawArchive(g, node, colors);
  else if (node.kind === "tower") drawSignalTower(g, node, colors, focused);
  else drawGuildHall(g, node, colors);
  c.addChild(g);
  addHitTarget(c, node);
  stage.addChild(c);
  drawFocusCorners(stage, node, focused);
  drawPixelSign(stage, node.x + node.w / 2 - 20, node.y + node.h + 4, shortLabel(node), colors, node.accent);
  return c;
}

function drawRouteMarker(stage: Container, node: RpgMapNode, colors: PixelPalette, focused: boolean): void {
  const g = new Graphics();
  rect(g, node.x + 22, node.y + 13, 5, 27, colors.trunk);
  rect(g, node.x + 9, node.y + 2, 34, 18, focused ? 0xfacc15 : colors.paper, 0.96);
  rect(g, node.x + 9, node.y + 2, 34, 3, node.accent, 0.9);
  rect(g, node.x + 9, node.y + 17, 34, 3, colors.shadow, 0.18);
  if (focused) rect(g, node.x + 5, node.y - 2, 42, 26, node.accent, 0.12);
  stage.addChild(g);
  const text = pixelText(routeLabel(node), 8, colors.ink, "bold");
  text.anchor.set(0.5, 0);
  text.position.set(node.x + 26, node.y + 6);
  stage.addChild(text);
}

function drawFlag(g: Graphics, x: number, y: number, color: number, colors: PixelPalette): void {
  rect(g, x, y, 3, 38, colors.trunk);
  rect(g, x + 3, y + 3, 24, 12, color);
  rect(g, x + 19, y + 15, 8, 6, blendColor(color, 0xffffff, 0.25));
}

function drawProjectVillage(stage: Container, node: RpgMapNode, colors: PixelPalette, focused: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  rect(g, node.x + 8, node.y + 34, 70, 12, colors.shadow, 0.16);
  drawFlag(g, node.x + 6, node.y + 2, node.accent, colors);
  for (let i = 0; i < 2; i += 1) {
    const hx = node.x + 30 + i * 36;
    const hy = node.y + 18 + i * 7;
    rect(g, hx, hy + 16, 26, 21, blendColor(node.accent, colors.paper, 0.52));
    drawSteppedRoof(g, hx - 2, hy + 4, 30, node.accent, blendColor(node.accent, 0x020617, 0.25));
    rect(g, hx + 10, hy + 28, 7, 9, colors.shadow, 0.65);
  }
  if (focused) rect(g, node.x, node.y, node.w, node.h, node.accent, 0.1);
  c.addChild(g);
  addHitTarget(c, node);
  stage.addChild(c);
  drawFocusCorners(stage, node, focused);
  drawPixelSign(stage, node.x + 26, node.y + node.h - 1, shortLabel(node), colors, node.accent);
  return c;
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
    targetHeight: 36 * scaleBoost,
    fallbackText: agent.name_ko?.slice(0, 2) || "AG",
  });
  actor.position.set(x, y);
  actor.eventMode = "static";
  actor.cursor = "pointer";
  stage.addChild(actor);
  return actor;
}

function drawPlayerMarker(stage: Container, textures: Record<string, Texture>, colors: PixelPalette, x: number, y: number): void {
  const glow = new Graphics();
  rect(glow, x - 13, y - 31, 26, 6, 0x22d3ee, 0.25);
  rect(glow, x - 17, y - 25, 34, 18, 0x22d3ee, 0.12);
  stage.addChild(glow);
  if (textures.ceo) {
    const { actor } = createAgentWalkActor({ textures, spriteNumber: 1, targetHeight: 40, fallbackText: "DG" });
    actor.position.set(x, y);
    stage.addChild(actor);
    return;
  }
  const g = new Graphics();
  rect(g, x - 7, y - 24, 14, 15, 0xef4444);
  rect(g, x - 5, y - 34, 10, 10, 0xfbbf24);
  rect(g, x - 4, y - 9, 8, 9, colors.ink);
  stage.addChild(g);
}

function drawMiniMapFrame(stage: Container, width: number, height: number, isDark: boolean): void {
  const frame = new Graphics();
  rect(frame, 0, 0, width, 3, isDark ? 0x0e7490 : 0x0284c7, 0.45);
  rect(frame, 0, height - 3, width, 3, isDark ? 0x0e7490 : 0x0284c7, 0.45);
  rect(frame, 0, 0, 3, height, isDark ? 0x0e7490 : 0x0284c7, 0.45);
  rect(frame, width - 3, 0, 3, height, isDark ? 0x0e7490 : 0x0284c7, 0.45);
  stage.addChild(frame);
}

export function buildRpgCommandMapScene(context: BuildOfficeSceneContext): void {
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
  const mode = data.rpgFocusMode ?? "overview";
  const layout = buildRpgCommandMapLayout({
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
  const height = width < 560 ? 430 : Math.max(500, Math.min(660, Math.round(width * 0.68)));

  app.renderer.resize(width, height);
  context.totalHRef.current = height;

  const world = new Container();
  const fit = Math.min(width / WORLD_W, height / WORLD_H);
  const scale = fit * layout.camera.zoom;
  world.scale.set(scale);
  world.pivot.set(layout.camera.x, layout.camera.y);
  world.position.set(width / 2, height / 2);
  app.stage.addChild(world);

  drawPixelTerrain(world, colors, isDark);
  drawTileRoad(
    world,
    colors,
    [
      [360, 126],
      [360, 226],
      [304, 294],
      [352, 416],
    ],
    mode === "pipeline" || mode === "build",
  );
  drawTileRoad(
    world,
    colors,
    [
      [366, 258],
      [514, 296],
      [560, 408],
    ],
    mode === "pipeline" || mode === "review",
  );
  drawTileRoad(
    world,
    colors,
    [
      [404, 238],
      [570, 154],
      [620, 112],
    ],
    mode === "ops" || mode === "pipeline",
  );
  drawTileRoad(
    world,
    colors,
    [
      [374, 208],
      [360, 118],
    ],
    mode === "memory",
  );
  drawTileRoad(
    world,
    colors,
    [
      [304, 294],
      [162, 214],
      [146, 230],
    ],
    mode === "pipeline",
  );

  for (const node of layout.routeNodes) {
    drawRouteMarker(world, node, colors, nodeIsFocused(layout.camera.focusNodeIds, node.id));
  }

  drawCastle(world, layout.castleNode, colors, nodeIsFocused(layout.camera.focusNodeIds, "castle"));
  drawPlayerMarker(
    world,
    context.texturesRef.current,
    colors,
    layout.castleNode.x + layout.castleNode.w / 2,
    layout.castleNode.y + layout.castleNode.h + 29,
  );

  for (const node of layout.departmentNodes) {
    const building = drawPixelBuilding(world, node, colors, nodeIsFocused(layout.camera.focusNodeIds, node.id));
    building.eventMode = "static";
    building.cursor = "pointer";
    building.on("pointerdown", () => {
      const department = data.departments.find((candidate) => node.departmentIds?.includes(candidate.id));
      if (department) callbacks.onSelectDepartment(department);
    });

    const department = data.departments.find((candidate) => node.departmentIds?.includes(candidate.id));
    if (department) {
      context.roomRectsRef.current.push({ dept: department, x: node.x, y: node.y, w: node.w, h: node.h } satisfies RoomRect);
    }

    node.agents.slice(0, 2).forEach((agent, index) => {
      const actor = addSpriteForAgent(
        world,
        context.texturesRef.current,
        spriteMap,
        agent,
        node.x + 30 + index * 38,
        node.y + node.h + 24,
        0.78,
      );
      actor.on("pointerdown", () => callbacks.onSelectAgent(agent));
      context.animItemsRef.current.push({
        sprite: actor,
        status: agent.status,
        baseX: actor.position.x,
        baseY: actor.position.y,
        particles: new Container(),
        agentId: agent.id,
        cliProvider: agent.cli_provider,
      });
      context.agentPosRef.current.set(agent.id, { x: actor.position.x, y: actor.position.y });
    });
  }

  const ops = drawPixelBuilding(world, layout.opsNode, colors, nodeIsFocused(layout.camera.focusNodeIds, "ops"));
  ops.eventMode = "static";
  ops.cursor = "pointer";
  ops.on("pointerdown", () => {
    const department = data.departments.find((candidate) => layout.opsNode.departmentIds?.includes(candidate.id));
    if (department) callbacks.onSelectDepartment(department);
  });

  const memory = drawPixelBuilding(world, layout.memoryNode, colors, nodeIsFocused(layout.camera.focusNodeIds, "memory"));
  memory.eventMode = "static";
  memory.cursor = "pointer";
  memory.on("pointerdown", () => callbacks.onOpenMemory?.());

  for (const node of layout.projectNodes) {
    const territory = drawProjectVillage(world, node, colors, nodeIsFocused(layout.camera.focusNodeIds, node.id));
    territory.eventMode = "static";
    territory.cursor = "pointer";
    territory.on("pointerdown", () => callbacks.onOpenProjects?.());
  }

  const statusLayer = new Graphics();
  for (const node of [layout.castleNode, layout.memoryNode, layout.opsNode, ...layout.departmentNodes]) {
    rect(statusLayer, node.x + node.w - 12, node.y + node.h, 9, 9, colors.shadow, 0.18);
    rect(statusLayer, node.x + node.w - 11, node.y + node.h + 1, 7, 7, statusColor(node.status));
  }
  world.addChild(statusLayer);

  drawMiniMapFrame(app.stage, width, height, isDark);

  const label = pixelText(`CAM ${layout.camera.key.toUpperCase()}  TILEMAP ${Math.round(layout.camera.zoom * 100)}%`, 10, isDark ? 0xa5f3fc : 0x075985, "bold");
  label.position.set(14, 12);
  app.stage.addChild(label);

  context.setSceneRevision((value) => value + 1);
}
