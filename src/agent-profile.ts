import type {
  AgentCapabilityKey,
  AgentCapabilityMatrix,
  AgentLevelValue,
  AgentProfile,
  AgentPromptStyle,
  AgentPromptStyleKey,
  AgentRole,
  AgentWorkflowProfile,
} from "./types";

const CAPABILITY_KEYS: AgentCapabilityKey[] = [
  "execution",
  "architecture",
  "review",
  "research",
  "communication",
  "leadership",
];
const PROMPT_STYLE_KEYS: AgentPromptStyleKey[] = ["tone", "autonomy", "strictness", "collaboration"];

const CAPABILITY_LABELS = {
  ko: {
    execution: "실행력",
    architecture: "설계력",
    review: "리뷰력",
    research: "조사력",
    communication: "소통력",
    leadership: "리더십",
  },
  en: {
    execution: "Execution",
    architecture: "Architecture",
    review: "Review",
    research: "Research",
    communication: "Communication",
    leadership: "Leadership",
  },
} as const;

const STYLE_LABELS = {
  ko: {
    tone: "톤",
    autonomy: "자율성",
    strictness: "엄격성",
    collaboration: "협업성",
  },
  en: {
    tone: "Tone",
    autonomy: "Autonomy",
    strictness: "Strictness",
    collaboration: "Collaboration",
  },
} as const;

const LEVEL_WORDS = {
  ko: {
    1: "매우 낮음",
    2: "낮음",
    3: "보통",
    4: "높음",
    5: "매우 높음",
  },
  en: {
    1: "Very low",
    2: "Low",
    3: "Medium",
    4: "High",
    5: "Expert",
  },
} as const;

const ROLE_LABELS = {
  ko: {
    team_leader: "팀장",
    senior: "시니어",
    junior: "주니어",
    intern: "인턴",
  },
  en: {
    team_leader: "Team Leader",
    senior: "Senior",
    junior: "Junior",
    intern: "Intern",
  },
} as const;

const PROFILE_PRESETS: Record<AgentRole, AgentProfile> = {
  team_leader: {
    role_template: "team_leader",
    growth_tier: 4,
    capabilities: {
      execution: 4,
      architecture: 4,
      review: 4,
      research: 3,
      communication: 4,
      leadership: 5,
    },
    prompt_style: {
      tone: 4,
      autonomy: 5,
      strictness: 4,
      collaboration: 5,
    },
    specialties: [],
    custom_prompt_override: null,
  },
  senior: {
    role_template: "senior",
    growth_tier: 3,
    capabilities: {
      execution: 4,
      architecture: 4,
      review: 4,
      research: 3,
      communication: 3,
      leadership: 3,
    },
    prompt_style: {
      tone: 3,
      autonomy: 4,
      strictness: 4,
      collaboration: 3,
    },
    specialties: [],
    custom_prompt_override: null,
  },
  junior: {
    role_template: "junior",
    growth_tier: 2,
    capabilities: {
      execution: 3,
      architecture: 2,
      review: 2,
      research: 3,
      communication: 3,
      leadership: 2,
    },
    prompt_style: {
      tone: 3,
      autonomy: 2,
      strictness: 3,
      collaboration: 4,
    },
    specialties: [],
    custom_prompt_override: null,
  },
  intern: {
    role_template: "intern",
    growth_tier: 1,
    capabilities: {
      execution: 2,
      architecture: 1,
      review: 1,
      research: 2,
      communication: 2,
      leadership: 1,
    },
    prompt_style: {
      tone: 2,
      autonomy: 1,
      strictness: 3,
      collaboration: 4,
    },
    specialties: [],
    custom_prompt_override: null,
  },
};

function normalizeLocale(locale?: string): "ko" | "en" {
  return String(locale || "")
    .toLowerCase()
    .startsWith("ko")
    ? "ko"
    : "en";
}

