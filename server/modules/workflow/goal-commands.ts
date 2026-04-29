import type { WorkflowPackKey } from "./packs/definitions.ts";

export const GOAL_COMMAND_VERSION = "donggri_goal_commands_v1";

export const GOAL_COMMAND_KEYS = [
  "feature",
  "fix",
  "review",
  "debug",
  "refactor",
  "design",
  "research",
  "security",
  "docs",
  "release",
] as const;

export type GoalCommandKey = (typeof GOAL_COMMAND_KEYS)[number];

export type GoalCommandTaskType = "general" | "development" | "design" | "analysis" | "presentation" | "documentation";

export type GoalTeamPreset =
  | "full_delivery"
  | "bugfix_response"
  | "multi_review"
  | "incident_debug"
  | "refactor_lane"
  | "design_delivery"
  | "research_report"
  | "security_gate"
  | "documentation"
  | "release_gate";

export interface GoalCommandPreset {
  key: GoalCommandKey;
  slashCommand: `/dg-${string}`;
  workflowPackKey: WorkflowPackKey;
  teamPreset: GoalTeamPreset;
  departmentId: string;
  taskType: GoalCommandTaskType;
  priority: number;
  requiredDepartments: string[];
  maxParallelWorkstreams: number;
  verificationGates: string[];
  routingTags: string[];
}

export interface GoalCommandMeta {
  goal_command: GoalCommandKey;
  goal_command_version: typeof GOAL_COMMAND_VERSION;
  team_preset: GoalTeamPreset;
  route_source: "task_create_goal_chooser" | "slash_command_parser";
  routing_reason: "user_selected_goal" | "slash_command_detected";
  slash_command: GoalCommandPreset["slashCommand"];
  workflow_pack_key: WorkflowPackKey;
  department_id: string;
  task_type: GoalCommandTaskType;
  priority: number;
  required_departments: string[];
  max_parallel_workstreams: number;
  verification_gates: string[];
}

export interface GoalCommandResolution {
  preset: GoalCommandPreset | null;
  workflowMetaJson: string | null;
  workflowMeta: Record<string, unknown> | null;
  error: string | null;
}

export interface GoalCommandRuntimePolicy {
  preset: GoalCommandPreset;
  requiredDepartments: string[];
  maxParallelWorkstreams: number;
}

