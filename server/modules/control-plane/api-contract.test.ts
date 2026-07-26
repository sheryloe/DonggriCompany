import { describe, expect, it } from "vitest";
import { createControlPlaneEnvelope, createControlPlaneProblem, isControlPlaneEnvelope } from "./api-contract.ts";

describe("control-plane v2 API contract", () => {
  it("wraps successful data with request and source identity", () => {
    const envelope = createControlPlaneEnvelope(
      { active_specs: ["spec-v1"] },
      { request_id: "request-001", source_epoch: "sha256:source" },
    );
    expect(envelope).toEqual({
      data: { active_specs: ["spec-v1"] },
      request_id: "request-001",
      source_epoch: "sha256:source",
    });
    expect(isControlPlaneEnvelope(envelope)).toBe(true);
    expect(isControlPlaneEnvelope({ data: {}, request_id: "", source_epoch: "epoch" })).toBe(false);
  });

  it("creates a stable Problem Details shape and rejects non-error status codes", () => {
    expect(
      createControlPlaneProblem({
        status: 409,
        code: "source_epoch_mismatch",
        title: "Source epoch mismatch",
        detail: "Refresh the projection and create a new preview.",
        request_id: "request-002",
        source_epoch: "sha256:source",
      }),
    ).toEqual({
      type: "https://donggri.local/problems/source_epoch_mismatch",
      title: "Source epoch mismatch",
      status: 409,
      detail: "Refresh the projection and create a new preview.",
      code: "source_epoch_mismatch",
      request_id: "request-002",
      source_epoch: "sha256:source",
    });
    expect(() =>
      createControlPlaneProblem({
        status: 200,
        code: "not_a_problem",
        title: "No",
        request_id: "request",
        source_epoch: "epoch",
      }),
    ).toThrow("problem_status_invalid");
  });
});
