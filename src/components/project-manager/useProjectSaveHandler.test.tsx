import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectSaveHandler } from "./useProjectSaveHandler";

const apiMocks = vi.hoisted(() => ({
  checkProjectPath: vi.fn(),
  createProject: vi.fn(),
  isApiRequestError: vi.fn(),
  updateProject: vi.fn(),
}));

const githubFlowMocks = vi.hoisted(() => ({
  createProjectWithGitHubAutomation: vi.fn(),
  isGitHubProjectCreateError: vi.fn(),
}));

vi.mock("../../api", () => ({
  checkProjectPath: apiMocks.checkProjectPath,
  createProject: apiMocks.createProject,
  isApiRequestError: apiMocks.isApiRequestError,
  updateProject: apiMocks.updateProject,
}));

vi.mock("../project-creation/github-project-flow", () => ({
  createProjectWithGitHubAutomation: githubFlowMocks.createProjectWithGitHubAutomation,
  isGitHubProjectCreateError: githubFlowMocks.isGitHubProjectCreateError,
}));

describe("useProjectSaveHandler GitHub gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.checkProjectPath.mockResolvedValue({
      exists: true,
      is_directory: true,
      normalized_path: "D:\\Projects\\platform",
    });
    apiMocks.isApiRequestError.mockReturnValue(false);
    githubFlowMocks.isGitHubProjectCreateError.mockReturnValue(false);
  });

  it("requests GitHub connection before saving when automation requires auth", async () => {
    const githubError = {
      code: "github_connection_required",
      gateReason: "not_connected",
    };
    githubFlowMocks.createProjectWithGitHubAutomation.mockRejectedValue(githubError);
    githubFlowMocks.isGitHubProjectCreateError.mockImplementation((value) => value === githubError);

    const onRequireGitHubConnection = vi.fn();
    const pathTools = {
      setFormFeedback: vi.fn(),
      setMissingPathPrompt: vi.fn(),
      setPathApiUnsupported: vi.fn(),
      unsupportedPathApiMessage: "unsupported",
      resolvePathHelperErrorMessage: vi.fn(() => "error"),
      resetPathHelperState: vi.fn(),
    };

    const { result } = renderHook(() =>
      useProjectSaveHandler({
        canSave: true,
        saving: false,
        setSaving: vi.fn(),
        assignmentMode: "auto",
        getManualAssignmentWarning: () => null,
        setManualAssignmentWarning: vi.fn(),
        projectPath: "D:\\Projects\\platform",
        setProjectPath: vi.fn(),
        pathTools: pathTools as any,
        editingProjectId: null,
        name: "Platform",
        coreGoal: "Ship the platform",
        selectedAgentIds: new Set(),
        githubAutoCreateEnabled: true,
        githubRepoName: "platform",
        githubRepoPrivate: true,
        onRequireGitHubConnection,
        loadProjects: vi.fn(async () => {}),
        search: "",
        setSelectedProjectId: vi.fn(),
        setEditingProjectId: vi.fn(),
        setIsCreating: vi.fn(),
        t: (messages) => messages.en,
      }),
    );

    await act(async () => {
      await result.current();
    });

    await waitFor(() => {
      expect(onRequireGitHubConnection).toHaveBeenCalledWith("not_connected", {
        allowCreateMissingPath: false,
        bypassManualWarning: false,
      });
    });
  });
});
