import { useState, useRef, useMemo, useCallback } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import type { Department, RoomTheme } from "./types";
import * as api from "./api";
import { normalizeLanguage } from "./i18n";
import { useTheme } from "./ThemeContext";
import { ROOM_THEMES_STORAGE_KEY, UPDATE_BANNER_DISMISS_STORAGE_KEY } from "./app/constants";
import {
  detectRuntimeOs,
  isForceUpdateBannerEnabled,
  mergeSettingsWithDefaults,
  readStoredRoomThemes,
} from "./app/utils";
import type { RuntimeOs, RoomThemeMap } from "./app/types";
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
import { useAppDomainState } from "./app/useAppDomainState";
import { useOfficeWorkflowPackChange } from "./app/useOfficeWorkflowPackChange";
import { resolvePackAgentViews, resolvePackDepartmentsForDisplay } from "./app/office-pack-display";
import { normalizeOfficeWorkflowPack } from "./app/office-workflow-pack";

export type { OAuthCallbackResult } from "./app/types";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const initialRoomThemes = useMemo(() => readStoredRoomThemes(), []);
  const hasLocalRoomThemesRef = useRef<boolean>(initialRoomThemes.hasStored);

  const {
    view,
    setView,
    departments,
    setDepartments,
    agents,
    setAgents,
    tasks,
    setTasks,
    messages,
    setMessages,
    stats,
    setStats,
    settings,
    setSettings,
    cliStatus,
    setCliStatus,
    subAgents,
    setSubAgents,
    subtasks,
    setSubtasks,
    loading,
    setLoading,
    unreadAgentIds,
    setUnreadAgentIds,
    crossDeptDeliveries,
    setCrossDeptDeliveries,
    ceoOfficeCalls,
    setCeoOfficeCalls,
    meetingPresence,
    setMeetingPresence,
    oauthResult,
    setOauthResult,
    taskReport,
    setTaskReport,
    customRoomThemes,
    setCustomRoomThemes,
    updateStatus,
    setUpdateStatus,
    dismissedUpdateVersion,
    setDismissedUpdateVersion,
    streamingMessage,
    setStreamingMessage,
    viewRef,
    agentsRef,
    tasksRef,
    subAgentsRef,
  } = useAppDomainState({ initialRoomThemes });
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
  const [runtimeOs] = useState<RuntimeOs>(() => detectRuntimeOs());
  const [forceUpdateBanner] = useState<boolean>(() => isForceUpdateBannerEnabled());
  const codexThreadToSubAgentIdRef = useRef<Map<string, string>>(new Map());
  const codexThreadBindingTsRef = useRef<Map<string, number>>(new Map());
  const subAgentStreamTailRef = useRef<Map<string, string>>(new Map());
  const activeChatRef = useRef<{ showChat: boolean; agentId: string | null }>({ showChat: false, agentId: null });
  activeChatRef.current = { showChat, agentId: chatAgent?.id ?? null };
  const { officePackBootstrappingLabel, handleOfficeWorkflowPackChange } = useOfficeWorkflowPackChange({
    settings,
    setSettings,
    setDepartments,
    setAgents,
  });

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
        pixelAgentMode={settings.pixelAgentMode}
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
