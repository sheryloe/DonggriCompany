import type { Master95RuntimeOperationClass } from "./agent-runtime.js";

export const MASTER95_PILOT_WORK_TYPES = ["code", "document", "research", "image"] as const;
export const MASTER95_PILOT_SCENARIO_TYPES = ["normal", "failure", "cancel", "approval", "recovery"] as const;

export type Master95PilotWorkType = (typeof MASTER95_PILOT_WORK_TYPES)[number];
export type Master95PilotScenarioType = (typeof MASTER95_PILOT_SCENARIO_TYPES)[number];

export type Master95PilotScenarioPlan = {
  operation_class: Master95RuntimeOperationClass;
  expected_status: "completed" | "waiting_approval" | "failed" | "canceled";
  approvals: string[];
  target_path: string | null;
  allowed_paths: string[];
  cancel_after_step: number | null;
};

const pilotModulePath = "G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/pilot-certification.ts";
const pilotAllowedPaths = ["G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/*"];

export function createMaster95PilotScenarioPlan(
  workType: Master95PilotWorkType,
  scenario: Master95PilotScenarioType,
): Master95PilotScenarioPlan {
  const operation = scenario === "approval" ? "deploy" : operationFor(workType);
  return {
    operation_class: operation,
    expected_status:
      scenario === "failure"
        ? "failed"
        : scenario === "cancel"
          ? "canceled"
          : scenario === "approval"
            ? "waiting_approval"
            : "completed",
    approvals:
      operation === "write_repo_code"
        ? ["APR-M95-RUNTIME-ALPHA-001"]
        : operation === "write_control_plane_docs"
          ? ["APR-M95-DOCS-001"]
          : [],
    target_path: operation === "write_repo_code" ? pilotModulePath : null,
    allowed_paths: pilotAllowedPaths,
    cancel_after_step: scenario === "cancel" ? 1 : null,
  };
}

export function calculateMaster95PilotNextBatchDelay(input: {
  completed_at: string[];
  now_ms: number;
  batch_interval_ms: number;
}) {
  if (input.completed_at.length === 0) return 0;
  const lastCompletedAt = Math.max(...input.completed_at.map((value) => Date.parse(value)));
  if (!Number.isFinite(lastCompletedAt)) throw new Error("pilot_last_completed_at_invalid");
  return Math.max(0, lastCompletedAt + input.batch_interval_ms - input.now_ms);
}

function operationFor(workType: Master95PilotWorkType): Master95RuntimeOperationClass {
  if (workType === "code") return "write_repo_code";
  if (workType === "document") return "write_control_plane_docs";
  if (workType === "research") return "read_repo";
  return "runtime_preview";
}
