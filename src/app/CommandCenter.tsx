import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { getControlPlaneDashboardState, type ControlPlaneDashboardState } from "../api/control-plane-dashboard";
import {
  classifyContinuityProjectionUpdate,
  getContinuityRunEvents,
  getRecentContinuityProjections,
  getTaskContinuityProjection,
  hasExactContinuityEventRange,
  isContinuityTransitProjectionView,
  type ContinuityLiveProjection,
  type ContinuitySyncState,
  type ContinuityTransitProjectionView,
} from "../api/continuity";
import { getProjects } from "../api/organization-projects";
import type { Agent, CompanyStats, Project, Task, WebSocketConnectionState, WSEventType } from "../types";
import CommandCenterViews from "./command-center/CommandCenterViews";
import type { CommandCreateInput } from "./command-center/CommandCenterViews";
import {
  commandCenterHref,
  type CommandCenterView,
  useCommandCenterNavigation,
} from "./command-center/useCommandCenterNavigation";

type CommandCenterProps = {
  connected: boolean;
  connectionState: WebSocketConnectionState;
  on?: (type: WSEventType, listener: (payload: unknown) => void) => () => void;
  tasks: Task[];
  agents: Agent[];
  stats: CompanyStats | null;
  decisionInboxCount: number;
  decisionInboxLoading: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onOpenDecisionInbox: () => void;
  onCreateCommand: (input: CommandCreateInput) => Promise<string>;
  onRunTask: (id: string) => Promise<void>;
  onStopTask: (id: string) => Promise<void>;
  onResumeTask: (id: string) => Promise<void>;
  onOpenTerminal: (id: string) => void;
  children?: ReactNode;
};

const NAV_ITEMS: Array<{ number: string; label: string; view: CommandCenterView }> = [
  { number: "01", label: "오늘", view: "today" },
  { number: "02", label: "프로젝트", view: "projects" },
  { number: "03", label: "업무", view: "tasks" },
  { number: "04", label: "에이전트·Skill", view: "agents" },
  { number: "05", label: "시스템", view: "system" },
];

const VIEW_TITLES: Record<CommandCenterView, string> = {
  today: "오늘",
  projects: "프로젝트",
  tasks: "업무",
  agents: "에이전트·Skill",
  system: "시스템",
};

function formatDate(): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(new Date());
}

function projectionIsOlder(
  current: ContinuityTransitProjectionView,
  incoming: ContinuityTransitProjectionView,
): boolean {
  if (current.task_id !== incoming.task_id) return false;
  if (current.cursor_run_id === incoming.cursor_run_id) {
    if (incoming.event_sequence !== current.event_sequence) {
      return incoming.event_sequence < current.event_sequence;
    }
    if (incoming.state_version !== current.state_version) return incoming.state_version < current.state_version;
    return incoming.checkpoint_sequence < current.checkpoint_sequence;
  }
  const currentObserved = Date.parse(current.observed_at);
  const incomingObserved = Date.parse(incoming.observed_at);
  return Number.isFinite(currentObserved) && Number.isFinite(incomingObserved) && incomingObserved < currentObserved;
}

