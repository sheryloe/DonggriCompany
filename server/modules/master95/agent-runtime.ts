export const MASTER95_TASK_STATUSES = [
  "SUBMITTED",
  "WORKING",
  "INPUT_REQUIRED",
  "AUTH_REQUIRED",
  "WAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "REJECTED",
] as const;

export type Master95TaskStatus = (typeof MASTER95_TASK_STATUSES)[number];

export type Master95TaskEvent =
  | "accept"
  | "request_input"
  | "request_auth"
  | "request_approval"
  | "resume"
  | "complete"
  | "fail"
  | "cancel"
  | "reject";

export type Master95Department = "CONTROL" | "SPEC" | "EXPLORE" | "IMPLEMENT" | "REVIEW" | "OPS";

export const MASTER95_RUNTIME_OPERATION_CLASSES = [
  "read_control_plane",
  "read_repo",
  "runtime_preview",
  "write_control_plane_docs",
  "write_repo_code",
  "external_process",
  "git_operation",
  "file_deletion",
  "db_write",
  "docker_destructive",
  "deploy",
  "secret_mutation",
  "agentmemory_runtime",
] as const;

export type Master95RuntimeOperationClass = (typeof MASTER95_RUNTIME_OPERATION_CLASSES)[number];

export type Master95PolicyDecision = "allow" | "approval_required" | "block";

export type Master95IdentifierSet = {
  project_id?: string | null;
  task_id?: string | null;
  run_id?: string | null;
  trace_id?: string | null;
  artifact_id?: string | null;
};

export type Master95RunSummary = Required<Pick<Master95IdentifierSet, "trace_id">> &
  Master95IdentifierSet & {
    run_id: string;
    status: Master95TaskStatus;
    evidence_refs: string[];
  };

export type Master95AgentManifest = {
  agent_id: Master95Department;
  display_name: string;
  owner_department: Master95Department;
  authority:
    | "root-control"
    | "specification"
    | "read-only-exploration"
    | "bounded-implementation"
    | "read-only-review"
    | "operations";
  write_boundary: string;
  can_create_read_persona: boolean;
  can_create_write_persona: boolean;
  can_write_repo_directly: boolean;
  requires_repo_map_for_writes: boolean;
};

export type Master95ProjectRuntimeProfile = {
  project_id: string;
  project_key: string;
  project_path: string;
  owner_department: "OPS";
  implementation_delegate: "IMPLEMENT";
  lifecycle_status: "active" | "candidate" | "completed" | "archived";
  enabled: boolean;
  memory_scope: string;
  write_policy: "read-only-ops-scope";
};

export type Master95TransitionResult =
  | {
      ok: true;
      from: Master95TaskStatus;
      event: Master95TaskEvent;
      to: Master95TaskStatus;
    }
  | {
      ok: false;
      from: Master95TaskStatus;
      event: Master95TaskEvent;
      to: Master95TaskStatus;
      error: "terminal_status" | "transition_not_allowed";
    };

export type Master95PolicyInput = {
  operation_class: Master95RuntimeOperationClass;
  department: Master95Department;
  path?: string | null;
  approvals?: string[];
  allowed_paths?: string[];
};

export type Master95PolicyEvaluation = {
  decision: Master95PolicyDecision;
  operation_class: Master95RuntimeOperationClass;
  department: Master95Department;
  required_approval: string | null;
  reason_code: string;
  path: string | null;
};

export type Master95CooLoopInput = Master95IdentifierSet & {
  objective: string;
  operation_class?: Master95RuntimeOperationClass;
  approvals?: string[];
  allowed_paths?: string[];
  target_path?: string | null;
  evidence_refs?: string[];
};

export type Master95CooLoopPhase = {
  order: number;
  department: Master95Department;
  task_status: Master95TaskStatus;
  objective: string;
  gate: string;
  evidence_required: boolean;
};

