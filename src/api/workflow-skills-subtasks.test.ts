import { beforeEach, describe, expect, it, vi } from "vitest";

import { post, request } from "./core";
import { installDonggriSkillToCodex, refreshSkills } from "./workflow-skills-subtasks";

vi.mock("./core", () => ({
  del: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  request: vi.fn(),
}));

describe("V1 Skills mutation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails catalog refresh closed without sending a fixed approval", async () => {
    await expect(refreshSkills()).rejects.toThrow("skills_refresh_requires_v2_authorization");
    expect(post).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("fails Codex skill installation closed without sending a fixed approval", async () => {
    await expect(installDonggriSkillToCodex("safe-skill")).rejects.toThrow("skill_install_requires_v2_authorization");
    expect(post).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
