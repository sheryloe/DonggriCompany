import type { Agent, CanonicalAgentFamily, CanonicalCareerStage, CanonicalIdentitySource } from "../../types";
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

function deriveFamily(departmentId: string, specializationKey: string): CanonicalAgentFamily {
  const normalizedDepartmentId = departmentId.trim().toLowerCase();
  const normalizedSpecialization = specializationKey.trim().toLowerCase();
  switch (normalizedDepartmentId) {
    case "development":
      return normalizedSpecialization.startsWith("frontend.") ? "frontend" : "backend";
    case "planning-architecture":
      return normalizedSpecialization.startsWith("system.") ? "architect" : "product-manager";
    case "ui-ux":
      return "frontend";
    case "cicd-repo":
      return normalizedSpecialization.startsWith("github.") ? "backend" : "orchestrator";
    case "management":
      return "memory-manager";
    case "pmo":
      return "orchestrator";
    case "qa":
      return "qa";
    case "bloggent":
      return normalizedSpecialization.startsWith("content.") ? "researcher" : "documenter";
    case "api-research":
      return normalizedSpecialization.startsWith("citation.") ? "documenter" : "researcher";
    case "security-approval":
      return normalizedSpecialization.startsWith("policy.") ? "qa" : "reviewer";
    case "knowledge-docs":
      return normalizedSpecialization.startsWith("decision.") ? "memory-manager" : "documenter";
    case "planning":
      return "product-manager";
    case "design":
      return "frontend";
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

function deriveAuthorityLevel(stage: CanonicalCareerStage): number {
  if (stage === "team-lead") return 7;
  if (stage === "senior") return 3;
  return 1;
}

function readExecutionCapabilityProfile(value: string): string {
  return value.trim();
}

export function resolveCanonicalIdentityFromForm(form: FormData): ResolvedCanonicalIdentity {
  const storedSpecializationKey = form.specialization_key.trim();
  const derivedFamily = deriveFamily(form.department_id, storedSpecializationKey);
  const derivedCareerStage = deriveCareerStage(form.role);
  const derivedAuthorityLevel = deriveAuthorityLevel(derivedCareerStage);
  const derivedExecutionCapabilityProfile =
    readExecutionCapabilityProfile(form.execution_capability_profile) || "reviewer";
  const storedFamily = CANONICAL_FAMILY_OPTIONS.includes(form.family) ? form.family : null;
  const storedCareerStage = CANONICAL_STAGE_OPTIONS.includes(form.career_stage) ? form.career_stage : null;
  const storedAuthorityLevel =
    Number.isFinite(form.authority_level) && form.authority_level > 0 ? Math.trunc(form.authority_level) : null;
  const storedExecutionCapabilityProfile = readExecutionCapabilityProfile(form.execution_capability_profile);
  const hasStoredCanonical =
    Boolean(storedFamily) ||
    Boolean(storedCareerStage) ||
    Boolean(storedSpecializationKey) ||
    Boolean(storedExecutionCapabilityProfile) ||
    storedAuthorityLevel !== null;

  return {
    family: form.canonical_identity_source === "stored" && storedFamily ? storedFamily : derivedFamily,
    career_stage:
      form.canonical_identity_source === "stored" && storedCareerStage ? storedCareerStage : derivedCareerStage,
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

export function hydrateCanonicalIdentityFields(
  agent?: Partial<Agent> | null,
): Pick<
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
