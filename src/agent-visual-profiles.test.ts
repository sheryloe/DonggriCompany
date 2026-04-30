import { describe, expect, it } from "vitest";
import { AGENT_VISUAL_PROFILES, resolveAgentVisualProfile } from "./agent-visual-profiles";
import type { Agent } from "./types";

describe("agent visual profiles", () => {
  it("provides forty canonical visual profile presets", () => {
    expect(AGENT_VISUAL_PROFILES).toHaveLength(40);
    expect(new Set(AGENT_VISUAL_PROFILES.map((profile) => profile.agent_visual_profile_key)).size).toBe(40);
    expect(
      AGENT_VISUAL_PROFILES.every((profile) => profile.sprite_profile.directions.join(",") === "front,left,back,right"),
    ).toBe(true);
  });

  it("resolves a stable profile for an agent", () => {
    const agent = {
      id: "agent-1",
      name: "Ari",
      family: "backend",
      specialization_key: "api",
      sprite_number: 3,
    } as Agent;
    const first = resolveAgentVisualProfile(agent);
    const second = resolveAgentVisualProfile(agent);
    expect(first.agent_visual_profile_key).toBe(second.agent_visual_profile_key);
    expect(first.preferred_asset_modules).toEqual(["character-image", "sprite-4dir"]);
  });
});
