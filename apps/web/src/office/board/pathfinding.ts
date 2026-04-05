import type { TileCoord } from "./scene-types";

type FindTilePathInput = {
  start: TileCoord;
  goal: TileCoord;
  blocked: Set<string>;
  width: number;
  height: number;
};

const keyOf = (tile: TileCoord): string => `${tile.x}:${tile.y}`;

const parseKey = (key: string): TileCoord => {
  const [xRaw, yRaw] = key.split(":");
  return {
    x: Number(xRaw),
    y: Number(yRaw)
  };
};

const manhattanDistance = (left: TileCoord, right: TileCoord): number => {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
};

const neighborOffsets: TileCoord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

const isInsideBounds = (tile: TileCoord, width: number, height: number): boolean => {
  return tile.x >= 0 && tile.y >= 0 && tile.x < width && tile.y < height;
};

const reconstructPath = (cameFrom: Map<string, string>, currentKey: string): TileCoord[] => {
  const path: TileCoord[] = [parseKey(currentKey)];
  let cursor = currentKey;
  while (cameFrom.has(cursor)) {
    cursor = cameFrom.get(cursor) ?? "";
    if (!cursor) {
      break;
    }
    path.push(parseKey(cursor));
  }
  return path.reverse();
};

export const findTilePath = ({ start, goal, blocked, width, height }: FindTilePathInput): TileCoord[] | null => {
  if (!isInsideBounds(start, width, height) || !isInsideBounds(goal, width, height)) {
    return null;
  }
  if (start.x === goal.x && start.y === goal.y) {
    return [start];
  }

  const startKey = keyOf(start);
  const goalKey = keyOf(goal);
  const blockedSet = new Set(blocked);
  blockedSet.delete(startKey);
  blockedSet.delete(goalKey);

  const open = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, manhattanDistance(start, goal)]]);

  while (open.size > 0) {
    let currentKey: string | null = null;
    let currentScore = Number.POSITIVE_INFINITY;
    open.forEach((candidateKey) => {
      const score = fScore.get(candidateKey) ?? Number.POSITIVE_INFINITY;
      if (score < currentScore) {
        currentScore = score;
        currentKey = candidateKey;
      }
    });

    const currentKeyValue = currentKey;
    if (!currentKeyValue) {
      break;
    }
    if (currentKeyValue === goalKey) {
      return reconstructPath(cameFrom, currentKeyValue);
    }

    open.delete(currentKeyValue);
    const currentTile = parseKey(currentKeyValue);
    const currentG = gScore.get(currentKeyValue) ?? Number.POSITIVE_INFINITY;

    neighborOffsets.forEach((offset) => {
      const neighbor = {
        x: currentTile.x + offset.x,
        y: currentTile.y + offset.y
      };
      const neighborKey = keyOf(neighbor);
      if (!isInsideBounds(neighbor, width, height) || blockedSet.has(neighborKey)) {
        return;
      }
      const tentativeG = currentG + 1;
      if (tentativeG >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        return;
      }
      cameFrom.set(neighborKey, currentKeyValue);
      gScore.set(neighborKey, tentativeG);
      fScore.set(neighborKey, tentativeG + manhattanDistance(neighbor, goal));
      open.add(neighborKey);
    });
  }

  return null;
};