export type Master95CooLoopPlan = {
  writes: false;
  external_effects: false;
  run_summary: Master95RunSummary;
  policy: Master95PolicyEvaluation;
  phases: Master95CooLoopPhase[];
};

const TERMINAL_STATUSES = new Set<Master95TaskStatus>(["COMPLETED", "FAILED", "CANCELED", "REJECTED"]);

const ALLOWED_TRANSITIONS: Record<Master95TaskStatus, Partial<Record<Master95TaskEvent, Master95TaskStatus>>> = {
  SUBMITTED: {
    accept: "WORKING",
    request_input: "INPUT_REQUIRED",
    request_auth: "AUTH_REQUIRED",
    request_approval: "WAITING_APPROVAL",
    cancel: "CANCELED",
    reject: "REJECTED",
  },
  WORKING: {
    request_input: "INPUT_REQUIRED",
    request_auth: "AUTH_REQUIRED",
    request_approval: "WAITING_APPROVAL",
    complete: "COMPLETED",
    fail: "FAILED",
    cancel: "CANCELED",
  },
  INPUT_REQUIRED: {
    resume: "WORKING",
    fail: "FAILED",
    cancel: "CANCELED",
    reject: "REJECTED",
  },
  AUTH_REQUIRED: {
    resume: "WORKING",
    fail: "FAILED",
    cancel: "CANCELED",
    reject: "REJECTED",
  },
  WAITING_APPROVAL: {
    resume: "WORKING",
    fail: "FAILED",
    cancel: "CANCELED",
    reject: "REJECTED",
  },
  COMPLETED: {},
  FAILED: {},
  CANCELED: {},
  REJECTED: {},
};

export const MASTER95_AGENT_MANIFESTS: Master95AgentManifest[] = [
  {
    agent_id: "CONTROL",
    display_name: "Control Master",
    owner_department: "CONTROL",
    authority: "root-control",
    write_boundary: "Control Plane docs and approved runner state only",
    can_create_read_persona: true,
    can_create_write_persona: false,
    can_write_repo_directly: false,
    requires_repo_map_for_writes: true,
  },
  {
    agent_id: "SPEC",
    display_name: "Spec Master",
    owner_department: "SPEC",
    authority: "specification",
    write_boundary: "SDD requirements, design, tasks, repo-map, approvals",
    can_create_read_persona: true,
    can_create_write_persona: false,
    can_write_repo_directly: false,
    requires_repo_map_for_writes: true,
  },
  {
    agent_id: "EXPLORE",
    display_name: "Explore Master",
    owner_department: "EXPLORE",
    authority: "read-only-exploration",
    write_boundary: "read-only",
    can_create_read_persona: true,
    can_create_write_persona: false,
    can_write_repo_directly: false,
    requires_repo_map_for_writes: true,
  },
  {
    agent_id: "IMPLEMENT",
    display_name: "Implement Master",
    owner_department: "IMPLEMENT",
    authority: "bounded-implementation",
    write_boundary: "approved tasks and repo-map allowlist only",
    can_create_read_persona: true,
    can_create_write_persona: true,
    can_write_repo_directly: true,
    requires_repo_map_for_writes: true,
  },
  {
    agent_id: "REVIEW",
    display_name: "Review Master",
    owner_department: "REVIEW",
    authority: "read-only-review",
    write_boundary: "read-only",
    can_create_read_persona: true,
    can_create_write_persona: false,
    can_write_repo_directly: false,
    requires_repo_map_for_writes: true,
  },
  {
    agent_id: "OPS",
    display_name: "Ops Master",
    owner_department: "OPS",
    authority: "operations",
    write_boundary: "evidence, handoff, approved runtime operations only",
    can_create_read_persona: true,
    can_create_write_persona: false,
    can_write_repo_directly: false,
    requires_repo_map_for_writes: true,
  },
];

