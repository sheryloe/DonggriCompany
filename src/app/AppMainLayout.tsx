import { Suspense, lazy, useCallback, useMemo, type ReactNode } from "react";
import Sidebar from "../components/Sidebar";
import { I18nProvider } from "../i18n";
import type {
  Agent,
  CeoOfficeCall,
  CliStatusMap,
  CompanyStats,
  CompanySettings,
  CrossDeptDelivery,
  Department,
  MeetingPresence,
  SubAgent,
  SubTask,
  Task,
  WorkflowPackKey,
} from "../types";
import type { UpdateStatus } from "../api";
import type { OAuthCallbackResult, RoomThemeMap, View } from "./types";
import AppHeaderBar from "./AppHeaderBar";
import {
  buildOfficePackPresentation,
  getOfficePackRoomThemes,
  listOfficePackOptions,
  normalizeOfficeWorkflowPack,
} from "./office-workflow-pack";
import { resolvePackAgentViews, resolvePackDepartmentsForDisplay } from "./office-pack-display";
import { applyOfficePackToTaskInput, filterTasksByOfficePack, type TaskCreateInput } from "./task-workflow-pack";

const OfficeView = lazy(() => import("../components/OfficeView"));
const Dashboard = lazy(() => import("../components/Dashboard"));
const TaskBoard = lazy(() => import("../components/TaskBoard"));
const AgentManager = lazy(() => import("../components/AgentManager"));
const SkillsLibrary = lazy(() => import("../components/SkillsLibrary"));
const SettingsPanel = lazy(() => import("../components/SettingsPanel"));

interface AppMainLayoutLabels {
  uiLanguage: string;
  viewTitle: string;
  announcementLabel: string;
  roomManagerLabel: string;
  roomManagerDepartments: { id: string; name: string }[];
  reportLabel: string;
  tasksPrimaryLabel: string;
  agentStatusLabel: string;
  decisionLabel: string;
  autoUpdateNoticeVisible: boolean;
  autoUpdateNoticeTitle: string;
  autoUpdateNoticeHint: string;
  autoUpdateNoticeActionLabel: string;
  autoUpdateNoticeContainerClass: string;
  autoUpdateNoticeTextClass: string;
  autoUpdateNoticeHintClass: string;
  autoUpdateNoticeButtonClass: string;
  effectiveUpdateStatus: UpdateStatus | null;
  updateBannerVisible: boolean;
  updateReleaseUrl: string;
  updateTitle: string;
  updateHint: string;
  updateReleaseLabel: string;
  updateDismissLabel: string;
  updateTestModeHint: string;
}

interface AppMainLayoutProps {
  connected: boolean;
  view: View;
  setView: (view: View) => void;
  departments: Department[];
  agents: Agent[];
  stats: CompanyStats | null;
  tasks: Task[];
  subtasks: SubTask[];
  subAgents: SubAgent[];
  meetingPresence: MeetingPresence[];
  settings: CompanySettings;
  cliStatus: CliStatusMap | null;
  oauthResult: OAuthCallbackResult | null;
  labels: AppMainLayoutLabels;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  mobileHeaderMenuOpen: boolean;
  setMobileHeaderMenuOpen: (open: boolean) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  decisionInboxLoading: boolean;
  decisionInboxCount: number;
  activeMeetingTaskId: string | null;
  unreadAgentIds: Set<string>;
  crossDeptDeliveries: CrossDeptDelivery[];
  ceoOfficeCalls: CeoOfficeCall[];
  customRoomThemes: RoomThemeMap;
  activeRoomThemeTargetId: string | null;
  onCrossDeptDeliveryProcessed: (id: string) => void;
  onCeoOfficeCallProcessed: (id: string) => void;
  onOpenActiveMeetingMinutes: (taskId: string) => void;
  onSelectAgent: (agent: Agent) => void;
  onSelectDepartment: (department: Department) => void;
  onCreateTask: (input: {
    title: string;
    description?: string;
    department_id?: string;
    task_type?: string;
    priority?: number;
    project_id?: string;
    project_path?: string;
    assigned_agent_id?: string;
    workflow_pack_key?: WorkflowPackKey;
  }) => Promise<void>;
  onUpdateTask: (id: string, data: Partial<Task>) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onAssignTask: (taskId: string, agentId: string) => Promise<void>;
  onRunTask: (id: string) => Promise<void>;
  onStopTask: (id: string) => Promise<void>;
  onPauseTask: (id: string) => Promise<void>;
  onResumeTask: (id: string) => Promise<void>;
  onOpenTerminal: (taskId: string) => void;
  onOpenMeetingMinutes: (taskId: string) => void;
  onAgentsChange: () => void;
  activeOfficeWorkflowPack: WorkflowPackKey;
  onChangeOfficeWorkflowPack: (packKey: WorkflowPackKey) => void;
  onSaveSettings: (settings: CompanySettings) => Promise<void>;
  onRefreshCli: () => Promise<void>;
  onOauthResultClear: () => void;
  onOpenDecisionInbox: () => void;
  onOpenAgentStatus: () => void;
  onOpenReportHistory: () => void;
  onOpenAnnouncement: () => void;
  onOpenRoomManager: () => void;
  onDismissAutoUpdateNotice: () => Promise<void>;
  onDismissUpdate: () => void;
  officePackBootstrappingLabel?: string | null;
  children?: ReactNode;
}

