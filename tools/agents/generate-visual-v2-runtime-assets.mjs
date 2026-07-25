import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const verifiedSpriteSourceDir = path.join(projectRoot, "public", "sprites");
const spritesDir = path.join(projectRoot, "public", "sprites", "donggri-visual-v2");
const generatedRoot = path.join(projectRoot, "public", "generated", "donggri-visual-v2");
const spriteManifestPath = path.join(
  projectRoot,
  "assets",
  "generated",
  "game_asset_pipeline",
  "donggri-visual-v2-sprites",
  "manifest.json",
);
const publicManifestPath = path.join(generatedRoot, "manifest.json");
const atlasPath = path.join(spritesDir, "office-renewal-v3-props-atlas.png");

const directions = ["D", "L", "B", "R"];
const frames = [1, 2, 3];
const spriteSize = 96;
const runtimeSpriteCount = 44;
const backupPath =
  "E:/DonggriPlatform_Asset/archive/DonggriCompany/20260713-donggri-visual-v2-agy-runtime-remediation/public-sprites-donggri-visual-v2-seeded-copy";

const palettes = [
  { hair: "#2f2437", skin: "#f0bfa7", jacket: "#316c81", shirt: "#f3e9d2", accent: "#d7674f", pants: "#243348" },
  { hair: "#403025", skin: "#d99a77", jacket: "#597c4a", shirt: "#efe4c4", accent: "#c69749", pants: "#283846" },
  { hair: "#20364b", skin: "#edc2a0", jacket: "#7c4f66", shirt: "#e7ecea", accent: "#60a5a8", pants: "#253040" },
  { hair: "#51322c", skin: "#c9886a", jacket: "#365c94", shirt: "#f1dfc4", accent: "#b84f5b", pants: "#2c3441" },
  { hair: "#29383b", skin: "#e0aa83", jacket: "#73633f", shirt: "#eef0d8", accent: "#4f9c7a", pants: "#2d3548" },
  { hair: "#1f2937", skin: "#f1c6b1", jacket: "#875d3b", shirt: "#f0ead8", accent: "#5f7fb0", pants: "#253043" },
  { hair: "#4b2e39", skin: "#c98f70", jacket: "#3f6d65", shirt: "#f4e8cc", accent: "#d47f38", pants: "#263449" },
  { hair: "#303038", skin: "#e5b392", jacket: "#6b557c", shirt: "#e8edf2", accent: "#80a64b", pants: "#253246" },
];

const propFrames = {
  desk: { x: 30, y: 34, w: 302, h: 274 },
  chair: { x: 366, y: 26, w: 218, h: 286 },
  workstation: { x: 635, y: 36, w: 282, h: 274 },
  plant: { x: 1012, y: 28, w: 214, h: 288 },
  documents: { x: 42, y: 360, w: 264, h: 238 },
  stickyBoard: { x: 326, y: 358, w: 290, h: 232 },
  coffee: { x: 652, y: 352, w: 236, h: 242 },
  lounge: { x: 948, y: 362, w: 292, h: 232 },
  serverRack: { x: 42, y: 628, w: 232, h: 250 },
  projectBoard: { x: 322, y: 636, w: 322, h: 230 },
  archiveCabinet: { x: 684, y: 626, w: 168, h: 276 },
  memoryBoxes: { x: 914, y: 626, w: 316, h: 254 },
  reviewGate: { x: 28, y: 934, w: 286, h: 270 },
  warningBeacon: { x: 368, y: 930, w: 190, h: 250 },
  designBoard: { x: 590, y: 934, w: 286, h: 268 },
  lectureBoard: { x: 902, y: 928, w: 326, h: 282 },
};

function rect(x, y, w, h, fill, extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
}

function ellipse(cx, cy, rx, ry, fill, extra = "") {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
}