export const GOAL_COMMAND_PRESETS: readonly GoalCommandPreset[] = [
  {
    key: "feature",
    slashCommand: "/dg-feature",
    workflowPackKey: "development",
    teamPreset: "full_delivery",
    departmentId: "development",
    taskType: "development",
    priority: 4,
    requiredDepartments: ["pmo", "planning-architecture", "development", "ui-ux", "qa", "knowledge-docs"],
    maxParallelWorkstreams: 4,
    verificationGates: ["implementation_plan", "tests", "review", "handoff"],
    routingTags: ["build", "feature", "full-stack"],
  },
  {
    key: "fix",
    slashCommand: "/dg-fix",
    workflowPackKey: "development",
    teamPreset: "bugfix_response",
    departmentId: "development",
    taskType: "development",
    priority: 4,
    requiredDepartments: ["pmo", "development", "qa"],
    maxParallelWorkstreams: 3,
    verificationGates: ["reproduction", "root_cause", "fix", "regression_test"],
    routingTags: ["bug", "fix", "regression"],
  },
  {
    key: "review",
    slashCommand: "/dg-review",
    workflowPackKey: "development",
    teamPreset: "multi_review",
    departmentId: "qa",
    taskType: "analysis",
    priority: 3,
    requiredDepartments: ["pmo", "development", "qa", "security-approval"],
    maxParallelWorkstreams: 3,
    verificationGates: ["code_review", "risk_notes", "test_recommendations"],
    routingTags: ["review", "quality", "risk"],
  },
  {
    key: "debug",
    slashCommand: "/dg-debug",
    workflowPackKey: "development",
    teamPreset: "incident_debug",
    departmentId: "development",
    taskType: "development",
    priority: 5,
    requiredDepartments: ["pmo", "development", "qa", "operations"],
    maxParallelWorkstreams: 3,
    verificationGates: ["symptom", "logs", "root_cause", "fix_or_next_probe"],
    routingTags: ["debug", "incident", "diagnosis"],
  },
  {
    key: "refactor",
    slashCommand: "/dg-refactor",
    workflowPackKey: "development",
    teamPreset: "refactor_lane",
    departmentId: "development",
    taskType: "development",
    priority: 3,
    requiredDepartments: ["pmo", "development", "qa"],
    maxParallelWorkstreams: 3,
    verificationGates: ["behavior_preservation", "tests", "diff_review"],
    routingTags: ["refactor", "maintainability", "cleanup"],
  },
  {
    key: "design",
    slashCommand: "/dg-design",
    workflowPackKey: "donggri",
    teamPreset: "design_delivery",
    departmentId: "ui-ux",
    taskType: "design",
    priority: 3,
    requiredDepartments: ["pmo", "planning-architecture", "ui-ux", "development", "qa"],
    maxParallelWorkstreams: 3,
    verificationGates: ["user_flow", "visual_spec", "accessibility_notes"],
    routingTags: ["design", "ui", "ux"],
  },
  {
    key: "research",
    slashCommand: "/dg-research",
    workflowPackKey: "web_research_report",
    teamPreset: "research_report",
    departmentId: "api-research",
    taskType: "analysis",
    priority: 3,
    requiredDepartments: ["pmo", "api-research", "knowledge-docs"],
    maxParallelWorkstreams: 2,
    verificationGates: ["sources", "findings", "recommendations"],
    routingTags: ["research", "evidence", "report"],
  },
  {
    key: "security",
    slashCommand: "/dg-security",
    workflowPackKey: "development",
    teamPreset: "security_gate",
    departmentId: "security-approval",
    taskType: "analysis",
    priority: 5,
    requiredDepartments: ["pmo", "security-approval", "development", "qa"],
    maxParallelWorkstreams: 2,
    verificationGates: ["threat_model", "secret_check", "auth_check", "approval_result"],
    routingTags: ["security", "approval", "gate"],
  },
  {
    key: "docs",
    slashCommand: "/dg-docs",
    workflowPackKey: "report",
    teamPreset: "documentation",
    departmentId: "knowledge-docs",
    taskType: "documentation",
    priority: 2,
    requiredDepartments: ["pmo", "knowledge-docs"],
    maxParallelWorkstreams: 2,
    verificationGates: ["audience", "structure", "accuracy_check"],
    routingTags: ["docs", "report", "handoff"],
  },
  {
    key: "release",
    slashCommand: "/dg-release",
    workflowPackKey: "development",
    teamPreset: "release_gate",
    departmentId: "cicd-repo",
    taskType: "general",
    priority: 5,
    requiredDepartments: ["pmo", "cicd-repo", "qa", "security-approval", "knowledge-docs"],
    maxParallelWorkstreams: 3,
    verificationGates: ["git_status", "tests", "ci_readiness", "release_notes"],
    routingTags: ["release", "ci", "pr"],
  },
] as const;

const PRESET_BY_KEY = new Map(GOAL_COMMAND_PRESETS.map((preset) => [preset.key, preset]));
const PRESET_BY_SLASH = new Map(GOAL_COMMAND_PRESETS.map((preset) => [preset.slashCommand, preset]));
const DONGGRI_SLASH_COMMAND_PATTERN = /^\s*(\/dg-[a-z0-9-]+)\b/i;