export default function AppMainLayout({
  connected,
  view,
  setView,
  departments,
  agents,
  stats,
  tasks,
  subtasks,
  subAgents,
  meetingPresence,
  settings,
  cliStatus,
  oauthResult,
  labels,
  mobileNavOpen,
  setMobileNavOpen,
  mobileHeaderMenuOpen,
  setMobileHeaderMenuOpen,
  theme,
  toggleTheme,
  decisionInboxLoading,
  decisionInboxCount,
  activeMeetingTaskId,
  unreadAgentIds,
  crossDeptDeliveries,
  ceoOfficeCalls,
  customRoomThemes,
  activeRoomThemeTargetId,
  onCrossDeptDeliveryProcessed,
  onCeoOfficeCallProcessed,
  onOpenActiveMeetingMinutes,
  onSelectAgent,
  onSelectDepartment,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onAssignTask,
  onRunTask,
  onStopTask,
  onPauseTask,
  onResumeTask,
  onOpenTerminal,
  onOpenMeetingMinutes,
  onAgentsChange,
  activeOfficeWorkflowPack,
  onChangeOfficeWorkflowPack,
  onSaveSettings,
  onRefreshCli,
  onOauthResultClear,
  onOpenDecisionInbox,
  onOpenAgentStatus,
  onOpenReportHistory,
  onOpenAnnouncement,
  onOpenRoomManager,
  onDismissAutoUpdateNotice,
  onDismissUpdate,
  officePackBootstrappingLabel,
  children,
}: AppMainLayoutProps) {
  const uiLanguage = labels.uiLanguage === "ko" ? "ko" : "en";
  const officePackKey = normalizeOfficeWorkflowPack(activeOfficeWorkflowPack);
  const officePackOptions = useMemo(() => listOfficePackOptions(uiLanguage), [uiLanguage]);
  const officePackLabel = uiLanguage === "ko" ? "오피스 팩" : "Office Pack";
  const officePackBootstrappingMessage = useMemo(() => {
    if (!officePackBootstrappingLabel) return null;
    if (uiLanguage === "ko") return `${officePackBootstrappingLabel} 오피스 팩 배치를 적용하는 중입니다...`;
    return `Deploying ${officePackBootstrappingLabel} office pack...`;
  }, [officePackBootstrappingLabel, uiLanguage]);
  const viewLoadingLabel = uiLanguage === "ko" ? "화면 데이터를 불러오는 중..." : "Loading view...";
  const generatedOfficePresentation = useMemo(
    () =>
      buildOfficePackPresentation({
        packKey: officePackKey,
        locale: uiLanguage,
        departments,
        agents,
        customRoomThemes,
      }),
    [officePackKey, uiLanguage, departments, agents, customRoomThemes],
  );

  const isHydratedOfficePack = false;

  const displayDepartments = useMemo(
    () =>
      resolvePackDepartmentsForDisplay({
        packKey: officePackKey,
        globalDepartments: departments,
        packDepartments: null,
        preferPackProfile: false,
      }),
    [departments, officePackKey],
  );

  const { scopedAgents: officeScopedAgents, mergedAgents: displayAgents } = useMemo(
    () =>
      resolvePackAgentViews({
        packKey: officePackKey,
        globalAgents: agents,
        packAgents: null,
      }),
    [agents, officePackKey],
  );

  const managerDepartments = officePackKey === "development" ? departments : displayDepartments;
  const managerAgents = officePackKey === "development" ? agents : officeScopedAgents;

  const officePresentation = useMemo(() => {
    if (officePackKey === "development") return generatedOfficePresentation;
    return {
      departments: displayDepartments,
      agents: officeScopedAgents,
      roomThemes: {
        ...customRoomThemes,
        ...getOfficePackRoomThemes(officePackKey),
      },
    };
  }, [customRoomThemes, displayDepartments, generatedOfficePresentation, officePackKey, officeScopedAgents]);

  const tasksForActivePack = useMemo(() => filterTasksByOfficePack(tasks, officePackKey), [tasks, officePackKey]);
  const handleCreateTaskForActivePack = useCallback(
    async (input: TaskCreateInput) => {
      await onCreateTask(applyOfficePackToTaskInput(input, officePackKey));
    },
    [onCreateTask, officePackKey],
  );

  return (
    <I18nProvider language={uiLanguage}>
      <div className="app-shell flex h-[100dvh] min-h-[100dvh] overflow-hidden">
        <div className="hidden lg:flex lg:flex-shrink-0">
          <Sidebar
            currentView={view}
            onChangeView={setView}
            departments={officePresentation.departments}
            agents={officePresentation.agents}
            settings={settings}
            connected={connected}
          />
        </div>

        {mobileNavOpen && (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <div
          className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:hidden ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
          }`}
        >
          <Sidebar
            currentView={view}
            onChangeView={(nextView) => {
              setView(nextView);
              setMobileNavOpen(false);
            }}
            departments={officePresentation.departments}
            agents={officePresentation.agents}
            settings={settings}
            connected={connected}
          />
        </div>

        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
          <AppHeaderBar
            currentView={view}
            connected={connected}
            viewTitle={labels.viewTitle}
            tasksPrimaryLabel={labels.tasksPrimaryLabel}
            decisionLabel={labels.decisionLabel}
            decisionInboxLoading={decisionInboxLoading}
            decisionInboxCount={decisionInboxCount}
            agentStatusLabel={labels.agentStatusLabel}
            reportLabel={labels.reportLabel}
            announcementLabel={labels.announcementLabel}
            roomManagerLabel={labels.roomManagerLabel}
            theme={theme}
            mobileHeaderMenuOpen={mobileHeaderMenuOpen}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onOpenTasks={() => setView("tasks")}
            onOpenDecisionInbox={onOpenDecisionInbox}
            onOpenAgentStatus={onOpenAgentStatus}
            onOpenReportHistory={onOpenReportHistory}
            onOpenAnnouncement={onOpenAnnouncement}
            onOpenRoomManager={onOpenRoomManager}
            officePackControl={
              view === "office" || view === "agents" || view === "tasks"
                ? {
                    label: officePackLabel,
                    value: officePackKey,
                    options: officePackOptions,
                    onChange: onChangeOfficeWorkflowPack,
                  }
                : null
            }
            onToggleTheme={toggleTheme}
            onToggleMobileHeaderMenu={() => setMobileHeaderMenuOpen(!mobileHeaderMenuOpen)}
            onCloseMobileHeaderMenu={() => setMobileHeaderMenuOpen(false)}
          />

          {officePackBootstrappingMessage && (
            <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 sm:px-4 lg:px-6">
              <div className="text-xs font-medium text-emerald-100">{officePackBootstrappingMessage}</div>
            </div>
          )}

          {labels.autoUpdateNoticeVisible && (
            <div className={labels.autoUpdateNoticeContainerClass}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className={labels.autoUpdateNoticeTextClass}>
                  <div className="font-medium">{labels.autoUpdateNoticeTitle}</div>
                  <div className={labels.autoUpdateNoticeHintClass}>{labels.autoUpdateNoticeHint}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void onDismissAutoUpdateNotice();
                    }}
                    className={labels.autoUpdateNoticeButtonClass}
                  >
                    {labels.autoUpdateNoticeActionLabel}
                  </button>
                </div>
              </div>
            </div>
          )}

          {labels.updateBannerVisible && labels.effectiveUpdateStatus && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2.5 sm:px-4 lg:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-xs text-amber-100">
                  <div className="font-medium">{labels.updateTitle}</div>
                  <div className="mt-0.5 text-[11px] text-amber-200/90">{labels.updateHint}</div>
                  {labels.updateTestModeHint && (
                    <div className="mt-0.5 text-[11px] text-amber-300/90">{labels.updateTestModeHint}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={labels.updateReleaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-amber-300/40 bg-amber-200/10 px-2.5 py-1 text-[11px] text-amber-100 transition hover:bg-amber-200/20"
                  >
                    {labels.updateReleaseLabel}
                  </a>
                  <button
                    type="button"
                    onClick={onDismissUpdate}
                    className="rounded-md border border-slate-500/40 bg-slate-700/30 px-2.5 py-1 text-[11px] text-slate-100 transition hover:bg-slate-700/50"
                  >
                    {labels.updateDismissLabel}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="p-3 sm:p-4 lg:p-6">
            <Suspense
              fallback={
                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
                  {viewLoadingLabel}
                </div>
              }
            >
              {view === "office" && (
                <OfficeView
                  departments={officePresentation.departments}
                  agents={officePresentation.agents}
                  tasks={tasks}
                  subAgents={subAgents}
                  meetingPresence={meetingPresence}
                  activeMeetingTaskId={activeMeetingTaskId}
                  unreadAgentIds={unreadAgentIds}
                  crossDeptDeliveries={crossDeptDeliveries}
                  onCrossDeptDeliveryProcessed={onCrossDeptDeliveryProcessed}
                  ceoOfficeCalls={ceoOfficeCalls}
                  onCeoOfficeCallProcessed={onCeoOfficeCallProcessed}
                  onOpenActiveMeetingMinutes={onOpenActiveMeetingMinutes}
                  customDeptThemes={officePresentation.roomThemes}
                  themeHighlightTargetId={activeRoomThemeTargetId}
                  onSelectAgent={onSelectAgent}
                  onSelectDepartment={onSelectDepartment}
                />
              )}

              {view === "dashboard" && (
                <Dashboard
                  stats={stats}
                  agents={agents}
                  tasks={tasks}
                  companyName={settings.companyName}
                  onPrimaryCtaClick={() => setView("tasks")}
                />
              )}

              {view === "tasks" && (
                <TaskBoard
                  tasks={tasksForActivePack}
                  agents={displayAgents}
                  departments={displayDepartments}
                  subtasks={subtasks}
                  onCreateTask={handleCreateTaskForActivePack}
                  onUpdateTask={onUpdateTask}
                  onDeleteTask={onDeleteTask}
                  onAssignTask={onAssignTask}
                  onRunTask={onRunTask}
                  onStopTask={onStopTask}
                  onPauseTask={onPauseTask}
                  onResumeTask={onResumeTask}
                  onOpenTerminal={onOpenTerminal}
                  onOpenMeetingMinutes={onOpenMeetingMinutes}
                />
              )}

              {view === "agents" && (
                <AgentManager
                  agents={managerAgents}
                  departments={managerDepartments}
                  onAgentsChange={onAgentsChange}
                  activeOfficeWorkflowPack={officePackKey}
                  dbBackedOfficePack={isHydratedOfficePack}
                  onSaveOfficePackProfile={async () => {}}
                />
              )}

              {view === "skills" && <SkillsLibrary agents={agents} />}

              {view === "settings" && (
                <SettingsPanel
                  settings={settings}
                  cliStatus={cliStatus}
                  onSave={(nextSettings) => {
                    void onSaveSettings(nextSettings);
                  }}
                  onRefreshCli={() => {
                    void onRefreshCli();
                  }}
                  oauthResult={oauthResult}
                  onOauthResultClear={onOauthResultClear}
                />
              )}
            </Suspense>
          </div>
        </main>

        {children}
      </div>
    </I18nProvider>
  );
}


