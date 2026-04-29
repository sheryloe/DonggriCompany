import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import type { Agent, Message, Project } from "../types";
import { ChatPanel } from "./ChatPanel";

const uiMockState = vi.hoisted(() => ({
  projects: [] as Project[],
}));

const apiMocks = vi.hoisted(() => ({
  browseProjectPath: vi.fn(),
  checkProjectPath: vi.fn(),
  createProject: vi.fn(),
  createPrnDraft: vi.fn(),
  getProjectPathSuggestions: vi.fn(),
  getProjects: vi.fn(),
  isApiRequestError: vi.fn(),
  pickProjectPathNative: vi.fn(),
}));

const githubFlowMocks = vi.hoisted(() => ({
  createProjectWithGitHubAutomation: vi.fn(),
  isGitHubProjectCreateError: vi.fn(),
  getDefaultProjectRoot: vi.fn(),
}));

vi.mock("../api", () => ({
  browseProjectPath: apiMocks.browseProjectPath,
  checkProjectPath: apiMocks.checkProjectPath,
  createProject: apiMocks.createProject,
  createPrnDraft: apiMocks.createPrnDraft,
  getProjectPathSuggestions: apiMocks.getProjectPathSuggestions,
  getProjects: apiMocks.getProjects,
  isApiRequestError: apiMocks.isApiRequestError,
  pickProjectPathNative: apiMocks.pickProjectPathNative,
}));

vi.mock("./project-creation/github-project-flow", () => ({
  createProjectWithGitHubAutomation: githubFlowMocks.createProjectWithGitHubAutomation,
  isGitHubProjectCreateError: githubFlowMocks.isGitHubProjectCreateError,
  getDefaultProjectRoot: githubFlowMocks.getDefaultProjectRoot,
  slugifyRepositoryName: (value: string) => {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 100);
    return slug || "new-repo";
  },
  joinProjectPath: (root: string, leaf: string) => `${root.replace(/[\\/]+$/, "")}\\${leaf.replace(/^[\\/]+/, "")}`,
}));

vi.mock("./project-creation/GitHubConnectionDialog", () => ({
  default: function MockGitHubConnectionDialog(props: { onConnected: () => void; onCancel: () => void }) {
    return (
      <div data-testid="github-connection-dialog">
        <button type="button" onClick={props.onConnected}>
          github-connected
        </button>
        <button type="button" onClick={props.onCancel}>
          github-cancel
        </button>
      </div>
    );
  },
}));

vi.mock("./taskboard/create-modal/usePathHelperMessages", () => ({
  usePathHelperMessages: () => ({
    unsupportedPathApiMessage: "unsupported",
    resolvePathHelperErrorMessage: () => "path helper error",
  }),
}));

vi.mock("./taskboard/create-modal/useProjectPickerState", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useProjectPickerState: () => {
      const [projectId, setProjectId] = React.useState("");
      const [projectQuery, setProjectQuery] = React.useState("");
      const [projects, setProjects] = React.useState<Project[]>(uiMockState.projects);
      const [createNewProjectMode, setCreateNewProjectMode] = React.useState(false);
      const [newProjectPath, setNewProjectPath] = React.useState("");
      const [pathSuggestionsOpen, setPathSuggestionsOpen] = React.useState(false);
      const [missingPathPrompt, setMissingPathPrompt] = React.useState(null);
      const [manualPathPickerOpen, setManualPathPickerOpen] = React.useState(false);
      const selectedProject = React.useMemo(
        () => projects.find((project) => project.id === projectId) ?? null,
        [projectId, projects],
      );
      const filteredProjects = React.useMemo(() => {
        const query = projectQuery.trim().toLowerCase();
        if (!query) return projects;
        return projects.filter(
          (project) =>
            project.name.toLowerCase().includes(query) ||
            project.project_path.toLowerCase().includes(query) ||
            project.core_goal.toLowerCase().includes(query),
        );
      }, [projectQuery, projects]);
      const selectProject = (project: Project | null) => {
        if (!project) {
          setProjectId("");
          setProjectQuery("");
          return;
        }
        setProjectId(project.id);
        setProjectQuery(project.name);
        setCreateNewProjectMode(false);
      };

      return {
        projectId,
        setProjectId,
        projectQuery,
        setProjectQuery,
        projects,
        setProjects,
        projectsLoading: false,
        selectedProject,
        filteredProjects,
        createNewProjectMode,
        setCreateNewProjectMode,
        newProjectPath,
        setNewProjectPath,
        pathSuggestionsOpen,
        setPathSuggestionsOpen,
        pathSuggestionsLoading: false,
        pathSuggestions: [],
        missingPathPrompt,
        setMissingPathPrompt,
        manualPathPickerOpen,
        setManualPathPickerOpen,
        nativePathPicking: false,
        manualPathLoading: false,
        manualPathCurrent: "D:\\Projects",
        manualPathParent: "D:\\",
        manualPathEntries: [],
        manualPathTruncated: false,
        manualPathError: null,
        selectProject,
        handleProjectQueryChange: (value: string) => {
          setProjectId("");
          setProjectQuery(value);
        },
        handleEnableCreateNewProject: () => setCreateNewProjectMode(true),
        handleNewProjectPathChange: (value: string) => setNewProjectPath(value),
        handleOpenManualPathBrowser: () => setManualPathPickerOpen(true),
        handleTogglePathSuggestions: () => setPathSuggestionsOpen((prev: boolean) => !prev),
        handlePickNativePath: async () => undefined,
        handleSelectPathSuggestion: (path: string) => {
          setNewProjectPath(path);
          setPathSuggestionsOpen(false);
        },
        loadManualPathEntries: async () => undefined,
      };
    },
  };
});

