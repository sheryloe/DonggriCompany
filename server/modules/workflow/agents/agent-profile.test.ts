import { describe, expect, it } from "vitest";
import {
  buildAgentPromptProfileBlock,
  createPresetAgentProfile,
  normalizeAgentProfile,
  recommendGrowthTierFromXp,
} from "./agent-profile.ts";

describe("server agent profile helpers", () => {
  it("normalizes incomplete profile payloads with role defaults", () => {
    const profile = normalizeAgentProfile(
      {
        capabilities: { execution: 5 },
        prompt_style: { autonomy: 5 },
      },
      "intern",
    );

    expect(profile.role_template).toBe("intern");
    expect(profile.capabilities.execution).toBe(5);
    expect(profile.capabilities.review).toBe(1);
    expect(profile.prompt_style.autonomy).toBe(5);
    expect(profile.prompt_style.strictness).toBe(3);
  });

  it("maps xp to the recommended tier thresholds", () => {
    expect(recommendGrowthTierFromXp(99)).toBe(1);
    expect(recommendGrowthTierFromXp(249)).toBe(2);
    expect(recommendGrowthTierFromXp(499)).toBe(3);
    expect(recommendGrowthTierFromXp(899)).toBe(4);
    expect(recommendGrowthTierFromXp(900)).toBe(5);
  });

  it("builds the runtime prompt block with workflow lenses and override", () => {
    const block = buildAgentPromptProfileBlock({
      role: "senior",
      agent_profile: {
        ...createPresetAgentProfile("senior"),
        growth_tier: 5,
        specialties: ["backend", "agent orchestration"],
        custom_prompt_override: "Escalate risk early and justify tradeoffs.",
      },
      workflow_profile: {
        role: "reviewer",
        review_lenses: ["security", "performance"],
        two_pass_required: true,
        max_review_rounds: null,
      },
    });

    expect(block).toContain("[Agent Growth Profile]");
    expect(block).toContain("Applied growth tier: 5/5");
    expect(block).toContain("2x workflow role: reviewer");
    expect(block).toContain("Specialties: backend, agent orchestration");
    expect(block).toContain("Review lenses to emphasize: security, performance");
    expect(block).toContain("Review depth: force_2_pass");
    expect(block).toContain("Custom override (highest priority): Escalate risk early and justify tradeoffs.");
  });
});
