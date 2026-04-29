import { describe, expect, it } from "vitest";
import { formatDelegationTrace } from "./delegation-log.ts";

describe("formatDelegationTrace", () => {
  it("prints canonical delegation tracking fields with explicit values", () => {
    const message = formatDelegationTrace({
      label: "Delegation decision",
      family: "execution",
      specialization: "video_render",
      fallbackReason: "specialization_second_subordinate",
      authorityReason: "canonical_stage=subordinate;authority_level=2",
      blockingReason: "none",
    });

    expect(message).toContain("Delegation decision");
    expect(message).toContain("family=execution");
    expect(message).toContain("specialization=video_render");
    expect(message).toContain("fallback_reason=specialization_second_subordinate");
    expect(message).toContain("authority_reason=canonical_stage=subordinate;authority_level=2");
    expect(message).toContain("blocking_reason=none");
  });

  it("fills missing values with none so the schema shape is always complete", () => {
    const message = formatDelegationTrace({
      label: "",
      family: null,
      specialization: undefined,
      fallbackReason: "",
      authorityReason: "missing_team_leader",
      blockingReason: null,
    });

    expect(message).toContain("Delegation decision");
    expect(message).toContain("family=none");
    expect(message).toContain("specialization=none");
    expect(message).toContain("fallback_reason=none");
    expect(message).toContain("authority_reason=missing_team_leader");
    expect(message).toContain("blocking_reason=none");
  });
});
