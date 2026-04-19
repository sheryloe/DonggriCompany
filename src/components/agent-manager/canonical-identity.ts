import type {
  Agent,
  CanonicalAgentFamily,
  CanonicalCareerStage,
  CanonicalIdentitySource,
} from "../../types";
import type { FormData } from "./types";

export const CANONICAL_FAMILY_OPTIONS: CanonicalAgentFamily[] = [
  "architect",
  "backend",
  "documenter",
  "frontend",
  "memory-manager",
  "orchestrator",
  "product-manager",
  "qa",
  "refactor",
  "researcher",
  "reviewer",
];

export const CANONICAL_STAGE_OPTIONS: CanonicalCareerStage[] = [
  "junior",
  "advancement-1",
  "senior",
  "advancement-2",
  "pro-senior",
  "advancement-3",
  "team-lead",
];

export interface ResolvedCanonicalIdentity {
  family: CanonicalAgentFamily;
  career_stage: CanonicalCareerStage;
  specialization_key: string;
  authority_level: number;
  execution_capability_profile: string;
  canonical_identity_source: CanonicalIdentitySource;
}

function deriveFamily(departmentId: string): CanonicalAgentFamily {
  switch (departmentId.trim().toLowerCase()) {
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

function deriveCareerStage(role: FormData["role"] | Agent["role"]): CanonicalCareerStage {
  if (role === "team_leader") return "team-lead";
  if (role === "senior") return "senior";
  return "junior";
}

function deriveAuthorityLevel(role: FormData["role"] | Agent["role"]): number {
  if (role === "team_leader") return 3;
  if (role === "senior") return 2;
  return 1;
}

function readExecutionCapabilityProfile(value: string): string {
  return value.trim();
}

export function resolveCanonicalIdentityFromForm(form: FormData): ResolvedCanonicalIdentity {
  const derivedFamily = deriveFamily(form.department_id);
  const derivedCareerStage = deriveCareerStage(form.role);
  const derivedAuthorityLevel = deriveAuthorityLevel(form.role);
  const derivedExecutionCapabilityProfile = readExecutionCapabilityProfile(form.execution_capability_profile) || "reviewer";
  const storedFamily = CANONICAL_FAMILY_OPTIONS.includes(form.family) ? form.family : null;
  const storedCareerStage = CANONICAL_STAGE_OPTIONS.includes(form.career_stage) ? form.career_stage : null;
  const storedAuthorityLevel =
    Number.isFinite(form.authority_level) && form.authority_level > 0 ? Math.trunc(form.authority_level) : null;
  const storedExecutionCapabilityProfile = readExecutionCapabilityProfile(form.execution_capability_profile);
  const storedSpecializationKey = form.specialization_key.trim();
  const hasStoredCanonical =
    Boolean(storedFamily) ||
    Boolean(storedCareerStage) ||
    Boolean(storedSpecializationKey) ||
    Boolean(storedExecutionCapabilityProfile) ||
    storedAuthorityLevel !== null;

  return {
    family: form.canonical_identity_source === "stored" && storedFamily ? storedFamily : derivedFamily,
    career_stage: form.canonical_identity_source === "stored" && storedCareerStage ? storedCareerStage : derivedCareerStage,
    specialization_key: storedSpecializationKey,
    authority_level:
      form.canonical_identity_source === "stored" && storedAuthorityLevel !== null
        ? storedAuthorityLevel
        : derivedAuthorityLevel,
    execution_capability_profile:
      (form.canonical_identity_source === "stored" ? storedExecutionCapabilityProfile : "") ||
      storedExecutionCapabilityProfile ||
      derivedExecutionCapabilityProfile,
    canonical_identity_source: hasStoredCanonical && form.canonical_identity_source === "stored" ? "stored" : "derived",
  };
}

export function hydrateCanonicalIdentityFields(agent?: Partial<Agent> | null): Pick<
  FormData,
  | "family"
  | "career_stage"
  | "specialization_key"
  | "authority_level"
  | "execution_capability_profile"
  | "canonical_identity_source"
> {
  return {
    family: (agent?.family as CanonicalAgentFamily | null) ?? "backend",
    career_stage: (agent?.career_stage as CanonicalCareerStage | null) ?? "junior",
    specialization_key: String(agent?.specialization_key ?? ""),
    authority_level: Number(agent?.authority_level ?? 1) || 1,
    execution_capability_profile: String(agent?.execution_capability_profile ?? ""),
    canonical_identity_source: (agent?.canonical_identity_source as CanonicalIdentitySource | null) ?? "derived",
  };
}
