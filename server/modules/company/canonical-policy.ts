import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { CANONICAL_PACK_SOURCES, type CanonicalPackSource } from "../workflow/packs/canonical-profiles.ts";
import {
  type CanonicalApprovalGate,
  type CanonicalCompanyPolicy,
  type CanonicalDiagnostic,
  type CanonicalFamily,
  type CanonicalFamilyKey,
  type CanonicalModelTierRule,
  type CanonicalPackProfile,
  type CanonicalReloadResult,
  type CanonicalSnapshot,
  type CanonicalSpecialization,
  type CanonicalSpecializationRegistry,
  type CanonicalStage,
  type CanonicalStageKey,
  type CanonicalTierKey,
  type CanonicalRoutingRule,
  type ResolvedExecutionPolicy,
} from "./types.ts";
import { inspectProjectArtifacts } from "./project-artifacts.ts";

type ProviderModelConfig = {
  model?: string;
  subModel?: string;
  reasoningLevel?: string;
  subModelReasoningLevel?: string;
};

type WorkflowPackKey = string;

type CatalogAgent = {
  name: string;
  description: string;
  upstreamCategory: string;
  upstreamPath: string;
  department: string;
  class_stage_1?: string;
  class_stage_2?: string;
  class_stage_3?: string;
};

type CatalogSnapshot = {
  sourceRepo: string;
  sourceRef: string;
  sourceUrl: string;
  generatedAt: string;
  total: number;
  agents: CatalogAgent[];
};

type FamilyMapRules = {
  version: number;
  departmentDefaults: Record<string, CanonicalFamilyKey>;
  stage1Defaults: Record<string, CanonicalFamilyKey>;
  stage2Defaults: Record<string, CanonicalFamilyKey>;
  agentOverrides: Record<string, CanonicalFamilyKey>;
};

const ROOT_DIR = process.cwd();
const CANONICAL_SOURCE_ROOT = path.join(ROOT_DIR, "restructing", "autonomous-coding-company-release-pack", ".ai");
const CANONICAL_AGENTS_MD = path.join(ROOT_DIR, "AGENTS.md");
const LEGACY_CANONICAL_AGENTS_MD = path.join(
  ROOT_DIR,
  "restructing",
  "autonomous-coding-company-release-pack",
  "AGENTS.md",
);
const SUBAGENTS_ROOT = path.join(CANONICAL_SOURCE_ROOT, "subagents");
const ROUTING_ROOT = path.join(CANONICAL_SOURCE_ROOT, "routing");
const ORG_ROOT = path.join(CANONICAL_SOURCE_ROOT, "org");
const CATALOG_PATH = path.join(ROOT_DIR, "docs", "agents", "codex-subagents.by-department.json");
const FAMILY_MAP_PATH = path.join(ROOT_DIR, "docs", "agents", "awesome-to-family-map.json");
const LAST_GOOD_DIR = path.join(ROOT_DIR, "data", "canonical-company");
const LAST_GOOD_PATH = path.join(LAST_GOOD_DIR, "last-good-snapshot.json");
const SNAPSHOT_ARCHIVE_DIR = path.join(LAST_GOOD_DIR, "snapshots");
const CURRENT_POINTER_PATH = path.join(LAST_GOOD_DIR, "current-version.json");
const AGENTS_SOURCE_MODE = "root_only" as const;

