import { useState, useRef, useMemo, useCallback } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import type {
  Department,
  Agent,
  Task,
  Message,
  CompanyStats,
  CompanySettings,
  CliStatusMap,
  SubTask,
  MeetingPresence,
  SubAgent,
  CrossDeptDelivery,
  CeoOfficeCall,
  OfficePackProfile,
  RoomTheme,
  WorkflowPackKey,
} from "./types";
import type { TaskReportDetail } from "./api";
import * as api from "./api";
import { createPresetAgentProfile } from "./agent-profile";
import { detectBrowserLanguage, normalizeLanguage } from "./i18n";
import { useTheme } from "./ThemeContext";
import { ROOM_THEMES_STORAGE_KEY, UPDATE_BANNER_DISMISS_STORAGE_KEY } from "./app/constants";
import {
  detectRuntimeOs,
  isForceUpdateBannerEnabled,
  mergeSettingsWithDefaults,
  readStoredRoomThemes,
} from "./app/utils";
import type { OAuthCallbackResult, RuntimeOs, RoomThemeMap, View } from "./app/types";
import { useRealtimeSync } from "./app/useRealtimeSync";
import { useAppLabels } from "./app/useAppLabels";
import AppLoadingScreen from "./app/AppLoadingScreen";
import AppMainLayout from "./app/AppMainLayout";
import AppOverlays from "./app/AppOverlays";
import { useAppActions } from "./app/useAppActions";
import { useActiveMeetingTaskId } from "./app/useActiveMeetingTaskId";
import { useUpdateStatusPolling } from "./app/useUpdateStatusPolling";
import { useAppViewEffects } from "./app/useAppViewEffects";
import { useAppBootstrapData } from "./app/useAppBootstrapData";
import { useLiveSyncScheduler } from "./app/useLiveSyncScheduler";
import { useAppOverlayState } from "./app/useAppOverlayState";
import { resolvePackAgentViews, resolvePackDepartmentsForDisplay } from "./app/office-pack-display";
import { normalizeOfficeWorkflowPack } from "./app/office-workflow-pack";