function propSvg(key, frame, index) {
  const { w, h } = frame;
  const p = palettes[index % palettes.length];
  const mid = w / 2;
  const floorY = h - 30;
  const commonShadow = ellipse(
    mid,
    floorY + 8,
    Math.max(36, w * 0.32),
    Math.max(8, h * 0.035),
    "#0d1721",
    'opacity="0.18"',
  );
  const svgStart = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`;
  const svgEnd = `</svg>`;
  const board = (accent = p.accent) =>
    `${rect(w * 0.18, h * 0.18, w * 0.64, h * 0.46, "#d9e4df")}${rect(
      w * 0.2,
      h * 0.21,
      w * 0.6,
      h * 0.4,
      "#f8faf7",
    )}${rect(w * 0.25, h * 0.28, w * 0.22, 8, accent)}${rect(w * 0.25, h * 0.39, w * 0.45, 7, "#6b7d88")}${rect(
      w * 0.25,
      h * 0.5,
      w * 0.34,
      7,
      "#8a9ba7",
    )}`;

  const variants = {
    desk: `${commonShadow}${rect(34, floorY - 82, w - 68, 42, p.jacket)}${rect(48, floorY - 40, 18, 42, p.pants)}${rect(
      w - 66,
      floorY - 40,
      18,
      42,
      p.pants,
    )}${rect(66, floorY - 112, w - 132, 34, "#e5d1a8")}${rect(92, floorY - 130, 58, 18, p.accent)}`,
    chair: `${commonShadow}${rect(mid - 46, floorY - 104, 92, 74, p.jacket)}${rect(mid - 56, floorY - 34, 112, 22, p.accent)}${rect(
      mid - 42,
      floorY - 12,
      16,
      30,
      p.pants,
    )}${rect(mid + 26, floorY - 12, 16, 30, p.pants)}`,
    workstation: `${commonShadow}${rect(38, floorY - 72, w - 76, 36, "#d7bf95")}${rect(
      56,
      floorY - 132,
      w - 112,
      72,
      "#263849",
    )}${rect(72, floorY - 118, w - 144, 44, "#78a8b8")}${rect(mid - 16, floorY - 60, 32, 24, "#1d2938")}`,
    plant: `${commonShadow}${rect(mid - 30, floorY - 56, 60, 60, "#b56d4a")}${ellipse(mid, floorY - 122, 56, 42, "#4f9c7a")}${ellipse(
      mid - 35,
      floorY - 84,
      36,
      32,
      "#6ca66a",
    )}${ellipse(mid + 34, floorY - 84, 36, 32, "#3d8068")}`,
    documents: `${commonShadow}${rect(42, floorY - 104, w - 84, 116, "#f6f0d8")}${rect(62, floorY - 82, w - 124, 8, p.accent)}${rect(
      62,
      floorY - 60,
      w - 116,
      7,
      "#8796a3",
    )}${rect(62, floorY - 38, w - 154, 7, "#a5b1ba")}`,
    stickyBoard: `${commonShadow}${board("#d7a546")}${rect(w * 0.56, h * 0.28, 34, 28, "#f4d35e")}${rect(
      w * 0.58,
      h * 0.44,
      30,
      24,
      "#8ecae6",
    )}`,
    coffee: `${commonShadow}${rect(mid - 32, floorY - 96, 64, 94, "#f1e1c5")}${rect(mid + 34, floorY - 74, 22, 42, "#f1e1c5")}${rect(
      mid - 26,
      floorY - 84,
      52,
      16,
      p.accent,
    )}${rect(mid - 22, floorY - 142, 10, 34, "#d5e3df", 'opacity="0.68"')}${rect(mid + 8, floorY - 150, 10, 42, "#d5e3df", 'opacity="0.58"')}`,
    lounge: `${commonShadow}${rect(36, floorY - 86, w - 72, 78, p.jacket)}${rect(54, floorY - 122, w - 108, 58, "#e1c49c")}${rect(
      54,
      floorY - 54,
      w - 108,
      22,
      p.accent,
    )}`,
    serverRack: `${commonShadow}${rect(mid - 58, floorY - 162, 116, 168, "#26313c")}${rect(mid - 46, floorY - 146, 92, 26, "#3b4b5b")}${rect(
      mid - 46,
      floorY - 104,
      92,
      26,
      "#3b4b5b",
    )}${rect(mid - 46, floorY - 62, 92, 26, "#3b4b5b")}${rect(mid + 28, floorY - 137, 8, 8, "#7ccf91")}${rect(mid + 28, floorY - 95, 8, 8, "#f4d35e")}`,
    projectBoard: `${commonShadow}${board("#60a5a8")}${rect(w * 0.18, h * 0.72, w * 0.64, 12, "#5b6770")}`,
    archiveCabinet: `${commonShadow}${rect(mid - 54, floorY - 168, 108, 174, "#687582")}${rect(mid - 40, floorY - 146, 80, 42, "#d6d0bd")}${rect(
      mid - 40,
      floorY - 94,
      80,
      42,
      "#d6d0bd",
    )}${rect(mid - 40, floorY - 42, 80, 42, "#d6d0bd")}`,
    memoryBoxes: `${commonShadow}${rect(46, floorY - 78, 86, 72, "#c9a56d")}${rect(128, floorY - 118, 96, 112, "#b9835a")}${rect(
      214,
      floorY - 64,
      70,
      58,
      "#d4bb84",
    )}${rect(146, floorY - 96, 58, 12, p.accent)}`,
    reviewGate: `${commonShadow}${rect(mid - 84, floorY - 142, 26, 148, "#526372")}${rect(mid + 58, floorY - 142, 26, 148, "#526372")}${rect(
      mid - 84,
      floorY - 142,
      168,
      24,
      p.accent,
    )}${rect(mid - 50, floorY - 92, 100, 54, "#e7ecea")}`,
    warningBeacon: `${commonShadow}${rect(mid - 36, floorY - 42, 72, 40, "#3c4650")}${rect(mid - 24, floorY - 98, 48, 58, "#d55d4a")}${rect(
      mid - 18,
      floorY - 116,
      36,
      18,
      "#f4d35e",
    )}`,
    designBoard: `${commonShadow}${board("#b84f5b")}${rect(w * 0.23, h * 0.24, 44, 34, "#8ecae6")}${rect(
      w * 0.54,
      h * 0.38,
      52,
      38,
      "#f4d35e",
    )}`,
    lectureBoard: `${commonShadow}${rect(42, floorY - 160, w - 84, 118, "#24323d")}${rect(64, floorY - 138, w - 128, 12, "#e7ecea")}${rect(
      64,
      floorY - 108,
      w - 164,
      10,
      "#7ccf91",
    )}${rect(64, floorY - 78, w - 190, 10, "#8ecae6")}${rect(mid - 54, floorY - 42, 108, 18, "#5b6770")}`,
  };

  return `${svgStart}${variants[key] ?? variants.desk}${svgEnd}`;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function generateSprites() {
  await fs.mkdir(spritesDir, { recursive: true });
  let count = 0;
  for (let spriteNumber = 1; spriteNumber <= runtimeSpriteCount; spriteNumber += 1) {
    for (const direction of directions) {
      for (const frame of frames) {
        const name = `${spriteNumber}-${direction}-${frame}.png`;
        const sourcePath = path.join(verifiedSpriteSourceDir, name);
        const outputPath = path.join(spritesDir, name);
        const metadata = await sharp(sourcePath).metadata();
        if (metadata.format !== "png" || metadata.width !== spriteSize || metadata.height !== spriteSize) {
          throw new Error(`invalid verified sprite source: ${name}`);
        }
        await fs.copyFile(sourcePath, outputPath);
        count += 1;
      }
    }
  }
  return count;
}

async function generateAtlas() {
  const overlays = Object.entries(propFrames).map(([key, frame], index) => ({
    input: Buffer.from(propSvg(key, frame, index)),
    left: frame.x,
    top: frame.y,
  }));
  await sharp({
    create: {
      width: 1254,
      height: 1254,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toFile(atlasPath);
}

async function updateManifests(spriteCount) {
  const manifest = {
    asset_pack: "donggri_visual_v2",
    asset_key: "donggri-visual-v2-runtime-sprites",
    status: "promoted_verified_high_quality_runtime_assets",
    generated_at_kst: "2026-07-16",
    source: {
      type: "deterministic_promotion_from_verified_legacy_runtime_sprites",
      path: "public/sprites/{sprite}-{direction}-{frame}.png",
      art_direction_reference: "public/generated/donggri-visual-v2/styleboard/donggri-visual-v2-styleboard.png",
      previous_runtime_backup: backupPath,
    },
    published_directory: "public/sprites/donggri-visual-v2",
    runtime_props_atlas: "public/sprites/donggri-visual-v2/office-renewal-v3-props-atlas.png",
    sprite_contract: {
      sprite_numbers: runtimeSpriteCount,
      directions,
      frames_per_direction: frames.length,
      expected_files: runtimeSpriteCount * directions.length * frames.length,
      generated_files: spriteCount,
      sprite_size: `${spriteSize}x${spriteSize}`,
      url_example: "/sprites/donggri-visual-v2/12-B-3.png?v=donggri-visual-v2-quality-20260716",
    },
    replacement_policy: {
      legacy_assets_deleted: false,
      legacy_assets_backed_up: true,
      backup_path: backupPath,
      register_endpoint: "/api/sprites/register",
      register_pack_key: "donggri_visual_v2",
      primitive_character_renderer_removed: true,
      source_assets_preserved: true,
    },
  };
  await writeJson(spriteManifestPath, manifest);

  let publicManifest = {};
  try {
    publicManifest = JSON.parse(await fs.readFile(publicManifestPath, "utf8"));
  } catch {
    publicManifest = {};
  }
  publicManifest = {
    ...publicManifest,
    runtime_sprite_directory: "public/sprites/donggri-visual-v2",
    runtime_sprite_manifest: "assets/generated/game_asset_pipeline/donggri-visual-v2-sprites/manifest.json",
    derived_assets: {
      ...(publicManifest.derived_assets ?? {}),
      runtime_props_atlas: "public/sprites/donggri-visual-v2/office-renewal-v3-props-atlas.png",
    },
    compatibility: {
      ...(publicManifest.compatibility ?? {}),
      legacy_pack_unchanged: true,
      v2_runtime_uses_verified_high_quality_sprite_promotion: true,
      legacy_backup_path: backupPath,
    },
    character_asset_recovery: {
      id: "M95-T093-CHARACTER-ASSET-RECOVERY-V1",
      source: "public/sprites/{sprite}-{direction}-{frame}.png",
      target: "public/sprites/donggri-visual-v2/{sprite}-{direction}-{frame}.png",
      source_file_count: runtimeSpriteCount * directions.length * frames.length,
      policy: "promote_existing_verified_high_quality_transparent_sprite_set",
      cache_version: "donggri-visual-v2-quality-20260716",
      approval: "APR-M95-DONGGRICOMPANY-SNAPSHOT-WORKTREE-001",
    },
  };
  await writeJson(publicManifestPath, publicManifest);
}

async function main() {
  const spriteCount = await generateSprites();
  await generateAtlas();
  await updateManifests(spriteCount);
  console.log(
    JSON.stringify(
      {
        ok: true,
        spriteCount,
        atlasPath,
        spritesDir,
        spriteManifestPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
