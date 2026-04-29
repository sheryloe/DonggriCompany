import { useCallback, useEffect, useMemo, useState } from "react";
import { getGoalCommands } from "../../api";
import type { Agent, Department, GoalCommandPreset, TaskType, WorkflowPackKey } from "../../types";
import { useI18n } from "../../i18n";
import { type CreateTaskDraft, type FormFeedback } from "./constants";
import type { CreateTaskModalOverlaysProps } from "./create-modal/overlay-types";
import CreateTaskModalView from "./create-modal/CreateTaskModalView";
import { type SubmitTaskOptions, submitTaskWithProjectHandling } from "./create-modal/submit-task";
import { useDraftState } from "./create-modal/useDraftState";
import { usePathHelperMessages } from "./create-modal/usePathHelperMessages";
import { useProjectPickerState } from "./create-modal/useProjectPickerState";
import type { GitHubGateReason } from "../project-creation/github-project-flow";
import { useGitHubProjectScaffold } from "../project-creation/useGitHubProjectScaffold";

interface CreateModalProps {
  agents: Agent[];
  departments: Department[];
  onClose: () => void;
  onCreate: (input: {
    title: string;
    description?: string;
    department_id?: string;
    task_type?: string;
    priority?: number;
    project_id?: string;
    project_path?: string;
    assigned_agent_id?: string;
    workflow_pack_key?: WorkflowPackKey;
    workflow_meta_json?: Record<string, unknown> | string;
  }) => void;
  onAssign: (taskId: string, agentId: string) => void;
}