function parseObjectWorkflowMeta(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function listGoalCommandPresets(): GoalCommandPreset[] {
  return GOAL_COMMAND_PRESETS.map((preset) => ({
    ...preset,
    requiredDepartments: [...preset.requiredDepartments],
    verificationGates: [...preset.verificationGates],
    routingTags: [...preset.routingTags],
  }));
}

export function findGoalCommandPreset(key: string | null | undefined): GoalCommandPreset | null {
  const normalized = String(key ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\/?dg-/, "");
  return PRESET_BY_KEY.get(normalized as GoalCommandKey) ?? null;
}

export function parseGoalCommandSlash(text: unknown): {
  slashCommand: string | null;
  preset: GoalCommandPreset | null;
  error: string | null;
} {
  if (typeof text !== "string" || !text.trim()) return { slashCommand: null, preset: null, error: null };
  const match = text.match(DONGGRI_SLASH_COMMAND_PATTERN);
  if (!match) return { slashCommand: null, preset: null, error: null };
  const slashCommand = match[1].toLowerCase();
  const preset = PRESET_BY_SLASH.get(slashCommand as GoalCommandPreset["slashCommand"]) ?? null;
  return {
    slashCommand,
    preset,
    error: preset ? null : "invalid_goal_command",
  };
}

export function resolveGoalCommandForTaskCreate(input: {
  title: unknown;
  description: unknown;
  workflowMeta: unknown;
}): GoalCommandResolution {
  const existingMeta = parseObjectWorkflowMeta(input.workflowMeta);
  const explicitGoal = typeof existingMeta?.goal_command === "string" ? existingMeta.goal_command : null;
  const explicitPreset = explicitGoal ? findGoalCommandPreset(explicitGoal) : null;
  if (explicitGoal && !explicitPreset) {
    return { preset: null, workflowMetaJson: null, workflowMeta: existingMeta, error: "invalid_goal_command" };
  }

  const titleSlash = parseGoalCommandSlash(input.title);
  if (titleSlash.error) return { preset: null, workflowMetaJson: null, workflowMeta: existingMeta, error: titleSlash.error };

  const descriptionSlash = parseGoalCommandSlash(input.description);
  if (descriptionSlash.error) {
    return { preset: null, workflowMetaJson: null, workflowMeta: existingMeta, error: descriptionSlash.error };
  }

  const slashPreset = titleSlash.preset ?? descriptionSlash.preset;
  if (explicitPreset && slashPreset && explicitPreset.key !== slashPreset.key) {
    return { preset: null, workflowMetaJson: null, workflowMeta: existingMeta, error: "goal_command_conflict" };
  }

  const preset = explicitPreset ?? slashPreset;
  if (!preset) return { preset: null, workflowMetaJson: null, workflowMeta: existingMeta, error: null };

  const routeSource = explicitPreset ? "task_create_goal_chooser" : "slash_command_parser";
  const routingReason = explicitPreset ? "user_selected_goal" : "slash_command_detected";
  const goalMeta: GoalCommandMeta = {
    goal_command: preset.key,
    goal_command_version: GOAL_COMMAND_VERSION,
    team_preset: preset.teamPreset,
    route_source: routeSource,
    routing_reason: routingReason,
    slash_command: preset.slashCommand,
    workflow_pack_key: preset.workflowPackKey,
    department_id: preset.departmentId,
    task_type: preset.taskType,
    priority: preset.priority,
    required_departments: [...preset.requiredDepartments],
    max_parallel_workstreams: preset.maxParallelWorkstreams,
    verification_gates: [...preset.verificationGates],
  };
  const merged = {
    ...(existingMeta ?? {}),
    ...goalMeta,
  };
  return {
    preset,
    workflowMetaJson: JSON.stringify(merged),
    workflowMeta: merged,
    error: null,
  };
}

export function buildGoalCommandPromptBlock(rawWorkflowMeta: unknown): string {
  const meta = parseObjectWorkflowMeta(rawWorkflowMeta);
  const preset = findGoalCommandPreset(typeof meta?.goal_command === "string" ? meta.goal_command : null);
  if (!preset) return "";
  const teamPreset = typeof meta?.team_preset === "string" ? meta.team_preset : preset.teamPreset;
  const routeSource = typeof meta?.route_source === "string" ? meta.route_source : "unknown";
  const routingReason = typeof meta?.routing_reason === "string" ? meta.routing_reason : "unknown";
  return [
    "[Goal Command Context]",
    `version=${GOAL_COMMAND_VERSION}`,
    `goal_command=${preset.key}`,
    `slash_command=${preset.slashCommand}`,
    `team_preset=${teamPreset}`,
    `workflow_pack_key=${preset.workflowPackKey}`,
    `department_id=${preset.departmentId}`,
    `task_type=${preset.taskType}`,
    `required_departments=${preset.requiredDepartments.join(",")}`,
    `max_parallel_workstreams=${preset.maxParallelWorkstreams}`,
    `route_source=${routeSource}`,
    `routing_reason=${routingReason}`,
    `verification_gates=${preset.verificationGates.join(",")}`,
    "Instruction: Use this goal command context to coordinate the work, select the right specialists, and produce evidence for every verification gate.",
    "Bottleneck rule: do not involve every department by default; use required_departments first and add extra departments only when a verification gate needs them.",
    "Parallelism rule: split independent work up to max_parallel_workstreams, but keep one clear owner per workstream.",
  ].join("\n");
}

export function resolveGoalCommandRuntimePolicy(rawWorkflowMeta: unknown): GoalCommandRuntimePolicy | null {
  const meta = parseObjectWorkflowMeta(rawWorkflowMeta);
  const preset = findGoalCommandPreset(typeof meta?.goal_command === "string" ? meta.goal_command : null);
  if (!preset) return null;
  const rawRequiredDepartments = Array.isArray(meta?.required_departments) ? meta.required_departments : null;
  const requiredDepartments = rawRequiredDepartments
    ? rawRequiredDepartments.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : preset.requiredDepartments;
  const rawParallel = Number(meta?.max_parallel_workstreams ?? preset.maxParallelWorkstreams);
  return {
    preset,
    requiredDepartments: requiredDepartments.length > 0 ? requiredDepartments : preset.requiredDepartments,
    maxParallelWorkstreams: Number.isFinite(rawParallel)
      ? Math.max(1, Math.min(8, Math.trunc(rawParallel)))
      : preset.maxParallelWorkstreams,
  };
}
