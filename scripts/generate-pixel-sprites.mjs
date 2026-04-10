import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Generate sprite variants (15..44) by recoloring existing base sprites (1..14).
//
// Output files (per sprite number):
//   {n}-D-1.png, {n}-D-2.png, {n}-D-3.png, {n}-L-1.png, {n}-R-1.png
//
// Usage:
//   node scripts/generate-pixel-sprites.mjs
//   node scripts/generate-pixel-sprites.mjs --force
//
// Notes:
// - Keeps outline/eyes/skin mostly unchanged to preserve style.
// - Learns each base sprite's skin color signature and avoids recoloring face/skin shading.
// - Shifts hue + adjusts saturation/value on non-skin (clothing/hair) pixels.

const BASE_START = 1;
const BASE_END = 14;

const TARGET_START = 15;
const TARGET_COUNT = 30; // 15..44

const FORCE = process.argv.includes("--force") || process.argv.includes("-f");

const ALPHA_CUTOFF = 10;
const SKIN_SAMPLE_ALPHA_CUTOFF = 220;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function rgbToHsv(r, g, b) {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;

  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rf) h = ((gf - bf) / delta) % 6;
    else if (max === gf) h = (bf - rf) / delta + 2;
    else h = (rf - gf) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let rf = 0,
    gf = 0,
    bf = 0;
  if (h < 60) [rf, gf, bf] = [c, x, 0];
  else if (h < 120) [rf, gf, bf] = [x, c, 0];
  else if (h < 180) [rf, gf, bf] = [0, c, x];
  else if (h < 240) [rf, gf, bf] = [0, x, c];
  else if (h < 300) [rf, gf, bf] = [x, 0, c];
  else [rf, gf, bf] = [c, 0, x];

  return {
    r: Math.round((rf + m) * 255),
    g: Math.round((gf + m) * 255),
    b: Math.round((bf + m) * 255),
  };
}

function isOutlineLike({ s, v }) {
  // Very dark pixels: outlines + deep shadows.
  return v <= 0.18;
}

function isEyeWhiteLike({ s, v }) {
  // White pixels (eye whites / highlights)
  return v >= 0.92 && s <= 0.12;
}

function isSkinCandidate(r, g, b, { h, s, v }) {
  // A deliberately-loose heuristic used ONLY to estimate a base sprite's skin signature.
  // (We later switch to color-distance-to-skin-mean for robust masking.)
  if (isEyeWhiteLike({ s, v })) return false;
  if (isOutlineLike({ s, v })) return false;
  if (v < 0.22) return false;
  if (s < 0.05 || s > 0.72) return false;
  if (!(h >= 0 && h <= 70)) return false;
  // warm ordering typical of skin tones
  if (!(r >= g && g >= b)) return false;
  // avoid ultra-red pixels (often clothes)
  if (g < 40 || b < 25) return false;
  return true;
}

function computeRgbDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function computeSkinSignature(baseFile) {
  const { data, info } = await sharp(baseFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // Pass 1: mean color
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < SKIN_SAMPLE_ALPHA_CUTOFF) continue;
    const r = data[i + 0];
    const g = data[i + 1];
    const b = data[i + 2];
    const hsv = rgbToHsv(r, g, b);
    if (!isSkinCandidate(r, g, b, hsv)) continue;
    sumR += r;
    sumG += g;
    sumB += b;
    count += 1;
  }

  if (count < 500) return null;

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;

  // Pass 2: RMS distance (captures shading range)
  let sumDistSq = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < SKIN_SAMPLE_ALPHA_CUTOFF) continue;
    const r = data[i + 0];
    const g = data[i + 1];
    const b = data[i + 2];
    const hsv = rgbToHsv(r, g, b);
    if (!isSkinCandidate(r, g, b, hsv)) continue;
    const dist = computeRgbDistance(r, g, b, meanR, meanG, meanB);
    sumDistSq += dist * dist;
  }

  const rms = Math.sqrt(sumDistSq / count);
  const threshold = Math.max(45, Math.min(120, rms * 2.6));

  return {
    width: info.width,
    height: info.height,
    meanR,
    meanG,
    meanB,
    threshold,
  };
}

function isNearSkin(r, g, b, hsv, skinSignature) {
  if (!skinSignature) return false;
  const dist = computeRgbDistance(r, g, b, skinSignature.meanR, skinSignature.meanG, skinSignature.meanB);

  // Always preserve colors extremely close to the estimated skin mean.
  if (dist <= skinSignature.threshold) return true;

  // Preserve "face-adjacent" shading/cheeks (warm-ish hues close-ish to skin)
  if (hsv.h >= 0 && hsv.h <= 90 && hsv.v >= 0.18 && dist <= skinSignature.threshold * 1.25) return true;

  return false;
}