vi.mock("./chat-panel/ChatPanelHeader", () => ({
  default: function MockChatPanelHeader() {
    return <div data-testid="chat-panel-header" />;
  },
}));

vi.mock("./chat-panel/ChatMessageList", () => ({
  default: function MockChatMessageList() {
    return <div data-testid="chat-message-list" />;
  },
}));

vi.mock("./chat-panel/PrnDraftModal", () => ({
  default: function MockPrnDraftModal() {
    return null;
  },
}));

vi.mock("./chat-panel/ChatComposer", () => ({
  default: function MockChatComposer(props: {
    input: string;
    commandPreview: { label: string; description: string; routeLabel: string } | null;
    onInputChange: (value: string) => void;
    onSend: () => void;
    onCreatePrn: () => void;
  }) {
    return (
      <div>
        {props.commandPreview ? (
          <div data-testid="command-preview">
            {props.commandPreview.label} {props.commandPreview.description} {props.commandPreview.routeLabel}
          </div>
        ) : null}
        <textarea
          aria-label="chat-input"
          value={props.input}
          onChange={(event) => props.onInputChange(event.target.value)}
        />
        <button type="button" onClick={props.onSend}>
          send
        </button>
        <button type="button" onClick={props.onCreatePrn}>
          prn
        </button>
      </div>
    );
  },
}));

