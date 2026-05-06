import type { Agent, AgentVisualProfile } from "./types";

const BASE_ARCHETYPES = [
  {
    key: "systems-architect",
    labelKo: "시스템 설계자",
    bible:
      "A calm senior engineer character with precise posture, layered utility jacket, compact tools, and clear analytical expression.",
    displayKo: "정확한 자세와 분석적인 표정이 강조된 시스템 설계형 캐릭터입니다.",
  },
  {
    key: "backend-builder",
    labelKo: "백엔드 빌더",
    bible:
      "A focused server-side developer character with sturdy workwear, practical gloves, data-core accessories, and grounded silhouette.",
    displayKo: "튼튼한 작업복과 데이터 장비가 어울리는 서버 개발형 캐릭터입니다.",
  },
  {
    key: "frontend-crafter",
    labelKo: "프론트엔드 크래프터",
    bible:
      "A polished interface engineer character with clean lines, refined color accents, tablet tools, and expressive but readable gestures.",
    displayKo: "깔끔한 선과 태블릿 도구가 어울리는 인터페이스 제작형 캐릭터입니다.",
  },
  {
    key: "qa-sentinel",
    labelKo: "QA 감시자",
    bible:
      "A quality guardian character with inspection gear, checklist belt, sharp eyes, and a balanced defensive stance.",
    displayKo: "체크리스트 장비와 날카로운 시선이 강조된 품질 검증형 캐릭터입니다.",
  },
  {
    key: "security-warden",
    labelKo: "보안 관리관",
    bible:
      "A security specialist character with shield-like shoulder details, minimal tactical outfit, and vigilant silhouette.",
    displayKo: "방패형 장식과 경계 자세가 강조된 보안 운영형 캐릭터입니다.",
  },
  {
    key: "research-scout",
    labelKo: "리서치 스카우트",
    bible:
      "A research scout character with field notebook, map case, observation tools, and curious forward-leaning posture.",
    displayKo: "현장 노트와 관찰 도구가 어울리는 조사 분석형 캐릭터입니다.",
  },
  {
    key: "ops-coordinator",
    labelKo: "운영 조율자",
    bible:
      "An operations coordinator character with dispatcher headset, compact command board, and confident coordination pose.",
    displayKo: "헤드셋과 작은 지휘판이 어울리는 운영 조율형 캐릭터입니다.",
  },
  {
    key: "design-artisan",
    labelKo: "디자인 장인",
    bible:
      "A design artisan character with fabric swatches, stylus tools, harmonious outfit shapes, and elegant movement.",
    displayKo: "스타일러스와 색상 견본이 어울리는 디자인 제작형 캐릭터입니다.",
  },
  {
    key: "release-engineer",
    labelKo: "릴리스 엔지니어",
    bible:
      "A release engineer character with deployment case, signal lights, careful stance, and clean technical silhouette.",
    displayKo: "배포 케이스와 신호등 장치가 어울리는 릴리스 운영형 캐릭터입니다.",
  },
  {
    key: "memory-curator",
    labelKo: "기억 큐레이터",
    bible:
      "A memory curator character with archive ribbons, compact library satchel, thoughtful expression, and stable anchor pose.",
    displayKo: "아카이브 장식과 기록 가방이 어울리는 장기기억 관리형 캐릭터입니다.",
  },
] as const;

const STYLE_VARIANTS = [
  {
    key: "animated-clean",
    labelKo: "클린 애니메이션",
    prompt:
      "Clean animated game character, readable silhouette, soft cel shading, consistent proportions, no text, no watermark.",
    displayKo: "부드러운 셀 셰이딩과 읽기 쉬운 실루엣을 우선합니다.",
  },
  {
    key: "pixel-hero",
    labelKo: "픽셀 히어로",
    prompt:
      "High-resolution pixel-art inspired game character, strong shape language, limited palette, stable anchor, no text.",
    displayKo: "픽셀 게임 감성과 안정적인 기준점을 우선합니다.",
  },
  {
    key: "storybook",
    labelKo: "스토리북",
    prompt:
      "Storybook animated character, gentle painterly texture, clear costume language, consistent palette, no text.",
    displayKo: "동화책 느낌의 질감과 명확한 의상 언어를 우선합니다.",
  },
  {
    key: "tactical-soft",
    labelKo: "소프트 택티컬",
    prompt:
      "Soft tactical animated character, practical outfit, minimal accessories, clear four-direction sprite readability.",
    displayKo: "실용적인 복장과 4방향 스프라이트 가독성을 우선합니다.",
  },
] as const;

type ArchetypeKey = (typeof BASE_ARCHETYPES)[number]["key"];
type StyleKey = (typeof STYLE_VARIANTS)[number]["key"];

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

function splitProfileKey(profileKey: string): { archetypeKey: ArchetypeKey | null; styleKey: StyleKey | null } {
  const archetype = BASE_ARCHETYPES.find((entry) => profileKey.startsWith(`${entry.key}-`));
  const style = STYLE_VARIANTS.find((entry) => profileKey.endsWith(`-${entry.key}`));
  return {
    archetypeKey: archetype?.key ?? null,
    styleKey: style?.key ?? null,
  };
}

export function resolveAgentVisualProfile(agent: Agent, fallbackIndex = 0): AgentVisualProfile {
  const explicitKey = agent.agent_profile?.visual_profile_key;
  const explicitProfile = explicitKey
    ? AGENT_VISUAL_PROFILES.find((profile) => profile.agent_visual_profile_key === explicitKey)
    : null;
  if (explicitProfile) return explicitProfile;

  const basis = `${agent.id}:${agent.name}:${agent.family ?? ""}:${agent.specialization_key ?? ""}:${agent.sprite_number ?? ""}`;
  const index =
    AGENT_VISUAL_PROFILES.length > 0 ? stableHash(basis || String(fallbackIndex)) % AGENT_VISUAL_PROFILES.length : 0;
  return AGENT_VISUAL_PROFILES[index];
}

export function getAgentVisualProfileDescriptionKo(profile: AgentVisualProfile): string {
  const { archetypeKey, styleKey } = splitProfileKey(profile.agent_visual_profile_key);
  const archetype = BASE_ARCHETYPES.find((entry) => entry.key === archetypeKey);
  const style = STYLE_VARIANTS.find((entry) => entry.key === styleKey);
  return [archetype?.displayKo, style?.displayKo].filter(Boolean).join(" ");
}

export function getAgentVisualProfileStatusLabelKo(status: AgentVisualProfile["status"]): string {
  const labels: Record<AgentVisualProfile["status"], string> = {
    seeded: "기본 프리셋",
    active: "활성",
    reserve: "예비",
    archived: "보관됨",
  };
  return labels[status] ?? "상태 확인 필요";
}

export function getSpriteDirectionLabelKo(
  direction: AgentVisualProfile["sprite_profile"]["directions"][number],
): string {
  const labels: Record<AgentVisualProfile["sprite_profile"]["directions"][number], string> = {
    front: "앞",
    left: "왼쪽",
    back: "뒤",
    right: "오른쪽",
  };
  return labels[direction] ?? direction;
}
