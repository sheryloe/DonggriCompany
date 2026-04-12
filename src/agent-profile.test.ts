import { describe, expect, it } from "vitest";
import {
  buildAgentPromptPreview,
  createPresetAgentProfile,
  normalizeAgentProfile,
  recommendGrowthTierFromXp,
} from "./agent-profile";

describe("agent-profile helpers", () => {
  it("creates a preset profile for the selected role", () => {
    const profile = createPresetAgentProfile("team_leader");

    expect(profile.role_template).toBe("team_leader");
    expect(profile.growth_tier).toBe(4);
    expect(profile.capabilities.leadership).toBe(5);
  });

  it("normalizes partial profile data with role defaults", () => {
    const profile = normalizeAgentProfile(
      {
        growth_tier: 5,
        capabilities: { execution: 5 },
        prompt_style: { autonomy: 5 },
        specialties: ["backend", "backend", "prompting"],
      },
      "junior",
    );

    expect(profile.role_template).toBe("junior");
    expect(profile.growth_tier).toBe(5);
    expect(profile.capabilities.execution).toBe(5);
    expect(profile.capabilities.architecture).toBe(2);
    expect(profile.prompt_style.autonomy).toBe(5);
    expect(profile.specialties).toEqual(["backend", "prompting"]);
  });

  it("maps xp to the recommended growth tier thresholds", () => {
    expect(recommendGrowthTierFromXp(0)).toBe(1);
    expect(recommendGrowthTierFromXp(100)).toBe(2);
    expect(recommendGrowthTierFromXp(250)).toBe(3);
    expect(recommendGrowthTierFromXp(500)).toBe(4);
    expect(recommendGrowthTierFromXp(900)).toBe(5);
  });

  it("builds a prompt preview with specialties, review lenses, and override", () => {
    const preview = buildAgentPromptPreview({
      profile: {
        ...createPresetAgentProfile("senior"),
        specialties: ["backend", "orchestration"],
        custom_prompt_override: "Always propose the cleanest implementation.",
      },
      workflowProfile: {
        role: "reviewer",
        review_lenses: ["security", "performance"],
        two_pass_required: true,
        max_review_rounds: null,
      },
      locale: "en",
    });

    expect(preview).toContain("Role template: Senior");
    expect(preview).toContain("2x role: Reviewer");
    expect(preview).toContain("Specialties: backend, orchestration");
    expect(preview).toContain("Review lenses: security, performance");
    expect(preview).toContain("Review depth: Force 2-pass");
    expect(preview).toContain("Final override: Always propose the cleanest implementation.");
  });
});