export default function CommandCenter({
  connected,
  connectionState,
  on,
  tasks,
  agents,
  stats,
  decisionInboxCount,
  decisionInboxLoading,
  theme,
  toggleTheme,
  onOpenDecisionInbox,
  onCreateCommand,
  onRunTask,
  onStopTask,
  onResumeTask,
  onOpenTerminal,
  children,
}: CommandCenterProps) {
  const [dashboard, setDashboard] = useState<ControlPlaneDashboardState | null>(null);
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const [projectionLoading, setProjectionLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [continuity, setContinuity] = useState<ContinuityLiveProjection[]>([]);
  const [continuityUnavailable, setContinuityUnavailable] = useState(false);
  const [runtimeProjects, setRuntimeProjects] = useState<Project[]>([]);
  const continuityRef = useRef<ContinuityLiveProjection[]>([]);
  const snapshotEpochRef = useRef(0);
  const taskReconcileEpochRef = useRef<Map<string, number>>(new Map());
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const { view, selectedId, navigate } = useCommandCenterNavigation();

  const updateContinuity = useCallback(
    (update: (current: ContinuityLiveProjection[]) => ContinuityLiveProjection[]) => {
      const next = update(continuityRef.current);
      continuityRef.current = next;
      setContinuity(next);
    },
    [],
  );

  const replaceContinuityTask = useCallback(
    (projection: ContinuityTransitProjectionView, syncState: ContinuitySyncState) => {
      updateContinuity((current) => {
        const existing = current.find((item) => item.task_id === projection.task_id);
        if (existing && projectionIsOlder(existing, projection)) return current;
        return [
          { ...projection, sync_state: syncState },
          ...current.filter((item) => item.task_id !== projection.task_id),
        ].slice(0, 50);
      });
    },
    [updateContinuity],
  );

  const loadContinuitySnapshot = useCallback(
    async (signal?: AbortSignal, forceSyncState?: ContinuitySyncState) => {
      const epoch = ++snapshotEpochRef.current;
      try {
        const projections = await getRecentContinuityProjections(signal);
        if (signal?.aborted || epoch !== snapshotEpochRef.current) return;
        updateContinuity((current) => {
          const currentByTask = new Map(current.map((item) => [item.task_id, item]));
          const next = projections.map((projection) => {
            const existing = currentByTask.get(projection.task_id);
            if (existing && projectionIsOlder(existing, projection)) {
              return forceSyncState ? { ...existing, sync_state: forceSyncState } : existing;
            }
            const unchanged = Boolean(
              existing &&
              existing.cursor_run_id === projection.cursor_run_id &&
              existing.event_sequence === projection.event_sequence &&
              existing.state_version === projection.state_version &&
              existing.checkpoint_sequence === projection.checkpoint_sequence,
            );
            return {
              ...projection,
              sync_state: forceSyncState ?? (unchanged && existing?.sync_state === "exact" ? "exact" : "snapshot"),
            };
          });
          const projectedTaskIds = new Set(projections.map((projection) => projection.task_id));
          const retained = current
            .filter((item) => !projectedTaskIds.has(item.task_id))
            .map((item) => (forceSyncState ? { ...item, sync_state: forceSyncState } : item));
          return [...next, ...retained].slice(0, 50);
        });
        setContinuityUnavailable(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setContinuityUnavailable(true);
        updateContinuity((current) => current.map((item) => ({ ...item, sync_state: "error" })));
      }
    },
    [updateContinuity],
  );

  const reconcileContinuityEvent = useCallback(
    async (incoming: ContinuityTransitProjectionView) => {
      const current = continuityRef.current.find((item) => item.task_id === incoming.task_id);
      const decision = current ? classifyContinuityProjectionUpdate(current, incoming) : "snapshot_required";
      if (current && decision === "duplicate") return;
      snapshotEpochRef.current += 1;
      const reconcileEpoch = (taskReconcileEpochRef.current.get(incoming.task_id) ?? 0) + 1;
      taskReconcileEpochRef.current.set(incoming.task_id, reconcileEpoch);
      const isCurrentReconcile = () => taskReconcileEpochRef.current.get(incoming.task_id) === reconcileEpoch;
      if (!current) {
        try {
          const snapshot = await getTaskContinuityProjection(incoming.task_id);
          if (!isCurrentReconcile()) return;
          replaceContinuityTask(snapshot, "snapshot");
          setContinuityUnavailable(false);
        } catch {
          if (isCurrentReconcile()) setContinuityUnavailable(true);
        }
        return;
      }
      if (decision === "exact") {
        if (!isCurrentReconcile()) return;
        replaceContinuityTask(incoming, "exact");
        setContinuityUnavailable(false);
        return;
      }

      const frozenState: ContinuitySyncState = decision === "run_changed" ? "run_changed" : "gap";
      updateContinuity((items) =>
        items.map((item) => (item.task_id === incoming.task_id ? { ...item, sync_state: frozenState } : item)),
      );
      try {
        let caughtUpExactly = false;
        if (decision === "gap") {
          const range = await getContinuityRunEvents(current.cursor_run_id, current.event_sequence);
          if (!isCurrentReconcile()) return;
          caughtUpExactly =
            range.run_id === incoming.cursor_run_id &&
            range.after_sequence === current.event_sequence &&
            range.event_sequence >= incoming.event_sequence &&
            hasExactContinuityEventRange(
              range.events.filter((event) => event.sequence <= incoming.event_sequence),
              incoming.cursor_run_id,
              current.event_sequence,
              incoming.event_sequence,
            );
        }
        const snapshot = await getTaskContinuityProjection(incoming.task_id);
        if (!isCurrentReconcile()) return;
        const snapshotMatchesIncoming =
          snapshot.cursor_run_id === incoming.cursor_run_id &&
          snapshot.event_sequence === incoming.event_sequence &&
          snapshot.state_version === incoming.state_version;
        replaceContinuityTask(snapshot, caughtUpExactly && snapshotMatchesIncoming ? "exact" : "snapshot");
        setContinuityUnavailable(false);
      } catch {
        if (!isCurrentReconcile()) return;
        updateContinuity((items) =>
          items.map((item) => (item.task_id === incoming.task_id ? { ...item, sync_state: "error" } : item)),
        );
      }
    },
    [replaceContinuityTask, updateContinuity],
  );

  const loadProjection = useCallback(async (signal?: AbortSignal, background = false) => {
    if (!background) setProjectionLoading(true);
    setProjectionError(null);
    try {
      const [nextDashboard, runtimeProjectPage] = await Promise.all([
        getControlPlaneDashboardState(signal),
        getProjects({ page: 1, page_size: 100 }),
      ]);
      setDashboard(nextDashboard);
      setRuntimeProjects(runtimeProjectPage.projects);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setProjectionError(error instanceof Error ? error.message : "Control Plane 요약을 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted && !background) setProjectionLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadProjection(controller.signal);
    const interval = window.setInterval(() => void loadProjection(undefined, true), 15_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loadProjection]);

  useEffect(() => {
    const controller = new AbortController();
    if (!connected) {
      snapshotEpochRef.current += 1;
      for (const [taskId, epoch] of taskReconcileEpochRef.current) {
        taskReconcileEpochRef.current.set(taskId, epoch + 1);
      }
      updateContinuity((items) => items.map((item) => ({ ...item, sync_state: "offline" })));
    }
    void loadContinuitySnapshot(controller.signal, connected ? "snapshot" : "offline");
    const interval = window.setInterval(
      () => void loadContinuitySnapshot(undefined, connected ? undefined : "offline"),
      10_000,
    );
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [connected, loadContinuitySnapshot, updateContinuity]);

  useEffect(() => {
    if (!on) return;
    const unsubscribeProjection = on("continuity_run_event", (payload) => {
      if (isContinuityTransitProjectionView(payload)) void reconcileContinuityEvent(payload);
    });
    const invalidate = () => void loadContinuitySnapshot();
    const unsubscribeCheckpoint = on("continuity_event", invalidate);
    const unsubscribeRunner = on("runner.updated", invalidate);
    return () => {
      unsubscribeProjection();
      unsubscribeCheckpoint();
      unsubscribeRunner();
    };
  }, [loadContinuitySnapshot, on, reconcileContinuityEvent]);

  useEffect(() => {
    document.title = `Dongri-grigri · ${VIEW_TITLES[view]}`;
  }, [view]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navRef.current?.querySelector<HTMLElement>("a")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        menuButtonRef.current,
        ...Array.from(navRef.current?.querySelectorAll<HTMLElement>("a, button") ?? []),
      ].filter(Boolean) as HTMLElement[];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  const navigateWithinShell = useCallback(
    (nextView: CommandCenterView, detail?: string | null) => {
      navigate(nextView, detail);
      setMobileNavOpen(false);
      window.requestAnimationFrame(() => mainRef.current?.focus());
    },
    [navigate],
  );

  const runningTasks = useMemo(
    () => tasks.filter((task) => task.status === "in_progress" || task.status === "collaborating"),
    [tasks],
  );
  const waitingTasks = useMemo(
    () => tasks.filter((task) => task.status === "inbox" || task.status === "pending"),
    [tasks],
  );
  const reviewTasks = useMemo(() => tasks.filter((task) => task.status === "review"), [tasks]);
  const nextSafeAction = dashboard?.active_specs.find((spec) => spec.next_recommended_action)?.next_recommended_action;

  return (
    <div className="cc-root">
      <a className="cc-skip-link" href="#cc-main">
        운영 현황으로 건너뛰기
      </a>
      <header className="cc-header">
        <div className="cc-brand-block">
          <a
            className="cc-brand"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigateWithinShell("today");
            }}
            aria-label="Dongri-grigri 오늘 화면"
          >
            Dongri-grigri
          </a>
          <span className="cc-date">{formatDate()}</span>
        </div>
        <div className="cc-header-status" aria-label="연결 상태" data-connection-state={connectionState}>
          <span className={`cc-live-dot is-${connectionState}`} />
          <span>
            {
              {
                connecting: "로컬 연결 준비 중",
                connected: "로컬 연결됨",
                reconnecting: "로컬 재연결 중",
                auth_recovering: "로컬 인증 복구 중",
              }[connectionState]
            }
          </span>
          <span className="cc-header-divider" />
          <span>{agents.filter((agent) => agent.status === "working").length}개 에이전트 작업 중</span>
        </div>
        <div className="cc-header-actions">
          <a className="cc-old-link" href="/old">
            호환 화면
          </a>
          <button
            className="cc-icon-button"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "light" ? "어두운 테마로 전환" : "밝은 테마로 전환"}
          >
            {theme === "light" ? <Moon aria-hidden="true" size={19} /> : <Sun aria-hidden="true" size={19} />}
          </button>
          <button
            ref={menuButtonRef}
            className="cc-icon-button cc-mobile-menu-button"
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
            aria-controls="cc-mobile-nav"
            aria-label={mobileNavOpen ? "메뉴 닫기" : "메뉴 열기"}
          >
            {mobileNavOpen ? <X aria-hidden="true" size={21} /> : <Menu aria-hidden="true" size={21} />}
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <button
          className="cc-nav-scrim"
          type="button"
          onClick={() => {
            setMobileNavOpen(false);
            menuButtonRef.current?.focus();
          }}
          aria-label="메뉴 닫기"
        />
      )}
      <div className="cc-layout">
        <nav
          ref={navRef}
          className={`cc-nav ${mobileNavOpen ? "is-open" : ""}`}
          id="cc-mobile-nav"
          aria-label="주요 화면"
          aria-modal={mobileNavOpen || undefined}
          role={mobileNavOpen ? "dialog" : undefined}
        >
          {NAV_ITEMS.map((item) => (
            <a
              className={`cc-nav-item ${view === item.view ? "is-current" : ""}`}
              href={commandCenterHref(item.view)}
              key={item.view}
              aria-current={view === item.view ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigateWithinShell(item.view);
              }}
            >
              <span className="cc-nav-number">{item.number}</span>
              <span className="cc-nav-label">{item.label}</span>
            </a>
          ))}
          <div className="cc-nav-legend" aria-label="상태 범례">
            <span>
              <i className="cc-legend-dot healthy" />
              정상
            </span>
            <span>
              <i className="cc-legend-dot warning" />
              변경 확인
            </span>
            <span>
              <i className="cc-legend-dot service" />
              주의 필요
            </span>
            <span>
              <i className="cc-legend-dot historical" />
              이력
            </span>
          </div>
        </nav>

        <main ref={mainRef} className="cc-main" id="cc-main" tabIndex={-1}>
          <CommandCenterViews
            connected={connected}
            connectionState={connectionState}
            view={view}
            selectedId={selectedId}
            tasks={tasks}
            agents={agents}
            stats={stats}
            dashboard={dashboard}
            runtimeProjects={runtimeProjects}
            continuity={continuity}
            continuityUnavailable={continuityUnavailable}
            loading={projectionLoading}
            error={projectionError}
            decisionInboxCount={decisionInboxCount}
            decisionInboxLoading={decisionInboxLoading}
            onOpenDecisionInbox={onOpenDecisionInbox}
            onCreateCommand={onCreateCommand}
            onRunTask={onRunTask}
            onStopTask={onStopTask}
            onResumeTask={onResumeTask}
            onOpenTerminal={onOpenTerminal}
            onNavigate={navigateWithinShell}
            onRetry={() => void loadProjection()}
          />
          {children}
        </main>

        <aside className="cc-rail" aria-label="운영 판단 레일">
          <div className="cc-rail-intro">
            <span>판단 레일</span>
            <strong>{decisionInboxCount + waitingTasks.length + reviewTasks.length}</strong>
          </div>
          <button className="cc-rail-item is-action" type="button" onClick={onOpenDecisionInbox}>
            <ShieldCheck aria-hidden="true" size={20} />
            <span>
              <strong>승인·응답 {decisionInboxCount}건</strong>
              <small>사용자 판단이 필요한 요청</small>
            </span>
            <ArrowRight aria-hidden="true" size={17} />
          </button>
          {waitingTasks.slice(0, 3).map((task) => (
            <button
              className="cc-rail-item is-warning"
              type="button"
              key={task.id}
              onClick={() => navigateWithinShell("tasks", task.id)}
            >
              <Clock3 aria-hidden="true" size={20} />
              <span>
                <strong>{task.title}</strong>
                <small>판단 대기</small>
              </span>
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          ))}
          {runningTasks.slice(0, 2).map((task) => (
            <button
              className="cc-rail-item is-running"
              type="button"
              key={task.id}
              onClick={() => navigateWithinShell("tasks", task.id)}
            >
              <CheckCircle2 aria-hidden="true" size={20} />
              <span>
                <strong>{task.title}</strong>
                <small>실행 중</small>
              </span>
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          ))}
          {nextSafeAction && (
            <div className="cc-rail-item is-next">
              <FileCheck2 aria-hidden="true" size={20} />
              <span>
                <strong>다음 안전 작업</strong>
                <small>{nextSafeAction}</small>
              </span>
            </div>
          )}
          {!connected && (
            <div className="cc-rail-item is-warning">
              <AlertTriangle aria-hidden="true" size={20} />
              <span>
                <strong>로컬 연결 끊김</strong>
                <small>표시된 상태가 최신이 아닐 수 있습니다.</small>
              </span>
            </div>
          )}
          <div className="cc-evidence-block">
            <div>
              <ShieldCheck aria-hidden="true" size={17} />
              <span>투영 상태</span>
              <strong>{dashboard?.degraded ? "주의" : dashboard ? "정상" : "확인 중"}</strong>
            </div>
            <div>
              <FileCheck2 aria-hidden="true" size={17} />
              <span>등록 업무</span>
              <strong>{stats?.tasks.total ?? tasks.length}</strong>
            </div>
            <div>
              <Clock3 aria-hidden="true" size={17} />
              <span>검토 중</span>
              <strong>{reviewTasks.length}</strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
