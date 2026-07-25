import { describe, expect, it } from "vitest";
import {
  MASTER95_CONTRACT_SCHEMAS,
  MASTER95_CONTRACT_VERSION,
  MASTER95_STATE_EVENT_TYPES,
  Master95StateEventSchema,
  type Master95ContractName,
} from "./contracts.js";

const now = "2026-07-14T14:00:00.000Z";
const base = (id: string, status = "active") => ({
  id,
  project_id: "project:BloggerGent",
  agent_id: "OPS",
  version: MASTER95_CONTRACT_VERSION,
  status,
  created_at: now,
  updated_at: now,
  trace_id: "trace-001",
  input_schema: { type: "object" },
  output_schema: { type: "object" },
  security_class: "internal",
  retention: { class: "evidence", days: null, legal_hold: false },
  audit: { created_by: "SPEC", updated_by: "SPEC", source: "contract-test", correlation_id: "corr-001" },
});

const fixtures: Record<Master95ContractName, Record<string, unknown>> = {
  Project: {
    ...base("project:BloggerGent"),
    project_key: "BloggerGent",
    project_path: "G:/Donggri_DevDrive/repos/BloggerGent",
    owner_department: "OPS",
    memory_namespace: "project:BloggerGent",
    artifact_namespace: "project:BloggerGent",
    secret_scope: "project:BloggerGent",
    model_policy: "canonical",
    budget_limit: 0,
    network_policy: "localhost-and-allowlist",
    approver_ids: ["user"],
  },
  Agent: {
    ...base("agent:OPS"),
    role: "operations",
    active_agent_version_id: "agent-version:OPS:1.0.0",
    manifest_id: "manifest:OPS",
    enabled: true,
  },
  AgentVersion: {
    ...base("agent-version:OPS:1.0.0"),
    agent_version_id: "agent-version:OPS:1.0.0",
    agent_ref: "agent:OPS",
    model_policy: "canonical",
    allowed_skills: ["project-status"],
    denied_skills: ["deploy"],
    file_scope: ["G:/Donggri_DevDrive/storage/codex-control"],
    max_steps: 15,
    max_handoffs: 4,
    timeout_seconds: 900,
  },
  Task: {
    ...base("task-001", "SUBMITTED"),
    task_id: "task-001",
    objective: "BloggerGent status preview",
    acceptance_criteria: ["read-only"],
    assigned_agent_id: "OPS",
  },
  Run: {
    ...base("run-001", "WORKING"),
    run_id: "run-001",
    task_id: "task-001",
    idempotency_key: "idem-001",
    current_step: 1,
    retry_count: 0,
    cost_units: 0,
    artifact_ids: [],
  },
  RunState: {
    ...base("run-state-001", "WORKING"),
    run_id: "run-001",
    task_id: "task-001",
    sequence: 1,
    checkpoint_ref: null,
    pending_approval_id: null,
    cancel_requested: false,
  },
  Handoff: {
    ...base("handoff-001", "pending"),
    handoff_id: "handoff-001",
    run_id: "run-001",
    from_agent_id: "OPS",
    to_agent_id: "IMPLEMENT",
    purpose: "bounded implementation",
    constraints: ["repo-map"],
    acceptance_criteria: ["tests pass"],
    artifact_ids: [],
    memory_refs: [],
    remaining_handoffs: 3,
    approval_id: null,
  },
  Skill: {
    ...base("skill:project-status"),
    skill_id: "project-status",
    provider: "local",
    allowed_agent_ids: ["OPS"],
    allowed_project_ids: ["project:BloggerGent"],
    risk_level: "low",
    approval_required: false,
    timeout_seconds: 30,
    retry_limit: 1,
    cost_limit: 0,
    health_status: "healthy",
    mcp_server: null,
  },
  ToolCall: {
    ...base("tool-call-001", "completed"),
    tool_call_id: "tool-call-001",
    run_id: "run-001",
    skill_id: "project-status",
    approval_id: null,
    policy_decision_id: "policy-001",
    idempotency_key: "idem-tool-001",
    started_at: now,
    completed_at: now,
    error_code: null,
  },
  Memory: {
    ...base("memory-001"),
    memory_id: "memory-001",
    namespace: "project:BloggerGent",
    layer: "decision",
    source_refs: ["EV-M95-SOT-001"],
    confidence: 1,
    ttl_seconds: null,
    supersedes_memory_id: null,
    sensitive: false,
  },
  Artifact: {
    ...base("artifact-001", "draft"),
    artifact_id: "artifact-001",
    task_id: "task-001",
    run_id: "run-001",
    artifact_type: "report",
    uri: "E:/DonggriPlatform_Asset/runtime/artifacts/artifact-001",
    sha256: "a".repeat(64),
    parent_artifact_id: null,
    approval_status: "draft",
    rights_source: "internal",
  },
  Approval: {
    ...base("approval-001", "pending"),
    approval_id: "approval-001",
    requester_agent_id: "IMPLEMENT",
    approver_id: "user",
    scope: "repo write",
    operation_class: "write_repo_code",
    expires_at: now,
    decision: "pending",
    evidence_refs: [],
  },
  PolicyDecision: {
    ...base("policy-001", "allow"),
    policy_decision_id: "policy-001",
    run_id: "run-001",
    operation_class: "read_repo",
    decision: "allow",
    reason_code: "read_only",
    approval_id: null,
    evaluated_at: now,
  },
  Trace: {
    ...base("trace-001", "complete"),
    run_id: "run-001",
    root_span_id: "span-root",
    span_ids: ["span-root"],
    complete: true,
    redaction_applied: true,
    total_cost_units: 0,
    duration_ms: 1,
  },
  EvaluationResult: {
    ...base("evaluation-001", "passed"),
    evaluation_id: "evaluation-001",
    run_id: "run-001",
    evaluator_id: "REVIEW",
    evaluation_type: "contract",
    score: 100,
    passed: true,
    findings: [],
    evidence_refs: ["EV-M95-CONTRACTS-001"],
  },
};

