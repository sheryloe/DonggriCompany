import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import { z } from "zod";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { createMaster95DefaultAgentRegistry } from "../../master95/agent-registry.ts";
import { readLivePilotProjection, type Master95RunSummary } from "../../master95/live-pilot-projection.ts";
import { MASTER95_BLOGGERGENT_LANES, MASTER95_BLOGGERGENT_ROLE_AGENTS } from "../../master95/project-registry.ts";
import { registerMaster95ControlTowerRoutes } from "./control-tower.ts";
import { registerMaster95ImageWorkbenchRoutes } from "./image-workbench.ts";

const CONTROL_ROOT = "G:\\Donggri_DevDrive";
const REPO_ESTATE_ROOT = path.join(CONTROL_ROOT, "repos");
const RUNTIME_PROJECTION_APP = path.join(REPO_ESTATE_ROOT, "DonggriCompany");
const CODEX_CONTROL_ROOT = path.join(CONTROL_ROOT, "storage", "codex-control");
const AGENTMEMORY_URL = "http://127.0.0.1:3111";
const AGENTMEMORY_VIEWER_URL = "http://127.0.0.1:3113";
const AGENTMEMORY_RUNTIME_PATH = "E:\\DonggriPlatform_Asset\\runtime\\agentmemory";
const AGENTMEMORY_DATA_PATH = "E:\\DonggriPlatform_Asset\\storage\\agentmemory";
const AGENTMEMORY_PACKAGE = "@agentmemory/agentmemory";
const AGENTMEMORY_OBSERVED_VERSION = "0.9.27";
const AGENTMEMORY_SOURCE_URL = "https://github.com/rohitg00/agentmemory";
const CONTROL_PLANE_FAST_TEST_MODE =
  process.env.CONTROL_PLANE_FAST_TEST_MODE === "1" || process.env.VITEST === "true" || process.env.NODE_ENV === "test";
const AGENTMEMORY_FETCH_TIMEOUT_MS = CONTROL_PLANE_FAST_TEST_MODE ? 50 : 1200;
const REPO_ESTATE_EXCLUDED_PROJECT_DIRS = new Set([".agents", ".codex", ".git", "storage"]);
const AGENTMEMORY_REST_GROUPS = [
  {
    key: "status",
    label: "Status",
    paths: ["/agentmemory/health", "/agentmemory/livez", "/agentmemory/config/flags"],
    dongri_policy: "safe-read",
  },
  {
    key: "recall",
    label: "Search and context",
    paths: ["/agentmemory/smart-search", "/agentmemory/search", "/agentmemory/context", "/agentmemory/file-context"],
    dongri_policy: "summary-only-read",
  },
  {
    key: "capture",
    label: "Remember and observe",
    paths: ["/agentmemory/remember", "/agentmemory/observe", "/agentmemory/session/start", "/agentmemory/session/end"],
    dongri_policy: "confirm-and-approval-required",
  },
  {
    key: "insight",
    label: "Timeline, patterns, profile",
    paths: ["/agentmemory/timeline", "/agentmemory/patterns", "/agentmemory/profile", "/agentmemory/verify"],
    dongri_policy: "summary-only-read",
  },
  {
    key: "blocked",
    label: "Destructive or global operations",
    paths: [
      "/agentmemory/forget",
      "/agentmemory/governance/bulk-delete",
      "/agentmemory/import",
      "/agentmemory/snapshot/restore",
    ],
    dongri_policy: "blocked-until-explicit-approval",
  },
];
const AGENTMEMORY_MCP_TOOLS = [
  "memory_recall",
  "memory_smart_search",
  "memory_save",
  "memory_patterns",
  "memory_timeline",
  "memory_profile",
  "memory_verify",
  "memory_lesson_save",
  "memory_lesson_recall",
  "memory_audit",
  "memory_governance_delete",
];
const VER1_FALLBACK_SPEC_ID = "20260522-donggri-root-control-sdd-v1";
const MASTER95_SPEC_ID = "20260714-donggricompany-95-master-operating-system-v1";
const MASTER95_SPEC_DIR = path.join(CODEX_CONTROL_ROOT, "specs", MASTER95_SPEC_ID);
const MASTER95_QUALITY_ROOT = path.join(CODEX_CONTROL_ROOT, "quality", "master-95");
const VER1_REQUIRED_SPEC_DOCS = [
  "metadata.md",
  "requirements.md",
  "design.md",
  "tasks.md",
  "repo-map.md",
  "approvals.md",
  "evidence.md",
  "handoff.md",
  "learnings.md",
];
const MASTER95_QUALITY_FILES = [
  "QUALITY_SCORECARD.md",
  "SCORING_RULES.json",
  "EVIDENCE_INDEX.yaml",
  "requirements-traceability.yaml",
];
const VER1_GROUPS = {
  steering: ["product.md", "tech.md", "structure.md", "safety.md", "agent-model.md", "context.md"],
  hooks: [
    "README.md",
    "pre-task.yaml",
    "pre-implement.yaml",
    "pre-git.yaml",
    "pre-docker.yaml",
    "pre-secret.yaml",
    "post-verify.yaml",
    "pre-handoff.yaml",
  ],
  orchestrator: ["README.md", "waves.md", "persona-subagents.md", "run-state.md", "recovery.md", "routing.md"],
  context_packs: ["README.md", "_template.md"],
  quality: ["rubric.md", "hard-gates.md", "agy-review.md"],
  integrations: ["codex-app.md", "donggricompany.md", "agentmemory.md", "gemini-cli.md"],
};
const LEGACY_THREAD_TARGETS = [
  "bloggergent",
  "donggricompany",
  "donggrolgamebook",
  "gisoolsa",
  "jasosul",
  "dongri-archive",
];

type DocStatus = {
  key: string;
  path: string;
  exists: boolean;
  size: number | null;
  mtime: string | null;
  sha256: string | null;
  parse_status?: "ok" | "missing" | "error";
  error?: string;
};

type RegistryProject = {
  key: string;
  path: string;
  absolute_path: string;
  type: string | null;
  has_agents: boolean | null;
  status: string | null;
  lifecycle_status: ProjectLifecycleStatus;
  filter_group: string | null;
  default_visible: boolean;
  summary: string | null;
  operation_agent: ProjectOperationAgentConfig | null;
  exists: boolean;
  db_project_id: string | null;
  db_project_name: string | null;
  git: {
    is_repo: boolean;
    branch: string | null;
    ahead: number;
    behind: number;
    dirty_count: number;
    untracked_count: number;
    status: "clean" | "dirty" | "missing" | "not_git";
    error: string | null;
  };
};

type ProjectLifecycleStatus = "active" | "candidate" | "completed" | "archived";

type ProjectOperationAgentConfig = {
  operator_id: string | null;
  project_key: string | null;
  owner_department: string | null;
  status: string | null;
  authority: string | null;
  memory_scope: string | null;
  assignment_policy: string | null;
  enabled: boolean | null;
};

type ProjectOperatorAgent = {
  operator_id: string;
  project_key: string;
  project_path: string;
  absolute_path: string;
  owner_department: "OPS";
  enabled: boolean;
  status: "active" | "disabled-candidate" | "missing";
  authority: "operations-only";
  memory_scope: string;
  assignment_policy: string;
  implementation_delegate: "IMPLEMENT";
  can_create_read_persona: true;
  can_create_write_persona: false;
  can_write_repo: false;
  db_project_id: string | null;
  db_project_name: string | null;
  project_type: string | null;
  project_status: string | null;
  lifecycle_status: ProjectLifecycleStatus;
  filter_group: string | null;
  default_visible: boolean;
  has_agents: boolean | null;
  git_status: RegistryProject["git"]["status"];
  git_branch: string | null;
  link_status: ControlPlaneProjectLink["link_status"];
  memory_tabs: string[];
  risk_flags: string[];
  notes: string | null;
};

type RepoEstateDiscovery = {
  name: string;
  path: string;
  absolute_path: string;
  classification: "registered" | "candidate" | "excluded";
  registry_key: string | null;
  reason: string;
};

type DbProjectProjection = {
  id: string;
  name: string;
  project_path: string;
  classification: "linked" | "legacy-runtime" | "repo-estate-unregistered" | "outside-repo-estate";
  linked_registry_key: string | null;
};

type ControlPlaneProjectLink = {
  id: string;
  registry_key: string;
  registry_path: string;
  absolute_path: string;
  registry_type: string | null;
  db_project_id: string | null;
  db_project_name: string | null;
  link_status: "linked" | "unlinked" | "missing" | "not-git" | "candidate";
  notes: string | null;
  payload: Record<string, unknown>;
};

type ControlPlaneSpecTaskLink = {
  id: string;
  spec_id: string;
  task_key: string;
  requirement_refs: string[];
  status: string | null;
  evidence_refs: string[];
  payload: Record<string, unknown>;
};

type ControlPlaneSyncPreview = {
  ok: true;
  mode: "preview";
  writes: false;
  approved_for_apply: boolean;
  snapshot: {
    id: string;
    root_path: string;
    repo_estate_root: string;
    active_spec_id: string | null;
    projects_yaml_hash: string | null;
    active_spec_hash: string | null;
    registry_project_count: number;
    db_project_count: number;
    unlinked_registry_count: number;
  };
  counts: {
    project_links: number;
    linked: number;
    unlinked: number;
    missing: number;
    not_git: number;
    candidate: number;
    spec_task_links: number;
  };
  project_links: ControlPlaneProjectLink[];
  spec_task_links: ControlPlaneSpecTaskLink[];
};

type DepartmentAgentManifest = {
  id: "CONTROL" | "SPEC" | "EXPLORE" | "IMPLEMENT" | "REVIEW" | "OPS";
  file: string;
  name: string;
  description: string;
  sandbox_mode: string;
  role: string;
  write_policy: string;
  can_spawn_read_persona: boolean;
  can_spawn_write_persona: boolean;
  canonical: boolean;
};

type MasterDepartmentAgent = {
  id: string;
  label: string;
  short_label: string;
  accent: string;
  mission: string;
  memory_scope: string;
  memory_focus: string;
  internal_roles: DepartmentAgentManifest["id"][];
  can_create_read_persona: boolean;
  can_create_write_persona: boolean;
  write_boundary: string;
  external_sources?: string[];
};

type RunnerStatus = {
  tables_exist: boolean;
  latest_run: Record<string, unknown> | null;
  run_counts: Record<string, number>;
  persona_counts: Record<string, number>;
  recent_runs: Record<string, unknown>[];
  recent_personas: Record<string, unknown>[];
  recent_events: Record<string, unknown>[];
};

type HarnessCheckStatus = "pass" | "warn" | "blocked" | "planned";

type HarnessCheck = {
  key: string;
  label: string;
  status: HarnessCheckStatus;
  detail: string;
  next_safe_action: string;
};

type HarnessBlueprintTargetMode = "department" | "project" | "both";
type HarnessBlueprintPattern =
  | "auto"
  | "pipeline"
  | "fan-out-fan-in"
  | "expert-pool"
  | "producer-reviewer"
  | "supervisor"
  | "hierarchical-delegation";

type HarnessBlueprintStatus = {
  tables_exist: boolean;
  draft_count: number;
  department_draft_count: number;
  project_draft_count: number;
  evidence_backed_count: number;
  latest_blueprints: Record<string, unknown>[];
};

type EngineProvider = "codex_exec" | "codex_app_server" | "claude" | "agy" | "hermes";
type EngineRunStatus =
  | "planned"
  | "approval_required"
  | "running"
  | "syncing"
  | "completed"
  | "blocked"
  | "failed"
  | "stale";
type EngineEventType =
  | "route_decided"
  | "thread_started"
  | "turn_started"
  | "approval_requested"
  | "output_delta"
  | "completed"
  | "failed"
  | "cancelled"
  | "reconciled";

type EngineSyncStatus = {
  tables_exist: boolean;
  provider_status: Array<{
    provider: EngineProvider;
    label: string;
    available: boolean;
    mode: "enabled" | "preview" | "blocked" | "unavailable";
    detail: string;
  }>;
  run_counts: Record<string, number>;
  link_counts: Record<string, number>;
  recent_runs: Record<string, unknown>[];
  recent_events: Record<string, unknown>[];
  recent_thread_links: Record<string, unknown>[];
  app_server_poc: {
    approved: boolean;
    mode: "blocked" | "read-only-poc";
    detail: string;
  };
};

type Master95GateStatus = "pass" | "warn" | "pending" | "fail";

type Master95HardGate = {
  id: string;
  name: string;
  required: boolean;
  status: Master95GateStatus;
  failure_effect: string | null;
  evidence_refs: string[];
};

type Master95EvidenceRef = {
  id: string;
  kind: string;
  status: string;
  path: string | null;
  summary: string | null;
};

type Master95RequirementTrace = {
  id: string;
  title: string;
  priority: string;
  status: string;
  design_refs: string[];
  interfaces: string[];
  tests: string[];
  evidence_refs: string[];
};

type Master95Scorecard = {
  spec_id: string;
  certification_state: string;
  targets: {
    design_specification: number;
    implementation_execution_evidence: number;
    aggregate: number;
    agy_each_axis_minimum: number;
  };
  aggregate_formula: Record<string, unknown>;
  docs: DocStatus[];
  hard_gates: Master95HardGate[];
  evidence_refs: Master95EvidenceRef[];
  source_files: Record<string, string>;
};

const master95DocStatusSchema = z
  .object({
    key: z.string(),
    path: z.string(),
    exists: z.boolean(),
    size: z.number().nullable(),
    mtime: z.string().nullable(),
    sha256: z.string().nullable(),
    parse_status: z.enum(["ok", "missing", "error"]).optional(),
    error: z.string().optional(),
  })
  .passthrough();

const master95HardGateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  required: z.boolean(),
  status: z.enum(["pass", "warn", "pending", "fail"]),
  failure_effect: z.string().nullable(),
  evidence_refs: z.array(z.string()),
});

const master95EvidenceRefSchema = z.object({
  id: z.string().min(1),
  kind: z.string(),
  status: z.string(),
  path: z.string().nullable(),
  summary: z.string().nullable(),
});

const master95RequirementTraceSchema = z.object({
  id: z.string().regex(/^M95-R[0-9]+$/),
  title: z.string(),
  priority: z.string(),
  status: z.string(),
  design_refs: z.array(z.string()),
  interfaces: z.array(z.string()),
  tests: z.array(z.string()),
  evidence_refs: z.array(z.string()),
});

const master95ScorecardSchema = z.object({
  spec_id: z.literal(MASTER95_SPEC_ID),
  certification_state: z.string().min(1),
  targets: z.object({
    design_specification: z.number(),
    implementation_execution_evidence: z.number(),
    aggregate: z.number(),
    agy_each_axis_minimum: z.number(),
  }),
  aggregate_formula: z.record(z.string(), z.unknown()),
  docs: z.array(master95DocStatusSchema),
  hard_gates: z.array(master95HardGateSchema),
  evidence_refs: z.array(master95EvidenceRefSchema),
  source_files: z.record(z.string(), z.string()),
});

const master95BloggerGentOpsSchema = z.object({
  department: z.literal("OPS"),
  project_id: z.literal("project:BloggerGent"),
  project_key: z.literal("BloggerGent"),
  mode: z.literal("read-only-dry-run-routing-preview"),
  role_agents: z.array(z.string()).length(7),
  lanes: z
    .array(
      z.object({
        lane_id: z.string(),
        group_id: z.string(),
        role_agent: z.string(),
        channel_ref: z.string().nullable(),
        metadata_tags: z.array(z.string()),
        operating_mode: z.enum(["read-only", "dry-run", "approval-gated"]),
      }),
    )
    .length(8),
  implementation_delegate: z.literal("IMPLEMENT"),
  review_delegate: z.literal("REVIEW"),
  approval_owner: z.literal("CONTROL"),
  separately_approved_operations: z.array(z.string()),
});

const master95TraceabilitySchema = z.object({
  spec_id: z.literal(MASTER95_SPEC_ID),
  generated_at: z.string(),
  source_file: z.string(),
  requirements: z.array(master95RequirementTraceSchema),
  counts: z.object({
    total: z.number(),
    implemented: z.number(),
    in_progress: z.number(),
    planned: z.number(),
    orphan_evidence: z.number(),
  }),
  orphan_requirements: z.array(z.string()),
});

type CodexThreadScopeType = "root" | "project" | "spec";
type ControlPlaneMutationOperationClass =
  | "harness-run"
  | "harness-meta"
  | "harness-apply"
  | "persona-evidence"
  | "agentmemory-remember-non-destructive"
  | "db-write-non-destructive"
  | "agentmemory-runtime-connect"
  | "codex-engine-sync"
  | "codex-app-server-poc";

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

function isSafeSpecId(value: string | null): value is string {
  return Boolean(value && /^[0-9]{8}-[a-z0-9][a-z0-9-]*$/.test(value));
}

function resolveInside(base: string, relativePath: string): string | null {
  if (!relativePath) return null;
  const resolved = path.isAbsolute(relativePath) ? path.resolve(relativePath) : path.resolve(base, relativePath);
  return isInside(base, resolved) ? resolved : null;
}

function fileStatus(key: string, filePath: string, parseStatus?: DocStatus["parse_status"]): DocStatus {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        key,
        path: filePath,
        exists: false,
        size: null,
        mtime: null,
        sha256: null,
        parse_status: parseStatus ?? "missing",
      };
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return {
        key,
        path: filePath,
        exists: true,
        size: stat.size,
        mtime: toIso(stat.mtimeMs),
        sha256: null,
        parse_status: parseStatus ?? "ok",
      };
    }
    const bytes = fs.readFileSync(filePath);
    return {
      key,
      path: filePath,
      exists: true,
      size: stat.size,
      mtime: toIso(stat.mtimeMs),
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      parse_status: parseStatus ?? "ok",
    };
  } catch (error) {
    return {
      key,
      path: filePath,
      exists: false,
      size: null,
      mtime: null,
      sha256: null,
      parse_status: "error",
      error: safeError(error),
    };
  }
}

function readText(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function readJsonObject(filePath: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readText(filePath));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function unquoteScalar(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function normalizeGateStatus(value: unknown): Master95GateStatus {
  const status = String(value ?? "pending")
    .trim()
    .toLowerCase();
  if (status === "pass" || status === "warn" || status === "fail" || status === "pending") return status;
  if (status === "implemented" || status === "recorded") return "pass";
  if (status === "partial" || status === "referenced" || status === "in_progress") return "warn";
  return "pending";
}

function parseMaster95EvidenceIndex(raw: string): {
  certification_state: string | null;
  evidence: Master95EvidenceRef[];
  hard_gates: Record<string, Master95GateStatus>;
} {
  const lines = raw.split(/\r?\n/);
  const evidence: Master95EvidenceRef[] = [];
  const hardGates: Record<string, Master95GateStatus> = {};
  let current: Master95EvidenceRef | null = null;
  let inEvidence = false;
  let inHardGates = false;
  let certificationState: string | null = null;

  for (const line of lines) {
    const topLevel = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (topLevel) {
      const [, key, value] = topLevel;
      if (key === "certification_state") certificationState = unquoteScalar(value);
      inEvidence = key === "evidence";
      inHardGates = key === "hard_gates";
      if (key !== "evidence" && current) {
        evidence.push(current);
        current = null;
      }
      continue;
    }

    const itemMatch = line.match(/^\s{2}-\s+id:\s*(.+)$/);
    if (inEvidence && itemMatch) {
      if (current) evidence.push(current);
      current = { id: unquoteScalar(itemMatch[1]), kind: "", status: "", path: null, summary: null };
      continue;
    }

    const fieldMatch = line.match(/^\s{4}([A-Za-z0-9_]+):\s*(.*)$/);
    if (inEvidence && current && fieldMatch) {
      const [, key, value] = fieldMatch;
      const scalar = unquoteScalar(value);
      if (key === "kind") current.kind = scalar;
      if (key === "status") current.status = scalar;
      if (key === "path") current.path = scalar || null;
      if (key === "summary") current.summary = scalar || null;
      continue;
    }

    const gateMatch = line.match(/^\s{2}([A-Za-z0-9_]+):\s*(.+)$/);
    if (inHardGates && gateMatch) {
      hardGates[gateMatch[1]] = normalizeGateStatus(gateMatch[2]);
    }
  }
  if (current) evidence.push(current);

  return { certification_state: certificationState, evidence, hard_gates: hardGates };
}

function parseMaster95Traceability(raw: string): Master95RequirementTrace[] {
  const requirements: Master95RequirementTrace[] = [];
  let current: Master95RequirementTrace | null = null;
  let listKey: keyof Pick<Master95RequirementTrace, "design_refs" | "interfaces" | "tests" | "evidence_refs"> | null =
    null;

  for (const line of raw.split(/\r?\n/)) {
    const itemMatch = line.match(/^\s{2}-\s+id:\s*(M95-R[0-9]+)$/);
    if (itemMatch) {
      if (current) requirements.push(current);
      current = {
        id: itemMatch[1],
        title: "",
        priority: "",
        status: "",
        design_refs: [],
        interfaces: [],
        tests: [],
        evidence_refs: [],
      };
      listKey = null;
      continue;
    }
    if (!current) continue;

    const fieldMatch = line.match(/^\s{4}([A-Za-z0-9_]+):\s*(.*)$/);
    if (fieldMatch) {
      const [, key, value] = fieldMatch;
      const scalar = unquoteScalar(value);
      if (key === "title") current.title = scalar;
      else if (key === "priority") current.priority = scalar;
      else if (key === "status") current.status = scalar;
      else if (key === "design_refs" || key === "interfaces" || key === "tests" || key === "evidence_refs") {
        listKey = key;
        current[listKey] = scalar === "[]" ? [] : current[listKey];
      } else {
        listKey = null;
      }
      continue;
    }

    const listItem = line.match(/^\s{6}-\s*(.+)$/);
    if (listKey && listItem) current[listKey].push(unquoteScalar(listItem[1]));
  }
  if (current) requirements.push(current);
  return requirements;
}

function buildMaster95Scorecard(): Master95Scorecard {
  const rulesPath = path.join(MASTER95_QUALITY_ROOT, "SCORING_RULES.json");
  const evidencePath = path.join(MASTER95_QUALITY_ROOT, "EVIDENCE_INDEX.yaml");
  const rules = readJsonObject(rulesPath);
  const targets = (rules.targets && typeof rules.targets === "object" ? rules.targets : {}) as Record<string, unknown>;
  const evidenceIndex = parseMaster95EvidenceIndex(readText(evidencePath));
  const ruleGates = Array.isArray(rules.hard_gates) ? (rules.hard_gates as Record<string, unknown>[]) : [];
  const hardGates = ruleGates.map((gate) => {
    const name = String(gate.name ?? "");
    return {
      id: String(gate.id ?? name),
      name,
      required: gate.required !== false,
      status: evidenceIndex.hard_gates[name] ?? "pending",
      failure_effect: typeof gate.failure_effect === "string" ? gate.failure_effect : null,
      evidence_refs: evidenceIndex.evidence.map((item) => item.id),
    };
  });

  const scorecard = {
    spec_id: MASTER95_SPEC_ID,
    certification_state:
      typeof rules.certification_state === "string"
        ? rules.certification_state
        : (evidenceIndex.certification_state ?? "not_certified_foundation_in_progress"),
    targets: {
      design_specification: Number(targets.design_specification ?? 98),
      implementation_execution_evidence: Number(targets.implementation_execution_evidence ?? 97),
      aggregate: Number(targets.aggregate ?? 97.45),
      agy_each_axis_minimum: Number(targets.agy_each_axis_minimum ?? 950),
    },
    aggregate_formula:
      rules.aggregate_formula && typeof rules.aggregate_formula === "object" && !Array.isArray(rules.aggregate_formula)
        ? (rules.aggregate_formula as Record<string, unknown>)
        : {},
    docs: MASTER95_QUALITY_FILES.map((file) => fileStatus(file, path.join(MASTER95_QUALITY_ROOT, file))),
    hard_gates: hardGates,
    evidence_refs: evidenceIndex.evidence,
    source_files: {
      scorecard: path.join(MASTER95_QUALITY_ROOT, "QUALITY_SCORECARD.md"),
      scoring_rules: rulesPath,
      evidence_index: evidencePath,
      traceability: path.join(MASTER95_QUALITY_ROOT, "requirements-traceability.yaml"),
    },
  };
  return master95ScorecardSchema.parse(scorecard) as Master95Scorecard;
}

function buildMaster95Traceability() {
  const requirements = parseMaster95Traceability(
    readText(path.join(MASTER95_QUALITY_ROOT, "requirements-traceability.yaml")),
  );
  const orphanRequirements = requirements.filter((requirement) => requirement.evidence_refs.length === 0);
  const traceability = {
    spec_id: MASTER95_SPEC_ID,
    generated_at: new Date().toISOString(),
    source_file: path.join(MASTER95_QUALITY_ROOT, "requirements-traceability.yaml"),
    requirements,
    counts: {
      total: requirements.length,
      implemented: requirements.filter((requirement) => requirement.status === "implemented").length,
      in_progress: requirements.filter((requirement) => requirement.status === "in_progress").length,
      planned: requirements.filter((requirement) => requirement.status === "planned").length,
      orphan_evidence: orphanRequirements.length,
    },
    orphan_requirements: orphanRequirements.map((requirement) => requirement.id),
  };
  return master95TraceabilitySchema.parse(traceability);
}

function buildMaster95Status() {
  const activeSpec = buildActiveSpecStatus();
  const specDocs = VER1_REQUIRED_SPEC_DOCS.map((file) => fileStatus(file, path.join(MASTER95_SPEC_DIR, file)));
  const qualityDocs = MASTER95_QUALITY_FILES.map((file) => fileStatus(file, path.join(MASTER95_QUALITY_ROOT, file)));
  const changes = readGitShortStatus(RUNTIME_PROJECTION_APP);
  const scorecard = buildMaster95Scorecard();
  const traceability = buildMaster95Traceability();
  const agentRegistry = createMaster95DefaultAgentRegistry();
  const missingDocs = [...specDocs, ...qualityDocs].filter((doc) => !doc.exists).map((doc) => doc.path);
  const livePilotProjection = CONTROL_PLANE_FAST_TEST_MODE
    ? {
        source_path: "test-mode",
        event_source_path: "test-mode",
        mode: "read-only" as const,
        available: false,
        parse_error_count: 0,
        event_parse_error_count: 0,
        message: "테스트 모드에서는 외부 E: runtime 읽기를 생략합니다.",
        run_summaries: [] as Master95RunSummary[],
      }
    : readLivePilotProjection();

  return {
    spec_id: MASTER95_SPEC_ID,
    generated_at: new Date().toISOString(),
    phase: "phase-2-runtime-alpha-in-progress",
    certification_state: scorecard.certification_state,
    root_active_spec_id: activeSpec.id,
    active_spec_is_master95: activeSpec.id === MASTER95_SPEC_ID,
    companion_mode: activeSpec.id !== MASTER95_SPEC_ID,
    spec_dir: MASTER95_SPEC_DIR,
    quality_root: MASTER95_QUALITY_ROOT,
    docs: {
      spec: specDocs,
      quality: qualityDocs,
      missing_count: missingDocs.length,
      missing: missingDocs,
    },
    dirty_worktree: {
      repo: RUNTIME_PROJECTION_APP,
      count: changes.length,
      untracked_count: changes.filter((change) => change.status === "??").length,
      grouped_changes: summarizeHygieneGroups(changes),
      policy: "local workspace inventory guardrail; no source reset/restore/delete without separate approval",
    },
    approvals_required: [
      "_active.md switch",
      "legacy asset deletion",
      "DB migration/apply/reset",
      "Docker destructive operation",
      "AgentMemory runtime start/connect/write capture",
      "deploy",
      "secrets/OAuth mutation",
    ],
    scorecard_summary: {
      targets: scorecard.targets,
      hard_gate_count: scorecard.hard_gates.length,
      blocking_gate_count: scorecard.hard_gates.filter((gate) => gate.required && gate.status !== "pass").length,
    },
    traceability_summary: traceability.counts,
    agent_versions: agentRegistry.listRecords().map((record) => {
      const manifest = agentRegistry.getManifest(record.agent_id, record.version);
      return {
        ...record,
        manifest_id: manifest?.manifest_id ?? null,
        display_name: manifest?.display_name ?? record.agent_id,
        rollback_target_version: manifest?.rollback_target_version ?? null,
      };
    }),
    live_pilot_projection: {
      source_path: livePilotProjection.source_path,
      event_source_path: livePilotProjection.event_source_path,
      mode: livePilotProjection.mode,
      available: livePilotProjection.available,
      parse_error_count: livePilotProjection.parse_error_count,
      event_parse_error_count: livePilotProjection.event_parse_error_count,
      message: livePilotProjection.message,
    },
    run_summaries: livePilotProjection.run_summaries,
    bloggergent_ops: master95BloggerGentOpsSchema.parse({
      department: "OPS",
      project_id: "project:BloggerGent",
      project_key: "BloggerGent",
      mode: "read-only-dry-run-routing-preview",
      role_agents: MASTER95_BLOGGERGENT_ROLE_AGENTS,
      lanes: MASTER95_BLOGGERGENT_LANES.map((lane) => ({
        lane_id: lane.lane_id,
        group_id: lane.group_id,
        role_agent: lane.role_agent,
        channel_ref: lane.channel_ref,
        metadata_tags: lane.metadata_tags,
        operating_mode: lane.operating_mode,
      })),
      implementation_delegate: "IMPLEMENT",
      review_delegate: "REVIEW",
      approval_owner: "CONTROL",
      separately_approved_operations: ["live publish", "DB write", "Docker", "deploy", "Git commit/push"],
    }),
    next_safe_action: "Continue Phase 2 runtime alpha under repo-map and local workspace inventory guardrails.",
  };
}

function stripMarkdownHtmlComments(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, "");
}

function extractMarkdownSection(raw: string, heading: string): string {
  const lines = raw.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start < 0) return raw;
  const sectionLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break;
    sectionLines.push(line);
  }
  return sectionLines.join("\n");
}

