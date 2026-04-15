import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  checkProjectPath: vi.fn(),
  browseProjectPath: vi.fn(),
  cloneGitHubRepo: vi.fn(),
  createGitHubRepo: vi.fn(),
  createProject: vi.fn(),
  deleteGitHubLocalPath: vi.fn(),
  deleteGitHubRepo: vi.fn(),
  getCloneStatus: vi.fn(),
  getGitHubStatus: vi.fn(),
  isApiRequestError: vi.fn(),
}));

vi.mock("../../api", () => ({
  checkProjectPath: apiMocks.checkProjectPath,
  browseProjectPath: apiMocks.browseProjectPath,
  cloneGitHubRepo: apiMocks.cloneGitHubRepo,
  createGitHubRepo: apiMocks.createGitHubRepo,
  createProject: apiMocks.createProject,
  deleteGitHubLocalPath: apiMocks.deleteGitHubLocalPath,
  deleteGitHubRepo: apiMocks.deleteGitHubRepo,
  getCloneStatus: apiMocks.getCloneStatus,
  getGitHubStatus: apiMocks.getGitHubStatus,
  isApiRequestError: apiMocks.isApiRequestError,
}));

describe("createProjectWithGitHubAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.checkProjectPath.mockResolvedValue({
      normalized_path: "D:\\Projects\\demo-repo",
      exists: false,
      is_directory: false,
      can_create: true,
      nearest_existing_parent: "D:\\Projects",
    });
    apiMocks.getGitHubStatus.mockResolvedValue({
      connected: true,
      has_repo_scope: true,
    });
    apiMocks.createGitHubRepo.mockResolvedValue({
      repo: {
        name: "demo-repo",
        full_name: "octocat/demo-repo",
        private: true,
        default_branch: "main",
        html_url: "https://github.com/octocat/demo-repo",
        clone_url: "https://github.com/octocat/demo-repo.git",
      },
    });
    apiMocks.deleteGitHubRepo.mockResolvedValue({ ok: true });
    apiMocks.deleteGitHubLocalPath.mockResolvedValue({
      ok: true,
      removed: true,
      target_path: "D:\\Projects\\demo-repo",
    });
    apiMocks.isApiRequestError.mockReturnValue(false);
  });

  it("rolls back remote repo and local clone when clone stage fails", async () => {
    apiMocks.cloneGitHubRepo.mockResolvedValue({
      clone_id: "clone-1",
      target_path: "D:\\Projects\\demo-repo",
    });
    apiMocks.getCloneStatus.mockResolvedValue({
      clone_id: "clone-1",
      status: "error",
      progress: 50,
      error: "clone failed",
      targetPath: "D:\\Projects\\demo-repo",
      repoFullName: "octocat/demo-repo",
    });

    const { createProjectWithGitHubAutomation, isGitHubProjectCreateError } = await import("./github-project-flow");

    await expect(
      createProjectWithGitHubAutomation({
        name: "Demo",
        coreGoal: "Ship it",
        projectPath: "D:\\Projects\\demo-repo",
        github: {
          enabled: true,
          repoName: "demo-repo",
          private: true,
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isGitHubProjectCreateError(error)).toBe(true);
      if (!isGitHubProjectCreateError(error)) {
        return false;
      }
      expect(error.stage).toBe("clone");
      expect(error.rollback).toMatchObject({
        attempted: true,
        remoteDeleteAttempted: true,
        remoteRepoDeleted: true,
        localCleanupAttempted: true,
        localPathDeleted: true,
        manualCleanupRequired: false,
      });
      return true;
    });

    expect(apiMocks.deleteGitHubRepo).toHaveBeenCalledWith("octocat", "demo-repo");
    expect(apiMocks.deleteGitHubLocalPath).toHaveBeenCalledWith("D:\\Projects\\demo-repo");
  });

  it("marks manual cleanup required when project creation state is uncertain", async () => {
    apiMocks.cloneGitHubRepo.mockResolvedValue({
      clone_id: null,
      target_path: "D:\\Projects\\demo-repo",
    });
    apiMocks.createProject.mockRejectedValue(new Error("network timeout"));

    const { createProjectWithGitHubAutomation, isGitHubProjectCreateError } = await import("./github-project-flow");

    await expect(
      createProjectWithGitHubAutomation({
        name: "Demo",
        coreGoal: "Ship it",
        projectPath: "D:\\Projects\\demo-repo",
        github: {
          enabled: true,
          repoName: "demo-repo",
          private: true,
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isGitHubProjectCreateError(error)).toBe(true);
      if (!isGitHubProjectCreateError(error)) {
        return false;
      }
      expect(error.stage).toBe("create_project");
      expect(error.rollback).toMatchObject({
        attempted: false,
        remoteDeleteAttempted: false,
        localCleanupAttempted: false,
        manualCleanupRequired: true,
      });
      return true;
    });

    expect(apiMocks.deleteGitHubRepo).not.toHaveBeenCalled();
    expect(apiMocks.deleteGitHubLocalPath).not.toHaveBeenCalled();
  });
});
