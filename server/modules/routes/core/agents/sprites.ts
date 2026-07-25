import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";

const SPRITE_REGISTER_DIRECTIONS = ["D", "L", "B", "R"] as const;
const SPRITE_REGISTER_FRAMES = [1, 2, 3] as const;
type SpriteRegisterDirection = (typeof SPRITE_REGISTER_DIRECTIONS)[number];
export type SpriteRegisterPackKey = "legacy" | "donggri_visual_v2";

export function parseSpriteRegisterPackKey(value: unknown): SpriteRegisterPackKey | null {
  if (value == null || value === "") return "legacy";
  if (value === "legacy" || value === "donggri_visual_v2") return value;
  return null;
}

export function normalizeSpriteRegisterPackKey(value: unknown): SpriteRegisterPackKey {
  return parseSpriteRegisterPackKey(value) ?? "legacy";
}

export function resolveSpriteRegisterDir(projectRoot: string, packKey: SpriteRegisterPackKey): string {
  const baseDir = path.join(projectRoot, "public", "sprites");
  return packKey === "donggri_visual_v2" ? path.join(baseDir, "donggri-visual-v2") : baseDir;
}

function buildSpriteRegisterFilenames(spriteNumber: number, direction: SpriteRegisterDirection): string[] {
  return SPRITE_REGISTER_FRAMES.map((frame) => `${spriteNumber}-${direction}-${frame}.png`);
}

function formatSavedSpritePath(packKey: SpriteRegisterPackKey, filename: string): string {
  return packKey === "donggri_visual_v2" ? `donggri-visual-v2/${filename}` : filename;
}