const FAMILY_ORDER: CanonicalFamilyKey[] = [
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

const STAGE_ORDER: CanonicalStageKey[] = [
  "junior",
  "advancement-1",
  "senior",
  "advancement-2",
  "pro-senior",
  "advancement-3",
  "team-lead",
];

const FAMILY_HINTS: Record<CanonicalFamilyKey, string[]> = {
  architect: ["architecture", "architect", "system design", "infra", "platform", "migration"],
  backend: ["backend", "api", "server", "database", "service", "integration"],
  documenter: ["document", "docs", "report", "write", "summary", "brief"],
  frontend: ["frontend", "ui", "ux", "react", "next", "screen", "component"],
  "memory-manager": ["memory", "context", "continuity", "history", "snapshot"],
  orchestrator: ["orchestrate", "meeting", "delegate", "coordination", "workflow"],
  "product-manager": ["requirement", "plan", "spec", "roadmap", "product", "scope"],
  qa: ["qa", "test", "validation", "regression", "release confidence"],
  refactor: ["refactor", "cleanup", "debt", "simplify", "modernize"],
  researcher: ["research", "investigate", "analysis", "explore", "compare"],
  reviewer: ["review", "audit", "security", "compliance", "approve"],
};

const APPROVAL_KEYWORDS = [
  "delete",
  "drop",
  "destroy",
  "auth",
  "permission",
  "security",
  "deploy",
  "production",
  "billing",
  "cost",
];

const DEFAULT_PROVIDER = "claude";
const DEFAULT_PROVIDER_MODEL_CONFIG: Record<string, ProviderModelConfig> = {
  claude: { model: "claude-opus-4-6", subModel: "claude-sonnet-4-6" },
  codex: {
    model: "gpt-5.3-codex",
    reasoningLevel: "high",
    subModel: "gpt-5.3-codex",
    subModelReasoningLevel: "high",
  },
  gemini: { model: "gemini-3-pro-preview" },
  opencode: { model: "github-copilot/claude-sonnet-4.6" },
  copilot: { model: "github-copilot/claude-sonnet-4.6" },
  antigravity: { model: "google/antigravity-gemini-3-pro" },
};

let cachedSnapshot: CanonicalSnapshot | null = null;

export function getCanonicalAgentsSourceMode(): "root_only" {
  return AGENTS_SOURCE_MODE;
}

function isCanonicalFamilyKey(value: unknown): value is CanonicalFamilyKey {
  return typeof value === "string" && FAMILY_ORDER.includes(value as CanonicalFamilyKey);
}

function isCanonicalStageKey(value: unknown): value is CanonicalStageKey {
  return typeof value === "string" && STAGE_ORDER.includes(value as CanonicalStageKey);
}

function isCanonicalTierKey(value: unknown): value is CanonicalTierKey {
  return value === "tier-1" || value === "tier-2" || value === "tier-3" || value === "tier-4";
}

function ensureLastGoodDir(): void {
  fs.mkdirSync(LAST_GOOD_DIR, { recursive: true });
  fs.mkdirSync(SNAPSHOT_ARCHIVE_DIR, { recursive: true });
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function parseBulletLines(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function stableHash(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function toVersion(hash: string, compiledAt: string): string {
  return `${compiledAt.slice(0, 10)}-${hash.slice(0, 12)}`;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFile(filePath)) as T;
}

function buildFamilies(): { families: CanonicalFamily[]; diagnostics: CanonicalDiagnostic[] } {
  const diagnostics: CanonicalDiagnostic[] = [];
  const families = FAMILY_ORDER.map((family) => {
    const familyRoot = path.join(SUBAGENTS_ROOT, family);
    const teamLeadSystemPath = path.join(familyRoot, "team-lead", "SYSTEM.md");
    if (!fs.existsSync(familyRoot)) {
      diagnostics.push({
        code: "canonical_family_missing",
        severity: "error",
        message: `Canonical family directory is missing for ${family}.`,
        sourcePath: familyRoot,
      });
    }
    for (const stage of STAGE_ORDER) {
      const stageRoot = path.join(familyRoot, stage);
      const systemPath = path.join(stageRoot, "SYSTEM.md");
      if (!fs.existsSync(stageRoot)) {
        diagnostics.push({
          code: "canonical_stage_missing",
          severity: "error",
          message: `Canonical stage directory is missing for ${family}/${stage}.`,
          sourcePath: stageRoot,
        });
        continue;
      }
      if (!fs.existsSync(systemPath)) {
        diagnostics.push({
          code: "canonical_stage_system_missing",
          severity: "error",
          message: `SYSTEM.md is missing for ${family}/${stage}.`,
          sourcePath: systemPath,
        });
      }
    }
    return {
      key: family,
      sourcePath: familyRoot,
      systemPromptPath: fs.existsSync(teamLeadSystemPath) ? teamLeadSystemPath : null,
    };
  });
  return { families, diagnostics };
}

function buildStages(): { stages: CanonicalStage[]; diagnostics: CanonicalDiagnostic[] } {
  const diagnostics: CanonicalDiagnostic[] = [];
  const stages = STAGE_ORDER.map((stage) => {
    const sourcePath = path.join(SUBAGENTS_ROOT, "backend", stage);
    if (!fs.existsSync(sourcePath)) {
      diagnostics.push({
        code: "canonical_stage_reference_missing",
        severity: "error",
        message: `Canonical stage reference path is missing for ${stage}.`,
        sourcePath,
      });
    }
    return {
      key: stage,
      sourcePath,
    };
  });
  return { stages, diagnostics };
}

function buildApprovalGates(): CanonicalApprovalGate[] {
  const rules: CanonicalApprovalGate[] = [];
  const approvalDoc = readFile(path.join(ORG_ROOT, "APPROVAL_GATES.md"));
  rules.push({
    id: "human-approval-general",
    summary: approvalDoc
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(1)
      .join(" "),
    sourcePath: path.join(ORG_ROOT, "APPROVAL_GATES.md"),
  });

  const agentsDoc = readFile(CANONICAL_AGENTS_MD);
  const marker = "Human approval is required for:";
  const afterMarker = agentsDoc.split(marker)[1] ?? "";
  const items = parseBulletLines(afterMarker);
  items.forEach((item, index) => {
    rules.push({
      id: `human-approval-${index + 1}`,
      summary: item.replace(/\.$/, ""),
      sourcePath: CANONICAL_AGENTS_MD,
    });
  });
  return rules;
}

function buildAgentsSourceDiagnostics(): CanonicalDiagnostic[] {
  const diagnostics: CanonicalDiagnostic[] = [];
  if (fs.existsSync(LEGACY_CANONICAL_AGENTS_MD)) {
    diagnostics.push({
      code: "compat_warning",
      severity: "warning",
      message: "Legacy AGENTS source detected outside root; root AGENTS.md is enforced (root_only).",
      sourcePath: LEGACY_CANONICAL_AGENTS_MD,
      details: {
        agents_source_mode: AGENTS_SOURCE_MODE,
        selected: CANONICAL_AGENTS_MD,
        ignored: LEGACY_CANONICAL_AGENTS_MD,
      },
    });
  }
  return diagnostics;
}

function buildRoutingRules(): { rules: CanonicalRoutingRule[]; diagnostics: CanonicalDiagnostic[] } {
  const sourcePath = path.join(ROUTING_ROOT, "AGENT_ROUTING.md");
  const diagnostics: CanonicalDiagnostic[] = [];
  const rules: CanonicalRoutingRule[] = [];
  parseBulletLines(readFile(sourcePath)).forEach((line, index) => {
    const [conditionRaw, familyRaw] = line.split("->").map((part) => part.trim().replace(/\.$/, ""));
    const familyMatch = FAMILY_ORDER.find((family) => familyRaw.toLowerCase().includes(family.replace("-", " ")));
    if (!conditionRaw || !familyRaw || !familyMatch) {
      diagnostics.push({
        code: "routing_rule_invalid",
        severity: "error",
        message: `Invalid routing rule: ${line}`,
        sourcePath,
        details: { line, index },
      });
      return;
    }
    rules.push({
      id: `routing-${index + 1}`,
      condition: conditionRaw,
      family: familyMatch,
      summary: line.replace(/\.$/, ""),
      sourcePath,
    });
  });
  return { rules, diagnostics };
}

function buildModelTierRules(): { rules: CanonicalModelTierRule[]; diagnostics: CanonicalDiagnostic[] } {
  const sourcePath = path.join(ROUTING_ROOT, "MODEL_ROUTING.md");
  const diagnostics: CanonicalDiagnostic[] = [];
  const rules: CanonicalModelTierRule[] = [];
  parseBulletLines(readFile(sourcePath))
    .filter((line) => line.includes("->"))
    .forEach((line, index) => {
      const [condition, tierRaw] = line.split("->").map((part) => part.trim().replace(/\.$/, ""));
      const normalizedTierText = tierRaw.toLowerCase();
      const tierMatch = normalizedTierText.match(/tier-\d/);
      const normalizedTier = tierMatch?.[0] ?? "";
      if (!condition || !isCanonicalTierKey(normalizedTier)) {
        diagnostics.push({
          code: "model_tier_rule_invalid",
          severity: "error",
          message: `Invalid model tier rule: ${line}`,
          sourcePath,
          details: { line, index },
        });
        return;
      }
      rules.push({
        id: `tier-${index + 1}`,
        condition,
        tier: normalizedTier,
        summary: line.replace(/\.$/, ""),
        sourcePath,
      });
    });
  return { rules, diagnostics };
}

function buildPackProfiles(): { profiles: CanonicalPackProfile[]; diagnostics: CanonicalDiagnostic[] } {
  const diagnostics: CanonicalDiagnostic[] = [];
  const knownKeys = new Set(CANONICAL_PACK_SOURCES.map((source) => source.key));
  const seen = new Set<string>();
  const profiles = CANONICAL_PACK_SOURCES.map((source) => {
    if (seen.has(source.key)) {
      diagnostics.push({
        code: "pack_profile_duplicate",
        severity: "error",
        message: `Duplicate canonical pack profile key: ${source.key}`,
        sourcePath: ROUTING_ROOT,
      });
    }
    seen.add(source.key);
    if (source.baseKey && !knownKeys.has(source.baseKey)) {
      diagnostics.push({
        code: "pack_profile_invalid_base",
        severity: "error",
        message: `Canonical pack ${source.key} references unknown base pack ${source.baseKey}.`,
        sourcePath: ROUTING_ROOT,
      });
    }
    if (source.derivedFrom && !knownKeys.has(source.derivedFrom)) {
      diagnostics.push({
        code: "pack_profile_invalid_parent",
        severity: "error",
        message: `Canonical pack ${source.key} references unknown derived parent ${source.derivedFrom}.`,
        sourcePath: ROUTING_ROOT,
      });
    }
    if (source.key === "donggri" && (source.baseKey || source.derivedFrom)) {
      diagnostics.push({
        code: "pack_profile_invalid_base_pack",
        severity: "error",
        message: "donggri must remain the canonical base pack.",
        sourcePath: ROUTING_ROOT,
      });
    }
    if (source.requiredArtifacts.length === 0 || source.outputContract.length === 0) {
      diagnostics.push({
        code: "pack_profile_incomplete",
        severity: "error",
        message: `Canonical pack ${source.key} is missing required artifacts or output contract.`,
        sourcePath: ROUTING_ROOT,
      });
    }
    return {
      key: source.key,
      baseKey: source.baseKey,
      derivedFrom: source.derivedFrom,
      routingBias: source.routingKeywords.slice(0, 8).map((keyword) => String(keyword)),
      requiredArtifacts: source.requiredArtifacts.slice(),
      outputContract: source.outputContract.slice(),
      modelTierPreference: source.modelTierPreference,
      sourceLayer: "compiler" as const,
    };
  });
  return { profiles, diagnostics };
}

function loadCatalog(): CatalogSnapshot {
  return readJsonFile<CatalogSnapshot>(CATALOG_PATH);
}

function loadFamilyMapRules(): { rules: FamilyMapRules; diagnostics: CanonicalDiagnostic[] } {
  const diagnostics: CanonicalDiagnostic[] = [];
  const rules = readJsonFile<FamilyMapRules>(FAMILY_MAP_PATH);
  const validateMap = (scope: string, entries: Record<string, CanonicalFamilyKey>) => {
    for (const [ruleKey, family] of Object.entries(entries)) {
      if (!isCanonicalFamilyKey(family)) {
        diagnostics.push({
          code: "family_map_invalid_family",
          severity: "error",
          message: `Family map ${scope}.${ruleKey} points to invalid family ${String(family)}.`,
          sourcePath: FAMILY_MAP_PATH,
        });
      }
    }
  };
  validateMap("departmentDefaults", rules.departmentDefaults);
  validateMap("stage1Defaults", rules.stage1Defaults);
  validateMap("stage2Defaults", rules.stage2Defaults);
  validateMap("agentOverrides", rules.agentOverrides);
  return { rules, diagnostics };
}

function resolveFamilyForSpecialization(
  agent: CatalogAgent,
  rules: FamilyMapRules,
): {
  family: CanonicalFamilyKey | null;
  matchedBy: "override" | "stage2" | "stage1" | "department" | null;
  ruleKey: string | null;
} {
  if (rules.agentOverrides[agent.name]) {
    return { family: rules.agentOverrides[agent.name], matchedBy: "override", ruleKey: agent.name };
  }
  const stage2 = String(agent.class_stage_2 ?? "").trim();
  if (stage2 && rules.stage2Defaults[stage2]) {
    return { family: rules.stage2Defaults[stage2], matchedBy: "stage2", ruleKey: stage2 };
  }
  const stage1 = String(agent.class_stage_1 ?? "").trim();
  if (stage1 && rules.stage1Defaults[stage1]) {
    return { family: rules.stage1Defaults[stage1], matchedBy: "stage1", ruleKey: stage1 };
  }
  const department = String(agent.department ?? "").trim();
  if (department && rules.departmentDefaults[department]) {
    return { family: rules.departmentDefaults[department], matchedBy: "department", ruleKey: department };
  }
  return { family: null, matchedBy: null, ruleKey: null };
}

function buildRegistry(compiledAt: string): CanonicalSpecializationRegistry {
  const catalog = loadCatalog();
  const { rules, diagnostics: ruleDiagnostics } = loadFamilyMapRules();
  const diagnostics: CanonicalDiagnostic[] = [];
  diagnostics.push(...ruleDiagnostics);
  const familyAssignments: Record<string, number> = Object.fromEntries(FAMILY_ORDER.map((family) => [family, 0]));
  const stage1 = new Set<string>();
  const stage2 = new Set<string>();
  const stage3 = new Set<string>();

  const specializations = catalog.agents
    .map<CanonicalSpecialization | null>((agent) => {
      if (agent.class_stage_1) stage1.add(agent.class_stage_1);
      if (agent.class_stage_2) stage2.add(agent.class_stage_2);
      if (agent.class_stage_3) stage3.add(agent.class_stage_3);
      const resolution = resolveFamilyForSpecialization(agent, rules);
      if (!resolution.family || !resolution.matchedBy || !resolution.ruleKey) {
        diagnostics.push({
          code: "specialization_unmapped",
          severity: "error",
          message: `Specialization ${agent.name} is not mapped to a canonical family.`,
          sourcePath: FAMILY_MAP_PATH,
          details: { specialization: agent.name },
        });
        return null;
      }
      familyAssignments[resolution.family] = (familyAssignments[resolution.family] ?? 0) + 1;
      const classStageTree: CanonicalSpecialization["classStageTree"] = {};
      if (agent.class_stage_1) classStageTree.stage1 = agent.class_stage_1;
      if (agent.class_stage_2) classStageTree.stage2 = agent.class_stage_2;
      if (agent.class_stage_3) classStageTree.stage3 = agent.class_stage_3;
      return {
        key: agent.name,
        description: agent.description,
        family: resolution.family,
        department: agent.department,
        classStageTree,
        upstreamMetadata: {
          upstreamCategory: agent.upstreamCategory,
          upstreamPath: agent.upstreamPath,
        },
        resolution: {
          matchedBy: resolution.matchedBy,
          ruleKey: resolution.ruleKey,
        },
      };
    })
    .filter((item): item is CanonicalSpecialization => item !== null);

  const hash = stableHash([catalog, rules, compiledAt]);
  return {
    version: toVersion(hash, compiledAt),
    hash,
    generatedAt: compiledAt,
    sourceRepo: catalog.sourceRepo,
    sourceRef: catalog.sourceRef,
    sourceUrl: catalog.sourceUrl,
    total: specializations.length,
    familyAssignments,
    stageClassTree: {
      stage1: [...stage1].sort(),
      stage2: [...stage2].sort(),
      stage3: [...stage3].sort(),
    },
    specializations,
    diagnostics,
  };
}

function compileSnapshot(): CanonicalSnapshot {
  const compiledAt = new Date().toISOString();
  const diagnostics: CanonicalDiagnostic[] = [];
  const policyDiagnostics: CanonicalDiagnostic[] = [];
  const policySourceParts = [
    readFile(CANONICAL_AGENTS_MD),
    readFile(path.join(ORG_ROOT, "APPROVAL_GATES.md")),
    readFile(path.join(ROUTING_ROOT, "AGENT_ROUTING.md")),
    readFile(path.join(ROUTING_ROOT, "MODEL_ROUTING.md")),
  ];

  const { families, diagnostics: familyDiagnostics } = buildFamilies();
  const { stages, diagnostics: stageDiagnostics } = buildStages();
  const approvalGates = buildApprovalGates();
  const { rules: routingRules, diagnostics: routingDiagnostics } = buildRoutingRules();
  const { rules: modelTierRules, diagnostics: modelTierDiagnostics } = buildModelTierRules();
  const { profiles: packProfiles, diagnostics: packDiagnostics } = buildPackProfiles();
  const registry = buildRegistry(compiledAt);
  diagnostics.push(
    ...familyDiagnostics,
    ...stageDiagnostics,
    ...routingDiagnostics,
    ...modelTierDiagnostics,
    ...packDiagnostics,
  );
  diagnostics.push(...buildAgentsSourceDiagnostics());
  diagnostics.push(...registry.diagnostics);
  policyDiagnostics.push(
    ...familyDiagnostics,
    ...stageDiagnostics,
    ...routingDiagnostics,
    ...modelTierDiagnostics,
    ...packDiagnostics,
  );
  policyDiagnostics.push(...buildAgentsSourceDiagnostics());

  const hash = stableHash([
    policySourceParts,
    families,
    stages,
    approvalGates,
    routingRules,
    modelTierRules,
    packProfiles,
  ]);
  const policy: CanonicalCompanyPolicy = {
    version: toVersion(hash, compiledAt),
    hash,
    compiledAt,
    sourceRoot: CANONICAL_SOURCE_ROOT,
    families,
    stages,
    approvalGates,
    routingRules,
    modelTierRules,
    packProfiles,
    reloadPolicy: {
      strategy: "snapshot_pinning",
      inFlightBehavior: "pin_current_snapshot",
      reloadModes: ["dry-run", "apply", "rollback"],
      lastGoodAvailable: fs.existsSync(LAST_GOOD_PATH),
    },
    diagnostics: policyDiagnostics,
  };

  return {
    policy,
    registry,
    diagnostics,
    sourcePaths: [
      CANONICAL_AGENTS_MD,
      path.join(ROUTING_ROOT, "AGENT_ROUTING.md"),
      path.join(ROUTING_ROOT, "MODEL_ROUTING.md"),
      FAMILY_MAP_PATH,
      CATALOG_PATH,
      path.join(ROOT_DIR, "server", "modules", "workflow", "packs", "canonical-profiles.ts"),
    ],
  };
}

function saveLastGoodSnapshot(snapshot: CanonicalSnapshot): void {
  ensureLastGoodDir();
  fs.writeFileSync(LAST_GOOD_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function getSnapshotArchivePath(version: string): string {
  return path.join(SNAPSHOT_ARCHIVE_DIR, `${version}.json`);
}

function saveSnapshotArchive(snapshot: CanonicalSnapshot): void {
  ensureLastGoodDir();
  fs.writeFileSync(getSnapshotArchivePath(snapshot.policy.version), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function loadSnapshotArchive(version: string): CanonicalSnapshot | null {
  const snapshotPath = getSnapshotArchivePath(version);
  if (!fs.existsSync(snapshotPath)) return null;
  try {
    return readJsonFile<CanonicalSnapshot>(snapshotPath);
  } catch {
    return null;
  }
}

function saveCurrentSnapshotPointer(snapshot: CanonicalSnapshot): void {
  ensureLastGoodDir();
  fs.writeFileSync(
    CURRENT_POINTER_PATH,
    `${JSON.stringify({ version: snapshot.policy.version, hash: snapshot.policy.hash }, null, 2)}\n`,
    "utf8",
  );
}

function loadCurrentSnapshotPointer(): { version: string; hash: string | null } | null {
  if (!fs.existsSync(CURRENT_POINTER_PATH)) return null;
  try {
    const parsed = readJsonFile<{ version?: unknown; hash?: unknown }>(CURRENT_POINTER_PATH);
    const version = String(parsed.version ?? "").trim();
    if (!version) return null;
    const hash = typeof parsed.hash === "string" && parsed.hash.trim() ? parsed.hash.trim() : null;
    return { version, hash };
  } catch {
    return null;
  }
}

function loadLastGoodSnapshot(): CanonicalSnapshot | null {
  if (!fs.existsSync(LAST_GOOD_PATH)) return null;
  try {
    return readJsonFile<CanonicalSnapshot>(LAST_GOOD_PATH);
  } catch {
    return null;
  }
}

export function getCanonicalSnapshot(): CanonicalSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  const currentPointer = loadCurrentSnapshotPointer();
  if (currentPointer) {
    const archivedCurrent = loadSnapshotArchive(currentPointer.version);
    if (archivedCurrent) {
      cachedSnapshot = archivedCurrent;
      return archivedCurrent;
    }
  }
  try {
    const compiled = compileSnapshot();
    if (compiled.diagnostics.some((item) => item.severity === "error")) {
      throw new Error(compiled.diagnostics.map((item) => item.message).join("; "));
    }
    cachedSnapshot = compiled;
    saveSnapshotArchive(compiled);
    saveCurrentSnapshotPointer(compiled);
    saveLastGoodSnapshot(compiled);
    return compiled;
  } catch (error) {
    const fallback = loadLastGoodSnapshot();
    if (fallback) {
      cachedSnapshot = fallback;
      saveSnapshotArchive(fallback);
      saveCurrentSnapshotPointer(fallback);
      return fallback;
    }
    throw error;
  }
}

export function getCanonicalSnapshotByVersion(version: string | null | undefined): CanonicalSnapshot | null {
  const normalizedVersion = String(version ?? "").trim();
  if (!normalizedVersion) return null;
  if (cachedSnapshot?.policy.version === normalizedVersion) return cachedSnapshot;
  const archived = loadSnapshotArchive(normalizedVersion);
  if (archived) return archived;
  const lastGood = loadLastGoodSnapshot();
  if (lastGood?.policy.version === normalizedVersion) return lastGood;
  return null;
}

export function getCanonicalPolicyByVersion(version: string | null | undefined): CanonicalCompanyPolicy | null {
  return getCanonicalSnapshotByVersion(version)?.policy ?? null;
}

export function getCurrentCanonicalVersion(): string {
  return getCanonicalSnapshot().policy.version;
}

export function reloadCanonicalSnapshot(
  mode: "dry-run" | "apply" | "rollback" = "dry-run",
  targetVersion?: string | null,
): CanonicalReloadResult {
  const normalizedTargetVersion = String(targetVersion ?? "").trim() || null;
  if (mode === "rollback") {
    const rollbackSnapshot =
      normalizedTargetVersion !== null
        ? getCanonicalSnapshotByVersion(normalizedTargetVersion)
        : loadLastGoodSnapshot();
    if (!rollbackSnapshot) {
      return {
        mode,
        ok: false,
        applied: false,
        snapshot: null,
        diagnostics: [
          {
            code: "last_good_snapshot_missing",
            severity: "error",
            message:
              normalizedTargetVersion !== null
                ? `Canonical snapshot version '${normalizedTargetVersion}' is not available for rollback.`
                : "No last-good canonical snapshot is available for rollback.",
            sourcePath:
              normalizedTargetVersion !== null ? getSnapshotArchivePath(normalizedTargetVersion) : LAST_GOOD_PATH,
          },
        ],
        restoredFromLastGood: normalizedTargetVersion === null,
        currentVersion: cachedSnapshot?.policy.version ?? null,
        targetVersion: normalizedTargetVersion,
      };
    }
    cachedSnapshot = rollbackSnapshot;
    saveSnapshotArchive(rollbackSnapshot);
    saveCurrentSnapshotPointer(rollbackSnapshot);
    return {
      mode,
      ok: true,
      applied: true,
      snapshot: rollbackSnapshot,
      diagnostics: [],
      restoredFromLastGood: normalizedTargetVersion === null,
      currentVersion: rollbackSnapshot.policy.version,
      targetVersion: normalizedTargetVersion,
    };
  }

  try {
    const snapshot = compileSnapshot();
    const ok = snapshot.diagnostics.every((item) => item.severity !== "error");
    if (mode === "apply" && ok) {
      cachedSnapshot = snapshot;
      saveSnapshotArchive(snapshot);
      saveCurrentSnapshotPointer(snapshot);
      saveLastGoodSnapshot(snapshot);
    }
    return {
      mode,
      ok,
      applied: mode === "apply" && ok,
      snapshot,
      diagnostics: snapshot.diagnostics,
      restoredFromLastGood: false,
      currentVersion: mode === "apply" && ok ? snapshot.policy.version : getCanonicalSnapshot().policy.version,
      targetVersion: normalizedTargetVersion,
    };
  } catch (error) {
    return {
      mode,
      ok: false,
      applied: false,
      snapshot: null,
      diagnostics: [
        {
          code: "canonical_compile_failed",
          severity: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      restoredFromLastGood: false,
      currentVersion: cachedSnapshot?.policy.version ?? null,
      targetVersion: normalizedTargetVersion,
    };
  }
}

type ProjectConstraintInput = {
  restrictedFamilies?: CanonicalFamilyKey[] | null;
  allowlistFamilies?: CanonicalFamilyKey[] | null;
};

type CompiledProviderDefault = {
  provider: string;
  model: string | null;
  reasoningLevel: string | null;
  subProvider: string | null;
  subModel: string | null;
  subReasoningLevel: string | null;
};

const ROUTING_RULE_HINTS: Record<string, string[]> = {
  "requirement ambiguity": ["requirement", "scope", "ambiguous", "clarify", "unclear", "spec"],
  "architecture change": ["architecture", "architect", "system design", "migration", "platform", "infra"],
  "backend work": ["backend", "api", "server", "database", "service", "integration"],
  "frontend work": ["frontend", "ui", "ux", "react", "next", "screen", "component"],
  "refactor-only work": ["refactor", "cleanup", "simplify", "modernize", "debt"],
  "completed implementation": ["review", "audit", "approve", "completed", "finish", "done"],
  "validation and release confidence": ["qa", "validation", "release", "ship", "reliability", "security", "confidence"],
  "continuity updates": ["memory", "continuity", "history", "context", "snapshot"],
};

const MODEL_TIER_HINTS: Record<string, string[]> = {
  "architecture and review": ["architecture", "review", "audit", "approval", "security"],
  "standard implementation": ["implement", "feature", "task", "code", "build"],
  "small isolated fixes": ["small", "minor", "isolated", "tiny", "quick fix", "surgical"],
  "documentation and research": ["document", "docs", "report", "research", "investigate", "citation"],
};

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "into",
  "from",
  "that",
  "this",
  "work",
  "change",
  "implementation",
  "confidence",
  "standard",
  "updates",
]);

const COMPILED_PROVIDER_DEFAULTS: Record<CanonicalTierKey, CompiledProviderDefault> = {
  "tier-1": {
    provider: "codex",
    model: "gpt-5.3-codex",
    reasoningLevel: "xhigh",
    subProvider: "codex",
    subModel: "gpt-5.3-codex",
    subReasoningLevel: "xhigh",
  },
  "tier-2": {
    provider: "codex",
    model: "gpt-5.3-codex",
    reasoningLevel: "high",
    subProvider: "codex",
    subModel: "gpt-5.3-codex",
    subReasoningLevel: "high",
  },
  "tier-3": {
    provider: "codex",
    model: "gpt-5.3-codex",
    reasoningLevel: "medium",
    subProvider: "codex",
    subModel: "gpt-5.3-codex",
    subReasoningLevel: "medium",
  },
  "tier-4": {
    provider: "codex",
    model: "gpt-5.3-codex",
    reasoningLevel: "low",
    subProvider: "codex",
    subModel: "gpt-5.3-codex",
    subReasoningLevel: "low",
  },
};

function normalizeProviderConfig(
  providerModelConfig?: Record<string, ProviderModelConfig> | null,
): Record<string, ProviderModelConfig> {
  return providerModelConfig ?? DEFAULT_PROVIDER_MODEL_CONFIG;
}

function normalizeTextTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function buildCandidateHints(condition: string, fallbackHints: string[] = []): string[] {
  const normalizedCondition = condition.toLowerCase().trim();
  const derivedTokens = normalizeTextTokens(condition);
  return [...new Set([...(ROUTING_RULE_HINTS[normalizedCondition] ?? []), ...fallbackHints, ...derivedTokens])];
}

function scoreHintMatches(text: string, hints: string[]): number {
  const normalized = text.toLowerCase();
  return [...new Set(hints)]
    .map((hint) => hint.trim().toLowerCase())
    .filter(Boolean)
    .reduce((count, hint) => count + (normalized.includes(hint) ? 1 : 0), 0);
}

function resolvePackProfile(
  snapshot: CanonicalSnapshot,
  workflowPackKey?: WorkflowPackKey | null,
): CanonicalPackProfile {
  const packKey = String(workflowPackKey ?? "donggri").trim() || "donggri";
  return snapshot.policy.packProfiles.find((item) => item.key === packKey) ?? snapshot.policy.packProfiles[0];
}

function resolveFamilyCandidateScores(
  text: string,
  snapshot: CanonicalSnapshot,
  packProfile: CanonicalPackProfile,
): Array<{ family: CanonicalFamilyKey; score: number; reason: string }> {
  const directRuleScores = snapshot.policy.routingRules.map((rule) => {
    const score = scoreHintMatches(text, buildCandidateHints(rule.condition, FAMILY_HINTS[rule.family]));
    return {
      family: rule.family,
      score,
      reason: `routing_rule:${rule.id}`,
    };
  });

  const fallbackScores = FAMILY_ORDER.map((family) => ({
    family,
    score: scoreHintMatches(text, FAMILY_HINTS[family]),
    reason: `family_hint:${family}`,
  }));

  const packBiasScore = scoreHintMatches(text, packProfile.routingBias);
  const scoresByFamily = new Map<CanonicalFamilyKey, { family: CanonicalFamilyKey; score: number; reason: string }>();
  for (const entry of [...directRuleScores, ...fallbackScores]) {
    const current = scoresByFamily.get(entry.family);
    if (!current || entry.score > current.score) {
      scoresByFamily.set(entry.family, entry);
    }
  }
  if (packBiasScore > 0 && packProfile.key === "web_research_report") {
    scoresByFamily.set("researcher", {
      family: "researcher",
      score: (scoresByFamily.get("researcher")?.score ?? 0) + packBiasScore,
      reason: `pack_bias:${packProfile.key}`,
    });
  }
  if (packBiasScore > 0 && packProfile.key === "report") {
    scoresByFamily.set("documenter", {
      family: "documenter",
      score: (scoresByFamily.get("documenter")?.score ?? 0) + packBiasScore,
      reason: `pack_bias:${packProfile.key}`,
    });
  }
  return [...scoresByFamily.values()].sort(
    (left, right) => right.score - left.score || FAMILY_ORDER.indexOf(left.family) - FAMILY_ORDER.indexOf(right.family),
  );
}

function resolveTier(
  text: string,
  family: CanonicalFamilyKey,
  packProfile: CanonicalPackProfile,
  snapshot: CanonicalSnapshot,
): {
  tier: CanonicalTierKey;
  selectedBy: string;
  whyNot: Array<{ candidate: string; reason: string }>;
} {
  const ranked = snapshot.policy.modelTierRules
    .map((rule) => ({
      rule,
      score: scoreHintMatches(
        text,
        buildCandidateHints(rule.condition, MODEL_TIER_HINTS[rule.condition.toLowerCase().trim()] ?? []),
      ),
    }))
    .sort((left, right) => right.score - left.score);
  const top = ranked[0];
  if (top && top.score > 0) {
    return {
      tier: top.rule.tier,
      selectedBy: `provider/model tier=${top.rule.tier} (${top.rule.id})`,
      whyNot: ranked
        .slice(1)
        .filter((item) => item.score > 0)
        .map((item) => ({ candidate: item.rule.tier, reason: `lower_score_than:${top.rule.id}` })),
    };
  }

  if (family === "architect" || family === "reviewer") {
    return {
      tier: "tier-1",
      selectedBy: "provider/model tier=tier-1 (family_default)",
      whyNot: [{ candidate: packProfile.modelTierPreference, reason: "family_default_overrode_pack_bias" }],
    };
  }

  return {
    tier: packProfile.modelTierPreference,
    selectedBy: `pack bias=${packProfile.key} -> ${packProfile.modelTierPreference}`,
    whyNot: [],
  };
}

function resolveStage(family: CanonicalFamilyKey, tier: CanonicalTierKey, text: string): CanonicalStageKey {
  const normalized = text.toLowerCase();
  if (family === "orchestrator" || family === "product-manager") return "team-lead";
  if (family === "architect" || family === "reviewer" || family === "qa") return "senior";
  if (tier === "tier-3" || normalized.includes("small") || normalized.includes("minor")) return "junior";
  if (family === "researcher" || family === "documenter" || family === "memory-manager") return "senior";
  return "senior";
}

function pickSpecialization(
  text: string,
  family: CanonicalFamilyKey,
  registry: CanonicalSpecializationRegistry,
): string | null {
  const normalized = text.toLowerCase();
  const familyItems = registry.specializations.filter((item) => item.family === family);
  let bestKey: string | null = null;
  let bestScore = 0;
  for (const item of familyItems) {
    const tokens = [
      ...item.key.split(/[.-]/g),
      ...normalizeTextTokens(item.description),
      ...(item.classStageTree.stage1 ? normalizeTextTokens(item.classStageTree.stage1) : []),
      ...(item.classStageTree.stage2 ? normalizeTextTokens(item.classStageTree.stage2) : []),
      ...(item.classStageTree.stage3 ? normalizeTextTokens(item.classStageTree.stage3) : []),
    ].filter((token) => token.length >= 3);
    const score = tokens.reduce((count, token) => count + (normalized.includes(token.toLowerCase()) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestKey = item.key;
    }
  }
  return bestKey ?? familyItems[0]?.key ?? null;
}

function pickApprovalGates(text: string, artifactBlocking: boolean): string[] {
  const normalized = text.toLowerCase();
  const gates: string[] = [];
  if (artifactBlocking) {
    gates.push("artifact-health-block");
  }
  if (APPROVAL_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    gates.push("human-approval-general");
  }
  return gates;
}

function chooseCanonicalProvider(
  tier: CanonicalTierKey,
  defaultProvider?: string | null,
  providerModelConfig?: Record<string, ProviderModelConfig> | null,
): CompiledProviderDefault {
  const selected = COMPILED_PROVIDER_DEFAULTS[tier];
  const config = normalizeProviderConfig(providerModelConfig);
  if (selected.provider) {
    const providerConfig = config[selected.provider] ?? {};
    const subProviderConfig = config[selected.subProvider ?? selected.provider] ?? {};
    return {
      ...selected,
      model: providerConfig.model ?? selected.model,
      subModel: subProviderConfig.subModel ?? subProviderConfig.model ?? selected.subModel,
    };
  }
  const fallbackProvider =
    String(defaultProvider ?? DEFAULT_PROVIDER)
      .trim()
      .toLowerCase() || DEFAULT_PROVIDER;
  const fallbackConfig = config[fallbackProvider] ?? {};
  return {
    provider: fallbackProvider,
    model: fallbackConfig.model ?? null,
    reasoningLevel: fallbackConfig.reasoningLevel ?? null,
    subProvider: fallbackProvider,
    subModel: fallbackConfig.subModel ?? null,
    subReasoningLevel: fallbackConfig.subModelReasoningLevel ?? null,
  };
}

function constrainFamilies(
  rankedFamilies: Array<{ family: CanonicalFamilyKey; score: number; reason: string }>,
  projectConstraint?: ProjectConstraintInput | null,
): {
  selected: { family: CanonicalFamilyKey; score: number; reason: string };
  blockedBy: string[];
  whyNot: Array<{ candidate: string; reason: string }>;
  selectedBy: string[];
} {
  const allowlist = [...new Set((projectConstraint?.allowlistFamilies ?? []).filter(isCanonicalFamilyKey))];
  const restricted = [...new Set((projectConstraint?.restrictedFamilies ?? []).filter(isCanonicalFamilyKey))];
  const whyNot: Array<{ candidate: string; reason: string }> = [];
  const blockedBy: string[] = [];
  const selectedBy: string[] = [];
  let filtered = rankedFamilies;

  if (restricted.length > 0) {
    filtered = filtered.filter((entry) => {
      const blocked = restricted.includes(entry.family);
      if (blocked) {
        whyNot.push({ candidate: entry.family, reason: "blocked_by_project_restriction" });
      }
      return !blocked;
    });
    blockedBy.push(...restricted.map((family) => `project restriction blocked family=${family}`));
  }

  if (allowlist.length > 0) {
    filtered = filtered.filter((entry) => {
      const allowed = allowlist.includes(entry.family);
      if (!allowed) {
        whyNot.push({ candidate: entry.family, reason: "not_in_project_allowlist" });
      }
      return allowed;
    });
    selectedBy.push(`manual allowlist=${allowlist.join(",")}`);
  }

  const selected = filtered[0] ??
    rankedFamilies[0] ?? { family: "backend" as const, score: 0, reason: "fallback:backend" };
  if (selected.reason.startsWith("routing_rule:")) {
    selectedBy.push(`family=${selected.family} (${selected.reason})`);
  } else if (selected.reason.startsWith("pack_bias:")) {
    selectedBy.push(`pack bias kept family=${selected.family}`);
  } else {
    selectedBy.push(`family=${selected.family} (${selected.reason})`);
  }

  return { selected, blockedBy, whyNot, selectedBy };
}

export function previewCanonicalRouting(input: {
  text: string;
  projectPath?: string | null;
  workflowPackKey?: WorkflowPackKey | null;
  providerModelConfig?: Record<string, ProviderModelConfig> | null;
  defaultProvider?: string | null;
  policyVersion?: string | null;
  projectConstraint?: ProjectConstraintInput | null;
}): ResolvedExecutionPolicy {
  const requestedPolicyVersion = String(input.policyVersion ?? "").trim();
  const snapshot =
    requestedPolicyVersion.length > 0 ? getCanonicalSnapshotByVersion(requestedPolicyVersion) : getCanonicalSnapshot();
  if (!snapshot) {
    throw new Error(`canonical_snapshot_version_missing:${requestedPolicyVersion}`);
  }
  const text = String(input.text ?? "").trim();
  const packProfile = resolvePackProfile(snapshot, input.workflowPackKey);
  const rankedFamilies = resolveFamilyCandidateScores(text, snapshot, packProfile);
  const constrainedFamily = constrainFamilies(rankedFamilies, input.projectConstraint);
  const family = constrainedFamily.selected.family;
  const tierResolution = resolveTier(text, family, packProfile, snapshot);
  const tier = tierResolution.tier;
  const stage = resolveStage(family, tier, text);
  const specialization = pickSpecialization(text, family, snapshot.registry);
  const providerDefaults = chooseCanonicalProvider(tier, input.defaultProvider, input.providerModelConfig);
  const artifactState = (() => {
    if (!input.projectPath) return null;
    try {
      return inspectProjectArtifacts({ projectId: null, projectPath: input.projectPath });
    } catch {
      return null;
    }
  })();
  const artifactBlocking = Boolean(artifactState?.validation.some((item) => item.severity === "error"));
  const approvalGates = pickApprovalGates(text, artifactBlocking);
  const selectedBy = [
    artifactBlocking ? "artifact / approval block evaluated" : "artifact / approval block clear",
    ...constrainedFamily.selectedBy,
    tierResolution.selectedBy,
    `stage=${stage} (family_default)`,
    specialization ? `specialization=${specialization}` : "specialization=none",
    `provider/model tier=${tier} -> ${providerDefaults.provider}`,
    input.providerModelConfig
      ? "providerModelConfig applied as model fallback"
      : "providerModelConfig fallback absent",
  ];
  const blockedBy = [
    ...constrainedFamily.blockedBy,
    ...(artifactBlocking ? ["artifact / approval block=project_artifact_health"] : []),
    ...(approvalGates.includes("human-approval-general") ? ["approval gate=human-approval-general"] : []),
  ];
  const whyNot = [
    ...constrainedFamily.whyNot,
    ...tierResolution.whyNot,
    ...rankedFamilies
      .slice(1, 5)
      .filter((candidate) => candidate.score > 0 && candidate.family !== family)
      .map((candidate) => ({ candidate: candidate.family, reason: `lower_score_than:${family}` })),
  ];

  return {
    policyVersion: snapshot.policy.version,
    policySnapshotHash: snapshot.policy.hash,
    snapshotScope: requestedPolicyVersion.length > 0 ? "pinned" : "current",
    family,
    stage,
    specialization,
    provider: providerDefaults.provider,
    model: providerDefaults.model,
    reasoningLevel: providerDefaults.reasoningLevel,
    subProvider: providerDefaults.subProvider,
    subModel: providerDefaults.subModel,
    subReasoningLevel: providerDefaults.subReasoningLevel,
    requiredArtifacts: packProfile?.requiredArtifacts ?? [],
    approvalGates,
    explanation: [
      `snapshot_scope=${requestedPolicyVersion.length > 0 ? "pinned" : "current"} version=${snapshot.policy.version}`,
      ...selectedBy,
      ...blockedBy.map((item) => `blocked=${item}`),
      ...whyNot.map((item) => `why_not ${item.candidate}: ${item.reason}`),
      `pack=${packProfile?.key ?? "donggri"} uses base=${packProfile?.baseKey ?? "self"}`,
    ],
    selectedBy,
    blockedBy,
    whyNot,
    tier,
  };
}

export function getCanonicalPolicy(): CanonicalCompanyPolicy {
  return getCanonicalSnapshot().policy;
}

export function getCanonicalSpecializationRegistry(): CanonicalSpecializationRegistry {
  return getCanonicalSnapshot().registry;
}
