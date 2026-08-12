import { z } from "zod";
import type { Master95Department } from "./agent-runtime.js";

export const MASTER95_SPECIALIST_ROLE_IDS = [
  "product-manager",
  "researcher",
  "architect",
  "engineering-lead",
  "backend-worker",
  "frontend-worker",
  "reviewer",
  "qa-lead",
  "documenter",
  "memory-manager",
] as const;

const NonEmpty = z.string().trim().min(1);
export const Master95SpecialistContractSchema = z
  .object({
    role_id: z.enum(MASTER95_SPECIALIST_ROLE_IDS),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    display_name: NonEmpty,
    parent_department: z.enum(["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"]),
    system_prompt_ref: NonEmpty,
    input_schema_ref: NonEmpty,
    output_schema_ref: NonEmpty,
    allowed_skills: z.array(NonEmpty).min(1),
    memory_policy: NonEmpty,
    success_conditions: z.array(NonEmpty).min(1),
    failure_conditions: z.array(NonEmpty).min(1),
    termination_conditions: z.array(NonEmpty).min(1),
    golden_task: NonEmpty,
    escalation_to: z.array(z.enum(["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"])).min(1),
    artifact_types: z.array(NonEmpty).min(1),
    can_approve_own_output: z.literal(false),
    can_write_production_code: z.boolean(),
    independent_from: z.array(z.enum(MASTER95_SPECIALIST_ROLE_IDS)),
  })
  .strict();

export type Master95SpecialistRoleId = (typeof MASTER95_SPECIALIST_ROLE_IDS)[number];
export type Master95SpecialistContract = z.infer<typeof Master95SpecialistContractSchema>;

export type Master95SpecialistAction = {
  role_id: Master95SpecialistRoleId;
  skill_id: string;
  artifact_type: string;
  actor_agent_id: string;
  output_owner_agent_id: string;
  approve_output: boolean;
  writes_production_code: boolean;
  relies_on_role_id?: Master95SpecialistRoleId | null;
};

export type Master95SpecialistDecision = {
  decision: "allow" | "block";
  reason_code:
    | "specialist_action_authorized"
    | "role_not_registered"
    | "skill_not_allowed"
    | "artifact_not_allowed"
    | "self_approval_denied"
    | "production_code_write_denied"
    | "independence_violation";
};

export function evaluateMaster95SpecialistAction(action: Master95SpecialistAction): Master95SpecialistDecision {
  const contract = MASTER95_SPECIALIST_CONTRACTS.find((item) => item.role_id === action.role_id);
  if (!contract) return block("role_not_registered");
  if (!contract.allowed_skills.includes(action.skill_id)) return block("skill_not_allowed");
  if (!contract.artifact_types.includes(action.artifact_type)) return block("artifact_not_allowed");
  if (action.approve_output && action.actor_agent_id === action.output_owner_agent_id)
    return block("self_approval_denied");
  if (action.writes_production_code && !contract.can_write_production_code)
    return block("production_code_write_denied");
  if (action.relies_on_role_id && contract.independent_from.includes(action.relies_on_role_id))
    return block("independence_violation");
  return { decision: "allow", reason_code: "specialist_action_authorized" };
}

type SpecialistSeed = {
  role_id: Master95SpecialistRoleId;
  display_name: string;
  parent_department: Master95Department;
  allowed_skills: string[];
  artifact_types: string[];
  can_write_production_code: boolean;
  independent_from?: Master95SpecialistRoleId[];
  golden_task: string;
};