function parseActiveSpec(raw: string) {
  const cleaned = stripMarkdownHtmlComments(raw);
  const currentSection = extractMarkdownSection(cleaned, "Current Active Spec");
  const matchField = (label: string) => {
    const match = currentSection.match(new RegExp(`^- ${label}:\\s*(.+)$`, "m"));
    return match?.[1]?.trim().replace(/^`|`$/g, "") ?? null;
  };
  const nextActionMatch = cleaned.match(/## Next Recommended Action\s+([\s\S]*?)(?:\n## |\s*$)/);
  return {
    id: matchField("Spec ID"),
    status: matchField("Status"),
    phase: matchField("Phase"),
    related_repo: matchField("Related repo"),
    next_recommended_action: nextActionMatch?.[1]?.trim() ?? null,
  };
}

function resolveVer1SpecId(activeSpecId: string | null): string {
  if (activeSpecId && /-v1$/.test(activeSpecId)) return activeSpecId;
  return VER1_FALLBACK_SPEC_ID;
}

function parseSimpleProjectsYaml(raw: string): Array<{
  key: string;
  path: string;
  type: string | null;
  has_agents: boolean | null;
  status: string | null;
  filter_group: string | null;
  default_visible: boolean | null;
  summary: string | null;
  operation_agent: ProjectOperationAgentConfig | null;
}> {
  const lines = raw.split(/\r?\n/);
  const projects: Array<{
    key: string;
    path: string;
    type: string | null;
    has_agents: boolean | null;
    status: string | null;
    filter_group: string | null;
    default_visible: boolean | null;
    summary: string | null;
    operation_agent: ProjectOperationAgentConfig | null;
  }> = [];
  let inProjects = false;
  let current: (typeof projects)[number] | null = null;
  let inOperationAgent = false;
  const parseYamlBool = (value: string): boolean | null => (value === "true" ? true : value === "false" ? false : null);

  for (const line of lines) {
    if (/^projects:\s*$/.test(line)) {
      inProjects = true;
      continue;
    }
    if (!inProjects) continue;
    const projectMatch = line.match(/^ {2}([^:\s][^:]*):\s*$/);
    if (projectMatch) {
      if (current) projects.push(current);
      current = {
        key: projectMatch[1].trim(),
        path: "",
        type: null,
        has_agents: null,
        status: null,
        filter_group: null,
        default_visible: null,
        summary: null,
        operation_agent: null,
      };
      inOperationAgent = false;
      continue;
    }
    if (!current) continue;
    const agentFieldMatch = line.match(/^ {6}([a-zA-Z0-9_]+):\s*(.*)$/);
    if (inOperationAgent && agentFieldMatch) {
      const field = agentFieldMatch[1] as keyof ProjectOperationAgentConfig;
      const value = agentFieldMatch[2].trim().replace(/^["']|["']$/g, "");
      if (!current.operation_agent) {
        current.operation_agent = {
          operator_id: null,
          project_key: null,
          owner_department: null,
          status: null,
          authority: null,
          memory_scope: null,
          assignment_policy: null,
          enabled: null,
        };
      }
      if (field === "enabled") {
        current.operation_agent.enabled = parseYamlBool(value);
      } else if (field in current.operation_agent) {
        current.operation_agent[field] = value as never;
      }
      continue;
    }
    const fieldMatch = line.match(/^ {4}([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!fieldMatch) continue;
    const field = fieldMatch[1];
    const value = fieldMatch[2].trim().replace(/^["']|["']$/g, "");
    inOperationAgent = field === "operation_agent";
    if (inOperationAgent) {
      current.operation_agent = {
        operator_id: null,
        project_key: null,
        owner_department: null,
        status: null,
        authority: null,
        memory_scope: null,
        assignment_policy: null,
        enabled: null,
      };
      continue;
    }
    if (field === "path") current.path = value;
    if (field === "type") current.type = value;
    if (field === "status") current.status = value;
    if (field === "filter_group") current.filter_group = value;
    if (field === "default_visible") current.default_visible = parseYamlBool(value);
    if (field === "summary") current.summary = value;
    if (field === "has_agents") current.has_agents = parseYamlBool(value);
  }
  if (current) projects.push(current);
  return projects.filter((project) => project.key && project.path);
}

function normalizeProjectLifecycleStatus(
  status: string | null,
  operationAgent: ProjectOperationAgentConfig | null,
  type: string | null,
): ProjectLifecycleStatus {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();
  if (
    normalized === "completed" ||
    normalized === "archived" ||
    normalized === "candidate" ||
    normalized === "active"
  ) {
    return normalized;
  }
  if (operationAgent?.enabled === false || type === "runtime-artifact") return "candidate";
  return "active";
}

function inspectGit(projectPath: string): RegistryProject["git"] {
  if (!fs.existsSync(projectPath)) {
    return {
      is_repo: false,
      branch: null,
      ahead: 0,
      behind: 0,
      dirty_count: 0,
      untracked_count: 0,
      status: "missing",
      error: null,
    };
  }

  if (CONTROL_PLANE_FAST_TEST_MODE) {
    const isRepo = fs.existsSync(path.join(projectPath, ".git"));
    return {
      is_repo: isRepo,
      branch: null,
      ahead: 0,
      behind: 0,
      dirty_count: 0,
      untracked_count: 0,
      status: isRepo ? "clean" : "not_git",
      error: null,
    };
  }

  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: projectPath, timeout: 5000, stdio: "pipe" });
  } catch {
    return {
      is_repo: false,
      branch: null,
      ahead: 0,
      behind: 0,
      dirty_count: 0,
      untracked_count: 0,
      status: "not_git",
      error: null,
    };
  }

  try {
    const output = execFileSync("git", ["status", "--short", "--branch"], {
      cwd: projectPath,
      timeout: 8000,
      stdio: "pipe",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    })
      .toString("utf8")
      .trim();
    const lines = output ? output.split(/\r?\n/) : [];
    const branchLine = lines[0] ?? "";
    const branchMatch = branchLine.match(/^##\s+([^\s.]+|[^\s]+?)(?:\.\.\.[^\s]+)?(?:\s+\[(.*?)\])?/);
    const divergence = branchMatch?.[2] ?? "";
    const ahead = Number(divergence.match(/ahead\s+(\d+)/)?.[1] ?? 0);
    const behind = Number(divergence.match(/behind\s+(\d+)/)?.[1] ?? 0);
    const changes = lines.slice(1);
    const untrackedCount = changes.filter((line) => line.startsWith("??")).length;
    return {
      is_repo: true,
      branch: branchMatch?.[1] ?? null,
      ahead,
      behind,
      dirty_count: changes.length,
      untracked_count: untrackedCount,
      status: changes.length > 0 ? "dirty" : "clean",
      error: null,
    };
  } catch (error) {
    return {
      is_repo: true,
      branch: null,
      ahead: 0,
      behind: 0,
      dirty_count: 0,
      untracked_count: 0,
      status: "dirty",
      error: safeError(error),
    };
  }
}

function readGitShortStatus(projectPath: string): Array<{ raw: string; path: string; status: string; group: string }> {
  if (!fs.existsSync(projectPath)) return [];
  if (CONTROL_PLANE_FAST_TEST_MODE) return [];
  try {
    const output = execFileSync("git", ["status", "--short"], {
      cwd: projectPath,
      timeout: 8000,
      stdio: "pipe",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    })
      .toString("utf8")
      .replace(/\s+$/, "");
    if (!output) return [];
    return output.split(/\r?\n/).map((line) => {
      const status = line.slice(0, 2).trim() || "modified";
      const rawPath = line.slice(3).trim();
      const normalized = rawPath.replace(/\\/g, "/");
      return {
        raw: line,
        path: rawPath,
        status,
        group: classifyHygienePath(normalized),
      };
    });
  } catch {
    return [];
  }
}

function classifyHygienePath(relativePath: string): string {
  if (/^\.tmp-|\/\.tmp-|\.png$/i.test(relativePath)) return "generated-artifacts/screenshots";
  if (
    /^server\/modules\/routes\/ops\/control-plane/i.test(relativePath) ||
    /^src\/api\/control-plane/i.test(relativePath)
  )
    return "harness-candidate";
  if (
    /^src\/components\/ControlPlanePage/i.test(relativePath) ||
    /^src\/app\//i.test(relativePath) ||
    /^src\/styles\//i.test(relativePath)
  )
    return "ui-candidate";
  if (/^agents\//i.test(relativePath) || /^AGENTS\.md$/i.test(relativePath)) return "agent-directory-migration";
  if (/^docs\//i.test(relativePath)) return "docs-candidate";
  return "unrelated-unknown";
}

function summarizeHygieneGroups(changes: ReturnType<typeof readGitShortStatus>) {
  const grouped = new Map<string, { count: number; samples: string[] }>();
  for (const change of changes) {
    const current = grouped.get(change.group) ?? { count: 0, samples: [] };
    current.count += 1;
    if (current.samples.length < 5) current.samples.push(change.path);
    grouped.set(change.group, current);
  }
  return Array.from(grouped.entries()).map(([group, value]) => ({ group, ...value }));
}

function readDbProjectRows(db: RuntimeContext["db"]) {
  try {
    return db.prepare("SELECT id, name, project_path FROM projects").all() as Array<{
      id: string;
      name: string;
      project_path: string;
    }>;
  } catch {
    return [];
  }
}

function readDbProjects(db: RuntimeContext["db"]) {
  try {
    const rows = readDbProjectRows(db);
    const byPath = new Map<string, { id: string; name: string }>();
    for (const row of rows) {
      if (!row.project_path) continue;
      byPath.set(normalizeSlashes(path.resolve(row.project_path)), { id: row.id, name: row.name });
    }
    return byPath;
  } catch {
    return new Map<string, { id: string; name: string }>();
  }
}

function buildDbProjectProjections(
  dbRows: ReturnType<typeof readDbProjectRows>,
  registryByPath: Map<string, string>,
): DbProjectProjection[] {
  return dbRows.map((row) => {
    const resolved = row.project_path ? path.resolve(row.project_path) : "";
    const normalized = normalizeSlashes(resolved);
    const linkedRegistryKey = registryByPath.get(normalized) ?? null;
    const classification: DbProjectProjection["classification"] = linkedRegistryKey
      ? "linked"
      : /[/\\]runtime[/\\]/i.test(row.project_path)
        ? "legacy-runtime"
        : isInside(REPO_ESTATE_ROOT, resolved)
          ? "repo-estate-unregistered"
          : "outside-repo-estate";
    return {
      id: row.id,
      name: row.name,
      project_path: row.project_path,
      classification,
      linked_registry_key: linkedRegistryKey,
    };
  });
}

function tableExists(db: RuntimeContext["db"], tableName: string): boolean {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as
      | { name?: string }
      | undefined;
    return row?.name === tableName;
  } catch {
    return false;
  }
}

function readControlSyncStatus(db: RuntimeContext["db"]) {
  const requiredTables = ["control_plane_snapshots", "control_plane_project_links", "control_plane_spec_task_links"];
  const tables = Object.fromEntries(requiredTables.map((name) => [name, tableExists(db, name)]));
  const tablesExist = Object.values(tables).every(Boolean);
  if (!tablesExist) {
    return {
      tables_exist: false,
      tables,
      latest_snapshot: null,
      project_link_counts: {},
      spec_task_count: 0,
    };
  }

  try {
    const latestSnapshot =
      (db
        .prepare(
          `SELECT id, root_path, repo_estate_root, active_spec_id, registry_project_count, db_project_count,
                  unlinked_registry_count, created_at, updated_at
             FROM control_plane_snapshots
            ORDER BY updated_at DESC
            LIMIT 1`,
        )
        .get() as Record<string, unknown> | undefined) ?? null;
    const linkRows = db
      .prepare("SELECT link_status, COUNT(*) AS count FROM control_plane_project_links GROUP BY link_status")
      .all() as Array<{ link_status: string; count: number }>;
    const specTaskCountRow = db.prepare("SELECT COUNT(*) AS count FROM control_plane_spec_task_links").get() as
      | { count?: number }
      | undefined;
    return {
      tables_exist: true,
      tables,
      latest_snapshot: latestSnapshot,
      project_link_counts: Object.fromEntries(linkRows.map((row) => [row.link_status, row.count])),
      spec_task_count: Number(specTaskCountRow?.count ?? 0),
    };
  } catch (error) {
    return {
      tables_exist: true,
      tables,
      latest_snapshot: null,
      project_link_counts: {},
      spec_task_count: 0,
      error: safeError(error),
    };
  }
}

function ensureControlSyncTables(db: RuntimeContext["db"]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS control_plane_snapshots (
      id TEXT PRIMARY KEY,
      root_path TEXT NOT NULL,
      repo_estate_root TEXT NOT NULL,
      active_spec_id TEXT,
      projects_yaml_hash TEXT,
      active_spec_hash TEXT,
      registry_project_count INTEGER NOT NULL DEFAULT 0,
      db_project_count INTEGER NOT NULL DEFAULT 0,
      unlinked_registry_count INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS control_plane_project_links (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      registry_key TEXT NOT NULL UNIQUE,
      registry_path TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      registry_type TEXT,
      db_project_id TEXT,
      db_project_name TEXT,
      link_status TEXT NOT NULL CHECK (link_status IN ('linked', 'unlinked', 'missing', 'not-git', 'candidate')),
      notes TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (snapshot_id) REFERENCES control_plane_snapshots(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS control_plane_spec_task_links (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      spec_id TEXT NOT NULL,
      task_key TEXT NOT NULL,
      requirement_refs_json TEXT NOT NULL DEFAULT '[]',
      status TEXT,
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (spec_id, task_key),
      FOREIGN KEY (snapshot_id) REFERENCES control_plane_snapshots(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_control_plane_snapshots_updated
      ON control_plane_snapshots(updated_at);
    CREATE INDEX IF NOT EXISTS idx_control_plane_project_links_snapshot
      ON control_plane_project_links(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_control_plane_project_links_status
      ON control_plane_project_links(link_status);
    CREATE INDEX IF NOT EXISTS idx_control_plane_spec_task_links_snapshot
      ON control_plane_spec_task_links(snapshot_id);
  `);
}

function ensureControlRunnerTables(db: RuntimeContext["db"]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS control_plane_agent_runs (
      id TEXT PRIMARY KEY,
      spec_id TEXT,
      task_id TEXT,
      department_agent TEXT NOT NULL,
      status TEXT NOT NULL,
      objective TEXT NOT NULL,
      context_pack_json TEXT NOT NULL DEFAULT '{}',
      approval_refs_json TEXT NOT NULL DEFAULT '[]',
      hook_decisions_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS control_plane_routing_decisions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      spec_id TEXT,
      selected_department TEXT NOT NULL,
      selected_repo TEXT,
      persona_needed INTEGER NOT NULL DEFAULT 0,
      confidence TEXT NOT NULL DEFAULT 'medium',
      evidence_json TEXT NOT NULL DEFAULT '[]',
      rejection_reason TEXT,
      approval_refs_json TEXT NOT NULL DEFAULT '[]',
      next_safe_action TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES control_plane_agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS control_plane_persona_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      spec_id TEXT,
      task_id TEXT,
      parent_agent TEXT NOT NULL,
      persona_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      objective TEXT NOT NULL,
      input_docs_json TEXT NOT NULL DEFAULT '[]',
      allowed_paths_json TEXT NOT NULL DEFAULT '{}',
      write_policy TEXT NOT NULL,
      return_schema_json TEXT NOT NULL DEFAULT '[]',
      expiry TEXT NOT NULL DEFAULT 'single-task',
      quality_bar TEXT NOT NULL,
      recreate_policy TEXT NOT NULL,
      recreate_count INTEGER NOT NULL DEFAULT 0,
      max_recreate_attempts INTEGER NOT NULL DEFAULT 2,
      approval_ref TEXT,
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES control_plane_agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS control_plane_persona_events (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      decision TEXT,
      reason TEXT,
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      source_hash TEXT,
      merged_into TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (persona_id) REFERENCES control_plane_persona_runs(persona_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_control_plane_agent_runs_updated
      ON control_plane_agent_runs(updated_at);
    CREATE INDEX IF NOT EXISTS idx_control_plane_persona_runs_run
      ON control_plane_persona_runs(run_id);
    CREATE INDEX IF NOT EXISTS idx_control_plane_persona_events_run
      ON control_plane_persona_events(run_id);
  `);
}

function ensureHarnessBlueprintTables(db: RuntimeContext["db"]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS control_plane_harness_blueprints (
      id TEXT PRIMARY KEY,
      spec_id TEXT,
      target_scope_type TEXT NOT NULL,
      target_scope_key TEXT,
      source_description TEXT NOT NULL,
      pattern TEXT NOT NULL,
      status TEXT NOT NULL,
      blueprint_json TEXT NOT NULL DEFAULT '{}',
      approval_refs_json TEXT NOT NULL DEFAULT '[]',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS control_plane_harness_blueprint_events (
      id TEXT PRIMARY KEY,
      blueprint_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      decision TEXT,
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (blueprint_id) REFERENCES control_plane_harness_blueprints(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_control_plane_harness_blueprints_scope
      ON control_plane_harness_blueprints(target_scope_type, target_scope_key);
    CREATE INDEX IF NOT EXISTS idx_control_plane_harness_blueprints_updated
      ON control_plane_harness_blueprints(updated_at);
    CREATE INDEX IF NOT EXISTS idx_control_plane_harness_blueprint_events_blueprint
      ON control_plane_harness_blueprint_events(blueprint_id);
  `);
}

function ensureProjectOperatorTables(db: RuntimeContext["db"]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS control_plane_project_operators (
      id TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL UNIQUE,
      project_key TEXT NOT NULL,
      owner_department TEXT NOT NULL,
      status TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      authority TEXT NOT NULL,
      memory_scope TEXT NOT NULL,
      assignment_policy TEXT NOT NULL,
      implementation_delegate TEXT NOT NULL,
      project_path TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      db_project_id TEXT,
      link_status TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS control_plane_project_operator_runs (
      id TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL,
      run_id TEXT,
      spec_id TEXT,
      status TEXT NOT NULL,
      objective TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS control_plane_project_operator_memory_links (
      id TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL,
      memory_scope TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS control_plane_project_operator_events (
      id TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity TEXT,
      message TEXT,
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_control_plane_project_operators_project_key
      ON control_plane_project_operators(project_key);
    CREATE INDEX IF NOT EXISTS idx_control_plane_project_operator_runs_operator
      ON control_plane_project_operator_runs(operator_id);
    CREATE INDEX IF NOT EXISTS idx_control_plane_project_operator_events_operator
      ON control_plane_project_operator_events(operator_id);
  `);
}

function ensureEngineSyncTables(db: RuntimeContext["db"]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS control_plane_engine_runs (
      id TEXT PRIMARY KEY,
      spec_id TEXT,
      task_id TEXT,
      goal_id TEXT,
      engine TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      objective_summary TEXT NOT NULL,
      external_thread_id TEXT,
      external_session_id TEXT,
      external_turn_id TEXT,
      approval_refs_json TEXT NOT NULL DEFAULT '[]',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      input_hash TEXT,
      output_hash TEXT,
      summary_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS control_plane_engine_events (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      event_type TEXT NOT NULL,
      engine TEXT NOT NULL,
      provider TEXT NOT NULL,
      external_event_id TEXT,
      external_thread_id TEXT,
      external_turn_id TEXT,
      severity TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES control_plane_engine_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS control_plane_thread_links (
      id TEXT PRIMARY KEY,
      engine TEXT NOT NULL,
      provider TEXT NOT NULL,
      external_thread_id TEXT NOT NULL,
      link_type TEXT NOT NULL,
      status TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      title TEXT,
      summary_json TEXT NOT NULL DEFAULT '{}',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (provider, external_thread_id, scope_key)
    );

    CREATE INDEX IF NOT EXISTS idx_control_plane_engine_runs_updated
      ON control_plane_engine_runs(updated_at);
    CREATE INDEX IF NOT EXISTS idx_control_plane_engine_runs_provider
      ON control_plane_engine_runs(provider, status);
    CREATE INDEX IF NOT EXISTS idx_control_plane_engine_events_run
      ON control_plane_engine_events(run_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_control_plane_thread_links_status
      ON control_plane_thread_links(status, updated_at);
  `);
}

function readControlRunnerStatus(db: RuntimeContext["db"]): RunnerStatus {
  const requiredTables = [
    "control_plane_agent_runs",
    "control_plane_routing_decisions",
    "control_plane_persona_runs",
    "control_plane_persona_events",
  ];
  const tablesExist = requiredTables.every((name) => tableExists(db, name));
  if (!tablesExist) {
    return {
      tables_exist: false,
      latest_run: null,
      run_counts: {},
      persona_counts: {},
      recent_runs: [],
      recent_personas: [],
      recent_events: [],
    };
  }

  const latestRun =
    (db.prepare("SELECT * FROM control_plane_agent_runs ORDER BY updated_at DESC LIMIT 1").get() as
      | Record<string, unknown>
      | undefined) ?? null;
  const runRows = db
    .prepare("SELECT status, COUNT(*) AS count FROM control_plane_agent_runs GROUP BY status")
    .all() as Array<{ status: string; count: number }>;
  const personaRows = db
    .prepare("SELECT status, COUNT(*) AS count FROM control_plane_persona_runs GROUP BY status")
    .all() as Array<{ status: string; count: number }>;
  const recentRuns = db
    .prepare(
      "SELECT id, spec_id, task_id, department_agent, status, objective, context_pack_json, approval_refs_json, hook_decisions_json, created_at, updated_at FROM control_plane_agent_runs ORDER BY updated_at DESC LIMIT 8",
    )
    .all() as Record<string, unknown>[];
  const recentPersonas = db
    .prepare(
      "SELECT persona_id, run_id, parent_agent, status, objective, write_policy, recreate_count, updated_at FROM control_plane_persona_runs ORDER BY updated_at DESC LIMIT 10",
    )
    .all() as Record<string, unknown>[];
  const recentEvents = db
    .prepare(
      "SELECT id, persona_id, run_id, event_type, decision, reason, merged_into, created_at FROM control_plane_persona_events ORDER BY created_at DESC LIMIT 12",
    )
    .all() as Record<string, unknown>[];
  return {
    tables_exist: true,
    latest_run: latestRun,
    run_counts: Object.fromEntries(runRows.map((row) => [row.status, row.count])),
    persona_counts: Object.fromEntries(personaRows.map((row) => [row.status, row.count])),
    recent_runs: recentRuns,
    recent_personas: recentPersonas,
    recent_events: recentEvents,
  };
}

function readHarnessBlueprintStatus(db: RuntimeContext["db"]): HarnessBlueprintStatus {
  const tablesExist =
    tableExists(db, "control_plane_harness_blueprints") && tableExists(db, "control_plane_harness_blueprint_events");
  if (!tablesExist) {
    return {
      tables_exist: false,
      draft_count: 0,
      department_draft_count: 0,
      project_draft_count: 0,
      evidence_backed_count: 0,
      latest_blueprints: [],
    };
  }
  const rows = db
    .prepare(
      "SELECT id, spec_id, target_scope_type, target_scope_key, source_description, pattern, status, evidence_refs_json, created_at, updated_at FROM control_plane_harness_blueprints ORDER BY updated_at DESC LIMIT 8",
    )
    .all() as Record<string, unknown>[];
  return {
    tables_exist: true,
    draft_count: Number(
      (
        db.prepare("SELECT COUNT(*) AS count FROM control_plane_harness_blueprints WHERE status = 'draft'").get() as {
          count?: number;
        }
      )?.count ?? 0,
    ),
    department_draft_count: Number(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM control_plane_harness_blueprints WHERE status = 'draft' AND target_scope_type IN ('department', 'both')",
          )
          .get() as { count?: number }
      )?.count ?? 0,
    ),
    project_draft_count: Number(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM control_plane_harness_blueprints WHERE status = 'draft' AND target_scope_type IN ('project', 'both')",
          )
          .get() as { count?: number }
      )?.count ?? 0,
    ),
    evidence_backed_count: Number(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM control_plane_harness_blueprints WHERE evidence_refs_json IS NOT NULL AND evidence_refs_json != '[]'",
          )
          .get() as { count?: number }
      )?.count ?? 0,
    ),
    latest_blueprints: rows,
  };
}

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeEngineProvider(value: unknown): EngineProvider {
  const provider = String(value ?? "codex_exec")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (provider === "codex" || provider === "codex_cli") return "codex_exec";
  if (provider === "codex_app_server" || provider === "app_server") return "codex_app_server";
  if (provider === "claude") return "claude";
  if (provider === "agy" || provider === "gemini" || provider === "antigravity") return "agy";
  if (provider === "hermes") return "hermes";
  return "codex_exec";
}

function engineNameForProvider(provider: EngineProvider): string {
  if (provider.startsWith("codex")) return "codex";
  return provider;
}

function truncateSummary(value: unknown, max = 800): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function parseJsonLines(raw: unknown): Record<string, unknown>[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? [parsed as Record<string, unknown>]
          : [];
      } catch {
        return [];
      }
    });
}

function summarizeCodexJsonlEvent(event: Record<string, unknown>): {
  event_type: EngineEventType;
  message: string;
  external_event_id: string | null;
  external_thread_id: string | null;
  external_turn_id: string | null;
  severity: "info" | "warn" | "error";
  payload: Record<string, unknown>;
} {
  const type = String(event.type ?? "output_delta");
  const item =
    event.item && typeof event.item === "object" && !Array.isArray(event.item)
      ? (event.item as Record<string, unknown>)
      : {};
  const payload: Record<string, unknown> = { codex_event_type: type };
  const externalThreadId = typeof event.thread_id === "string" ? event.thread_id : null;
  const externalTurnId = typeof event.turn_id === "string" ? event.turn_id : null;
  const externalEventId = typeof item.id === "string" ? item.id : null;
  if (typeof item.type === "string") payload.item_type = item.type;
  if (typeof item.status === "string") payload.item_status = item.status;
  if (typeof item.tool === "string") payload.tool = item.tool;
  if (typeof item.command === "string") payload.command_summary = truncateSummary(item.command, 160);

  if (type === "thread.started") {
    return {
      event_type: "thread_started",
      message: "Codex thread started",
      external_event_id: externalEventId,
      external_thread_id: externalThreadId,
      external_turn_id: externalTurnId,
      severity: "info",
      payload,
    };
  }
  if (type === "turn.started") {
    return {
      event_type: "turn_started",
      message: "Codex turn started",
      external_event_id: externalEventId,
      external_thread_id: externalThreadId,
      external_turn_id: externalTurnId,
      severity: "info",
      payload,
    };
  }
  if (type === "turn.completed") {
    return {
      event_type: "completed",
      message: "Codex turn completed",
      external_event_id: externalEventId,
      external_thread_id: externalThreadId,
      external_turn_id: externalTurnId,
      severity: "info",
      payload,
    };
  }
  if (type === "turn.failed" || type === "error") {
    return {
      event_type: "failed",
      message: truncateSummary(event.error ?? event.message ?? "Codex event failed", 240),
      external_event_id: externalEventId,
      external_thread_id: externalThreadId,
      external_turn_id: externalTurnId,
      severity: "error",
      payload,
    };
  }
  if (String(item.type ?? "").includes("approval") || /requestApproval/i.test(type)) {
    return {
      event_type: "approval_requested",
      message: "승인이 필요한 Codex 작업이 감지되었습니다.",
      external_event_id: externalEventId,
      external_thread_id: externalThreadId,
      external_turn_id: externalTurnId,
      severity: "warn",
      payload,
    };
  }
  if (type === "item.started" || type === "item.completed") {
    return {
      event_type: "output_delta",
      message: `Codex ${type}: ${String(item.type ?? "item")}`,
      external_event_id: externalEventId,
      external_thread_id: externalThreadId,
      external_turn_id: externalTurnId,
      severity: "info",
      payload,
    };
  }
  return {
    event_type: "output_delta",
    message: `Codex event: ${type}`,
    external_event_id: externalEventId,
    external_thread_id: externalThreadId,
    external_turn_id: externalTurnId,
    severity: "info",
    payload,
  };
}

function containsUnsafeEnginePayload(value: unknown): string | null {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  if (/\b(sk-[A-Za-z0-9_-]{16,}|sk-proj-[A-Za-z0-9_-]{16,})\b/.test(raw)) return "secret_like_payload_blocked";
  if (/\b(access_token|refresh_token|id_token|authorization_code|oauth_code)\b\s*[:=]/i.test(raw))
    return "oauth_token_payload_blocked";
  if (/-----BEGIN (?:OPENSSH |RSA |EC |PRIVATE )?PRIVATE KEY-----/i.test(raw)) return "secret_like_payload_blocked";
  if (/(?:\\"|")messages(?:\\"|")\s*:\s*\[|\braw[_\s-]?transcript\b|\bfull[_\s-]?transcript\b/i.test(raw))
    return "raw_transcript_blocked";
  return null;
}

function buildEngineProviderStatus(specId: string | null): EngineSyncStatus["provider_status"] {
  const appServerApproved = getApprovedOperationApprovalIds(specId, "codex-app-server-poc").length > 0;
  return [
    {
      provider: "codex_exec",
      label: "Codex CLI",
      available: true,
      mode: "enabled",
      detail: "codex exec --json 기반 이벤트 수집을 사용할 수 있습니다.",
    },
    {
      provider: "codex_app_server",
      label: "Codex app-server",
      available: appServerApproved,
      mode: appServerApproved ? "preview" : "blocked",
      detail: appServerApproved
        ? "read-only PoC 상태 확인만 허용됩니다."
        : "APR-CODEX-APP-SERVER-POC-* 승인 전에는 차단됩니다.",
    },
    {
      provider: "claude",
      label: "Claude CLI",
      available: true,
      mode: "preview",
      detail: "기존 CLI provider 라우팅 대상으로만 표시합니다.",
    },
    {
      provider: "agy",
      label: "AGY CLI",
      available: true,
      mode: "preview",
      detail: "기존 read-only review/provider 라우팅 대상으로만 표시합니다.",
    },
    {
      provider: "hermes",
      label: "Hermes",
      available: false,
      mode: "blocked",
      detail: "구체 runtime surface 확인 전까지 adapter slot만 보존합니다.",
    },
  ];
}

function readEngineSyncStatus(db: RuntimeContext["db"]): EngineSyncStatus {
  const activeSpec = buildActiveSpecStatus();
  const tablesExist =
    tableExists(db, "control_plane_engine_runs") &&
    tableExists(db, "control_plane_engine_events") &&
    tableExists(db, "control_plane_thread_links");
  const appServerApproved = getApprovedOperationApprovalIds(activeSpec.id, "codex-app-server-poc").length > 0;
  if (!tablesExist) {
    return {
      tables_exist: false,
      provider_status: buildEngineProviderStatus(activeSpec.id),
      run_counts: {},
      link_counts: {},
      recent_runs: [],
      recent_events: [],
      recent_thread_links: [],
      app_server_poc: {
        approved: appServerApproved,
        mode: appServerApproved ? "read-only-poc" : "blocked",
        detail: appServerApproved
          ? "PoC 승인됨; 실제 daemon ownership은 범위 밖입니다."
          : "승인 전에는 app-server PoC가 차단됩니다.",
      },
    };
  }
  const runRows = db
    .prepare("SELECT status, COUNT(*) AS count FROM control_plane_engine_runs GROUP BY status")
    .all() as Array<{ status: string; count: number }>;
  const linkRows = db
    .prepare("SELECT status, COUNT(*) AS count FROM control_plane_thread_links GROUP BY status")
    .all() as Array<{ status: string; count: number }>;
  return {
    tables_exist: true,
    provider_status: buildEngineProviderStatus(activeSpec.id),
    run_counts: Object.fromEntries(runRows.map((row) => [row.status, row.count])),
    link_counts: Object.fromEntries(linkRows.map((row) => [row.status, row.count])),
    recent_runs: db.prepare("SELECT * FROM control_plane_engine_runs ORDER BY updated_at DESC LIMIT 8").all() as Record<
      string,
      unknown
    >[],
    recent_events: db
      .prepare("SELECT * FROM control_plane_engine_events ORDER BY created_at DESC LIMIT 16")
      .all() as Record<string, unknown>[],
    recent_thread_links: db
      .prepare("SELECT * FROM control_plane_thread_links ORDER BY updated_at DESC LIMIT 8")
      .all() as Record<string, unknown>[],
    app_server_poc: {
      approved: appServerApproved,
      mode: appServerApproved ? "read-only-poc" : "blocked",
      detail: appServerApproved
        ? "PoC 승인됨; 실제 daemon ownership은 범위 밖입니다."
        : "승인 전에는 app-server PoC가 차단됩니다.",
    },
  };
}

function buildEngineRoutePreview(db: RuntimeContext["db"], body: Record<string, unknown>) {
  const objective = truncateSummary(body.objective, 500);
  if (!objective) return { ok: false, status: 400, error: "objective_required" };
  const unsafe = containsUnsafeEnginePayload(body);
  if (unsafe) return { ok: false, status: 400, error: unsafe };
  const requestedProvider = normalizeEngineProvider(body.provider);
  const lower = objective.toLowerCase();
  const provider: EngineProvider =
    requestedProvider !== "codex_exec"
      ? requestedProvider
      : /review|검토|평가|agy|gemini/i.test(objective)
        ? "agy"
        : /claude|문서|ppt|presentation/i.test(objective)
          ? "claude"
          : /hermes|local/i.test(objective)
            ? "hermes"
            : /computer use|gui|oauth|브라우저|화면|클릭/i.test(objective)
              ? "codex_app_server"
              : "codex_exec";
  const status =
    provider === "hermes" || provider === "codex_app_server" || /computer use|oauth|token|auth code/.test(lower)
      ? "blocked_or_preview"
      : "routeable";
  const scopeType = String(body.scope_type ?? "project").toLowerCase() as CodexThreadScopeType;
  const scope = validateCodexThreadScope(db, scopeType, body.scope_value ?? "DonggriCompany");
  if (!scope.ok) return { ok: false, status: 400, error: scope.error };
  return {
    ok: true,
    status: 200,
    writes: false,
    route: {
      provider,
      engine: engineNameForProvider(provider),
      decision: status,
      scope_type: scope.scope_type,
      scope_key: scope.scope_key,
      reason:
        provider === "codex_exec"
          ? "로컬 파일/CLI 중심 작업이므로 Codex CLI event bridge를 선택했습니다."
          : provider === "codex_app_server"
            ? "GUI/상호작용 가능성이 있어 app-server/사용자 승인 경계가 필요합니다."
            : provider === "agy"
              ? "검토/평가 성격이 강해 AGY provider를 선택했습니다."
              : provider === "claude"
                ? "문서/생성/구조화 작업 성격이 강해 Claude provider를 선택했습니다."
                : "Hermes runtime이 확인되지 않아 preview/blocked 상태입니다.",
      alternatives: ["codex_exec", "codex_app_server", "claude", "agy", "hermes"].filter((item) => item !== provider),
      approvals_required: provider === "codex_app_server" ? ["APR-CODEX-APP-SERVER-POC-*"] : [],
      computer_use_required: /computer use|gui|브라우저|화면|클릭/i.test(objective),
    },
  };
}

function insertEngineEvent(
  db: RuntimeContext["db"],
  event: {
    run_id?: string | null;
    event_type: EngineEventType;
    engine: string;
    provider: EngineProvider;
    external_event_id?: string | null;
    external_thread_id?: string | null;
    external_turn_id?: string | null;
    severity?: "info" | "warn" | "error";
    message: string;
    evidence_refs?: string[];
    payload?: Record<string, unknown>;
  },
) {
  ensureEngineSyncTables(db);
  const now = Date.now();
  const id = `cpevt-${now}-${crypto.randomBytes(4).toString("hex")}`;
  db.prepare(
    `INSERT INTO control_plane_engine_events (
      id, run_id, event_type, engine, provider, external_event_id, external_thread_id,
      external_turn_id, severity, message, evidence_refs_json, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    event.run_id ?? null,
    event.event_type,
    event.engine,
    event.provider,
    event.external_event_id ?? null,
    event.external_thread_id ?? null,
    event.external_turn_id ?? null,
    event.severity ?? "info",
    event.message,
    JSON.stringify(event.evidence_refs ?? []),
    JSON.stringify(event.payload ?? {}),
    now,
  );
  return id;
}

function createEngineRun(db: RuntimeContext["db"], body: Record<string, unknown>, approvalRefs: string[]) {
  ensureEngineSyncTables(db);
  const preview = buildEngineRoutePreview(db, body);
  if (!preview.ok) return preview;
  const route = preview.route as {
    provider: EngineProvider;
    engine: string;
    decision: "routeable" | "blocked_or_preview";
    scope_type: CodexThreadScopeType;
    scope_key: string;
    reason: string;
    computer_use_required: boolean;
  };
  const provider = route.provider;
  const objective = truncateSummary(body.objective, 500);
  const evidenceRefs = parseJsonArray(body.evidence_refs).slice(0, 20);
  const eventRows = parseJsonLines(body.event_jsonl).map(summarizeCodexJsonlEvent);
  const now = Date.now();
  const runId = `cperun-${now}-${crypto.randomBytes(4).toString("hex")}`;
  const inputHash = hashText(JSON.stringify({ objective, provider, scope: route.scope_key }));
  const outputHash = eventRows.length > 0 ? hashText(JSON.stringify(eventRows)) : null;
  const status: EngineRunStatus =
    route.decision === "blocked_or_preview"
      ? "blocked"
      : eventRows.some((event) => event.event_type === "completed")
        ? "completed"
        : eventRows.length > 0
          ? "syncing"
          : "planned";
  const summary = {
    storage_policy: "summary_hash_refs_only",
    raw_transcript_stored: false,
    route,
    event_count: eventRows.length,
    computer_use_required: Boolean(route.computer_use_required),
  };
  db.prepare(
    `INSERT INTO control_plane_engine_runs (
      id, spec_id, task_id, goal_id, engine, provider, status, scope_type, scope_key,
      objective_summary, external_thread_id, external_session_id, external_turn_id,
      approval_refs_json, evidence_refs_json, input_hash, output_hash, summary_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    buildActiveSpecStatus().id,
    typeof body.task_id === "string" ? body.task_id.trim() || null : null,
    typeof body.goal_id === "string" ? body.goal_id.trim() || null : null,
    route.engine,
    provider,
    status,
    route.scope_type,
    route.scope_key,
    objective,
    typeof body.external_thread_id === "string"
      ? body.external_thread_id.trim() || null
      : (eventRows.find((event) => event.external_thread_id)?.external_thread_id ?? null),
    typeof body.external_session_id === "string" ? body.external_session_id.trim() || null : null,
    typeof body.external_turn_id === "string"
      ? body.external_turn_id.trim() || null
      : (eventRows.find((event) => event.external_turn_id)?.external_turn_id ?? null),
    JSON.stringify(approvalRefs),
    JSON.stringify(evidenceRefs),
    inputHash,
    outputHash,
    JSON.stringify(summary),
    now,
    now,
  );
  insertEngineEvent(db, {
    run_id: runId,
    event_type: "route_decided",
    engine: String(route.engine),
    provider,
    message: String(route.reason),
    evidence_refs: evidenceRefs,
    payload: route,
  });
  for (const event of eventRows) {
    insertEngineEvent(db, {
      run_id: runId,
      event_type: event.event_type,
      engine: String(route.engine),
      provider,
      external_event_id: event.external_event_id,
      external_thread_id: event.external_thread_id,
      external_turn_id: event.external_turn_id,
      severity: event.severity,
      message: event.message,
      evidence_refs: evidenceRefs,
      payload: event.payload,
    });
  }
  return { ok: true, status: 200, run: readEngineRun(db, runId), engine_sync: readEngineSyncStatus(db) };
}

function readEngineRun(db: RuntimeContext["db"], runId: string) {
  if (!tableExists(db, "control_plane_engine_runs")) return null;
  const run = db.prepare("SELECT * FROM control_plane_engine_runs WHERE id = ?").get(runId) as
    | Record<string, unknown>
    | undefined;
  if (!run) return null;
  const events = tableExists(db, "control_plane_engine_events")
    ? (db
        .prepare("SELECT * FROM control_plane_engine_events WHERE run_id = ? ORDER BY created_at ASC")
        .all(runId) as Record<string, unknown>[])
    : [];
  return { run, events };
}

function cancelEngineRun(db: RuntimeContext["db"], runId: string, approvalRefs: string[]) {
  ensureEngineSyncTables(db);
  const existing = readEngineRun(db, runId);
  if (!existing) return { ok: false, status: 404, error: "engine_run_not_found" };
  const now = Date.now();
  db.prepare("UPDATE control_plane_engine_runs SET status = ?, updated_at = ? WHERE id = ?").run("blocked", now, runId);
  insertEngineEvent(db, {
    run_id: runId,
    event_type: "cancelled",
    engine: String(existing.run.engine ?? "codex"),
    provider: normalizeEngineProvider(existing.run.provider),
    severity: "warn",
    message: "Engine run was cancelled from DonggriCompany control surface.",
    evidence_refs: approvalRefs,
  });
  return { ok: true, status: 200, run: readEngineRun(db, runId), engine_sync: readEngineSyncStatus(db) };
}

function attachEngineThread(db: RuntimeContext["db"], body: Record<string, unknown>, approvalRefs: string[]) {
  ensureEngineSyncTables(db);
  const unsafe = containsUnsafeEnginePayload(body);
  if (unsafe) return { ok: false, status: 400, error: unsafe };
  const provider = normalizeEngineProvider(body.provider);
  const externalThreadId = truncateSummary(body.external_thread_id, 120);
  if (!isSafeThreadId(externalThreadId)) return { ok: false, status: 400, error: "invalid_thread_id" };
  const scope = validateCodexThreadScope(db, body.scope_type, body.scope_value ?? "DonggriCompany");
  if (!scope.ok) return { ok: false, status: 400, error: scope.error };
  const now = Date.now();
  const id = `cpthread-${now}-${crypto.randomBytes(4).toString("hex")}`;
  const summary = {
    title: truncateSummary(body.title, 120) || "Observed Codex thread",
    note: truncateSummary(body.summary, 300),
    raw_transcript_stored: false,
    storage_policy: "summary_hash_refs_only",
  };
  db.prepare(
    `INSERT INTO control_plane_thread_links (
      id, engine, provider, external_thread_id, link_type, status, scope_type, scope_key,
      title, summary_json, evidence_refs_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, external_thread_id, scope_key) DO UPDATE SET
      status = excluded.status,
      title = excluded.title,
      summary_json = excluded.summary_json,
      evidence_refs_json = excluded.evidence_refs_json,
      updated_at = excluded.updated_at`,
  ).run(
    id,
    engineNameForProvider(provider),
    provider,
    externalThreadId,
    "observed",
    "linked",
    scope.scope_type,
    scope.scope_key,
    summary.title,
    JSON.stringify(summary),
    JSON.stringify(parseJsonArray(body.evidence_refs).slice(0, 20)),
    now,
    now,
  );
  insertEngineEvent(db, {
    event_type: "thread_started",
    engine: engineNameForProvider(provider),
    provider,
    external_thread_id: externalThreadId,
    message: "Observed Codex thread linked to DonggriCompany scope.",
    evidence_refs: approvalRefs,
    payload: { scope_key: scope.scope_key, link_type: "observed" },
  });
  return {
    ok: true,
    status: 200,
    thread_link: db
      .prepare(
        "SELECT * FROM control_plane_thread_links WHERE provider = ? AND external_thread_id = ? AND scope_key = ?",
      )
      .get(provider, externalThreadId, scope.scope_key),
    engine_sync: readEngineSyncStatus(db),
  };
}

function reconcileEngineSync(db: RuntimeContext["db"], approvalRefs: string[]) {
  ensureEngineSyncTables(db);
  const now = Date.now();
  const staleCutoff = now - 1000 * 60 * 60 * 6;
  const staleCandidates = db
    .prepare(
      "SELECT id FROM control_plane_engine_runs WHERE status IN ('planned', 'running', 'syncing') AND updated_at < ?",
    )
    .all(staleCutoff) as Array<{ id: string }>;
  for (const row of staleCandidates) {
    db.prepare("UPDATE control_plane_engine_runs SET status = ?, updated_at = ? WHERE id = ?").run(
      "stale",
      now,
      row.id,
    );
  }
  const orphanLinks = Number(
    (
      db.prepare("SELECT COUNT(*) AS count FROM control_plane_thread_links WHERE status = 'linked'").get() as {
        count?: number;
      }
    )?.count ?? 0,
  );
  insertEngineEvent(db, {
    event_type: "reconciled",
    engine: "control-plane",
    provider: "codex_exec",
    message: "Engine sync reconciliation completed.",
    evidence_refs: approvalRefs,
    payload: { stale_marked: staleCandidates.length, linked_observed_threads: orphanLinks },
  });
  return {
    ok: true,
    status: 200,
    reconciliation: {
      stale_marked: staleCandidates.length,
      linked_observed_threads: orphanLinks,
      raw_transcript_read: false,
    },
    engine_sync: readEngineSyncStatus(db),
  };
}

function splitRefs(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((item) => item.trim().replace(/^`|`$/g, ""))
    .filter(Boolean);
}

function parseSpecTaskLinks(specId: string | null): ControlPlaneSpecTaskLink[] {
  if (!isSafeSpecId(specId)) return [];
  const tasksPath = path.join(CODEX_CONTROL_ROOT, "specs", specId, "tasks.md");
  const raw = readText(tasksPath);
  const lines = raw.split(/\r?\n/);
  const tableLinks = lines
    .filter((line) => /^\|\s*T-\d{3}\s*\|/.test(line))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      const taskKey = cells[0] ?? "";
      const refs = splitRefs(cells[6]);
      const evidenceRefs = splitRefs(cells[10]);
      const status = cells[11] ?? null;
      return {
        id: `control-plane:spec-task:${specId}:${taskKey}`,
        spec_id: specId,
        task_key: taskKey,
        requirement_refs: refs,
        status,
        evidence_refs: evidenceRefs,
        payload: {
          wave: cells[1] ?? null,
          role: cells[2] ?? null,
          repo_area: cells[3] ?? null,
          scope: cells[4] ?? null,
          allowed_files: cells[5] ?? null,
          dependencies: cells[7] ?? null,
          approval: cells[8] ?? null,
          verification: cells[9] ?? null,
          tasks_path: tasksPath,
        },
      };
    });
  if (tableLinks.length > 0) return tableLinks;

  const links: ControlPlaneSpecTaskLink[] = [];
  let current: {
    taskKey: string;
    title: string | null;
    fields: Map<string, string>;
  } | null = null;

  const flush = () => {
    if (!current) return;
    const fields = current.fields;
    const requirementRefs = splitRefs(
      fields.get("requirement refs") ?? fields.get("requirements") ?? fields.get("refs") ?? fields.get("req refs"),
    );
    const evidenceRefs = splitRefs(fields.get("evidence") ?? fields.get("evidence refs"));
    links.push({
      id: `control-plane:spec-task:${specId}:${current.taskKey}`,
      spec_id: specId,
      task_key: current.taskKey,
      requirement_refs: requirementRefs,
      status: fields.get("status") ?? null,
      evidence_refs: evidenceRefs,
      payload: {
        title: current.title,
        wave: fields.get("wave") ?? null,
        role: fields.get("role") ?? null,
        repo_area: fields.get("repo") ?? fields.get("area") ?? null,
        scope: fields.get("scope") ?? null,
        allowed_files: fields.get("allowed files") ?? null,
        dependencies: fields.get("dependencies") ?? null,
        approval: fields.get("approval") ?? null,
        verification: fields.get("verification") ?? null,
        tasks_path: tasksPath,
      },
    });
  };

  for (const line of lines) {
    const heading = /^##\s+(T-\d{3})(?:(?::|\s+)\s*(.+))?\s*$/.exec(line);
    if (heading) {
      flush();
      current = {
        taskKey: heading[1],
        title: heading[2] ?? null,
        fields: new Map(),
      };
      continue;
    }
    const field = /^-\s+([^:]+):\s*(.*)\s*$/.exec(line);
    if (current && field) {
      current.fields.set(field[1].trim().toLowerCase(), field[2].trim());
    }
  }
  flush();
  return links;
}

function getProjectLinkStatus(project: RegistryProject): ControlPlaneProjectLink["link_status"] {
  return project.db_project_id
    ? "linked"
    : !project.exists
      ? "missing"
      : project.lifecycle_status !== "active" || project.type === "runtime-artifact"
        ? "candidate"
        : !project.git.is_repo
          ? "not-git"
          : "unlinked";
}

function slugProjectKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildProjectOperators(projects: RegistryProject[]): ProjectOperatorAgent[] {
  return projects.map((project) => {
    const config = project.operation_agent;
    const lifecycle = project.lifecycle_status;
    const candidate = lifecycle === "candidate" || project.type === "runtime-artifact";
    const retired = lifecycle === "completed" || lifecycle === "archived";
    const enabled = !retired && lifecycle === "active" && (config?.enabled ?? project.exists);
    const status: ProjectOperatorAgent["status"] = !project.exists
      ? "missing"
      : enabled
        ? "active"
        : "disabled-candidate";
    const operatorId = config?.operator_id ?? `ops-project-${slugProjectKey(project.key)}`;
    const linkStatus = getProjectLinkStatus(project);
    const riskFlags = [
      !project.exists ? "missing-path" : null,
      !project.git.is_repo && project.type !== "folder" && project.type !== "runtime-artifact" ? "not-git" : null,
      project.git.status === "dirty" ? "dirty-worktree" : null,
      candidate ? "candidate-disabled" : null,
      retired ? `${lifecycle}-project` : null,
      !project.db_project_id ? "db-link-missing" : null,
    ].filter(Boolean) as string[];

    return {
      operator_id: operatorId,
      project_key: config?.project_key ?? project.key,
      project_path: project.path,
      absolute_path: project.absolute_path,
      owner_department: "OPS",
      enabled,
      status,
      authority: "operations-only",
      memory_scope: config?.memory_scope ?? `project:${project.key}`,
      assignment_policy:
        config?.assignment_policy ??
        (enabled ? "single-ops-agent-project-scope-implement-delegated" : "candidate-disabled-needs-confirmation"),
      implementation_delegate: "IMPLEMENT",
      can_create_read_persona: true,
      can_create_write_persona: false,
      can_write_repo: false,
      db_project_id: project.db_project_id,
      db_project_name: project.db_project_name,
      project_type: project.type,
      project_status: project.status,
      lifecycle_status: lifecycle,
      filter_group: project.filter_group,
      default_visible: project.default_visible,
      has_agents: project.has_agents,
      git_status: project.git.status,
      git_branch: project.git.branch,
      link_status: linkStatus,
      memory_tabs: ["Memory", "Runs", "Handoff", "Backlog", "Risk"],
      risk_flags: riskFlags,
      notes: retired
        ? `user-managed ${lifecycle} project; hidden from active work by default`
        : enabled
          ? "OPS project scope; not a separate persistent project agent; repo writes route to IMPLEMENT"
          : "disabled candidate scope; needs confirmation",
    };
  });
}

function buildProjectSyncLinks(projects: RegistryProject[]): ControlPlaneProjectLink[] {
  return projects.map((project) => {
    const linkStatus = getProjectLinkStatus(project);
    return {
      id: `control-plane:project:${project.key}`,
      registry_key: project.key,
      registry_path: project.path,
      absolute_path: project.absolute_path,
      registry_type: project.type,
      db_project_id: project.db_project_id,
      db_project_name: project.db_project_name,
      link_status: linkStatus,
      notes: project.status === "candidate" ? "needs-confirmation" : null,
      payload: {
        exists: project.exists,
        has_agents: project.has_agents,
        summary: project.summary,
        registry_status: project.status,
        lifecycle_status: project.lifecycle_status,
        filter_group: project.filter_group,
        default_visible: project.default_visible,
        git_status: project.git.status,
        git_branch: project.git.branch,
        dirty_count: project.git.dirty_count,
      },
    };
  });
}

function buildRepoEstateDiscovery(registryByAbsolutePath: Map<string, string>): RepoEstateDiscovery[] {
  if (!fs.existsSync(REPO_ESTATE_ROOT)) return [];
  return fs
    .readdirSync(REPO_ESTATE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const absolutePath = path.join(REPO_ESTATE_ROOT, entry.name);
      const normalizedPath = normalizeSlashes(absolutePath);
      const registryKey = registryByAbsolutePath.get(normalizedPath) ?? null;
      const isExcluded = REPO_ESTATE_EXCLUDED_PROJECT_DIRS.has(entry.name);
      const classification: RepoEstateDiscovery["classification"] = isExcluded
        ? "excluded"
        : registryKey
          ? "registered"
          : "candidate";
      return {
        name: entry.name,
        path: normalizeSlashes(path.relative(CONTROL_ROOT, absolutePath)),
        absolute_path: absolutePath,
        classification,
        registry_key: registryKey,
        reason: isExcluded
          ? "control-runtime-infrastructure-folder"
          : registryKey
            ? "registered-in-projects-yaml"
            : "repo-estate-folder-needs-classification",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildControlSyncPreview(db: RuntimeContext["db"]): ControlPlaneSyncPreview {
  const registry = buildRegistryProjects(db);
  const activeSpec = buildActiveSpecStatus();
  const rootDoc = fileStatus("AGENTS.md", path.join(CONTROL_ROOT, "AGENTS.md"));
  const rootHash = (rootDoc.sha256 ?? crypto.createHash("sha256").update(CONTROL_ROOT).digest("hex")).slice(0, 16);
  const projectsHash = (registry.doc.sha256 ?? "missing").slice(0, 16);
  const activeHash = (activeSpec.doc.sha256 ?? "missing").slice(0, 16);
  const projectLinks = buildProjectSyncLinks(registry.projects);
  const specTaskLinks = parseSpecTaskLinks(activeSpec.id);
  const countByStatus = (status: ControlPlaneProjectLink["link_status"]) =>
    projectLinks.filter((link) => link.link_status === status).length;

  return {
    ok: true,
    mode: "preview",
    writes: false,
    approved_for_apply: hasApprovedDbSync(activeSpec.id),
    snapshot: {
      id: `control:${rootHash}:${projectsHash}:${activeHash}`,
      root_path: CONTROL_ROOT,
      repo_estate_root: REPO_ESTATE_ROOT,
      active_spec_id: activeSpec.id,
      projects_yaml_hash: registry.doc.sha256,
      active_spec_hash: activeSpec.doc.sha256,
      registry_project_count: registry.registered_count,
      db_project_count: registry.db_project_count,
      unlinked_registry_count: registry.unlinked_count,
    },
    counts: {
      project_links: projectLinks.length,
      linked: countByStatus("linked"),
      unlinked: countByStatus("unlinked"),
      missing: countByStatus("missing"),
      not_git: countByStatus("not-git"),
      candidate: countByStatus("candidate"),
      spec_task_links: specTaskLinks.length,
    },
    project_links: projectLinks,
    spec_task_links: specTaskLinks,
  };
}

function applyControlSync(db: RuntimeContext["db"]) {
  const preview = buildControlSyncPreview(db);
  const now = Date.now();
  const payload = JSON.stringify({
    control_root: CONTROL_ROOT,
    repo_estate_root: REPO_ESTATE_ROOT,
    runtime_projection_app: RUNTIME_PROJECTION_APP,
    counts: preview.counts,
  });

  ensureControlSyncTables(db);
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO control_plane_snapshots (
        id, root_path, repo_estate_root, active_spec_id, projects_yaml_hash, active_spec_hash,
        registry_project_count, db_project_count, unlinked_registry_count, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        root_path = excluded.root_path,
        repo_estate_root = excluded.repo_estate_root,
        active_spec_id = excluded.active_spec_id,
        projects_yaml_hash = excluded.projects_yaml_hash,
        active_spec_hash = excluded.active_spec_hash,
        registry_project_count = excluded.registry_project_count,
        db_project_count = excluded.db_project_count,
        unlinked_registry_count = excluded.unlinked_registry_count,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at`,
    ).run(
      preview.snapshot.id,
      preview.snapshot.root_path,
      preview.snapshot.repo_estate_root,
      preview.snapshot.active_spec_id,
      preview.snapshot.projects_yaml_hash,
      preview.snapshot.active_spec_hash,
      preview.snapshot.registry_project_count,
      preview.snapshot.db_project_count,
      preview.snapshot.unlinked_registry_count,
      payload,
      now,
      now,
    );

    const projectStmt = db.prepare(
      `INSERT INTO control_plane_project_links (
        id, snapshot_id, registry_key, registry_path, absolute_path, registry_type, db_project_id,
        db_project_name, link_status, notes, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(registry_key) DO UPDATE SET
        id = excluded.id,
        snapshot_id = excluded.snapshot_id,
        registry_path = excluded.registry_path,
        absolute_path = excluded.absolute_path,
        registry_type = excluded.registry_type,
        db_project_id = excluded.db_project_id,
        db_project_name = excluded.db_project_name,
        link_status = excluded.link_status,
        notes = excluded.notes,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at`,
    );
    for (const link of preview.project_links) {
      projectStmt.run(
        link.id,
        preview.snapshot.id,
        link.registry_key,
        link.registry_path,
        link.absolute_path,
        link.registry_type,
        link.db_project_id,
        link.db_project_name,
        link.link_status,
        link.notes,
        JSON.stringify(link.payload),
        now,
        now,
      );
    }

    const taskStmt = db.prepare(
      `INSERT INTO control_plane_spec_task_links (
        id, snapshot_id, spec_id, task_key, requirement_refs_json, status, evidence_refs_json,
        payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(spec_id, task_key) DO UPDATE SET
        id = excluded.id,
        snapshot_id = excluded.snapshot_id,
        requirement_refs_json = excluded.requirement_refs_json,
        status = excluded.status,
        evidence_refs_json = excluded.evidence_refs_json,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at`,
    );
    for (const task of preview.spec_task_links) {
      taskStmt.run(
        task.id,
        preview.snapshot.id,
        task.spec_id,
        task.task_key,
        JSON.stringify(task.requirement_refs),
        task.status,
        JSON.stringify(task.evidence_refs),
        JSON.stringify(task.payload),
        now,
        now,
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  }

  return {
    ok: true,
    mode: "apply",
    writes: true,
    snapshot: preview.snapshot,
    counts: preview.counts,
    status: readControlSyncStatus(db),
  };
}

function buildProjectOperatorSyncPreview(db: RuntimeContext["db"]) {
  const registry = buildRegistryProjects(db);
  const activeSpec = buildActiveSpecStatus();
  const operators = buildProjectOperators(registry.projects);
  const enabledCount = operators.filter((operator) => operator.enabled).length;
  const disabledCount = operators.length - enabledCount;

  return {
    ok: true,
    mode: "preview" as const,
    writes: false,
    approved_for_apply: hasApprovedDbSync(activeSpec.id),
    active_spec_id: activeSpec.id,
    counts: {
      operators: operators.length,
      enabled: enabledCount,
      disabled: disabledCount,
      candidate_disabled: operators.filter((operator) => operator.status === "disabled-candidate").length,
      direct_repo_write_allowed: operators.filter((operator) => operator.can_write_repo).length,
    },
    operators,
    policy: {
      owner_department: "OPS",
      authority: "operations-only",
      implementation_delegate: "IMPLEMENT",
      write_target: "control_plane_* tables only",
      domain_tables_mutated: false,
    },
  };
}

function applyProjectOperatorSync(db: RuntimeContext["db"]) {
  const preview = buildProjectOperatorSyncPreview(db);
  const now = Date.now();
  ensureProjectOperatorTables(db);
  db.exec("BEGIN");
  try {
    const operatorStmt = db.prepare(
      `INSERT INTO control_plane_project_operators (
        id, operator_id, project_key, owner_department, status, enabled, authority, memory_scope,
        assignment_policy, implementation_delegate, project_path, absolute_path, db_project_id,
        link_status, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(operator_id) DO UPDATE SET
        project_key = excluded.project_key,
        owner_department = excluded.owner_department,
        status = excluded.status,
        enabled = excluded.enabled,
        authority = excluded.authority,
        memory_scope = excluded.memory_scope,
        assignment_policy = excluded.assignment_policy,
        implementation_delegate = excluded.implementation_delegate,
        project_path = excluded.project_path,
        absolute_path = excluded.absolute_path,
        db_project_id = excluded.db_project_id,
        link_status = excluded.link_status,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at`,
    );
    const memoryStmt = db.prepare(
      `INSERT INTO control_plane_project_operator_memory_links (
        id, operator_id, memory_scope, source_type, source_ref, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        operator_id = excluded.operator_id,
        memory_scope = excluded.memory_scope,
        source_type = excluded.source_type,
        source_ref = excluded.source_ref,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at`,
    );

    for (const operator of preview.operators) {
      operatorStmt.run(
        `control-plane:project-operator:${operator.operator_id}`,
        operator.operator_id,
        operator.project_key,
        operator.owner_department,
        operator.status,
        operator.enabled ? 1 : 0,
        operator.authority,
        operator.memory_scope,
        operator.assignment_policy,
        operator.implementation_delegate,
        operator.project_path,
        operator.absolute_path,
        operator.db_project_id,
        operator.link_status,
        JSON.stringify(operator),
        now,
        now,
      );
      memoryStmt.run(
        `control-plane:project-operator-memory:${operator.operator_id}`,
        operator.operator_id,
        operator.memory_scope,
        "control-plane-summary",
        `storage/codex-control/registry/projects.yaml#${operator.project_key}`,
        JSON.stringify({
          project_key: operator.project_key,
          enabled: operator.enabled,
          exposure_policy: "summary-only-no-raw-memory-no-secrets",
        }),
        now,
        now,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  }

  return {
    ok: true,
    mode: "apply" as const,
    writes: true,
    active_spec_id: preview.active_spec_id,
    counts: preview.counts,
    operators: preview.operators,
    policy: preview.policy,
  };
}

function readProjectOperatorRows(
  db: RuntimeContext["db"],
  operatorId: string,
  table: string,
): Record<string, unknown>[] {
  try {
    ensureProjectOperatorTables(db);
    return db
      .prepare(`SELECT * FROM ${table} WHERE operator_id = ? ORDER BY updated_at DESC LIMIT 20`)
      .all(operatorId) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function buildProjectOperatorMemory(
  operator: ProjectOperatorAgent,
  memory: Awaited<ReturnType<typeof buildAgentMemoryStatus>>,
) {
  return {
    operator_id: operator.operator_id,
    project_key: operator.project_key,
    memory_scope: operator.memory_scope,
    tabs: operator.memory_tabs,
    sources: [
      "projects.yaml operation_agent",
      "active spec docs",
      "project evidence/handoff",
      "control_plane_project_operator_memory_links",
      "AgentMemory status/search summaries",
    ],
    agentmemory: {
      available: memory.health.available,
      configured: memory.config.mcp_configured || memory.config.mentions_agentmemory,
      runtime_path: memory.runtime_path,
      install_required_approval: memory.install_required_approval,
    },
    exposure_policy: "safe-summary-only-no-raw-config-no-secrets-no-transcripts",
  };
}

function buildRegistryProjects(db: RuntimeContext["db"]): {
  doc: DocStatus;
  projects: RegistryProject[];
  repo_estate_root: string;
  db_project_count: number;
  db_projects: DbProjectProjection[];
  repo_estate_discovery: RepoEstateDiscovery[];
  lifecycle_counts: Record<ProjectLifecycleStatus, number>;
  registered_count: number;
  dirty_count: number;
  missing_count: number;
  unlinked_count: number;
} {
  const registryPath = path.join(CODEX_CONTROL_ROOT, "registry", "projects.yaml");
  let parseStatus: DocStatus["parse_status"] = "ok";
  let raw = "";
  let entries: ReturnType<typeof parseSimpleProjectsYaml> = [];
  try {
    raw = readText(registryPath);
    entries = parseSimpleProjectsYaml(raw);
  } catch {
    parseStatus = "error";
  }
  const doc = fileStatus("projects.yaml", registryPath, parseStatus);
  const dbRows = readDbProjectRows(db);
  const dbProjects = readDbProjects(db);
  const registryByAbsolutePath = new Map<string, string>();
  const projects: RegistryProject[] = entries.map((entry): RegistryProject => {
    const absolutePath = resolveInside(CONTROL_ROOT, entry.path);
    if (!absolutePath) {
      return {
        key: entry.key,
        path: entry.path,
        absolute_path: "",
        type: entry.type,
        has_agents: entry.has_agents,
        status: entry.status,
        lifecycle_status: normalizeProjectLifecycleStatus(entry.status, entry.operation_agent, entry.type),
        filter_group: entry.filter_group,
        default_visible: entry.default_visible ?? entry.filter_group !== "ADS",
        summary: entry.summary,
        operation_agent: entry.operation_agent,
        exists: false,
        db_project_id: null,
        db_project_name: null,
        git: {
          is_repo: false,
          branch: null,
          ahead: 0,
          behind: 0,
          dirty_count: 0,
          untracked_count: 0,
          status: "missing",
          error: "path_outside_control_root",
        },
      };
    }
    registryByAbsolutePath.set(normalizeSlashes(absolutePath), entry.key);
    const dbMatch = dbProjects.get(normalizeSlashes(absolutePath)) ?? null;
    return {
      key: entry.key,
      path: entry.path,
      absolute_path: absolutePath,
      type: entry.type,
      has_agents: entry.has_agents,
      status: entry.status,
      lifecycle_status: normalizeProjectLifecycleStatus(entry.status, entry.operation_agent, entry.type),
      filter_group: entry.filter_group,
      default_visible: entry.default_visible ?? entry.filter_group !== "ADS",
      summary: entry.summary,
      operation_agent: entry.operation_agent,
      exists: fs.existsSync(absolutePath),
      db_project_id: dbMatch?.id ?? null,
      db_project_name: dbMatch?.name ?? null,
      git: inspectGit(absolutePath),
    };
  });
  const lifecycleCounts: Record<ProjectLifecycleStatus, number> = {
    active: projects.filter((project) => project.lifecycle_status === "active").length,
    candidate: projects.filter((project) => project.lifecycle_status === "candidate").length,
    completed: projects.filter((project) => project.lifecycle_status === "completed").length,
    archived: projects.filter((project) => project.lifecycle_status === "archived").length,
  };
  return {
    doc,
    projects,
    repo_estate_root: REPO_ESTATE_ROOT,
    db_project_count: dbRows.length,
    db_projects: buildDbProjectProjections(dbRows, registryByAbsolutePath),
    repo_estate_discovery: buildRepoEstateDiscovery(registryByAbsolutePath),
    lifecycle_counts: lifecycleCounts,
    registered_count: projects.length,
    dirty_count: projects.filter((project) => project.git.status === "dirty").length,
    missing_count: projects.filter((project) => !project.exists).length,
    unlinked_count: projects.filter((project) => !project.db_project_id).length,
  };
}

function listMarkdownDocs(dir: string): DocStatus[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => fileStatus(entry.name, path.join(dir, entry.name)));
}

function buildActiveSpecStatus() {
  const activePath = path.join(CODEX_CONTROL_ROOT, "specs", "_active.md");
  const raw = readText(activePath);
  const active = parseActiveSpec(raw);
  const safeActiveId = isSafeSpecId(active.id) ? active.id : null;
  const specDir = safeActiveId ? path.join(CODEX_CONTROL_ROOT, "specs", safeActiveId) : null;
  const docs = specDir ? listMarkdownDocs(specDir) : [];
  const requiredDocs = VER1_REQUIRED_SPEC_DOCS;
  const missingDocs = requiredDocs.filter((doc) => !docs.some((item) => item.key === doc && item.exists));
  return {
    doc: fileStatus("_active.md", activePath, raw ? "ok" : "missing"),
    ...active,
    id: safeActiveId,
    parse_error: active.id && !safeActiveId ? "invalid_spec_id" : null,
    spec_dir: specDir,
    docs,
    missing_docs: missingDocs,
  };
}

function buildDocGroupStatus(key: string, relativeDir: string, files: string[]) {
  const dir = path.join(CODEX_CONTROL_ROOT, relativeDir);
  const docs = files.map((name) => fileStatus(name, path.join(dir, name)));
  return {
    key,
    dir,
    exists: fs.existsSync(dir),
    docs,
    expected_count: files.length,
    present_count: docs.filter((doc) => doc.exists).length,
    missing_count: docs.filter((doc) => !doc.exists).length,
  };
}

function parseApprovalLedger(specId: string | null) {
  if (!isSafeSpecId(specId)) {
    return { path: null, entries: [], approved_count: 0, required_count: 0 };
  }
  const approvalPath = path.join(CODEX_CONTROL_ROOT, "specs", specId, "approvals.md");
  const raw = readText(approvalPath);
  let headers: string[] = [];
  const entries = raw.split(/\r?\n/).flatMap((line) => {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length === 0) return [];
    if (/approval id/i.test(cells[0]) || /approval_id/i.test(cells[0])) {
      headers = cells.map((cell) => cell.toLowerCase().replace(/\s+/g, "_"));
      return [];
    }
    if (!/^APR-[A-Z]+(?:-[A-Z]+)*-\d{3}$/.test(cells[0])) return [];
    const byHeader = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    return [
      {
        id: byHeader.approval_id ?? cells[0] ?? "",
        status: byHeader.status ?? cells[1] ?? "",
        created_at: byHeader.created_at ?? "",
        expires_at: byHeader.expires_at ?? "",
        requester_role: byHeader.requester_role ?? "",
        approver: byHeader.approver ?? "",
        scope: byHeader.scope ?? "",
        repo: byHeader.repo ?? "",
        resolved_paths: byHeader.resolved_paths ?? "",
        operation_class: byHeader.operation_class ?? "",
        command_digest: byHeader.command_digest ?? "",
        risk: byHeader.risk_level ?? byHeader.risk ?? "",
        policy_decision: byHeader.policy_decision ?? "",
        approval_text_ref: byHeader.approval_text_ref ?? "",
        preflight_result: byHeader.preflight_result ?? "",
        postflight_result: byHeader.postflight_result ?? "",
        evidence: byHeader.evidence_ref ?? byHeader.evidence ?? "",
        reason_code: byHeader.reason_code ?? "",
      },
    ];
  });
  return {
    path: approvalPath,
    entries,
    approved_count: entries.filter((entry) => entry.status === "approved").length,
    required_count: entries.filter((entry) => entry.status === "required").length,
  };
}

function buildVer1Status(activeSpecId: string | null) {
  const ver1SpecId = resolveVer1SpecId(activeSpecId);
  const groups = {
    steering: buildDocGroupStatus("steering", "steering", VER1_GROUPS.steering),
    hooks: buildDocGroupStatus("hooks", "hooks", VER1_GROUPS.hooks),
    orchestrator: buildDocGroupStatus("orchestrator", "orchestrator", VER1_GROUPS.orchestrator),
    context_packs: buildDocGroupStatus("context-packs", "context-packs", VER1_GROUPS.context_packs),
    quality: buildDocGroupStatus("quality", "quality", VER1_GROUPS.quality),
    integrations: buildDocGroupStatus("integrations", "integrations", VER1_GROUPS.integrations),
  };
  const hardGateDocs = [
    ...Object.values(groups).flatMap((group) => group.docs),
    ...VER1_REQUIRED_SPEC_DOCS.map((name) =>
      fileStatus(name, path.join(CODEX_CONTROL_ROOT, "specs", ver1SpecId, name)),
    ),
  ];
  const missingCount = hardGateDocs.filter((doc) => !doc.exists).length;
  const hasKiroDir =
    fs.existsSync(path.join(CONTROL_ROOT, ".kiro")) || findDirectoryByName(CODEX_CONTROL_ROOT, ".kiro").length > 0;
  const score = Math.max(0, 100 - missingCount * 5 - (hasKiroDir ? 50 : 0) - (activeSpecId !== ver1SpecId ? 10 : 0));
  return {
    version: "Donggri Root Control SDD Ver.1",
    spec_id: ver1SpecId,
    active: activeSpecId === ver1SpecId,
    structure_map: {
      specs: "storage\\codex-control\\specs",
      steering: "storage\\codex-control\\steering",
      hooks: "storage\\codex-control\\hooks",
      orchestration: "storage\\codex-control\\orchestrator",
      context_injection: "storage\\codex-control\\context-packs",
      verification: "storage\\codex-control\\quality",
      reporting: "DonggriCompany Control Plane page",
    },
    groups,
    department_agents: buildDepartmentAgentManifests(),
    persona_subagents: {
      model: "department-agent-controlled-disposable-personas",
      permanent_team_hierarchy: false,
      lifecycle_states: [
        "created",
        "running",
        "returned",
        "accepted",
        "rejected",
        "recreated",
        "merged",
        "expired",
        "failed",
      ],
      max_recreate_attempts: 2,
      repo_write_parent: "IMPLEMENT",
      required_fields: [
        "persona_id",
        "parent_agent",
        "objective",
        "input_docs",
        "allowed_paths",
        "write_policy",
        "return_schema",
        "expiry",
        "quality_bar",
        "recreate_policy",
      ],
    },
    approval_ledger: parseApprovalLedger(activeSpecId),
    hard_gates: {
      has_kiro_dir: hasKiroDir,
      missing_required_docs: missingCount,
      no_kiro_runtime_dependency: true,
      no_team_hierarchy: true,
      future_version_planning_started: false,
    },
    quality_score: {
      score,
      target: 95,
      pass: score >= 95 && !hasKiroDir && activeSpecId === ver1SpecId,
    },
    agy_review: {
      required: true,
      model: "Gemini 3.1 Pro (High)",
      status: "pending-local-verification",
      command_cwd: CONTROL_ROOT,
    },
    gemini_review: {
      required: true,
      model: "Gemini 3.1 Pro (High)",
      status: "legacy-alias-for-agy-review",
      command_cwd: CONTROL_ROOT,
    },
  };
}

function findDirectoryByName(root: string, name: string): string[] {
  if (!fs.existsSync(root)) return [];
  const found: string[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(current, entry.name);
      if (entry.name.toLowerCase() === name.toLowerCase()) found.push(full);
      stack.push(full);
    }
  }
  return found;
}

function buildHandoffStatus() {
  const handoffDir = path.join(CODEX_CONTROL_ROOT, "handoffs", "legacy-threads");
  const files = fs.existsSync(handoffDir)
    ? fs
        .readdirSync(handoffDir)
        .filter((name) => name.toLowerCase().endsWith(".md"))
        .map((name) => fileStatus(name, path.join(handoffDir, name)))
    : [];
  const foundTargets = new Set(
    files.map((file) =>
      file.key
        .replace(/-\d{8}\.md$/i, "")
        .replace(/\.md$/i, "")
        .toLowerCase(),
    ),
  );
  const missing = LEGACY_THREAD_TARGETS.filter((target) => !foundTargets.has(target));
  return {
    dir: handoffDir,
    count: files.length,
    files,
    expected_targets: LEGACY_THREAD_TARGETS,
    missing_targets: missing,
  };
}

function buildMemoryDocs() {
  const memoryDir = path.join(CODEX_CONTROL_ROOT, "memory");
  const docs = ["policy.md", "sources.md", "retention.md", "agentmemory.md"].map((name) =>
    fileStatus(name, path.join(memoryDir, name)),
  );
  return {
    dir: memoryDir,
    docs,
    missing_count: docs.filter((doc) => !doc.exists).length,
  };
}

function buildSafetyStatus() {
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  const setupFinalPath = path.join(CODEX_CONTROL_ROOT, "prompts", "setup-final.md");
  const configExists = fs.existsSync(configPath);
  const config = configExists ? readText(configPath) : "";
  const sandboxMode = config.match(/^\s*sandbox_mode\s*=\s*["']([^"']+)["']/m)?.[1] ?? null;
  const setupFinalPending = sandboxMode === "danger-full-access";
  return {
    setup_final: {
      prompt: fileStatus("setup-final.md", setupFinalPath),
      global_config_exists: configExists,
      sandbox_mode: sandboxMode,
      pending: setupFinalPending,
      expected_sandbox_mode: "workspace-write",
    },
    approvals_required: [
      "AgentMemory install/connect and hooks/MCP wiring",
      "Docker execution or volume changes",
      "Git commit/push/history changes",
      "Secrets or deployment config changes",
    ],
    approved_operations: ["DB sync apply/link-table writes limited to control_plane_* tables"],
    deferred_operations: ["SETUP-FINAL global Codex config permission lowering"],
    drive_rules: {
      d: "system-reserved",
      f: "asset/runtime/cache/archive backing store",
      g: "current Dev Drive for code/control docs/lightweight state",
    },
  };
}

async function searchOpenSourceSkillCandidates(query: string, limit: number) {
  const safeQuery = query.trim().slice(0, 160) || "agent framework";
  const safeLimit = Math.max(1, Math.min(12, Math.floor(limit) || 6));
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", `${safeQuery} in:name,description stars:>100`);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(safeLimit));

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "dongri-grigri-external-instructor",
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        available: false,
        query: safeQuery,
        candidates: [],
        status_code: response.status,
        error: `github_search_failed_${response.status}`,
      };
    }
    const body = (await response.json()) as {
      items?: Array<{
        full_name?: string;
        html_url?: string;
        description?: string | null;
        stargazers_count?: number;
        language?: string | null;
        updated_at?: string | null;
        topics?: string[];
      }>;
    };
    return {
      ok: true,
      available: true,
      query: safeQuery,
      source: "GitHub Search API",
      policy: "read-only candidate discovery; install and hook wiring require OPS approval",
      candidates: (body.items ?? []).slice(0, safeLimit).map((item) => ({
        name: item.full_name ?? "unknown",
        url: item.html_url ?? null,
        description: item.description ?? "",
        stars: Number(item.stargazers_count ?? 0),
        language: item.language ?? null,
        updated_at: item.updated_at ?? null,
        topics: item.topics ?? [],
        suggested_scope: "external-instructor-skill-candidate",
      })),
      status_code: response.status,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      available: false,
      query: safeQuery,
      candidates: [],
      status_code: null,
      error: safeError(error),
    };
  }
}

function parseTomlSections(raw: string, sectionPrefix: string): Array<{ key: string; enabled: boolean | null }> {
  const lines = raw.split(/\r?\n/);
  const out: Array<{ key: string; enabled: boolean | null }> = [];
  let current: { key: string; enabled: boolean | null } | null = null;
  const header = new RegExp(`^\\[${sectionPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.([^\\]]+)\\]\\s*$`);
  for (const line of lines) {
    const match = line.match(header);
    if (match) {
      if (current) out.push(current);
      current = { key: match[1].trim().replace(/^["']|["']$/g, ""), enabled: null };
      continue;
    }
    if (/^\[/.test(line)) {
      if (current) out.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const enabledMatch = line.match(/^\s*enabled\s*=\s*(true|false)\s*$/i);
    if (enabledMatch) current.enabled = enabledMatch[1].toLowerCase() === "true";
  }
  if (current) out.push(current);
  return out;
}

function parseTrustedProjectSections(
  raw: string,
): Array<{ path: string; classification: string; trust_level: string | null }> {
  const lines = raw.split(/\r?\n/);
  const out: Array<{ path: string; classification: string; trust_level: string | null }> = [];
  let current: { path: string; classification: string; trust_level: string | null } | null = null;
  for (const line of lines) {
    const match = line.match(/^\[projects\.([^\]]+)\]\s*$/);
    if (match) {
      if (current) out.push(current);
      const projectPath = match[1].trim().replace(/^["']|["']$/g, "");
      const resolved = path.resolve(projectPath);
      const classification =
        normalizeSlashes(resolved) === normalizeSlashes(CONTROL_ROOT)
          ? "control-root"
          : normalizeSlashes(resolved) === normalizeSlashes(REPO_ESTATE_ROOT)
            ? "repo-estate-root"
            : isInside(REPO_ESTATE_ROOT, resolved)
              ? "legacy-repo-alias"
              : "legacy-or-external";
      current = { path: projectPath, classification, trust_level: null };
      continue;
    }
    if (/^\[/.test(line)) {
      if (current) out.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const trustMatch = line.match(/^\s*trust_level\s*=\s*["']([^"']+)["']\s*$/);
    if (trustMatch) current.trust_level = trustMatch[1];
  }
  if (current) out.push(current);
  return out;
}

function countEntries(dir: string, predicate: (entry: fs.Dirent) => boolean): number {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(predicate).length;
  } catch {
    return 0;
  }
}

function listFiles(dir: string, extension: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

const DEPARTMENT_AGENT_FILES: Array<{
  id: DepartmentAgentManifest["id"];
  file: string;
  role: string;
  write_policy: string;
  can_spawn_write_persona: boolean;
}> = [
  {
    id: "CONTROL",
    file: "control.toml",
    role: "root state, routing, approvals, quality gate, run creation",
    write_policy: "control-plane-docs",
    can_spawn_write_persona: true,
  },
  {
    id: "SPEC",
    file: "spec_writer.toml",
    role: "requirements, design, tasks, repo-map, approvals",
    write_policy: "spec-docs",
    can_spawn_write_persona: true,
  },
  {
    id: "EXPLORE",
    file: "explorer.toml",
    role: "read-only repo and document investigation",
    write_policy: "read-only",
    can_spawn_write_persona: false,
  },
  {
    id: "IMPLEMENT",
    file: "implementer.toml",
    role: "approved task implementation",
    write_policy: "approved-task-files",
    can_spawn_write_persona: true,
  },
  {
    id: "REVIEW",
    file: "reviewer.toml",
    role: "read-only findings-first review",
    write_policy: "read-only",
    can_spawn_write_persona: false,
  },
  {
    id: "OPS",
    file: "ops.toml",
    role: "runtime, config, DB sync, Gemini, AgentMemory, safety gates",
    write_policy: "evidence-and-approved-ops",
    can_spawn_write_persona: true,
  },
];

const DONGRI_GRIGRI_DEPARTMENTS: Record<
  DepartmentAgentManifest["id"],
  { label: string; short_label: string; accent: string; memory_focus: string }
> = {
  CONTROL: {
    label: "Control",
    short_label: "CTL",
    accent: "#38bdf8",
    memory_focus: "root state, routing, approvals, quality gate",
  },
  SPEC: {
    label: "Spec",
    short_label: "SPC",
    accent: "#a78bfa",
    memory_focus: "requirements, design, tasks, repo-map",
  },
  EXPLORE: {
    label: "Explore",
    short_label: "EXP",
    accent: "#22c55e",
    memory_focus: "read-only investigation and repo discovery",
  },
  IMPLEMENT: {
    label: "Implement",
    short_label: "IMP",
    accent: "#f59e0b",
    memory_focus: "approved task implementation and evidence",
  },
  REVIEW: {
    label: "Review",
    short_label: "REV",
    accent: "#fb7185",
    memory_focus: "findings-first review and regression risk",
  },
  OPS: {
    label: "Ops",
    short_label: "OPS",
    accent: "#14b8a6",
    memory_focus: "runtime, Git, Docker, AgentMemory, Gemini, DB sync",
  },
};

const DONGRI_MASTER_DEPARTMENTS: MasterDepartmentAgent[] = [
  {
    id: "strategy",
    label: "기획 마스터",
    short_label: "기획",
    accent: "#2563eb",
    mission: "목표, 요구사항, 우선순위, SDD 산출물을 정리합니다.",
    memory_scope: "department:strategy",
    memory_focus: "요구사항, 의사결정, 승인 체크리스트, 프로젝트 방향",
    internal_roles: ["CONTROL", "SPEC"],
    can_create_read_persona: true,
    can_create_write_persona: true,
    write_boundary: "Control Plane spec 문서와 승인 장부만 갱신",
  },
  {
    id: "engineering",
    label: "개발 마스터",
    short_label: "개발",
    accent: "#16a34a",
    mission: "구조 분석, 구현 계획, 승인된 코드 변경을 담당합니다.",
    memory_scope: "department:engineering",
    memory_focus: "코드 구조, 구현 근거, allowed files, 빌드/테스트 결과",
    internal_roles: ["EXPLORE", "IMPLEMENT"],
    can_create_read_persona: true,
    can_create_write_persona: true,
    write_boundary: "승인된 T-NNN과 repo-map allowed files 안에서만 구현",
  },
  {
    id: "design",
    label: "디자인 마스터",
    short_label: "디자인",
    accent: "#d946ef",
    mission: "UI/UX, 화면 밀도, 테마, 한글 표현 품질을 책임집니다.",
    memory_scope: "department:design",
    memory_focus: "화면 개선, 한글 문구, 접근성, 주간/야간 테마 증거",
    internal_roles: ["EXPLORE", "IMPLEMENT", "REVIEW"],
    can_create_read_persona: true,
    can_create_write_persona: true,
    write_boundary: "승인된 UI task와 디자인 관련 allowed files 안에서만 변경",
  },
  {
    id: "quality",
    label: "품질 마스터",
    short_label: "품질",
    accent: "#f97316",
    mission: "검토, 테스트, 회귀 위험, 릴리즈 게이트를 관리합니다.",
    memory_scope: "department:quality",
    memory_focus: "테스트 결과, findings, hard gate, 남은 리스크",
    internal_roles: ["REVIEW"],
    can_create_read_persona: true,
    can_create_write_persona: false,
    write_boundary: "read-only 검토, evidence/handoff 요약은 부모 에이전트가 병합",
  },
  {
    id: "operations",
    label: "운영 마스터",
    short_label: "운영",
    accent: "#0f766e",
    mission: "프로젝트 scope, 런타임, DB sync, AgentMemory, Gemini 검토를 운영합니다.",
    memory_scope: "department:operations",
    memory_focus: "프로젝트 scope, runtime 상태, DB sync, AgentMemory, 승인 이력",
    internal_roles: ["CONTROL", "OPS"],
    can_create_read_persona: true,
    can_create_write_persona: true,
    write_boundary: "control_plane_* append/upsert와 승인된 OPS 작업만 수행",
  },
  {
    id: "instructor",
    label: "외부강사 마스터",
    short_label: "강사",
    accent: "#7c3aed",
    mission: "오픈소스 트렌드와 높은 star 도구를 조사해 Skill 후보로 제안합니다.",
    memory_scope: "department:instructor",
    memory_focus: "GitHub 트렌드, high-star repository, Skill 후보, 적용 근거",
    internal_roles: ["EXPLORE", "OPS"],
    can_create_read_persona: true,
    can_create_write_persona: false,
    write_boundary: "read-only 조사와 후보 제안만 수행, 설치/후킹은 OPS 승인 필요",
    external_sources: ["GitHub Search API", "rohitg00/agentmemory", "공식 문서와 릴리즈 노트"],
  },
];

const TEXT_INTEGRITY_FILES = [
  "src/components/Sidebar.tsx",
  "src/components/ControlPlanePage.tsx",
  "src/components/ControlPlaneSummaryCard.tsx",
  "src/components/Dashboard.tsx",
  "src/components/TaskBoard.tsx",
  "src/components/SkillsLibrary.tsx",
  "src/components/settings/SettingsTabNav.tsx",
  "src/components/settings/PixelAgentModeSettingsTab.tsx",
  "src/components/settings/settings-copy.ts",
  "src/app/AppMainLayout.tsx",
  "src/app/useAppLabels.ts",
  "src/types/index.ts",
];

const MOJIBAKE_PATTERNS: Array<{ id: string; regex: RegExp }> = [
  { id: "replacement-character", regex: /\uFFFD/g },
  { id: "question-hangul-fragment", regex: /\?[ㄱ-ㅎㅏ-ㅣ가-힣]/g },
  { id: "known-broken-syllable-fragment", regex: /[留湲誇媛濡遺筌怨願塋鼇]/g },
  { id: "legacy-garbled-token", regex: /\?쒕|\?댁|\?ㅽ|\?낅|쒕|꾨|덈/g },
];

function extractTomlString(raw: string, key: string): string | null {
  const single = raw.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"\\s*$`, "m"));
  if (single) return single[1];
  const multi = raw.match(new RegExp(`^\\s*${key}\\s*=\\s*"""([\\s\\S]*?)"""`, "m"));
  return multi?.[1]?.trim() ?? null;
}

function buildDepartmentAgentManifests(): DepartmentAgentManifest[] {
  const rootAgentsDir = path.join(CONTROL_ROOT, ".codex", "agents");
  return DEPARTMENT_AGENT_FILES.map((item) => {
    const filePath = path.join(rootAgentsDir, item.file);
    const raw = readText(filePath);
    return {
      id: item.id,
      file: item.file,
      name: extractTomlString(raw, "name") ?? item.id.toLowerCase(),
      description: extractTomlString(raw, "description") ?? item.role,
      sandbox_mode: extractTomlString(raw, "sandbox_mode") ?? "unknown",
      role: item.role,
      write_policy: item.write_policy,
      can_spawn_read_persona: true,
      can_spawn_write_persona: item.can_spawn_write_persona,
      canonical: fs.existsSync(filePath),
    };
  });
}

function asDepartmentId(value: unknown): DepartmentAgentManifest["id"] | null {
  const upper = String(value ?? "").toUpperCase();
  return DEPARTMENT_AGENT_FILES.some((item) => item.id === upper) ? (upper as DepartmentAgentManifest["id"]) : null;
}

function parseMaybeJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseMaybeJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function formatEventTime(value: unknown): string | null {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric).toISOString() : null;
}

function buildRunChatMessage(run: Record<string, unknown>) {
  const context = parseMaybeJsonObject(run.context_pack_json);
  if (context.source === "codex_thread_activation") {
    const status = String(run.status ?? "unknown");
    const threadId = String(context.codex_thread_id ?? "");
    const scopeKey = String(context.scope_key ?? "project:DonggriCompany");
    const handoffPath = typeof context.handoff_path === "string" ? ` · handoff: ${context.handoff_path}` : "";
    return {
      title: status === "completed" || status === "cancelled" ? "Codex thread 종료됨" : "Codex thread 연결됨",
      detail: `${threadId || "thread 미감지"} · ${scopeKey} · ${status}${handoffPath}`,
      evidence_refs: parseMaybeJsonArray(context.evidence_refs),
      source: "codex_thread_activation",
    };
  }
  return {
    title: `Run ${String(run.status ?? "unknown")}`,
    detail: String(run.objective ?? "Control Plane run"),
    evidence_refs: [] as string[],
    source: "control_plane_agent_runs",
  };
}

function buildDepartmentMemorySummaries(
  memory: Awaited<ReturnType<typeof buildAgentMemoryStatus>>,
  memoryDocs: ReturnType<typeof buildMemoryDocs>,
  runner: RunnerStatus,
) {
  const recentByDepartment = new Map<DepartmentAgentManifest["id"], number>();
  for (const run of runner.recent_runs) {
    const department = asDepartmentId(run.department_agent);
    const updatedAt = Number(run.updated_at ?? 0);
    if (department && updatedAt > (recentByDepartment.get(department) ?? 0))
      recentByDepartment.set(department, updatedAt);
  }
  for (const persona of runner.recent_personas) {
    const department = asDepartmentId(persona.parent_agent);
    const updatedAt = Number(persona.updated_at ?? 0);
    if (department && updatedAt > (recentByDepartment.get(department) ?? 0))
      recentByDepartment.set(department, updatedAt);
  }

  return buildDepartmentAgentManifests().map((agent) => {
    const meta = DONGRI_GRIGRI_DEPARTMENTS[agent.id];
    const lastActivity = recentByDepartment.get(agent.id) ?? null;
    return {
      department: agent.id,
      label: meta.label,
      short_label: meta.short_label,
      accent: meta.accent,
      memory_scope: `department:${agent.id.toLowerCase()}`,
      memory_focus: meta.memory_focus,
      sources: [
        "root AGENTS.md",
        "projects.yaml",
        "active spec docs",
        "runner/persona events",
        "AgentMemory status/search summaries",
      ],
      docs_present: memoryDocs.docs.filter((doc) => doc.exists).length,
      docs_missing: memoryDocs.missing_count,
      agentmemory_available: memory.health.available,
      agentmemory_configured: memory.config.mcp_configured || memory.config.mentions_agentmemory,
      last_activity_at: lastActivity ? new Date(lastActivity).toISOString() : null,
      exposure_policy: "safe-summary-only-no-raw-config-no-secrets-no-transcripts",
    };
  });
}

function buildMasterDepartmentManifests() {
  return DONGRI_MASTER_DEPARTMENTS.map((department) => ({
    ...department,
    subagent_policy: "single-task disposable helpers; parent master accepts, rejects, recreates, and merges results",
  }));
}

function buildMasterDepartmentMemorySummaries(
  memory: Awaited<ReturnType<typeof buildAgentMemoryStatus>>,
  memoryDocs: ReturnType<typeof buildMemoryDocs>,
  runner: RunnerStatus,
) {
  const recentByRole = new Map<DepartmentAgentManifest["id"], number>();
  for (const run of runner.recent_runs) {
    const role = asDepartmentId(run.department_agent);
    const updatedAt = Number(run.updated_at ?? 0);
    if (role && updatedAt > (recentByRole.get(role) ?? 0)) recentByRole.set(role, updatedAt);
  }
  for (const persona of runner.recent_personas) {
    const role = asDepartmentId(persona.parent_agent);
    const updatedAt = Number(persona.updated_at ?? 0);
    if (role && updatedAt > (recentByRole.get(role) ?? 0)) recentByRole.set(role, updatedAt);
  }

  return DONGRI_MASTER_DEPARTMENTS.map((department) => {
    const latest = department.internal_roles.reduce((max, role) => Math.max(max, recentByRole.get(role) ?? 0), 0);
    return {
      department: department.id,
      label: department.label,
      short_label: department.short_label,
      accent: department.accent,
      memory_scope: department.memory_scope,
      memory_focus: department.memory_focus,
      sources: [
        "root AGENTS.md",
        "projects.yaml",
        "active spec docs",
        "department/persona run events",
        "AgentMemory safe search/context summaries",
      ],
      docs_present: memoryDocs.docs.filter((doc) => doc.exists).length,
      docs_missing: memoryDocs.missing_count,
      agentmemory_available: memory.health.available,
      agentmemory_configured: memory.config.mcp_configured || memory.config.mentions_agentmemory,
      last_activity_at: latest > 0 ? new Date(latest).toISOString() : null,
      exposure_policy: "safe-summary-only-no-raw-config-no-secrets-no-transcripts",
    };
  });
}

function buildDepartmentChatRooms(runner: RunnerStatus) {
  const rooms = buildDepartmentAgentManifests().map((agent) => ({
    department: agent.id,
    label: DONGRI_GRIGRI_DEPARTMENTS[agent.id].label,
    accent: DONGRI_GRIGRI_DEPARTMENTS[agent.id].accent,
    messages: [] as Array<{
      id: string;
      at: string | null;
      kind: "run" | "persona" | "event";
      title: string;
      detail: string;
      evidence_refs: string[];
      source: string;
    }>,
  }));
  const byDepartment = new Map(rooms.map((room) => [room.department, room]));

  for (const run of runner.recent_runs) {
    const department = asDepartmentId(run.department_agent);
    if (!department) continue;
    const message = buildRunChatMessage(run);
    byDepartment.get(department)?.messages.push({
      id: String(run.id ?? `run-${run.updated_at ?? ""}`),
      at: formatEventTime(run.updated_at),
      kind: "run",
      ...message,
    });
  }

  for (const persona of runner.recent_personas) {
    const department = asDepartmentId(persona.parent_agent);
    if (!department) continue;
    byDepartment.get(department)?.messages.push({
      id: String(persona.persona_id ?? `persona-${persona.updated_at ?? ""}`),
      at: formatEventTime(persona.updated_at),
      kind: "persona",
      title: `Persona ${String(persona.status ?? "unknown")}`,
      detail: String(persona.objective ?? "persona run"),
      evidence_refs: [],
      source: "control_plane_persona_runs",
    });
  }

  for (const event of runner.recent_events) {
    const persona = runner.recent_personas.find((item) => item.persona_id === event.persona_id);
    const department = asDepartmentId(persona?.parent_agent);
    if (!department) continue;
    byDepartment.get(department)?.messages.push({
      id: String(event.id ?? `event-${event.created_at ?? ""}`),
      at: formatEventTime(event.created_at),
      kind: "event",
      title: `Decision ${String(event.decision ?? event.event_type ?? "recorded")}`,
      detail: String(event.reason ?? event.merged_into ?? "persona lifecycle event"),
      evidence_refs: parseMaybeJsonArray(event.evidence_refs_json),
      source: "control_plane_persona_events",
    });
  }

  return rooms.map((room) => ({
    ...room,
    messages: room.messages.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? ""))).slice(0, 8),
  }));
}

function roleToMasterDepartment(role: DepartmentAgentManifest["id"]): string {
  if (role === "SPEC") return "strategy";
  if (role === "IMPLEMENT") return "engineering";
  if (role === "REVIEW") return "quality";
  if (role === "OPS" || role === "CONTROL") return "operations";
  return "instructor";
}

function buildMasterDepartmentChatRooms(runner: RunnerStatus) {
  const rooms = DONGRI_MASTER_DEPARTMENTS.map((department) => ({
    department: department.id,
    label: department.label,
    accent: department.accent,
    messages: [] as Array<{
      id: string;
      at: string | null;
      kind: "run" | "persona" | "event";
      title: string;
      detail: string;
      evidence_refs: string[];
      source: string;
    }>,
  }));
  const byDepartment = new Map(rooms.map((room) => [room.department, room]));

  for (const run of runner.recent_runs) {
    const role = asDepartmentId(run.department_agent);
    if (!role) continue;
    const message = buildRunChatMessage(run);
    byDepartment.get(roleToMasterDepartment(role))?.messages.push({
      id: String(run.id ?? `run-${run.updated_at ?? ""}`),
      at: formatEventTime(run.updated_at),
      kind: "run",
      ...message,
    });
  }

  for (const persona of runner.recent_personas) {
    const role = asDepartmentId(persona.parent_agent);
    if (!role) continue;
    byDepartment.get(roleToMasterDepartment(role))?.messages.push({
      id: String(persona.persona_id ?? `persona-${persona.updated_at ?? ""}`),
      at: formatEventTime(persona.updated_at),
      kind: "persona",
      title: `Persona ${String(persona.status ?? "unknown")}`,
      detail: String(persona.objective ?? "persona run"),
      evidence_refs: [],
      source: "control_plane_persona_runs",
    });
  }

  for (const event of runner.recent_events) {
    const persona = runner.recent_personas.find((item) => item.persona_id === event.persona_id);
    const role = asDepartmentId(persona?.parent_agent);
    if (!role) continue;
    byDepartment.get(roleToMasterDepartment(role))?.messages.push({
      id: String(event.id ?? `event-${event.created_at ?? ""}`),
      at: formatEventTime(event.created_at),
      kind: "event",
      title: `Decision ${String(event.decision ?? event.event_type ?? "recorded")}`,
      detail: String(event.reason ?? event.merged_into ?? "persona lifecycle event"),
      evidence_refs: parseMaybeJsonArray(event.evidence_refs_json),
      source: "control_plane_persona_events",
    });
  }

  return rooms.map((room) => ({
    ...room,
    messages: room.messages.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? ""))).slice(0, 8),
  }));
}

function buildKoreanTextIntegrityStatus() {
  const files = TEXT_INTEGRITY_FILES.map((relativePath) => {
    const filePath = path.join(RUNTIME_PROJECTION_APP, relativePath);
    const raw = readText(filePath);
    const matches = MOJIBAKE_PATTERNS.flatMap((pattern) =>
      [...raw.matchAll(pattern.regex)].slice(0, 20).map((match) => ({
        pattern: pattern.id,
        sample: match[0],
        index: match.index ?? 0,
      })),
    );
    return {
      path: filePath,
      relative_path: relativePath,
      exists: fs.existsSync(filePath),
      match_count: matches.length,
      matches: matches.slice(0, 12),
    };
  });
  const totalMatches = files.reduce((sum, file) => sum + file.match_count, 0);
  return {
    pass: totalMatches === 0,
    checked_files: files.length,
    total_matches: totalMatches,
    files,
    policy: "visible Korean UI text must be readable; console mojibake is not accepted as proof",
  };
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    return value
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseAllowedPaths(value: unknown): { read: string[]; write: string[] } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    return {
      read: parseJsonArray(item.read),
      write: parseJsonArray(item.write),
    };
  }
  return { read: [], write: [] };
}

function hasApprovedApproval(
  specId: string | null,
  pattern: RegExp,
  predicate: (entry: Record<string, string>) => boolean = () => true,
): boolean {
  if (!isSafeSpecId(specId)) return false;
  const now = Date.now();
  return parseApprovalLedger(specId).entries.some((entry) => {
    const expiresAt = entry.expires_at ? Date.parse(entry.expires_at) : Number.NaN;
    const notExpired = Number.isNaN(expiresAt) || expiresAt >= now;
    return (
      entry.status === "approved" && pattern.test(entry.id) && notExpired && predicate(entry as Record<string, string>)
    );
  });
}

function hasApprovedDbSync(specId: string | null): boolean {
  return hasApprovedApproval(
    specId,
    /^APR-DB(?:-[A-Z]+)*-\d+$/,
    (entry) =>
      entry.operation_class === "db-write-non-destructive" &&
      entry.policy_decision === "allow" &&
      entry.scope.includes("control_plane") &&
      entry.resolved_paths.includes("control_plane_") &&
      !/delete|drop|truncate|reset/i.test(entry.command_digest ?? ""),
  );
}

function hasApprovedAgentMemoryRemember(specId: string | null): boolean {
  return hasApprovedApproval(
    specId,
    /^APR-MEM-\d+$/,
    (entry) =>
      entry.operation_class === "agentmemory-remember-non-destructive" &&
      entry.policy_decision === "allow" &&
      /non-destructive/i.test(entry.scope ?? ""),
  );
}

const MUTATION_APPROVAL_POLICY: Record<
  ControlPlaneMutationOperationClass,
  { pattern: RegExp; required_approval: string; blocked_message: string }
> = {
  "harness-run": {
    pattern: /^APR-HARNESS(?:-[A-Z]+)*-\d{3}$/,
    required_approval: "APR-HARNESS-*",
    blocked_message: "Control Plane run mutations require an approved active-spec harness approval.",
  },
  "harness-meta": {
    pattern: /^APR-HARNESS(?:-[A-Z]+)*-\d{3}$/,
    required_approval: "APR-HARNESS-META-*",
    blocked_message: "Harness blueprint draft mutations require an approved active-spec meta-harness approval.",
  },
  "harness-apply": {
    pattern: /^APR-HARNESS-APPLY-\d{3}$/,
    required_approval: "APR-HARNESS-APPLY-*",
    blocked_message: "Applying generated harness blueprints requires separate explicit approval.",
  },
  "persona-evidence": {
    pattern: /^APR-HARNESS(?:-[A-Z]+)*-\d{3}$/,
    required_approval: "APR-HARNESS-*",
    blocked_message: "Persona evidence mutations require an approved active-spec harness approval.",
  },
  "agentmemory-remember-non-destructive": {
    pattern: /^APR-MEM(?:-[A-Z]+)*-\d{3}$/,
    required_approval: "APR-MEM-*",
    blocked_message: "AgentMemory remember requires an approved non-destructive APR-MEM approval.",
  },
  "db-write-non-destructive": {
    pattern: /^APR-DB(?:-[A-Z]+)*-\d{3}$/,
    required_approval: "APR-DB-*",
    blocked_message: "Control Plane DB writes require an approved non-destructive APR-DB approval.",
  },
  "agentmemory-runtime-connect": {
    pattern: /^APR-MEM-RUNTIME-\d{3}$/,
    required_approval: "APR-MEM-RUNTIME-*",
    blocked_message: "AgentMemory runtime start/connect requires separate OPS approval.",
  },
  "codex-engine-sync": {
    pattern: /^APR-CODEX-ENGINE-SYNC-\d{3}$/,
    required_approval: "APR-CODEX-ENGINE-SYNC-*",
    blocked_message: "Codex engine sync mutations require an approved active-spec engine sync approval.",
  },
  "codex-app-server-poc": {
    pattern: /^APR-CODEX-APP-SERVER-POC-\d{3}$/,
    required_approval: "APR-CODEX-APP-SERVER-POC-*",
    blocked_message: "Codex app-server PoC requires a separate active-spec approval.",
  },
};

function approvalAllowsOperation(
  entry: Record<string, string>,
  operationClass: ControlPlaneMutationOperationClass,
): boolean {
  const policyDecision = String(entry.policy_decision ?? "").toLowerCase();
  const operationClasses = String(entry.operation_class ?? "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return (policyDecision === "allow" || policyDecision === "approved") && operationClasses.includes(operationClass);
}

function getApprovedOperationApprovals(specId: string | null, operationClass: ControlPlaneMutationOperationClass) {
  if (!isSafeSpecId(specId)) return [];
  const policy = MUTATION_APPROVAL_POLICY[operationClass];
  const now = Date.now();
  return parseApprovalLedger(specId).entries.filter((entry) => {
    const expiresAt = entry.expires_at ? Date.parse(entry.expires_at) : Number.NaN;
    const notExpired = Number.isNaN(expiresAt) || expiresAt >= now;
    return (
      entry.status === "approved" &&
      policy.pattern.test(entry.id) &&
      notExpired &&
      approvalAllowsOperation(entry as Record<string, string>, operationClass)
    );
  });
}

function getApprovedOperationApprovalIds(
  specId: string | null,
  operationClass: ControlPlaneMutationOperationClass,
): string[] {
  return getApprovedOperationApprovals(specId, operationClass).map((entry) => entry.id);
}

function getHeader(
  req: { get?: (name: string) => string | undefined; headers?: Record<string, unknown> },
  name: string,
): string | null {
  const fromGetter = req.get?.(name) ?? req.get?.(name.toLowerCase());
  if (fromGetter) return fromGetter;
  const value = req.headers?.[name.toLowerCase()] ?? req.headers?.[name];
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : null;
  return typeof value === "string" ? value : null;
}

function isAllowedControlPlaneMutationOrigin(req: {
  get?: (name: string) => string | undefined;
  headers?: Record<string, unknown>;
}): boolean {
  const hasExpressHeaders = typeof req.get === "function" || Boolean(req.headers);
  if (!hasExpressHeaders) return true;
  const origin = getHeader(req, "origin");
  if (!origin) return false;
  return /^https?:\/\/(127\.0\.0\.1|localhost):(8800|8810)$/i.test(origin);
}

function guardControlPlaneMutation(
  req: { get?: (name: string) => string | undefined; headers?: Record<string, unknown> },
  operationClass: ControlPlaneMutationOperationClass,
) {
  if (!isAllowedControlPlaneMutationOrigin(req)) {
    return {
      ok: false as const,
      status: 403,
      error: "control_plane_origin_blocked",
      message: "Control Plane mutations require the local Dongri-grigri app origin.",
    };
  }
  const activeSpec = buildActiveSpecStatus();
  const approvals = getApprovedOperationApprovals(activeSpec.id, operationClass);
  if (approvals.length === 0) {
    const policy = MUTATION_APPROVAL_POLICY[operationClass];
    return {
      ok: false as const,
      status: 403,
      error: "approval_required",
      message: policy.blocked_message,
      operation_class: operationClass,
      active_spec_id: activeSpec.id,
      required_approval: policy.required_approval,
    };
  }
  return {
    ok: true as const,
    active_spec_id: activeSpec.id,
    approval_refs: approvals.map((entry) => entry.id),
  };
}

function buildContextPackPayload(specId: string | null, department: string, objective: string) {
  return {
    root: CONTROL_ROOT,
    control_root: CODEX_CONTROL_ROOT,
    active_spec: specId,
    department,
    objective,
    read_order: [
      "AGENTS.md",
      "storage/codex-control/registry/projects.yaml",
      "storage/codex-control/specs/_active.md",
      "storage/codex-control/steering/agent-model.md",
      "active spec docs",
    ],
    denied_operations: ["git-history-or-remote", "docker-mutation", "secret-change", "deploy", "destructive-db"],
  };
}

function isSafeThreadId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function listCodexSessionCandidates(limit = 5) {
  const sessionsRoot = path.join(os.homedir(), ".codex", "sessions");
  if (!fs.existsSync(sessionsRoot)) return [];
  const candidates: Array<{
    thread_id: string | null;
    source: string;
    path: string;
    size: number;
    mtime: string;
    started_at: string | null;
    sort_time: number;
  }> = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 4 || candidates.length > 200) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const stat = fs.statSync(fullPath);
      const match = entry.name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      const startedMatch = entry.name.match(/rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-/i);
      const startedAt = startedMatch
        ? `${startedMatch[1]}-${startedMatch[2]}-${startedMatch[3]}T${startedMatch[4]}:${startedMatch[5]}:${startedMatch[6]}.000Z`
        : null;
      candidates.push({
        thread_id: match?.[1] ?? null,
        source: "session-file",
        path: fullPath,
        size: stat.size,
        mtime: toIso(stat.mtimeMs),
        started_at: startedAt,
        sort_time: startedAt ? Date.parse(startedAt) : stat.mtimeMs,
      });
    }
  };
  visit(sessionsRoot, 0);
  return candidates
    .sort((a, b) => b.sort_time - a.sort_time || Date.parse(b.mtime) - Date.parse(a.mtime))
    .slice(0, limit)
    .map(({ sort_time: _sortTime, ...candidate }) => candidate);
}

function detectCodexThread() {
  const envThreadId = process.env.CODEX_THREAD_ID;
  const sessionCandidates = listCodexSessionCandidates(5);
  if (isSafeThreadId(envThreadId)) {
    return {
      thread_id: envThreadId,
      source: "env:CODEX_THREAD_ID",
      session_candidates: sessionCandidates,
    };
  }
  return {
    thread_id: null,
    source: "none",
    session_candidates: sessionCandidates,
  };
}

function currentCodexThreadId(threadState: ReturnType<typeof buildCodexThreadCurrent>): string | null {
  return threadState.detected_thread.thread_id ?? null;
}

function makeScopeKey(scopeType: CodexThreadScopeType, scopeValue: string | null) {
  return scopeType === "root" ? "root" : `${scopeType}:${scopeValue ?? ""}`;
}

function validateCodexThreadScope(db: RuntimeContext["db"], scopeTypeRaw: unknown, scopeValueRaw: unknown) {
  const scopeType = String(scopeTypeRaw ?? "project").toLowerCase() as CodexThreadScopeType;
  if (!["root", "project", "spec"].includes(scopeType)) {
    return { ok: false as const, error: "invalid_scope_type" };
  }
  if (scopeType === "root") {
    return { ok: true as const, scope_type: scopeType, scope_value: null, scope_key: "root", selected_repo: null };
  }
  const scopeValue =
    typeof scopeValueRaw === "string" && scopeValueRaw.trim() ? scopeValueRaw.trim() : "DonggriCompany";
  if (scopeType === "project") {
    const registry = buildRegistryProjects(db);
    if (!registry.projects.some((project) => project.key === scopeValue)) {
      return { ok: false as const, error: "invalid_project_scope" };
    }
    return {
      ok: true as const,
      scope_type: scopeType,
      scope_value: scopeValue,
      scope_key: makeScopeKey(scopeType, scopeValue),
      selected_repo: scopeValue,
    };
  }
  if (!isSafeSpecId(scopeValue)) {
    return { ok: false as const, error: "invalid_spec_scope" };
  }
  const specDir = path.join(CODEX_CONTROL_ROOT, "specs", scopeValue);
  if (!fs.existsSync(specDir) || !fs.statSync(specDir).isDirectory()) {
    return { ok: false as const, error: "spec_scope_not_found" };
  }
  return {
    ok: true as const,
    scope_type: scopeType,
    scope_value: scopeValue,
    scope_key: makeScopeKey(scopeType, scopeValue),
    selected_repo: null,
  };
}

function findCodexThreadActivation(
  db: RuntimeContext["db"],
  threadId?: string | null,
  scopeKey?: string | null,
  includeFinished = false,
) {
  if (!tableExists(db, "control_plane_agent_runs")) return null;
  const statuses = includeFinished ? ["observing", "active", "completed", "cancelled"] : ["observing", "active"];
  const rows = db
    .prepare(
      `SELECT * FROM control_plane_agent_runs WHERE status IN (${statuses.map(() => "?").join(",")}) ORDER BY updated_at DESC LIMIT 100`,
    )
    .all(...statuses) as Record<string, unknown>[];
  return (
    rows.find((row) => {
      const context = parseMaybeJsonObject(row.context_pack_json);
      if (context.source !== "codex_thread_activation") return false;
      if (threadId && context.codex_thread_id !== threadId) return false;
      if (scopeKey && context.scope_key !== scopeKey) return false;
      return true;
    }) ?? null
  );
}

function buildCodexThreadCurrent(db: RuntimeContext["db"]) {
  const detected = detectCodexThread();
  const currentActivation = findCodexThreadActivation(db, detected.thread_id);
  return {
    ok: true,
    detected_thread: {
      thread_id: detected.thread_id,
      source: detected.source,
    },
    session_candidates: detected.session_candidates,
    default_scope: {
      scope_type: "project",
      scope_value: "DonggriCompany",
      scope_key: "project:DonggriCompany",
    },
    active_activation: currentActivation,
  };
}

function activateCodexThread(db: RuntimeContext["db"], body: Record<string, unknown>) {
  ensureControlRunnerTables(db);
  if (body.confirm !== "activate-codex-thread") {
    return { ok: false, status: 400, error: "confirmation_required" };
  }
  const detected = detectCodexThread();
  const threadId =
    typeof body.thread_id === "string" && body.thread_id.trim() ? body.thread_id.trim() : detected.thread_id;
  if (!isSafeThreadId(threadId)) {
    return { ok: false, status: 400, error: "invalid_thread_id" };
  }
  const scope = validateCodexThreadScope(db, body.scope_type, body.scope_value);
  if (!scope.ok) return { ok: false, status: 400, error: scope.error };
  const requestedStatus = typeof body.status === "string" ? body.status : "observing";
  const status = requestedStatus === "active" ? "active" : "observing";
  const activeSpec = buildActiveSpecStatus();
  const approvalRefs = getApprovedOperationApprovalIds(activeSpec.id, "harness-run");
  const objective =
    typeof body.objective === "string" && body.objective.trim()
      ? body.objective.trim()
      : "현재 Codex Desktop thread를 Dongri-grigri 운영실에 연결";
  const existing = findCodexThreadActivation(db, threadId, scope.scope_key);
  const now = Date.now();
  const contextPack = {
    ...buildContextPackPayload(activeSpec.id, "OPS", objective),
    source: "codex_thread_activation",
    codex_thread_id: threadId,
    codex_thread_source: typeof body.thread_id === "string" && body.thread_id.trim() ? "manual" : detected.source,
    scope_type: scope.scope_type,
    scope_value: scope.scope_value,
    scope_key: scope.scope_key,
    active_spec_snapshot: {
      id: activeSpec.id,
      status: activeSpec.status,
      phase: activeSpec.phase,
      related_repo: activeSpec.related_repo,
    },
    evidence_refs: parseJsonArray(body.evidence_refs),
  };
  const hookDecisions = [
    {
      hook: "pre-task",
      decision: "allow",
      reason_code: "CODEX_THREAD_ACTIVATION_OBSERVE_ONLY",
      operation_class: "control-plane-runner-state",
    },
  ];
  if (existing) {
    db.prepare(
      "UPDATE control_plane_agent_runs SET status = ?, objective = ?, context_pack_json = ?, hook_decisions_json = ?, updated_at = ? WHERE id = ?",
    ).run(status, objective, JSON.stringify(contextPack), JSON.stringify(hookDecisions), now, String(existing.id));
    return { ok: true, status: 200, duplicate: true, ...readControlRun(db, String(existing.id)) };
  }
  const runId = `cprun-thread-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const routingId = `cproute-thread-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  db.prepare(
    `INSERT INTO control_plane_agent_runs (
      id, spec_id, task_id, department_agent, status, objective, context_pack_json,
      approval_refs_json, hook_decisions_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    activeSpec.id,
    "T-THREAD",
    "OPS",
    status,
    objective,
    JSON.stringify(contextPack),
    JSON.stringify(approvalRefs),
    JSON.stringify(hookDecisions),
    now,
    now,
  );
  db.prepare(
    `INSERT INTO control_plane_routing_decisions (
      id, run_id, spec_id, selected_department, selected_repo, persona_needed, confidence,
      evidence_json, rejection_reason, approval_refs_json, next_safe_action, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    routingId,
    runId,
    activeSpec.id,
    "OPS",
    scope.selected_repo,
    0,
    "high",
    JSON.stringify([
      {
        kind: "codex_thread_activation",
        thread_id: threadId,
        scope: scope.scope_key,
        source: contextPack.codex_thread_source,
      },
    ]),
    null,
    JSON.stringify(approvalRefs),
    "thread handoff/evidence update",
    now,
  );
  return { ok: true, status: 200, duplicate: false, ...readControlRun(db, runId) };
}

function finishCodexThread(db: RuntimeContext["db"], runId: string, body: Record<string, unknown>) {
  ensureControlRunnerTables(db);
  if (body.confirm !== "finish-codex-thread") {
    return { ok: false, status: 400, error: "confirmation_required" };
  }
  const existing = readControlRun(db, runId);
  if (!existing) return { ok: false, status: 404, error: "run_not_found" };
  const context = parseMaybeJsonObject(existing.run.context_pack_json);
  if (context.source !== "codex_thread_activation") {
    return { ok: false, status: 400, error: "not_codex_thread_activation" };
  }
  const finalStatus = body.final_status === "cancelled" ? "cancelled" : "completed";
  const evidenceRefs = parseJsonArray(body.evidence_refs).slice(0, 20);
  const handoffPath = typeof body.handoff_path === "string" ? body.handoff_path.trim() : "";
  if (finalStatus === "completed" && evidenceRefs.length === 0) {
    return { ok: false, status: 400, error: "evidence_refs_required" };
  }
  if (finalStatus === "completed" && !handoffPath) {
    return { ok: false, status: 400, error: "handoff_path_required" };
  }
  if (handoffPath) {
    const resolved = path.isAbsolute(handoffPath) ? path.resolve(handoffPath) : path.resolve(CONTROL_ROOT, handoffPath);
    if (!isInside(CONTROL_ROOT, resolved)) {
      return { ok: false, status: 400, error: "handoff_path_outside_root" };
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return { ok: false, status: 400, error: "handoff_path_not_found" };
    }
  }
  const now = Date.now();
  const updatedContext = {
    ...context,
    evidence_refs: evidenceRefs,
    handoff_path: handoffPath || null,
    finished_at: toIso(now),
  };
  db.prepare("UPDATE control_plane_agent_runs SET status = ?, context_pack_json = ?, updated_at = ? WHERE id = ?").run(
    finalStatus,
    JSON.stringify(updatedContext),
    now,
    runId,
  );
  const routeRows = db
    .prepare("SELECT id, evidence_json FROM control_plane_routing_decisions WHERE run_id = ?")
    .all(runId) as Array<{ id: string; evidence_json: string }>;
  for (const route of routeRows) {
    const evidence = [
      ...parseMaybeJsonArray(route.evidence_json),
      ...evidenceRefs,
      ...(handoffPath ? [handoffPath] : []),
    ];
    db.prepare("UPDATE control_plane_routing_decisions SET evidence_json = ?, next_safe_action = ? WHERE id = ?").run(
      JSON.stringify(evidence),
      "thread closed; review evidence and handoff links",
      route.id,
    );
  }
  return { ok: true, status: 200, ...readControlRun(db, runId) };
}

const HARNESS_PATTERNS: Record<Exclude<HarnessBlueprintPattern, "auto">, { label: string; summary: string }> = {
  pipeline: {
    label: "Pipeline",
    summary: "Sequential SDD phases with explicit handoff and evidence gates.",
  },
  "fan-out-fan-in": {
    label: "Fan-out/Fan-in",
    summary: "Parallel read-only investigations merged through REVIEW evidence.",
  },
  "expert-pool": {
    label: "Expert Pool",
    summary: "Select disposable personas by task context instead of permanent teams.",
  },
  "producer-reviewer": {
    label: "Producer-Reviewer",
    summary: "IMPLEMENT produces only inside approval scope and REVIEW validates before acceptance.",
  },
  supervisor: {
    label: "Supervisor",
    summary: "CONTROL and OPS coordinate routing, approvals, and QMS state.",
  },
  "hierarchical-delegation": {
    label: "Hierarchical Delegation",
    summary: "Represented as a blocked pattern because Donggri Ver.1 forbids nested personas.",
  },
};

function normalizeHarnessTargetMode(value: unknown): HarnessBlueprintTargetMode | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "both";
  if (raw === "department" || raw === "project" || raw === "both") return raw;
  return null;
}

function normalizeHarnessPattern(value: unknown): HarnessBlueprintPattern | null {
  const raw = typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "auto";
  if (
    raw === "auto" ||
    raw === "pipeline" ||
    raw === "fan-out-fan-in" ||
    raw === "expert-pool" ||
    raw === "producer-reviewer" ||
    raw === "supervisor" ||
    raw === "hierarchical-delegation"
  ) {
    return raw;
  }
  return null;
}

function chooseHarnessPattern(
  objective: string,
  preferred: HarnessBlueprintPattern,
): Exclude<HarnessBlueprintPattern, "auto"> {
  if (preferred !== "auto") return preferred;
  const lower = objective.toLowerCase();
  if (/review|검토|qa|quality|품질/.test(lower)) return "producer-reviewer";
  if (/audit|감사|parallel|fan|조사|분석/.test(lower)) return "fan-out-fan-in";
  if (/ops|운영|supervisor|routing|승인|approval/.test(lower)) return "supervisor";
  if (/expert|전문|pool|선택/.test(lower)) return "expert-pool";
  return "pipeline";
}

function buildDepartmentWorkflow() {
  return [
    { phase: "intake", owner_department: "CONTROL", output: "approved objective, risk class, and run boundary" },
    { phase: "spec", owner_department: "SPEC", output: "requirements, design, tasks, repo-map, approvals" },
    { phase: "explore", owner_department: "EXPLORE", output: "read-only fan-out findings with evidence refs" },
    { phase: "implement", owner_department: "IMPLEMENT", output: "approved code or document changes only" },
    {
      phase: "review",
      owner_department: "REVIEW",
      output: "producer-reviewer acceptance, hashes, and regression evidence",
    },
    { phase: "ops-handoff", owner_department: "OPS", output: "runtime/evidence/handoff and QMS ledger updates" },
  ];
}

function buildHarnessBlueprintPreview(db: RuntimeContext["db"], body: Record<string, unknown>) {
  const targetMode = normalizeHarnessTargetMode(body.target_mode);
  if (!targetMode) return { ok: false, status: 400, error: "invalid_target_mode" };
  const preferredPattern = normalizeHarnessPattern(body.preferred_pattern);
  if (!preferredPattern) return { ok: false, status: 400, error: "invalid_preferred_pattern" };
  const objective = typeof body.objective === "string" && body.objective.trim() ? body.objective.trim() : "";
  if (!objective) return { ok: false, status: 400, error: "objective_required" };

  const registry = buildRegistryProjects(db);
  const projectKey =
    typeof body.project_key === "string" && body.project_key.trim() ? body.project_key.trim() : "DonggriCompany";
  const project = registry.projects.find((item) => item.key === projectKey) ?? null;
  if ((targetMode === "project" || targetMode === "both") && !project) {
    return { ok: false, status: 400, error: "invalid_project_key" };
  }

  const pattern = chooseHarnessPattern(objective, preferredPattern);
  const stableInput = JSON.stringify({ targetMode, projectKey, objective, preferredPattern, pattern });
  const previewId = `harness-preview-${crypto.createHash("sha256").update(stableInput).digest("hex").slice(0, 12)}`;
  const departmentWorkflow = targetMode === "department" || targetMode === "both" ? buildDepartmentWorkflow() : [];
  const projectWorkflow =
    targetMode === "project" || targetMode === "both"
      ? {
          project_key: projectKey,
          owner_department: "OPS",
          operation_scope: `project:${projectKey}`,
          repo_path: project?.absolute_path ?? null,
          worktree_hint:
            projectKey === "BloggerGent"
              ? "Use registered blog role worktrees from projects.yaml."
              : "Use baseline repo only for inspection unless a registered worktree exists.",
          implementation_delegate: "IMPLEMENT",
        }
      : null;
  const phases = [
    ...departmentWorkflow,
    ...(projectWorkflow
      ? [
          {
            phase: "project-scope",
            owner_department: "OPS",
            output: `OPS opens ${projectWorkflow.operation_scope} and routes implementation to IMPLEMENT.`,
          },
          {
            phase: "project-review",
            owner_department: "REVIEW",
            output: "Project-specific evidence, hashes, and QMS findings are merged.",
          },
        ]
      : []),
  ];
  const blueprint = {
    id: previewId,
    target_mode: targetMode,
    target_scope_type: targetMode,
    target_scope_key: targetMode === "department" ? "department-standard" : projectKey,
    source_description: objective,
    preferred_pattern: preferredPattern,
    pattern,
    pattern_label: HARNESS_PATTERNS[pattern].label,
    pattern_summary: HARNESS_PATTERNS[pattern].summary,
    source: {
      description: objective,
      references: [
        "https://github.com/revfactory/harness",
        "https://raw.githubusercontent.com/revfactory/harness/main/skills/harness/SKILL.md",
      ],
      absorption_mode: "donggri-native-patterns-only",
    },
    department_workflow: departmentWorkflow,
    project_workflow: projectWorkflow,
    phases,
    suggested_personas: [
      {
        persona_id: "explore-readonly-scout",
        parent_agent: "EXPLORE",
        write_policy: "read-only",
        purpose: "Parallel source and repo investigation.",
        disposable: true,
      },
      {
        persona_id: "review-evidence-checker",
        parent_agent: "REVIEW",
        write_policy: "read-only",
        purpose: "Boundary comparison, regression risk, and evidence density check.",
        disposable: true,
      },
      {
        persona_id: "ops-handoff-recorder",
        parent_agent: "OPS",
        write_policy: "evidence-and-approved-ops",
        purpose: "Evidence, handoff, and QMS ledger summary.",
        disposable: true,
      },
    ],
    evidence_plan: ["EV-HARNESS-PREVIEW", "EV-HARNESS-DRAFT", "EV-HARNESS-QMS"],
    approval_map: [
      { operation: "preview", required_approval: null, writes: false },
      { operation: "save_draft", required_approval: "APR-HARNESS-META-001", writes: true },
      { operation: "apply", required_approval: "APR-HARNESS-APPLY-*", writes: true, default_status: "blocked" },
    ],
    qms_checks: [
      "No permanent staff or nested personas.",
      "No .claude, .kiro, plugin install, or external runtime dependency.",
      "Evidence refs required before applied status.",
      "Apply stays blocked until explicit APR-HARNESS-APPLY approval.",
    ],
    blocked_outputs: [
      ".claude/*",
      ".kiro/*",
      "plugin install",
      "permanent staff",
      "nested personas",
      "raw transcript capture",
      "AgentMemory hooks",
    ],
    apply_gate: { status: "blocked", required_approval: "APR-HARNESS-APPLY-*" },
  };
  return { ok: true, status: 200, writes: false, blueprint };
}

function saveHarnessBlueprintDraft(db: RuntimeContext["db"], body: Record<string, unknown>) {
  ensureHarnessBlueprintTables(db);
  const activeSpec = buildActiveSpecStatus();
  const preview = buildHarnessBlueprintPreview(db, body);
  if (!preview.ok) return preview;
  const blueprint = preview.blueprint as Record<string, unknown>;
  const now = Date.now();
  const id = `harness-blueprint-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const approvalRefs = getApprovedOperationApprovalIds(activeSpec.id, "harness-meta");
  const evidenceRefs = parseJsonArray(body.evidence_refs);
  db.prepare(
    `INSERT INTO control_plane_harness_blueprints (
      id, spec_id, target_scope_type, target_scope_key, source_description, pattern, status,
      blueprint_json, approval_refs_json, evidence_refs_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    activeSpec.id,
    String(blueprint.target_scope_type ?? "both"),
    String(blueprint.target_scope_key ?? ""),
    String(blueprint.source_description ?? ""),
    String(blueprint.pattern ?? "pipeline"),
    "draft",
    JSON.stringify(blueprint),
    JSON.stringify(approvalRefs),
    JSON.stringify(evidenceRefs),
    now,
    now,
  );
  db.prepare(
    `INSERT INTO control_plane_harness_blueprint_events (
      id, blueprint_id, event_type, decision, evidence_refs_json, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `harness-blueprint-event-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    id,
    "draft_saved",
    "draft",
    JSON.stringify(evidenceRefs),
    JSON.stringify({ approval_refs: approvalRefs, preview_id: blueprint.id }),
    now,
  );
  const row = db.prepare("SELECT * FROM control_plane_harness_blueprints WHERE id = ?").get(id);
  return {
    ok: true,
    status: 200,
    writes: true,
    blueprint_id: id,
    blueprint,
    draft: row,
    harness_blueprints: readHarnessBlueprintStatus(db),
  };
}

function applyHarnessBlueprint(db: RuntimeContext["db"], blueprintId: string) {
  ensureHarnessBlueprintTables(db);
  const existing = db.prepare("SELECT * FROM control_plane_harness_blueprints WHERE id = ?").get(blueprintId) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return { ok: false, status: 404, error: "blueprint_not_found" };
  return {
    ok: false,
    status: 409,
    error: "harness_apply_blocked_in_v1",
    message: "Generated blueprint application is intentionally blocked in v1; implement a separate apply spec first.",
    draft: existing,
  };
}

function createControlRun(db: RuntimeContext["db"], body: Record<string, unknown>) {
  ensureControlRunnerTables(db);
  const activeSpec = buildActiveSpecStatus();
  const department = String(body.department_agent ?? body.department ?? "CONTROL").toUpperCase();
  const allowedDepartments = new Set(DEPARTMENT_AGENT_FILES.map((item) => item.id));
  if (!allowedDepartments.has(department as DepartmentAgentManifest["id"])) {
    return { ok: false, status: 400, error: "invalid_department_agent" };
  }
  const objective =
    typeof body.objective === "string" && body.objective.trim() ? body.objective.trim() : "Control Plane run";
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  const selectedRepo = typeof body.selected_repo === "string" ? body.selected_repo.trim() : "";
  const runId = `cprun-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const routingId = `cproute-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const now = Date.now();
  const approvalRefs = [
    ...new Set([
      ...parseJsonArray(body.approval_refs),
      ...getApprovedOperationApprovalIds(activeSpec.id, "harness-run"),
    ]),
  ];
  const contextPack = buildContextPackPayload(activeSpec.id, department, objective);
  const hookDecisions = [
    {
      hook: "pre-task",
      decision: "allow",
      reason_code: "CONTROL_RUN_PREPARED",
    },
  ];
  db.prepare(
    `INSERT INTO control_plane_agent_runs (
      id, spec_id, task_id, department_agent, status, objective, context_pack_json,
      approval_refs_json, hook_decisions_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    activeSpec.id,
    taskId || null,
    department,
    "prepared",
    objective,
    JSON.stringify(contextPack),
    JSON.stringify(approvalRefs),
    JSON.stringify(hookDecisions),
    now,
    now,
  );
  db.prepare(
    `INSERT INTO control_plane_routing_decisions (
      id, run_id, spec_id, selected_department, selected_repo, persona_needed, confidence,
      evidence_json, rejection_reason, approval_refs_json, next_safe_action, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    routingId,
    runId,
    activeSpec.id,
    department,
    selectedRepo || null,
    body.persona_needed === false ? 0 : 1,
    typeof body.confidence === "string" ? body.confidence : "medium",
    JSON.stringify(parseJsonArray(body.evidence)),
    typeof body.rejection_reason === "string" ? body.rejection_reason : null,
    JSON.stringify(approvalRefs),
    "Start run or create persona after approval gates are checked.",
    now,
  );
  return {
    ok: true,
    status: 200,
    run: db.prepare("SELECT * FROM control_plane_agent_runs WHERE id = ?").get(runId),
    routing: db.prepare("SELECT * FROM control_plane_routing_decisions WHERE id = ?").get(routingId),
  };
}

function readControlRun(db: RuntimeContext["db"], runId: string) {
  if (!tableExists(db, "control_plane_agent_runs")) return null;
  const run = db.prepare("SELECT * FROM control_plane_agent_runs WHERE id = ?").get(runId) as
    | Record<string, unknown>
    | undefined;
  if (!run) return null;
  const routing = db
    .prepare("SELECT * FROM control_plane_routing_decisions WHERE run_id = ? ORDER BY created_at DESC")
    .all(runId) as Record<string, unknown>[];
  const personas = db
    .prepare("SELECT * FROM control_plane_persona_runs WHERE run_id = ? ORDER BY updated_at DESC")
    .all(runId) as Record<string, unknown>[];
  const events = db
    .prepare("SELECT * FROM control_plane_persona_events WHERE run_id = ? ORDER BY created_at DESC")
    .all(runId) as Record<string, unknown>[];
  return { run, routing, personas, events };
}

function startControlRun(db: RuntimeContext["db"], runId: string) {
  ensureControlRunnerTables(db);
  const existing = readControlRun(db, runId);
  if (!existing) return { ok: false, status: 404, error: "run_not_found" };
  const now = Date.now();
  db.prepare("UPDATE control_plane_agent_runs SET status = ?, updated_at = ? WHERE id = ?").run("running", now, runId);
  return { ok: true, status: 200, ...readControlRun(db, runId) };
}

function validatePersonaInput(run: Record<string, unknown>, body: Record<string, unknown>) {
  const parentAgent = String(body.parent_agent ?? run.department_agent ?? "").toUpperCase();
  const allowedDepartments = new Set(DEPARTMENT_AGENT_FILES.map((item) => item.id));
  if (!allowedDepartments.has(parentAgent as DepartmentAgentManifest["id"])) return "invalid_parent_agent";
  const writePolicy = String(body.write_policy ?? "read-only");
  const allowedWritePolicies = new Set([
    "read-only",
    "control-plane-docs",
    "evidence-handoff",
    "approved-task-files",
    "approved-db-sync",
  ]);
  if (!allowedWritePolicies.has(writePolicy)) return "invalid_write_policy";
  const allowedPaths = parseAllowedPaths(body.allowed_paths);
  const taskId =
    typeof body.task_id === "string" && body.task_id.trim()
      ? body.task_id.trim()
      : typeof run.task_id === "string" && run.task_id.trim()
        ? run.task_id.trim()
        : "";
  const evidenceRefs = parseJsonArray(body.evidence_refs);
  const specId = typeof run.spec_id === "string" ? run.spec_id : null;
  if (writePolicy === "approved-task-files" && parentAgent !== "IMPLEMENT")
    return "repo_write_requires_implement_parent";
  if (writePolicy === "approved-task-files" && allowedPaths.write.length === 0)
    return "repo_write_requires_allowed_paths";
  if (!taskId) return "task_ref_required";
  if (evidenceRefs.length === 0) return "evidence_refs_required";
  if (writePolicy !== "read-only") {
    const approvalRef = String(body.approval_ref ?? "").trim();
    if (!approvalRef) return "write_persona_requires_approval_ref";
    if (!getApprovedOperationApprovalIds(specId, "persona-evidence").includes(approvalRef))
      return "invalid_persona_approval_ref";
  }
  if (!String(body.objective ?? "").trim()) return "objective_required";
  return null;
}

function createPersonaRun(db: RuntimeContext["db"], runId: string, body: Record<string, unknown>) {
  ensureControlRunnerTables(db);
  const existing = readControlRun(db, runId);
  if (!existing) return { ok: false, status: 404, error: "run_not_found" };
  const validationError = validatePersonaInput(existing.run, body);
  if (validationError) return { ok: false, status: 400, error: validationError };
  const now = Date.now();
  const parentAgent = String(body.parent_agent ?? existing.run.department_agent).toUpperCase();
  const personaId =
    typeof body.persona_id === "string" && body.persona_id.trim()
      ? body.persona_id.trim()
      : `${parentAgent.toLowerCase()}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const objective = String(body.objective).trim();
  const allowedPaths = parseAllowedPaths(body.allowed_paths);
  const writePolicy = String(body.write_policy ?? "read-only");
  const specId = typeof existing.run.spec_id === "string" ? existing.run.spec_id : null;
  const taskId =
    typeof body.task_id === "string"
      ? body.task_id
      : typeof existing.run.task_id === "string"
        ? existing.run.task_id
        : null;
  const evidenceRefs = parseJsonArray(body.evidence_refs);
  const qualityBarResult = typeof body.quality_bar_result === "string" ? body.quality_bar_result.trim() : "pending";
  const payload = {
    source: "control-plane-runner",
    task_ref: taskId,
    evidence_refs: evidenceRefs,
    quality_bar_result: qualityBarResult,
    approval_ref: typeof body.approval_ref === "string" ? body.approval_ref : null,
  };
  const sourceHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  db.prepare(
    `INSERT INTO control_plane_persona_runs (
      id, run_id, spec_id, task_id, parent_agent, persona_id, status, objective, input_docs_json,
      allowed_paths_json, write_policy, return_schema_json, expiry, quality_bar, recreate_policy,
      max_recreate_attempts, approval_ref, evidence_refs_json, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `cppersona-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    runId,
    specId,
    taskId,
    parentAgent,
    personaId,
    "created",
    objective,
    JSON.stringify(parseJsonArray(body.input_docs)),
    JSON.stringify(allowedPaths),
    writePolicy,
    JSON.stringify(parseJsonArray(body.return_schema)),
    typeof body.expiry === "string" ? body.expiry : "single-task",
    typeof body.quality_bar === "string" ? body.quality_bar : "Evidence-backed result with concrete paths.",
    typeof body.recreate_policy === "string"
      ? body.recreate_policy
      : "recreate if missing evidence or unclear conclusion",
    2,
    typeof body.approval_ref === "string" ? body.approval_ref : null,
    JSON.stringify(evidenceRefs),
    JSON.stringify(payload),
    now,
    now,
  );
  db.prepare(
    `INSERT INTO control_plane_persona_events (
      id, persona_id, run_id, event_type, decision, reason, evidence_refs_json, source_hash, merged_into, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `cpevent-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    personaId,
    runId,
    "created",
    "created",
    "persona created by parent department agent",
    JSON.stringify(evidenceRefs),
    sourceHash,
    null,
    JSON.stringify({ write_policy: writePolicy, task_ref: taskId, quality_bar_result: qualityBarResult }),
    now,
  );
  return { ok: true, status: 200, ...readControlRun(db, runId) };
}

function normalizeEvidenceHash(value: unknown): string {
  return typeof value === "string" && /^[a-zA-Z0-9:_./-]{12,128}$/.test(value.trim()) ? value.trim() : "";
}

function decidePersona(db: RuntimeContext["db"], personaId: string, body: Record<string, unknown>) {
  ensureControlRunnerTables(db);
  const persona = db.prepare("SELECT * FROM control_plane_persona_runs WHERE persona_id = ?").get(personaId) as
    | Record<string, unknown>
    | undefined;
  if (!persona) return { ok: false, status: 404, error: "persona_not_found" };
  const decision = String(body.decision ?? "").toLowerCase();
  const allowed = new Set(["accept", "reject", "recreate", "merge"]);
  if (!allowed.has(decision)) return { ok: false, status: 400, error: "invalid_decision" };
  const recreateCount = Number(persona.recreate_count ?? 0);
  const maxRecreate = Number(persona.max_recreate_attempts ?? 2);
  if (decision === "recreate" && recreateCount >= maxRecreate) {
    return { ok: false, status: 400, error: "max_recreate_attempts_reached" };
  }
  const evidenceRefs = parseJsonArray(body.evidence_refs);
  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};
  const outputHash = normalizeEvidenceHash(body.output_hash ?? payload.output_hash);
  const sourceHash = normalizeEvidenceHash(body.source_hash ?? payload.source_hash);
  const qualityBarResult =
    typeof body.quality_bar_result === "string" && body.quality_bar_result.trim()
      ? body.quality_bar_result.trim()
      : typeof payload.quality_bar_result === "string" && payload.quality_bar_result.trim()
        ? payload.quality_bar_result.trim()
        : "";
  if ((decision === "accept" || decision === "merge") && evidenceRefs.length === 0) {
    return { ok: false, status: 400, error: "evidence_refs_required" };
  }
  if ((decision === "accept" || decision === "merge") && !outputHash) {
    return { ok: false, status: 400, error: "output_hash_required" };
  }
  if ((decision === "accept" || decision === "merge") && !sourceHash) {
    return { ok: false, status: 400, error: "source_hash_required" };
  }
  if ((decision === "accept" || decision === "merge") && !qualityBarResult) {
    return { ok: false, status: 400, error: "quality_bar_result_required" };
  }
  const statusMap: Record<string, string> = {
    accept: "accepted",
    reject: "rejected",
    recreate: "recreated",
    merge: "merged",
  };
  const now = Date.now();
  const runId = typeof persona.run_id === "string" ? persona.run_id : String(persona.run_id ?? "");
  db.prepare(
    "UPDATE control_plane_persona_runs SET status = ?, recreate_count = ?, evidence_refs_json = ?, updated_at = ? WHERE persona_id = ?",
  ).run(
    statusMap[decision],
    decision === "recreate" ? recreateCount + 1 : recreateCount,
    JSON.stringify(evidenceRefs),
    now,
    personaId,
  );
  const eventPayload = { ...payload, output_hash: outputHash || null, quality_bar_result: qualityBarResult || null };
  db.prepare(
    `INSERT INTO control_plane_persona_events (
      id, persona_id, run_id, event_type, decision, reason, evidence_refs_json, source_hash, merged_into, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `cpevent-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    personaId,
    runId,
    "decision",
    decision,
    typeof body.reason === "string" ? body.reason : null,
    JSON.stringify(evidenceRefs),
    sourceHash,
    typeof body.merged_into === "string" ? body.merged_into : null,
    JSON.stringify(eventPayload),
    now,
  );
  return { ok: true, status: 200, ...readControlRun(db, runId) };
}

function evaluateControlHook(body: Record<string, unknown>) {
  const hook = typeof body.hook === "string" ? body.hook : "";
  const task = typeof body.task === "string" ? body.task : "";
  const operation = String(body.operation ?? body.command ?? "").toLowerCase();
  const hookPath = hook ? path.join(CODEX_CONTROL_ROOT, "hooks", `${hook}.yaml`) : "";
  if (
    !hook ||
    !/^[a-z0-9-]+$/.test(hook) ||
    !fs.existsSync(hookPath) ||
    !isInside(path.join(CODEX_CONTROL_ROOT, "hooks"), hookPath)
  ) {
    return { ok: false, decision: "block", reason_code: "E_HOOK_MISSING", hook, task };
  }
  if (!task && (hook === "pre-task" || hook === "pre-implement")) {
    return { ok: true, decision: "block", reason_code: "E_TASK_ID_MISSING", hook, task };
  }
  if (hook === "pre-git") {
    const riskyGit =
      /\b(commit|push|pull|fetch|reset|rebase|merge|stash|clean|checkout|restore|switch)\b/.test(operation) ||
      /\bbranch\s+-d\b/.test(operation) ||
      /\btag\s+-d\b/.test(operation);
    return {
      ok: true,
      decision: riskyGit ? "approval-required" : "allow",
      reason_code: riskyGit ? "E_GIT_APPROVAL_REQUIRED" : "GIT_READ_ONLY_OR_SAFE",
      operation_class: riskyGit ? "git-history-or-worktree-change" : "git-read-only",
      required_approval: riskyGit ? "APR-GIT-001" : null,
      hook,
      task,
    };
  }
  if (hook === "pre-docker") {
    const composeConfigOnly = /\bdocker\s+compose\s+config\b/.test(operation);
    const riskyDocker = /\b(up|down|prune|volume|rm|restart|build|push|pull)\b/.test(operation) && !composeConfigOnly;
    return {
      ok: true,
      decision: riskyDocker ? "approval-required" : "allow",
      reason_code: riskyDocker ? "E_DOCKER_APPROVAL_REQUIRED" : "DOCKER_CONFIG_OR_READ_ONLY",
      operation_class: riskyDocker ? "docker-runtime-change" : "docker-read-only",
      required_approval: riskyDocker ? "APR-DOCKER-001" : null,
      hook,
      task,
    };
  }
  if (hook === "pre-secret") {
    const touchesSecret = /(^|[/\\])\.env(\.|$)|token|secret|password|private[_-]?key|api[_-]?key/i.test(operation);
    return {
      ok: true,
      decision: touchesSecret ? "approval-required" : "allow",
      reason_code: touchesSecret ? "E_SECRET_APPROVAL_REQUIRED" : "NO_SECRET_PATH_DETECTED",
      operation_class: touchesSecret ? "secret-change" : "non-secret",
      required_approval: touchesSecret ? "APR-SEC-001" : null,
      hook,
      task,
    };
  }
  if (hook === "pre-implement") {
    return {
      ok: true,
      decision: String(body.approval_ref ?? "").trim() ? "allow" : "approval-required",
      reason_code: String(body.approval_ref ?? "").trim()
        ? "IMPLEMENT_APPROVAL_PRESENT"
        : "E_IMPLEMENT_APPROVAL_REQUIRED",
      operation_class: "repo-write",
      required_approval: String(body.approval_ref ?? "").trim() ? null : "APR-AGENT-001",
      hook,
      task,
    };
  }
  return {
    ok: true,
    decision: task ? "approval-required" : "block",
    reason_code: task ? "E_APPROVAL_REQUIRED_FOR_WRITE" : "E_TASK_ID_MISSING",
    hook,
    task,
  };
}

function buildCodexAssetsStatus() {
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  const config = fs.existsSync(configPath) ? readText(configPath) : "";
  const rootAgentsDir = path.join(CONTROL_ROOT, ".codex", "agents");
  const rootSkillsDir = path.join(CONTROL_ROOT, ".agents", "skills");
  const globalSkillsDir = path.join(os.homedir(), ".codex", "skills");
  const automationsDir = path.join(os.homedir(), ".codex", "automations");
  return {
    config: {
      doc: fileStatus("config.toml", configPath, config ? "ok" : "missing"),
      sandbox_mode: config.match(/^\s*sandbox_mode\s*=\s*["']([^"']+)["']/m)?.[1] ?? null,
      approval_policy: config.match(/^\s*approval_policy\s*=\s*["']([^"']+)["']/m)?.[1] ?? null,
      approvals_reviewer: config.match(/^\s*approvals_reviewer\s*=\s*["']([^"']+)["']/m)?.[1] ?? null,
    },
    trusted_paths: parseTrustedProjectSections(config),
    plugins: parseTomlSections(config, "plugins"),
    marketplaces: parseTomlSections(config, "marketplaces"),
    mcp_servers: parseTomlSections(config, "mcp_servers"),
    skills: {
      root_dir: rootSkillsDir,
      root_count: countEntries(rootSkillsDir, (entry) => entry.isDirectory()),
      global_dir: globalSkillsDir,
      global_count: countEntries(globalSkillsDir, (entry) => entry.isDirectory()),
      sdd_runner_exists: fs.existsSync(path.join(rootSkillsDir, "sdd-runner", "SKILL.md")),
    },
    agents: {
      root_dir: rootAgentsDir,
      files: listFiles(rootAgentsDir, ".toml"),
    },
    automations: {
      dir: automationsDir,
      count: countEntries(automationsDir, (entry) => entry.isDirectory() || entry.isFile()),
    },
    exposure_policy: "summary-only-no-raw-config-no-secrets-no-transcripts",
  };
}

async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<{
  ok: boolean;
  status: number | null;
  body: unknown;
  error: string | null;
  reason: "ok" | "http_error" | "timeout" | "network_error";
}> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(AGENTMEMORY_FETCH_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body, error: null, reason: response.ok ? "ok" : "http_error" };
  } catch (error) {
    const message = safeError(error);
    return {
      ok: false,
      status: null,
      body: null,
      error: message,
      reason: /abort|timeout/i.test(message) ? "timeout" : "network_error",
    };
  }
}

function summarizeAgentMemoryPayload(payload: unknown) {
  const pickArray = (): { container: string; items: unknown[] } | null => {
    if (Array.isArray(payload)) return { container: "root", items: payload };
    if (!payload || typeof payload !== "object") return null;
    const objectPayload = payload as Record<string, unknown>;
    for (const key of ["results", "matches", "memories", "items"]) {
      const value = objectPayload[key];
      if (Array.isArray(value)) return { container: key, items: value };
    }
    return null;
  };

  const arrayPayload = pickArray();
  if (!arrayPayload) {
    return {
      raw_payload_omitted: true,
      result_count: null,
      result_container: null,
      sample_keys: [],
    };
  }

  const sampleKeys = new Set<string>();
  for (const item of arrayPayload.items.slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    for (const key of Object.keys(item as Record<string, unknown>).slice(0, 8)) {
      sampleKeys.add(key);
    }
  }

  return {
    raw_payload_omitted: true,
    result_count: arrayPayload.items.length,
    result_container: arrayPayload.container,
    sample_keys: [...sampleKeys],
  };
}

function summarizeAgentMemoryResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return {
      raw_payload_omitted: true,
      top_level_keys: [],
      collection_summary: summarizeAgentMemoryPayload(payload),
    };
  }
  const objectPayload = payload as Record<string, unknown>;
  return {
    raw_payload_omitted: true,
    top_level_keys: Object.keys(objectPayload).slice(0, 20),
    collection_summary: summarizeAgentMemoryPayload(payload),
  };
}

function buildAgentMemoryCapabilities() {
  return {
    package: AGENTMEMORY_PACKAGE,
    observed_version: AGENTMEMORY_OBSERVED_VERSION,
    node_engine: ">=20.0.0",
    source_url: AGENTMEMORY_SOURCE_URL,
    source_files: {
      package_json: "https://raw.githubusercontent.com/rohitg00/agentmemory/main/package.json",
      rest_api: "https://raw.githubusercontent.com/rohitg00/agentmemory/main/src/triggers/api.ts",
      mcp_tools: "https://raw.githubusercontent.com/rohitg00/agentmemory/main/src/mcp/tools-registry.ts",
    },
    rest_groups: AGENTMEMORY_REST_GROUPS,
    observed_rest_path_count: 124,
    mcp_tools: {
      representative: AGENTMEMORY_MCP_TOOLS,
      observed_memory_tool_count: 53,
      wiring_status: "approval-required",
    },
    scope_model: [
      "root",
      "department:<ID>",
      "project:<project-key>",
      "run:<run-id>",
      "persona:<persona-id>",
      "spec:<spec-id>",
      "evidence:<EV-id>",
    ],
    safety: {
      source_of_truth: "storage/codex-control",
      runtime_cache_log_path: AGENTMEMORY_RUNTIME_PATH,
      data_index_backup_path: AGENTMEMORY_DATA_PATH,
      search_context: "summary-only-read",
      remember: "confirm-and-APR-MEM-001-required",
      delete_forget_import_hooks_mcp: "blocked-until-explicit-approval",
      raw_transcripts: "not-exposed",
      secrets: "not-exposed",
    },
  };
}

function readAgentMemoryConfigStatus() {
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  const config = fs.existsSync(configPath) ? readText(configPath) : "";
  return {
    codex_config_exists: fs.existsSync(configPath),
    mentions_agentmemory: /agentmemory/i.test(config),
    hooks_feature_enabled: /^\s*hooks\s*=\s*true\s*$/m.test(config),
    plugin_hooks_enabled: /^\s*plugin_hooks\s*=\s*true\s*$/m.test(config),
    mcp_configured: /\[mcp_servers\.[^\]]*agentmemory[^\]]*\]/i.test(config),
    mcp_mention_only: /agentmemory/i.test(config) && !/\[mcp_servers\.[^\]]*agentmemory[^\]]*\]/i.test(config),
  };
}

async function buildAgentMemoryStatus() {
  const health = await fetchJson(`${AGENTMEMORY_URL}/agentmemory/health`);
  const livez = await fetchJson(`${AGENTMEMORY_URL}/agentmemory/livez`);
  const viewer = await fetchJson(AGENTMEMORY_VIEWER_URL);
  const configFlags = health.ok
    ? await fetchJson(`${AGENTMEMORY_URL}/agentmemory/config/flags`)
    : { ok: false, status: null, body: null, error: "health_unavailable", reason: "network_error" as const };
  const serverAvailable = health.ok || livez.ok;
  const viewerReachable = viewer.ok;
  const config = readAgentMemoryConfigStatus();
  const activeSpec = buildActiveSpecStatus();
  const runtimeApprovalRefs = getApprovedOperationApprovalIds(activeSpec.id, "agentmemory-runtime-connect");
  const runtimeConnectAllowed = runtimeApprovalRefs.length > 0;
  return {
    runtime_path: AGENTMEMORY_RUNTIME_PATH,
    data_path: AGENTMEMORY_DATA_PATH,
    server_url: AGENTMEMORY_URL,
    viewer_url: AGENTMEMORY_VIEWER_URL,
    runtime_preflight: {
      runtime_path_exists: fs.existsSync(AGENTMEMORY_RUNTIME_PATH),
      server_port: 3111,
      viewer_port: 3113,
      health_url: `${AGENTMEMORY_URL}/agentmemory/health`,
      livez_url: `${AGENTMEMORY_URL}/agentmemory/livez`,
      approved_runtime_connect: runtimeConnectAllowed,
      approval_refs: runtimeApprovalRefs,
    },
    viewer_preflight: {
      viewer_url: AGENTMEMORY_VIEWER_URL,
      viewer_port: 3113,
      reachable: viewerReachable,
      status_code: viewer.status,
      embed_mode: viewerReachable ? "iframe" : "fallback",
      error: viewer.error,
      reason: viewerReachable ? "ok" : viewer.reason,
    },
    health: {
      available: health.ok,
      status_code: health.status,
      error: health.error,
    },
    livez: {
      available: livez.ok,
      status_code: livez.status,
      error: livez.error,
    },
    config_flags: {
      available: configFlags.ok,
      status_code: configFlags.status,
      summary: summarizeAgentMemoryResponse(configFlags.body),
      error: configFlags.error,
    },
    config,
    capabilities: buildAgentMemoryCapabilities(),
    readiness: {
      server_available: serverAvailable,
      viewer_url: AGENTMEMORY_VIEWER_URL,
      smart_search_available: serverAvailable,
      context_available: serverAvailable,
      remember_available: serverAvailable,
      remember_requires_confirmation: true,
      remember_requires_approval: "APR-MEM-001",
      mcp_wiring_enabled: false,
      hook_auto_capture_enabled: false,
      delete_forget_enabled: false,
    },
    approval_gate: {
      runtime_connect_allowed: runtimeConnectAllowed,
      runtime_connect_required_approval: "APR-MEM-RUNTIME-*",
      remember_policy_approval: "APR-MEM-001",
      blocked_operations: [
        "install/start",
        "MCP wiring",
        "global hooks",
        "transcript capture",
        "delete",
        "forget",
        "import",
      ],
      next_safe_action: serverAvailable
        ? "Use safe search/context/remember only inside approved scope."
        : "Record approval first, then start AgentMemory runtime in a separate OPS step.",
    },
    integration_mode: "functional-safe-proxy",
    install_required_approval: !serverAvailable,
    safe_proxy_available: serverAvailable,
  };
}

function buildQualityHarnessStatus(
  db: RuntimeContext["db"],
  registry: ReturnType<typeof buildRegistryProjects>,
  activeSpec: ReturnType<typeof buildActiveSpecStatus>,
  runner: RunnerStatus,
  memory: Awaited<ReturnType<typeof buildAgentMemoryStatus>>,
  textIntegrity: ReturnType<typeof buildKoreanTextIntegrityStatus>,
  harnessBlueprints: HarnessBlueprintStatus,
) {
  const changes = readGitShortStatus(RUNTIME_PROJECTION_APP);
  const donggriProject = registry.projects.find((project) => project.key === "DonggriCompany") ?? null;
  const threadState = buildCodexThreadCurrent(db);
  const currentThreadId = currentCodexThreadId(threadState);
  const currentActivation = currentThreadId ? findCodexThreadActivation(db, currentThreadId, null, true) : null;
  const latestActivation = findCodexThreadActivation(db, null, "project:DonggriCompany", true);
  const currentActivationContext = parseMaybeJsonObject(currentActivation?.context_pack_json);
  const latestActivationContext = parseMaybeJsonObject(latestActivation?.context_pack_json);
  const previousActivation =
    latestActivation &&
    latestActivationContext.codex_thread_id &&
    currentThreadId &&
    latestActivationContext.codex_thread_id !== currentThreadId
      ? latestActivation
      : null;
  const personaTotal = Object.values(runner.persona_counts).reduce((sum, value) => sum + Number(value || 0), 0);
  const eventTotal = runner.recent_events.length;
  const sourceDocsReady = activeSpec.missing_docs.length === 0 && registry.doc.exists;
  const releaseDirty = changes.length > 0 || donggriProject?.git.status === "dirty";
  const memoryServerAvailable = Boolean(memory.readiness?.server_available);
  const rememberApproved = hasApprovedAgentMemoryRemember(activeSpec.id);
  const personaEvidenceThin = personaTotal < 3 || eventTotal < 6;
  const qmsHasOpenWork = releaseDirty || personaEvidenceThin;
  const blueprintCoveragePass =
    harnessBlueprints.department_draft_count > 0 &&
    harnessBlueprints.project_draft_count > 0 &&
    harnessBlueprints.evidence_backed_count > 0;
  const blueprintCoverageStatus: HarnessCheckStatus = blueprintCoveragePass
    ? "pass"
    : harnessBlueprints.draft_count > 0
      ? "warn"
      : "planned";

  const checks: HarnessCheck[] = [
    {
      key: "source_of_truth",
      label: "Source of truth",
      status: sourceDocsReady ? "pass" : "warn",
      detail: sourceDocsReady ? "Root docs and active spec are readable." : "Some active spec documents are missing.",
      next_safe_action: sourceDocsReady
        ? "Continue evidence-backed work."
        : "Repair the missing SDD documents before implementation.",
    },
    {
      key: "thread_relationship",
      label: "Codex thread relationship",
      status: currentActivation ? "pass" : previousActivation ? "warn" : currentThreadId ? "warn" : "blocked",
      detail: currentActivation
        ? "Current/latest Codex thread has a Control Plane activation."
        : previousActivation
          ? "Previous thread remains connected while the detected current thread is not activated yet."
          : currentThreadId
            ? "Detected Codex thread is not connected yet."
            : "No current Codex thread was detected. Session-file candidates require manual selection.",
      next_safe_action: currentActivation
        ? "Close with evidence/handoff when done."
        : "Activate the current thread with project:DonggriCompany scope.",
    },
    {
      key: "agentmemory_runtime",
      label: "AgentMemory runtime gate",
      status: memoryServerAvailable ? "pass" : "warn",
      detail: memoryServerAvailable
        ? "AgentMemory safe proxy can reach the runtime."
        : "AgentMemory safe proxy is configured, but runtime is offline or not approved for start/connect in this spec.",
      next_safe_action: memoryServerAvailable
        ? "Use safe search/context and confirmed remember only."
        : "Get separate OPS approval before runtime start/connect or MCP wiring.",
    },
    {
      key: "agentmemory_approval",
      label: "Memory approval",
      status: rememberApproved ? "pass" : "warn",
      detail: rememberApproved
        ? "Non-destructive remember approval is present."
        : "Remember writes need APR-MEM approval in the active spec.",
      next_safe_action: rememberApproved
        ? "Keep storing summaries only."
        : "Add/confirm APR-MEM scope before memory capture.",
    },
    {
      key: "persona_evidence",
      label: "Persona evidence",
      status: personaTotal > 0 && eventTotal > 0 ? "pass" : "warn",
      detail:
        personaTotal > 0 && eventTotal > 0
          ? "Persona runs and events exist as harness evidence."
          : "Persona tables exist, but operational persona evidence is still thin.",
      next_safe_action:
        "Create read-only persona records for investigation/review tasks and decide accept/reject with evidence.",
    },
    {
      key: "release_hygiene",
      label: "Release hygiene",
      status: releaseDirty ? "warn" : "pass",
      detail: releaseDirty
        ? "DonggriCompany has dirty or untracked files that must be grouped before release."
        : "DonggriCompany worktree is clean.",
      next_safe_action: releaseDirty
        ? "Review groups and split commit-ready changes only after explicit Git approval."
        : "Continue verification.",
    },
    {
      key: "korean_integrity",
      label: "Korean text integrity",
      status: textIntegrity.pass ? "pass" : "warn",
      detail: textIntegrity.pass
        ? "Configured mojibake patterns are absent."
        : "Visible Korean integrity issues need targeted repair.",
      next_safe_action: textIntegrity.pass
        ? "Keep checking rendered UI."
        : "Fix only verified source/rendered text issues.",
    },
    {
      key: "capa_audit",
      label: "CAPA/internal audit",
      status: qmsHasOpenWork ? "warn" : "pass",
      detail: qmsHasOpenWork
        ? "QMS ledgers are active and contain open release/persona findings."
        : "QMS ledgers are active with no open harness findings.",
      next_safe_action: qmsHasOpenWork
        ? "Close NC/CAPA records with evidence and effectiveness checks."
        : "Keep recurring internal audit review active.",
    },
    {
      key: "harness_blueprint_coverage",
      label: "Harness blueprint coverage",
      status: blueprintCoverageStatus,
      detail: blueprintCoveragePass
        ? "Department and project-scope harness blueprint drafts are evidence-backed."
        : harnessBlueprints.draft_count > 0
          ? "Harness blueprint draft exists, but department/project/evidence coverage is incomplete."
          : "Harness Meta Generator has no saved blueprint draft yet.",
      next_safe_action: blueprintCoveragePass
        ? "Use the draft as an approval-gated pipeline skeleton."
        : "Preview and save an evidence-backed department plus project blueprint draft.",
    },
  ];
  const qmsLedgers = {
    nonconformances: [
      {
        id: "NC-REL-001",
        source: "release-hygiene-classifier",
        severity: releaseDirty ? "major" : "minor",
        owner_department: "OPS",
        related_spec: activeSpec.id,
        related_run: typeof runner.latest_run?.id === "string" ? runner.latest_run.id : null,
        root_cause: releaseDirty
          ? "Mixed tracked/untracked changes are present in the baseline repo."
          : "No current release hygiene drift.",
        containment: "Classify files and block clean/stash/commit until explicit Git approval.",
        corrective_action:
          "Split harness, UI, agent migration, generated artifact, and unrelated groups before release.",
        preventive_action: "Keep release hygiene classifier visible in Control Plane quality checks.",
        due_at: "2026-05-28",
        effectiveness_check: "Git status groups reviewed and generated artifacts excluded from release candidates.",
        status: releaseDirty ? "open" : "closed",
        evidence_refs: ["EV-REL-HYGIENE"],
      },
      {
        id: "NC-PER-001",
        source: "persona-evidence-telemetry",
        severity: personaEvidenceThin ? "minor" : "informational",
        owner_department: "REVIEW",
        related_spec: activeSpec.id,
        related_run: typeof runner.latest_run?.id === "string" ? runner.latest_run.id : null,
        root_cause: personaEvidenceThin
          ? "Persona run/event history is below the operational evidence threshold."
          : "Persona evidence threshold is met.",
        containment:
          "Require task refs, evidence refs, output hash, source hash, and quality bar result on accept/merge.",
        corrective_action: "Record persona decisions for real investigation and review tasks.",
        preventive_action: "Reject accept/merge without evidence hash metadata.",
        due_at: "2026-05-28",
        effectiveness_check:
          "Recent persona timeline contains at least three personas and six events or the finding remains open.",
        status: personaEvidenceThin ? "open" : "closed",
        evidence_refs: ["EV-PERSONA-EVIDENCE"],
      },
    ],
    capas: [
      {
        id: "CAPA-HARNESS-001",
        source: "717-of-1000 harness assessment",
        severity: qmsHasOpenWork ? "major" : "minor",
        owner_department: "CONTROL",
        related_spec: activeSpec.id,
        root_cause:
          "Agent harness controls existed as dashboard checks before this spec, but approval/QMS loops were incomplete.",
        containment: "Central mutation guard, safe memory validation, persona evidence enforcement, and QMS ledgers.",
        corrective_action: "Implement this hardening spec and verify API/UI/OpenAPI behavior.",
        preventive_action: "Keep approval class validation and QMS ledger checks in regression tests.",
        due_at: "2026-05-28",
        effectiveness_check:
          "Target score is 830/1000 or higher after dirty worktree and persona evidence records are closed.",
        status: qmsHasOpenWork ? "in_progress" : "effectiveness_check",
        evidence_refs: ["EV-QMS-HARDENING"],
      },
    ],
    internal_audits: [
      {
        id: "AUD-HARNESS-001",
        source: "Dongri Agent Harness Hardening Ver.1",
        severity: "medium",
        owner_department: "REVIEW",
        related_spec: activeSpec.id,
        scope: "API approvals, AgentMemory, persona evidence, QMS, release hygiene",
        findings: [...(releaseDirty ? ["NC-REL-001"] : []), ...(personaEvidenceThin ? ["NC-PER-001"] : [])],
        due_at: "2026-05-28",
        effectiveness_check: "Run tsc, API/web tests, OpenAPI check, build, spec-quality, and browser smoke.",
        status: qmsHasOpenWork ? "in_progress" : "closed",
        evidence_refs: ["EV-AUD-HARNESS"],
      },
    ],
  };
  const qmsCounts = {
    open_nonconformances: qmsLedgers.nonconformances.filter((item) => item.status === "open").length,
    open_capas: qmsLedgers.capas.filter((item) => item.status === "in_progress").length,
    open_audits: qmsLedgers.internal_audits.filter((item) => item.status === "in_progress").length,
  };
  const qmsScoreImpact = qmsCounts.open_nonconformances * 30 + qmsCounts.open_capas * 20 + qmsCounts.open_audits * 10;
  const scoreMap: Record<HarnessCheckStatus, number> = { pass: 100, warn: 70, planned: 55, blocked: 30 };
  const score = Math.max(
    0,
    Math.min(
      1000,
      Math.round((checks.reduce((sum, check) => sum + scoreMap[check.status], 0) / checks.length) * 10) -
        qmsScoreImpact,
    ),
  );
  return {
    level:
      score >= 900
        ? "Level 4 - ISO 9001-inspired operating harness"
        : score >= 830
          ? "Level 3 - release candidate harness"
          : "Level 2 - strong beta hardening",
    score,
    target_score: 1000,
    target_release_score: 830,
    certification_claim: "not-certified",
    checks,
    qms: {
      ...qmsLedgers,
      counts: qmsCounts,
      score_impact: qmsScoreImpact,
      policy: "ISO 9001-inspired evidence loop; no certification claim",
    },
    thread_relationship: {
      current_thread_id: currentThreadId,
      current_activation_id: typeof currentActivation?.id === "string" ? currentActivation.id : null,
      current_activation_scope:
        typeof currentActivationContext.scope_key === "string" ? currentActivationContext.scope_key : null,
      previous_activation_id: typeof previousActivation?.id === "string" ? previousActivation.id : null,
      previous_thread_id:
        typeof latestActivationContext.codex_thread_id === "string" ? latestActivationContext.codex_thread_id : null,
      shared_memory_scope: "project:DonggriCompany",
      raw_transcript_capture: false,
    },
    agentmemory_gate: {
      server_available: memoryServerAvailable,
      safe_proxy_available: Boolean(memory.safe_proxy_available),
      runtime_connect_allowed: false,
      required_approval: "separate OPS approval",
      blocked_operations: memory.approval_gate.blocked_operations,
      remember_approved: rememberApproved,
    },
    persona_evidence: {
      tables_exist: runner.tables_exist,
      persona_total: personaTotal,
      recent_event_count: eventTotal,
      recent_personas: runner.recent_personas.slice(0, 5),
      recent_events: runner.recent_events.slice(0, 5),
    },
    harness_blueprint_coverage: {
      tables_exist: harnessBlueprints.tables_exist,
      draft_count: harnessBlueprints.draft_count,
      department_draft_count: harnessBlueprints.department_draft_count,
      project_draft_count: harnessBlueprints.project_draft_count,
      evidence_backed_count: harnessBlueprints.evidence_backed_count,
      latest_blueprints: harnessBlueprints.latest_blueprints,
      apply_requires_approval: "APR-HARNESS-APPLY-*",
    },
    release_hygiene: {
      project_key: "DonggriCompany",
      git_status: donggriProject?.git.status ?? "missing",
      branch: donggriProject?.git.branch ?? null,
      dirty_count: donggriProject?.git.dirty_count ?? changes.length,
      untracked_count: donggriProject?.git.untracked_count ?? changes.filter((change) => change.status === "??").length,
      grouped_changes: summarizeHygieneGroups(changes),
      commit_exclusion_manifest: {
        exclude_groups: ["generated-artifacts/screenshots", "unrelated-unknown"],
        require_review_groups: ["harness-candidate", "ui-candidate", "agent-directory-migration", "docs-candidate"],
        destructive_cleanup_allowed: false,
      },
      policy: "diagnostic-only; no clean/stash/commit without explicit approval",
    },
  };
}

export async function buildControlPlaneState(db: RuntimeContext["db"]) {
  const markerPath = path.join(CONTROL_ROOT, "CODEX_CONTROL_ROOT");
  const rootDocPath = path.join(CONTROL_ROOT, "AGENTS.md");
  const registry = buildRegistryProjects(db);
  const activeSpec = buildActiveSpecStatus();
  const handoffs = buildHandoffStatus();
  const memoryDocs = buildMemoryDocs();
  const memory = await buildAgentMemoryStatus();
  const runner = readControlRunnerStatus(db);
  const harnessBlueprints = readHarnessBlueprintStatus(db);
  const engineSync = readEngineSyncStatus(db);
  const projectOperators = buildProjectOperators(registry.projects);
  const internalDepartmentMemory = buildDepartmentMemorySummaries(memory, memoryDocs, runner);
  const internalDepartmentChats = buildDepartmentChatRooms(runner);
  const masterDepartments = buildMasterDepartmentManifests();
  const departmentMemory = buildMasterDepartmentMemorySummaries(memory, memoryDocs, runner);
  const departmentChats = buildMasterDepartmentChatRooms(runner);
  const textIntegrity = buildKoreanTextIntegrityStatus();
  const qualityHarness = buildQualityHarnessStatus(
    db,
    registry,
    activeSpec,
    runner,
    memory,
    textIntegrity,
    harnessBlueprints,
  );
  const master95 = buildMaster95Status();

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    root: {
      path: CONTROL_ROOT,
      repo_estate_root: {
        path: REPO_ESTATE_ROOT,
        exists: fs.existsSync(REPO_ESTATE_ROOT),
        inside_root: isInside(CONTROL_ROOT, REPO_ESTATE_ROOT),
      },
      runtime_projection_app: {
        path: RUNTIME_PROJECTION_APP,
        exists: fs.existsSync(RUNTIME_PROJECTION_APP),
        inside_repo_estate: isInside(REPO_ESTATE_ROOT, RUNTIME_PROJECTION_APP),
      },
      marker: fileStatus("CODEX_CONTROL_ROOT", markerPath),
      agents_doc: fileStatus("AGENTS.md", rootDocPath),
      control_root: {
        path: CODEX_CONTROL_ROOT,
        exists: fs.existsSync(CODEX_CONTROL_ROOT),
        inside_root: isInside(CONTROL_ROOT, CODEX_CONTROL_ROOT),
      },
    },
    active_spec: activeSpec,
    ver1: buildVer1Status(activeSpec.id),
    registry,
    handoffs,
    memory_docs: memoryDocs,
    memory,
    harness_blueprints: harnessBlueprints,
    codex_assets: buildCodexAssetsStatus(),
    sync: readControlSyncStatus(db),
    runner,
    engine_sync: engineSync,
    quality_harness: qualityHarness,
    master_95: master95,
    dongri_grigri: {
      brand: "Dongri-grigri",
      reset_mode: "soft-reset-legacy-preserved",
      primary_model: "business-master-departments-plus-disposable-subagents",
      legacy_staff_visibility: "hidden-by-default",
      master_departments: masterDepartments,
      project_operators: projectOperators,
      project_scopes: projectOperators,
      department_memory: departmentMemory,
      department_chats: departmentChats,
      internal_sdd_roles: {
        roles: buildDepartmentAgentManifests(),
        memory: internalDepartmentMemory,
        chats: internalDepartmentChats,
        display_policy: "internal-only; not shown as business departments",
      },
      korean_text_integrity: textIntegrity,
    },
    safety: buildSafetyStatus(),
  };
}

function normalizedMemoryString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizedMemoryScope(value: unknown): string {
  const scope = normalizedMemoryString(value, 120);
  if (!scope) return "root";
  return /^[A-Za-z0-9:_./-]+$/.test(scope) ? scope : "root";
}

function buildAgentMemoryMetadata(body: Record<string, unknown>) {
  return {
    source: "dongri-grigri-control-hub",
    root: CONTROL_ROOT,
    control_root: CODEX_CONTROL_ROOT,
    scope: normalizedMemoryScope(body.scope),
    department: normalizedMemoryString(body.department, 40) || null,
    project_key: normalizedMemoryString(body.project_key, 80) || null,
    spec_id: normalizedMemoryString(body.spec_id, 120) || buildActiveSpecStatus().id,
    source_ref: normalizedMemoryString(body.source_ref, 160) || null,
    evidence_refs: parseJsonArray(body.evidence_refs).slice(0, 10),
  };
}

function validateSafeMemorySummary(text: string, evidenceRefs: string[]) {
  if (text.length > 1200) return "summary_too_long";
  if (evidenceRefs.length === 0) return "evidence_refs_required";
  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;
  const transcriptMarkers = (text.match(/\b(user|assistant|system|tool|developer)\s*:/gi) ?? []).length;
  if (lineCount > 18 || transcriptMarkers >= 3 || /"role"\s*:\s*"(user|assistant|system|tool)"/i.test(text)) {
    return "raw_transcript_blocked";
  }
  if (
    /sk-[A-Za-z0-9_-]{20,}|api[_-]?key|access[_-]?token|refresh[_-]?token|password|private[_-]?key|-----BEGIN/i.test(
      text,
    )
  ) {
    return "secret_like_payload_blocked";
  }
  if (/\b\d{3}-\d{2}-\d{4}\b|\b\d{6}-\d{7}\b/.test(text)) {
    return "pii_like_payload_blocked";
  }
  return null;
}

export async function searchAgentMemory(query: string, scope = "root") {
  const normalized = query.trim().slice(0, 300);
  if (!normalized) {
    return { ok: false, available: false, results: [], error: "query_required" };
  }
  const result = await fetchJson(`${AGENTMEMORY_URL}/agentmemory/smart-search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: normalized, scope: normalizedMemoryScope(scope), limit: 10 }),
  });
  if (!result.ok) {
    return {
      ok: false,
      available: false,
      results: [],
      status_code: result.status,
      error: "agentmemory_unavailable",
      reason: result.reason,
    };
  }
  return {
    ok: true,
    available: true,
    query: normalized,
    scope: normalizedMemoryScope(scope),
    results: summarizeAgentMemoryPayload(result.body),
    status_code: result.status,
    error: null,
  };
}

export async function getAgentMemoryContext(body: Record<string, unknown>) {
  const query = normalizedMemoryString(body.query, 300);
  if (!query) {
    return { ok: false, available: false, context: null, error: "query_required" };
  }
  const scope = normalizedMemoryScope(body.scope);
  const result = await fetchJson(`${AGENTMEMORY_URL}/agentmemory/context`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      scope,
      limit: 8,
      metadata: buildAgentMemoryMetadata(body),
    }),
  });
  if (!result.ok) {
    return {
      ok: false,
      available: false,
      context: null,
      status_code: result.status,
      error: "agentmemory_unavailable",
      reason: result.reason,
    };
  }
  return {
    ok: true,
    available: true,
    query,
    scope,
    context: summarizeAgentMemoryResponse(result.body),
    status_code: result.status,
    error: null,
  };
}

export async function rememberAgentMemory(body: Record<string, unknown>) {
  const text = normalizedMemoryString(body.text ?? body.content, 1201);
  if (!text) {
    return { ok: false, available: false, captured: false, error: "text_required" };
  }
  if (body.confirm !== "remember-to-agentmemory") {
    return { ok: false, available: false, captured: false, error: "confirmation_required" };
  }
  const activeSpec = buildActiveSpecStatus();
  if (!hasApprovedAgentMemoryRemember(activeSpec.id)) {
    return {
      ok: false,
      available: false,
      captured: false,
      error: "approval_required",
      required_approval: "APR-MEM-001",
    };
  }
  const metadata = buildAgentMemoryMetadata(body);
  const safeSummaryError = validateSafeMemorySummary(text, metadata.evidence_refs);
  if (safeSummaryError) {
    return { ok: false, available: false, captured: false, error: safeSummaryError };
  }
  const result = await fetchJson(`${AGENTMEMORY_URL}/agentmemory/remember`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: text,
      text,
      kind: "dongri-control-plane-memory",
      scope: metadata.scope,
      tags: ["dongri-grigri", "control-plane", metadata.scope],
      metadata,
    }),
  });
  if (!result.ok) {
    return {
      ok: false,
      available: false,
      captured: false,
      status_code: result.status,
      error: result.error ?? "agentmemory_unavailable",
    };
  }
  return {
    ok: true,
    available: true,
    captured: true,
    scope: metadata.scope,
    result: summarizeAgentMemoryResponse(result.body),
    status_code: result.status,
    error: null,
  };
}

export function registerControlPlaneRoutes(
  ctx: Pick<RuntimeContext, "app" | "db"> | { app: Express; db: RuntimeContext["db"] },
): void {
  const { app, db } = ctx;
  registerMaster95ControlTowerRoutes(app);
  registerMaster95ImageWorkbenchRoutes(app);

  app.get("/api/control-plane/state", async (_req, res) => {
    try {
      res.json(await buildControlPlaneState(db));
    } catch (error) {
      res.status(500).json({ ok: false, error: "control_plane_state_failed", message: safeError(error) });
    }
  });

  app.get("/api/control-plane/memory/status", async (_req, res) => {
    try {
      res.json({ ok: true, memory: await buildAgentMemoryStatus(), memory_docs: buildMemoryDocs() });
    } catch (error) {
      res.status(500).json({ ok: false, error: "control_plane_memory_status_failed", message: safeError(error) });
    }
  });

  app.get("/api/control-plane/memory/search", async (req, res) => {
    const query = typeof req.query.query === "string" ? req.query.query : "";
    const scope = typeof req.query.scope === "string" ? req.query.scope : "root";
    const result = await searchAgentMemory(query, scope);
    res.status(result.ok || result.error === "query_required" ? 200 : 503).json(result);
  });

  app.get("/api/control-plane/v1/state", async (_req, res) => {
    try {
      res.json(await buildControlPlaneState(db));
    } catch (error) {
      res.status(500).json({ ok: false, error: "control_plane_v1_state_failed", message: safeError(error) });
    }
  });

  app.get("/api/control-plane/v1/steering", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({ ok: true, steering: state.ver1.groups.steering });
  });

  app.get("/api/control-plane/v1/specs/active", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({
      ok: true,
      active_spec: state.active_spec,
      ver1: { active: state.ver1.active, spec_id: state.ver1.spec_id },
    });
  });

  app.get("/api/control-plane/v1/hooks/status", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({ ok: true, hooks: state.ver1.groups.hooks, hard_gates: state.ver1.hard_gates });
  });

  app.get("/api/control-plane/v1/orchestrator/state", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({
      ok: true,
      orchestrator: state.ver1.groups.orchestrator,
      persona_subagents: state.ver1.persona_subagents,
      runner: state.runner,
    });
  });

  app.get("/api/control-plane/v1/agents/departments", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({
      ok: true,
      master_departments: state.dongri_grigri.master_departments,
      internal_sdd_roles: state.dongri_grigri.internal_sdd_roles.roles,
    });
  });

  app.get("/api/control-plane/v1/departments/memory", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({ ok: true, department_memory: state.dongri_grigri.department_memory, memory: state.memory });
  });

  app.get("/api/control-plane/v1/memory/agentmemory/capabilities", async (_req, res) => {
    res.json({ ok: true, capabilities: buildAgentMemoryCapabilities() });
  });

  app.get("/api/control-plane/v1/memory/agentmemory/status", async (_req, res) => {
    try {
      res.json({ ok: true, memory: await buildAgentMemoryStatus(), memory_docs: buildMemoryDocs() });
    } catch (error) {
      res.status(500).json({ ok: false, error: "agentmemory_status_failed", message: safeError(error) });
    }
  });

  app.get("/api/control-plane/v1/departments/chats", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({ ok: true, rooms: state.dongri_grigri.department_chats });
  });

  app.get("/api/control-plane/v1/instructor/open-source/candidates", async (req, res) => {
    const query = typeof req.query.query === "string" ? req.query.query : "agent framework";
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 6;
    res.json(await searchOpenSourceSkillCandidates(query, limit));
  });

  app.get("/api/control-plane/v1/text-integrity", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({ ok: true, korean_text_integrity: state.dongri_grigri.korean_text_integrity });
  });

  app.get("/api/control-plane/v1/context-pack", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({
      ok: true,
      context_pack: state.ver1.groups.context_packs,
      active_spec: state.active_spec.id,
      open_approvals: state.ver1.approval_ledger,
      next_safe_action: state.active_spec.next_recommended_action,
    });
  });

  app.get("/api/control-plane/v1/quality/score", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({ ok: true, quality: state.ver1.quality_score, hard_gates: state.ver1.hard_gates });
  });

  app.get("/api/control-plane/v1/agy-review/latest", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({ ok: true, agy_review: state.ver1.agy_review });
  });

  app.get("/api/control-plane/v1/master-95/status", async (_req, res) => {
    try {
      res.json({ ok: true, master_95: buildMaster95Status() });
    } catch (error) {
      res.status(500).json({ ok: false, error: "master95_status_failed", message: safeError(error) });
    }
  });

  app.get("/api/control-plane/v1/master-95/scorecard", async (_req, res) => {
    try {
      res.json({ ok: true, scorecard: buildMaster95Scorecard() });
    } catch (error) {
      res.status(500).json({ ok: false, error: "master95_scorecard_failed", message: safeError(error) });
    }
  });

  app.get("/api/control-plane/v1/master-95/traceability", async (_req, res) => {
    try {
      res.json({ ok: true, traceability: buildMaster95Traceability() });
    } catch (error) {
      res.status(500).json({ ok: false, error: "master95_traceability_failed", message: safeError(error) });
    }
  });

  app.get("/api/control-plane/v1/gemini-review/latest", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({ ok: true, gemini_review: state.ver1.gemini_review });
  });

  app.get("/api/control-plane/v1/codex/assets", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    res.json({ ok: true, codex_assets: state.codex_assets });
  });

  app.get("/api/control-plane/v1/codex/thread/current", async (_req, res) => {
    try {
      res.json(buildCodexThreadCurrent(db));
    } catch (error) {
      res.status(500).json({ ok: false, error: "codex_thread_current_failed", message: safeError(error) });
    }
  });

  app.get("/api/control-plane/v1/project-operators", async (_req, res) => {
    const state = await buildControlPlaneState(db);
    const operators = state.dongri_grigri.project_operators;
    res.json({
      ok: true,
      project_operators: operators,
      counts: {
        total: operators.length,
        enabled: operators.filter((operator) => operator.enabled).length,
        disabled: operators.filter((operator) => !operator.enabled).length,
      },
      policy: {
        owner_department: "OPS",
        authority: "operations-only",
        implementation_delegate: "IMPLEMENT",
      },
    });
  });

  app.get("/api/control-plane/v1/project-operators/:operatorId", async (req, res) => {
    const operatorId = typeof req.params?.operatorId === "string" ? req.params.operatorId : "";
    const state = await buildControlPlaneState(db);
    const operator = state.dongri_grigri.project_operators.find((item) => item.operator_id === operatorId);
    if (!operator) {
      res.status(404).json({ ok: false, error: "project_operator_not_found" });
      return;
    }
    res.json({ ok: true, project_operator: operator });
  });

  app.get("/api/control-plane/v1/project-operators/:operatorId/runs", async (req, res) => {
    const operatorId = typeof req.params?.operatorId === "string" ? req.params.operatorId : "";
    const state = await buildControlPlaneState(db);
    const operator = state.dongri_grigri.project_operators.find((item) => item.operator_id === operatorId);
    if (!operator) {
      res.status(404).json({ ok: false, error: "project_operator_not_found" });
      return;
    }
    const runs = readProjectOperatorRows(db, operatorId, "control_plane_project_operator_runs");
    res.json({ ok: true, operator_id: operatorId, runs });
  });

  app.get("/api/control-plane/v1/project-operators/:operatorId/memory", async (req, res) => {
    const operatorId = typeof req.params?.operatorId === "string" ? req.params.operatorId : "";
    const state = await buildControlPlaneState(db);
    const operator = state.dongri_grigri.project_operators.find((item) => item.operator_id === operatorId);
    if (!operator) {
      res.status(404).json({ ok: false, error: "project_operator_not_found" });
      return;
    }
    const links = readProjectOperatorRows(db, operatorId, "control_plane_project_operator_memory_links");
    res.json({ ok: true, memory: buildProjectOperatorMemory(operator, state.memory), links });
  });

  app.get("/api/control-plane/v1/sync/status", async (_req, res) => {
    res.json({ ok: true, sync: readControlSyncStatus(db) });
  });

  app.get("/api/control-plane/v1/runs/status", async (_req, res) => {
    res.json({ ok: true, runner: readControlRunnerStatus(db) });
  });

  app.get("/api/control-plane/v1/engines/status", async (_req, res) => {
    res.json({ ok: true, engine_sync: readEngineSyncStatus(db) });
  });

  app.get("/api/control-plane/v1/harness/blueprints/status", async (_req, res) => {
    res.json({ ok: true, harness_blueprints: readHarnessBlueprintStatus(db) });
  });

  app.get("/api/control-plane/v1/engines/runs/:id", async (req, res) => {
    const runId = typeof req.params?.id === "string" ? req.params.id : "";
    const result = readEngineRun(db, runId);
    if (!result) {
      res.status(404).json({ ok: false, error: "engine_run_not_found" });
      return;
    }
    res.json({ ok: true, ...result });
  });

  app.get("/api/control-plane/v1/runs/:runId", async (req, res) => {
    const runId = typeof req.params?.runId === "string" ? req.params.runId : "";
    const result = readControlRun(db, runId);
    if (!result) {
      res.status(404).json({ ok: false, error: "run_not_found" });
      return;
    }
    res.json({ ok: true, ...result });
  });

  const post = (
    app as unknown as {
      post?: (path: string, handler: (req: any, res: any) => unknown) => unknown;
    }
  ).post;
  if (typeof post === "function") {
    post.call(app, "/api/control-plane/v1/engines/route-preview", async (req, res) => {
      try {
        const result = buildEngineRoutePreview(db, req.body ?? {});
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "engine_route_preview_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/engines/runs", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "codex-engine-sync");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const result = createEngineRun(db, req.body ?? {}, guard.approval_refs);
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "engine_run_create_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/engines/runs/:id/cancel", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "codex-engine-sync");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const runId = typeof req.params?.id === "string" ? req.params.id : "";
        const result = cancelEngineRun(db, runId, guard.approval_refs);
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "engine_run_cancel_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/engines/threads/attach", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "codex-engine-sync");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const result = attachEngineThread(db, req.body ?? {}, guard.approval_refs);
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "engine_thread_attach_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/engines/reconcile", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "codex-engine-sync");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const result = reconcileEngineSync(db, guard.approval_refs);
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "engine_reconcile_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/harness/blueprints/preview", async (req, res) => {
      try {
        const result = buildHarnessBlueprintPreview(db, req.body ?? {});
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "harness_blueprint_preview_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/harness/blueprints/drafts", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "harness-meta");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const result = saveHarnessBlueprintDraft(db, req.body ?? {});
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "harness_blueprint_draft_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/harness/blueprints/:id/apply", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "harness-apply");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const blueprintId = typeof req.params?.id === "string" ? req.params.id : "";
        const result = applyHarnessBlueprint(db, blueprintId);
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "harness_blueprint_apply_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/memory/agentmemory/search", async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await searchAgentMemory(
        normalizedMemoryString(body.query, 300),
        normalizedMemoryScope(body.scope),
      );
      res
        .status(
          result.ok || result.error === "query_required" || result.error === "agentmemory_unavailable" ? 200 : 503,
        )
        .json(result);
    });

    post.call(app, "/api/control-plane/v1/memory/agentmemory/context", async (req, res) => {
      const result = await getAgentMemoryContext((req.body ?? {}) as Record<string, unknown>);
      res
        .status(
          result.ok || result.error === "query_required" || result.error === "agentmemory_unavailable" ? 200 : 503,
        )
        .json(result);
    });

    post.call(app, "/api/control-plane/v1/memory/agentmemory/remember", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "agentmemory-remember-non-destructive");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      const result = await rememberAgentMemory((req.body ?? {}) as Record<string, unknown>);
      if (
        result.error === "text_required" ||
        result.error === "confirmation_required" ||
        result.error === "summary_too_long" ||
        result.error === "evidence_refs_required" ||
        result.error === "raw_transcript_blocked" ||
        result.error === "secret_like_payload_blocked" ||
        result.error === "pii_like_payload_blocked"
      ) {
        res.status(400).json(result);
        return;
      }
      if (result.error === "approval_required") {
        res.status(403).json(result);
        return;
      }
      res.status(result.ok ? 200 : 503).json(result);
    });

    post.call(app, "/api/control-plane/v1/sync/preview", async (_req, res) => {
      try {
        res.json(buildControlSyncPreview(db));
      } catch (error) {
        res.status(500).json({ ok: false, error: "control_plane_sync_preview_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/sync/apply", async (req, res) => {
      if (req.body?.confirm !== "apply-control-plane-sync") {
        res.status(400).json({
          ok: false,
          error: "confirmation_required",
          message: "confirm must be apply-control-plane-sync",
        });
        return;
      }
      const guard = guardControlPlaneMutation(req, "db-write-non-destructive");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      const activeSpec = buildActiveSpecStatus();
      if (!hasApprovedDbSync(activeSpec.id)) {
        res.status(403).json({
          ok: false,
          error: "approval_required",
          message:
            "A non-expired APR-DB approval for non-destructive control_plane_* writes is required before DB sync apply.",
        });
        return;
      }
      try {
        res.json(applyControlSync(db));
      } catch (error) {
        res.status(500).json({ ok: false, error: "control_plane_sync_apply_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/project-operators/sync/preview", async (_req, res) => {
      try {
        res.json(buildProjectOperatorSyncPreview(db));
      } catch (error) {
        res.status(500).json({ ok: false, error: "project_operator_sync_preview_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/project-operators/sync/apply", async (req, res) => {
      if (req.body?.confirm !== "apply-project-operators-sync") {
        res.status(400).json({
          ok: false,
          error: "confirmation_required",
          message: "confirm must be apply-project-operators-sync",
        });
        return;
      }
      const guard = guardControlPlaneMutation(req, "db-write-non-destructive");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      const activeSpec = buildActiveSpecStatus();
      if (!hasApprovedDbSync(activeSpec.id)) {
        res.status(403).json({
          ok: false,
          error: "approval_required",
          message:
            "A non-expired APR-DB approval for non-destructive control_plane_* writes is required before project operator sync apply.",
        });
        return;
      }
      try {
        res.json(applyProjectOperatorSync(db));
      } catch (error) {
        res.status(500).json({ ok: false, error: "project_operator_sync_apply_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/codex/thread/activate", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "harness-run");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const result = activateCodexThread(db, req.body ?? {});
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "codex_thread_activate_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/codex/thread/:runId/finish", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "harness-run");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const runId = typeof req.params?.runId === "string" ? req.params.runId : "";
        const result = finishCodexThread(db, runId, req.body ?? {});
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "codex_thread_finish_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/runs/prepare", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "harness-run");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const result = createControlRun(db, req.body ?? {});
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "control_plane_run_prepare_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/runs/:runId/start", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "harness-run");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const runId = typeof req.params?.runId === "string" ? req.params.runId : "";
        const result = startControlRun(db, runId);
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "control_plane_run_start_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/runs/:runId/personas", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "persona-evidence");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const runId = typeof req.params?.runId === "string" ? req.params.runId : "";
        const result = createPersonaRun(db, runId, req.body ?? {});
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "control_plane_persona_create_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/personas/:personaId/decision", async (req, res) => {
      const guard = guardControlPlaneMutation(req, "persona-evidence");
      if (!guard.ok) {
        res.status(guard.status).json(guard);
        return;
      }
      try {
        const personaId = typeof req.params?.personaId === "string" ? req.params.personaId : "";
        const result = decidePersona(db, personaId, req.body ?? {});
        res.status(result.status).json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: "control_plane_persona_decision_failed", message: safeError(error) });
      }
    });

    post.call(app, "/api/control-plane/v1/hooks/evaluate", async (req, res) => {
      res.json(evaluateControlHook(req.body ?? {}));
    });
  }
}
