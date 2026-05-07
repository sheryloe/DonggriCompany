import type { AgentWorkflowProfile } from "./workflow-profile.ts";

export type AgentRoleTemplate = "team_leader" | "senior" | "junior" | "intern";
export type AgentLevelValue = 1 | 2 | 3 | 4 | 5;

export interface AgentCapabilityMatrix {
  execution: AgentLevelValue;
  architecture: AgentLevelValue;
  review: AgentLevelValue;
  research: AgentLevelValue;
  communication: AgentLevelValue;
  leadership: AgentLevelValue;
}

export interface AgentPromptStyle {
  tone: AgentLevelValue;
  autonomy: AgentLevelValue;
  strictness: AgentLevelValue;
  collaboration: AgentLevelValue;
}

export interface AgentClassPath {
  stage1?: string | null;
  stage2?: string | null;
  stage3?: string | null;
  class_stage_1?: string | null;
  class_stage_2?: string | null;
  class_stage_3?: string | null;
}

export interface AgentPromotionPolicy {
  auto_promote_at_xp?: number;
  team_leader_manual?: boolean;
  notes?: string;
}

export interface AgentProfile {
  role_template: AgentRoleTemplate;
  growth_tier: AgentLevelValue;
  capabilities: AgentCapabilityMatrix;
  prompt_style: AgentPromptStyle;
  specialties: string[];
  custom_prompt_override: string | null;
  class_path?: AgentClassPath | string | string[] | null;
  promotion_policy?: AgentPromotionPolicy | string | null;
  visual_profile_key?: string | null;
  preferred_subagents?: string[];
}

const PROFILE_PRESETS: Record<AgentRoleTemplate, AgentProfile> = {
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
    class_path: null,
    promotion_policy: null,
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
    class_path: null,
    promotion_policy: null,
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
    class_path: null,
    promotion_policy: null,
  },
  intern: {
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
    class_path: null,
    promotion_policy: null,
  },
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRoleTemplate(value: unknown, fallback: AgentRoleTemplate): AgentRoleTemplate {
  const raw = normalizeText(value);
  if (raw === "team_leader" || raw === "senior" || raw === "junior") return raw;
  if (raw === "intern") return "junior";
  return fallback;
}

