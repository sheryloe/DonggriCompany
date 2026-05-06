import { Container, Graphics, Text, TextStyle, type Application } from "pixi.js";
import { blendColor, drawBandGradient } from "./drawing-core";
import type { OfficeFloorBand, OfficeTransportCoreLayout } from "./officeFloorPlan";

type FloorVisual = {
  base: number;
  panel: number;
  trim: number;
  text: number;
};

const FLOOR_VISUALS: Record<string, FloorVisual> = {
  shared: { base: 0x3c2f18, panel: 0xf4c15d, trim: 0xf8e0a2, text: 0x2f2108 },
  rooftop: { base: 0x12331f, panel: 0x22c55e, trim: 0x86efac, text: 0xeffdf4 },
  strategy: { base: 0x0b2e2a, panel: 0x14b8a6, trim: 0x7dd3c7, text: 0xeafffb },
  production: { base: 0x0b2341, panel: 0x3b82f6, trim: 0x93c5fd, text: 0xf3f8ff },
  quality: { base: 0x3a1708, panel: 0xf97316, trim: 0xfdba74, text: 0xfff7ed },
};

function drawFloorBand(stage: Container, band: OfficeFloorBand, officeW: number, isDark: boolean): void {
  const visual = FLOOR_VISUALS[band.id] ?? FLOOR_VISUALS.production;
  const x = 4;
  const y = band.y - 8;
  const w = officeW - 8;
  const h = band.h + 16;
  const bg = new Graphics();
  const base = isDark ? visual.base : blendColor(visual.panel, 0xffffff, 0.78);
  const bottom = isDark ? blendColor(visual.panel, 0xffffff, 0.22) : blendColor(visual.panel, 0xffffff, 0.58);

  bg.roundRect(x, y, w, h, 10).fill({ color: base, alpha: isDark ? 0.9 : 0.92 });
  drawBandGradient(bg, x + 2, y + 2, w - 4, h - 4, base, bottom, 10, isDark ? 0.62 : 0.58);
  bg.roundRect(x, y, w, h, 10).stroke({ width: 2, color: visual.trim, alpha: isDark ? 0.44 : 0.45 });
  bg.rect(x + 10, y + 28, w - 20, 2).fill({ color: visual.trim, alpha: isDark ? 0.5 : 0.38 });
  bg.rect(x + 10, y + h - 10, w - 20, 2).fill({ color: visual.trim, alpha: isDark ? 0.34 : 0.26 });

  for (let i = 0; i < 9; i += 1) {
    const dotX = x + 28 + i * 42;
    if (dotX > x + w - 24) break;
    bg.circle(dotX, y + 15, i % 3 === 0 ? 2 : 1.4).fill({ color: visual.trim, alpha: isDark ? 0.38 : 0.34 });
  }

  stage.addChild(bg);

  const level = new Text({
    text: band.level,
    style: new TextStyle({
      fontFamily: "monospace",
      fontSize: 11,
      fontWeight: "bold",
      fill: visual.text,
      letterSpacing: 1,
    }),
  });
  const levelBg = new Graphics();
  levelBg.roundRect(x + 14, y + 7, 42, 18, 5).fill({ color: visual.panel, alpha: 0.92 });
  levelBg.roundRect(x + 14, y + 7, 42, 18, 5).stroke({ width: 1, color: visual.trim, alpha: 0.75 });
  level.position.set(x + 23, y + 10);
  stage.addChild(levelBg);
  stage.addChild(level);

  const label = new Text({
    text: band.label,
    style: new TextStyle({
      fontFamily: "system-ui, sans-serif",
      fontSize: 11,
      fontWeight: "bold",
      fill: isDark ? 0xf8fafc : 0x132033,
    }),
  });
  label.position.set(x + 64, y + 10);
  stage.addChild(label);
}

function drawStairs(parent: Container, x: number, y: number, w: number, h: number, isDark: boolean): void {
  const g = new Graphics();
  const stepCount = 12;
  const stepH = h / stepCount;
  const stepW = w / 2.4;
  const rail = isDark ? 0x9dd7ff : 0x245a88;
  const stair = isDark ? 0x2f77a9 : 0xb9e0ff;

  g.roundRect(x, y, w, h, 8).fill({ color: isDark ? 0x123456 : 0xe6f6ff, alpha: 0.88 });
  g.roundRect(x, y, w, h, 8).stroke({ width: 1.4, color: rail, alpha: 0.7 });
  for (let i = 0; i < stepCount; i += 1) {
    const sx = x + 8 + (i % 2) * (w - stepW - 16);
    const sy = y + 10 + i * stepH;
    g.roundRect(sx, sy, stepW, Math.max(3, stepH * 0.48), 2).fill({ color: stair, alpha: 0.85 });
    g.rect(x + w / 2 - 1, sy, 2, stepH + 2).fill({ color: rail, alpha: 0.28 });
  }
  parent.addChild(g);

  const label = new Text({
    text: "계단",
    style: new TextStyle({ fontSize: 9, fill: isDark ? 0xdff6ff : 0x17425f, fontWeight: "bold" }),
  });
  label.anchor.set(0.5, 0);
  label.position.set(x + w / 2, y + 8);
  parent.addChild(label);
}