vi.mock("./chat-panel/ProjectFlowDialog", () => ({
  default: function MockProjectFlowDialog(props: {
    open: boolean;
    recentProjects: Project[];
    filteredProjects: Project[];
    selectedProject: Project | null;
    createNewProjectMode: boolean;
    projectQuery: string;
    newProjectPath: string;
    newProjectGoal: string;
    githubAutoCreateEnabled: boolean;
    githubRepoName: string;
    githubRepoPrivate: boolean;
    canCreateProject: boolean;
    skipPlannedMeeting: boolean;
    onSelectProject: (project: Project | null) => void;
    onEnableCreateNewProject: () => void;
    onCancelCreateNewProject: () => void;
    onNewProjectNameChange: (value: string) => void;
    onNewProjectPathChange: (value: string) => void;
    onNewProjectGoalChange: (value: string) => void;
    onGitHubAutoCreateEnabledChange: (enabled: boolean) => void;
    onGitHubRepoNameChange: (value: string) => void;
    onGitHubRepoPrivateChange: (value: boolean) => void;
    onCreateProject: () => void;
    onToggleSkipPlannedMeeting: () => void;
    onConfirm: () => void;
  }) {
    if (!props.open) return null;
    return (
      <div data-testid="project-flow-dialog">
        <div data-testid="selected-project-id">{props.selectedProject?.id ?? ""}</div>
        <div data-testid="skip-meeting-state">{props.skipPlannedMeeting ? "skip" : "default"}</div>
        <div data-testid="create-new-project-mode">{props.createNewProjectMode ? "create" : "select"}</div>
        <div data-testid="github-create-state">
          {props.githubAutoCreateEnabled ? "github-on" : "github-off"}:{props.githubRepoName}:
          {props.githubRepoPrivate ? "private" : "public"}
        </div>
        <div data-testid="recent-projects">
          {props.recentProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              aria-label={`quick-project-${project.name}`}
              onClick={() => props.onSelectProject(project)}
            >
              {project.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => props.onSelectProject(props.filteredProjects[0] ?? null)}
          disabled={props.filteredProjects.length === 0}
        >
          select-first-project
        </button>
        <button type="button" onClick={props.onToggleSkipPlannedMeeting}>
          toggle-skip-meeting
        </button>
        <button type="button" onClick={props.onEnableCreateNewProject}>
          enable-create-new-project
        </button>
        <button type="button" onClick={() => props.onCancelCreateNewProject()}>
          cancel-create-new-project
        </button>
        <button type="button" onClick={() => props.onNewProjectNameChange("New Repo Project")}>
          set-project-name
        </button>
        <button type="button" onClick={() => props.onNewProjectPathChange("D:\\Projects\\new-repo-project")}>
          set-project-path
        </button>
        <button type="button" onClick={() => props.onNewProjectGoalChange("Create a GitHub backed project")}>
          set-project-goal
        </button>
        <button type="button" onClick={() => props.onGitHubAutoCreateEnabledChange(true)}>
          enable-github-create
        </button>
        <button type="button" onClick={() => props.onGitHubRepoNameChange("new-repo-project")}>
          set-github-repo-name
        </button>
        <button type="button" onClick={() => props.onGitHubRepoPrivateChange(false)}>
          set-github-public
        </button>
        <button type="button" onClick={props.onCreateProject} disabled={!props.canCreateProject}>
          create-project
        </button>
        <button type="button" onClick={props.onConfirm}>
          confirm-project
        </button>
      </div>
    );
  },
}));

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Planner",
    name_ko: "플래너",
    department_id: "planning",
    role: "team_leader",
    cli_provider: "codex",
    avatar_emoji: "P",
    personality: null,
    status: "idle",
    current_task_id: null,
    stats_tasks_done: 0,
    stats_xp: 0,
    created_at: 1,
    ...overrides,
  };
}

function renderChatPanel(options: {
  selectedAgent?: Agent | null;
  messages?: Message[];
  agents?: Agent[];
  onSendDirective?: ReturnType<typeof vi.fn>;
}) {
  const selectedAgent = Object.prototype.hasOwnProperty.call(options, "selectedAgent")
    ? (options.selectedAgent ?? null)
    : createAgent();
  const onSendDirective = options.onSendDirective ?? vi.fn();
  const onSendMessage = vi.fn();
  const onSendAnnouncement = vi.fn();

  render(
    <I18nProvider language="en">
      <ChatPanel
        selectedAgent={selectedAgent}
        messages={options.messages ?? []}
        agents={options.agents ?? ([selectedAgent].filter(Boolean) as Agent[])}
        onSendMessage={onSendMessage}
        onSendAnnouncement={onSendAnnouncement}
        onSendDirective={onSendDirective}
        onClose={vi.fn()}
      />
    </I18nProvider>,
  );

  return { onSendDirective, onSendMessage, onSendAnnouncement };
}

