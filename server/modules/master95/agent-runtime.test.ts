import { describe, expect, it } from "vitest";
import {
  MASTER95_AGENT_MANIFESTS,
  MASTER95_TASK_STATUSES,
  buildMaster95ProjectRuntimeProfile,
  createMaster95RunSummary,
  evaluateMaster95Policy,
  planMaster95CooLoop,
  transitionMaster95TaskStatus,
} from "./agent-runtime.ts";

const runtimeAlphaPaths = [
  "G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/agent-runtime.ts",
  "G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/agent-runtime.test.ts",
];

describe("Master95 Agent Runtime Alpha", () => {
  it("defines the required task status model exactly", () => {
    expect(MASTER95_TASK_STATUSES).toEqual([
      "SUBMITTED",
      "WORKING",
      "INPUT_REQUIRED",
      "AUTH_REQUIRED",
      "WAITING_APPROVAL",
      "COMPLETED",
      "FAILED",
      "CANCELED",
      "REJECTED",
    ]);
  });

  it("moves through allowed task, run, and handoff state transitions", () => {
    expect(transitionMaster95TaskStatus("SUBMITTED", "accept")).toMatchObject({
      ok: true,
      to: "WORKING",
    });
    expect(transitionMaster95TaskStatus("WORKING", "request_approval")).toMatchObject({
      ok: true,
      to: "WAITING_APPROVAL",
    });
    expect(transitionMaster95TaskStatus("WAITING_APPROVAL", "resume")).toMatchObject({
      ok: true,
      to: "WORKING",
    });
    expect(transitionMaster95TaskStatus("WORKING", "complete")).toMatchObject({
      ok: true,
      to: "COMPLETED",
    });
    expect(transitionMaster95TaskStatus("COMPLETED", "resume")).toMatchObject({
      ok: false,
      error: "terminal_status",
      to: "COMPLETED",
    });
    expect(transitionMaster95TaskStatus("SUBMITTED", "complete")).toMatchObject({
      ok: false,
      error: "transition_not_allowed",
    });
  });

  it("enforces trace_id and run_id for run summaries", () => {
    expect(() => createMaster95RunSummary({ run_id: "run-001" })).toThrow("trace_id_required");
    expect(() => createMaster95RunSummary({ trace_id: "trace-001" })).toThrow("run_id_required");
    expect(
      createMaster95RunSummary({
        project_id: "project-donggri",
        task_id: "task-001",
        run_id: "run-001",
        trace_id: "trace-001",
        artifact_id: "artifact-001",
        status: "WORKING",
        evidence_refs: ["EV-M95-RUNTIME-ALPHA-001"],
      }),
    ).toEqual({
      project_id: "project-donggri",
      task_id: "task-001",
      run_id: "run-001",
      trace_id: "trace-001",
      artifact_id: "artifact-001",
      status: "WORKING",
      evidence_refs: ["EV-M95-RUNTIME-ALPHA-001"],
    });
  });

  it("exposes department manifests without old staff hierarchy semantics", () => {
    expect(MASTER95_AGENT_MANIFESTS.map((agent) => agent.agent_id)).toEqual([
      "CONTROL",
      "SPEC",
      "EXPLORE",
      "IMPLEMENT",
      "REVIEW",
      "OPS",
    ]);
    expect(MASTER95_AGENT_MANIFESTS.every((agent) => agent.requires_repo_map_for_writes)).toBe(true);
    expect(JSON.stringify(MASTER95_AGENT_MANIFESTS).toLowerCase()).not.toContain("team lead");
    expect(JSON.stringify(MASTER95_AGENT_MANIFESTS).toLowerCase()).not.toContain("junior");
  });

  it("projects registry entries as OPS-scoped runtime profiles", () => {
    expect(
      buildMaster95ProjectRuntimeProfile({
        project_key: "DonggriCompany",
        project_path: "G:/Donggri_DevDrive/repos/DonggriCompany",
      }),
    ).toMatchObject({
      project_id: "project:DonggriCompany",
      project_key: "DonggriCompany",
      owner_department: "OPS",
      implementation_delegate: "IMPLEMENT",
      lifecycle_status: "active",
      memory_scope: "project:DonggriCompany",
      write_policy: "read-only-ops-scope",
    });
  });

  it("keeps read and preview actions side-effect free", () => {
    expect(
      evaluateMaster95Policy({
        operation_class: "runtime_preview",
        department: "CONTROL",
      }),
    ).toMatchObject({
      decision: "allow",
      required_approval: null,
      reason_code: "read_or_preview_is_side_effect_free",
    });
  });

  it("allows repo writes only for IMPLEMENT with runtime alpha approval and repo-map paths", () => {
    expect(
      evaluateMaster95Policy({
        operation_class: "write_repo_code",
        department: "CONTROL",
        path: runtimeAlphaPaths[0],
        approvals: ["APR-M95-RUNTIME-ALPHA-001"],
        allowed_paths: runtimeAlphaPaths,
      }),
    ).toMatchObject({
      decision: "block",
      reason_code: "repo_writes_require_implement_department",
    });

    expect(
      evaluateMaster95Policy({
        operation_class: "write_repo_code",
        department: "IMPLEMENT",
        path: "G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/routes/core/tasks/execution-run.ts",
        approvals: ["APR-M95-RUNTIME-ALPHA-001"],
        allowed_paths: runtimeAlphaPaths,
      }),
    ).toMatchObject({
      decision: "block",
      reason_code: "path_outside_repo_map",
    });

    expect(
      evaluateMaster95Policy({
        operation_class: "write_repo_code",
        department: "IMPLEMENT",
        path: runtimeAlphaPaths[0],
        allowed_paths: runtimeAlphaPaths,
      }),
    ).toMatchObject({
      decision: "approval_required",
      required_approval: "APR-M95-RUNTIME-ALPHA-001",
    });

    expect(
      evaluateMaster95Policy({
        operation_class: "write_repo_code",
        department: "IMPLEMENT",
        path: runtimeAlphaPaths[0],
        approvals: ["APR-M95-RUNTIME-ALPHA-001"],
        allowed_paths: runtimeAlphaPaths,
      }),
    ).toMatchObject({
      decision: "allow",
      required_approval: null,
    });
  });

  it("keeps Git, deletion, DB, Docker, deploy, secrets, and AgentMemory runtime behind separate approvals", () => {
    const riskyClasses = [
      "git_operation",
      "file_deletion",
      "db_write",
      "docker_destructive",
      "deploy",
      "secret_mutation",
      "agentmemory_runtime",
    ] as const;

    for (const operationClass of riskyClasses) {
      expect(
        evaluateMaster95Policy({
          operation_class: operationClass,
          department: "OPS",
        }),
      ).toMatchObject({
        decision: "approval_required",
      });
    }
  });

  it("plans the COO loop with trace evidence and no side effects", () => {
    const plan = planMaster95CooLoop({
      project_id: "project-donggri",
      task_id: "task-runtime-alpha",
      run_id: "run-runtime-alpha",
      trace_id: "trace-runtime-alpha",
      objective: "Implement Master95 runtime alpha without Git cleanup",
      operation_class: "write_repo_code",
      target_path: runtimeAlphaPaths[0],
      approvals: ["APR-M95-RUNTIME-ALPHA-001"],
      allowed_paths: runtimeAlphaPaths,
      evidence_refs: ["EV-M95-RUNTIME-ALPHA-001"],
    });

    expect(plan.writes).toBe(false);
    expect(plan.external_effects).toBe(false);
    expect(plan.run_summary).toMatchObject({
      run_id: "run-runtime-alpha",
      trace_id: "trace-runtime-alpha",
      status: "SUBMITTED",
    });
    expect(plan.policy.decision).toBe("allow");
    expect(plan.phases.map((phase) => phase.department)).toEqual([
      "CONTROL",
      "SPEC",
      "EXPLORE",
      "IMPLEMENT",
      "REVIEW",
      "OPS",
    ]);
    expect(plan.phases.every((phase) => phase.evidence_required)).toBe(true);
  });
});
