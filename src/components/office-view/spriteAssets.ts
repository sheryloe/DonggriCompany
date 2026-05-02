export const AGENT_SPRITE_VERSION = "agent-visual-v2";

export function buildAgentSpriteUrl(spriteNumber: number, direction: "D" | "L" | "R", frame: number): string {
  return `/sprites/${spriteNumber}-${direction}-${frame}.png?v=${AGENT_SPRITE_VERSION}`;
}