function normalizeLevel(value: unknown, fallback: AgentLevelValue): AgentLevelValue {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const next = Math.max(1, Math.min(5, Math.trunc(parsed)));
  return next as AgentLevelValue;
}

function normalizeRole(value: unknown, fallback: AgentRole): AgentRole {
  const raw = String(value || "").trim();
  if (raw === "team_leader" || raw === "senior" || raw === "junior" || raw === "intern") {
    return raw;
  }
  return fallback;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseSpecialtiesText(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[\n,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const normalized = entry.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 12);
}

export function stringifySpecialties(specialties: string[] | null | undefined): string {
  return Array.isArray(specialties) ? specialties.join(", ") : "";
}

export function createPresetAgentProfile(role: AgentRole): AgentProfile {
  const preset = PROFILE_PRESETS[role];
  return JSON.parse(JSON.stringify(preset)) as AgentProfile;
}

function normalizeCapabilities(value: unknown, fallback: AgentCapabilityMatrix): AgentCapabilityMatrix {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    execution: normalizeLevel(source.execution, fallback.execution),
    architecture: normalizeLevel(source.architecture, fallback.architecture),
    review: normalizeLevel(source.review, fallback.review),
    research: normalizeLevel(source.research, fallback.research),
    communication: normalizeLevel(source.communication, fallback.communication),
    leadership: normalizeLevel(source.leadership, fallback.leadership),
  };
}

function normalizePromptStyle(value: unknown, fallback: AgentPromptStyle): AgentPromptStyle {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    tone: normalizeLevel(source.tone, fallback.tone),
    autonomy: normalizeLevel(source.autonomy, fallback.autonomy),
    strictness: normalizeLevel(source.strictness, fallback.strictness),
    collaboration: normalizeLevel(source.collaboration, fallback.collaboration),
  };
}

export function normalizeAgentProfile(input: unknown, fallbackRole: AgentRole = "junior"): AgentProfile {
  const preset = createPresetAgentProfile(fallbackRole);
  const source = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const roleTemplate = normalizeRole(source.role_template, fallbackRole);
  const rolePreset = createPresetAgentProfile(roleTemplate);
  const specialties = Array.isArray(source.specialties)
    ? parseSpecialtiesText(
        source.specialties
          .map((entry) => normalizeString(entry))
          .filter(Boolean)
          .join(", "),
      )
    : typeof source.specialties === "string"
      ? parseSpecialtiesText(source.specialties)
      : rolePreset.specialties;

  return {
    role_template: roleTemplate,
    growth_tier: normalizeLevel(source.growth_tier, rolePreset.growth_tier),
    capabilities: normalizeCapabilities(source.capabilities, rolePreset.capabilities),
    prompt_style: normalizePromptStyle(source.prompt_style, rolePreset.prompt_style),
    specialties,
    custom_prompt_override: normalizeString(source.custom_prompt_override) || preset.custom_prompt_override,
  };
}

export function recommendGrowthTierFromXp(xp: number | null | undefined): AgentLevelValue {
  const value = Number(xp ?? 0);
  if (!Number.isFinite(value) || value < 100) return 1;
  if (value < 250) return 2;
  if (value < 500) return 3;
  if (value < 900) return 4;
  return 5;
}

export function getLevelWord(level: AgentLevelValue, locale?: string): string {
  const lang = normalizeLocale(locale);
  return LEVEL_WORDS[lang][level];
}

export function getAgentRoleLabel(role: AgentRole, locale?: string): string {
  const lang = normalizeLocale(locale);
  return ROLE_LABELS[lang][role];
}

export function getCapabilityLabel(key: AgentCapabilityKey, locale?: string): string {
  const lang = normalizeLocale(locale);
  return CAPABILITY_LABELS[lang][key];
}

export function getPromptStyleLabel(key: AgentPromptStyleKey, locale?: string): string {
  const lang = normalizeLocale(locale);
  return STYLE_LABELS[lang][key];
}

