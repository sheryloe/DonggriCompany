export type CanonicalFamilyKey =
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

export type CanonicalStageKey =
  | "junior"
  | "advancement-1"
  | "senior"
  | "advancement-2"
  | "pro-senior"
  | "advancement-3"
  | "team-lead";

export type CanonicalTierKey = "tier-1" | "tier-2" | "tier-3" | "tier-4";
export type CanonicalRuleMatchSource = "override" | "stage2" | "stage1" | "department";

export type CanonicalDiagnosticSeverity = "info" | "warning" | "error";

export interface CanonicalDiagnostic {
  code: string;
  severity: CanonicalDiagnosticSeverity;
  message: string;
  sourcePath?: string | null;
  details?: Record<string, unknown>;
}

export interface CanonicalFamily {
  key: CanonicalFamilyKey;
  sourcePath: string;
  systemPromptPath: string | null;
}

export interface CanonicalStage {
  key: CanonicalStageKey;
  sourcePath: string;
}

export interface CanonicalApprovalGate {
  id: string;
  summary: string;
  sourcePath: string;
}

export interface CanonicalRoutingRule {
  id: string;
  condition: string;
  family: CanonicalFamilyKey;
  summary: string;
  sourcePath: string;
}

export interface CanonicalModelTierRule {
  id: string;
  condition: string;
  tier: CanonicalTierKey;
  summary: string;
  sourcePath: string;
}

export interface CanonicalPackProfile {
  key: string;
  baseKey: string | null;
  derivedFrom: string | null;
  routingBias: string[];
  requiredArtifacts: string[];
  outputContract: string[];
  modelTierPreference: CanonicalTierKey;
  sourceLayer: "compiler";
}

export interface CanonicalReloadPolicy {
  strategy: "snapshot_pinning";
  inFlightBehavior: "pin_current_snapshot";
  reloadModes: Array<"dry-run" | "apply" | "rollback">;
  lastGoodAvailable: boolean;
}

export interface CanonicalCompanyPolicy {
  version: string;
  hash: string;
  compiledAt: string;
  sourceRoot: string;
  families: CanonicalFamily[];
  stages: CanonicalStage[];
  approvalGates: CanonicalApprovalGate[];
  routingRules: CanonicalRoutingRule[];
  modelTierRules: CanonicalModelTierRule[];
  packProfiles: CanonicalPackProfile[];
  reloadPolicy: CanonicalReloadPolicy;
  diagnostics: CanonicalDiagnostic[];
}

export interface CanonicalSpecialization {
  key: string;
  description: string;
  family: CanonicalFamilyKey;
  department: string;
  classStageTree: {
    stage1?: string;
    stage2?: string;
    stage3?: string;
  };
  upstreamMetadata: {
    upstreamCategory: string;
    upstreamPath: string;
  };
  resolution: {
    matchedBy: CanonicalRuleMatchSource;
    ruleKey: string;
  };
}

export interface CanonicalSpecializationRegistry {
  version: string;
  hash: string;
  generatedAt: string;
  sourceRepo: string;
  sourceRef: string;
  sourceUrl: string;
  total: number;
  familyAssignments: Record<string, number>;
  stageClassTree: {
    stage1: string[];
    stage2: string[];
    stage3: string[];
  };
  specializations: CanonicalSpecialization[];
  diagnostics: CanonicalDiagnostic[];
}

export type ProjectArtifactKey = "STATUS" | "KANBAN" | "GANTT" | "NEXT_ACTIONS" | "DAILY";

export interface ProjectArtifactManifest {
  schemaVersion: number;
  artifactLayoutVersion: number;
  policyVersion: string;
  packProfile: string;
  projectionVersion: string;
  migrationPhase: "canonical";
  lastValidatedAt: string;
  lastGoodSnapshotHash: string | null;
  lastPatchedBy: string | null;
}

export interface ProjectArtifactDocumentState {
  key: ProjectArtifactKey;
  format: "markdown" | "yaml";
  headings: string[];
  listItems: string[];
  keyValues: Record<string, string>;
  body: string;
}

export interface CanonicalProjectArtifactState {
  projectId: string | null;
  projectPath: string;
  manifestPath: string;
  artifactPaths: Record<ProjectArtifactKey, string>;
  artifactHealth: Record<
    ProjectArtifactKey,
    {
      exists: boolean;
      parseOk: boolean;
      blocking: boolean;
      size: number;
      updatedAt: string | null;
    }
  >;
  parsedState: {
    manifest: ProjectArtifactManifest | null;
    documents: Partial<Record<ProjectArtifactKey, ProjectArtifactDocumentState>>;
  };
  projectionVersion: string;
  validation: CanonicalDiagnostic[];
}

export interface ResolvedExecutionPolicy {
  policyVersion: string;
  policySnapshotHash: string | null;
  snapshotScope: "current" | "pinned";
  family: CanonicalFamilyKey;
  stage: CanonicalStageKey;
  specialization: string | null;
  provider: string;
  model: string | null;
  reasoningLevel: string | null;
  subProvider: string | null;
  subModel: string | null;
  subReasoningLevel: string | null;
  requiredArtifacts: string[];
  approvalGates: string[];
  explanation: string[];
  selectedBy: string[];
  blockedBy: string[];
  whyNot: Array<{ candidate: string; reason: string }>;
  tier: CanonicalTierKey;
}

export interface CanonicalSnapshot {
  policy: CanonicalCompanyPolicy;
  registry: CanonicalSpecializationRegistry;
  diagnostics: CanonicalDiagnostic[];
  sourcePaths: string[];
}

export interface CanonicalReloadResult {
  mode: "dry-run" | "apply" | "rollback";
  ok: boolean;
  applied: boolean;
  snapshot: CanonicalSnapshot | null;
  diagnostics: CanonicalDiagnostic[];
  restoredFromLastGood: boolean;
  currentVersion?: string | null;
  targetVersion?: string | null;
}
