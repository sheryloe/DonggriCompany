import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Code2,
  FileText,
  GitPullRequest,
  KanbanSquare,
  LayoutDashboard,
  MessageSquareText,
  Milestone,
  PanelsTopLeft,
  ShieldCheck,
  Siren,
  TestTube2,
  TimerReset,
  type LucideIcon,
} from "lucide-react";
import { createProjectComponentEvent, getModules, getProjectComponentEvents, getProjects } from "../api";
import type {
  Agent,
  Department,
  Project,
  ProjectComponentEvent,
  ProjectModuleManifest,
  Task,
  WorkflowPackKey,
} from "../types";

type DepartmentComponentId = "pmo" | "planning" | "dev" | "design" | "qa" | "devsecops" | "operations";

interface TaskCreateInput {
  title: string;
  description?: string;
  department_id?: string;
  task_type?: string;
  priority?: number;
  project_id?: string;
  project_path?: string;
  project_hint?: string;
  assigned_agent_id?: string;
  workflow_pack_key?: WorkflowPackKey;
  workflow_meta_json?: Record<string, unknown> | string;
}

interface DepartmentComponentsViewProps {
  departments: Department[];
  agents: Agent[];
  tasks: Task[];
  activeDepartmentId: string;
  onActiveDepartmentChange: (departmentId: string) => void;
  onCreateTask: (input: TaskCreateInput) => Promise<void>;
  onOpenDepartmentChat: (department: Department) => void;
}

interface DepartmentComponentDefinition {
  key: string;
  departmentId: DepartmentComponentId;
  title: string;
  summary: string;
  componentKind: string;
  entryPoints: string[];
  metrics: string[];
  icon: LucideIcon;
}

const DEPARTMENT_ORDER: DepartmentComponentId[] = ["pmo", "planning", "dev", "design", "qa", "devsecops", "operations"];

const DEPARTMENT_FALLBACK_LABELS: Record<DepartmentComponentId, string> = {
  pmo: "PMO",
  planning: "기획",
  dev: "개발",
  design: "디자인",
  qa: "QA",
  devsecops: "DevSecOps",
  operations: "운영",
};

