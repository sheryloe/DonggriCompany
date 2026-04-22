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
        class_path: {
          class_stage_1: "engineering",
          class_stage_2: "backend",
          class_stage_3: "platform",
        },
        promotion_policy: {
          from_role: "junior",
          to_role: "senior",
          auto_promote_at_xp: 300,
          team_leader_manual: true,
        },
      },
      "intern",
    );

    expect(profile.role_template).toBe("junior");
    expect(profile.growth_tier).toBe(5);
    expect(profile.capabilities.execution).toBe(5);
    expect(profile.capabilities.architecture).toBe(2);
    expect(profile.prompt_style.autonomy).toBe(5);
    expect(profile.specialties).toEqual(["backend", "prompting"]);
    expect(profile.class_path).toEqual({
      class_stage_1: "engineering",
      class_stage_2: "backend",
      class_stage_3: "platform",
    });
    expect(profile.promotion_policy).toEqual({
      auto_promote_at_xp: 300,
      team_leader_manual: true,
    });
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
        class_path: ["engineering", "backend", "platform"],
        promotion_policy: {
          auto_promote_at_xp: 300,
        },
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
    expect(preview).toContain("Class path: engineering > backend > platform");
    expect(preview).toContain("Promotion policy: @xp>=300");
    expect(preview).not.toContain("junior -> senior");
    expect(preview).toContain("Specialties: backend, orchestration");
    expect(preview).toContain("Review lenses: security, performance");
    expect(preview).toContain("Review depth: Force 2-pass");
    expect(preview).toContain("Final override: Always propose the cleanest implementation.");
  });

  it("builds a Korean prompt preview with localized canonical display labels", () => {
    const preview = buildAgentPromptPreview({
      profile: {
        ...createPresetAgentProfile("team_leader"),
        specialties: ["backend", "orchestration"],
        custom_prompt_override: "Pragmatic dev lead",
        class_path: ["engineering", "backend", "platform"],
        promotion_policy: {
          auto_promote_at_xp: 300,
          notes: "default_junior_to_senior",
        },
      },
      workflowProfile: {
        role: "reviewer",
        review_lenses: ["general"],
        two_pass_required: true,
        max_review_rounds: null,
      },
      locale: "ko",
    });

    expect(preview).toContain("역할 템플릿: 팀 리드");
    expect(preview).toContain("워크플로우 역할: 리뷰어");
    expect(preview).toContain("클래스 경로: 엔지니어링 > 백엔드 > 플랫폼");
    expect(preview).toContain("승급 정책: 300 XP 이상 자동 승급 주니어에서 시니어로 자동 승급");
    expect(preview).toContain("전문 분야: 백엔드, 오케스트레이션");
    expect(preview).toContain("리뷰 렌즈: 일반");
    expect(preview).toContain("최종 수동 지시: Pragmatic dev lead");
  });
});