function buildVariantParams(targetSpriteNum) {
  // Deterministic variation knobs
  const seed = (Math.imul(targetSpriteNum, 2654435761) >>> 0) + 0x9e3779b9;
  const hueShift = (seed % 360) - 180; // [-180..179]
  const satScale = 0.86 + (((seed >>> 8) % 40) / 100) * 1.0; // ~[0.86..1.25]
  const valScale = 0.90 + (((seed >>> 16) % 30) / 100) * 1.0; // ~[0.90..1.19]

  // A second style lane (pastel)
  const styleLane = Math.floor((targetSpriteNum - TARGET_START) / (BASE_END - BASE_START + 1)) % 2; // 0 or 1
  const finalHueShift = styleLane === 0 ? hueShift : hueShift + 120;
  const finalSatScale = styleLane === 0 ? satScale * 1.05 : satScale * 0.70;
  const finalValScale = styleLane === 0 ? valScale : valScale * 1.08;

  return {
    hueShift: finalHueShift,
    satScale: finalSatScale,
    valScale: finalValScale,
  };
}

function recolorBufferRGBA(input, width, height, params, skinSignature) {
  const out = Buffer.from(input); // copy

  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3];
    if (a < ALPHA_CUTOFF) continue;

    const r = out[i + 0];
    const g = out[i + 1];
    const b = out[i + 2];

    const hsv = rgbToHsv(r, g, b);

    if (isOutlineLike(hsv) || isEyeWhiteLike(hsv) || isNearSkin(r, g, b, hsv, skinSignature)) continue;

    const shiftedH = ((hsv.h + params.hueShift) % 360 + 360) % 360;
    const shiftedS = clamp01(hsv.s * params.satScale);
    const shiftedV = clamp01(hsv.v * params.valScale);

    const rgb = hsvToRgb(shiftedH, shiftedS, shiftedV);
    out[i + 0] = rgb.r;
    out[i + 1] = rgb.g;
    out[i + 2] = rgb.b;
  }

  return out;
}

function framePath(num, dir, frame) {
  return path.join("public", "sprites", `${num}-${dir}-${frame}.png`);
}

function assertBaseFramesExist(baseNum) {
  const required = [
    framePath(baseNum, "D", 1),
    framePath(baseNum, "D", 2),
    framePath(baseNum, "D", 3),
    framePath(baseNum, "L", 1),
    framePath(baseNum, "R", 1),
  ];
  const missing = required.filter((p) => !fs.existsSync(p));
  if (missing.length) {
    throw new Error(`Missing base sprite frames for #${baseNum}: ${missing.join(", ")}`);
  }
}

function assertTargetNotExisting(targetNum) {
  if (FORCE) return;
  const probe = framePath(targetNum, "D", 1);
  if (fs.existsSync(probe)) throw new Error(`Target sprite already exists: #${targetNum} (${probe})`);
}

async function renderVariantFrame(baseFile, outFile, params, skinSignature) {
  const { data, info } = await sharp(baseFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const recolored = recolorBufferRGBA(data, info.width, info.height, params, skinSignature);

  await sharp(recolored, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outFile);
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  fs.mkdirSync(path.join("public", "sprites"), { recursive: true });

  for (let baseNum = BASE_START; baseNum <= BASE_END; baseNum++) assertBaseFramesExist(baseNum);

  const skinSignatures = new Map();

  for (let i = 0; i < TARGET_COUNT; i++) {
    const targetNum = TARGET_START + i;
    const baseNum = BASE_START + (i % (BASE_END - BASE_START + 1));

    assertTargetNotExisting(targetNum);
    const params = buildVariantParams(targetNum);

    const baseProbe = framePath(baseNum, "D", 1);
    if (!skinSignatures.has(baseNum)) skinSignatures.set(baseNum, await computeSkinSignature(baseProbe));
    const skinSignature = skinSignatures.get(baseNum);

    const frames = [
      { dir: "D", frame: 1 },
      { dir: "D", frame: 2 },
      { dir: "D", frame: 3 },
      { dir: "L", frame: 1 },
      { dir: "R", frame: 1 },
    ];

    for (const f of frames) {
      const baseFile = framePath(baseNum, f.dir, f.frame);
      const outFile = framePath(targetNum, f.dir, f.frame);
      await renderVariantFrame(baseFile, outFile, params, skinSignature);
    }

    // eslint-disable-next-line no-console
    console.log(`generated variant sprite #${targetNum} from base #${baseNum}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