describe("Master95 public contracts", () => {
  it("defines and validates all 15 canonical objects", () => {
    expect(Object.keys(MASTER95_CONTRACT_SCHEMAS)).toHaveLength(15);
    for (const [name, schema] of Object.entries(MASTER95_CONTRACT_SCHEMAS)) {
      expect(schema.safeParse(fixtures[name as Master95ContractName]).success, name).toBe(true);
    }
  });

  it("requires project, agent, trace, schema, retention, security and audit fields on every object", () => {
    for (const [name, schema] of Object.entries(MASTER95_CONTRACT_SCHEMAS)) {
      for (const field of [
        "project_id",
        "agent_id",
        "trace_id",
        "input_schema",
        "output_schema",
        "security_class",
        "retention",
        "audit",
      ]) {
        const invalid = { ...fixtures[name as Master95ContractName] };
        delete invalid[field];
        expect(schema.safeParse(invalid).success, `${name}.${field}`).toBe(false);
      }
    }
  });

  it("rejects unknown fields and invalid task status", () => {
    expect(MASTER95_CONTRACT_SCHEMAS.Project.safeParse({ ...fixtures.Project, unexpected: true }).success).toBe(false);
    expect(MASTER95_CONTRACT_SCHEMAS.Task.safeParse({ ...fixtures.Task, status: "UNKNOWN" }).success).toBe(false);
  });

  it("requires run and trace identifiers for execution records", () => {
    const invalidRun = { ...fixtures.Run };
    delete invalidRun.run_id;
    expect(MASTER95_CONTRACT_SCHEMAS.Run.safeParse(invalidRun).success).toBe(false);
    const invalidTool = { ...fixtures.ToolCall };
    delete invalidTool.idempotency_key;
    expect(MASTER95_CONTRACT_SCHEMAS.ToolCall.safeParse(invalidTool).success).toBe(false);
  });

  it("validates the canonical state event contract", () => {
    expect(MASTER95_STATE_EVENT_TYPES).toHaveLength(18);
    expect(
      Master95StateEventSchema.safeParse({
        event_id: "event-001",
        project_id: "project:BloggerGent",
        task_id: "task-001",
        run_id: "run-001",
        trace_id: "trace-001",
        actor_agent_id: "OPS",
        sequence: 1,
        event_type: "run.started",
        from_status: "SUBMITTED",
        to_status: "WORKING",
        occurred_at: now,
        idempotency_key: "idem-event-001",
        payload: {},
      }).success,
    ).toBe(true);
  });
});