function normalizeLevel(value: unknown, fallback: AgentLevelValue): AgentLevelValue {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const next = Math.max(1, Math.min(5, Math.trunc(parsed)));
  return next as AgentLevelValue;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeClassPath(value: unknown): AgentProfile["class_path"] {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const list = value.map((entry) => normalizeText(entry)).filter((entry) => entry.length > 0);
    return list.length > 0 ? list : null;
  }
  if (typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const output: AgentClassPath = {};
  for (const key of ["stage1", "stage2", "stage3", "class_stage_1", "class_stage_2", "class_stage_3"] as const) {
    const text = normalizeText(source[key]);
    if (text) output[key] = text;
  }
  return Object.keys(output).length > 0 ? output : null;
}

function normalizePromotionPolicy(value: unknown): AgentProfile["promotion_policy"] {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const output: AgentPromotionPolicy = {};
  if (Number.isFinite(Number(source.auto_promote_at_xp))) {
    output.auto_promote_at_xp = Number(source.auto_promote_at_xp);
  }
  if (typeof source.team_leader_manual === "boolean") {
    output.team_leader_manual = source.team_leader_manual;
  }
  const notes = normalizeText(source.notes);
  if (notes) output.notes = notes;
  return Object.keys(output).length > 0 ? output : null;
}

function normalizeSpecialties(value: unknown, fallback: string[] = []): string[] {
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/g) : fallback;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of rawValues) {
    const text = normalizeText(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeStringList(value: unknown, fallback: string[] = []): string[] {
  return normalizeSpecialties(value, fallback);
}

function normalizeCapabilities(value: unknown, fallback: AgentCapabilityMatrix): AgentCapabilityMatrix {
  const source = parseJsonObject(value) ?? {};
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
  const source = parseJsonObject(value) ?? {};
  return {
    tone: normalizeLevel(source.tone, fallback.tone),
    autonomy: normalizeLevel(source.autonomy, fallback.autonomy),
    strictness: normalizeLevel(source.strictness, fallback.strictness),
    collaboration: normalizeLevel(source.collaboration, fallback.collaboration),
  };
}

function levelWord(level: AgentLevelValue): string {
  if (level <= 1) return "very_low";
  if (level === 2) return "low";
  if (level === 3) return "medium";
  if (level === 4) return "high";
  return "expert";
}

function toneWord(level: AgentLevelValue): string {
  if (level <= 1) return "minimal";
  if (level === 2) return "direct";
  if (level === 3) return "balanced";
  if (level === 4) return "polished";
  return "coaching";
}

function autonomyWord(level: AgentLevelValue): string {
  if (level <= 1) return "needs explicit direction";
  if (level === 2) return "low autonomy";
  if (level === 3) return "moderate autonomy";
  if (level === 4) return "high autonomy";
  return "decision-leading autonomy";
}

function strictnessWord(level: AgentLevelValue): string {
  if (level <= 1) return "flexible";
  if (level === 2) return "light guardrails";
  if (level === 3) return "balanced guardrails";
  if (level === 4) return "rigorous";
  return "very rigorous";
}

function collaborationWord(level: AgentLevelValue): string {
  if (level <= 1) return "mostly solo";
  if (level === 2) return "light coordination";
  if (level === 3) return "team-aware";
  if (level === 4) return "actively collaborative";
  return "mentor-and-coordinate";
}

export function createPresetAgentProfile(role: AgentRoleTemplate): AgentProfile {
  const normalizedRole = normalizeRoleTemplate(role, "junior");
  return JSON.parse(JSON.stringify(PROFILE_PRESETS[normalizedRole])) as AgentProfile;
}

export function normalizeAgentProfile(value: unknown, fallbackRole: AgentRoleTemplate = "junior"): AgentProfile {
  const source = parseJsonObject(value) ?? {};
  const roleTemplate = normalizeRoleTemplate(source.role_template, normalizeRoleTemplate(fallbackRole, "junior"));
  const preset = createPresetAgentProfile(roleTemplate);
  return {
    role_template: roleTemplate,
    growth_tier: normalizeLevel(source.growth_tier, preset.growth_tier),
    capabilities: normalizeCapabilities(source.capabilities, preset.capabilities),
    prompt_style: normalizePromptStyle(source.prompt_style, preset.prompt_style),
    specialties: normalizeSpecialties(source.specialties, preset.specialties),
    custom_prompt_override: normalizeText(source.custom_prompt_override) || null,
    class_path: normalizeClassPath(source.class_path),
    promotion_policy: normalizePromotionPolicy(source.promotion_policy),
    visual_profile_key: normalizeText(source.visual_profile_key) || null,
    preferred_subagents: normalizeStringList(source.preferred_subagents),
  };
}

export function serializeAgentProfile(profile: AgentProfile | null): string | null {
  if (!profile) return null;
  return JSON.stringify(profile);
}

export function recommendGrowthTierFromXp(xp: number | null | undefined): AgentLevelValue {
  const value = Number(xp ?? 0);
  if (!Number.isFinite(value) || value < 100) return 1;
  if (value < 250) return 2;
  if (value < 500) return 3;
  if (value < 900) return 4;
  return 5;
}

type ResolveAgentProfileFromRowInput = {
  role?: unknown;
  agent_profile?: unknown;
  agent_profile_json?: unknown;
};

export function resolveAgentProfileFromRow(input: ResolveAgentProfileFromRowInput): AgentProfile {
  const fallbackRole = normalizeRoleTemplate(input.role, "junior");
  return normalizeAgentProfile(input.agent_profile ?? input.agent_profile_json, fallbackRole);
}

export function buildAgentPromptProfileBlock(input: {
  role?: unknown;
  agent_profile?: unknown;
  agent_profile_json?: unknown;
  personality?: unknown;
  workflow_profile?: unknown;
}): string {
  const profile = resolveAgentProfileFromRow(input);
  const legacyPersonality = normalizeText(input.personality);
  const workflowProfile = parseJsonObject(input.workflow_profile) as AgentWorkflowProfile | null;
  const capabilitySummary = [
    `execution=${levelWord(profile.capabilities.execution)}(${profile.capabilities.execution})`,
    `architecture=${levelWord(profile.capabilities.architecture)}(${profile.capabilities.architecture})`,
    `review=${levelWord(profile.capabilities.review)}(${profile.capabilities.review})`,
    `research=${levelWord(profile.capabilities.research)}(${profile.capabilities.research})`,
    `communication=${levelWord(profile.capabilities.communication)}(${profile.capabilities.communication})`,
    `leadership=${levelWord(profile.capabilities.leadership)}(${profile.capabilities.leadership})`,
  ].join(", ");
  const styleSummary = [
    `tone=${toneWord(profile.prompt_style.tone)}(${profile.prompt_style.tone})`,
    `autonomy=${autonomyWord(profile.prompt_style.autonomy)}(${profile.prompt_style.autonomy})`,
    `strictness=${strictnessWord(profile.prompt_style.strictness)}(${profile.prompt_style.strictness})`,
    `collaboration=${collaborationWord(profile.prompt_style.collaboration)}(${profile.prompt_style.collaboration})`,
  ].join(", ");
  const specialties = profile.specialties.join(", ");
  const preferredSubagents = (profile.preferred_subagents ?? []).join(", ");
  const reviewLenses = Array.isArray(workflowProfile?.review_lenses)
    ? workflowProfile?.review_lenses.filter((value) => normalizeText(value).length > 0).join(", ")
    : "";
  const workflowRole =
    workflowProfile?.role === "primary_author"
      ? "primary_author"
      : workflowProfile?.role === "reviewer"
        ? "reviewer"
        : "";
  const reviewDepth =
    workflowProfile?.role === "reviewer"
      ? workflowProfile.two_pass_required === false
        ? "single_pass"
        : "force_2_pass"
      : "";
  const classPathText = (() => {
    const value = profile.class_path;
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join(" > ");
    const stage1 = normalizeText(value.stage1 ?? value.class_stage_1);
    const stage2 = normalizeText(value.stage2 ?? value.class_stage_2);
    const stage3 = normalizeText(value.stage3 ?? value.class_stage_3);
    return [stage1, stage2, stage3].filter(Boolean).join(" > ");
  })();
  const promotionPolicyText = (() => {
    const value = profile.promotion_policy;
    if (!value) return "";
    if (typeof value === "string") return value;
    const atXp = Number.isFinite(Number(value.auto_promote_at_xp)) ? Number(value.auto_promote_at_xp) : null;
    const teamLeaderManual = value.team_leader_manual === true ? "team_leader_manual" : "";
    const xpPart = atXp !== null ? `@xp>=${atXp}` : "";
    const notePart = normalizeText(value.notes);
    return [xpPart, teamLeaderManual, notePart].filter(Boolean).join(" ");
  })();
  const overrideText = normalizeText(profile.custom_prompt_override) || legacyPersonality;

  return [
    "[Agent Growth Profile]",
    `- Role template: ${profile.role_template}`,
    `- Applied growth tier: ${profile.growth_tier}/5`,
    workflowRole ? `- 2x workflow role: ${workflowRole}` : "",
    classPathText ? `- Class path: ${classPathText}` : "",
    promotionPolicyText ? `- Promotion policy: ${promotionPolicyText}` : "",
    `- Capability matrix: ${capabilitySummary}`,
    `- Working style: ${styleSummary}`,
    specialties ? `- Specialties: ${specialties}` : "",
    preferredSubagents ? `- Preferred subagents: ${preferredSubagents}` : "",
    reviewLenses ? `- Review lenses to emphasize: ${reviewLenses}` : "",
    reviewDepth ? `- Review depth: ${reviewDepth}` : "",
    workflowProfile?.role === "primary_author" && workflowProfile.max_review_rounds
      ? `- Max review rounds: ${workflowProfile.max_review_rounds}`
      : "",
    overrideText ? `- Custom override (highest priority): ${overrideText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
