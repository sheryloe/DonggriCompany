import fs from "node:fs/promises";
import path from "node:path";
import prettier from "prettier";
import sharp from "sharp";
import {
  buildExpectedRuntimeSpriteKeys,
  buildRuntimeSpriteKey,
  outputSpec,
  sourceSheet,
  walkNormalizeDirections,
  walkNormalizeFrames,
  walkNormalizeVersion,
} from "./walk-normalize-config.mjs";

const projectRoot = process.cwd();
const spritesRoot = path.join(projectRoot, "public/sprites");
const reportPath = path.join(projectRoot, "public/generated/agent-visual-profiles/walk-animation-smoke-v1.json");
const alphaThreshold = 8;
const maxFrameDriftPx = 10;
const minBottomGap = 3;
const maxBottomGap = 18;
const maxCenterDrift = 20;

function findAlphaBounds(data, width, height, channels) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha <= alphaThreshold) continue;
      opaquePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    centerX: (minX + maxX) / 2,
    bottomGap: height - 1 - maxY,
    opaquePixels,
  };
}

function cornerAlphas(data, width, height, channels) {
  return [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ].map(([x, y]) => data[(y * width + x) * channels + 3]);
}

async function inspectSprite(file) {
  const image = sharp(file).ensureAlpha();
  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const bounds = findAlphaBounds(data, info.width, info.height, info.channels);
  return {
    file,
    width: metadata.width ?? info.width,
    height: metadata.height ?? info.height,
    channels: info.channels,
    bounds,
    cornerAlphas: cornerAlphas(data, info.width, info.height, info.channels),
  };
}

function pushIssue(issues, severity, key, message, extra = {}) {
  issues.push({ severity, key, message, ...extra });
}

async function main() {
  const expectedKeys = buildExpectedRuntimeSpriteKeys();
  const issues = [];
  const inspected = new Map();

  for (const key of expectedKeys) {
    const file = path.join(spritesRoot, `${key}.png`);
    try {
      await fs.access(file);
      const result = await inspectSprite(file);
      inspected.set(key, result);

      if (result.width !== outputSpec.spriteSize || result.height !== outputSpec.spriteSize) {
        pushIssue(issues, "error", key, `Sprite must be ${outputSpec.spriteSize}x${outputSpec.spriteSize}.`, {
          width: result.width,
          height: result.height,
        });
      }
      if (!result.bounds) {
        pushIssue(issues, "error", key, "Sprite has no visible alpha content.");
        continue;
      }
      if (result.bounds.width > outputSpec.maxContentSize || result.bounds.height > outputSpec.maxContentSize) {
        pushIssue(issues, "error", key, "Sprite content exceeds max normalized content size.", {
          bounds: result.bounds,
          maxContentSize: outputSpec.maxContentSize,
        });
      }
      if (result.cornerAlphas.some((alpha) => alpha > alphaThreshold)) {
        pushIssue(issues, "error", key, "Sprite corner alpha is not transparent.", {
          cornerAlphas: result.cornerAlphas,
        });
      }
      if (result.bounds.bottomGap < minBottomGap || result.bounds.bottomGap > maxBottomGap) {
        pushIssue(issues, "warning", key, "Sprite bottom anchor gap is outside expected walk range.", {
          bottomGap: result.bounds.bottomGap,
        });
      }
      if (Math.abs(result.bounds.centerX - outputSpec.spriteSize / 2) > maxCenterDrift) {
        pushIssue(issues, "warning", key, "Sprite horizontal anchor is too far from center.", {
          centerX: result.bounds.centerX,
        });
      }
    } catch (error) {
      pushIssue(issues, "error", key, "Missing or unreadable runtime sprite.", { error: String(error) });
    }
  }

  for (let spriteNumber = 1; spriteNumber <= sourceSheet.runtimeMaxSprites; spriteNumber += 1) {
    for (const direction of walkNormalizeDirections) {
      const bounds = walkNormalizeFrames
        .map((frame) => inspected.get(buildRuntimeSpriteKey(spriteNumber, direction, frame))?.bounds)
        .filter(Boolean);
      if (bounds.length !== walkNormalizeFrames.length) continue;
      const widths = bounds.map((bound) => bound.width);
      const heights = bounds.map((bound) => bound.height);
      const widthDrift = Math.max(...widths) - Math.min(...widths);
      const heightDrift = Math.max(...heights) - Math.min(...heights);
      if (widthDrift > maxFrameDriftPx || heightDrift > maxFrameDriftPx) {
        pushIssue(issues, "warning", `${spriteNumber}-${direction}`, "Frame-to-frame size drift exceeds threshold.", {
          widthDrift,
          heightDrift,
        });
      }
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  let collectableDirectionSets = 0;
  for (let spriteNumber = 1; spriteNumber <= sourceSheet.runtimeMaxSprites; spriteNumber += 1) {
    for (const direction of walkNormalizeDirections) {
      const hasAllFrames = walkNormalizeFrames.every((frame) =>
        inspected.has(buildRuntimeSpriteKey(spriteNumber, direction, frame)),
      );
      if (hasAllFrames) collectableDirectionSets += 1;
    }
  }
  const report = {
    version: walkNormalizeVersion,
    generated_by: "corepack pnpm run agents:sprites:check",
    source_sheet: sourceSheet.path,
    runtime_sprites: sourceSheet.runtimeMaxSprites,
    directions: walkNormalizeDirections,
    frames_per_direction: walkNormalizeFrames.length,
    expected_file_count: expectedKeys.length,
    inspected_file_count: inspected.size,
    in_engine_animation_smoke: {
      expected_direction_sets: sourceSheet.runtimeMaxSprites * walkNormalizeDirections.length,
      expected_frames_per_set: walkNormalizeFrames.length,
      collectable_direction_sets: collectableDirectionSets,
      pixi_actor_contract: {
        anchor: "bottom-center",
        fallback_direction: "D",
        animation_speed: 0.12,
      },
    },
    quality_gates: {
      sprite_size: outputSpec.spriteSize,
      max_content_size: outputSpec.maxContentSize,
      max_frame_drift_px: maxFrameDriftPx,
      bottom_gap_range: [minBottomGap, maxBottomGap],
      max_center_drift: maxCenterDrift,
    },
    result: errorCount === 0 ? "pass" : "fail",
    error_count: errorCount,
    warning_count: warningCount,
    issues: issues.slice(0, 200),
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, await prettier.format(JSON.stringify(report), { parser: "json" }), "utf8");
  console.log(
    JSON.stringify(
      {
        result: report.result,
        expectedFileCount: report.expected_file_count,
        inspectedFileCount: report.inspected_file_count,
        errorCount,
        warningCount,
        reportPath,
      },
      null,
      2,
    ),
  );

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
