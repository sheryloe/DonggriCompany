import { beforeEach, describe, expect, it, vi } from "vitest";

const pathMocks = vi.hoisted(() => ({
  getDefaultProjectRoot: vi.fn(),
  joinProjectPath: vi.fn((root: string, leaf: string) =>
    root ? `${root.replace(/[\\/]+$/, "")}\\${leaf.replace(/^[\\/]+/, "")}` : "",
  ),
}));

vi.mock("./project-creation/github-project-flow", () => ({
  getDefaultProjectRoot: pathMocks.getDefaultProjectRoot,
  joinProjectPath: pathMocks.joinProjectPath,
}));

describe("resolveGitHubImportTargetPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the clone target from the root projected by the server", async () => {
    pathMocks.getDefaultProjectRoot.mockResolvedValue("C:\\Users\\dev\\Projects");
    const { resolveGitHubImportTargetPath } = await import("./GitHubImportPanel");

    await expect(resolveGitHubImportTargetPath("portable-repo")).resolves.toBe(
      "C:\\Users\\dev\\Projects\\portable-repo",
    );
    expect(pathMocks.joinProjectPath).toHaveBeenCalledWith("C:\\Users\\dev\\Projects", "portable-repo");
  });

  it("does not invent a local drive when the server root is unavailable", async () => {
    pathMocks.getDefaultProjectRoot.mockResolvedValue("");
    const { resolveGitHubImportTargetPath } = await import("./GitHubImportPanel");

    await expect(resolveGitHubImportTargetPath("portable-repo")).resolves.toBe("");
  });
});
