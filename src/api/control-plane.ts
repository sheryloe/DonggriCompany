import {
  previewControlPlaneSyncV2,
  previewEngineRouteV2,
  previewHarnessBlueprintV2,
  readAgentMemoryContextV2,
  searchAgentMemoryV2,
} from "./control-plane-v2-read-operations";
import { post, request } from "./core";

export interface ControlPlaneDocStatus {
  key: string;
  path: string;
  exists: boolean;
  size: number | null;
  mtime: string | null;
  sha256: string | null;
  parse_status?: "ok" | "missing" | "error";
  error?: string;
}

export interface ControlPlaneParseError {
  source: string;
  code: string;
  message: string;
  path: string | null;
  line: number | null;
  column: number | null;
}

export interface ControlPlaneActiveSpec {
  doc: ControlPlaneDocStatus;
  id: string | null;
  status: string | null;
  phase: string | null;
  related_repo: string | null;
  related_repos: string[];
  scope: string | null;
  heading: string | null;
  line: number | null;
  next_recommended_action: string | null;
  parse_error: string | null;
  spec_dir: string | null;
  docs: ControlPlaneDocStatus[];
  missing_docs: string[];
}

export interface ControlPlaneGitStatus {
  is_repo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  dirty_count: number;
  untracked_count: number;
  status: "clean" | "dirty" | "missing" | "not_git";
  error: string | null;
}

export type ControlPlaneProjectLifecycleStatus = "active" | "candidate" | "completed" | "archived";

export interface ControlPlaneRegistryProject {
  key: string;
  path: string;
  absolute_path: string;
  type: string | null;
  has_agents: boolean | null;
  status: string | null;
  lifecycle_status: ControlPlaneProjectLifecycleStatus;
  filter_group: string | null;
  default_visible: boolean;
  summary: string | null;
  operation_agent?: {
    operator_id: string | null;
    project_key: string | null;
    owner_department: string | null;
    status: string | null;
    authority: string | null;
    memory_scope: string | null;
    assignment_policy: string | null;
    enabled: boolean | null;
  } | null;
  exists: boolean;
  db_project_id: string | null;
  db_project_name: string | null;
  git: ControlPlaneGitStatus;
}

export interface ControlPlaneRepoEstateDiscovery {
  name: string;
  path: string;
  absolute_path: string;
  classification: "registered" | "candidate" | "excluded";
  registry_key: string | null;
  reason: string;
}

export interface ControlPlaneDbProjectProjection {
  id: string;
  name: string;
  project_path: string;
  classification: "linked" | "legacy-runtime" | "repo-estate-unregistered" | "outside-repo-estate";
  linked_registry_key: string | null;
}

export interface ControlPlaneDocGroup {
  key: string;
  dir: string;
  exists: boolean;
  docs: ControlPlaneDocStatus[];
  expected_count: number;
  present_count: number;
  missing_count: number;
}

export interface ControlPlaneVer1State {
  version: string;
  spec_id: string;
  active: boolean;
  structure_map: Record<string, string>;
  groups: {
    steering: ControlPlaneDocGroup;
    hooks: ControlPlaneDocGroup;
    orchestrator: ControlPlaneDocGroup;
    context_packs: ControlPlaneDocGroup;
    quality: ControlPlaneDocGroup;
    integrations: ControlPlaneDocGroup;
  };
  department_agents: Array<{
    id: string;
    file?: string;
    name?: string;
    description?: string;
    sandbox_mode?: string;
    role: string;
    write_policy: string;
    can_spawn_read_persona?: boolean;
    can_spawn_write_persona?: boolean;
    canonical?: boolean;
  }>;
  persona_subagents: {
    model: string;
    permanent_team_hierarchy: boolean;
    lifecycle_states?: string[];
    max_recreate_attempts?: number;
    repo_write_parent?: string;
    required_fields: string[];
  };
  approval_ledger: {
    path: string | null;
    entries: Array<{
      id: string;
      status: string;
      scope: string;
      operation_class: string;
      risk: string;
      evidence: string;
    }>;
    approved_count: number;
    required_count: number;
  };
  hard_gates: {
    has_kiro_dir: boolean;
    missing_required_docs: number;
    no_kiro_runtime_dependency: boolean;
    no_team_hierarchy: boolean;
    future_version_planning_started: boolean;
  };
  quality_score: {
    score: number;
    target: number;
    pass: boolean;
  };
  agy_review: {
    required: boolean;
    model: string;
    status: string;
    command_cwd: string;
  };
  gemini_review: {
    required: boolean;
    model: string;
    status: string;
    command_cwd: string;
  };
}

