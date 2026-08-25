import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileCheck2,
  GitBranch,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import type { ControlPlaneDashboardProject, ControlPlaneDashboardState } from "../../api/control-plane-dashboard";
import type { Agent, CompanyStats, Task } from "../../types";
import type { CommandCenterView } from "./useCommandCenterNavigation";

type Props = {
  connected: boolean;
  view: CommandCenterView;
  selectedId: string | null;
  tasks: Task[];
  agents: Agent[];
  stats: CompanyStats | null;
  dashboard: ControlPlaneDashboardState | null;
  loading: boolean;
  error: string | null;
  decisionInboxCount: number;
  decisionInboxLoading: boolean;
  onOpenDecisionInbox: () => void;
  onCreateCommand: (input: CommandCreateInput) => Promise<string>;
  onRunTask: (id: string) => Promise<void>;
  onStopTask: (id: string) => Promise<void>;
  onResumeTask: (id: string) => Promise<void>;
  onOpenTerminal: (id: string) => void;
  onNavigate: (view: CommandCenterView, selectedId?: string | null) => void;
  onRetry: () => void;
};

export type CommandCreateInput = {
  title: string;
  departmentId: string;
  runAfterCreate: boolean;
};

const MASTER_ROLES = [
  { id: "planning", label: "기획 마스터" },
  { id: "development", label: "개발 마스터" },
  { id: "design", label: "디자인 마스터" },
  { id: "quality", label: "품질 마스터" },
  { id: "operations", label: "운영 마스터" },
  { id: "instructor", label: "외부강사 마스터" },
] as const;

const ROUTES = [
  "M24 38 H244 C284 38 284 18 324 18 H568 C608 18 608 48 648 48 H920",
  "M24 104 H198 C238 104 238 82 278 82 H530 C570 82 570 112 610 112 H920",
  "M24 170 H258 C298 170 298 144 338 144 H584 C624 144 624 176 664 176 H920",
  "M24 236 H184 C224 236 224 212 264 212 H512 C552 212 552 242 592 242 H920",
  "M24 302 H236 C276 302 276 278 316 278 H556 C596 278 596 308 636 308 H920",
] as const;

export function taskStatusLabel(status: Task["status"]): string {
  return {
    inbox: "판단 대기",
    planned: "계획됨",
    collaborating: "협업 중",
    in_progress: "실행 중",
    review: "검토 중",
    done: "완료",
    pending: "보류",
    cancelled: "취소",
  }[status];
}

function projectStatus(project: ControlPlaneDashboardProject): string {
  if (!project.exists || project.git.status === "missing") return "소스 없음";
  if (project.git.status === "dirty") return `변경 ${project.git.dirty_count}`;
  if (project.lifecycle_status === "archived") return "보관 이력";
  if (project.lifecycle_status === "completed") return "완료 이력";
  if (project.lifecycle_status === "candidate") return "후보";
  return "정상";
}

function projectTone(project: ControlPlaneDashboardProject): string {
  if (!project.exists || project.git.status === "missing") return "service";
  if (project.git.status === "dirty") return "warning";
  if (project.lifecycle_status === "candidate") return "active";
  if (project.lifecycle_status === "archived" || project.lifecycle_status === "completed") return "historical";
  return "healthy";
}

export function selectDonggriCompanyActiveSpec(dashboard: ControlPlaneDashboardState | null) {
  if (!dashboard) return null;
  const normalizedTarget = "/repos/donggricompany";
  return (
    dashboard.active_specs.find((spec) =>
      [spec.related_repo, ...spec.related_repos].some((repo) =>
        repo.replace(/\\/g, "/").toLowerCase().replace(/\/$/, "").endsWith(normalizedTarget),
      ),
    ) ?? null
  );
}