export function transitionMaster95TaskStatus(
  from: Master95TaskStatus,
  event: Master95TaskEvent,
): Master95TransitionResult {
  if (TERMINAL_STATUSES.has(from)) {
    return { ok: false, from, event, to: from, error: "terminal_status" };
  }
  const to = ALLOWED_TRANSITIONS[from][event];
  if (!to) {
    return { ok: false, from, event, to: from, error: "transition_not_allowed" };
  }
  return { ok: true, from, event, to };
}

export function createMaster95RunSummary(
  input: Master95IdentifierSet & { status?: Master95TaskStatus; evidence_refs?: string[] },
): Master95RunSummary {
  const runId = normalizeRequiredId(input.run_id, "run_id");
  const traceId = normalizeRequiredId(input.trace_id, "trace_id");
  return {
    project_id: normalizeOptionalId(input.project_id),
    task_id: normalizeOptionalId(input.task_id),
    run_id: runId,
    trace_id: traceId,
    artifact_id: normalizeOptionalId(input.artifact_id),
    status: input.status ?? "SUBMITTED",
    evidence_refs: [...(input.evidence_refs ?? [])],
  };
}

export function buildMaster95ProjectRuntimeProfile(input: {
  project_id?: string | null;
  project_key: string;
  project_path: string;
  lifecycle_status?: Master95ProjectRuntimeProfile["lifecycle_status"] | null;
  enabled?: boolean | null;
  memory_scope?: string | null;
}): Master95ProjectRuntimeProfile {
  const projectKey = normalizeRequiredId(input.project_key, "project_key");
  return {
    project_id: normalizeOptionalId(input.project_id) ?? `project:${projectKey}`,
    project_key: projectKey,
    project_path: normalizeRequiredId(input.project_path, "project_path"),
    owner_department: "OPS",
    implementation_delegate: "IMPLEMENT",
    lifecycle_status: input.lifecycle_status ?? "active",
    enabled: input.enabled ?? true,
    memory_scope: normalizeOptionalId(input.memory_scope) ?? `project:${projectKey}`,
    write_policy: "read-only-ops-scope",
  };
}

export function evaluateMaster95Policy(input: Master95PolicyInput): Master95PolicyEvaluation {
  const pathValue = normalizeOptionalId(input.path);
  if (
    input.operation_class === "read_control_plane" ||
    input.operation_class === "read_repo" ||
    input.operation_class === "runtime_preview"
  ) {
    return {
      decision: "allow",
      operation_class: input.operation_class,
      department: input.department,
      required_approval: null,
      reason_code: "read_or_preview_is_side_effect_free",
      path: pathValue,
    };
  }

  if (input.operation_class === "write_control_plane_docs") {
    return approvalDecision(input, "APR-M95-DOCS-001", "control_plane_docs_write_requires_spec_approval");
  }

  if (input.operation_class === "write_repo_code") {
    if (input.department !== "IMPLEMENT") {
      return {
        decision: "block",
        operation_class: input.operation_class,
        department: input.department,
        required_approval: "APR-M95-RUNTIME-ALPHA-001",
        reason_code: "repo_writes_require_implement_department",
        path: pathValue,
      };
    }
    if (!pathValue || !isPathAllowed(pathValue, input.allowed_paths ?? [])) {
      return {
        decision: "block",
        operation_class: input.operation_class,
        department: input.department,
        required_approval: "repo-map-allowed-path",
        reason_code: "path_outside_repo_map",
        path: pathValue,
      };
    }
    return approvalDecision(input, "APR-M95-RUNTIME-ALPHA-001", "repo_write_requires_runtime_alpha_approval");
  }

  const required = requiredApprovalForOperation(input.operation_class);
  return {
    decision: "approval_required",
    operation_class: input.operation_class,
    department: input.department,
    required_approval: required,
    reason_code: "risky_operation_requires_separate_approval",
    path: pathValue,
  };
}