export type Master95GateStatus = "pass" | "warn" | "pending" | "fail";

export interface Master95HardGate {
  id: string;
  name: string;
  required: boolean;
  status: Master95GateStatus;
  failure_effect: string | null;
  evidence_refs: string[];
}

export interface Master95EvidenceRef {
  id: string;
  kind: string;
  status: string;
  path: string | null;
  summary: string | null;
}

export interface Master95RequirementTrace {
  id: string;
  title: string;
  priority: string;
  status: string;
  design_refs: string[];
  interfaces: string[];
  tests: string[];
  evidence_refs: string[];
}

export interface Master95RunSummary {
  project_id: string | null;
  task_id: string | null;
  run_id: string;
  trace_id: string | null;
  artifact_id: string | null;
  artifact_refs: string[];
  status: string;
  critical: boolean;
  work_type: string | null;
  scenario_type: string | null;
  concurrency_group_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  agent_version: string | null;
  skill_version: string | null;
  memory_version: string | null;
  trace_span_count: number;
  owner_department: "OPS";
  handoff_departments: string[];
  events: Array<{
    event_id: string;
    event_type: string;
    sequence: number;
    occurred_at: string;
    department: string | null;
    routing: string[];
    reason: string | null;
    reason_code: string | null;
    escalation_department: string | null;
    decision: string | null;
  }>;
  evidence_refs: string[];
}

export interface Master95Scorecard {
  spec_id: string;
  certification_state: string;
  targets: {
    design_specification: number;
    implementation_execution_evidence: number;
    aggregate: number;
    agy_each_axis_minimum: number;
  };
  aggregate_formula: Record<string, unknown>;
  docs: ControlPlaneDocStatus[];
  hard_gates: Master95HardGate[];
  evidence_refs: Master95EvidenceRef[];
  source_files: Record<string, string>;
}

export interface Master95Traceability {
  spec_id: string;
  generated_at: string;
  source_file: string;
  requirements: Master95RequirementTrace[];
  counts: {
    total: number;
    implemented: number;
    in_progress: number;
    planned: number;
    orphan_evidence: number;
  };
  orphan_requirements: string[];
}

export interface Master95Status {
  spec_id: string;
  generated_at: string;
  source_epoch: string;
  projection_epoch: string;
  phase: string;
  certification_state: string;
  root_active_spec_id: string | null;
  active_spec_is_master95: boolean;
  companion_mode: boolean;
  spec_dir: string;
  quality_root: string;
  docs: {
    spec: ControlPlaneDocStatus[];
    quality: ControlPlaneDocStatus[];
    missing_count: number;
    missing: string[];
  };
  dirty_worktree: {
    repo: string;
    count: number;
    untracked_count: number;
    grouped_changes: Array<{ group: string; count: number; samples: string[] }>;
    policy: string;
  };
  approvals_required: string[];
  scorecard_summary: {
    targets: Master95Scorecard["targets"];
    hard_gate_count: number;
    blocking_gate_count: number;
  };
  traceability_summary: Master95Traceability["counts"];
  agent_versions: Array<{
    agent_id: string;
    version: string;
    lifecycle: "candidate" | "active" | "deprecated" | "revoked";
    registered_at: string;
    activated_at: string | null;
    deactivated_at: string | null;
    manifest_id: string | null;
    display_name: string;
    rollback_target_version: string | null;
  }>;
  live_pilot_projection: {
    source_path: string;
    event_source_path: string;
    mode: "read-only";
    available: boolean;
    parse_error_count: number;
    event_parse_error_count: number;
    message: string;
  };
  run_summaries: Master95RunSummary[];
  bloggergent_ops: {
    department: "OPS";
    project_id: "project:BloggerGent";
    project_key: "BloggerGent";
    mode: "read-only-dry-run-routing-preview";
    role_agents: string[];
    lanes: Array<{
      lane_id: string;
      group_id: string;
      role_agent: string;
      channel_ref: string | null;
      metadata_tags: string[];
      operating_mode: "read-only" | "dry-run" | "approval-gated";
    }>;
    implementation_delegate: "IMPLEMENT";
    review_delegate: "REVIEW";
    approval_owner: "CONTROL";
    separately_approved_operations: string[];
  };
  next_safe_action: string;
}

