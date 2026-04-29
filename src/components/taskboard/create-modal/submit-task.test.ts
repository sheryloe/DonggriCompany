import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitTaskWithProjectHandling } from "./submit-task";

const apiMocks = vi.hoisted(() => ({
  checkProjectPath: vi.fn(),
  createProject: vi.fn(),
  getProjects: vi.fn(),
  isApiRequestError: vi.fn(),
}));

const githubFlowMocks = vi.hoisted(() => ({
  createProjectWithGitHubAutomation: vi.fn(),
  isGitHubProjectCreateError: vi.fn(),
}));

vi.mock("../../../api", () => ({
  checkProjectPath: apiMocks.checkProjectPath,
  createProject: apiMocks.createProject,
  getProjects: apiMocks.getProjects,
  isApiRequestError: apiMocks.isApiRequestError,
}));

vi.mock("../../project-creation/github-project-flow", () => ({
  createProjectWithGitHubAutomation: githubFlowMocks.createProjectWithGitHubAutomation,
  isGitHubProjectCreateError: githubFlowMocks.isGitHubProjectCreateError,
}));

describe("submitTaskWithProjectHandling GitHub project flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.checkProjectPath.mockResolvedValue({
      exists: true,
      is_directory: true,
      normalized_path: "D:\\Projects\\platform",
    });
    apiMocks.getProjects.mockResolvedValue({
      projects: [],
      page: 1,
      page_size: 50,
      total: 0,
      total_pages: 1,
    });
    apiMocks.isApiRequestError.mockReturnValue(false);
    githubFlowMocks.isGitHubProjectCreateError.mockReturnValue(false);
  });

  function createContext(overrides?: Partial<Parameters<typeof submitTaskWithProjectHandling>[0]>) {
    return {
      title: "Ship v1",
      description: "Launch the platform",
      departmentId: "",
      taskType: "general" as const,
      priority: 3,
      assignAgentId: "",
      selectedGoalCommand: "",
      selectedGoalCommandPreset: null,
      projectId: "",
      projectQuery: "Platform",
      createNewProjectMode: true,
      newProjectPath: "D:\\Projects\\platform",
      githubAutoCreateEnabled: true,
      githubRepoName: "platform",
      githubRepoPrivate: true,
      selectedProject: null,
      projects: [],
      submitBusy: false,
      t: (messages: Record<"ko" | "en" | "ja" | "zh", string>) => messages.en,
      unsupportedPathApiMessage: "unsupported",
      resolvePathHelperErrorMessage: () => "error",
      onCreate: vi.fn(async () => {}),
      onClose: vi.fn(),
      selectProject: vi.fn(),
      setFormFeedback: vi.fn(),
      setSubmitWithoutProjectPromptOpen: vi.fn(),
      setSubmitBusy: vi.fn(),
      setProjectId: vi.fn(),
      setProjectQuery: vi.fn(),
      setCreateNewProjectMode: vi.fn(),
      setProjects: vi.fn(),
      setMissingPathPrompt: vi.fn(),
      setNewProjectPath: vi.fn(),
      setPathApiUnsupported: vi.fn(),
      setProjectDropdownOpen: vi.fn(),
      onRequireGitHubConnection: vi.fn(),
      ...overrides,
    };
  }

  it("creates a GitHub-backed project before creating the task", async () => {
    githubFlowMocks.createProjectWithGitHubAutomation.mockResolvedValue({
      project: {
        id: "project-1",
        name: "Platform",
        project_path: "D:\\Projects\\platform",
        core_goal: "Launch the platform",
      },
    });

    const context = createContext();

    await submitTaskWithProjectHandling(context);

    expect(githubFlowMocks.createProjectWithGitHubAutomation).toHaveBeenCalledWith({
      name: "Platform",
      coreGoal: "Launch the platform",
      projectPath: "D:\\Projects\\platform",
      createPathIfMissing: false,
      github: {
        enabled: true,
        repoName: "platform",
        private: true,
      },
    });
    expect(context.onCreate).toHaveBeenCalledWith({
      title: "Ship v1",
      description: "Launch the platform",
      department_id: undefined,
      task_type: "general",
      priority: 3,
      project_id: "project-1",
      project_path: "D:\\Projects\\platform",
      assigned_agent_id: undefined,
      workflow_pack_key: undefined,
      workflow_meta_json: undefined,
    });
    expect(context.onClose).toHaveBeenCalled();
  });

  it("opens the GitHub connection gate when auth is required", async () => {
    const githubError = {
      code: "github_connection_required",
      gateReason: "missing_repo_scope",
    };
    githubFlowMocks.createProjectWithGitHubAutomation.mockRejectedValue(githubError);
    githubFlowMocks.isGitHubProjectCreateError.mockImplementation((value) => value === githubError);

    const context = createContext();

    await submitTaskWithProjectHandling(context);

    expect(context.onRequireGitHubConnection).toHaveBeenCalledWith("missing_repo_scope", {});
    expect(context.onCreate).not.toHaveBeenCalled();
  });

  it("passes selected goal command metadata as canonical task workflow meta", async () => {
    const context = createContext({
      createNewProjectMode: false,
      projectQuery: "",
      selectedGoalCommand: "research",
      selectedGoalCommandPreset: {
        key: "research",
        slashCommand: "/dg-research",
        workflowPackKey: "web_research_report",
        teamPreset: "research_report",
        departmentId: "api-research",
        taskType: "analysis",
        priority: 3,
        requiredDepartments: ["pmo", "api-research", "knowledge-docs"],
        maxParallelWorkstreams: 2,
        verificationGates: ["sources", "findings"],
        routingTags: ["research"],
      },
    });

    await submitTaskWithProjectHandling(context, { allowWithoutProject: true });

    expect(context.onCreate).toHaveBeenCalledWith({
      title: "Ship v1",
      description: "Launch the platform",
      department_id: undefined,
      task_type: "general",
      priority: 3,
      project_id: undefined,
      project_path: undefined,
      assigned_agent_id: undefined,
      workflow_pack_key: "web_research_report",
      workflow_meta_json: {
        goal_command: "research",
        goal_command_version: "donggri_goal_commands_v1",
        team_preset: "research_report",
        route_source: "task_create_goal_chooser",
        routing_reason: "user_selected_goal",
        slash_command: "/dg-research",
        workflow_pack_key: "web_research_report",
        department_id: "api-research",
        task_type: "analysis",
        priority: 3,
        required_departments: ["pmo", "api-research", "knowledge-docs"],
        max_parallel_workstreams: 2,
        verification_gates: ["sources", "findings"],
      },
    });
  });
});
