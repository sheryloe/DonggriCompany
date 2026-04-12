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

export interface AgentProfile {
  role_template: AgentRoleTemplate;
  growth_tier: AgentLevelValue;
  capabilities: AgentCapabilityMatrix;
  prompt_style: AgentPromptStyle;
  specialties: string[];
  custom_prompt_override: string | null;
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

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRoleTemplate(value: unknown, fallback: AgentRoleTemplate): AgentRoleTemplate {
  const raw = normalizeText(value);
  if (raw === "team_leader" || raw === "senior" || raw === "junior" || raw === "intern") return raw;
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

function normalizeSpecialties(value: unknown, fallback: string[] = []): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/g)
      : fallback;
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
  return JSON.parse(JSON.stringify(PROFILE_PRESETS[role])) as AgentProfile;
}

export function normalizeAgentProfile(
  value: unknown,
  fallbackRole: AgentRoleTemplate = "junior",
): AgentProfile {
  const source = parseJsonObject(value) ?? {};
  const roleTemplate = normalizeRoleTemplate(source.role_template, fallbackRole);
  const preset = createPresetAgentProfile(roleTemplate);
  return {
    role_template: roleTemplate,
    growth_tier: normalizeLevel(source.growth_tier, preset.growth_tier),
    capabilities: normalizeCapabilities(source.capabilities, preset.capabilities),
    prompt_style: normalizePromptStyle(source.prompt_style, preset.prompt_style),
    specialties: normalizeSpecialties(source.specialties, preset.specialties),
    custom_prompt_override: normalizeText(source.custom_prompt_override) || null,
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
  const overrideText = normalizeText(profile.custom_prompt_override) || legacyPersonality;

  return [
    "[Agent Growth Profile]",
    `- Role template: ${profile.role_template}`,
    `- Applied growth tier: ${profile.growth_tier}/5`,
    workflowRole ? `- 2x workflow role: ${workflowRole}` : "",
    `- Capability matrix: ${capabilitySummary}`,
    `- Working style: ${styleSummary}`,
    specialties ? `- Specialties: ${specialties}` : "",
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