export function planMaster95CooLoop(input: Master95CooLoopInput): Master95CooLoopPlan {
  const runSummary = createMaster95RunSummary({
    project_id: input.project_id,
    task_id: input.task_id,
    run_id: input.run_id,
    trace_id: input.trace_id,
    artifact_id: input.artifact_id,
    status: "SUBMITTED",
    evidence_refs: input.evidence_refs,
  });
  const policy = evaluateMaster95Policy({
    operation_class: input.operation_class ?? "runtime_preview",
    department: input.operation_class === "write_repo_code" ? "IMPLEMENT" : "CONTROL",
    path: input.target_path,
    approvals: input.approvals,
    allowed_paths: input.allowed_paths,
  });

  return {
    writes: false,
    external_effects: false,
    run_summary: runSummary,
    policy,
    phases: [
      phase(1, "CONTROL", "WORKING", input.objective, "source-of-truth and approval gate"),
      phase(2, "SPEC", "WORKING", "Lock requirements, repo-map, and acceptance evidence.", "SDD completeness gate"),
      phase(3, "EXPLORE", "WORKING", "Collect current-state context without writes.", "read-only investigation gate"),
      phase(
        4,
        "IMPLEMENT",
        policy.decision === "allow" ? "WORKING" : "WAITING_APPROVAL",
        "Apply only approved bounded implementation work.",
        "repo-map and approval gate",
      ),
      phase(
        5,
        "REVIEW",
        "WORKING",
        "Review risks, regressions, and missing verification.",
        "findings-first review gate",
      ),
      phase(6, "OPS", "WORKING", "Record evidence, handoff, and next safe action.", "evidence and handoff gate"),
    ],
  };
}

function phase(
  order: number,
  department: Master95Department,
  taskStatus: Master95TaskStatus,
  objective: string,
  gate: string,
): Master95CooLoopPhase {
  return {
    order,
    department,
    task_status: taskStatus,
    objective,
    gate,
    evidence_required: true,
  };
}

function approvalDecision(
  input: Master95PolicyInput,
  approvalId: string,
  reasonCode: string,
): Master95PolicyEvaluation {
  const pathValue = normalizeOptionalId(input.path);
  return {
    decision: input.approvals?.includes(approvalId) ? "allow" : "approval_required",
    operation_class: input.operation_class,
    department: input.department,
    required_approval: input.approvals?.includes(approvalId) ? null : approvalId,
    reason_code: reasonCode,
    path: pathValue,
  };
}

function requiredApprovalForOperation(operationClass: Master95RuntimeOperationClass): string {
  switch (operationClass) {
    case "external_process":
      return "APR-M95-RUNTIME-ALPHA-001";
    case "git_operation":
      return "not-used-for-master95-local-workspace-mode";
    case "file_deletion":
      return "APR-M95-LEGACY-CLEANUP";
    case "db_write":
      return "APR-M95-DB-DOCKER-SECRETS";
    case "docker_destructive":
      return "APR-M95-DB-DOCKER-SECRETS";
    case "deploy":
      return "deploy-approval-required";
    case "secret_mutation":
      return "APR-M95-DB-DOCKER-SECRETS";
    case "agentmemory_runtime":
      return "APR-M95-AGENTMEMORY-RUNTIME";
    default:
      return "approval-required";
  }
}

function normalizeRequiredId(value: string | null | undefined, field: string): string {
  const normalized = normalizeOptionalId(value);
  if (!normalized) {
    throw new Error(`${field}_required`);
  }
  return normalized;
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function isPathAllowed(pathValue: string, allowedPaths: string[]): boolean {
  const normalized = normalizePath(pathValue);
  return allowedPaths.some((allowedPath) => {
    const allowed = normalizePath(allowedPath);
    if (allowed.endsWith("/*")) {
      const prefix = allowed.slice(0, -1);
      return normalized.startsWith(prefix);
    }
    return normalized === allowed || normalized.startsWith(`${allowed}/`);
  });
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
}