const seeds: SpecialistSeed[] = [
  seed(
    "product-manager",
    "Product Manager",
    "SPEC",
    ["requirements.define", "priority.decide", "acceptance.define"],
    ["product-brief", "acceptance-pack"],
    false,
    "Define a measurable BloggerGent OPS objective.",
  ),
  seed(
    "researcher",
    "Researcher",
    "EXPLORE",
    ["source.collect", "evidence.compare", "uncertainty.report"],
    ["research-note", "source-pack"],
    false,
    "Compare current BloggerGent lane evidence without writes.",
  ),
  seed(
    "architect",
    "Architect",
    "SPEC",
    ["architecture.design", "adr.write", "failure.model"],
    ["architecture-pack", "adr"],
    false,
    "Design a project-isolated durable workflow.",
  ),
  seed(
    "engineering-lead",
    "Engineering Lead",
    "IMPLEMENT",
    ["implementation.plan", "boundary.assign", "integration.verify"],
    ["implementation-plan", "integration-report"],
    true,
    "Split a bounded implementation across backend and frontend.",
  ),
  seed(
    "backend-worker",
    "Backend Worker",
    "IMPLEMENT",
    ["backend.implement", "contract.test", "migration.draft"],
    ["backend-patch", "contract-test-report"],
    true,
    "Implement a project-scoped read API.",
  ),
  seed(
    "frontend-worker",
    "Frontend Worker",
    "IMPLEMENT",
    ["frontend.implement", "ui.test", "accessibility.check"],
    ["frontend-patch", "ui-test-report"],
    true,
    "Implement a read-only BloggerGent lane panel.",
  ),
  seed(
    "reviewer",
    "Reviewer",
    "REVIEW",
    ["change.review", "risk.rank", "evidence.verify"],
    ["review-report", "risk-register"],
    false,
    "Review an implementation produced by another role.",
    ["engineering-lead", "backend-worker", "frontend-worker"],
  ),
  seed(
    "qa-lead",
    "QA Lead",
    "REVIEW",
    ["test.design", "result.grade", "regression.decide"],
    ["qa-report", "regression-report"],
    false,
    "Independently grade a BloggerGent core journey.",
    ["engineering-lead", "backend-worker", "frontend-worker"],
  ),
  seed(
    "documenter",
    "Documenter",
    "OPS",
    ["docs.write", "evidence.index", "handoff.prepare"],
    ["documentation", "handoff-pack"],
    false,
    "Produce an evidence-linked operator handoff.",
  ),
  seed(
    "memory-manager",
    "Memory Manager",
    "OPS",
    ["memory.classify", "memory.retrieve", "memory.correct"],
    ["memory-report", "memory-lineage"],
    false,
    "Classify memory with source and retention metadata.",
  ),
];

export const MASTER95_SPECIALIST_CONTRACTS: Master95SpecialistContract[] = seeds.map((item) =>
  Master95SpecialistContractSchema.parse({
    role_id: item.role_id,
    version: "1.0.0",
    display_name: item.display_name,
    parent_department: item.parent_department,
    system_prompt_ref: `master95://specialists/${item.role_id}/system@1.0.0`,
    input_schema_ref: "master95://contracts/Task@1.0.0",
    output_schema_ref: "master95://contracts/EvaluationResult@1.0.0",
    allowed_skills: item.allowed_skills,
    memory_policy: "project-scoped-source-linked-no-secret-no-raw-transcript",
    success_conditions: ["acceptance criteria satisfied", "evidence references present"],
    failure_conditions: ["scope violation", "missing evidence", "unauthorized operation"],
    termination_conditions: ["success", "blocked", "max steps", "timeout", "cancel"],
    golden_task: item.golden_task,
    escalation_to: item.parent_department === "IMPLEMENT" ? ["REVIEW", "CONTROL"] : ["CONTROL"],
    artifact_types: item.artifact_types,
    can_approve_own_output: false,
    can_write_production_code: item.can_write_production_code,
    independent_from: item.independent_from ?? [],
  }),
);

export type Master95SpecialistFixture = {
  fixture_id: string;
  role_id: Master95SpecialistRoleId;
  action: Master95SpecialistAction;
  expected_decision: "allow" | "block";
};

export const MASTER95_SPECIALIST_FIXTURES: Master95SpecialistFixture[] = MASTER95_SPECIALIST_CONTRACTS.flatMap(
  (contract) =>
    Array.from({ length: 10 }, (_, index) => {
      const isSkillBoundary = index === 8;
      const isArtifactBoundary = index === 9;
      return {
        fixture_id: `${contract.role_id}-${String(index + 1).padStart(2, "0")}`,
        role_id: contract.role_id,
        action: {
          role_id: contract.role_id,
          skill_id: isSkillBoundary
            ? "forbidden.skill"
            : contract.allowed_skills[index % contract.allowed_skills.length],
          artifact_type: isArtifactBoundary
            ? "forbidden-artifact"
            : contract.artifact_types[index % contract.artifact_types.length],
          actor_agent_id: `${contract.role_id}:actor`,
          output_owner_agent_id: `${contract.role_id}:output-owner`,
          approve_output: false,
          writes_production_code: false,
          relies_on_role_id: null,
        },
        expected_decision: isSkillBoundary || isArtifactBoundary ? "block" : "allow",
      };
    }),
);

function seed(
  role_id: Master95SpecialistRoleId,
  display_name: string,
  parent_department: Master95Department,
  allowed_skills: string[],
  artifact_types: string[],
  can_write_production_code: boolean,
  golden_task: string,
  independent_from: Master95SpecialistRoleId[] = [],
): SpecialistSeed {
  return {
    role_id,
    display_name,
    parent_department,
    allowed_skills,
    artifact_types,
    can_write_production_code,
    independent_from,
    golden_task,
  };
}

function block(
  reason_code: Exclude<Master95SpecialistDecision["reason_code"], "specialist_action_authorized">,
): Master95SpecialistDecision {
  return { decision: "block", reason_code };
}