function drawElevator(
  parent: Container,
  core: OfficeTransportCoreLayout,
  bands: OfficeFloorBand[],
  isDark: boolean,
): void {
  const shaft = new Graphics();
  const shaftX = core.x + 40;
  const shaftW = Math.max(28, core.w - 48);
  shaft.roundRect(shaftX, core.y, shaftW, core.h, 9).fill({ color: isDark ? 0x0b1724 : 0xdbeafe, alpha: 0.88 });
  shaft
    .roundRect(shaftX, core.y, shaftW, core.h, 9)
    .stroke({ width: 1.5, color: isDark ? 0x67e8f9 : 0x2563eb, alpha: 0.68 });
  shaft
    .rect(shaftX + shaftW / 2 - 1, core.y + 8, 2, core.h - 16)
    .fill({ color: isDark ? 0x67e8f9 : 0x2563eb, alpha: 0.18 });
  parent.addChild(shaft);

  bands.forEach((band) => {
    const visual = FLOOR_VISUALS[band.id] ?? FLOOR_VISUALS.production;
    const centerY = band.y + 18;
    const call = new Graphics();
    call.roundRect(core.x + 8, centerY - 9, 26, 18, 5).fill({ color: visual.panel, alpha: 0.9 });
    call.roundRect(core.x + 8, centerY - 9, 26, 18, 5).stroke({ width: 1, color: visual.trim, alpha: 0.75 });
    call.circle(core.x + 41, centerY - 3, 2.6).fill({ color: visual.trim, alpha: 0.85 });
    call.circle(core.x + 41, centerY + 5, 2.6).fill({ color: 0xffffff, alpha: 0.52 });
    parent.addChild(call);

    const level = new Text({
      text: band.level,
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 8,
        fill: visual.text,
        fontWeight: "bold",
      }),
    });
    level.anchor.set(0.5, 0.5);
    level.position.set(core.x + 21, centerY);
    parent.addChild(level);
  });

  const cabin = new Graphics();
  const activeBand = bands[1] ?? bands[0];
  const cabinY = (activeBand?.y ?? core.y) + 40;
  cabin.roundRect(shaftX + 4, cabinY, shaftW - 8, 44, 6).fill({ color: isDark ? 0x102a44 : 0xffffff, alpha: 0.94 });
  cabin.roundRect(shaftX + 4, cabinY, shaftW - 8, 44, 6).stroke({ width: 1.2, color: 0x67e8f9, alpha: 0.9 });
  cabin.rect(shaftX + shaftW / 2 - 1, cabinY + 6, 2, 32).fill({ color: 0x67e8f9, alpha: 0.5 });
  parent.addChild(cabin);

  const label = new Text({
    text: "엘리베이터",
    style: new TextStyle({ fontSize: 8, fill: isDark ? 0xe0f2fe : 0x1e3a8a, fontWeight: "bold" }),
  });
  label.anchor.set(0.5, 0);
  label.position.set(shaftX + shaftW / 2, core.y + 8);
  parent.addChild(label);
}

export function buildFloorAccessLayer(params: {
  app: Application;
  floorBands: OfficeFloorBand[];
  transportCore: OfficeTransportCoreLayout | null;
  officeW: number;
  totalH: number;
  isDark: boolean;
}): void {
  const { app, floorBands, transportCore, officeW, isDark } = params;
  const layer = new Container();

  for (const band of floorBands) {
    drawFloorBand(layer, band, officeW, isDark);
  }

  if (transportCore) {
    const core = new Graphics();
    core.roundRect(transportCore.x - 4, transportCore.y - 2, transportCore.w + 8, transportCore.h + 4, 12).fill({
      color: isDark ? 0x10243a : 0xf8fafc,
      alpha: isDark ? 0.88 : 0.92,
    });
    core.roundRect(transportCore.x - 4, transportCore.y - 2, transportCore.w + 8, transportCore.h + 4, 12).stroke({
      width: 1.4,
      color: isDark ? 0x1f9fc4 : 0x38bdf8,
      alpha: 0.5,
    });
    layer.addChild(core);
    drawStairs(layer, transportCore.x + 6, transportCore.y + 32, 28, Math.max(120, transportCore.h - 56), isDark);
    drawElevator(layer, transportCore, floorBands, isDark);
  }

  app.stage.addChild(layer);
}
