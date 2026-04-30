import type { Agent, AgentVisualProfile } from "./types";

const BASE_ARCHETYPES = [
  {
    key: "systems-architect",
    labelKo: "시스템 설계자",
    bible:
      "A calm senior engineer character with precise posture, layered utility jacket, compact tools, and clear analytical expression.",
  },
  {
    key: "backend-builder",
    labelKo: "백엔드 빌더",
    bible:
      "A focused server-side developer character with sturdy workwear, practical gloves, data-core accessories, and grounded silhouette.",
  },
  {
    key: "frontend-crafter",
    labelKo: "프론트엔드 크래프터",
    bible:
      "A polished interface engineer character with clean lines, refined color accents, tablet tools, and expressive but readable gestures.",
  },
  {
    key: "qa-sentinel",
    labelKo: "QA 감시자",
    bible:
      "A quality guardian character with inspection gear, checklist belt, sharp eyes, and a balanced defensive stance.",
  },
  {
    key: "security-warden",
    labelKo: "보안 관리자",
    bible:
      "A security specialist character with shield-like shoulder details, minimal tactical outfit, and vigilant silhouette.",
  },
  {
    key: "research-scout",
    labelKo: "리서치 스카우트",
    bible:
      "A research scout character with field notebook, map case, observation tools, and curious forward-leaning posture.",
  },
  {
    key: "ops-coordinator",
    labelKo: "운영 조율자",
    bible:
      "An operations coordinator character with dispatcher headset, compact command board, and confident coordination pose.",
  },
  {
    key: "design-artisan",
    labelKo: "디자인 장인",
    bible:
      "A design artisan character with fabric swatches, stylus tools, harmonious outfit shapes, and elegant movement.",
  },
  {
    key: "release-engineer",
    labelKo: "릴리스 엔지니어",
    bible:
      "A release engineer character with deployment case, signal lights, careful stance, and clean technical silhouette.",
  },
  {
    key: "memory-curator",
    labelKo: "기억 큐레이터",
    bible:
      "A memory curator character with archive ribbons, compact library satchel, thoughtful expression, and stable anchor pose.",
  },
] as const;

const STYLE_VARIANTS = [
  {
    key: "animated-clean",
    labelKo: "클린 애니메이션",
    prompt:
      "Clean animated game character, readable silhouette, soft cel shading, consistent proportions, no text, no watermark.",
  },
  {
    key: "pixel-hero",
    labelKo: "픽셀 히어로",
    prompt:
      "High-resolution pixel-art inspired game character, strong shape language, limited palette, stable anchor, no text.",
  },
  {
    key: "storybook",
    labelKo: "스토리북",
    prompt:
      "Storybook animated character, gentle painterly texture, clear costume language, consistent palette, no text.",
  },
  {
    key: "tactical-soft",
    labelKo: "소프트 택티컬",
    prompt:
      "Soft tactical animated character, practical outfit, minimal accessories, clear four-direction sprite readability.",
  },
] as const;

function makeProfile(archetypeIndex: number, styleIndex: number): AgentVisualProfile {
  const archetype = BASE_ARCHETYPES[archetypeIndex];
  const style = STYLE_VARIANTS[styleIndex];
  return {
    agent_visual_profile_key: `${archetype.key}-${style.key}`,
    label_ko: `${archetype.labelKo} / ${style.labelKo}`,
    style_prompt_en: style.prompt,
    character_bible_en: `${archetype.bible} The character must remain original, repeatable, and suitable for front, left, back, and right sprite generation.`,
    sprite_profile: {
      directions: ["front", "left", "back", "right"],
      supports_walk: true,
      canvas_size: "1024x1024",
    },
    preferred_asset_modules: ["character-image", "sprite-4dir"],
    status: "seeded",
  };
}

export const AGENT_VISUAL_PROFILES: AgentVisualProfile[] = BASE_ARCHETYPES.flatMap((_archetype, archetypeIndex) =>
  STYLE_VARIANTS.map((_style, styleIndex) => makeProfile(archetypeIndex, styleIndex)),
);

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function resolveAgentVisualProfile(agent: Agent, fallbackIndex = 0): AgentVisualProfile {
  const basis = `${agent.id}:${agent.name}:${agent.family ?? ""}:${agent.specialization_key ?? ""}:${agent.sprite_number ?? ""}`;
  const index =
    AGENT_VISUAL_PROFILES.length > 0 ? stableHash(basis || String(fallbackIndex)) % AGENT_VISUAL_PROFILES.length : 0;
  return AGENT_VISUAL_PROFILES[index];
}