export interface ControlPlaneState {
  ok: true;
  generated_at: string;
  source_epoch: string;
  projection_epoch: string;
  degraded: boolean;
  parse_errors: ControlPlaneParseError[];
  root: {
    path: string;
    repo_estate_root: {
      path: string;
      exists: boolean;
      inside_root: boolean;
    };
    runtime_projection_app: {
      path: string;
      exists: boolean;
      inside_repo_estate: boolean;
    };
    marker: ControlPlaneDocStatus;
    agents_doc: ControlPlaneDocStatus;
    control_root: {
      path: string;
      exists: boolean;
      inside_root: boolean;
    };
  };
  active_specs: ControlPlaneActiveSpec[];
  active_spec: ControlPlaneActiveSpec & {
    deprecated: true;
    replacement: "active_specs[]";
  };
  ver1: ControlPlaneVer1State;
  registry: {
    doc: ControlPlaneDocStatus;
    projects: ControlPlaneRegistryProject[];
    repo_estate_root: string;
    db_project_count: number;
    db_projects: ControlPlaneDbProjectProjection[];
    repo_estate_discovery: ControlPlaneRepoEstateDiscovery[];
    lifecycle_counts: Record<ControlPlaneProjectLifecycleStatus, number>;
    registered_count: number;
    dirty_count: number;
    missing_count: number;
    unlinked_count: number;
  };
  handoffs: {
    dir: string;
    count: number;
    files: ControlPlaneDocStatus[];
    expected_targets: string[];
    missing_targets: string[];
  };
  memory_docs: {
    dir: string;
    docs: ControlPlaneDocStatus[];
    missing_count: number;
  };
  memory: ControlPlaneMemoryStatus;
  codex_assets: {
    config: {
      doc: ControlPlaneDocStatus;
      sandbox_mode: string | null;
      approval_policy: string | null;
      approvals_reviewer: string | null;
    };
    trusted_paths: Array<{
      path: string;
      classification: string;
      trust_level: string | null;
    }>;
    plugins: Array<{ key: string; enabled: boolean | null }>;
    marketplaces: Array<{ key: string; enabled: boolean | null }>;
    mcp_servers: Array<{ key: string; enabled: boolean | null }>;
    skills: {
      root_dir: string;
      root_count: number;
      global_dir: string;
      global_count: number;
      sdd_runner_exists: boolean;
    };
    agents: {
      root_dir: string;
      files: string[];
    };
    automations: {
      dir: string;
      count: number;
    };
    exposure_policy: string;
  };
  sync: ControlPlaneSyncStatus;
  runner: ControlPlaneRunnerStatus;
  engine_sync?: ControlPlaneEngineSyncStatus;
  harness_blueprints?: ControlPlaneHarnessBlueprintStatus;
  quality_harness: ControlPlaneQualityHarness;
  master_95?: Master95Status;
  dongri_grigri: {
    brand: string;
    reset_mode: string;
    primary_model: string;
    legacy_staff_visibility: string;
    master_departments: ControlPlaneMasterDepartment[];
    project_operators: ControlPlaneProjectOperator[];
    project_scopes?: ControlPlaneProjectOperator[];
    department_memory: ControlPlaneDepartmentMemory[];
    department_chats: ControlPlaneDepartmentChatRoom[];
    internal_sdd_roles?: {
      roles: ControlPlaneVer1State["department_agents"];
      memory: ControlPlaneDepartmentMemory[];
      chats: ControlPlaneDepartmentChatRoom[];
      display_policy: string;
    };
    korean_text_integrity: ControlPlaneKoreanTextIntegrity;
  };
  safety: {
    setup_final: {
      prompt: ControlPlaneDocStatus;
      global_config_exists: boolean;
      sandbox_mode: string | null;
      pending: boolean;
      expected_sandbox_mode: string;
    };
    approvals_required: string[];
    drive_rules: Record<string, string>;
  };
}

export interface ControlPlaneMasterDepartment {
  id: string;
  label: string;
  short_label: string;
  accent: string;
  mission: string;
  memory_scope: string;
  memory_focus: string;
  internal_roles: string[];
  can_create_read_persona: boolean;
  can_create_write_persona: boolean;
  write_boundary: string;
  external_sources?: string[];
  subagent_policy?: string;
}

