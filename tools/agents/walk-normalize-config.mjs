export const walkNormalizeVersion = "walk-normalize-v2";

export const sourceSheet = {
  path: "public/generated/agent-visual-profiles/agent-visual-profile-sheet-v1.png",
  columns: 5,
  rows: 7,
  sourceCharacters: 35,
  runtimeMaxSprites: 44,
};

export const outputSpec = {
  spriteSize: 96,
  maxContentSize: 78,
  bottomPadding: 8,
  cropPadding: 12,
};

export const walkFrameOffsetsByDirection = {
  D: [
    { x: 0, y: 0 },
    { x: -2, y: -1 },
    { x: 2, y: 0 },
  ],
  L: [
    { x: 0, y: 0 },
    { x: -2, y: 0 },
    { x: 1, y: -1 },
  ],
  B: [
    { x: 0, y: 0 },
    { x: 2, y: -1 },
    { x: -2, y: 0 },
  ],
  R: [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: -1, y: -1 },
  ],
};

export const walkNormalizePoseSpecs = [
  {
    key: "D",
    source: "F",
    label: "front/down",
    frameNames: ["D-1", "D-2", "D-3"],
    referenceCrop: { centerRatio: 0.19, widthRatio: 0.3, topRatio: 0.22, heightRatio: 0.72 },
    anchor: { x: 0.5, y: 1, bottomPadding: outputSpec.bottomPadding },
  },
  {
    key: "L",
    source: "L",
    label: "left",
    frameNames: ["L-1", "L-2", "L-3"],
    referenceCrop: { centerRatio: 0.44, widthRatio: 0.3, topRatio: 0.22, heightRatio: 0.72 },
    anchor: { x: 0.5, y: 1, bottomPadding: outputSpec.bottomPadding },
  },
  {
    key: "B",
    source: "B",
    label: "back/up",
    frameNames: ["B-1", "B-2", "B-3"],
    referenceCrop: { centerRatio: 0.68, widthRatio: 0.3, topRatio: 0.22, heightRatio: 0.72 },
    anchor: { x: 0.5, y: 1, bottomPadding: outputSpec.bottomPadding },
  },
  {
    key: "R",
    source: "R",
    label: "right",
    frameNames: ["R-1", "R-2", "R-3"],
    referenceCrop: { centerRatio: 0.91, widthRatio: 0.3, topRatio: 0.22, heightRatio: 0.72 },
    anchor: { x: 0.5, y: 1, bottomPadding: outputSpec.bottomPadding },
  },
];

export const walkNormalizeDirections = walkNormalizePoseSpecs.map((poseSpec) => poseSpec.key);
export const walkNormalizeFrames = [1, 2, 3];

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getSourceCharacterCell(metadata, spriteNumber) {
  if (!metadata.width || !metadata.height) {
    throw new Error("Cannot read source sheet dimensions.");
  }
  if (spriteNumber < 1 || spriteNumber > sourceSheet.sourceCharacters) {
    throw new Error(`Source sprite number out of range: ${spriteNumber}`);
  }
  const col = (spriteNumber - 1) % sourceSheet.columns;
  const row = Math.floor((spriteNumber - 1) / sourceSheet.columns);
  const x = Math.round((metadata.width / sourceSheet.columns) * col);
  const y = Math.round((metadata.height / sourceSheet.rows) * row);
  const nextX = Math.round((metadata.width / sourceSheet.columns) * (col + 1));
  const nextY = Math.round((metadata.height / sourceSheet.rows) * (row + 1));
  return { number: spriteNumber, x, y, width: nextX - x, height: nextY - y };
}

export function buildReferenceCrop(cell, poseSpec) {
  const cropWidth = Math.round(cell.width * poseSpec.referenceCrop.widthRatio);
  const cropHeight = Math.round(cell.height * poseSpec.referenceCrop.heightRatio);
  const centerX = Math.round(cell.x + cell.width * poseSpec.referenceCrop.centerRatio);
  const cropLeft = clamp(Math.round(centerX - cropWidth / 2), cell.x, cell.x + cell.width - cropWidth);
  const cropTop = clamp(
    Math.round(cell.y + cell.height * poseSpec.referenceCrop.topRatio),
    cell.y,
    cell.y + cell.height - cropHeight,
  );
  return {
    left: cropLeft,
    top: cropTop,
    width: cropWidth,
    height: cropHeight,
  };
}

export function getWalkFrameOffset(direction, frameIndex) {
  const offsets = walkFrameOffsetsByDirection[direction] ?? walkFrameOffsetsByDirection.D;
  return offsets[frameIndex] ?? offsets[0];
}

export function buildRuntimeSpriteKey(spriteNumber, direction, frame) {
  return `${spriteNumber}-${direction}-${frame}`;
}

export function buildExpectedRuntimeSpriteKeys(maxSprites = sourceSheet.runtimeMaxSprites) {
  const keys = [];
  for (let spriteNumber = 1; spriteNumber <= maxSprites; spriteNumber += 1) {
    for (const direction of walkNormalizeDirections) {
      for (const frame of walkNormalizeFrames) {
        keys.push(buildRuntimeSpriteKey(spriteNumber, direction, frame));
      }
    }
  }
  return keys;
}