export type { OAuthCallbackResult } from "./app/types";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const initialRoomThemes = useMemo(() => readStoredRoomThemes(), []);
  const hasLocalRoomThemesRef = useRef<boolean>(initialRoomThemes.hasStored);

  const [view, setView] = useState<View>("manual");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [settings, setSettings] = useState<CompanySettings>(() =>
    mergeSettingsWithDefaults({ language: detectBrowserLanguage() }),
  );
  const [cliStatus, setCliStatus] = useState<CliStatusMap | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);

  const [loading, setLoading] = useState(true);
  const [unreadAgentIds, setUnreadAgentIds] = useState<Set<string>>(new Set());
  const [crossDeptDeliveries, setCrossDeptDeliveries] = useState<CrossDeptDelivery[]>([]);
  const [ceoOfficeCalls, setCeoOfficeCalls] = useState<CeoOfficeCall[]>([]);
  const [meetingPresence, setMeetingPresence] = useState<MeetingPresence[]>([]);
  const [oauthResult, setOauthResult] = useState<OAuthCallbackResult | null>(null);
  const [taskReport, setTaskReport] = useState<TaskReportDetail | null>(null);
  const [customRoomThemes, setCustomRoomThemes] = useState<RoomThemeMap>(() => initialRoomThemes.themes);
  const {
    selectedAgent,
    setSelectedAgent,
    chatAgent,
    setChatAgent,
    showChat,
    setShowChat,
    taskPanel,
    setTaskPanel,
    showReportHistory,
    setShowReportHistory,
    showAgentStatus,
    setShowAgentStatus,
    showRoomManager,
    setShowRoomManager,
    showDecisionInbox,
    setShowDecisionInbox,
    decisionInboxLoading,
    setDecisionInboxLoading,
    decisionInboxItems,
    setDecisionInboxItems,
    decisionReplyBusyKey,
    setDecisionReplyBusyKey,
    activeRoomThemeTargetId,
    setActiveRoomThemeTargetId,
    activeDepartmentComponentId,
    setActiveDepartmentComponentId,
    mobileNavOpen,
    setMobileNavOpen,
    mobileHeaderMenuOpen,
    setMobileHeaderMenuOpen,
  } = useAppOverlayState();
  const [officePackBootstrappingLabel, setOfficePackBootstrappingLabel] = useState<string | null>(null);
  const [runtimeOs] = useState<RuntimeOs>(() => detectRuntimeOs());
  const [forceUpdateBanner] = useState<boolean>(() => isForceUpdateBannerEnabled());
  const [updateStatus, setUpdateStatus] = useState<api.UpdateStatus | null>(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(UPDATE_BANNER_DISMISS_STORAGE_KEY) ?? "";
  });
  const [streamingMessage, setStreamingMessage] = useState<{
    message_id: string;
    agent_id: string;
    agent_name: string;
    agent_avatar: string;
    content: string;
  } | null>(null);

  const viewRef = useRef<View>("manual");
  viewRef.current = view;
  const agentsRef = useRef<Agent[]>(agents);
  agentsRef.current = agents;
  const tasksRef = useRef<Task[]>(tasks);
  tasksRef.current = tasks;
  const subAgentsRef = useRef<SubAgent[]>(subAgents);
  subAgentsRef.current = subAgents;
  const codexThreadToSubAgentIdRef = useRef<Map<string, string>>(new Map());
  const codexThreadBindingTsRef = useRef<Map<string, number>>(new Map());
  const subAgentStreamTailRef = useRef<Map<string, string>>(new Map());
  const activeChatRef = useRef<{ showChat: boolean; agentId: string | null }>({ showChat: false, agentId: null });
  activeChatRef.current = { showChat, agentId: chatAgent?.id ?? null };
  const officePackBootstrapReqRef = useRef(0);

  const handleOfficeWorkflowPackChange = (packKey: WorkflowPackKey) => {
    const previousPack = settings.officeWorkflowPack ?? "development";
    const patchPayload: Record<string, unknown> = { officeWorkflowPack: packKey };
    const reqId = ++officePackBootstrapReqRef.current;
    setOfficePackBootstrappingLabel(null);
    setSettings((prev) => ({
      ...prev,
      officeWorkflowPack: packKey,
    }));
    api
      .saveSettingsPatch(patchPayload)
      .then(async () => {
        const [nextDepartments, nextAgents, nextSettingsRaw] = await Promise.all([
          api.getDepartments({ workflowPackKey: packKey }),
          api.getAgents(),
          api.getSettings(),
        ]);
        setDepartments(nextDepartments);
        setAgents(nextAgents);
        setSettings(mergeSettingsWithDefaults(nextSettingsRaw));
        const clearNotice = () => {
          if (officePackBootstrapReqRef.current !== reqId) return;
          setOfficePackBootstrappingLabel(null);
        };
        clearNotice();
      })
      .catch((error) => {
        console.error("Save office workflow pack failed:", error);
        if (officePackBootstrapReqRef.current === reqId) {
          setOfficePackBootstrappingLabel(null);
        }
        setSettings((prev) =>
          prev.officeWorkflowPack === packKey
            ? {
                ...prev,
                officeWorkflowPack: previousPack,
              }
            : prev,
        );
      });
  };

  const { connected, on } = useWebSocket();
  const shouldIncludeSeedAgents = useCallback(() => false, []);
  const scheduleLiveSync = useLiveSyncScheduler({
    setTasks,
    setAgents,
    setStats,
    setDecisionInboxItems,
    shouldIncludeSeedAgents,
  });

  useAppBootstrapData({
    initialRoomThemes,
    hasLocalRoomThemesRef,
    setDepartments,
    setAgents,
    setTasks,
    setStats,
    setSettings,
    setSubtasks,
    setMeetingPresence,
    setDecisionInboxItems,
    setCustomRoomThemes,
    setLoading,
  });

  useUpdateStatusPolling(setUpdateStatus);
  useAppViewEffects({
    view,
    cliStatus,
    setView,
    setOauthResult,
    setCliStatus,
    setMobileNavOpen,
    setMeetingPresence,
  });

  useRealtimeSync({
    on,
    scheduleLiveSync,
    agentsRef,
    tasksRef,
    subAgentsRef,
    viewRef,
    activeChatRef,
    codexThreadToSubAgentIdRef,
    codexThreadBindingTsRef,
    subAgentStreamTailRef,
    setAgents,
    setMessages,
    setUnreadAgentIds,
    setTaskReport,
    setCrossDeptDeliveries,
    setCeoOfficeCalls,
    setMeetingPresence,
    setSubtasks,
    setSubAgents,
    setStreamingMessage,
  });

  const actions = useAppActions({
    agents,
    settings,
    scheduleLiveSync,
    setSettings,
    setAgents,
    setDepartments,
    setTasks,
    setStats,
    setMessages,
    setChatAgent,
    setShowChat,
    setUnreadAgentIds,
    setShowDecisionInbox,
    setDecisionInboxLoading,
    setDecisionInboxItems,
    setDecisionReplyBusyKey,
    setCliStatus,
  });

  const activeMeetingTaskId = useActiveMeetingTaskId(meetingPresence);

  const labels = useAppLabels({
    view,
    settings,
    departments,
    theme,
    runtimeOs,
    forceUpdateBanner,
    updateStatus,
    dismissedUpdateVersion,
  });

  const activePackKey = normalizeOfficeWorkflowPack(settings.officeWorkflowPack ?? "development");
  const overlayDepartments = useMemo(
    () =>
      resolvePackDepartmentsForDisplay({
        packKey: activePackKey,
        globalDepartments: departments,
        packDepartments: null,
      }),
    [activePackKey, departments],
  );
  const { mergedAgents: overlayAgents } = useMemo(
    () =>
      resolvePackAgentViews({
        packKey: activePackKey,
        globalAgents: agents,
        packAgents: null,
      }),
    [activePackKey, agents],
  );

  const handleOpenDepartmentChat = useCallback(
    (department: Department) => {
      const leader =
        overlayAgents.find((agent) => agent.department_id === department.id && agent.role === "team_leader") ??
        undefined;
      if (leader) actions.handleOpenChat(leader);
    },
    [actions, overlayAgents],
  );

  if (loading) {
    return (
      <AppLoadingScreen language={labels.uiLanguage} title={labels.loadingTitle} subtitle={labels.loadingSubtitle} />
    );
  }

  return (
    <AppMainLayout
      connected={connected}
      view={view}
      setView={setView}
      departments={departments}
      agents={agents}
      stats={stats}
      tasks={tasks}
      subtasks={subtasks}
      subAgents={subAgents}
      meetingPresence={meetingPresence}
      settings={settings}
      cliStatus={cliStatus}
      oauthResult={oauthResult}
      labels={labels}
      mobileNavOpen={mobileNavOpen}
      setMobileNavOpen={setMobileNavOpen}
      mobileHeaderMenuOpen={mobileHeaderMenuOpen}
      setMobileHeaderMenuOpen={setMobileHeaderMenuOpen}
      theme={theme}
      toggleTheme={toggleTheme}
      decisionInboxLoading={decisionInboxLoading}
      decisionInboxCount={decisionInboxItems.length}
      activeMeetingTaskId={activeMeetingTaskId}
      unreadAgentIds={unreadAgentIds}
      crossDeptDeliveries={crossDeptDeliveries}
      ceoOfficeCalls={ceoOfficeCalls}
      customRoomThemes={customRoomThemes}
      activeRoomThemeTargetId={activeRoomThemeTargetId}
      onCrossDeptDeliveryProcessed={(id) => setCrossDeptDeliveries((prev) => prev.filter((d) => d.id !== id))}
      onCeoOfficeCallProcessed={(id) => setCeoOfficeCalls((prev) => prev.filter((d) => d.id !== id))}
      onOpenActiveMeetingMinutes={(taskId) => setTaskPanel({ taskId, tab: "minutes" })}
      onSelectAgent={setSelectedAgent}
      onSelectDepartment={(department) => {
        setActiveDepartmentComponentId(department.id);
        setView("departmentComponents");
      }}
      activeDepartmentComponentId={activeDepartmentComponentId}
      onChangeDepartmentComponent={setActiveDepartmentComponentId}
      onOpenDepartmentChat={handleOpenDepartmentChat}
      onCreateTask={actions.handleCreateTask}
      onUpdateTask={actions.handleUpdateTask}
      onDeleteTask={actions.handleDeleteTask}
      onAssignTask={actions.handleAssignTask}
      onRunTask={actions.handleRunTask}
      onStopTask={actions.handleStopTask}
      onPauseTask={actions.handlePauseTask}
      onResumeTask={actions.handleResumeTask}
      onOpenTerminal={(taskId) => setTaskPanel({ taskId, tab: "terminal" })}
      onOpenMeetingMinutes={(taskId) => setTaskPanel({ taskId, tab: "minutes" })}
      onAgentsChange={actions.handleAgentsChange}
      activeOfficeWorkflowPack={settings.officeWorkflowPack ?? "development"}
      onChangeOfficeWorkflowPack={handleOfficeWorkflowPackChange}
      onSaveSettings={actions.handleSaveSettings}
      onRefreshCli={actions.handleRefreshCli}
      onOauthResultClear={() => setOauthResult(null)}
      onOpenDecisionInbox={actions.handleOpenDecisionInbox}
      onOpenAgentStatus={() => setShowAgentStatus(true)}
      onOpenReportHistory={() => setShowReportHistory(true)}
      onOpenAnnouncement={actions.handleOpenAnnouncement}
      onOpenRoomManager={() => setShowRoomManager(true)}
      onDismissAutoUpdateNotice={actions.handleDismissAutoUpdateNotice}
      onDismissUpdate={() => {
        const latest = labels.effectiveUpdateStatus?.latest_version ?? "";
        setDismissedUpdateVersion(latest);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(UPDATE_BANNER_DISMISS_STORAGE_KEY, latest);
        }
      }}
      officePackBootstrappingLabel={officePackBootstrappingLabel}
    >
      <AppOverlays
        showChat={showChat}
        chatAgent={chatAgent}
        messages={messages}
        agents={overlayAgents}
        streamingMessage={streamingMessage}
        onSendMessage={actions.handleSendMessage}
        onSendAnnouncement={actions.handleSendAnnouncement}
        onSendDirective={actions.handleSendDirective}
        onClearMessages={actions.handleClearMessages}
        onCloseChat={() => setShowChat(false)}
        showDecisionInbox={showDecisionInbox}
        decisionInboxLoading={decisionInboxLoading}
        decisionInboxItems={decisionInboxItems}
        decisionReplyBusyKey={decisionReplyBusyKey}
        uiLanguage={labels.uiLanguage}
        onCloseDecisionInbox={() => setShowDecisionInbox(false)}
        onRefreshDecisionInbox={() => {
          void actions.loadDecisionInbox();
        }}
        onReplyDecisionOption={actions.handleReplyDecisionOption}
        onOpenDecisionChat={actions.handleOpenDecisionChat}
        selectedAgent={selectedAgent}
        activeOfficeWorkflowPack={settings.officeWorkflowPack ?? "development"}
        departments={overlayDepartments}
        tasks={tasks}
        subAgents={subAgents}
        subtasks={subtasks}
        onCloseSelectedAgent={() => setSelectedAgent(null)}
        onChatFromAgentDetail={(agent) => {
          setSelectedAgent(null);
          actions.handleOpenChat(agent);
        }}
        onAssignTaskFromAgentDetail={() => {
          setSelectedAgent(null);
          setView("tasks");
        }}
        onOpenTerminalFromAgentDetail={(taskId) => {
          setSelectedAgent(null);
          setTaskPanel({ taskId, tab: "terminal" });
        }}
        onAgentUpdated={() => {
          api
            .getSettings()
            .then(async (nextSettingsRaw) => {
              const nextSettings = mergeSettingsWithDefaults(nextSettingsRaw);
              const activePack = nextSettings.officeWorkflowPack ?? "development";
              const nextAgents = await api.getAgents();
              setAgents(nextAgents);
              setSettings(nextSettings);

              if (!selectedAgent) return;
              const fromAgents = nextAgents.find((agent) => agent.id === selectedAgent.id);
              if (fromAgents) {
                setSelectedAgent(fromAgents);
              }
            })
            .catch(console.error);
        }}
        taskPanel={taskPanel}
        onCloseTaskPanel={() => setTaskPanel(null)}
        taskReport={taskReport}
        onCloseTaskReport={() => setTaskReport(null)}
        showReportHistory={showReportHistory}
        onCloseReportHistory={() => setShowReportHistory(false)}
        showAgentStatus={showAgentStatus}
        onCloseAgentStatus={() => setShowAgentStatus(false)}
        showRoomManager={showRoomManager}
        roomManagerDepartments={labels.roomManagerDepartments}
        customRoomThemes={customRoomThemes}
        onActiveRoomThemeTargetIdChange={setActiveRoomThemeTargetId}
        onRoomThemeChange={(themes) => {
          setCustomRoomThemes(themes as RoomThemeMap);
          hasLocalRoomThemesRef.current = true;
          try {
            window.localStorage.setItem(ROOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
          } catch {
            // ignore quota errors
          }
          api.saveRoomThemes(themes as Record<string, RoomTheme>).catch((error) => {
            console.error("Save room themes failed:", error);
          });
        }}
        onCloseRoomManager={() => {
          setShowRoomManager(false);
          setActiveRoomThemeTargetId(null);
        }}
      />
    </AppMainLayout>
  );
}