export interface ControlPlaneProjectOperator {
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
  can_create_read_persona: boolean;
  can_create_write_persona: boolean;
  can_write_repo: boolean;
  db_project_id: string | null;
  db_project_name: string | null;
  project_type: string | null;
  project_status: string | null;
  lifecycle_status: ControlPlaneProjectLifecycleStatus;
  filter_group: string | null;
  default_visible: boolean;
  has_agents: boolean | null;
  git_status: ControlPlaneGitStatus["status"];
  git_branch: string | null;
  link_status: ControlPlaneSyncProjectLink["link_status"];
  memory_tabs: string[];
  risk_flags: string[];
  notes: string | null;
}

export interface ControlPlaneRunnerStatus {
  tables_exist: boolean;
  latest_run: Record<string, unknown> | null;
  run_counts: Record<string, number>;
  persona_counts: Record<string, number>;
  recent_runs: Record<string, unknown>[];
  recent_personas: Record<string, unknown>[];
  recent_events: Record<string, unknown>[];
}

export type EngineProvider = "codex_exec" | "codex_app_server" | "claude" | "agy" | "hermes";
export type EngineRunStatus =
  | "planned"
  | "approval_required"
  | "running"
  | "syncing"
  | "completed"
  | "blocked"
  | "failed"
  | "stale";
export type EngineEventType =
  | "route_decided"
  | "thread_started"
  | "turn_started"
  | "approval_requested"
  | "output_delta"
  | "completed"
  | "failed"
  | "cancelled"
  | "reconciled";

export interface ControlPlaneEngineSyncStatus {
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
}

export interface EngineRoutePreviewBody {
  objective: string;
  provider?: EngineProvider | "codex" | "codex_cli" | "gemini" | "antigravity";
  scope_type?: "root" | "project" | "spec";
  scope_value?: string;
}

export interface EngineRoutePreviewResult {
  ok: boolean;
  status?: number;
  writes?: boolean;
  error?: string;
  route?: {
    provider: EngineProvider;
    engine: string;
    decision: "routeable" | "blocked_or_preview";
    scope_type: "root" | "project" | "spec";
    scope_key: string;
    reason: string;
    alternatives: string[];
    approvals_required: string[];
    computer_use_required: boolean;
  };
}

export interface EngineRunResult {
  ok: boolean;
  status?: number;
  error?: string;
  run?:
    | {
        run?: Record<string, unknown>;
        events?: Record<string, unknown>[];
      }
    | Record<string, unknown>
    | null;
  events?: Record<string, unknown>[];
  engine_sync?: ControlPlaneEngineSyncStatus;
  thread_link?: Record<string, unknown>;
  reconciliation?: Record<string, unknown>;
}

export interface ControlPlaneQualityHarnessCheck {
  key: string;
  label: string;
  status: "pass" | "warn" | "blocked" | "planned";
  detail: string;
  next_safe_action: string;
}

export interface ControlPlaneQualityHarness {
  level: string;
  score: number;
  target_score: number;
  target_release_score?: number;
  certification_claim: string;
  checks: ControlPlaneQualityHarnessCheck[];
  qms?: {
    nonconformances: ControlPlaneQmsRecord[];
    capas: ControlPlaneQmsRecord[];
    internal_audits: ControlPlaneQmsRecord[];
    counts: {
      open_nonconformances: number;
      open_capas: number;
      open_audits: number;
    };
    score_impact: number;
    policy: string;
  };
  thread_relationship: {
    current_thread_id: string | null;
    current_activation_id: string | null;
    current_activation_scope: string | null;
    previous_activation_id: string | null;
    previous_thread_id: string | null;
    shared_memory_scope: string;
    raw_transcript_capture: boolean;
  };
  agentmemory_gate: {
    server_available: boolean;
    safe_proxy_available: boolean;
    runtime_connect_allowed: boolean;
    required_approval: string;
    blocked_operations: string[];
    remember_approved: boolean;
  };
  persona_evidence: {
    tables_exist: boolean;
    persona_total: number;
    recent_event_count: number;
    recent_personas: Record<string, unknown>[];
    recent_events: Record<string, unknown>[];
  };
  harness_blueprint_coverage?: {
    tables_exist: boolean;
    draft_count: number;
    department_draft_count: number;
    project_draft_count: number;
    evidence_backed_count: number;
    latest_blueprints: Record<string, unknown>[];
    apply_requires_approval: string;
  };
  release_hygiene: {
    project_key: string;
    git_status: string;
    branch: string | null;
    dirty_count: number;
    untracked_count: number;
    grouped_changes: Array<{ group: string; count: number; samples: string[] }>;
    commit_exclusion_manifest?: {
      exclude_groups: string[];
      require_review_groups: string[];
      destructive_cleanup_allowed: boolean;
    };
    policy: string;
  };
}

