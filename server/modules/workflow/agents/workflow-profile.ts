export type AgentWorkflowRole = "primary_author" | "reviewer";

export interface AgentWorkflowProfile {
  role: AgentWorkflowRole;
  review_lenses: string[];
  two_pass_required: boolean;
  max_review_rounds: number | null;
}

type ResolveAgentWorkflowProfileInput = {
  workflowProfileRaw: unknown;
  agentName?: unknown;
  cliProvider?: unknown;
  departmentId?: unknown;
};

const DEFAULT_REVIEW_LENSES_BY_DEPARTMENT: Record<string, string[]> = {
  planning: ["scope", "risk", "priority"],
  dev: ["correctness", "architecture", "maintainability"],
  design: ["ux", "consistency", "a11y"],
  qa: ["test_coverage", "regression", "reliability"],
  devsecops: ["security", "compliance", "operability"],
  operations: ["deployability", "monitoring", "incident_readiness"],
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeRole(value: unknown): AgentWorkflowRole | null {
  const raw = normalizeText(value).toLowerCase();
  if (raw === "primary_author") return "primary_author";
  if (raw === "reviewer") return "reviewer";
  return null;
}

function normalizeReviewLenses(value: unknown, fallbackDepartmentId?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const pushLens = (raw: unknown) => {
    const normalized = normalizeText(raw)
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  if (Array.isArray(value)) {
    for (const lens of value) pushLens(lens);
  } else if (typeof value === "string") {
    for (const part of value.split(/[,\n]/g)) pushLens(part);
  }

  if (out.length > 0) return out.slice(0, 8);
  const fallback = DEFAULT_REVIEW_LENSES_BY_DEPARTMENT[normalizeText(fallbackDepartmentId).toLowerCase()] ?? [
    "general_quality",
  ];
  for (const lens of fallback) pushLens(lens);
  return out.slice(0, 8);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function normalizeMaxReviewRounds(value: unknown, fallback: number | null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.trunc(parsed);
  if (rounded <= 0) return fallback;
  return Math.min(rounded, 2);
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function isJulesAgent(agentName: unknown, cliProvider: unknown): boolean {
  const provider = normalizeText(cliProvider).toLowerCase();
  if (provider === "jules") return true;
  const name = normalizeText(agentName).toLowerCase();
  return name === "jules";
}

export function resolveAgentWorkflowProfile(input: ResolveAgentWorkflowProfileInput): AgentWorkflowProfile {
  const rawObject = parseJsonObject(input.workflowProfileRaw);
  const defaultRole: AgentWorkflowRole = isJulesAgent(input.agentName, input.cliProvider) ? "primary_author" : "reviewer";
  const role = normalizeRole(rawObject?.role) ?? defaultRole;
  const twoPassRequired = normalizeBoolean(rawObject?.two_pass_required, true);
  const maxReviewRounds = normalizeMaxReviewRounds(rawObject?.max_review_rounds, role === "primary_author" ? 2 : null);

  return {
    role,
    review_lenses: normalizeReviewLenses(rawObject?.review_lenses, normalizeText(input.departmentId).toLowerCase()),
    two_pass_required: twoPassRequired,
    max_review_rounds: role === "primary_author" ? 2 : maxReviewRounds,
  };
}

export function parseWorkflowProfilePayload(value: unknown): AgentWorkflowProfile | null | "__invalid__" {
  if (value === undefined) return null;
  if (value === null || value === "") return null;
  const objectValue = parseJsonObject(value);
  if (!objectValue) return "__invalid__";
  const role = normalizeRole(objectValue.role);
  if (!role) return "__invalid__";
  return {
    role,
    review_lenses: normalizeReviewLenses(objectValue.review_lenses, ""),
    two_pass_required: normalizeBoolean(objectValue.two_pass_required, true),
    max_review_rounds:
      role === "primary_author"
        ? 2
        : normalizeMaxReviewRounds(objectValue.max_review_rounds, null),
  };
}

export function serializeWorkflowProfile(profile: AgentWorkflowProfile | null): string | null {
  if (!profile) return null;
  return JSON.stringify(profile);
}

export function isPrimaryAuthorProfile(profile: AgentWorkflowProfile | null | undefined): boolean {
  return Boolean(profile && profile.role === "primary_author");
}