describe("ChatPanel directive project context", () => {
  const existingProject: Project = {
    id: "project-1",
    name: "Empire",
    project_path: "D:\\Projects\\Empire",
    core_goal: "Build Empire Claw",
    assignment_mode: "auto",
    last_used_at: null,
    created_at: 1,
    updated_at: 1,
  };
  const recentProject: Project = {
    id: "project-2",
    name: "Recent Forge",
    project_path: "D:\\Projects\\RecentForge",
    core_goal: "Ship the recent project",
    assignment_mode: "auto",
    last_used_at: 30,
    created_at: 2,
    updated_at: 20,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    uiMockState.projects = [existingProject];
    apiMocks.getProjects.mockResolvedValue({
      projects: [existingProject],
      page: 1,
      page_size: 30,
      total: 1,
      total_pages: 1,
    });
    apiMocks.getProjectPathSuggestions.mockResolvedValue([]);
    apiMocks.browseProjectPath.mockResolvedValue({
      current_path: "D:\\Projects",
      parent_path: "D:\\",
      entries: [],
      truncated: false,
    });
    apiMocks.pickProjectPathNative.mockResolvedValue({ cancelled: true, path: null });
    apiMocks.createProject.mockResolvedValue(existingProject);
    githubFlowMocks.getDefaultProjectRoot.mockResolvedValue("D:\\Projects");
    githubFlowMocks.createProjectWithGitHubAutomation.mockResolvedValue({
      project: existingProject,
      remoteRepo: null,
      projectPath: existingProject.project_path,
    });
    githubFlowMocks.isGitHubProjectCreateError.mockReturnValue(false);
    apiMocks.createPrnDraft.mockResolvedValue({
      sections: {
        background: "",
        goal: "",
        non_goal: "",
        requirements: "",
        acceptance_criteria: "",
        risks: "",
        open_questions: "",
      },
      directive_text: "",
      confidence: 0.9,
      generation_meta: {
        fallback_used: false,
        parser_error: null,
        planner_agent_id: null,
        planner_agent_name: null,
        source: "fallback",
        pass1: "",
        pass2: "",
      },
    });
    apiMocks.isApiRequestError.mockReturnValue(false);
    apiMocks.checkProjectPath.mockResolvedValue({
      normalized_path: "D:\\Projects\\Empire",
      exists: true,
      is_directory: true,
      can_create: true,
      nearest_existing_parent: "D:\\Projects",
      allowed_roots: ["D:\\Projects"],
    });
  });

  it("reuses the selected project for the next directive without reopening the picker", async () => {
    const { onSendDirective } = renderChatPanel({});

    fireEvent.change(screen.getByLabelText("chat-input"), { target: { value: "$first directive" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(screen.getByTestId("project-flow-dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "select-first-project" }));
    fireEvent.click(screen.getByRole("button", { name: "confirm-project" }));

    await waitFor(() => {
      expect(onSendDirective).toHaveBeenCalledWith("first directive", {
        project_id: "project-1",
        project_path: "D:\\Projects\\Empire",
        project_context: "Build Empire Claw",
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("project-flow-dialog")).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("chat-input"), { target: { value: "$second directive" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(onSendDirective).toHaveBeenNthCalledWith(2, "second directive", {
        project_id: "project-1",
        project_path: "D:\\Projects\\Empire",
        project_context: "Build Empire Claw",
      });
    });

    expect(screen.queryByTestId("project-flow-dialog")).not.toBeInTheDocument();
  });

  it("offers recent projects as quick selections and persists the selected context", async () => {
    uiMockState.projects = [existingProject, recentProject];
    const { onSendDirective } = renderChatPanel({});

    fireEvent.change(screen.getByLabelText("chat-input"), { target: { value: "$use recent context" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(screen.getByTestId("project-flow-dialog")).toBeInTheDocument();
    });

    const recentButtons = screen.getByTestId("recent-projects").querySelectorAll("button");
    expect(Array.from(recentButtons).map((button) => button.textContent)).toEqual(["Recent Forge", "Empire"]);

    fireEvent.click(screen.getByRole("button", { name: "quick-project-Recent Forge" }));
    fireEvent.click(screen.getByRole("button", { name: "confirm-project" }));

    await waitFor(() => {
      expect(onSendDirective).toHaveBeenCalledWith("use recent context", {
        project_id: "project-2",
        project_path: "D:\\Projects\\RecentForge",
        project_context: "Ship the recent project",
      });
    });

    fireEvent.change(screen.getByLabelText("chat-input"), { target: { value: "$reuse recent context" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(onSendDirective).toHaveBeenNthCalledWith(2, "reuse recent context", {
        project_id: "project-2",
        project_path: "D:\\Projects\\RecentForge",
        project_context: "Ship the recent project",
      });
    });

    expect(screen.queryByTestId("project-flow-dialog")).not.toBeInTheDocument();
  });

  it("creates a GitHub-backed project from the project picker before sending a directive", async () => {
    const githubProject: Project = {
      ...existingProject,
      id: "project-3",
      name: "New Repo Project",
      project_path: "D:\\Projects\\new-repo-project",
      core_goal: "Create a GitHub backed project",
    };
    githubFlowMocks.createProjectWithGitHubAutomation.mockResolvedValue({
      project: githubProject,
      remoteRepo: {
        id: 123,
        name: "new-repo-project",
        full_name: "octocat/new-repo-project",
        html_url: "https://github.com/octocat/new-repo-project",
        private: false,
        default_branch: "main",
      },
      projectPath: "D:\\Projects\\new-repo-project",
    });
    const { onSendDirective } = renderChatPanel({});

    fireEvent.change(screen.getByLabelText("chat-input"), { target: { value: "$create repo-backed project" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(screen.getByTestId("project-flow-dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "enable-create-new-project" }));
    fireEvent.click(screen.getByRole("button", { name: "set-project-name" }));
    fireEvent.click(screen.getByRole("button", { name: "set-project-goal" }));
    fireEvent.click(screen.getByRole("button", { name: "enable-github-create" }));
    fireEvent.click(screen.getByRole("button", { name: "set-github-repo-name" }));
    fireEvent.click(screen.getByRole("button", { name: "set-github-public" }));
    fireEvent.click(screen.getByRole("button", { name: "set-project-path" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "create-project" })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "create-project" }));

    await waitFor(() => {
      expect(githubFlowMocks.createProjectWithGitHubAutomation).toHaveBeenCalledWith({
        name: "New Repo Project",
        projectPath: "D:\\Projects\\new-repo-project",
        coreGoal: "Create a GitHub backed project",
        createPathIfMissing: true,
        github: {
          enabled: true,
          repoName: "new-repo-project",
          private: false,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("selected-project-id")).toHaveTextContent("project-3");
    });
    fireEvent.click(screen.getByRole("button", { name: "confirm-project" }));

    await waitFor(() => {
      expect(onSendDirective).toHaveBeenCalledWith("create repo-backed project", {
        project_id: "project-3",
        project_path: "D:\\Projects\\new-repo-project",
        project_context: "Create a GitHub backed project",
      });
    });
  });

  it("forwards skipPlannedMeeting only when the meeting mode is toggled off", async () => {
    const { onSendDirective } = renderChatPanel({});

    fireEvent.change(screen.getByLabelText("chat-input"), { target: { value: "$seed directive" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(screen.getByTestId("project-flow-dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "select-first-project" }));
    fireEvent.click(screen.getByRole("button", { name: "confirm-project" }));

    await waitFor(() => {
      expect(onSendDirective).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "회의 모드 변경" }));
    fireEvent.change(screen.getByLabelText("chat-input"), { target: { value: "$ship without meeting" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(onSendDirective).toHaveBeenNthCalledWith(2, "ship without meeting", {
        project_id: "project-1",
        project_path: "D:\\Projects\\Empire",
        project_context: "Build Empire Claw",
        skipPlannedMeeting: true,
      });
    });
  });

  it("reuses the global directive project context when no agent is selected", async () => {
    const { onSendDirective } = renderChatPanel({ selectedAgent: null, agents: [] });

    fireEvent.change(screen.getByLabelText("chat-input"), { target: { value: "$global directive one" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(screen.getByTestId("project-flow-dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "select-first-project" }));
    fireEvent.click(screen.getByRole("button", { name: "confirm-project" }));

    await waitFor(() => {
      expect(onSendDirective).toHaveBeenNthCalledWith(1, "global directive one", {
        project_id: "project-1",
        project_path: "D:\\Projects\\Empire",
        project_context: "Build Empire Claw",
      });
    });

    fireEvent.change(screen.getByLabelText("chat-input"), { target: { value: "$global directive two" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(onSendDirective).toHaveBeenNthCalledWith(2, "global directive two", {
        project_id: "project-1",
        project_path: "D:\\Projects\\Empire",
        project_context: "Build Empire Claw",
      });
    });

    expect(screen.queryByTestId("project-flow-dialog")).not.toBeInTheDocument();
  });

  it("previews hash-prefixed task requests and dispatches them as project-bound task assignments", async () => {
    const { onSendMessage } = renderChatPanel({});

    fireEvent.change(screen.getByLabelText("chat-input"), { target: { value: "#fix the build" } });

    expect(screen.getByTestId("command-preview")).toHaveTextContent("태스크 요청");
    expect(screen.getByTestId("command-preview")).toHaveTextContent("/api/messages task_assign");

    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(screen.getByTestId("project-flow-dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "select-first-project" }));
    fireEvent.click(screen.getByRole("button", { name: "confirm-project" }));

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith("fix the build", "agent", "agent-1", "task_assign", {
        project_id: "project-1",
        project_path: "D:\\Projects\\Empire",
        project_context: "Build Empire Claw",
      });
    });
  });
});
