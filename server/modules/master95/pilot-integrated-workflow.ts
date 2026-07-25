import { z } from "zod";
import {
  MASTER95_SPECIALIST_CONTRACTS,
  evaluateMaster95SpecialistAction,
  type Master95SpecialistRoleId,
} from "./specialist-agents.js";

export const MASTER95_INTEGRATED_E2E_STAGES = [
  "ceo_request",
  "coo_analysis",
  "pm_requirements",
  "researcher_research",
  "architect_design",
  "worker_implementation",
  "reviewer_review",
  "qa_test",
  "documenter_documentation",
  "memory_manager_store",
  "artifact_return",
] as const;

const NonEmpty = z.string().trim().min(1);
export const Master95PilotWorkflowStageReceiptSchema = z
  .object({
    stage: z.enum(MASTER95_INTEGRATED_E2E_STAGES),
    actor_role: NonEmpty,
    status: z.literal("completed"),
    evidence_ref: NonEmpty,
    occurred_at: z.string().datetime(),
    operation_mode: z.literal("local-dry-run-no-external-effects"),
  })
  .strict();

export type Master95PilotWorkflowStageReceipt = z.infer<typeof Master95PilotWorkflowStageReceiptSchema>;

type SpecialistStage = {
  stage: (typeof MASTER95_INTEGRATED_E2E_STAGES)[number];
  role_id: Master95SpecialistRoleId;
};

const specialistStages: SpecialistStage[] = [
  { stage: "pm_requirements", role_id: "product-manager" },
  { stage: "researcher_research", role_id: "researcher" },
  { stage: "architect_design", role_id: "architect" },
  { stage: "worker_implementation", role_id: "backend-worker" },
  { stage: "reviewer_review", role_id: "reviewer" },
  { stage: "qa_test", role_id: "qa-lead" },
  { stage: "documenter_documentation", role_id: "documenter" },
  { stage: "memory_manager_store", role_id: "memory-manager" },
];

export function runMaster95IntegratedPilotWorkflow(input: {
  run_id: string;
  project_id: string;
  occurred_at: string;
}): Master95PilotWorkflowStageReceipt[] {
  const receipts: Master95PilotWorkflowStageReceipt[] = [
    receipt("ceo_request", "CEO", input),
    receipt("coo_analysis", "COO", input),
  ];

  for (const item of specialistStages) {
    const contract = MASTER95_SPECIALIST_CONTRACTS.find((candidate) => candidate.role_id === item.role_id);
    if (!contract) throw new Error(`pilot_e2e_role_missing:${item.role_id}`);
    const decision = evaluateMaster95SpecialistAction({
      role_id: item.role_id,
      skill_id: contract.allowed_skills[0],
      artifact_type: contract.artifact_types[0],
      actor_agent_id: `${input.run_id}:${item.role_id}`,
      output_owner_agent_id:
        item.role_id === "reviewer" || item.role_id === "qa-lead"
          ? `${input.run_id}:backend-worker`
          : `${input.run_id}:${item.role_id}:output`,
      approve_output: item.role_id === "reviewer" || item.role_id === "qa-lead",
      writes_production_code: false,
      relies_on_role_id: null,
    });
    if (decision.decision !== "allow") throw new Error(`pilot_e2e_stage_blocked:${item.stage}:${decision.reason_code}`);
    receipts.push(receipt(item.stage, item.role_id, input));
  }

  receipts.push(receipt("artifact_return", "COO", input));
  return receipts.map((item) => Master95PilotWorkflowStageReceiptSchema.parse(item));
}

export function isCompleteMaster95IntegratedPilotWorkflow(receipts: Master95PilotWorkflowStageReceipt[]) {
  return (
    receipts.length === MASTER95_INTEGRATED_E2E_STAGES.length &&
    receipts.every(
      (receipt, index) =>
        receipt.stage === MASTER95_INTEGRATED_E2E_STAGES[index] &&
        receipt.status === "completed" &&
        receipt.evidence_ref.length > 0,
    )
  );
}

function receipt(
  stage: (typeof MASTER95_INTEGRATED_E2E_STAGES)[number],
  actorRole: string,
  input: { run_id: string; project_id: string; occurred_at: string },
): Master95PilotWorkflowStageReceipt {
  return {
    stage,
    actor_role: actorRole,
    status: "completed",
    evidence_ref: `pilot-e2e:${input.project_id}:${input.run_id}:${stage}`,
    occurred_at: input.occurred_at,
    operation_mode: "local-dry-run-no-external-effects",
  };
}