export interface ControlPlaneHarnessBlueprintStatus {
  tables_exist: boolean;
  draft_count: number;
  department_draft_count: number;
  project_draft_count: number;
  evidence_backed_count: number;
  latest_blueprints: Record<string, unknown>[];
}

export type HarnessBlueprintTargetMode = "department" | "project" | "both";
export type HarnessBlueprintPattern =
  | "auto"
  | "pipeline"
  | "fan-out-fan-in"
  | "expert-pool"
  | "producer-reviewer"
  | "supervisor"
  | "hierarchical-delegation";

export interface HarnessBlueprintBody {
  target_mode: HarnessBlueprintTargetMode;
  project_key?: string;
  objective: string;
  preferred_pattern?: HarnessBlueprintPattern;
  evidence_refs?: string[];
}

export interface HarnessBlueprintResult {
  ok: boolean;
  status?: number;
  writes?: boolean;
  error?: string;
  message?: string;
  blueprint_id?: string;
  blueprint?: Record<string, unknown>;
  draft?: Record<string, unknown>;
  harness_blueprints?: ControlPlaneHarnessBlueprintStatus;
}

export interface ControlPlaneQmsRecord {
  id: string;
  source: string;
  severity: string;
  owner_department: string;
  related_spec?: string | null;
  related_run?: string | null;
  root_cause?: string;
  containment?: string;
  corrective_action?: string;
  preventive_action?: string;
  due_at?: string;
  effectiveness_check?: string;
  status: string;
  evidence_refs: string[];
  scope?: string;
  findings?: string[];
}

export interface ControlPlaneDepartmentMemory {
  department: string;
  label: string;
  short_label: string;
  accent: string;
  memory_scope: string;
  memory_focus: string;
  sources: string[];
  docs_present: number;
  docs_missing: number;
  agentmemory_available: boolean;
  agentmemory_configured: boolean;
  last_activity_at: string | null;
  exposure_policy: string;
}

export interface ControlPlaneDepartmentChatMessage {
  id: string;
  at: string | null;
  kind: "run" | "persona" | "event";
  title: string;
  detail: string;
  evidence_refs: string[];
  source: string;
}

export interface ControlPlaneDepartmentChatRoom {
  department: string;
  label: string;
  accent: string;
  messages: ControlPlaneDepartmentChatMessage[];
}

export interface ControlPlaneKoreanTextIntegrity {
  pass: boolean;
  checked_files: number;
  total_matches: number;
  files: Array<{
    path: string;
    relative_path: string;
    exists: boolean;
    match_count: number;
    matches: Array<{ pattern: string; sample: string; index: number }>;
  }>;
  policy: string;
}

export interface ControlPlaneRunResult {
  ok: boolean;
  status?: number;
  error?: string;
  run?: Record<string, unknown>;
  routing?: Record<string, unknown> | Record<string, unknown>[];
  personas?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
}

export interface CodexThreadCandidate {
  thread_id: string | null;
  source: string;
  path: string;
  size: number;
  mtime: string;
  started_at?: string | null;
}

export interface CodexThreadCurrentResult {
  ok: boolean;
  detected_thread: {
    thread_id: string | null;
    source: string;
  };
  session_candidates: CodexThreadCandidate[];
  default_scope: {
    scope_type: "root" | "project" | "spec";
    scope_value: string | null;
    scope_key: string;
  };
  active_activation: Record<string, unknown> | null;
  error?: string;
}

export interface CodexThreadActivationBody {
  thread_id?: string;
  scope_type?: "root" | "project" | "spec";
  scope_value?: string | null;
  status?: "observing" | "active";
  objective?: string;
  evidence_refs?: string[];
}

export interface ControlPlaneSyncStatus {
  tables_exist: boolean;
  tables: Record<string, boolean>;
  latest_snapshot: null | {
    id: string;
    root_path: string;
    repo_estate_root: string;
    active_spec_id: string | null;
    registry_project_count: number;
    db_project_count: number;
    unlinked_registry_count: number;
    created_at: number;
    updated_at: number;
  };
  project_link_counts: Record<string, number>;
  spec_task_count: number;
  error?: string;
}

export interface ControlPlaneSyncProjectLink {
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
}

