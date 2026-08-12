import { describe, expect, it } from "vitest";

import { validateCandidateComponentApproval } from "./candidate-component-approval.ts";

const identity = {
  candidate_id: "dongri-grigri-v01-alpha.2",
  git_sha: "1".repeat(40),
  source_epoch: `sha256:${"2".repeat(64)}`,
};
const candidateRoot =
  "G:\\Donggri_DevDrive\\storage\\codex-control\\quality\\dongri-grigri-v1\\candidates\\dongri-grigri-v01-alpha.2";

function ledger(overrides: Record<string, string> = {}): string {
  const fields = {
    policy_decision: "approved",
    operation_class: "candidate-component-report-generation",
    candidate_id: identity.candidate_id,
    expected_git_sha: identity.git_sha,
    source_epoch: identity.source_epoch,
    attempt_id: "alpha2-static-001",
    candidate_root: candidateRoot,
    component_allowlist: "api_and_event_schema, requirements_traceability_matrix",
    expires_at: "2026-08-01T00:00:00+09:00",
    ...overrides,
  };
  return [
    "# Approval Ledger",
    "",
    "## APR-V01-COMPONENT-EVIDENCE-001",
    "",
    ...Object.entries(fields).map(([name, value]) => `- ${name}: \`${value}\``),
    "",
  ].join("\n");
}

function validate(input: { ledger?: string; now?: string } = {}) {
  return validateCandidateComponentApproval({
    ledger: input.ledger ?? ledger(),
    approval_id: "APR-V01-COMPONENT-EVIDENCE-001",
    identity,
    component: "api_and_event_schema",
    attempt_id: "alpha2-static-001",
    candidate_root: candidateRoot,
    now: input.now ?? "2026-07-30T12:00:00+09:00",
  });
}

describe("candidate component approval", () => {
  it("accepts only one exact immutable candidate, attempt, root, and component allowlist", () => {
    expect(() => validate()).not.toThrow();
    expect(() => validate({ ledger: ledger({ expected_git_sha: "3".repeat(40) }) })).toThrow(
      "candidate_component_approval_git_sha_mismatch",
    );
    expect(() =>
      validate({
        ledger: ledger({ component_allowlist: "requirements_traceability_matrix" }),
      }),
    ).toThrow("candidate_component_approval_component_not_allowed");
  });

  it("rejects broad preparation authority and expired execution approval", () => {
    expect(() =>
      validate({
        ledger: ledger({ operation_class: "non-destructive-local-code-and-control-plane-implementation" }),
      }),
    ).toThrow("candidate_component_approval_operation_class_mismatch");
    expect(() => validate({ now: "2026-08-01T00:00:00+09:00" })).toThrow("candidate_component_approval_expired");
  });
});