function DashboardState({ loading, error, onRetry }: Pick<Props, "loading" | "error" | "onRetry">) {
  if (loading) {
    return (
      <div className="cc-map-skeleton" aria-label="Control Plane 요약 불러오는 중" role="status">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="cc-skeleton-line" key={index} style={{ width: `${82 - index * 7}%` }} />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="cc-inline-error" role="alert">
        <AlertTriangle aria-hidden="true" size={22} />
        <div>
          <strong>Control Plane 요약을 불러오지 못했습니다.</strong>
          <span>업무와 에이전트 정보는 계속 사용할 수 있습니다. {error}</span>
        </div>
        <button type="button" onClick={onRetry}>
          <RefreshCw aria-hidden="true" size={17} /> 다시 시도
        </button>
      </div>
    );
  }
  return null;
}

function TodayView(props: Props) {
  const [command, setCommand] = useState("");
  const [departmentId, setDepartmentId] = useState("planning");
  const [commandState, setCommandState] = useState<"idle" | "saving" | "saved" | "started" | "error">("idle");
  const running = props.tasks.filter((task) => task.status === "in_progress" || task.status === "collaborating");
  const waiting = props.tasks.filter((task) => task.status === "inbox" || task.status === "pending");
  const review = props.tasks.filter((task) => task.status === "review");
  const recent = [...props.tasks].sort((a, b) => b.updated_at - a.updated_at).slice(0, 6);
  const projects = props.dashboard?.projects.slice(0, 5) ?? [];
  const workingAgents = props.agents.filter((agent) => agent.status === "working").length;
  const activeSpec = selectDonggriCompanyActiveSpec(props.dashboard);
  const submitCommand = async (runAfterCreate: boolean) => {
    const title = command.trim();
    if (!title || commandState === "saving") return;
    setCommandState("saving");
    try {
      const taskId = await props.onCreateCommand({ title, departmentId, runAfterCreate });
      setCommand("");
      setCommandState(runAfterCreate ? "started" : "saved");
      props.onNavigate("tasks", taskId);
    } catch {
      setCommandState("error");
    }
  };

  return (
    <>
      <section className="cc-decision-strip" aria-labelledby="cc-title">
        <div className="cc-title-block">
          <span className="cc-eyebrow">DECISION FIRST</span>
          <h1 id="cc-title">오늘의 운영 판단</h1>
          <p>결정할 것부터 보고, 근거를 확인한 뒤 실행합니다.</p>
        </div>
        <div className="cc-decision-counts" aria-label="오늘의 업무 집계">
          <div>
            <strong>{props.decisionInboxCount}</strong>
            <span>승인·응답</span>
          </div>
          <div>
            <strong>{waiting.length}</strong>
            <span>판단 대기</span>
          </div>
          <div>
            <strong>{running.length}</strong>
            <span>실행 중</span>
          </div>
          <div>
            <strong>{review.length}</strong>
            <span>검토 중</span>
          </div>
        </div>
        <button
          className="cc-primary-action"
          type="button"
          onClick={props.onOpenDecisionInbox}
          disabled={props.decisionInboxLoading}
        >
          <span>{props.decisionInboxLoading ? "불러오는 중" : "판단함 열기"}</span>
          <ArrowRight aria-hidden="true" size={20} />
        </button>
      </section>

      <section className="cc-live-overview" aria-labelledby="cc-live-title">
        <header>
          <div>
            <span className="cc-eyebrow">LIVE OVERVIEW</span>
            <h2 id="cc-live-title">현재 운영 상황</h2>
          </div>
          <div className="cc-live-meta">
            {props.dashboard?.runtime.data_mode === "isolated" && (
              <span className="is-isolated">격리 테스트 데이터</span>
            )}
            <span>
              {props.dashboard
                ? `${Math.round(props.dashboard.runtime.refresh_interval_ms / 1000)}초 저부하 갱신`
                : "연결 확인 중"}
            </span>
          </div>
        </header>
        <div className="cc-live-grid">
          <article className={props.connected ? "is-healthy" : "is-service"}>
            <span>앱 서버</span>
            <strong>{props.connected ? "연결됨" : "끊김"}</strong>
            <small>loopback runtime</small>
          </article>
          <article className={running.length > 0 ? "is-active" : ""}>
            <span>실행 업무</span>
            <strong>{running.length}</strong>
            <small>실제 task 상태</small>
          </article>
          <article className={workingAgents > 0 ? "is-active" : ""}>
            <span>작업 에이전트</span>
            <strong>
              {workingAgents}/{props.agents.length}
            </strong>
            <small>실시간 연결 데이터</small>
          </article>
          <article className="is-active">
            <span>활성 단계</span>
            <strong>{activeSpec?.phase ?? "확인 중"}</strong>
            <small>{activeSpec?.status ?? "spec projection"}</small>
          </article>
          <article className={(props.dashboard?.counts.dirty ?? 0) > 0 ? "is-warning" : "is-healthy"}>
            <span>변경 프로젝트</span>
            <strong>{props.dashboard?.counts.dirty ?? 0}</strong>
            <small>Git 변경 감지</small>
          </article>
          <article className={props.dashboard?.degraded ? "is-warning" : "is-healthy"}>
            <span>Control Plane</span>
            <strong>{props.dashboard?.degraded ? "주의" : props.dashboard ? "정상" : "확인 중"}</strong>
            <small>parse {props.dashboard?.parse_error_count ?? 0}</small>
          </article>
        </div>
        {activeSpec?.next_recommended_action && (
          <p className="cc-live-next">
            <FileCheck2 aria-hidden="true" size={18} />
            <span>
              <strong>다음 안전 작업</strong>
              {activeSpec.next_recommended_action}
            </span>
          </p>
        )}
        <form
          className="cc-command-bar"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCommand(false);
          }}
        >
          <label htmlFor="cc-command-input">Codex 업무 명령</label>
          <div className="cc-command-fields">
            <select
              aria-label="담당 마스터 역할"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              {MASTER_ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
            <input
              id="cc-command-input"
              maxLength={160}
              value={command}
              onChange={(event) => {
                setCommand(event.target.value);
                if (commandState !== "idle") setCommandState("idle");
              }}
              placeholder="할 일을 짧게 입력하세요"
            />
          </div>
          <div className="cc-command-actions">
            <button type="submit" disabled={!command.trim() || commandState === "saving"}>
              {commandState === "saving" ? "처리 중" : "업무 등록"}
            </button>
            <button
              className="is-run"
              type="button"
              disabled={!command.trim() || commandState === "saving"}
              onClick={() => void submitCommand(true)}
            >
              등록 후 실행 <ArrowRight aria-hidden="true" size={17} />
            </button>
          </div>
          <small aria-live="polite">
            {commandState === "saved"
              ? "업무가 역할에 등록되었습니다."
              : commandState === "started"
                ? "업무가 역할에 배정되어 실행을 시작했습니다."
                : commandState === "error"
                  ? "등록하지 못했습니다. 연결 상태를 확인하세요."
                  : "등록만 하거나, 명시적으로 등록 후 실행할 수 있습니다."}
          </small>
        </form>
      </section>

      <section className="cc-map-section" aria-labelledby="cc-map-title">
        <div className="cc-section-heading">
          <div>
            <h2 id="cc-map-title">프로젝트 운행도</h2>
            <p>루트 registry와 실제 Git 상태를 하나의 노선으로 읽습니다.</p>
          </div>
          <span className="cc-source-identity">
            <GitBranch aria-hidden="true" size={17} />
            {props.dashboard ? `source ${props.dashboard.source_epoch.slice(0, 12)}` : "source 확인 중"}
          </span>
        </div>
        <DashboardState {...props} />
        {!props.loading && !props.error && projects.length === 0 && (
          <div className="cc-empty-state">
            <GitBranch aria-hidden="true" size={24} />
            <strong>표시할 프로젝트가 없습니다.</strong>
            <span>registry에 활성 프로젝트가 등록되면 노선이 생성됩니다.</span>
          </div>
        )}
        {!props.loading && !props.error && projects.length > 0 && (
          <div className="cc-map-wrap">
            <svg
              className="cc-route-map"
              viewBox="0 0 944 340"
              role="img"
              aria-labelledby="cc-route-title cc-route-desc"
            >
              <title id="cc-route-title">프로젝트 상태 노선도</title>
              <desc id="cc-route-desc">최대 다섯 개 프로젝트의 실제 Git 상태를 색상과 노선으로 표시합니다.</desc>
              <g className="cc-map-grid" aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => (
                  <line key={`v${i}`} x1={80 * i} x2={80 * i} y1="0" y2="340" />
                ))}
                {Array.from({ length: 6 }, (_, i) => (
                  <line key={`h${i}`} x1="0" x2="944" y1={68 * i} y2={68 * i} />
                ))}
              </g>
              {projects.map((project, index) => (
                <g className={`cc-route cc-route-${projectTone(project)}`} key={project.key}>
                  <path d={ROUTES[index]} />
                  <circle cx="24" cy={38 + 66 * index} r="6" />
                  <circle
                    cx="920"
                    cy={index === 0 ? 48 : index === 1 ? 112 : index === 2 ? 176 : index === 3 ? 242 : 308}
                    r="8"
                  />
                </g>
              ))}
            </svg>
            <div className="cc-route-labels">
              {projects.map((project, index) => (
                <a
                  className={`cc-project-route cc-project-route-${projectTone(project)}`}
                  href={`/?view=projects&project=${encodeURIComponent(project.key)}`}
                  key={project.key}
                  onClick={(event) => {
                    event.preventDefault();
                    props.onNavigate("projects", project.key);
                  }}
                >
                  <span className="cc-route-index">{index + 1}</span>
                  <span className="cc-project-copy">
                    <strong>{project.key}</strong>
                    <small>
                      {projectStatus(project)} · {project.git.branch ?? project.lifecycle_status}
                    </small>
                  </span>
                  <ArrowRight aria-hidden="true" size={17} />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="cc-timeline" aria-labelledby="cc-timeline-title">
        <div className="cc-section-heading">
          <div>
            <h2 id="cc-timeline-title">최근 업무 흐름</h2>
            <p>최근 갱신된 실제 업무를 상태 순서로 봅니다.</p>
          </div>
          <a
            href="/?view=tasks"
            onClick={(event) => {
              event.preventDefault();
              props.onNavigate("tasks");
            }}
          >
            전체 업무 <ArrowRight aria-hidden="true" size={16} />
          </a>
        </div>
        {recent.length === 0 ? (
          <div className="cc-empty-timeline">업무가 등록되면 이곳에 흐름이 표시됩니다.</div>
        ) : (
          <ol className="cc-timeline-list">
            {recent.map((task) => (
              <li className={`cc-task-state-${task.status}`} key={task.id}>
                <span className="cc-task-marker" aria-hidden="true" />
                <button type="button" onClick={() => props.onNavigate("tasks", task.id)}>
                  <strong>{task.title}</strong>
                  <small>{taskStatusLabel(task.status)}</small>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function ProjectsView(props: Props) {
  const projects = props.dashboard?.projects ?? [];
  const selected = projects.find((project) => project.key === props.selectedId) ?? null;
  return (
    <section className="cc-native-view" aria-labelledby="cc-title">
      <header className="cc-view-header">
        <div>
          <span className="cc-eyebrow">ROOT REGISTRY</span>
          <h1 id="cc-title">프로젝트</h1>
          <p>Control Plane의 등록 상태와 로컬 Git 상태를 함께 확인합니다.</p>
        </div>
        <strong>{projects.length}</strong>
      </header>
      <DashboardState {...props} />
      {!props.loading && !props.error && projects.length === 0 && (
        <div className="cc-empty-state">
          <Layers3 aria-hidden="true" />
          <strong>활성 프로젝트가 없습니다.</strong>
          <span>이 화면은 별도 목록을 만들지 않고 root registry만 투영합니다.</span>
        </div>
      )}
      <div className={`cc-master-detail ${selected ? "has-detail" : ""}`}>
        <div className="cc-card-list" aria-label="프로젝트 목록">
          {projects.map((project) => (
            <a
              href={`/?view=projects&project=${encodeURIComponent(project.key)}`}
              key={project.key}
              className={selected?.key === project.key ? "is-selected" : ""}
              onClick={(event) => {
                event.preventDefault();
                props.onNavigate("projects", project.key);
              }}
            >
              <span className={`cc-status-mark is-${projectTone(project)}`} aria-hidden="true" />
              <span>
                <strong>{project.key}</strong>
                <small>{project.summary ?? "등록 프로젝트"}</small>
              </span>
              <em>{projectStatus(project)}</em>
            </a>
          ))}
        </div>
        {selected && (
          <aside className="cc-detail-panel" aria-label={`${selected.key} 상세`}>
            <button className="cc-detail-close" type="button" onClick={() => props.onNavigate("projects")}>
              목록으로
            </button>
            <span className="cc-eyebrow">PROJECT DETAIL</span>
            <h2>{selected.key}</h2>
            <p>{selected.summary ?? "요약이 등록되지 않았습니다."}</p>
            <dl>
              <div>
                <dt>수명주기</dt>
                <dd>{selected.lifecycle_status ?? "미지정"}</dd>
              </div>
              <div>
                <dt>Git</dt>
                <dd>{projectStatus(selected)}</dd>
              </div>
              <div>
                <dt>브랜치</dt>
                <dd>{selected.git.branch ?? "없음"}</dd>
              </div>
              <div>
                <dt>원격 차이</dt>
                <dd>
                  ahead {selected.git.ahead} / behind {selected.git.behind}
                </dd>
              </div>
            </dl>
          </aside>
        )}
      </div>
    </section>
  );
}

function TasksView(props: Props) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const ordered = [...props.tasks].sort((a, b) => b.updated_at - a.updated_at);
  const selected = ordered.find((task) => task.id === props.selectedId) ?? null;
  const runAction = async (action: "run" | "stop" | "resume", taskId: string) => {
    setBusyAction(action);
    try {
      if (action === "run") await props.onRunTask(taskId);
      if (action === "stop") await props.onStopTask(taskId);
      if (action === "resume") await props.onResumeTask(taskId);
    } finally {
      setBusyAction(null);
    }
  };
  return (
    <section className="cc-native-view" aria-labelledby="cc-title">
      <header className="cc-view-header">
        <div>
          <span className="cc-eyebrow">WORKFLOW</span>
          <h1 id="cc-title">업무</h1>
          <p>실제 업무의 현재 상태, 담당, 실행 근거를 한 화면에서 읽습니다.</p>
        </div>
        <strong>{ordered.length}</strong>
      </header>
      <div className="cc-task-summary" aria-label="업무 상태 요약">
        {(["inbox", "in_progress", "review", "done"] as const).map((status) => (
          <div key={status}>
            <strong>{ordered.filter((task) => task.status === status).length}</strong>
            <span>{taskStatusLabel(status)}</span>
          </div>
        ))}
      </div>
      <div className={`cc-master-detail ${selected ? "has-detail" : ""}`}>
        <div className="cc-card-list" aria-label="업무 목록">
          {ordered.map((task) => (
            <a
              href={`/?view=tasks&task=${encodeURIComponent(task.id)}`}
              key={task.id}
              className={selected?.id === task.id ? "is-selected" : ""}
              onClick={(event) => {
                event.preventDefault();
                props.onNavigate("tasks", task.id);
              }}
            >
              <span className={`cc-status-mark is-task-${task.status}`} aria-hidden="true" />
              <span>
                <strong>{task.title}</strong>
                <small>{task.description ?? task.project_path ?? "상세 설명 없음"}</small>
              </span>
              <em>{taskStatusLabel(task.status)}</em>
            </a>
          ))}
          {ordered.length === 0 && <div className="cc-list-empty">등록된 업무가 없습니다.</div>}
        </div>
        {selected && (
          <aside className="cc-detail-panel" aria-label={`${selected.title} 상세`}>
            <button className="cc-detail-close" type="button" onClick={() => props.onNavigate("tasks")}>
              목록으로
            </button>
            <span className="cc-eyebrow">TASK DETAIL</span>
            <h2>{selected.title}</h2>
            <p>{selected.description ?? "설명이 등록되지 않았습니다."}</p>
            <dl>
              <div>
                <dt>상태</dt>
                <dd>{taskStatusLabel(selected.status)}</dd>
              </div>
              <div>
                <dt>우선순위</dt>
                <dd>{selected.priority}</dd>
              </div>
              <div>
                <dt>담당</dt>
                <dd>{selected.agent_name_ko ?? selected.agent_name ?? selected.assigned_agent_id ?? "미지정"}</dd>
              </div>
              <div>
                <dt>경로</dt>
                <dd>{selected.project_path ?? "미지정"}</dd>
              </div>
            </dl>
            <div className="cc-task-controls" aria-label="업무 실행 제어">
              {(selected.status === "inbox" || selected.status === "planned") && (
                <button type="button" disabled={busyAction !== null} onClick={() => void runAction("run", selected.id)}>
                  실행
                </button>
              )}
              {(selected.status === "in_progress" || selected.status === "collaborating") && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void runAction("stop", selected.id)}
                >
                  중지
                </button>
              )}
              {selected.status === "pending" && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void runAction("resume", selected.id)}
                >
                  재개
                </button>
              )}
              <button type="button" onClick={() => props.onOpenTerminal(selected.id)}>
                실행 로그
              </button>
            </div>
            {selected.result?.trim() && (
              <div className="cc-task-result">
                <strong>실행 결과</strong>
                <pre>{selected.result}</pre>
              </div>
            )}
            {selected.status === "inbox" && (
              <button className="cc-primary-inline" type="button" onClick={props.onOpenDecisionInbox}>
                판단함에서 처리 <ArrowRight aria-hidden="true" size={17} />
              </button>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

function AgentsView(props: Props) {
  const selected = props.agents.find((agent) => agent.id === props.selectedId) ?? null;
  return (
    <section className="cc-native-view" aria-labelledby="cc-title">
      <header className="cc-view-header">
        <div>
          <span className="cc-eyebrow">MASTERS & SKILLS</span>
          <h1 id="cc-title">에이전트·Skill</h1>
          <p>실제 에이전트와 등록된 전문성·검토 렌즈를 함께 봅니다.</p>
        </div>
        <strong>{props.agents.length}</strong>
      </header>
      <div className={`cc-master-detail ${selected ? "has-detail" : ""}`}>
        <div className="cc-agent-grid" aria-label="에이전트 목록">
          {props.agents.map((agent) => (
            <a
              href={`/?view=agents&agent=${encodeURIComponent(agent.id)}`}
              key={agent.id}
              className={selected?.id === agent.id ? "is-selected" : ""}
              onClick={(event) => {
                event.preventDefault();
                props.onNavigate("agents", agent.id);
              }}
            >
              <span className="cc-agent-avatar" aria-hidden="true">
                {agent.avatar_emoji || "◉"}
              </span>
              <span>
                <strong>{agent.name_ko || agent.name}</strong>
                <small>{agent.department?.name ?? agent.family ?? agent.role}</small>
              </span>
              <em>{agent.status === "working" ? "작업 중" : "대기"}</em>
            </a>
          ))}
          {props.agents.length === 0 && <div className="cc-list-empty">연결된 에이전트가 없습니다.</div>}
        </div>
        {selected && (
          <aside className="cc-detail-panel" aria-label={`${selected.name_ko} 상세`}>
            <button className="cc-detail-close" type="button" onClick={() => props.onNavigate("agents")}>
              목록으로
            </button>
            <span className="cc-eyebrow">AGENT CAPABILITY</span>
            <h2>{selected.name_ko || selected.name}</h2>
            <p>{selected.personality ?? "등록된 에이전트 프로필입니다."}</p>
            <dl>
              <div>
                <dt>상태</dt>
                <dd>{selected.status === "working" ? "작업 중" : "대기"}</dd>
              </div>
              <div>
                <dt>역할</dt>
                <dd>{selected.role}</dd>
              </div>
              <div>
                <dt>실행 제공자</dt>
                <dd>{selected.cli_provider}</dd>
              </div>
              <div>
                <dt>완료 업무</dt>
                <dd>{selected.stats_tasks_done}</dd>
              </div>
            </dl>
            <div className="cc-skill-tags" aria-label="전문성">
              {(
                selected.agent_profile?.specialties ??
                selected.workflow_profile?.review_lenses ?? [selected.specialization_key ?? "일반 실행"]
              ).map((skill) => (
                <span key={skill}>
                  <Sparkles aria-hidden="true" size={14} />
                  {skill}
                </span>
              ))}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

function SystemView(props: Props) {
  const dashboard = props.dashboard;
  return (
    <section className="cc-native-view" aria-labelledby="cc-title">
      <header className="cc-view-header">
        <div>
          <span className="cc-eyebrow">CONTROL PLANE</span>
          <h1 id="cc-title">시스템</h1>
          <p>소스 신원, 활성 spec, 투영 건전성을 읽기 전용으로 확인합니다.</p>
        </div>
        <span className={`cc-system-badge ${dashboard?.degraded ? "is-warning" : "is-healthy"}`}>
          {dashboard?.degraded ? "주의" : "정상"}
        </span>
      </header>
      <DashboardState {...props} />
      {dashboard && (
        <>
          <div className="cc-system-metrics">
            <div>
              <GitBranch aria-hidden="true" />
              <span>프로젝트</span>
              <strong>{dashboard.counts.projects}</strong>
            </div>
            <div>
              <CheckCircle2 aria-hidden="true" />
              <span>Clean</span>
              <strong>{dashboard.counts.clean}</strong>
            </div>
            <div>
              <AlertTriangle aria-hidden="true" />
              <span>Dirty</span>
              <strong>{dashboard.counts.dirty}</strong>
            </div>
            <div>
              <ShieldCheck aria-hidden="true" />
              <span>Parse error</span>
              <strong>{dashboard.parse_error_count}</strong>
            </div>
          </div>
          <div className="cc-system-grid">
            <article>
              <span className="cc-eyebrow">SOURCE IDENTITY</span>
              <h2>투영 경계</h2>
              <dl>
                <div>
                  <dt>source</dt>
                  <dd>{dashboard.source_epoch}</dd>
                </div>
                <div>
                  <dt>projection</dt>
                  <dd>{dashboard.projection_epoch}</dd>
                </div>
                <div>
                  <dt>생성 시각</dt>
                  <dd>{new Date(dashboard.generated_at).toLocaleString("ko-KR")}</dd>
                </div>
              </dl>
            </article>
            <article>
              <span className="cc-eyebrow">ACTIVE SPECS</span>
              <h2>현재 단계</h2>
              {dashboard.active_specs.map((spec) => (
                <div className="cc-spec-row" key={spec.id}>
                  <CircleDot aria-hidden="true" size={18} />
                  <span>
                    <strong>{spec.id}</strong>
                    <small>
                      {spec.phase} · {spec.status}
                    </small>
                    <p>{spec.next_recommended_action ?? "다음 안전 작업 미기록"}</p>
                  </span>
                </div>
              ))}
            </article>
          </div>
        </>
      )}
    </section>
  );
}

export default function CommandCenterViews(props: Props) {
  if (props.view === "projects") return <ProjectsView {...props} />;
  if (props.view === "tasks") return <TasksView {...props} />;
  if (props.view === "agents") return <AgentsView {...props} />;
  if (props.view === "system") return <SystemView {...props} />;
  return <TodayView {...props} />;
}