export interface ControlPlaneSyncTaskLink {
  id: string;
  spec_id: string;
  task_key: string;
  requirement_refs: string[];
  status: string | null;
  evidence_refs: string[];
  payload: Record<string, unknown>;
}

export interface ControlPlaneSyncResult {
  ok: true;
  mode: "preview" | "apply";
  writes: boolean;
  approved_for_apply?: boolean;
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
  project_links?: ControlPlaneSyncProjectLink[];
  spec_task_links?: ControlPlaneSyncTaskLink[];
  status?: ControlPlaneSyncStatus;
}

export interface ControlPlaneProjectOperatorSyncResult {
  ok: true;
  mode: "preview" | "apply";
  writes: boolean;
  approved_for_apply?: boolean;
  active_spec_id: string | null;
  counts: {
    operators: number;
    enabled: number;
    disabled: number;
    candidate_disabled: number;
    direct_repo_write_allowed: number;
  };
  operators: ControlPlaneProjectOperator[];
  policy: {
    owner_department: string;
    authority: string;
    implementation_delegate: string;
    write_target: string;
    domain_tables_mutated: boolean;
  };
}

export interface ControlPlaneMemoryStatus {
  runtime_path: string;
  data_path?: string;
  server_url: string;
  viewer_url: string;
  runtime_preflight?: {
    runtime_path_exists: boolean;
    server_port: number;
    viewer_port: number;
    health_url: string;
    livez_url: string;
    approved_runtime_connect: boolean;
    approval_refs: string[];
  };
  viewer_preflight?: {
    viewer_url: string;
    viewer_port: number;
    reachable: boolean;
    status_code: number | null;
    embed_mode: "iframe" | "fallback";
    error: string | null;
    reason?: "ok" | "http_error" | "timeout" | "network_error" | "embed_not_checked";
  };
  health: {
    available: boolean;
    status_code: number | null;
    error: string | null;
  };
  livez?: {
    available: boolean;
    status_code: number | null;
    error: string | null;
  };
  config_flags?: {
    available: boolean;
    status_code: number | null;
    summary: unknown;
    error: string | null;
  };
  config: {
    codex_config_exists: boolean;
    mentions_agentmemory: boolean;
    hooks_feature_enabled: boolean;
    plugin_hooks_enabled: boolean;
    mcp_configured: boolean;
    mcp_mention_only: boolean;
  };
  capabilities?: ControlPlaneAgentMemoryCapabilities;
  readiness?: {
    server_available: boolean;
    viewer_url: string;
    smart_search_available: boolean;
    context_available: boolean;
    remember_available: boolean;
    remember_requires_confirmation: boolean;
    remember_requires_approval: string;
    mcp_wiring_enabled: boolean;
    hook_auto_capture_enabled: boolean;
    delete_forget_enabled: boolean;
  };
  approval_gate: {
    runtime_connect_allowed: boolean;
    runtime_connect_required_approval: string;
    remember_policy_approval: string;
    blocked_operations: string[];
    next_safe_action: string;
  };
  integration_mode: string;
  install_required_approval: boolean;
  safe_proxy_available?: boolean;
}

export interface ControlPlaneAgentMemoryCapabilities {
  package: string;
  observed_version: string;
  node_engine: string;
  source_url: string;
  source_files: Record<string, string>;
  rest_groups: Array<{
    key: string;
    label: string;
    paths: string[];
    dongri_policy: string;
  }>;
  observed_rest_path_count: number;
  mcp_tools: {
    representative: string[];
    observed_memory_tool_count: number;
    wiring_status: string;
  };
  scope_model: string[];
  safety: Record<string, string>;
}

export interface ControlPlaneMemorySearchResult {
  ok: boolean;
  available: boolean;
  query?: string;
  scope?: string;
  results: unknown;
  status_code?: number | null;
  error: string | null;
  reason?: "ok" | "http_error" | "timeout" | "network_error";
}

export interface ControlPlaneMemoryContextResult {
  ok: boolean;
  available: boolean;
  query?: string;
  scope?: string;
  context: unknown;
  status_code?: number | null;
  error: string | null;
  reason?: "ok" | "http_error" | "timeout" | "network_error";
}

export interface ControlPlaneMemoryRememberResult {
  ok: boolean;
  available: boolean;
  captured: boolean;
  scope?: string;
  result?: unknown;
  required_approval?: string;
  status_code?: number | null;
  error: string | null;
}