const COMPONENTS: DepartmentComponentDefinition[] = [
  {
    key: "portfolio-kanban",
    departmentId: "pmo",
    title: "포트폴리오 칸반",
    summary: "프로젝트별 진행 단계, WIP, 병목을 추적합니다.",
    componentKind: "kanban",
    entryPoints: ["global_department_tab", "office_room", "project_detail"],
    metrics: ["WIP", "Blocking", "Priority"],
    icon: KanbanSquare,
  },
  {
    key: "gantt-milestones",
    departmentId: "pmo",
    title: "간트/마일스톤",
    summary: "마일스톤, 일정 의존성, 지연 위험을 프로젝트 이력과 연결합니다.",
    componentKind: "gantt",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Milestone", "Dependency", "Delay"],
    icon: CalendarDays,
  },
  {
    key: "risk-issue-register",
    departmentId: "pmo",
    title: "리스크/이슈 레지스터",
    summary: "프로젝트 리스크, 이슈, 대응 담당자를 추적합니다.",
    componentKind: "risk_register",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Risk", "Issue", "Owner"],
    icon: Siren,
  },
  {
    key: "priority-dependencies",
    departmentId: "pmo",
    title: "우선순위/의존성 보드",
    summary: "작업 우선순위와 부서 간 의존성을 정리합니다.",
    componentKind: "dependency_board",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Priority", "Blocked by", "ETA"],
    icon: Milestone,
  },
  {
    key: "roadmap",
    departmentId: "planning",
    title: "로드맵",
    summary: "분기별 목표, 릴리스 후보, 범위 변경을 관리합니다.",
    componentKind: "roadmap",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Now", "Next", "Later"],
    icon: LayoutDashboard,
  },
  {
    key: "backlog-priority",
    departmentId: "planning",
    title: "백로그 우선순위",
    summary: "요구사항과 백로그를 가치, 리스크, 실행 비용 기준으로 정렬합니다.",
    componentKind: "backlog",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Value", "Risk", "Effort"],
    icon: ClipboardList,
  },
  {
    key: "prd-map",
    departmentId: "planning",
    title: "PRD/요구사항 맵",
    summary: "PRD 항목, 수용 기준, 관련 태스크를 연결합니다.",
    componentKind: "requirements_map",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["REQ", "AC", "Trace"],
    icon: FileText,
  },
  {
    key: "daci-log",
    departmentId: "planning",
    title: "DACI/결정 로그",
    summary: "Driver, Approver, Contributor, Informed 구조로 의사결정을 남깁니다.",
    componentKind: "decision_log",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Driver", "Approver", "Decision"],
    icon: CheckCircle2,
  },
  {
    key: "pr-review-queue",
    departmentId: "dev",
    title: "PR/리뷰 큐",
    summary: "PR 상태, 리뷰 대기, 수정 요청을 개발 흐름에 맞춰 보여줍니다.",
    componentKind: "review_queue",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Open PR", "Review", "Change"],
    icon: GitPullRequest,
  },
  {
    key: "build-test-status",
    departmentId: "dev",
    title: "빌드/테스트 상태",
    summary: "빌드 결과와 테스트 실패를 프로젝트별로 추적합니다.",
    componentKind: "build_status",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Build", "Test", "Failure"],
    icon: Code2,
  },
  {
    key: "dora-flow",
    departmentId: "dev",
    title: "DORA 흐름 지표",
    summary: "배포 빈도, 리드타임, 복구 시간, 변경 실패율을 봅니다.",
    componentKind: "dora_metrics",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Lead time", "Deploy", "MTTR"],
    icon: Activity,
  },
  {
    key: "worktree-branch",
    departmentId: "dev",
    title: "워크트리/브랜치 상태",
    summary: "브랜치, 작업트리, 충돌 위험을 개발 부서 관점으로 정리합니다.",
    componentKind: "git_state",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Branch", "Dirty", "Ahead"],
    icon: BriefcaseBusiness,
  },
  {
    key: "design-workspace",
    departmentId: "design",
    title: "Project Design Workspace",
    summary: "Open CoDesign 참고형 작업실로 버전 이력, 코멘트 핀, responsive preview, export 이벤트를 남깁니다.",
    componentKind: "design_workspace",
    entryPoints: ["global_department_tab", "office_room", "project_detail"],
    metrics: ["Version", "Pins", "Export"],
    icon: PanelsTopLeft,
  },
  {
    key: "test-matrix",
    departmentId: "qa",
    title: "테스트 매트릭스",
    summary: "요구사항, 브라우저, 해상도, 테스트 상태를 매트릭스로 관리합니다.",
    componentKind: "test_matrix",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Case", "Env", "Pass"],
    icon: TestTube2,
  },
  {
    key: "regression-status",
    departmentId: "qa",
    title: "회귀 테스트 현황",
    summary: "릴리스 전 회귀 테스트 진행률과 실패 항목을 봅니다.",
    componentKind: "regression_status",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Suite", "Fail", "Retry"],
    icon: TimerReset,
  },
  {
    key: "defect-coverage",
    departmentId: "qa",
    title: "결함/커버리지",
    summary: "결함 밀도, 커버리지, 미해결 품질 리스크를 추적합니다.",
    componentKind: "quality_dashboard",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Bug", "Coverage", "Risk"],
    icon: LayoutDashboard,
  },
  {
    key: "release-go-no-go",
    departmentId: "qa",
    title: "릴리스 GO/NO-GO",
    summary: "릴리스 승인 기준과 보류 사유를 기록합니다.",
    componentKind: "release_gate",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Gate", "Blocker", "Signoff"],
    icon: CheckCircle2,
  },
  {
    key: "security-gates",
    departmentId: "devsecops",
    title: "보안 게이트",
    summary: "릴리스 전 보안 체크와 승인 상태를 관리합니다.",
    componentKind: "security_gate",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Gate", "Policy", "Approval"],
    icon: ShieldCheck,
  },
  {
    key: "vulnerability-dashboard",
    departmentId: "devsecops",
    title: "취약점 대시보드",
    summary: "코드, 의존성, 컨테이너 취약점 흐름을 봅니다.",
    componentKind: "vulnerability_dashboard",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Critical", "High", "SLA"],
    icon: Siren,
  },
  {
    key: "scanning-workbench",
    departmentId: "devsecops",
    title: "secret/code/dependency scanning",
    summary: "secret, 코드, 의존성 스캔 이벤트를 프로젝트별로 남깁니다.",
    componentKind: "scan_dashboard",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Secret", "Code", "Dependency"],
    icon: Code2,
  },
  {
    key: "sbom-approval",
    departmentId: "devsecops",
    title: "SBOM/승인 이력",
    summary: "SBOM 생성, 검토, 승인 이력을 릴리스와 연결합니다.",
    componentKind: "sbom_history",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["SBOM", "License", "Approval"],
    icon: FileText,
  },
  {
    key: "slo-error-budget",
    departmentId: "operations",
    title: "SLO/error budget",
    summary: "SLO, error budget, 소진 속도를 운영 관점으로 봅니다.",
    componentKind: "slo_dashboard",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["SLO", "Burn", "Budget"],
    icon: Activity,
  },
  {
    key: "incident-timeline",
    departmentId: "operations",
    title: "인시던트 타임라인",
    summary: "장애 발생, 조치, 복구, 커뮤니케이션 기록을 정리합니다.",
    componentKind: "incident_timeline",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Detect", "Mitigate", "Resolve"],
    icon: Siren,
  },
  {
    key: "runbooks",
    departmentId: "operations",
    title: "런북",
    summary: "반복 운영 절차와 체크리스트를 프로젝트별로 연결합니다.",
    componentKind: "runbook",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Step", "Owner", "Updated"],
    icon: ClipboardList,
  },
  {
    key: "postmortem-actions",
    departmentId: "operations",
    title: "포스트모템/후속 조치",
    summary: "장애 회고, 원인, 예방 조치를 추적합니다.",
    componentKind: "postmortem",
    entryPoints: ["global_department_tab", "project_detail"],
    metrics: ["Cause", "Action", "Due"],
    icon: FileText,
  },
];

