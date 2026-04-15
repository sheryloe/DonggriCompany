import type {
  AgentCapabilityKey,
  AgentCapabilityMatrix,
  AgentClassPath,
  AgentLevelValue,
  AgentProfile,
  AgentPromotionPolicy,
  AgentPromptStyle,
  AgentPromptStyleKey,
  AgentRole,
  AgentWorkflowProfile,
} from "./types";
import { getRoleDisplayLabel, getWorkflowRoleDisplayLabel } from "./app/canonical-display";

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
    execution: "실행",
    architecture: "아키텍처",
    review: "리뷰",
    research: "리서치",
    communication: "커뮤니케이션",
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
    strictness: "엄격함",
    collaboration: "협업",
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
    5: "전문가",
  },
  en: {
    1: "Very low",
    2: "Low",
    3: "Medium",
    4: "High",
    5: "Expert",
  },
} as const;

const PROFILE_PRESETS: Record<AgentRole, AgentProfile> = {
  team_leader: {
    role_template: "team_leader",
    growth_tier: 4,
    capabilities: { execution: 4, architecture: 4, review: 4, research: 3, communication: 4, leadership: 5 },
    prompt_style: { tone: 4, autonomy: 5, strictness: 4, collaboration: 5 },
    specialties: [],
    custom_prompt_override: null,
    class_path: null,
    promotion_policy: null,
  },
  senior: {
    role_template: "senior",
    growth_tier: 3,
    capabilities: { execution: 4, architecture: 4, review: 4, research: 3, communication: 3, leadership: 3 },
    prompt_style: { tone: 3, autonomy: 4, strictness: 4, collaboration: 3 },
    specialties: [],
    custom_prompt_override: null,
    class_path: null,
    promotion_policy: null,
  },
  junior: {
    role_template: "junior",
    growth_tier: 2,
    capabilities: { execution: 3, architecture: 2, review: 2, research: 3, communication: 3, leadership: 2 },
    prompt_style: { tone: 3, autonomy: 2, strictness: 3, collaboration: 4 },
    specialties: [],
    custom_prompt_override: null,
    class_path: null,
    promotion_policy: null,
  },
  intern: {
    role_template: "junior",
    growth_tier: 2,
    capabilities: { execution: 3, architecture: 2, review: 2, research: 3, communication: 3, leadership: 2 },
    prompt_style: { tone: 3, autonomy: 2, strictness: 3, collaboration: 4 },
    specialties: [],
    custom_prompt_override: null,
    class_path: null,
    promotion_policy: null,
  },
};

function normalizeLocale(locale?: string): "ko" | "en" {
  return String(locale ?? "")
    .toLowerCase()
    .startsWith("ko")
    ? "ko"
    : "en";
}

function normalizeLevel(value: unknown, fallback: AgentLevelValue): AgentLevelValue {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(5, Math.trunc(parsed))) as AgentLevelValue;
}