export interface ControlPlaneOpenSourceCandidateResult {
  ok: boolean;
  available: boolean;
  query: string;
  source?: string;
  policy?: string;
  status_code?: number | null;
  error: string | null;
  candidates: Array<{
    name: string;
    url: string | null;
    description: string;
    stars: number;
    language: string | null;
    updated_at: string | null;
    topics: string[];
    suggested_scope: string;
  }>;
}

export function getControlPlaneState(signal?: AbortSignal): Promise<ControlPlaneState> {
  return request<ControlPlaneState>("/api/control-plane/state", { signal });
}

export function getMaster95Status(): Promise<{ ok: true; master_95: Master95Status }> {
  return request("/api/control-plane/v1/master-95/status");
}

export function getMaster95Scorecard(): Promise<{ ok: true; scorecard: Master95Scorecard }> {
  return request("/api/control-plane/v1/master-95/scorecard");
}

export function getMaster95Traceability(): Promise<{ ok: true; traceability: Master95Traceability }> {
  return request("/api/control-plane/v1/master-95/traceability");
}

export function getControlPlaneMemoryStatus(): Promise<{
  ok: true;
  memory: ControlPlaneMemoryStatus;
  memory_docs: ControlPlaneState["memory_docs"];
}> {
  return request("/api/control-plane/memory/status");
}

export function searchControlPlaneMemory(query: string): Promise<ControlPlaneMemorySearchResult> {
  return request<ControlPlaneMemorySearchResult>(`/api/control-plane/memory/search?query=${encodeURIComponent(query)}`);
}

export function getAgentMemoryCapabilities(): Promise<{ ok: true; capabilities: ControlPlaneAgentMemoryCapabilities }> {
  return request("/api/control-plane/v1/memory/agentmemory/capabilities");
}

export function getAgentMemoryFunctionalStatus(): Promise<{
  ok: true;
  memory: ControlPlaneMemoryStatus;
  memory_docs: ControlPlaneState["memory_docs"];
}> {
  return request("/api/control-plane/v1/memory/agentmemory/status");
}

function legacyV1MutationUnavailable<T>(operation: string, _intent?: unknown): Promise<T> {
  return Promise.reject(
    new Error(
      `legacy_v1_mutation_disabled:${operation}:a_registered_v2_preview_approval_execute_operation_is_required`,
    ),
  );
}

export function searchAgentMemoryFunctional(body: {
  query: string;
  scope?: string;
}): Promise<ControlPlaneMemorySearchResult> {
  return searchAgentMemoryV2<ControlPlaneMemorySearchResult>(body);
}

export function getAgentMemoryContext(body: {
  query: string;
  scope?: string;
  department?: string;
  project_key?: string;
  spec_id?: string;
}): Promise<ControlPlaneMemoryContextResult> {
  return readAgentMemoryContextV2<ControlPlaneMemoryContextResult>(body);
}

export function rememberAgentMemory(body: {
  text: string;
  scope?: string;
  department?: string;
  project_key?: string;
  spec_id?: string;
  evidence_refs?: string[];
  source_ref?: string;
}): Promise<ControlPlaneMemoryRememberResult> {
  return legacyV1MutationUnavailable("agentmemory-remember", body);
}

export function getOpenSourceSkillCandidates(
  query = "agent framework",
  limit = 6,
): Promise<ControlPlaneOpenSourceCandidateResult> {
  return request<ControlPlaneOpenSourceCandidateResult>(
    `/api/control-plane/v1/instructor/open-source/candidates?query=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`,
  );
}

export function previewControlPlaneSync(): Promise<ControlPlaneSyncResult> {
  return previewControlPlaneSyncV2<ControlPlaneSyncResult>();
}

export function applyControlPlaneSync(): Promise<ControlPlaneSyncResult> {
  return legacyV1MutationUnavailable("control-plane-sync-apply");
}

export function previewProjectOperatorSync(): Promise<ControlPlaneProjectOperatorSyncResult> {
  return post<ControlPlaneProjectOperatorSyncResult>("/api/control-plane/v1/project-operators/sync/preview", {});
}

export function applyProjectOperatorSync(): Promise<ControlPlaneProjectOperatorSyncResult> {
  return post<ControlPlaneProjectOperatorSyncResult>("/api/control-plane/v1/project-operators/sync/apply", {
    confirm: "apply-project-operators-sync",
  });
}