export function registerSpriteRoutes(ctx: RuntimeContext): void {
  const { app } = ctx;

  app.post("/api/sprites/process", async (req, res) => {
    try {
      const { image } = req.body as { image: string };
      if (!image) return res.status(400).json({ error: "image_required" });

      const match = image.match(/^data:image\/\w+;base64,(.+)$/);
      if (!match) return res.status(400).json({ error: "invalid_image_format" });
      const imgBuf = Buffer.from(match[1], "base64");
      if (!imgBuf.length || imgBuf.length > 8 * 1024 * 1024) {
        return res.status(400).json({ error: "image_too_large" });
      }

      const meta = await sharp(imgBuf).metadata();
      const w = meta.width;
      const h = meta.height;
      if (!w || !h) return res.status(400).json({ error: "invalid_image_dimensions" });
      if (w > 4096 || h > 4096) return res.status(400).json({ error: "image_dimensions_too_large" });
      const halfW = Math.floor(w / 2);
      const halfH = Math.floor(h / 2);

      const regions = [
        { name: "D", left: 0, top: 0, width: halfW, height: halfH },
        { name: "L", left: halfW, top: 0, width: w - halfW, height: halfH },
        { name: "B", left: 0, top: halfH, width: halfW, height: h - halfH },
        { name: "R", left: halfW, top: halfH, width: w - halfW, height: h - halfH },
      ];

      const results: Record<string, string> = {};

      for (const region of regions) {
        const regionBuf = await sharp(imgBuf)
          .extract({ left: region.left, top: region.top, width: region.width, height: region.height })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const { data, info } = regionBuf;
        const rw = info.width;
        const rh = info.height;
        const pixels = new Uint8Array(data);

        const edgePositions: number[] = [];
        for (let x = 0; x < rw; x++) {
          edgePositions.push(x);
          edgePositions.push((rh - 1) * rw + x);
        }
        for (let y = 1; y < rh - 1; y++) {
          edgePositions.push(y * rw);
          edgePositions.push(y * rw + rw - 1);
        }

        const edgeColors: { r: number; g: number; b: number; bright: number }[] = [];
        for (const pos of edgePositions) {
          if (pixels[pos * 4 + 3] < 10) continue;
          const r = pixels[pos * 4];
          const g = pixels[pos * 4 + 1];
          const b = pixels[pos * 4 + 2];
          edgeColors.push({ r, g, b, bright: (r + g + b) / 3 });
        }

        if (edgeColors.length === 0) edgeColors.push({ r: 255, g: 255, b: 255, bright: 255 });
        const brightValues = edgeColors.map((c) => c.bright).sort((a, b) => a - b);
        const medianBright = brightValues[Math.floor(brightValues.length / 2)];
        const minBright = brightValues[0];
        const maxBright = brightValues[brightValues.length - 1];

        const bgClusters: { r: number; g: number; b: number }[] = [];
        if (maxBright - minBright > 30) {
          const lo = edgeColors.filter((c) => c.bright <= medianBright);
          const hi = edgeColors.filter((c) => c.bright > medianBright);
          for (const group of [lo, hi]) {
            if (group.length === 0) continue;
            const avg = { r: 0, g: 0, b: 0 };
            for (const c of group) {
              avg.r += c.r;
              avg.g += c.g;
              avg.b += c.b;
            }
            bgClusters.push({
              r: Math.round(avg.r / group.length),
              g: Math.round(avg.g / group.length),
              b: Math.round(avg.b / group.length),
            });
          }
        } else {
          const avg = { r: 0, g: 0, b: 0 };
          for (const c of edgeColors) {
            avg.r += c.r;
            avg.g += c.g;
            avg.b += c.b;
          }
          bgClusters.push({
            r: Math.round(avg.r / edgeColors.length),
            g: Math.round(avg.g / edgeColors.length),
            b: Math.round(avg.b / edgeColors.length),
          });
        }

        const COLOR_DIST_THRESHOLD = 35;
        const isBg = (idx: number) => {
          const r = pixels[idx * 4];
          const g = pixels[idx * 4 + 1];
          const b = pixels[idx * 4 + 2];
          const a = pixels[idx * 4 + 3];
          if (a < 10) return true;
          for (const bg of bgClusters) {
            const dist = Math.sqrt((r - bg.r) ** 2 + (g - bg.g) ** 2 + (b - bg.b) ** 2);
            if (dist < COLOR_DIST_THRESHOLD) return true;
          }
          return false;
        };

        const visited = new Uint8Array(rw * rh);
        const queue: number[] = [];
        for (let x = 0; x < rw; x++) {
          queue.push(x);
          queue.push((rh - 1) * rw + x);
        }
        for (let y = 0; y < rh; y++) {
          queue.push(y * rw);
          queue.push(y * rw + (rw - 1));
        }

        let head = 0;
        while (head < queue.length) {
          const pos = queue[head++];
          if (pos < 0 || pos >= rw * rh) continue;
          if (visited[pos]) continue;
          if (!isBg(pos)) continue;
          visited[pos] = 1;
          pixels[pos * 4 + 3] = 0;
          const x = pos % rw;
          const y = Math.floor(pos / rw);
          if (x > 0) queue.push(pos - 1);
          if (x < rw - 1) queue.push(pos + 1);
          if (y > 0) queue.push(pos - rw);
          if (y < rh - 1) queue.push(pos + rw);
        }

        const processed = await sharp(Buffer.from(pixels.buffer), {
          raw: { width: rw, height: rh, channels: 4 },
        })
          .trim()
          .png()
          .toBuffer();

        results[region.name] = `data:image/png;base64,${processed.toString("base64")}`;
      }

      const spritesDir = path.join(process.cwd(), "public", "sprites");
      let nextNum = 1;
      while (fs.existsSync(path.join(spritesDir, `${nextNum}-D-1.png`))) nextNum++;

      res.json({ ok: true, previews: results, suggestedNumber: nextNum });
    } catch (err: any) {
      console.error("[sprites/process]", err);
      res.status(500).json({ error: "processing_failed", message: err.message });
    }
  });

  app.post("/api/sprites/register", async (req, res) => {
    try {
      const { sprites, spriteNumber } = req.body as {
        sprites: Record<string, string>;
        spriteNumber: number;
        packKey?: unknown;
      };
      const packKey = parseSpriteRegisterPackKey((req.body as Record<string, unknown>)?.packKey);
      if (!packKey) return res.status(400).json({ error: "invalid_pack_key" });
      if (sprites === undefined || spriteNumber === undefined || spriteNumber === null) {
        return res.status(400).json({ error: "missing_data" });
      }
      if (!Number.isInteger(spriteNumber) || spriteNumber < 1 || spriteNumber > 9999) {
        return res.status(400).json({ error: "invalid_sprite_number" });
      }
      if (typeof sprites !== "object" || Array.isArray(sprites)) {
        return res.status(400).json({ error: "invalid_sprites_payload" });
      }

      const inputPairs = SPRITE_REGISTER_DIRECTIONS
        .map((k) => [k, sprites[k]] as const)
        .filter(([, v]) => typeof v === "string" && v.length > 0);
      if (inputPairs.length === 0) {
        return res.status(400).json({ error: "missing_sprite_frames" });
      }

      const parsedSprites = new Map<string, Buffer>();
      for (const [dir, encoded] of inputPairs) {
        const match = encoded.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
        if (!match) {
          return res.status(400).json({ error: "invalid_sprite_data_url", direction: dir });
        }
        const buf = Buffer.from(match[1], "base64");
        if (!buf.length || buf.length > 8 * 1024 * 1024) {
          return res.status(400).json({ error: "invalid_sprite_data_size", direction: dir });
        }
        parsedSprites.set(dir, buf);
      }

      const spritesDir = resolveSpriteRegisterDir(process.cwd(), packKey);
      if (!fs.existsSync(spritesDir)) fs.mkdirSync(spritesDir, { recursive: true });

      const targetFiles = SPRITE_REGISTER_DIRECTIONS.flatMap((direction) =>
        parsedSprites.has(direction) ? buildSpriteRegisterFilenames(spriteNumber, direction) : [],
      );

      const alreadyExisting = targetFiles.filter((filename) => fs.existsSync(path.join(spritesDir, filename)));
      if (alreadyExisting.length > 0) {
        return res.status(409).json({ error: "sprite_number_exists", existing_files: alreadyExisting });
      }

      const saved: string[] = [];
      for (const direction of SPRITE_REGISTER_DIRECTIONS) {
        if (!parsedSprites.has(direction)) continue;
        const buf = parsedSprites.get(direction)!;
        for (const filename of buildSpriteRegisterFilenames(spriteNumber, direction)) {
          fs.writeFileSync(path.join(spritesDir, filename), buf);
          saved.push(formatSavedSpritePath(packKey, filename));
        }
      }

      console.log(`[sprites/register] Saved sprite #${spriteNumber} (${packKey}):`, saved);
      res.json({ ok: true, spriteNumber, packKey, saved });
    } catch (err: any) {
      console.error("[sprites/register]", err);
      res.status(500).json({ error: "save_failed", message: err.message });
    }
  });
}
