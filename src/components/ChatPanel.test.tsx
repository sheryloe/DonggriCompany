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
    onInputChange: (value: string) => void;
    onSend: () => void;
    onCreatePrn: () => void;
  }) {
    return (
      <div>
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
    filteredProjects: Project[];
    selectedProject: Project | null;
    skipPlannedMeeting: boolean;
    onSelectProject: (project: Project | null) => void;
    onToggleSkipPlannedMeeting: () => void;
    onConfirm: () => void;
  }) {
    if (!props.open) return null;
    return (
      <div data-testid="project-flow-dialog">
        <div data-testid="selected-project-id">{props.selectedProject?.id ?? ""}</div>
        <div data-testid="skip-meeting-state">{props.skipPlannedMeeting ? "skip" : "default"}</div>
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

    fireEvent.click(screen.getByRole("button", { name: /change meeting mode/i }));
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
});
