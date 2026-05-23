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

export interface ControlPlaneRegistryProject {
  key: string;
  path: string;
  absolute_path: string;
  type: string | null;
  has_agents: boolean | null;
  status: string | null;
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
  gemini_review: {
    required: boolean;
    model: string;
    status: string;
    command_cwd: string;
  };
}

export interface ControlPlaneState {
  ok: true;
  generated_at: string;
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
  active_spec: {
    doc: ControlPlaneDocStatus;
    id: string | null;
    status: string | null;
    phase: string | null;
    related_repo: string | null;
    next_recommended_action: string | null;
    spec_dir: string | null;
    docs: ControlPlaneDocStatus[];
    missing_docs: string[];
  };
  ver1: ControlPlaneVer1State;
  registry: {
    doc: ControlPlaneDocStatus;
    projects: ControlPlaneRegistryProject[];
    repo_estate_root: string;
    db_project_count: number;
    db_projects: ControlPlaneDbProjectProjection[];
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
  approved_for_apply?: true;
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
  approved_for_apply?: true;
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
  server_url: string;
  viewer_url: string;
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
}

export interface ControlPlaneMemoryContextResult {
  ok: boolean;
  available: boolean;
  query?: string;
  scope?: string;
  context: unknown;
  status_code?: number | null;
  error: string | null;
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

export function getControlPlaneState(): Promise<ControlPlaneState> {
  return request<ControlPlaneState>("/api/control-plane/state");
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

export function searchAgentMemoryFunctional(body: {
  query: string;
  scope?: string;
}): Promise<ControlPlaneMemorySearchResult> {
  return post<ControlPlaneMemorySearchResult>("/api/control-plane/v1/memory/agentmemory/search", body);
}

export function getAgentMemoryContext(body: {
  query: string;
  scope?: string;
  department?: string;
  project_key?: string;
  spec_id?: string;
}): Promise<ControlPlaneMemoryContextResult> {
  return post<ControlPlaneMemoryContextResult>("/api/control-plane/v1/memory/agentmemory/context", body);
}

export function rememberAgentMemory(body: {
  text: string;
  scope?: string;
  department?: string;
  project_key?: string;
  spec_id?: string;
  evidence_refs?: string[];
  source_ref?: string;
  confirm: "remember-to-agentmemory";
}): Promise<ControlPlaneMemoryRememberResult> {
  return post<ControlPlaneMemoryRememberResult>("/api/control-plane/v1/memory/agentmemory/remember", body);
}

export function getOpenSourceSkillCandidates(query = "agent framework", limit = 6): Promise<ControlPlaneOpenSourceCandidateResult> {
  return request<ControlPlaneOpenSourceCandidateResult>(
    `/api/control-plane/v1/instructor/open-source/candidates?query=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`,
  );
}

export function previewControlPlaneSync(): Promise<ControlPlaneSyncResult> {
  return post<ControlPlaneSyncResult>("/api/control-plane/v1/sync/preview", {});
}

export function applyControlPlaneSync(): Promise<ControlPlaneSyncResult> {
  return post<ControlPlaneSyncResult>("/api/control-plane/v1/sync/apply", {
    confirm: "apply-control-plane-sync",
  });
}

export function previewProjectOperatorSync(): Promise<ControlPlaneProjectOperatorSyncResult> {
  return post<ControlPlaneProjectOperatorSyncResult>("/api/control-plane/v1/project-operators/sync/preview", {});
}

export function applyProjectOperatorSync(): Promise<ControlPlaneProjectOperatorSyncResult> {
  return post<ControlPlaneProjectOperatorSyncResult>("/api/control-plane/v1/project-operators/sync/apply", {
    confirm: "apply-project-operators-sync",
  });
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
  return post<ControlPlaneRunResult>("/api/control-plane/v1/runs/prepare", body);
}

export function startControlPlaneRun(runId: string): Promise<ControlPlaneRunResult> {
  return post<ControlPlaneRunResult>(`/api/control-plane/v1/runs/${encodeURIComponent(runId)}/start`, {});
}

export function createControlPlanePersona(
  runId: string,
  body: {
    parent_agent: string;
    persona_id?: string;
    objective: string;
    input_docs?: string[];
    allowed_paths?: { read?: string[]; write?: string[] };
    write_policy?: string;
    return_schema?: string[];
    quality_bar?: string;
    approval_ref?: string;
    evidence_refs?: string[];
  },
): Promise<ControlPlaneRunResult> {
  return post<ControlPlaneRunResult>(`/api/control-plane/v1/runs/${encodeURIComponent(runId)}/personas`, body);
}

export function decideControlPlanePersona(
  personaId: string,
  body: {
    decision: "accept" | "reject" | "recreate" | "merge";
    reason?: string;
    evidence_refs?: string[];
    merged_into?: string;
    payload?: Record<string, unknown>;
  },
): Promise<ControlPlaneRunResult> {
  return post<ControlPlaneRunResult>(`/api/control-plane/v1/personas/${encodeURIComponent(personaId)}/decision`, body);
}
