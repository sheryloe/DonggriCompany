export const AGENT_SPRITE_VERSION = "agent-visual-v2";

export type AgentSpriteDirection = "D" | "L" | "B" | "R";

export const AGENT_SPRITE_DIRECTIONS: AgentSpriteDirection[] = ["D", "L", "B", "R"];
export const AGENT_SPRITE_WALK_FRAMES = [1, 2, 3] as const;

export function buildAgentSpriteKey(spriteNumber: number, direction: AgentSpriteDirection, frame: number): string {
  return `${spriteNumber}-${direction}-${frame}`;
}

export function buildAgentSpriteUrl(spriteNumber: number, direction: AgentSpriteDirection, frame: number): string {
  return `/sprites/${spriteNumber}-${direction}-${frame}.png?v=${AGENT_SPRITE_VERSION}`;
}

export function getAgentWalkDirection(fromX: number, fromY: number, toX: number, toY: number): AgentSpriteDirection {
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return deltaX >= 0 ? "R" : "L";
  return deltaY >= 0 ? "D" : "B";
}
