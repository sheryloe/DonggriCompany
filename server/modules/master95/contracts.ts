import { z } from "zod";
import { MASTER95_TASK_STATUSES } from "./agent-runtime.js";

export const MASTER95_CONTRACT_VERSION = "1.0.0" as const;
export const MASTER95_SECURITY_CLASSES = ["public", "internal", "confidential", "restricted"] as const;
export const MASTER95_RETENTION_CLASSES = ["ephemeral", "operational", "evidence", "permanent"] as const;

const JsonSchemaFragment = z.record(z.string(), z.unknown());
const NonEmptyId = z.string().trim().min(1);
const Semver = z.string().regex(/^\d+\.\d+\.\d+$/);
const IsoDateTime = z.iso.datetime({ offset: true });
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/i);

export const Master95AuditSchema = z
  .object({
    created_by: NonEmptyId,
    updated_by: NonEmptyId,
    source: NonEmptyId,
    correlation_id: NonEmptyId,
  })
  .strict();

export const Master95RetentionSchema = z
  .object({
    class: z.enum(MASTER95_RETENTION_CLASSES),
    days: z.number().int().positive().nullable(),
    legal_hold: z.boolean(),
  })
  .strict();

const BaseRecordShape = {
  id: NonEmptyId,
  project_id: NonEmptyId,
  agent_id: NonEmptyId,
  version: Semver,
  status: NonEmptyId,
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  trace_id: NonEmptyId,
  input_schema: JsonSchemaFragment,
  output_schema: JsonSchemaFragment,
  security_class: z.enum(MASTER95_SECURITY_CLASSES),
  retention: Master95RetentionSchema,
  audit: Master95AuditSchema,
} satisfies z.ZodRawShape;

const record = <T extends z.ZodRawShape>(shape: T) => z.object({ ...BaseRecordShape, ...shape }).strict();

export const Master95ProjectSchema = record({
  project_key: NonEmptyId,
  project_path: NonEmptyId,
  owner_department: z.literal("OPS"),
  memory_namespace: NonEmptyId,
  artifact_namespace: NonEmptyId,
  secret_scope: NonEmptyId,
  model_policy: NonEmptyId,
  budget_limit: z.number().nonnegative(),
  network_policy: NonEmptyId,
  approver_ids: z.array(NonEmptyId).min(1),
});

export const Master95AgentSchema = record({
  role: NonEmptyId,
  active_agent_version_id: NonEmptyId,
  manifest_id: NonEmptyId,
  enabled: z.boolean(),
});

export const Master95AgentVersionSchema = record({
  agent_version_id: NonEmptyId,
  agent_ref: NonEmptyId,
  model_policy: NonEmptyId,
  allowed_skills: z.array(NonEmptyId),
  denied_skills: z.array(NonEmptyId),
  file_scope: z.array(NonEmptyId),
  max_steps: z.number().int().positive(),
  max_handoffs: z.number().int().nonnegative(),
  timeout_seconds: z.number().int().positive(),
});

export const Master95TaskSchema = record({
  task_id: NonEmptyId,
  status: z.enum(MASTER95_TASK_STATUSES),
  objective: NonEmptyId,
  acceptance_criteria: z.array(NonEmptyId).min(1),
  assigned_agent_id: NonEmptyId,
});

export const Master95RunSchema = record({
  run_id: NonEmptyId,
  task_id: NonEmptyId,
  status: z.enum(MASTER95_TASK_STATUSES),
  idempotency_key: NonEmptyId,
  current_step: z.number().int().nonnegative(),
  retry_count: z.number().int().nonnegative(),
  cost_units: z.number().nonnegative(),
  artifact_ids: z.array(NonEmptyId),
});

export const Master95RunStateSchema = record({
  run_id: NonEmptyId,
  task_id: NonEmptyId,
  status: z.enum(MASTER95_TASK_STATUSES),
  sequence: z.number().int().nonnegative(),
  checkpoint_ref: NonEmptyId.nullable(),
  pending_approval_id: NonEmptyId.nullable(),
  cancel_requested: z.boolean(),
});

export const Master95HandoffSchema = record({
  handoff_id: NonEmptyId,
  run_id: NonEmptyId,
  from_agent_id: NonEmptyId,
  to_agent_id: NonEmptyId,
  purpose: NonEmptyId,
  constraints: z.array(NonEmptyId),
  acceptance_criteria: z.array(NonEmptyId).min(1),
  artifact_ids: z.array(NonEmptyId),
  memory_refs: z.array(NonEmptyId),
  remaining_handoffs: z.number().int().nonnegative(),
  approval_id: NonEmptyId.nullable(),
});

export const Master95SkillSchema = record({
  skill_id: NonEmptyId,
  provider: NonEmptyId,
  allowed_agent_ids: z.array(NonEmptyId).min(1),
  allowed_project_ids: z.array(NonEmptyId).min(1),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  approval_required: z.boolean(),
  timeout_seconds: z.number().int().positive(),
  retry_limit: z.number().int().nonnegative(),
  cost_limit: z.number().nonnegative(),
  health_status: z.enum(["healthy", "degraded", "unavailable"]),
  mcp_server: NonEmptyId.nullable(),
});

