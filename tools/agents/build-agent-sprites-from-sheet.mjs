import fs from "node:fs/promises";
import path from "node:path";
import prettier from "prettier";
import sharp from "sharp";
import {
  buildReferenceCrop,
  clamp,
  getSourceCharacterCell,
  getWalkFrameOffset,
  outputSpec,
  sourceSheet,
  walkNormalizeDirections,
  walkNormalizeFrames,
  walkNormalizePoseSpecs,
  walkNormalizeVersion,
} from "./walk-normalize-config.mjs";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, sourceSheet.path);
const spritesRoot = path.join(projectRoot, "public/sprites");
const previewPath = path.join(projectRoot, "public/generated/agent-visual-profiles/runtime-sprite-preview-v1.png");
const manifestPath = path.join(
  projectRoot,
  "public/generated/agent-visual-profiles/sprite-normalization-manifest-v1.json",
);

const characterCount = sourceSheet.sourceCharacters;
const runtimeMaxSpriteNumber = sourceSheet.runtimeMaxSprites;
const outputPadding = outputSpec.cropPadding;
const normalizedSpriteSize = outputSpec.spriteSize;
const normalizedMaxContentSize = outputSpec.maxContentSize;
const backgroundDistanceThreshold = 12;
const poseSpecs = walkNormalizePoseSpecs;

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function buildBackgroundSamples(data, width, height, channels) {
  const points = [
    [0, 0],
    [Math.floor(width / 2), 0],
    [width - 1, 0],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
    [0, height - 1],
    [Math.floor(width / 2), height - 1],
    [width - 1, height - 1],
  ];

  return points.map(([x, y]) => {
    const offset = (y * width + x) * channels;
    return [data[offset], data[offset + 1], data[offset + 2]];
  });
}

function makeTransparentFromConnectedBackground(raw, width, height, channels) {
  const output = Buffer.from(raw);
  const samples = buildBackgroundSamples(raw, width, height, channels);
  const visited = new Uint8Array(width * height);
  const queue = [];

  function isBackgroundLike(index) {
    const offset = index * channels;
    const color = [raw[offset], raw[offset + 1], raw[offset + 2]];
    const darkNavy = color[0] < 10 && color[1] < 18 && color[2] < 28;
    return darkNavy || samples.some((sample) => colorDistance(color, sample) <= backgroundDistanceThreshold);
  }

  function pushIfBackground(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index] || !isBackgroundLike(index)) return;
    visited[index] = 1;
    queue.push(index);
  }

  for (let x = 0; x < width; x += 1) {
    pushIfBackground(x, 0);
    pushIfBackground(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    pushIfBackground(0, y);
    pushIfBackground(width - 1, y);
  }

  while (queue.length > 0) {
    const index = queue.shift();
    const x = index % width;
    const y = Math.floor(index / width);
    output[index * channels + 3] = 0;
    pushIfBackground(x + 1, y);
    pushIfBackground(x - 1, y);
    pushIfBackground(x, y + 1);
    pushIfBackground(x, y - 1);
  }

  return output;
}

function findAlphaBounds(data, width, height, channels) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

function removeHeaderArtifacts(data, width, height, channels) {
  const visited = new Uint8Array(width * height);
  const output = Buffer.from(data);

  function alphaAt(index) {
    return output[index * channels + 3];
  }

  function setTransparent(index) {
    output[index * channels + 3] = 0;
  }

  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || alphaAt(start) <= 8) continue;

    const queue = [start];
    const component = [];
    visited[start] = 1;
    let maxY = Math.floor(start / width);

    while (queue.length > 0) {
      const index = queue.shift();
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      maxY = Math.max(maxY, y);

      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
        [x + 1, y + 1],
        [x - 1, y - 1],
        [x + 1, y - 1],
        [x - 1, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (visited[next] || alphaAt(next) <= 8) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }

    const componentRatio = component.length / (width * height);
    const isHeaderArtifact = maxY < height * 0.32 && componentRatio < 0.06;
    const isSpeckle = component.length < 10;
    if (!isHeaderArtifact && !isSpeckle) continue;
    for (const index of component) setTransparent(index);
  }

  return output;
}

