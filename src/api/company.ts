import { post, request } from "./core";
import type { Project } from "../types";

export interface CanonicalDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  sourcePath?: string | null;
  details?: Record<string, unknown>;
}

export interface CanonicalPolicyResponse {
  currentVersion: string;
  policy: {
    version: string;
    hash: string;
    compiledAt: string;
    sourceRoot: string;
    families: Array<{ key: string; sourcePath: string; systemPromptPath: string | null }>;
    stages: Array<{ key: string; sourcePath: string }>;
    approvalGates: Array<{ id: string; summary: string; sourcePath: string }>;
    routingRules: Array<{ id: string; condition: string; family: string; summary: string; sourcePath: string }>;
    modelTierRules: Array<{ id: string; condition: string; tier: string; summary: string; sourcePath: string }>;
    packProfiles: Array<{
      key: string;
      baseKey: string | null;
      derivedFrom: string | null;
      routingBias: string[];
      requiredArtifacts: string[];
      outputContract: string[];
      modelTierPreference: string;
      sourceLayer: "compiler";
    }>;
    reloadPolicy: {
      strategy: string;
      inFlightBehavior: string;
      reloadModes: string[];
      lastGoodAvailable: boolean;
    };
    diagnostics: CanonicalDiagnostic[];
  };
  diagnostics: CanonicalDiagnostic[];
}

export interface CanonicalRegistryResponse {
  registry: {
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
    specializations: Array<{
      key: string;
      description: string;
      family: string;
      department: string;
      classStageTree: {
        stage1?: string;
        stage2?: string;
        stage3?: string;
      };
      resolution: {
        matchedBy: string;
        ruleKey: string;
      };
    }>;
    diagnostics: CanonicalDiagnostic[];
  };
  diagnostics: CanonicalDiagnostic[];
}

export interface CanonicalReloadResponse {
  mode: "dry-run" | "apply" | "rollback";
  ok: boolean;
  applied: boolean;
  restoredFromLastGood: boolean;
  diagnostics: CanonicalDiagnostic[];
  snapshot: {
    policy: CanonicalPolicyResponse["policy"];
    registry: CanonicalRegistryResponse["registry"];
    diagnostics: CanonicalDiagnostic[];
    sourcePaths: string[];
  } | null;
  currentVersion?: string | null;
  targetVersion?: string | null;
}

export interface CanonicalRoutingPreviewResponse {
  policy: {
    policyVersion: string;
    policySnapshotHash: string | null;
    snapshotScope: "current" | "pinned";
    family: string;
    stage: string;
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
    tier: string;
  };
  snapshot_scope?: "current" | "pinned";
  currentVersion?: string;
  selectedBy?: string[];
  blockedBy?: string[];
  whyNot?: Array<{ candidate: string; reason: string }>;
  snapshotScope?: "current" | "pinned";
  policyVersion?: string;
}

export interface ProjectArtifactStateResponse {
  state: {
    projectId: string | null;
    projectPath: string;
    manifestPath: string;
    artifactPaths: Record<string, string>;
    artifactHealth: Record<
      string,
      {
        exists: boolean;
        parseOk: boolean;
        blocking: boolean;
        size: number;
        updatedAt: string | null;
      }
    >;
    parsedState: {
      manifest: {
        schemaVersion: number;
        artifactLayoutVersion: number;
        policyVersion: string;
        packProfile: string;
        projectionVersion: string;
        migrationPhase: string;
        lastValidatedAt: string;
        lastGoodSnapshotHash: string | null;
        lastPatchedBy: string | null;
      } | null;
      documents: Partial<
        Record<
          string,
          {
            key: string;
            format: "markdown" | "yaml";
            headings: string[];
            listItems: string[];
            keyValues: Record<string, string>;
            body: string;
          }
        >
      >;
    };
    projectionVersion: string;
    validation: CanonicalDiagnostic[];
  };
}

export async function getCanonicalCompanyPolicy(): Promise<CanonicalPolicyResponse> {
  return request<CanonicalPolicyResponse>("/api/company/canonical-policy");
}

export async function getCanonicalSpecializationRegistry(): Promise<CanonicalRegistryResponse> {
  return request<CanonicalRegistryResponse>("/api/company/specialization-registry");
}

export async function reloadCanonicalRules(
  mode: "dry-run" | "apply" | "rollback",
  targetVersion?: string | null,
): Promise<CanonicalReloadResponse> {
  return post<CanonicalReloadResponse>("/api/company/reload-canonical-rules", {
    mode,
    ...(targetVersion ? { target_version: targetVersion } : {}),
  });
}

export async function previewCanonicalRouting(input: {
  text: string;
  project_id?: string;
  project_path?: string;
  workflow_pack_key?: string;
}): Promise<CanonicalRoutingPreviewResponse> {
  return post<CanonicalRoutingPreviewResponse>("/api/company/routing/preview", input);
}

export async function getProjectArtifactState(projectId: Project["id"]): Promise<ProjectArtifactStateResponse> {
  return request<ProjectArtifactStateResponse>(`/api/projects/${encodeURIComponent(projectId)}/artifact-state`);
}

export async function bootstrapProjectArtifacts(projectId: Project["id"]): Promise<ProjectArtifactStateResponse> {
  return post<ProjectArtifactStateResponse>(`/api/projects/${encodeURIComponent(projectId)}/artifact-bootstrap`);
}

export async function applyProjectArtifacts(
  projectId: Project["id"],
  input: {
    actor: string;
    note?: string;
    packProfile?: string;
    policyVersion?: string;
    task?: {
      id?: string | null;
      title?: string | null;
      status?: string | null;
      priority?: number | null;
      taskType?: string | null;
    } | null;
  },
): Promise<ProjectArtifactStateResponse> {
  return post<ProjectArtifactStateResponse>(`/api/projects/${encodeURIComponent(projectId)}/artifact-apply`, input);
}