function formatTime(value: number): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getDepartmentLabel(department: Department | undefined, id: DepartmentComponentId): string {
  return department?.name_ko || department?.name || DEPARTMENT_FALLBACK_LABELS[id];
}

function projectLabel(project: Project | null): string {
  return project ? project.name : "프로젝트 없음";
}

export default function DepartmentComponentsView({
  departments,
  agents,
  tasks,
  activeDepartmentId,
  onActiveDepartmentChange,
  onCreateTask,
  onOpenDepartmentChat,
}: DepartmentComponentsViewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedComponentKey, setSelectedComponentKey] = useState("");
  const [modules, setModules] = useState<ProjectModuleManifest[]>([]);
  const [events, setEvents] = useState<ProjectComponentEvent[]>([]);
  const [designBrief, setDesignBrief] = useState("메인 화면 반응형 디자인 검토와 export 후보를 정리합니다.");
  const [loading, setLoading] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  );

  const activeId = useMemo<DepartmentComponentId>(() => {
    return DEPARTMENT_ORDER.includes(activeDepartmentId as DepartmentComponentId)
      ? (activeDepartmentId as DepartmentComponentId)
      : "pmo";
  }, [activeDepartmentId]);

  const activeDepartment = departmentById.get(activeId);
  const activeComponents = useMemo(
    () => COMPONENTS.filter((component) => component.departmentId === activeId),
    [activeId],
  );
  const selectedComponent = useMemo(
    () => activeComponents.find((component) => component.key === selectedComponentKey) ?? activeComponents[0] ?? null,
    [activeComponents, selectedComponentKey],
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  );
  const selectedModule = useMemo(
    () => modules.find((module) => module.module_key === selectedComponent?.key) ?? null,
    [modules, selectedComponent],
  );
  const departmentTasks = useMemo(() => tasks.filter((task) => task.department_id === activeId), [activeId, tasks]);
  const departmentAgents = useMemo(
    () => agents.filter((agent) => agent.department_id === activeId),
    [activeId, agents],
  );
  const leader = useMemo(
    () => departmentAgents.find((agent) => agent.role === "team_leader") ?? departmentAgents[0] ?? null,
    [departmentAgents],
  );

  const refreshEvents = useCallback(async () => {
    if (!selectedProject) {
      setEvents([]);
      return;
    }
    const nextEvents = await getProjectComponentEvents(selectedProject.id, { departmentId: activeId });
    setEvents(nextEvents);
  }, [activeId, selectedProject]);

  useEffect(() => {
    if (!activeComponents.some((component) => component.key === selectedComponentKey)) {
      setSelectedComponentKey(activeComponents[0]?.key ?? "");
    }
  }, [activeComponents, selectedComponentKey]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getProjects({ page: 1, page_size: 50 })
      .then((result) => {
        if (!alive) return;
        setProjects(result.projects);
        setSelectedProjectId((current) => current || result.projects[0]?.id || "");
      })
      .catch((error) => {
        console.error("Load department component projects failed:", error);
        if (alive) setErrorMessage("프로젝트 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getModules({ departmentId: activeId })
      .then((nextModules) => {
        if (alive) setModules(nextModules);
      })
      .catch((error) => {
        console.error("Load department modules failed:", error);
        if (alive) setModules([]);
      });
    return () => {
      alive = false;
    };
  }, [activeId]);

  useEffect(() => {
    let alive = true;
    if (!selectedProject) {
      setEvents([]);
      return () => {
        alive = false;
      };
    }
    getProjectComponentEvents(selectedProject.id, { departmentId: activeId })
      .then((nextEvents) => {
        if (alive) setEvents(nextEvents);
      })
      .catch((error) => {
        console.error("Load project component events failed:", error);
        if (alive) setEvents([]);
      });
    return () => {
      alive = false;
    };
  }, [activeId, selectedProject]);

  const createEvent = useCallback(
    async (
      component: DepartmentComponentDefinition,
      eventType: string,
      title: string,
      summary: string,
      payload: Record<string, unknown> = {},
    ) => {
      if (!selectedProject) return;
      setEventBusy(true);
      try {
        const created = await createProjectComponentEvent(selectedProject.id, {
          department_id: component.departmentId,
          component_key: component.key,
          component_kind: component.componentKind,
          event_type: eventType,
          title,
          summary,
          payload,
          created_by: "department_components_ui",
        });
        setEvents((current) => [created, ...current]);
      } catch (error) {
        console.error("Create project component event failed:", error);
        setErrorMessage("컴포넌트 이력 저장에 실패했습니다.");
      } finally {
        setEventBusy(false);
      }
    },
    [selectedProject],
  );

  const handleCheckpoint = useCallback(() => {
    if (!selectedComponent) return;
    void createEvent(
      selectedComponent,
      "checkpoint",
      `${selectedComponent.title} 체크포인트`,
      selectedComponent.summary,
      {
        entry_points: selectedComponent.entryPoints,
      },
    );
  }, [createEvent, selectedComponent]);

  const handleDesignTaskCreate = useCallback(async () => {
    if (!selectedProject || !selectedComponent) return;
    await onCreateTask({
      title: `디자인 작업실: ${selectedProject.name}`,
      description: designBrief,
      department_id: "design",
      task_type: "design",
      priority: 2,
      project_id: selectedProject.id,
      project_path: selectedProject.project_path,
      workflow_meta_json: {
        source: "department_components",
        component_key: "design-workspace",
        component_kind: "design_workspace",
      },
    });
    await createEvent(selectedComponent, "task_created", "디자인 태스크 생성", designBrief, {
      project_id: selectedProject.id,
    });
    await refreshEvents();
  }, [createEvent, designBrief, onCreateTask, refreshEvents, selectedComponent, selectedProject]);

  const isDesignWorkspace = selectedComponent?.key === "design-workspace";

  return (
    <section className="space-y-3">
      <div className="command-panel px-4 py-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-center">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Department Components
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-50">부서별 컴포넌트</h2>
              <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-300">
                {getDepartmentLabel(activeDepartment, activeId)} · 컴포넌트 {activeComponents.length}개 · 이력{" "}
                {events.length}건
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 pb-1 sm:flex-nowrap sm:overflow-x-auto">
              {DEPARTMENT_ORDER.map((departmentId) => {
                const department = departmentById.get(departmentId);
                const active = activeId === departmentId;
                return (
                  <button
                    key={departmentId}
                    type="button"
                    onClick={() => onActiveDepartmentChange(departmentId)}
                    className={`shrink-0 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? "border-cyan-300 bg-cyan-300/15 text-cyan-100"
                        : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {getDepartmentLabel(department, departmentId)}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="min-w-0 text-xs font-semibold text-slate-300">
            프로젝트
            <select
              value={selectedProject?.id ?? ""}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              title={selectedProject ? selectedProject.project_path : undefined}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
            >
              {projects.length === 0 && <option value="">프로젝트 없음</option>}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <div className="mt-1 truncate font-mono text-[11px] text-slate-500" title={selectedProject?.project_path}>
              {selectedProject?.project_path ?? "프로젝트 경로 없음"}
            </div>
          </label>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[250px_minmax(390px,1fr)_300px] 2xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="command-panel p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-100">컴포넌트</h3>
            <span className="font-mono text-[11px] text-slate-500">{activeComponents.length}</span>
          </div>
          <div className="space-y-2">
            {activeComponents.map((component) => {
              const Icon = component.icon;
              const active = selectedComponent?.key === component.key;
              return (
                <button
                  key={component.key}
                  type="button"
                  onClick={() => setSelectedComponentKey(component.key)}
                  className={`w-full rounded-md border p-3 text-left transition ${
                    active
                      ? "border-cyan-300 bg-cyan-300/10"
                      : "border-slate-700 bg-slate-950/45 hover:border-slate-500"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-bold leading-5 text-slate-100">{component.title}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {component.metrics.slice(0, 3).map((metric) => (
                      <span
                        key={metric}
                        className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400"
                      >
                        {metric}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="command-panel min-h-[620px] p-4">
          {selectedComponent && (
            <div className="flex h-full min-w-0 flex-col">
              <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-50">{selectedComponent.title}</h3>
                    {selectedModule?.project_scoped && (
                      <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                        project scoped
                      </span>
                    )}
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{selectedComponent.summary}</p>
                </div>
                <button
                  type="button"
                  disabled={!selectedProject || eventBusy}
                  onClick={handleCheckpoint}
                  className="shrink-0 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  이력 남기기
                </button>
              </div>

              {isDesignWorkspace ? (
                <div className="grid flex-1 gap-4 pt-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="flex min-w-0 flex-col gap-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">
                        Open CoDesign Reference Flow
                      </div>
                      <h4 className="mt-1 text-lg font-bold text-slate-50">디자인 작업실</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        디자인 브리프, 반응형 preview, export 이벤트를 한 화면에서 운영합니다.
                      </p>
                    </div>
                    <label className="flex min-h-0 flex-1 flex-col text-xs font-semibold text-slate-300">
                      디자인 브리프
                      <textarea
                        value={designBrief}
                        onChange={(event) => setDesignBrief(event.target.value)}
                        className="mt-2 min-h-[260px] flex-1 resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none transition focus:border-amber-300"
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!selectedProject || eventBusy}
                        onClick={() => void handleDesignTaskCreate()}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-300/40 bg-amber-300/15 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <FileText size={16} aria-hidden="true" />
                        디자인 태스크 생성
                      </button>
                      {["html", "pdf", "pptx", "zip", "markdown"].map((format) => (
                        <button
                          key={format}
                          type="button"
                          disabled={!selectedProject || eventBusy}
                          onClick={() =>
                            void createEvent(
                              selectedComponent,
                              "export",
                              `디자인 ${format.toUpperCase()} export`,
                              designBrief,
                              { format },
                            )
                          }
                          className="rounded-md border border-slate-600 bg-slate-800 px-2.5 py-2 text-[11px] font-semibold uppercase text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {format}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                    <div className="mb-3 text-xs font-semibold text-slate-300">Responsive preview</div>
                    <div className="space-y-3">
                      {[
                        ["mobile", "9 / 16", "max-w-[120px]"],
                        ["tablet", "4 / 5", "max-w-[170px]"],
                        ["desktop", "16 / 9", "max-w-full"],
                      ].map(([label, ratio, widthClass]) => (
                        <div key={label} className="rounded-md border border-slate-700 bg-slate-900 p-2">
                          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
                            <span>{label}</span>
                            <span>{ratio}</span>
                          </div>
                          <div
                            className={`mx-auto flex w-full ${widthClass} items-center justify-center rounded border border-dashed border-slate-600 bg-slate-950/60 text-[10px] text-slate-500`}
                            style={{ aspectRatio: ratio }}
                          >
                            preview
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 pt-4">
                  <div className="rounded-lg border border-slate-700 bg-slate-950/45 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">운영 지표</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                      {selectedComponent.metrics.map((metric) => (
                        <div key={metric} className="rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2">
                          <div className="text-sm font-semibold text-slate-100">{metric}</div>
                          <div className="mt-1 text-xs text-slate-500">프로젝트 연결 후 실제 데이터 소스 연동</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950/45 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">진입점</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedComponent.entryPoints.map((entryPoint) => (
                        <span
                          key={entryPoint}
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
                        >
                          {entryPoint}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950/45 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">프로젝트</div>
                    <div className="mt-3 text-sm font-bold text-slate-100">{projectLabel(selectedProject)}</div>
                    <div className="mt-2 break-all font-mono text-xs leading-5 text-slate-500">
                      {selectedProject?.project_path ?? "선택된 프로젝트가 없습니다."}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        <aside className="space-y-3">
          <div className="command-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Department</div>
                <h3 className="mt-1 text-lg font-bold text-slate-50">
                  {getDepartmentLabel(activeDepartment, activeId)}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  담당 {departmentAgents.length}명 · 진행 태스크 {departmentTasks.length}개
                </p>
              </div>
              <button
                type="button"
                disabled={!activeDepartment || !leader}
                onClick={() => activeDepartment && onOpenDepartmentChat(activeDepartment)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-slate-200 transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                title="팀장 채팅"
              >
                <MessageSquareText size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="command-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100">연결 모듈</h3>
              <span className="font-mono text-[11px] text-slate-500">{modules.length}</span>
            </div>
            <div className="space-y-2">
              {modules.length === 0 && <div className="text-sm text-slate-500">등록된 부서 모듈이 없습니다.</div>}
              {modules.map((module) => (
                <div key={module.module_key} className="rounded-md border border-slate-700 bg-slate-950/55 p-3">
                  <div className="text-sm font-semibold text-slate-100">{module.name}</div>
                  <div className="mt-1 line-clamp-3 text-xs leading-5 text-slate-400">{module.summary}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="command-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100">프로젝트 컴포넌트 이력</h3>
              {loading && <span className="text-[11px] text-slate-500">loading</span>}
            </div>
            <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
              {!selectedProject && <div className="text-sm text-slate-500">프로젝트를 선택하세요.</div>}
              {selectedProject && events.length === 0 && (
                <div className="text-sm text-slate-500">아직 기록된 이력이 없습니다.</div>
              )}
              {events.map((event) => (
                <div key={event.id} className="rounded-md border border-slate-700 bg-slate-950/55 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
                      {event.event_type}
                    </span>
                    <span className="text-[11px] text-slate-500">{formatTime(event.created_at)}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-100">{event.title}</div>
                  {event.summary && (
                    <div className="mt-1 line-clamp-3 text-xs leading-5 text-slate-400">{event.summary}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
