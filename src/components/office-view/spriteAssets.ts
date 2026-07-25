export const AGENT_SPRITE_VERSION = "agent-visual-v2";
export const DONGGRI_VISUAL_V2_SPRITE_VERSION = "donggri-visual-v2-quality-20260716";

export type AgentSpriteDirection = "D" | "L" | "B" | "R";
export type AgentSpriteAssetPack = "legacy" | "donggri_visual_v2";

export const AGENT_SPRITE_DIRECTIONS: AgentSpriteDirection[] = ["D", "L", "B", "R"];
export const AGENT_SPRITE_WALK_FRAMES = [1, 2, 3] as const;

export function buildAgentSpriteKey(spriteNumber: number, direction: AgentSpriteDirection, frame: number): string {
  return `${spriteNumber}-${direction}-${frame}`;
}

export function normalizeAgentSpriteAssetPack(pack?: string | null): AgentSpriteAssetPack {
  return pack === "donggri_visual_v2" ? "donggri_visual_v2" : "legacy";
}

export function buildAgentSpriteUrl(
  spriteNumber: number,
  direction: AgentSpriteDirection,
  frame: number,
  pack?: AgentSpriteAssetPack | string | null,
): string {
  if (normalizeAgentSpriteAssetPack(pack) === "donggri_visual_v2") {
    return `/sprites/donggri-visual-v2/${spriteNumber}-${direction}-${frame}.png?v=${DONGGRI_VISUAL_V2_SPRITE_VERSION}`;
  }
  return `/sprites/${spriteNumber}-${direction}-${frame}.png?v=${AGENT_SPRITE_VERSION}`;
}

export function getAgentWalkDirection(fromX: number, fromY: number, toX: number, toY: number): AgentSpriteDirection {
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return deltaX >= 0 ? "R" : "L";
  return deltaY >= 0 ? "D" : "B";
}
