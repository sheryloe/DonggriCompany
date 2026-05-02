import { AnimatedSprite, Container, Text, TextStyle, type Texture } from "pixi.js";
import {
  AGENT_SPRITE_DIRECTIONS,
  AGENT_SPRITE_WALK_FRAMES,
  buildAgentSpriteKey,
  type AgentSpriteDirection,
} from "./spriteAssets";

export type AgentWalkSprites = Partial<Record<AgentSpriteDirection, AnimatedSprite>>;

export function collectAgentWalkFrames(
  textures: Record<string, Texture>,
  spriteNumber: number,
  direction: AgentSpriteDirection,
): Texture[] {
  const frames = AGENT_SPRITE_WALK_FRAMES.map((frame) => textures[buildAgentSpriteKey(spriteNumber, direction, frame)]);
  const available = frames.filter((texture): texture is Texture => Boolean(texture));
  if (available.length > 0) return available;
  if (direction === "D") return [];
  return collectAgentWalkFrames(textures, spriteNumber, "D");
}

export function applyAgentWalkDirection(sprites: AgentWalkSprites | undefined, direction: AgentSpriteDirection): void {
  if (!sprites) return;
  for (const [spriteDirection, sprite] of Object.entries(sprites) as Array<[AgentSpriteDirection, AnimatedSprite]>) {
    sprite.visible = spriteDirection === direction;
    if (sprite.visible) {
      sprite.play();
    } else {
      sprite.stop();
    }
  }
}

export function createAgentWalkActor(params: {
  textures: Record<string, Texture>;
  spriteNumber: number;
  targetHeight: number;
  initialDirection?: AgentSpriteDirection;
  fallbackText?: string;
}): { actor: Container; walkSprites?: AgentWalkSprites } {
  const actor = new Container();
  const initialDirection = params.initialDirection ?? "D";
  const walkSprites: AgentWalkSprites = {};

  for (const direction of AGENT_SPRITE_DIRECTIONS) {
    const frames = collectAgentWalkFrames(params.textures, params.spriteNumber, direction);
    if (frames.length === 0) continue;
    const sprite = new AnimatedSprite(frames);
    sprite.anchor.set(0.5, 1);
    const scale = params.targetHeight / sprite.texture.height;
    sprite.scale.set(scale);
    sprite.animationSpeed = 0.12;
    sprite.visible = direction === initialDirection;
    sprite.gotoAndStop(0);
    actor.addChild(sprite);
    walkSprites[direction] = sprite;
  }

  if (Object.keys(walkSprites).length > 0) {
    applyAgentWalkDirection(walkSprites, initialDirection);
    return { actor, walkSprites };
  }

  const fallback = new Text({
    text: params.fallbackText ?? "AG",
    style: new TextStyle({ fontSize: 18, fill: 0xe2e8f0, fontFamily: "monospace" }),
  });
  fallback.anchor.set(0.5, 1);
  actor.addChild(fallback);
  return { actor };
}