function keepPrimaryCharacterComponents(data, width, height, channels) {
  const visited = new Uint8Array(width * height);
  const components = [];

  function alphaAt(index) {
    return data[index * channels + 3];
  }

  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || alphaAt(start) <= 8) continue;

    const queue = [start];
    const pixels = [];
    visited[start] = 1;
    let minX = start % width;
    let maxX = minX;
    let minY = Math.floor(start / width);
    let maxY = minY;

    while (queue.length > 0) {
      const index = queue.shift();
      pixels.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
        [x + 1, y + 1],
        [x - 1, y - 1],
        [x + 1, y - 1],
        [x - 1, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (visited[next] || alphaAt(next) <= 8) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }

    if (pixels.length < 8) continue;
    components.push({
      pixels,
      minX,
      maxX,
      minY,
      maxY,
      centerX: (minX + maxX) / 2,
      count: pixels.length,
    });
  }

  const primary = components.filter((component) => component.maxY > height * 0.34).sort((a, b) => b.count - a.count)[0];
  if (!primary) return data;

  const output = Buffer.from(data);
  output.fill(0);
  const primaryCenter = primary.centerX;
  const keepDistance = width * 0.18;

  for (const component of components) {
    const isPrimary = component === primary;
    const isNearPrimary = Math.abs(component.centerX - primaryCenter) <= keepDistance;
    const isMeaningful = component.count >= primary.count * 0.08 || component.count >= 28;
    const isCharacterHeight = component.maxY > primary.minY + 4;
    if (!isPrimary && (!isNearPrimary || !isMeaningful || !isCharacterHeight)) continue;
    for (const index of component.pixels) {
      const offset = index * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        output[offset + channel] = data[offset + channel];
      }
    }
  }

  return output;
}