function normalizeRole(value: unknown, fallback: AgentRole): AgentRole {
  const raw = String(value ?? "").trim();
  if (raw === "team_leader" || raw === "senior" || raw === "junior") return raw;
  if (raw === "intern") return "junior";
  return fallback;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeClassPath(value: unknown): AgentProfile["class_path"] {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const list = value.map((entry) => normalizeString(entry)).filter(Boolean);
    return list.length > 0 ? list : null;
  }
  if (typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const output: AgentClassPath = {};
  for (const key of ["stage1", "stage2", "stage3", "class_stage_1", "class_stage_2", "class_stage_3"] as const) {
    const text = normalizeString(source[key]);
    if (text) output[key] = text;
  }
  return Object.keys(output).length > 0 ? output : null;
}

function normalizePromotionPolicy(value: unknown): AgentProfile["promotion_policy"] {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const output: AgentPromotionPolicy = {};
  if (Number.isFinite(Number(source.auto_promote_at_xp))) output.auto_promote_at_xp = Number(source.auto_promote_at_xp);
  const fromRole = normalizeString(source.from_role);
  const toRole = normalizeString(source.to_role);
  const notes = normalizeString(source.notes);
  if (fromRole) output.from_role = fromRole;
  if (toRole) output.to_role = toRole;
  if (typeof source.team_leader_manual === "boolean") output.team_leader_manual = source.team_leader_manual;
  if (notes) output.notes = notes;
  return Object.keys(output).length > 0 ? output : null;
}

export function parseSpecialtiesText(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[\n,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export function stringifySpecialties(specialties: string[] | null | undefined): string {
  return Array.isArray(specialties) ? specialties.join(", ") : "";
}

export function createPresetAgentProfile(role: AgentRole): AgentProfile {
  return JSON.parse(JSON.stringify(PROFILE_PRESETS[normalizeRole(role, "junior")])) as AgentProfile;
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
  const source = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const roleTemplate = normalizeRole(source.role_template, normalizeRole(fallbackRole, "junior"));
  const preset = createPresetAgentProfile(roleTemplate);
  const specialties = Array.isArray(source.specialties)
    ? parseSpecialtiesText(
        source.specialties
          .map((entry) => normalizeString(entry))
          .filter(Boolean)
          .join(", "),
      )
    : typeof source.specialties === "string"
      ? parseSpecialtiesText(source.specialties)
      : preset.specialties;

  return {
    role_template: roleTemplate,
    growth_tier: normalizeLevel(source.growth_tier, preset.growth_tier),
    capabilities: normalizeCapabilities(source.capabilities, preset.capabilities),
    prompt_style: normalizePromptStyle(source.prompt_style, preset.prompt_style),
    specialties,
    custom_prompt_override: normalizeString(source.custom_prompt_override) || preset.custom_prompt_override,
    class_path: normalizeClassPath(source.class_path),
    promotion_policy: normalizePromotionPolicy(source.promotion_policy),
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
  return LEVEL_WORDS[normalizeLocale(locale)][level];
}

export function getAgentRoleLabel(role: AgentRole, locale?: string): string {
  return getRoleDisplayLabel(role, locale);
}

export function getCapabilityLabel(key: AgentCapabilityKey, locale?: string): string {
  return CAPABILITY_LABELS[normalizeLocale(locale)][key];
}

export function getPromptStyleLabel(key: AgentPromptStyleKey, locale?: string): string {
  return STYLE_LABELS[normalizeLocale(locale)][key];
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
  return custom || normalizeString(legacyPersonality);
}

function formatClassPath(value: AgentProfile["class_path"]): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(" > ");
  const stage1 = normalizeString(value.stage1 ?? value.class_stage_1);
  const stage2 = normalizeString(value.stage2 ?? value.class_stage_2);
  const stage3 = normalizeString(value.stage3 ?? value.class_stage_3);
  return [stage1, stage2, stage3].filter(Boolean).join(" > ");
}

function formatPromotionPolicy(value: AgentProfile["promotion_policy"]): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const fromRole = normalizeString(value.from_role);
  const toRole = normalizeString(value.to_role);
  const xp = Number.isFinite(Number(value.auto_promote_at_xp)) ? Number(value.auto_promote_at_xp) : null;
  const manual = value.team_leader_manual ? "team_leader_manual" : "";
  const notes = normalizeString(value.notes);
  const base = [fromRole, toRole].filter(Boolean).length > 0 ? `${fromRole || "?"} -> ${toRole || "?"}` : "";
  return [base, xp !== null ? `@xp>=${xp}` : "", manual, notes].filter(Boolean).join(" ");
}

export function buildAgentPromptPreview(params: {
  profile: AgentProfile | null | undefined;
  workflowProfile?: AgentWorkflowProfile | null;
  legacyPersonality?: string | null;
  locale?: string;
}): string {
  const { workflowProfile, legacyPersonality, locale } = params;
  const lang = normalizeLocale(locale);
  const normalized = normalizeAgentProfile(params.profile, params.profile?.role_template ?? "junior");
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
  const classPath = formatClassPath(normalized.class_path);
  const promotionPolicy = formatPromotionPolicy(normalized.promotion_policy);
  const workflowRoleLabel = workflowProfile ? getWorkflowRoleDisplayLabel(workflowProfile.role, locale) : "";
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
      `역할 템플릿: ${getRoleDisplayLabel(normalized.role_template, locale)}`,
      `적용 성장 티어: ${normalized.growth_tier}/5`,
      workflowRoleLabel ? `2x 역할: ${workflowRoleLabel}` : "",
      classPath ? `클래스 경로: ${classPath}` : "",
      promotionPolicy ? `승급 정책: ${promotionPolicy}` : "",
      `역량 매트릭스: ${capabilitySummary}`,
      `프롬프트 스타일: ${styleSummary}`,
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
    `Role template: ${getRoleDisplayLabel(normalized.role_template, locale)}`,
    `Applied growth tier: ${normalized.growth_tier}/5`,
    workflowRoleLabel ? `2x role: ${workflowRoleLabel}` : "",
    classPath ? `Class path: ${classPath}` : "",
    promotionPolicy ? `Promotion policy: ${promotionPolicy}` : "",
    `Capabilities: ${capabilitySummary}`,
    `Prompt style: ${styleSummary}`,
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
