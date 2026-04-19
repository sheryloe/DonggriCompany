export type CanonicalAgentFamily =
  | "architect"
  | "backend"
  | "documenter"
  | "frontend"
  | "memory-manager"
  | "orchestrator"
  | "product-manager"
  | "qa"
  | "refactor"
  | "researcher"
  | "reviewer";

export type CanonicalCareerStage =
  | "junior"
  | "advancement-1"
  | "senior"
  | "advancement-2"
  | "pro-senior"
  | "advancement-3"
  | "team-lead";

export type CanonicalIdentitySource = "stored" | "derived";

export interface CanonicalIdentity {
  family: CanonicalAgentFamily;
  career_stage: CanonicalCareerStage;
  specialization_key: string | null;
  authority_level: number;
  execution_capability_profile: string | null;
  canonical_identity_source: CanonicalIdentitySource;
}

interface ResolveCanonicalIdentityInput {
  department_id?: unknown;
  role?: unknown;
  family?: unknown;
  career_stage?: unknown;
  specialization_key?: unknown;
  authority_level?: unknown;
  execution_capability_profile?: unknown;
  workflow_profile?: unknown;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeAuthorityLevel(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  }
  return null;
}

const CANONICAL_STAGE_RANK: Record<CanonicalCareerStage, number> = {
  junior: 1,
  "advancement-1": 2,
  senior: 3,
  "advancement-2": 4,
  "pro-senior": 5,
  "advancement-3": 6,
  "team-lead": 7,
};

export function deriveFamilyFromDepartment(departmentId: string | null): CanonicalAgentFamily {
  switch ((departmentId ?? "").toLowerCase()) {
    case "planning":
      return "orchestrator";
    case "design":
      return "frontend";
    case "qa":
      return "qa";
    case "devsecops":
      return "reviewer";
    case "operations":
      return "memory-manager";
    default:
      return "backend";
  }
}

function deriveCareerStageFromFamily(family: CanonicalAgentFamily): CanonicalCareerStage {
  if (family === "orchestrator") return "team-lead";
  if (family === "reviewer" || family === "qa") return "senior";
  return "junior";
}

export function getCanonicalStageRank(stage: CanonicalCareerStage | null | undefined): number {
  if (!stage) return 0;
  return CANONICAL_STAGE_RANK[stage] ?? 0;
}

function readWorkflowCapabilityProfile(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as { role?: unknown };
      const role = normalizeText(parsed?.role);
      return role ?? trimmed;
    } catch {
      return trimmed;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const role = normalizeText((value as { role?: unknown }).role);
    return role;
  }
  return null;
}

export function resolveCanonicalIdentity(input: ResolveCanonicalIdentityInput): CanonicalIdentity {
  const departmentId = normalizeText(input.department_id);
  const derivedFamily = deriveFamilyFromDepartment(departmentId);
  const derivedCareerStage = deriveCareerStageFromFamily(derivedFamily);
  const derivedAuthority = CANONICAL_STAGE_RANK[derivedCareerStage] ?? 1;
  const derivedExecutionCapability = readWorkflowCapabilityProfile(input.workflow_profile);

  const storedFamily = normalizeText(input.family) as CanonicalAgentFamily | null;
  const storedCareerStage = normalizeText(input.career_stage) as CanonicalCareerStage | null;
  const storedSpecialization = normalizeText(input.specialization_key);
  const storedAuthorityLevel = normalizeAuthorityLevel(input.authority_level);
  const storedExecutionCapability = normalizeText(input.execution_capability_profile);

  const hasStoredCanonical =
    storedFamily !== null ||
    storedCareerStage !== null ||
    storedSpecialization !== null ||
    storedAuthorityLevel !== null ||
    storedExecutionCapability !== null;

  return {
    family: storedFamily ?? derivedFamily,
    career_stage: storedCareerStage ?? derivedCareerStage,
    specialization_key: storedSpecialization ?? null,
    authority_level: storedAuthorityLevel ?? derivedAuthority,
    execution_capability_profile: storedExecutionCapability ?? derivedExecutionCapability ?? null,
    canonical_identity_source: hasStoredCanonical ? "stored" : "derived",
  };
}