async function extractPose(sheet, cell, poseSpec) {
  const crop = buildReferenceCrop(cell, poseSpec);

  const { data, info } = await sheet.clone().extract(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const keyed = makeTransparentFromConnectedBackground(data, info.width, info.height, info.channels);
  const filtered = removeHeaderArtifacts(keyed, info.width, info.height, info.channels);
  const primary = keepPrimaryCharacterComponents(filtered, info.width, info.height, info.channels);
  const transparent = findAlphaBounds(primary, info.width, info.height, info.channels) ? primary : keyed;
  const bounds = findAlphaBounds(transparent, info.width, info.height, info.channels);
  if (!bounds) {
    throw new Error(`No sprite pixels found for ${cell.number}-${poseSpec.source}`);
  }

  const left = clamp(bounds.minX - outputPadding, 0, info.width - 1);
  const top = clamp(bounds.minY - outputPadding, 0, info.height - 1);
  const right = clamp(bounds.maxX + outputPadding, 0, info.width - 1);
  const bottom = clamp(bounds.maxY + outputPadding, 0, info.height - 1);

  return sharp(transparent, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png()
    .toBuffer();
}

async function normalizePoseFrame(buffer, direction, frameIndex) {
  const offset = getWalkFrameOffset(direction, frameIndex);
  const resized = await sharp(buffer)
    .resize({
      width: normalizedMaxContentSize,
      height: normalizedMaxContentSize,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(resized).metadata();
  const width = metadata.width ?? normalizedMaxContentSize;
  const height = metadata.height ?? normalizedMaxContentSize;
  const left = Math.round((normalizedSpriteSize - width) / 2 + offset.x);
  const top = Math.round(normalizedSpriteSize - height - 8 + offset.y);

  return sharp({
    create: {
      width: normalizedSpriteSize,
      height: normalizedSpriteSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resized,
        left: clamp(left, 0, normalizedSpriteSize - width),
        top: clamp(top, 0, normalizedSpriteSize - height),
      },
    ])
    .png()
    .toBuffer();
}

async function buildPreview(spriteBuffers) {
  const thumbSize = 72;
  const labelHeight = 18;
  const cellWidth = thumbSize * 4;
  const cellHeight = thumbSize + labelHeight;
  const previewColumns = 5;
  const previewRows = Math.ceil(characterCount / previewColumns);
  const composites = [];

  for (let number = 1; number <= characterCount; number += 1) {
    const col = (number - 1) % previewColumns;
    const row = Math.floor((number - 1) / previewColumns);
    const cellX = col * cellWidth;
    const cellY = row * cellHeight;
    const label = Buffer.from(
      `<svg width="${cellWidth}" height="${labelHeight}"><text x="8" y="13" font-family="monospace" font-size="12" fill="#dbeafe">${String(
        number,
      ).padStart(2, "0")}</text></svg>`,
    );
    composites.push({ input: label, left: cellX, top: cellY });

    for (const [poseIndex, pose] of ["D", "L", "B", "R"].entries()) {
      const buffer = spriteBuffers.get(`${number}-${pose}-1`);
      if (!buffer) continue;
      composites.push({
        input: await sharp(buffer).resize({ width: thumbSize, height: thumbSize, fit: "contain" }).png().toBuffer(),
        left: cellX + poseIndex * thumbSize,
        top: cellY + labelHeight,
      });
    }
  }

  await sharp({
    create: {
      width: cellWidth * previewColumns,
      height: cellHeight * previewRows,
      channels: 4,
      background: "#07111f",
    },
  })
    .composite(composites)
    .png()
    .toFile(previewPath);
}

async function main() {
  await fs.access(sourcePath);
  await fs.mkdir(spritesRoot, { recursive: true });
  await fs.mkdir(path.dirname(previewPath), { recursive: true });

  const sheet = sharp(sourcePath);
  const metadata = await sheet.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Cannot read source sheet dimensions.");
  }

  const spriteBuffers = new Map();
  const manifestEntries = [];

  for (let number = 1; number <= characterCount; number += 1) {
    const cell = getSourceCharacterCell(metadata, number);

    for (const poseSpec of poseSpecs) {
      const poseBuffer = await extractPose(sheet, cell, poseSpec);
      for (const [frameIndex, frameName] of poseSpec.frameNames.entries()) {
        const buffer = await normalizePoseFrame(poseBuffer, poseSpec.key, frameIndex);
        const runtimeKey = `${number}-${frameName}`;
        spriteBuffers.set(runtimeKey, buffer);
        await fs.writeFile(path.join(spritesRoot, `${runtimeKey}.png`), buffer);
        manifestEntries.push({
          sprite_number: number,
          direction: poseSpec.key,
          frame: frameIndex + 1,
          file: `public/sprites/${runtimeKey}.png`,
          source_character: number,
          source_pose: poseSpec.source,
          reference_crop: buildReferenceCrop(cell, poseSpec),
          anchor: poseSpec.anchor,
          frame_offset: getWalkFrameOffset(poseSpec.key, frameIndex),
          normalized_size: normalizedSpriteSize,
        });
      }
    }
  }

  for (let number = characterCount + 1; number <= runtimeMaxSpriteNumber; number += 1) {
    const sourceNumber = ((number - 1) % characterCount) + 1;
    const sourceCell = getSourceCharacterCell(metadata, sourceNumber);
    for (const poseSpec of poseSpecs) {
      for (const [frameIndex, frameName] of poseSpec.frameNames.entries()) {
        const sourceFrame = `${sourceNumber}-${frameName}`;
        const runtimeKey = `${number}-${frameName}`;
        const buffer = spriteBuffers.get(sourceFrame);
        if (!buffer) continue;
        spriteBuffers.set(runtimeKey, buffer);
        await fs.writeFile(path.join(spritesRoot, `${runtimeKey}.png`), buffer);
        manifestEntries.push({
          sprite_number: number,
          direction: poseSpec.key,
          frame: frameIndex + 1,
          file: `public/sprites/${runtimeKey}.png`,
          source_character: sourceNumber,
          source_pose: poseSpec.source,
          reference_crop: buildReferenceCrop(sourceCell, poseSpec),
          anchor: poseSpec.anchor,
          frame_offset: getWalkFrameOffset(poseSpec.key, frameIndex),
          normalized_size: normalizedSpriteSize,
        });
      }
    }
  }

  await buildPreview(spriteBuffers);
  const manifest = {
    version: walkNormalizeVersion,
    source: sourceSheet.path,
    runtime_sprites: runtimeMaxSpriteNumber,
    source_characters: characterCount,
    directions: walkNormalizeDirections,
    frames_per_direction: walkNormalizeFrames.length,
    normalized_size: normalizedSpriteSize,
    max_content_size: normalizedMaxContentSize,
    reference_crop_rules: poseSpecs.map((poseSpec) => ({
      direction: poseSpec.key,
      source_pose: poseSpec.source,
      label: poseSpec.label,
      reference_crop: poseSpec.referenceCrop,
      anchor: poseSpec.anchor,
      frame_offsets: poseSpec.frameNames.map((_, frameIndex) => getWalkFrameOffset(poseSpec.key, frameIndex)),
    })),
    preview_path: "public/generated/agent-visual-profiles/runtime-sprite-preview-v1.png",
    smoke_report_path: "public/generated/agent-visual-profiles/walk-animation-smoke-v1.json",
    entries: manifestEntries,
  };
  await fs.writeFile(manifestPath, await prettier.format(JSON.stringify(manifest), { parser: "json" }), "utf8");
  console.log(
    JSON.stringify(
      {
        sourcePath,
        spritesRoot,
        previewPath,
        manifestPath,
        sourceCharacters: characterCount,
        runtimeSprites: runtimeMaxSpriteNumber,
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