function CreateModal({ agents, departments, onClose, onCreate, onAssign }: CreateModalProps) {
  void onAssign;
  const { t, language: locale, locale: localeTag } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("general");
  const [priority, setPriority] = useState(3);
  const [assignAgentId, setAssignAgentId] = useState("");
  const [goalCommands, setGoalCommands] = useState<GoalCommandPreset[]>([]);
  const [goalCommandsLoading, setGoalCommandsLoading] = useState(false);
  const [selectedGoalCommand, setSelectedGoalCommand] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitWithoutProjectPromptOpen, setSubmitWithoutProjectPromptOpen] = useState(false);
  const [formFeedback, setFormFeedback] = useState<FormFeedback | null>(null);
  const [githubConnectReason, setGithubConnectReason] = useState<GitHubGateReason | null>(null);
  const [pendingGitHubSubmitOptions, setPendingGitHubSubmitOptions] = useState<SubmitTaskOptions | null>(null);

  const filteredAgents = useMemo(
    () => (departmentId ? agents.filter((agent) => agent.department_id === departmentId) : agents),
    [agents, departmentId],
  );
  const selectedGoalCommandPreset = useMemo(
    () => goalCommands.find((command) => command.key === selectedGoalCommand) ?? null,
    [goalCommands, selectedGoalCommand],
  );

  const { unsupportedPathApiMessage, resolvePathHelperErrorMessage } = usePathHelperMessages(t);

  const projectPicker = useProjectPickerState({
    unsupportedPathApiMessage,
    resolvePathHelperErrorMessage,
    setFormFeedback,
    setSubmitWithoutProjectPromptOpen,
  });
  const projectScaffold = useGitHubProjectScaffold({
    active: projectPicker.createNewProjectMode,
    projectName: projectPicker.projectQuery,
    onProjectPathChange: projectPicker.setNewProjectPath,
  });
  const { resetGitHubProjectScaffold } = projectScaffold;

  useEffect(() => {
    if (projectPicker.createNewProjectMode) return;
    resetGitHubProjectScaffold({ enabled: false });
  }, [projectPicker.createNewProjectMode, resetGitHubProjectScaffold]);

  useEffect(() => {
    let cancelled = false;
    setGoalCommandsLoading(true);
    getGoalCommands()
      .then((result) => {
        if (cancelled) return;
        setGoalCommands(result.commands);
      })
      .catch((error) => {
        console.error("Load goal commands failed:", error);
        if (!cancelled) setGoalCommands([]);
      })
      .finally(() => {
        if (!cancelled) setGoalCommandsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyFormStateFromDraft = useCallback(
    (draft: CreateTaskDraft) => {
      setTitle(draft.title);
      setDescription(draft.description);
      setDepartmentId(draft.departmentId);
      setTaskType(draft.taskType);
      setPriority(draft.priority);
      setAssignAgentId(draft.assignAgentId);
      setSelectedGoalCommand("");
      projectPicker.setProjectId(draft.projectId);
      projectPicker.setProjectQuery(draft.projectQuery);
      projectPicker.setCreateNewProjectMode(draft.createNewProjectMode);
      projectPicker.setNewProjectPath(draft.newProjectPath);
      projectPicker.setProjectDropdownOpen(false);
      projectPicker.setProjectActiveIndex(-1);
    },
    [projectPicker],
  );

  const {
    drafts,
    restorePromptOpen,
    setRestorePromptOpen,
    selectedRestoreDraftId,
    setSelectedRestoreDraftId,
    draftModalOpen,
    setDraftModalOpen,
    restoreCandidates,
    selectedRestoreDraft,
    formatDraftTimestamp,
    applyDraft,
    deleteDraft,
    clearDrafts,
    handleRequestClose,
  } = useDraftState({
    localeTag,
    submitBusy,
    formState: {
      title,
      description,
      departmentId,
      taskType,
      priority,
      assignAgentId,
      projectId: projectPicker.projectId,
      projectQuery: projectPicker.projectQuery,
      createNewProjectMode: projectPicker.createNewProjectMode,
      newProjectPath: projectPicker.newProjectPath,
    },
    applyFormState: applyFormStateFromDraft,
    onClose,
  });

  async function submitTask(options?: { allowCreateMissingPath?: boolean; allowWithoutProject?: boolean }) {
    await submitTaskWithProjectHandling(
      {
        title,
        description,
        departmentId,
        taskType,
        priority,
        assignAgentId,
        selectedGoalCommand,
        selectedGoalCommandPreset,
        projectId: projectPicker.projectId,
        projectQuery: projectPicker.projectQuery,
        createNewProjectMode: projectPicker.createNewProjectMode,
        newProjectPath: projectPicker.newProjectPath,
        githubAutoCreateEnabled: projectScaffold.githubAutoCreateEnabled,
        githubRepoName: projectScaffold.githubRepoName,
        githubRepoPrivate: projectScaffold.githubRepoPrivate,
        selectedProject: projectPicker.selectedProject,
        projects: projectPicker.projects,
        submitBusy,
        t,
        unsupportedPathApiMessage,
        resolvePathHelperErrorMessage,
        onCreate,
        onClose,
        selectProject: projectPicker.selectProject,
        setFormFeedback,
        setSubmitWithoutProjectPromptOpen,
        setSubmitBusy,
        setProjectId: projectPicker.setProjectId,
        setProjectQuery: projectPicker.setProjectQuery,
        setCreateNewProjectMode: projectPicker.setCreateNewProjectMode,
        setProjects: projectPicker.setProjects,
        setMissingPathPrompt: projectPicker.setMissingPathPrompt,
        setNewProjectPath: projectPicker.setNewProjectPath,
        setPathApiUnsupported: projectPicker.setPathApiUnsupported,
        setProjectDropdownOpen: projectPicker.setProjectDropdownOpen,
        onRequireGitHubConnection: (reason, nextOptions) => {
          setGithubConnectReason(reason);
          setPendingGitHubSubmitOptions(nextOptions);
        },
      },
      options,
    );
  }

  const handleGoalCommandSelect = useCallback((command: GoalCommandPreset) => {
    setSelectedGoalCommand(command.key);
    setDepartmentId(command.departmentId);
    setTaskType(command.taskType);
    setPriority(command.priority);
    setAssignAgentId("");
    setFormFeedback(null);
  }, []);

  const handleGoalCommandClear = useCallback(() => {
    setSelectedGoalCommand("");
    setFormFeedback(null);
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submitTask();
  }

  const handlePriorityChange = useCallback((nextPriority: number) => {
    setPriority(nextPriority);
    setFormFeedback(null);
  }, []);

  const handleAssignAgentChange = useCallback((agentIdValue: string) => {
    setAssignAgentId(agentIdValue);
    setFormFeedback(null);
  }, []);

  const projectSectionProps = {
    t,
    projectPickerRef: projectPicker.projectPickerRef,
    projectQuery: projectPicker.projectQuery,
    projectDropdownOpen: projectPicker.projectDropdownOpen,
    projectActiveIndex: projectPicker.projectActiveIndex,
    projectsLoading: projectPicker.projectsLoading,
    filteredProjects: projectPicker.filteredProjects,
    selectedProject: projectPicker.selectedProject,
    projects: projectPicker.projects,
    createNewProjectMode: projectPicker.createNewProjectMode,
    newProjectPath: projectPicker.newProjectPath,
    pathApiUnsupported: projectPicker.pathApiUnsupported,
    pathSuggestionsOpen: projectPicker.pathSuggestionsOpen,
    pathSuggestionsLoading: projectPicker.pathSuggestionsLoading,
    pathSuggestions: projectPicker.pathSuggestions,
    missingPathPrompt: projectPicker.missingPathPrompt,
    nativePathPicking: projectPicker.nativePathPicking,
    nativePickerUnsupported: projectPicker.nativePickerUnsupported,
    githubAutoCreateEnabled: projectScaffold.githubAutoCreateEnabled,
    githubRepoName: projectScaffold.githubRepoName,
    githubRepoPrivate: projectScaffold.githubRepoPrivate,
    defaultProjectRoot: projectScaffold.defaultProjectRoot,
    defaultProjectRootLoading: projectScaffold.defaultProjectRootLoading,
    projectPathCustomized: projectScaffold.projectPathCustomized,
    onProjectQueryChange: projectPicker.handleProjectQueryChange,
    onProjectInputFocus: () => projectPicker.setProjectDropdownOpen(true),
    onProjectInputKeyDown: projectPicker.handleProjectInputKeyDown,
    onToggleProjectDropdown: projectPicker.handleToggleProjectDropdown,
    onSelectProject: projectPicker.selectProject,
    onProjectHover: projectPicker.handleProjectHover,
    onEnableCreateNewProject: projectPicker.handleEnableCreateNewProject,
    onGitHubAutoCreateEnabledChange: (enabled: boolean) => {
      setFormFeedback(null);
      projectScaffold.setGitHubAutoCreateEnabled(enabled);
    },
    onGitHubRepoNameChange: (value: string) => {
      setFormFeedback(null);
      projectScaffold.setGitHubRepoName(value);
    },
    onGitHubRepoPrivateChange: (isPrivate: boolean) => {
      setFormFeedback(null);
      projectScaffold.setGitHubRepoPrivate(isPrivate);
    },
    onEnableProjectPathCustomization: () => {
      setFormFeedback(null);
      projectScaffold.setProjectPathCustomized(true);
    },
    onResetAutoProjectPath: () => {
      setFormFeedback(null);
      projectScaffold.setProjectPathCustomized(false);
      projectScaffold.regenerateProjectPath();
    },
    onNewProjectPathChange: (value: string) => {
      if (projectScaffold.githubAutoCreateEnabled) {
        projectScaffold.setProjectPathCustomized(true);
      }
      projectPicker.handleNewProjectPathChange(value);
    },
    onOpenManualPathBrowser: () => {
      if (projectScaffold.githubAutoCreateEnabled) {
        projectScaffold.setProjectPathCustomized(true);
      }
      projectPicker.handleOpenManualPathBrowser();
    },
    onTogglePathSuggestions: projectPicker.handleTogglePathSuggestions,
    onPickNativePath: () => {
      if (projectScaffold.githubAutoCreateEnabled) {
        projectScaffold.setProjectPathCustomized(true);
      }
      void projectPicker.handlePickNativePath();
    },
    onSelectPathSuggestion: (candidate: string) => {
      if (projectScaffold.githubAutoCreateEnabled) {
        projectScaffold.setProjectPathCustomized(true);
      }
      projectPicker.handleSelectPathSuggestion(candidate);
    },
  } as const;

  const overlaysProps: CreateTaskModalOverlaysProps = {
    t,
    localeTag,
    restorePromptOpen,
    selectedRestoreDraft,
    restoreCandidates,
    selectedRestoreDraftId,
    formatDraftTimestamp,
    submitWithoutProjectPromptOpen,
    missingPathPrompt: projectPicker.missingPathPrompt,
    submitBusy,
    manualPathPickerOpen: projectPicker.manualPathPickerOpen,
    manualPathLoading: projectPicker.manualPathLoading,
    manualPathCurrent: projectPicker.manualPathCurrent,
    manualPathParent: projectPicker.manualPathParent,
    manualPathEntries: projectPicker.manualPathEntries,
    manualPathTruncated: projectPicker.manualPathTruncated,
    manualPathError: projectPicker.manualPathError,
    githubConnectReason,
    draftModalOpen,
    drafts,
    onSelectRestoreDraft: (draftId) => setSelectedRestoreDraftId(draftId),
    onCloseRestorePrompt: () => setRestorePromptOpen(false),
    onLoadSelectedRestoreDraft: () => {
      if (!selectedRestoreDraft) return;
      applyDraft(selectedRestoreDraft);
      setRestorePromptOpen(false);
    },
    onCloseSubmitWithoutProjectPrompt: () => setSubmitWithoutProjectPromptOpen(false),
    onConfirmSubmitWithoutProject: () => {
      setSubmitWithoutProjectPromptOpen(false);
      void submitTask({ allowWithoutProject: true });
    },
    onCloseMissingPathPrompt: () => projectPicker.setMissingPathPrompt(null),
    onConfirmCreateMissingPath: () => {
      projectPicker.setMissingPathPrompt(null);
      void submitTask({ allowCreateMissingPath: true });
    },
    onCloseManualPathPicker: () => projectPicker.setManualPathPickerOpen(false),
    onManualPathGoUp: () => {
      if (!projectPicker.manualPathParent) return;
      void projectPicker.loadManualPathEntries(projectPicker.manualPathParent);
    },
    onManualPathRefresh: () => void projectPicker.loadManualPathEntries(projectPicker.manualPathCurrent || undefined),
    onOpenManualPathEntry: (entryPath) => {
      void projectPicker.loadManualPathEntries(entryPath);
    },
    onSelectManualCurrentPath: () => {
      if (!projectPicker.manualPathCurrent) return;
      if (projectScaffold.githubAutoCreateEnabled) {
        projectScaffold.setProjectPathCustomized(true);
      }
      projectPicker.setNewProjectPath(projectPicker.manualPathCurrent);
      projectPicker.setMissingPathPrompt(null);
      projectPicker.setManualPathPickerOpen(false);
    },
    onCloseGitHubConnectionPrompt: () => {
      setGithubConnectReason(null);
      setPendingGitHubSubmitOptions(null);
    },
    onGitHubConnected: () => {
      const nextOptions = pendingGitHubSubmitOptions;
      setGithubConnectReason(null);
      setPendingGitHubSubmitOptions(null);
      if (nextOptions) {
        void submitTask(nextOptions);
      }
    },
    onCloseDraftModal: () => setDraftModalOpen(false),
    onLoadDraft: (draft) => {
      applyDraft(draft);
      setDraftModalOpen(false);
    },
    onDeleteDraft: deleteDraft,
    onClearDrafts: clearDrafts,
  };

  return (
    <CreateTaskModalView
      t={t}
      locale={locale}
      createNewProjectMode={projectPicker.createNewProjectMode}
      draftsCount={drafts.length}
      title={title}
      description={description}
      departmentId={departmentId}
      taskType={taskType}
      priority={priority}
      assignAgentId={assignAgentId}
      selectedGoalCommand={selectedGoalCommand}
      goalCommands={goalCommands}
      goalCommandsLoading={goalCommandsLoading}
      submitBusy={submitBusy}
      formFeedback={formFeedback}
      departments={departments}
      filteredAgents={filteredAgents}
      projectSectionProps={projectSectionProps}
      overlaysProps={overlaysProps}
      onOpenDraftModal={() => {
        setRestorePromptOpen(false);
        setDraftModalOpen(true);
      }}
      onRequestClose={handleRequestClose}
      onSubmit={handleSubmit}
      onTitleChange={(value) => {
        setTitle(value);
        setFormFeedback(null);
      }}
      onDescriptionChange={(value) => {
        setDescription(value);
        setFormFeedback(null);
      }}
      onDepartmentChange={(value) => {
        setFormFeedback(null);
        setDepartmentId(value);
        setAssignAgentId("");
        setSelectedGoalCommand("");
      }}
      onTaskTypeChange={(value) => {
        setTaskType(value);
        setFormFeedback(null);
        setSelectedGoalCommand("");
      }}
      onPriorityChange={handlePriorityChange}
      onAssignAgentChange={handleAssignAgentChange}
      onGoalCommandSelect={handleGoalCommandSelect}
      onGoalCommandClear={handleGoalCommandClear}
    />
  );
}

export default CreateModal;