export const Master95ToolCallSchema = record({
  tool_call_id: NonEmptyId,
  run_id: NonEmptyId,
  skill_id: NonEmptyId,
  approval_id: NonEmptyId.nullable(),
  policy_decision_id: NonEmptyId,
  idempotency_key: NonEmptyId,
  started_at: IsoDateTime,
  completed_at: IsoDateTime.nullable(),
  error_code: NonEmptyId.nullable(),
});

export const Master95MemorySchema = record({
  memory_id: NonEmptyId,
  namespace: NonEmptyId,
  layer: z.enum(["working", "session", "episodic", "semantic", "decision", "user", "skill"]),
  source_refs: z.array(NonEmptyId).min(1),
  confidence: z.number().min(0).max(1),
  ttl_seconds: z.number().int().positive().nullable(),
  supersedes_memory_id: NonEmptyId.nullable(),
  sensitive: z.boolean(),
});

export const Master95ArtifactSchema = record({
  artifact_id: NonEmptyId,
  task_id: NonEmptyId,
  run_id: NonEmptyId,
  artifact_type: NonEmptyId,
  uri: NonEmptyId,
  sha256: Sha256,
  parent_artifact_id: NonEmptyId.nullable(),
  approval_status: z.enum(["draft", "pending", "approved", "rejected", "quarantined"]),
  rights_source: NonEmptyId,
});

export const Master95ApprovalSchema = record({
  approval_id: NonEmptyId,
  requester_agent_id: NonEmptyId,
  approver_id: NonEmptyId,
  scope: NonEmptyId,
  operation_class: NonEmptyId,
  expires_at: IsoDateTime,
  decision: z.enum(["pending", "approved", "rejected", "revoked", "expired"]),
  evidence_refs: z.array(NonEmptyId),
});

export const Master95PolicyDecisionSchema = record({
  policy_decision_id: NonEmptyId,
  run_id: NonEmptyId,
  operation_class: NonEmptyId,
  decision: z.enum(["allow", "approval_required", "block"]),
  reason_code: NonEmptyId,
  approval_id: NonEmptyId.nullable(),
  evaluated_at: IsoDateTime,
});

export const Master95TraceSchema = record({
  run_id: NonEmptyId,
  root_span_id: NonEmptyId,
  span_ids: z.array(NonEmptyId).min(1),
  complete: z.boolean(),
  redaction_applied: z.boolean(),
  total_cost_units: z.number().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
});

export const Master95EvaluationResultSchema = record({
  evaluation_id: NonEmptyId,
  run_id: NonEmptyId,
  evaluator_id: NonEmptyId,
  evaluation_type: z.enum(["contract", "golden_task", "trace_grade", "security", "ui_journey", "independent_review"]),
  score: z.number().min(0).max(1000),
  passed: z.boolean(),
  findings: z.array(NonEmptyId),
  evidence_refs: z.array(NonEmptyId).min(1),
});

export const MASTER95_STATE_EVENT_TYPES = [
  "task.submitted",
  "task.input_required",
  "task.auth_required",
  "task.approval_required",
  "run.started",
  "run.resumed",
  "run.completed",
  "run.failed",
  "run.canceled",
  "run.rejected",
  "handoff.created",
  "handoff.accepted",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "approval.requested",
  "approval.decided",
  "artifact.created",
] as const;

export const Master95StateEventSchema = z
  .object({
    event_id: NonEmptyId,
    project_id: NonEmptyId,
    task_id: NonEmptyId,
    run_id: NonEmptyId,
    trace_id: NonEmptyId,
    actor_agent_id: NonEmptyId,
    sequence: z.number().int().nonnegative(),
    event_type: z.enum(MASTER95_STATE_EVENT_TYPES),
    from_status: z.enum(MASTER95_TASK_STATUSES).nullable(),
    to_status: z.enum(MASTER95_TASK_STATUSES).nullable(),
    occurred_at: IsoDateTime,
    idempotency_key: NonEmptyId,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const MASTER95_CONTRACT_SCHEMAS = {
  Project: Master95ProjectSchema,
  Agent: Master95AgentSchema,
  AgentVersion: Master95AgentVersionSchema,
  Task: Master95TaskSchema,
  Run: Master95RunSchema,
  RunState: Master95RunStateSchema,
  Handoff: Master95HandoffSchema,
  Skill: Master95SkillSchema,
  ToolCall: Master95ToolCallSchema,
  Memory: Master95MemorySchema,
  Artifact: Master95ArtifactSchema,
  Approval: Master95ApprovalSchema,
  PolicyDecision: Master95PolicyDecisionSchema,
  Trace: Master95TraceSchema,
  EvaluationResult: Master95EvaluationResultSchema,
} as const;

export type Master95ContractName = keyof typeof MASTER95_CONTRACT_SCHEMAS;
