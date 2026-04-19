import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { checkProjectPath, createProject, createPrnDraft, getProjects, isApiRequestError } from "../api";
import { useI18n } from "../i18n";
import type { Agent, Message, Project, PrnDraftResponse } from "../types";
import { buildSpriteMap } from "./AgentAvatar";
import { parseDecisionRequest } from "./chat/decision-request";
import type { DecisionOption } from "./chat/decision-request";
import ChatComposer from "./chat-panel/ChatComposer";
import ChatMessageList from "./chat-panel/ChatMessageList";
import ChatPanelHeader from "./chat-panel/ChatPanelHeader";
import {
  ROLE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  type CommandPreview,
  type ChatMode,
  type PendingSendAction,
  type ProjectMetaPayload,
  type StreamingMessage,
} from "./chat-panel/model";
import PrnDraftModal from "./chat-panel/PrnDraftModal";
import ProjectFlowDialog from "./chat-panel/ProjectFlowDialog";
import { useDecisionReplyHandlers } from "./chat-panel/useDecisionReply";
import { usePathHelperMessages } from "./taskboard/create-modal/usePathHelperMessages";
import { useProjectPickerState } from "./taskboard/create-modal/useProjectPickerState";

interface ChatPanelProps {
  selectedAgent: Agent | null;
  messages: Message[];
  agents: Agent[];
  streamingMessage?: StreamingMessage | null;
  onSendMessage: (
    content: string,
    receiverType: "agent" | "department" | "all",
    receiverId?: string,
    messageType?: string,
    projectMeta?: ProjectMetaPayload,
  ) => void | Promise<void>;
  onSendAnnouncement: (content: string) => void;
  onSendDirective: (content: string, projectMeta?: ProjectMetaPayload) => void | Promise<void>;
  onClearMessages?: (agentId?: string) => void;
  onClose: () => void;
}

type ChatConversationContext = {
  project: Project | null;
  skipPlannedMeeting: boolean;
};

type ProjectOverrideResolution =
  | { kind: "resolved"; project: Project }
  | {
      kind: "prefill";
      suggestedName: string;
      suggestedPath: string;
      feedback?: { tone: "error" | "info"; message: string } | null;
    };

const GLOBAL_PROJECT_CONTEXT_KEY = "__global__";
const ALL_PROJECT_CHANNEL_ID = "__all__";

function extractPrnPrompt(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (!trimmed.toLowerCase().startsWith("/prn")) return trimmed;
  return trimmed.slice(4).trim();
}

function extractAbsoluteProjectPath(text: string): string | null {
  const candidates: string[] = [];
  for (const match of text.matchAll(/["'](([A-Za-z]:\\[^"']+)|(~?\/[^"']+))["']/g)) {
    if (match[1]) candidates.push(match[1]);
  }
  for (const match of text.matchAll(/(?:^|\s)(([A-Za-z]:\\[^\s"'`,;]+)|(~?\/[^\s"'`,;]+))/g)) {
    if (match[1]) candidates.push(match[1]);
  }
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[),.!?]+$/g, "").trim();
    if (!cleaned) continue;
    if (/^[A-Za-z]:\\/.test(cleaned) || cleaned.startsWith("/") || cleaned.startsWith("~/")) {
      return cleaned;
    }
  }
  return null;
}

function getPathBaseName(projectPath: string): string {
  const normalized = projectPath.replace(/[\\/]+$/g, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || projectPath;
}

function normalizeMatchValue(value: string): string {
  return value.trim().toLowerCase();
}

function findExactProjectMatch(projects: Project[], candidate: string): Project | null {
  const normalizedCandidate = normalizeMatchValue(candidate);
  if (!normalizedCandidate) return null;
  const matches = projects.filter((project) => {
    const projectName = normalizeMatchValue(project.name);
    const projectPath = normalizeMatchValue(project.project_path);
    const pathBase = normalizeMatchValue(getPathBaseName(project.project_path));
    return (
      projectName === normalizedCandidate || projectPath === normalizedCandidate || pathBase === normalizedCandidate
    );
  });
  return matches.length === 1 ? matches[0] : null;
}

function extractExplicitProjectNameCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 180) return null;
  const bracketed = trimmed.match(/^\[([^\]]{2,80})\]\s+/);
  if (bracketed?.[1]) return bracketed[1].trim();
  const prefixed = trimmed.match(/^([^:\n]{2,80})\s*:\s+/);
  return prefixed?.[1]?.trim() || null;
}

function buildProjectMeta(
  project: Project | null,
  options: { source?: string; skipPlannedMeeting?: boolean } = {},
): ProjectMetaPayload | undefined {
  if (!project && !options.source && !options.skipPlannedMeeting) return undefined;
  return {
    ...(project
      ? {
          project_id: project.id,
          project_path: project.project_path,
          project_context: project.core_goal,
        }
      : {}),
    ...(options.source ? { source: options.source } : {}),
    ...(options.skipPlannedMeeting ? { skipPlannedMeeting: true } : {}),
  };
}

function mergeProjectsById(projects: Project[]): Project[] {
  const seen = new Set<string>();
  const merged: Project[] = [];
  for (const project of projects) {
    if (!project?.id || seen.has(project.id)) continue;
    seen.add(project.id);
    merged.push(project);
  }
  return merged;
}

function projectTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getRecentProjectScore(project: Project): number {
  return Math.max(
    projectTimestamp(project.last_used_at),
    projectTimestamp(project.updated_at),
    projectTimestamp(project.created_at),
  );
}

export function ChatPanel({
  selectedAgent,
  messages,
  agents,
  streamingMessage,
  onSendMessage,
  onSendAnnouncement,
  onSendDirective,
  onClearMessages,
  onClose,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(selectedAgent ? "task" : "announcement");
  const [selectedProjectChannelId, setSelectedProjectChannelId] = useState<string>(ALL_PROJECT_CHANNEL_ID);
  const [conversationContexts, setConversationContexts] = useState<Record<string, ChatConversationContext>>({});
  const [pendingSend, setPendingSend] = useState<PendingSendAction | null>(null);
  const [projectFlowOpen, setProjectFlowOpen] = useState(false);
  const [projectFlowMode, setProjectFlowMode] = useState<"apply" | "send">("send");
  const [projectFlowConversationId, setProjectFlowConversationId] = useState<string | null>(null);
  const [projectFlowFeedback, setProjectFlowFeedback] = useState<{ tone: "error" | "info"; message: string } | null>(
    null,
  );
  const [projectFlowSkipMeeting, setProjectFlowSkipMeeting] = useState(false);
  const [newProjectGoal, setNewProjectGoal] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [decisionReplyKey, setDecisionReplyKey] = useState<string | null>(null);
  const [prnModalOpen, setPrnModalOpen] = useState(false);
  const [prnDraftLoading, setPrnDraftLoading] = useState(false);
  const [prnDraftError, setPrnDraftError] = useState<string | null>(null);
  const [prnDraft, setPrnDraft] = useState<PrnDraftResponse | null>(null);
  const [prnPrompt, setPrnPrompt] = useState("");
  const [prnProjectMeta, setPrnProjectMeta] = useState<ProjectMetaPayload | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const spriteMap = useMemo(() => buildSpriteMap(agents), [agents]);
  const { t, locale } = useI18n();
  const isKorean = locale.startsWith("ko");
  const tr = useCallback((ko: string, en: string, ja = en, zh = en) => t({ ko, en, ja, zh }), [t]);
  const taskboardT = useCallback((labels: { ko: string; en: string; ja?: string; zh?: string }) => t(labels), [t]);
  const { unsupportedPathApiMessage, resolvePathHelperErrorMessage } = usePathHelperMessages(taskboardT);
  const projectPicker = useProjectPickerState({
    unsupportedPathApiMessage,
    resolvePathHelperErrorMessage,
    setFormFeedback: setProjectFlowFeedback,
    setSubmitWithoutProjectPromptOpen: () => undefined,
  });
  const {
    projectId,
    setProjectId,
    projectQuery,
    setProjectQuery,
    projects,
    setProjects,
    projectsLoading,
    selectedProject,
    filteredProjects,
    createNewProjectMode,
    setCreateNewProjectMode,
    newProjectPath,
    setNewProjectPath,
    pathSuggestionsOpen,
    setPathSuggestionsOpen,
    pathSuggestionsLoading,
    pathSuggestions,
    missingPathPrompt,
    setMissingPathPrompt,
    manualPathPickerOpen,
    setManualPathPickerOpen,
    nativePathPicking,
    manualPathLoading,
    manualPathCurrent,
    manualPathParent,
    manualPathEntries,
    manualPathTruncated,
    manualPathError,
    selectProject,
    handleProjectQueryChange,
    handleEnableCreateNewProject,
    handleNewProjectPathChange,
    handleOpenManualPathBrowser,
    handleTogglePathSuggestions,
    handlePickNativePath,
    handleSelectPathSuggestion,
    loadManualPathEntries,
  } = projectPicker;
  const selectedAgentId = selectedAgent?.id ?? null;
  const currentConversationId = selectedAgentId ?? GLOBAL_PROJECT_CONTEXT_KEY;
  const currentConversationContext = conversationContexts[currentConversationId] ?? null;
  const currentProject = currentConversationContext?.project ?? null;
  const currentSkipMeeting = currentConversationContext?.skipPlannedMeeting ?? false;
  const isDirectiveMode = input.trimStart().startsWith("$");
  const isPrnCommandMode = input.trimStart().toLowerCase().startsWith("/prn");
  const isDirectivePending = pendingSend?.kind === "directive";
  const isPrnPending = pendingSend?.kind === "prn";
  const isAnnouncementMode = mode === "announcement";

  const getAgentName = useCallback(
    (agent: Agent | null | undefined) => {
      if (!agent) return "";
      return isKorean ? agent.name_ko || agent.name : agent.name || agent.name_ko;
    },
    [isKorean],
  );

  const getRoleLabel = useCallback(
    (role: string) => {
      const label = ROLE_LABELS[role];
      return label ? t(label) : role;
    },
    [t],
  );

  const getStatusLabel = useCallback(
    (status: string) => {
      const label = STATUS_LABELS[status];
      return label ? t(label) : status;
    },
    [t],
  );

  const selectedDeptName = selectedAgent?.department
    ? isKorean
      ? selectedAgent.department.name_ko || selectedAgent.department.name
      : selectedAgent.department.name || selectedAgent.department.name_ko
    : selectedAgent?.department_id;
  const selectedTaskId = selectedAgent?.current_task_id;

  const commandPreview = useMemo<CommandPreview | null>(() => {
    const trimmed = input.trimStart();
    if (!trimmed) return null;
    if (trimmed.startsWith("$")) {
      return {
        code: "directive",
        label: tr("CEO 지시", "CEO Directive"),
        description: currentProject
          ? tr(`프로젝트: ${currentProject.name}`, `Project: ${currentProject.name}`)
          : tr("프로젝트 선택 후 전달", "Select a project before sending"),
        routeLabel: "/api/directives",
      };
    }
    if (trimmed.startsWith("#")) {
      return {
        code: "task",
        label: tr("태스크 요청", "Task Request"),
        description: selectedAgent
          ? tr(`${getAgentName(selectedAgent)}에게 작업 배정`, `Assign task to ${getAgentName(selectedAgent)}`)
          : tr("프로젝트 기준 태스크 요청", "Project-scoped task request"),
        routeLabel: "/api/messages task_assign",
      };
    }
    if (trimmed.toLowerCase().startsWith("/prn")) {
      return {
        code: "prn",
        label: "PRN",
        description: tr("요구사항 초안 작성", "Draft requirements"),
        routeLabel: "/api/prn-draft",
      };
    }
    if (mode === "announcement") {
      return {
        code: "announcement",
        label: tr("공지", "Announcement"),
        description: tr("전체 채널로 전송", "Send to the company channel"),
        routeLabel: "/api/announcements",
      };
    }
    if (mode === "task" && selectedAgent) {
      return {
        code: "task",
        label: tr("작업", "Task"),
        description: tr(`${getAgentName(selectedAgent)}에게 작업 배정`, `Assign task to ${getAgentName(selectedAgent)}`),
        routeLabel: "/api/messages task_assign",
      };
    }
    if (mode === "report" && selectedAgent) {
      return {
        code: "report",
        label: tr("보고", "Report"),
        description: tr(`${getAgentName(selectedAgent)}에게 보고 요청`, `Request report from ${getAgentName(selectedAgent)}`),
        routeLabel: "/api/messages report",
      };
    }
    if (selectedAgent) {
      return {
        code: "chat",
        label: tr("대화", "Chat"),
        description: tr(`${getAgentName(selectedAgent)}에게 메시지`, `Message ${getAgentName(selectedAgent)}`),
        routeLabel: "/api/messages chat",
      };
    }
    return {
      code: "broadcast",
      label: tr("전체 메시지", "Broadcast"),
      description: tr("전체 채널로 전송", "Send to the company channel"),
      routeLabel: "/api/messages",
    };
  }, [currentProject, getAgentName, input, mode, selectedAgent, tr]);

  const updateConversationContext = useCallback(
    (
      conversationId: string | null,
      updater:
        | ChatConversationContext
        | null
        | ((current: ChatConversationContext | null) => ChatConversationContext | null),
    ) => {
      if (!conversationId) return;
      setConversationContexts((prev) => {
        const current = prev[conversationId] ?? null;
        const next = typeof updater === "function" ? updater(current) : updater;
        if (!next || (!next.project && !next.skipPlannedMeeting)) {
          const { [conversationId]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [conversationId]: next };
      });
    },
    [],
  );

  const closeProjectFlow = useCallback(() => {
    setProjectFlowOpen(false);
    setProjectFlowMode("send");
    setProjectFlowConversationId(null);
    setPendingSend(null);
    setProjectFlowFeedback(null);
    setProjectFlowSkipMeeting(false);
    setProjectSaving(false);
    setProjectId("");
    setProjectQuery("");
    setCreateNewProjectMode(false);
    setNewProjectPath("");
    setNewProjectGoal("");
    setMissingPathPrompt(null);
    setPathSuggestionsOpen(false);
    setManualPathPickerOpen(false);
    selectProject(null);
  }, [
    selectProject,
    setCreateNewProjectMode,
    setManualPathPickerOpen,
    setMissingPathPrompt,
    setNewProjectPath,
    setPathSuggestionsOpen,
    setProjectId,
    setProjectQuery,
  ]);

  const closePrnModal = useCallback(() => {
    setPrnModalOpen(false);
    setPrnDraftLoading(false);
    setPrnDraftError(null);
    setPrnDraft(null);
    setPrnPrompt("");
    setPrnProjectMeta(null);
  }, []);

  const requestPrnDraft = useCallback(
    async (prompt: string, projectMeta: ProjectMetaPayload) => {
      setPrnDraftLoading(true);
      setPrnDraftError(null);
      try {
        const draft = await createPrnDraft({
          prompt,
          project_id: projectMeta.project_id,
          project_path: projectMeta.project_path,
          project_context: projectMeta.project_context,
          language: locale,
        });
        setPrnDraft(draft);
      } catch (err) {
        console.error("Failed to create PRN draft:", err);
        setPrnDraftError(tr("PRN 초안 생성에 실패했습니다.", "Failed to create PRN draft.", "PRN 下書きの生成に失敗しました。", "PRN 草稿生成失败。"));
      } finally {
        setPrnDraftLoading(false);
      }
    },
    [locale, tr],
  );

  const dispatchPending = useCallback(
    (action: PendingSendAction, projectMeta?: ProjectMetaPayload) => {
      if (action.kind === "directive") {
        onSendDirective(action.content, projectMeta);
        return;
      }
      if (action.kind === "prn") {
        const normalizedProjectMeta = projectMeta ?? {};
        setPrnPrompt(action.content);
        setPrnProjectMeta(normalizedProjectMeta);
        setPrnDraft(null);
        setPrnModalOpen(true);
        void requestPrnDraft(action.content, normalizedProjectMeta);
        return;
      }
      if (action.kind === "announcement") {
        onSendAnnouncement(action.content);
        return;
      }
      if (action.kind === "task") {
        onSendMessage(action.content, "agent", action.receiverId, "task_assign", projectMeta);
        return;
      }
      if (action.kind === "task_request") {
        onSendMessage(action.content, "all", undefined, "task_assign", projectMeta);
        return;
      }
      if (action.kind === "report") {
        onSendMessage(action.content, "agent", action.receiverId, "report", projectMeta);
        return;
      }
      if (action.kind === "chat") {
        onSendMessage(action.content, "agent", action.receiverId, "chat", projectMeta);
        return;
      }
      onSendMessage(action.content, "all", undefined, undefined, projectMeta);
    },
    [onSendAnnouncement, onSendDirective, onSendMessage, requestPrnDraft],
  );

  const openProjectFlow = useCallback(
    (params: {
      pendingAction?: PendingSendAction | null;
      mode: "apply" | "send";
      conversationId: string | null;
      project?: Project | null;
      suggestedName?: string;
      suggestedPath?: string;
      suggestedGoal?: string;
      skipPlannedMeeting?: boolean;
      feedback?: { tone: "error" | "info"; message: string } | null;
    }) => {
      setPendingSend(params.pendingAction ?? null);
      setProjectFlowMode(params.mode);
      setProjectFlowConversationId(params.conversationId);
      setProjectFlowOpen(true);
      setProjectFlowFeedback(params.feedback ?? null);
      setProjectFlowSkipMeeting(Boolean(params.skipPlannedMeeting));
      setProjectSaving(false);

      if (params.project) {
        selectProject(params.project);
        setProjectId(params.project.id);
        setProjectQuery(params.project.name);
        setCreateNewProjectMode(false);
        setNewProjectPath(params.project.project_path);
        setNewProjectGoal(params.suggestedGoal ?? params.project.core_goal);
        return;
      }

      selectProject(null);
      setProjectId("");
      setMissingPathPrompt(null);
      setPathSuggestionsOpen(false);
      setManualPathPickerOpen(false);
      setNewProjectGoal(
        params.suggestedGoal ??
          (params.pendingAction?.kind === "directive" ||
          params.pendingAction?.kind === "prn" ||
          params.pendingAction?.kind === "task_request"
            ? params.pendingAction.content
            : ""),
      );
      if (params.suggestedName || params.suggestedPath) {
        setCreateNewProjectMode(true);
        setProjectQuery(params.suggestedName ?? "");
        setNewProjectPath(params.suggestedPath ?? "");
        return;
      }
      setCreateNewProjectMode(false);
      setProjectQuery("");
      setNewProjectPath("");
    },
    [
      selectProject,
      setCreateNewProjectMode,
      setManualPathPickerOpen,
      setMissingPathPrompt,
      setNewProjectPath,
      setPathSuggestionsOpen,
      setProjectId,
      setProjectQuery,
    ],
  );

  const resolveProjectOverride = useCallback(
    async (action: PendingSendAction): Promise<ProjectOverrideResolution | null> => {
      const pathCandidate = extractAbsoluteProjectPath(action.content);
      if (pathCandidate) {
        try {
          const response = await getProjects({ page: 1, page_size: 10, search: pathCandidate });
          const existingProject = findExactProjectMatch(response.projects, pathCandidate);
          if (existingProject) return { kind: "resolved", project: existingProject };
          const inspected = await checkProjectPath(pathCandidate);
          return {
            kind: "prefill",
            suggestedName: getPathBaseName(inspected.normalized_path),
            suggestedPath: inspected.normalized_path,
          };
        } catch (error) {
          if (isApiRequestError(error)) {
            return {
              kind: "prefill",
              suggestedName: getPathBaseName(pathCandidate),
              suggestedPath: pathCandidate,
              feedback: {
                tone: error.status >= 400 && error.status < 500 ? "info" : "error",
                message: resolvePathHelperErrorMessage(error, {
                  ko: "프로젝트 경로 확인에 실패했습니다.",
                  en: "Failed to validate the project path.",
                  ja: "Failed to validate the project path.",
                  zh: "Failed to validate the project path.",
                }),
              },
            };
          }
        }
      }

      const nameCandidate = extractExplicitProjectNameCandidate(action.content);
      if (!nameCandidate) return null;
      try {
        const response = await getProjects({ page: 1, page_size: 10, search: nameCandidate });
        const existingProject = findExactProjectMatch(response.projects, nameCandidate);
        if (existingProject) return { kind: "resolved", project: existingProject };
      } catch (error) {
        console.error("Failed to resolve project from message:", error);
      }
      return null;
    },
    [resolvePathHelperErrorMessage],
  );

  const executeAction = useCallback(
    async (action: PendingSendAction) => {
      const requiresProject =
        action.kind === "directive" ||
        action.kind === "prn" ||
        action.kind === "task" ||
        action.kind === "task_request" ||
        action.kind === "report";
      const channelProject =
        selectedProjectChannelId !== ALL_PROJECT_CHANNEL_ID
          ? (projects.find((project) => project.id === selectedProjectChannelId) ?? null)
          : null;
      if (!requiresProject) {
        dispatchPending(action, buildProjectMeta(channelProject));
        setInput("");
        textareaRef.current?.focus();
        return;
      }

      const conversationId = selectedAgentId ?? GLOBAL_PROJECT_CONTEXT_KEY;
      const context = conversationContexts[conversationId] ?? null;
      const contextProject = context?.project ?? channelProject;
      const override = await resolveProjectOverride(action);

      if (override?.kind === "resolved") {
        updateConversationContext(conversationId, {
          project: override.project,
          skipPlannedMeeting: context?.skipPlannedMeeting ?? false,
        });
        dispatchPending(
          action,
          buildProjectMeta(override.project, {
            skipPlannedMeeting:
              (action.kind === "directive" || action.kind === "prn") && Boolean(context?.skipPlannedMeeting),
          }),
        );
        setInput("");
        textareaRef.current?.focus();
        return;
      }

      if (override?.kind === "prefill") {
        openProjectFlow({
          pendingAction: action,
          mode: "send",
          conversationId,
          suggestedName: override.suggestedName,
          suggestedPath: override.suggestedPath,
          suggestedGoal:
            action.kind === "directive" || action.kind === "prn" || action.kind === "task_request"
              ? action.content
              : (context?.project?.core_goal ?? ""),
          skipPlannedMeeting: context?.skipPlannedMeeting ?? false,
          feedback: override.feedback ?? null,
        });
        return;
      }

      if (contextProject) {
        dispatchPending(
          action,
          buildProjectMeta(contextProject, {
            skipPlannedMeeting:
              (action.kind === "directive" || action.kind === "prn") && Boolean(context?.skipPlannedMeeting),
          }),
        );
        setInput("");
        textareaRef.current?.focus();
        return;
      }

      openProjectFlow({
        pendingAction: action,
        mode: "send",
        conversationId,
        skipPlannedMeeting: context?.skipPlannedMeeting ?? false,
      });
    },
    [
      conversationContexts,
      dispatchPending,
      openProjectFlow,
      projects,
      resolveProjectOverride,
      selectedProjectChannelId,
      selectedAgentId,
      updateConversationContext,
    ],
  );

  const handleConfirmProject = useCallback(() => {
    if (!selectedProject) return;
    updateConversationContext(projectFlowConversationId, {
      project: selectedProject,
      skipPlannedMeeting: projectFlowSkipMeeting,
    });
    if (pendingSend) {
      dispatchPending(
        pendingSend,
        buildProjectMeta(selectedProject, {
          skipPlannedMeeting:
            (pendingSend.kind === "directive" || pendingSend.kind === "prn") && projectFlowSkipMeeting,
        }),
      );
      setInput("");
      textareaRef.current?.focus();
    }
    closeProjectFlow();
  }, [
    closeProjectFlow,
    dispatchPending,
    pendingSend,
    projectFlowConversationId,
    projectFlowSkipMeeting,
    selectedProject,
    updateConversationContext,
  ]);

  const handleCreateProject = useCallback(async () => {
    const goal = newProjectGoal.trim();
    if (!projectQuery.trim() || !newProjectPath.trim() || !goal || projectSaving) return;
    setProjectSaving(true);
    try {
      const created = await createProject({
        name: projectQuery.trim(),
        project_path: newProjectPath.trim(),
        core_goal: goal,
        create_path_if_missing: true,
      });
      setProjects((prev) => mergeProjectsById([created, ...prev]));
      selectProject(created);
      setProjectId(created.id);
      setProjectQuery(created.name);
      setCreateNewProjectMode(false);
      setProjectFlowFeedback(null);
    } catch (error) {
      console.error("Failed to create project:", error);
      if (isApiRequestError(error) && error.code === "project_path_conflict") {
        const details =
          (error.details as {
            existing_project_id?: unknown;
            existing_project_name?: unknown;
            existing_project_path?: unknown;
          } | null) ?? null;
        const existingProjectId = typeof details?.existing_project_id === "string" ? details.existing_project_id : "";
        const existingProjectName =
          typeof details?.existing_project_name === "string" ? details.existing_project_name : projectQuery.trim();
        const existingProjectPath =
          typeof details?.existing_project_path === "string" ? details.existing_project_path : newProjectPath.trim();
        try {
          const response = await getProjects({
            page: 1,
            page_size: 10,
            search: existingProjectPath || existingProjectName,
          });
          const conflictingProject =
            response.projects.find((project) => project.id === existingProjectId) ??
            findExactProjectMatch(response.projects, existingProjectPath) ??
            findExactProjectMatch(response.projects, existingProjectName) ??
            response.projects.find((project) => project.project_path === existingProjectPath) ??
            response.projects.find((project) => project.name === existingProjectName) ??
            null;
          if (conflictingProject) {
            setProjects((prev) => mergeProjectsById([conflictingProject, ...prev]));
            selectProject(conflictingProject);
            setProjectId(conflictingProject.id);
            setProjectQuery(conflictingProject.name);
            setCreateNewProjectMode(false);
            setProjectFlowFeedback({
              tone: "info",
              message: tr(
                `경로가 이미 등록되어 '${conflictingProject.name}' 프로젝트로 전환했습니다.`,
                `Switched to '${conflictingProject.name}' because that path is already registered.`,
                `Switched to '${conflictingProject.name}' because that path is already registered.`,
                `Switched to '${conflictingProject.name}' because that path is already registered.`,
              ),
            });
            return;
          }
        } catch (lookupError) {
          console.error("Failed to load conflicting project:", lookupError);
        }
      }
      setProjectFlowFeedback({
        tone: isApiRequestError(error) && error.code === "project_path_conflict" ? "info" : "error",
        message: isApiRequestError(error)
          ? resolvePathHelperErrorMessage(error, {
              ko: "프로젝트 생성에 실패했습니다.",
              en: "Failed to create a project.",
            })
          : tr("프로젝트 생성에 실패했습니다.", "Failed to create a project.", "Failed to create a project.", "Failed to create a project."),
      });
    } finally {
      setProjectSaving(false);
    }
  }, [
    isDirectivePending,
    isPrnPending,
    newProjectGoal,
    newProjectPath,
    pendingSend?.content,
    projectQuery,
    projectSaving,
    resolvePathHelperErrorMessage,
    selectProject,
    setCreateNewProjectMode,
    setProjectId,
    setProjectQuery,
    setProjects,
    tr,
  ]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    let action: PendingSendAction;
    if (trimmed.startsWith("$")) {
      const directiveContent = trimmed.slice(1).trim();
      if (!directiveContent) return;
      action = { kind: "directive", content: directiveContent };
    } else if (trimmed.startsWith("#")) {
      const taskContent = trimmed.slice(1).trim();
      if (!taskContent) return;
      action = selectedAgent
        ? { kind: "task", content: taskContent, receiverId: selectedAgent.id }
        : { kind: "task_request", content: taskContent };
    } else if (trimmed.toLowerCase().startsWith("/prn")) {
      const prompt = extractPrnPrompt(trimmed);
      if (!prompt) return;
      action = { kind: "prn", content: prompt };
    } else if (mode === "announcement") {
      action = { kind: "announcement", content: trimmed };
    } else if (mode === "task" && selectedAgent) {
      action = { kind: "task", content: trimmed, receiverId: selectedAgent.id };
    } else if (mode === "report" && selectedAgent) {
      action = {
        kind: "report",
        content: `[${tr("보고 요청", "Report Request", "Report Request", "Report Request")}] ${trimmed}`,
        receiverId: selectedAgent.id,
      };
    } else if (selectedAgent) {
      action = { kind: "chat", content: trimmed, receiverId: selectedAgent.id };
    } else {
      action = { kind: "broadcast", content: trimmed };
    }
    await executeAction(action);
  }, [executeAction, input, mode, selectedAgent, tr]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleCreatePrn = useCallback(async () => {
    const prompt = extractPrnPrompt(input);
    if (!prompt) return;
    await executeAction({ kind: "prn", content: prompt });
  }, [executeAction, input]);

  const handleRegeneratePrn = useCallback(() => {
    if (!prnPrompt || !prnProjectMeta) return;
    void requestPrnDraft(prnPrompt, prnProjectMeta);
  }, [prnPrompt, prnProjectMeta, requestPrnDraft]);

  const handleSendPrnDirective = useCallback(() => {
    if (!prnDraft || !prnProjectMeta) return;
    onSendDirective(prnDraft.directive_text, { ...prnProjectMeta, source: "prn_ui" });
    setInput("");
    textareaRef.current?.focus();
    closePrnModal();
  }, [closePrnModal, onSendDirective, prnDraft, prnProjectMeta]);

  const handleOpenProjectContextManager = useCallback(() => {
    openProjectFlow({
      mode: "apply",
      conversationId: currentConversationId,
      project: currentProject,
      skipPlannedMeeting: currentSkipMeeting,
    });
  }, [currentConversationId, currentProject, currentSkipMeeting, openProjectFlow]);

  const handleClearProjectContext = useCallback(() => {
    updateConversationContext(currentConversationId, (current) =>
      current ? { project: null, skipPlannedMeeting: current.skipPlannedMeeting } : null,
    );
  }, [currentConversationId, updateConversationContext]);

  const handleToggleContextMeetingMode = useCallback(() => {
    updateConversationContext(currentConversationId, (current) => ({
      project: current?.project ?? null,
      skipPlannedMeeting: !current?.skipPlannedMeeting,
    }));
  }, [currentConversationId, updateConversationContext]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage?.content]);

  useEffect(() => {
    if (!selectedAgent) {
      setMode("announcement");
    } else if (mode === "announcement") {
      setMode("task");
    }
  }, [mode, selectedAgent]);

  const canCreateProject =
    Boolean(projectQuery.trim()) && Boolean(newProjectPath.trim()) && Boolean(newProjectGoal.trim());

  const contextBarVisible = Boolean(currentProject || currentSkipMeeting);

  const projectById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]));
  }, [projects]);

  const recentProjects = useMemo(() => {
    return mergeProjectsById(projects)
      .slice()
      .sort((a, b) => getRecentProjectScore(b) - getRecentProjectScore(a))
      .slice(0, 5);
  }, [projects]);

  const projectChannels = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      if (typeof message.project_id === "string" && message.project_id.trim()) {
        ids.add(message.project_id);
      }
    }
    if (currentProject?.id) ids.add(currentProject.id);
    const resolved = Array.from(ids)
      .map((projectId) => projectById.get(projectId))
      .filter((project): project is Project => Boolean(project))
      .sort((a, b) => b.updated_at - a.updated_at);
    return resolved;
  }, [messages, currentProject?.id, projectById]);

  useEffect(() => {
    if (selectedProjectChannelId === ALL_PROJECT_CHANNEL_ID) return;
    if (projectChannels.some((project) => project.id === selectedProjectChannelId)) return;
    setSelectedProjectChannelId(ALL_PROJECT_CHANNEL_ID);
  }, [projectChannels, selectedProjectChannelId]);

  const { handleDecisionOptionReply, handleDecisionManualDraft } = useDecisionReplyHandlers({
    tr,
    onSendMessage,
    setDecisionReplyKey,
    setMode,
    setInput,
    textareaRef,
  });

  const visibleMessages = useMemo(
    () =>
      messages.filter((msg) => {
        if (selectedProjectChannelId !== ALL_PROJECT_CHANNEL_ID) {
          const messageProjectId = typeof msg.project_id === "string" ? msg.project_id : null;
          if (messageProjectId !== selectedProjectChannelId) return false;
        }
        if (!selectedAgentId) {
          return msg.receiver_type === "all" || msg.message_type === "announcement" || msg.message_type === "directive";
        }
        if (selectedTaskId && msg.task_id === selectedTaskId) return true;
        return (
          (msg.sender_type === "ceo" && msg.receiver_type === "agent" && msg.receiver_id === selectedAgentId) ||
          (msg.sender_type === "agent" && msg.sender_id === selectedAgentId) ||
          msg.message_type === "announcement" ||
          msg.message_type === "directive" ||
          msg.receiver_type === "all"
        );
      }),
    [messages, selectedAgentId, selectedTaskId, selectedProjectChannelId],
  );

  const decisionRequestByMessage = useMemo(() => {
    const mapped = new Map<string, { options: DecisionOption[] }>();
    if (!selectedAgentId) return mapped;
    for (const msg of visibleMessages) {
      if (msg.sender_type !== "agent" || msg.sender_id !== selectedAgentId) continue;
      const parsed = parseDecisionRequest(msg.content);
      if (parsed) mapped.set(msg.id, parsed);
    }
    return mapped;
  }, [selectedAgentId, visibleMessages]);

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full flex-col bg-gray-900 shadow-2xl lg:relative lg:inset-auto lg:z-auto lg:w-96 lg:border-l lg:border-gray-700">
      <ChatPanelHeader
        selectedAgent={selectedAgent}
        selectedDeptName={selectedDeptName}
        spriteMap={spriteMap}
        tr={tr}
        getAgentName={getAgentName}
        getRoleLabel={getRoleLabel}
        getStatusLabel={getStatusLabel}
        statusColors={STATUS_COLORS}
        showAnnouncementBanner={isAnnouncementMode}
        visibleMessagesLength={visibleMessages.length}
        onClearMessages={onClearMessages}
        onClose={onClose}
      />

      <div className="border-b border-slate-800 bg-slate-900/70 px-4 py-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {tr("프로젝트 채널", "Project Channels", "プロジェクトチャンネル", "项目频道")}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedProjectChannelId(ALL_PROJECT_CHANNEL_ID)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
              selectedProjectChannelId === ALL_PROJECT_CHANNEL_ID
                ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-200"
                : "border-slate-700 text-slate-300 hover:border-slate-500"
            }`}
          >
            {tr("전체", "All", "All", "All")}
          </button>
          {projectChannels.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => setSelectedProjectChannelId(project.id)}
              className={`max-w-[180px] truncate rounded-full border px-2.5 py-1 text-[11px] transition ${
                selectedProjectChannelId === project.id
                  ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
              title={project.project_path}
            >
              {project.name}
            </button>
          ))}
        </div>
      </div>

      <ChatMessageList
        selectedAgent={selectedAgent}
        visibleMessages={visibleMessages}
        agents={agents}
        spriteMap={spriteMap}
        locale={locale}
        tr={tr}
        getAgentName={getAgentName}
        decisionRequestByMessage={decisionRequestByMessage}
        decisionReplyKey={decisionReplyKey}
        onDecisionOptionReply={handleDecisionOptionReply}
        onDecisionManualDraft={handleDecisionManualDraft}
        streamingMessage={streamingMessage}
        messagesEndRef={messagesEndRef}
      />

      {contextBarVisible && (
        <div className="border-t border-slate-800 bg-slate-950/80 px-4 py-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {tr("현재 대화 프로젝트", "Conversation Project", "現在の会話プロジェクト", "当前会话项目")}
                </p>
                {currentProject ? (
                  <>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{currentProject.name}</p>
                    <p className="mt-1 break-all text-[11px] text-slate-400">{currentProject.project_path}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-300">{tr("프로젝트 미선택", "No project selected", "プロジェクト未選択", "未选择项目")}</p>
                )}
              </div>
              <div className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-200">
                {currentSkipMeeting ? tr("회의 생략", "No Meeting", "会議なし", "无会议") : tr("기본 회의 정책", "Default Meeting", "既定の会議方針", "默认会议策略")}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleOpenProjectContextManager}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 hover:text-white"
              >
                {tr("프로젝트 변경", "Change Project", "プロジェクト変更", "更改项目")}
              </button>
              <button
                type="button"
                onClick={handleClearProjectContext}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 hover:text-white"
              >
                {tr("프로젝트 해제", "Clear Project", "プロジェクト解除", "清除项目")}
              </button>
              <button
                type="button"
                onClick={handleToggleContextMeetingMode}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  currentSkipMeeting
                    ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                    : "border border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {currentSkipMeeting
                  ? tr("회의 없이 실행", "Execute Without Meeting", "会議なしで実行", "无会议执行")
                  : tr("회의 모드 변경", "Change Meeting Mode", "会議モード変更", "更改会议模式")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProjectFlowDialog
        open={projectFlowOpen}
        pendingMode={projectFlowMode}
        isDirectivePending={isDirectivePending}
        isPrnPending={isPrnPending}
        pendingContent={pendingSend?.content ?? ""}
        projectQuery={projectQuery}
        projectsLoading={projectsLoading}
        recentProjects={recentProjects}
        filteredProjects={filteredProjects}
        selectedProject={selectedProject}
        createNewProjectMode={createNewProjectMode}
        newProjectPath={newProjectPath}
        newProjectGoal={newProjectGoal}
        formFeedback={projectFlowFeedback}
        pathSuggestionsOpen={pathSuggestionsOpen}
        pathSuggestionsLoading={pathSuggestionsLoading}
        pathSuggestions={pathSuggestions}
        missingPathPrompt={missingPathPrompt}
        manualPathPickerOpen={manualPathPickerOpen}
        manualPathLoading={manualPathLoading}
        manualPathCurrent={manualPathCurrent}
        manualPathParent={manualPathParent}
        manualPathEntries={manualPathEntries}
        manualPathTruncated={manualPathTruncated}
        manualPathError={manualPathError}
        nativePathPicking={nativePathPicking}
        canCreateProject={canCreateProject && !projectSaving}
        skipPlannedMeeting={projectFlowSkipMeeting}
        tr={tr}
        onClose={closeProjectFlow}
        onProjectQueryChange={handleProjectQueryChange}
        onSelectProject={selectProject}
        onEnableCreateNewProject={handleEnableCreateNewProject}
        onCancelCreateNewProject={() => {
          selectProject(null);
          setProjectId("");
          setCreateNewProjectMode(false);
          setProjectFlowFeedback(null);
        }}
        onNewProjectNameChange={(value) => {
          selectProject(null);
          setProjectId("");
          setProjectQuery(value);
        }}
        onNewProjectPathChange={handleNewProjectPathChange}
        onNewProjectGoalChange={setNewProjectGoal}
        onTogglePathSuggestions={handleTogglePathSuggestions}
        onSelectPathSuggestion={handleSelectPathSuggestion}
        onOpenManualPathBrowser={handleOpenManualPathBrowser}
        onCloseManualPathBrowser={() => setManualPathPickerOpen(false)}
        onOpenManualPathParent={() => {
          if (manualPathParent) void loadManualPathEntries(manualPathParent);
        }}
        onOpenManualPathEntry={(path) => {
          setNewProjectPath(path);
          setProjectFlowFeedback(null);
          setManualPathPickerOpen(false);
        }}
        onPickNativePath={() => {
          void handlePickNativePath();
        }}
        onCreateProject={() => {
          void handleCreateProject();
        }}
        onConfirm={handleConfirmProject}
        onToggleSkipPlannedMeeting={() => setProjectFlowSkipMeeting((prev) => !prev)}
      />

      <PrnDraftModal
        open={prnModalOpen}
        loading={prnDraftLoading}
        draft={prnDraft}
        error={prnDraftError}
        tr={tr}
        onRegenerate={handleRegeneratePrn}
        onSendDirective={handleSendPrnDirective}
        onClose={closePrnModal}
      />

      <ChatComposer
        mode={mode}
        input={input}
        selectedAgent={selectedAgent}
        isDirectiveMode={isDirectiveMode}
        isPrnCommandMode={isPrnCommandMode}
        isAnnouncementMode={isAnnouncementMode}
        commandPreview={commandPreview}
        tr={tr}
        getAgentName={getAgentName}
        textareaRef={textareaRef}
        onModeChange={setMode}
        onInputChange={setInput}
        onSend={() => {
          void handleSend();
        }}
        onCreatePrn={() => {
          void handleCreatePrn();
        }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}


