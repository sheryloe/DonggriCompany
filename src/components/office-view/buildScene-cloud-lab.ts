import { Container, Graphics, Text, TextStyle, type Application } from "pixi.js";
import type { PixelAgentModeSettings, Task } from "../../types";
import { blendColor } from "./drawing-core";
import type { OfficeFloorBand } from "./officeFloorPlan";

interface BuildCloudLabLayerParams {
  app: Application;
  officeW: number;
  floorBands: OfficeFloorBand[];
  tasks: Task[];
  isDark: boolean;
  pixelAgentMode: PixelAgentModeSettings;
}

const NODE_LABELS = ["NODE", "QUEUE", "RUN", "SEC", "OPS", "LOG"];

function activeNodeCount(settings: PixelAgentModeSettings): number {
  if (settings.density === "compact") return 4;
  if (settings.density === "showcase") return 10;
  return 7;
}

function drawPixelNode(layer: Container, params: { x: number; y: number; label: string; accent: number; active: boolean }): void {
  const { x, y, label, accent, active } = params;
  const g = new Graphics();
  const shell = blendColor(accent, 0x020617, 0.52);
  const face = blendColor(accent, 0xffffff, active ? 0.28 : 0.12);

  g.rect(x + 3, y + 5, 52, 34).fill({ color: 0x020617, alpha: 0.26 });
  g.rect(x, y, 52, 34).fill({ color: shell, alpha: 0.84 });
  g.rect(x + 3, y + 3, 46, 28).fill({ color: face, alpha: 0.42 });
  g.rect(x, y, 52, 34).stroke({ width: 1.2, color: accent, alpha: active ? 0.78 : 0.42 });
  g.rect(x + 7, y + 8, 8, 5).fill({ color: active ? 0x86efac : 0x64748b, alpha: 0.86 });
  g.rect(x + 18, y + 8, 22, 3).fill({ color: 0xffffff, alpha: 0.22 });
  g.rect(x + 18, y + 15, 16, 3).fill({ color: 0xffffff, alpha: 0.15 });
  g.rect(x + 39, y + 23, 5, 5).fill({ color: active ? 0xfbbf24 : 0x94a3b8, alpha: 0.84 });
  layer.addChild(g);

  const text = new Text({
    text: label,
    style: new TextStyle({
      fontFamily: "monospace",
      fontSize: 7,
      fontWeight: "bold",
      fill: active ? 0xf8fafc : 0xcbd5e1,
      letterSpacing: 0,
    }),
  });
  text.anchor.set(0.5, 0);
  text.position.set(x + 26, y + 20);
  layer.addChild(text);
}

function drawConnector(layer: Container, fromX: number, fromY: number, toX: number, toY: number, color: number): void {
  const g = new Graphics();
  const midX = Math.floor((fromX + toX) / 2);
  g.moveTo(fromX, fromY);
  g.lineTo(midX, fromY);
  g.lineTo(midX, toY);
  g.lineTo(toX, toY);
  g.stroke({ width: 1.2, color, alpha: 0.24 });
  g.rect(midX - 1, Math.floor((fromY + toY) / 2) - 1, 3, 3).fill({ color, alpha: 0.38 });
  layer.addChild(g);
}

export function buildCloudLabLayer({
  app,
  officeW,
  floorBands,
  tasks,
  isDark,
  pixelAgentMode,
}: BuildCloudLabLayerParams): void {
  if (!pixelAgentMode.enabled) return;

  const layer = new Container();
  const activeTaskCount = tasks.filter((task) => task.status === "in_progress" || task.status === "review").length;
  const nodeCount = activeNodeCount(pixelAgentMode);
  const palette = isDark
    ? [0x38bdf8, 0x34d399, 0xfbbf24, 0xfb7185]
    : [0x0284c7, 0x059669, 0xd97706, 0xe11d48];
  const bands = floorBands.length > 0 ? floorBands : [{ y: 140, h: 500, accent: 0x38bdf8 } as OfficeFloorBand];
  const leftLane = Math.max(22, Math.floor(officeW * 0.04));
  const rightLane = Math.max(leftLane + 80, officeW - 94);
  const useRightLane = pixelAgentMode.density !== "compact";
  const points: Array<{ x: number; y: number; color: number }> = [];

  for (let index = 0; index < nodeCount; index += 1) {
    const band = bands[index % bands.length];
    const laneRight = useRightLane && index % 2 === 1;
    const x = laneRight ? rightLane : leftLane;
    const y = band.y + 38 + ((index * 37) % Math.max(54, band.h - 74));
    const color = palette[index % palette.length] ?? 0x38bdf8;
    const active = index < Math.max(2, Math.min(nodeCount, activeTaskCount + 2));
    points.push({ x: x + 26, y: y + 17, color });
    drawPixelNode(layer, {
      x,
      y,
      label: NODE_LABELS[index % NODE_LABELS.length] ?? "NODE",
      accent: color,
      active,
    });
  }

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    drawConnector(layer, prev.x, prev.y, next.x, next.y, prev.color);
  }

  app.stage.addChild(layer);
}
