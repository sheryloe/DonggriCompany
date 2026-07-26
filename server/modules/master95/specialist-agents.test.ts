import { describe, expect, it } from "vitest";
import {
  MASTER95_SPECIALIST_CONTRACTS,
  MASTER95_SPECIALIST_FIXTURES,
  MASTER95_SPECIALIST_ROLE_IDS,
  evaluateMaster95SpecialistAction,
} from "./specialist-agents.ts";

describe("Master95 specialist agents", () => {
  it("implements all ten required versioned role contracts", () => {
    expect(MASTER95_SPECIALIST_CONTRACTS.map((item) => item.role_id)).toEqual(MASTER95_SPECIALIST_ROLE_IDS);
    expect(
      MASTER95_SPECIALIST_CONTRACTS.every(
        (item) => item.golden_task && item.system_prompt_ref && item.input_schema_ref && item.output_schema_ref,
      ),
    ).toBe(true);
  });

  it("passes 100 acceptance fixtures with at least ten per role", () => {
    expect(MASTER95_SPECIALIST_FIXTURES).toHaveLength(100);
    for (const role of MASTER95_SPECIALIST_ROLE_IDS) {
      expect(MASTER95_SPECIALIST_FIXTURES.filter((fixture) => fixture.role_id === role)).toHaveLength(10);
    }
    const passed = MASTER95_SPECIALIST_FIXTURES.filter(
      (fixture) => evaluateMaster95SpecialistAction(fixture.action).decision === fixture.expected_decision,
    ).length;
    expect(passed / MASTER95_SPECIALIST_FIXTURES.length).toBeGreaterThanOrEqual(0.95);
    expect(passed).toBe(100);
  });

  it("never lets Reviewer approve its own output", () => {
    const reviewer = MASTER95_SPECIALIST_CONTRACTS.find((item) => item.role_id === "reviewer")!;
    expect(
      evaluateMaster95SpecialistAction({
        role_id: "reviewer",
        skill_id: reviewer.allowed_skills[0],
        artifact_type: reviewer.artifact_types[0],
        actor_agent_id: "reviewer:1",
        output_owner_agent_id: "reviewer:1",
        approve_output: true,
        writes_production_code: false,
      }),
    ).toMatchObject({ decision: "block", reason_code: "self_approval_denied" });
  });

  it("keeps QA independent from development roles", () => {
    const qa = MASTER95_SPECIALIST_CONTRACTS.find((item) => item.role_id === "qa-lead")!;
    for (const developmentRole of ["engineering-lead", "backend-worker", "frontend-worker"] as const) {
      expect(
        evaluateMaster95SpecialistAction({
          role_id: "qa-lead",
          skill_id: qa.allowed_skills[0],
          artifact_type: qa.artifact_types[0],
          actor_agent_id: "qa:1",
          output_owner_agent_id: "dev:1",
          approve_output: false,
          writes_production_code: false,
          relies_on_role_id: developmentRole,
        }),
      ).toMatchObject({ decision: "block", reason_code: "independence_violation" });
    }
  });

  it("denies production code writes to Memory Manager", () => {
    const memory = MASTER95_SPECIALIST_CONTRACTS.find((item) => item.role_id === "memory-manager")!;
    expect(
      evaluateMaster95SpecialistAction({
        role_id: "memory-manager",
        skill_id: memory.allowed_skills[0],
        artifact_type: memory.artifact_types[0],
        actor_agent_id: "memory:1",
        output_owner_agent_id: "memory:output",
        approve_output: false,
        writes_production_code: true,
      }),
    ).toMatchObject({ decision: "block", reason_code: "production_code_write_denied" });
  });
});