export function buildAgentCapabilityCompactSummary(
  profile: AgentProfile | null | undefined,
  locale?: string,
  keys: AgentCapabilityKey[] = ["execution", "architecture", "review"],
): string {
  const normalized = normalizeAgentProfile(profile, profile?.role_template ?? "junior");
  return keys.map((key) => `${getCapabilityLabel(key, locale)} ${normalized.capabilities[key]}`).join(" / ");
}

export function resolveAgentProfileOverrideText(
  profile: AgentProfile | null | undefined,
  legacyPersonality?: string | null,
): string {
  const custom = normalizeString(profile?.custom_prompt_override);
  if (custom) return custom;
  return normalizeString(legacyPersonality);
}

export function buildAgentPromptPreview(params: {
  profile: AgentProfile | null | undefined;
  workflowProfile?: AgentWorkflowProfile | null;
  legacyPersonality?: string | null;
  locale?: string;
}): string {
  const { workflowProfile, legacyPersonality, locale } = params;
  const normalized = normalizeAgentProfile(params.profile, params.profile?.role_template ?? "junior");
  const lang = normalizeLocale(locale);
  const overrideText = resolveAgentProfileOverrideText(normalized, legacyPersonality);
  const capabilitySummary = CAPABILITY_KEYS.map(
    (key) =>
      `${CAPABILITY_LABELS[lang][key]} ${LEVEL_WORDS[lang][normalized.capabilities[key]]}(${normalized.capabilities[key]})`,
  ).join(", ");
  const styleSummary = PROMPT_STYLE_KEYS.map(
    (key) =>
      `${STYLE_LABELS[lang][key]} ${LEVEL_WORDS[lang][normalized.prompt_style[key]]}(${normalized.prompt_style[key]})`,
  ).join(", ");
  const reviewLenses = workflowProfile?.review_lenses?.join(", ") || "";
  const specialties = normalized.specialties.join(", ");
  const workflowRoleLabel =
    workflowProfile?.role === "primary_author"
      ? lang === "ko"
        ? "작성자"
        : "Primary Author"
      : lang === "ko"
        ? "리뷰어"
        : "Reviewer";
  const reviewDepthLabel =
    workflowProfile?.two_pass_required === false
      ? lang === "ko"
        ? "단일 패스"
        : "Single pass"
      : lang === "ko"
        ? "2패스 강제"
        : "Force 2-pass";

  if (lang === "ko") {
    return [
      `역할 템플릿: ${ROLE_LABELS.ko[normalized.role_template]}`,
      `적용 성장 티어: ${normalized.growth_tier}/5`,
      `2x 역할: ${workflowRoleLabel}`,
      `능력치: ${capabilitySummary}`,
      `작업 성향: ${styleSummary}`,
      specialties ? `전문 분야: ${specialties}` : "",
      reviewLenses ? `리뷰 렌즈: ${reviewLenses}` : "",
      workflowProfile?.role === "reviewer" ? `리뷰 깊이: ${reviewDepthLabel}` : "",
      workflowProfile?.role === "primary_author" && workflowProfile.max_review_rounds
        ? `최대 리뷰 라운드: ${workflowProfile.max_review_rounds}`
        : "",
      overrideText ? `최종 수동 보정: ${overrideText}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Role template: ${ROLE_LABELS.en[normalized.role_template]}`,
    `Applied growth tier: ${normalized.growth_tier}/5`,
    `2x role: ${workflowRoleLabel}`,
    `Capabilities: ${capabilitySummary}`,
    `Working style: ${styleSummary}`,
    specialties ? `Specialties: ${specialties}` : "",
    reviewLenses ? `Review lenses: ${reviewLenses}` : "",
    workflowProfile?.role === "reviewer" ? `Review depth: ${reviewDepthLabel}` : "",
    workflowProfile?.role === "primary_author" && workflowProfile.max_review_rounds
      ? `Max review rounds: ${workflowProfile.max_review_rounds}`
      : "",
    overrideText ? `Final override: ${overrideText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