export function getCodexThreadCurrent(signal?: AbortSignal): Promise<CodexThreadCurrentResult> {
  return request<CodexThreadCurrentResult>("/api/control-plane/v1/codex/thread/current", { signal });
}

export function getEngineSyncStatus(): Promise<{ ok: true; engine_sync: ControlPlaneEngineSyncStatus }> {
  return request<{ ok: true; engine_sync: ControlPlaneEngineSyncStatus }>("/api/control-plane/v1/engines/status");
}

export function previewEngineRoute(body: EngineRoutePreviewBody): Promise<EngineRoutePreviewResult> {
  return previewEngineRouteV2<EngineRoutePreviewResult>(body);
}

export function createEngineRun(
  body: EngineRoutePreviewBody & {
    task_id?: string;
    goal_id?: string;
    external_thread_id?: string;
    external_session_id?: string;
    external_turn_id?: string;
    evidence_refs?: string[];
    event_jsonl?: string;
  },
): Promise<EngineRunResult> {
  return legacyV1MutationUnavailable("engine-run-create", body);
}

export function cancelEngineRun(runId: string): Promise<EngineRunResult> {
  return post<EngineRunResult>(`/api/control-plane/v1/engines/runs/${encodeURIComponent(runId)}/cancel`, {});
}

export function attachEngineThread(body: {
  provider?: EngineProvider;
  external_thread_id: string;
  scope_type?: "root" | "project" | "spec";
  scope_value?: string;
  title?: string;
  summary?: string;
  evidence_refs?: string[];
}): Promise<EngineRunResult> {
  return legacyV1MutationUnavailable("engine-thread-attach", body);
}

export function reconcileEngineSync(): Promise<EngineRunResult> {
  return legacyV1MutationUnavailable("engine-sync-reconcile");
}

export function activateCodexThread(body: CodexThreadActivationBody): Promise<ControlPlaneRunResult> {
  return legacyV1MutationUnavailable("codex-thread-activate", body);
}

export function finishCodexThread(
  runId: string,
  body: {
    final_status?: "completed" | "cancelled";
    evidence_refs?: string[];
    handoff_path?: string;
  },
): Promise<ControlPlaneRunResult> {
  return legacyV1MutationUnavailable("codex-thread-finish", { run_id: runId, ...body });
}

export function previewHarnessBlueprint(body: HarnessBlueprintBody): Promise<HarnessBlueprintResult> {
  return previewHarnessBlueprintV2<HarnessBlueprintResult>(body);
}

export function saveHarnessBlueprintDraft(body: HarnessBlueprintBody): Promise<HarnessBlueprintResult> {
  return legacyV1MutationUnavailable("harness-blueprint-save", body);
}

export function applyHarnessBlueprint(blueprintId: string): Promise<HarnessBlueprintResult> {
  return legacyV1MutationUnavailable("harness-blueprint-apply", { blueprint_id: blueprintId });
}

export function prepareControlPlaneRun(body: {
  department_agent: string;
  objective: string;
  task_id?: string;
  selected_repo?: string;
  persona_needed?: boolean;
  confidence?: string;
  evidence?: string[];
  approval_refs?: string[];
}): Promise<ControlPlaneRunResult> {
  return legacyV1MutationUnavailable("control-plane-run-prepare", body);
}

export function startControlPlaneRun(runId: string): Promise<ControlPlaneRunResult> {
  return legacyV1MutationUnavailable("control-plane-run-start", { run_id: runId });
}

export function createControlPlanePersona(
  runId: string,
  body: {
    parent_agent: string;
    persona_id?: string;
    objective: string;
    task_id?: string;
    input_docs?: string[];
    allowed_paths?: { read?: string[]; write?: string[] };
    write_policy?: string;
    return_schema?: string[];
    quality_bar?: string;
    quality_bar_result?: string;
    approval_ref?: string;
    evidence_refs?: string[];
  },
): Promise<ControlPlaneRunResult> {
  return legacyV1MutationUnavailable("control-plane-persona-create", { run_id: runId, ...body });
}

export function decideControlPlanePersona(
  personaId: string,
  body: {
    decision: "accept" | "reject" | "recreate" | "merge";
    reason?: string;
    evidence_refs?: string[];
    merged_into?: string;
    source_hash?: string;
    output_hash?: string;
    quality_bar_result?: string;
    payload?: Record<string, unknown>;
  },
): Promise<ControlPlaneRunResult> {
  return legacyV1MutationUnavailable("control-plane-persona-decide", { persona_id: personaId, ...body });
}
