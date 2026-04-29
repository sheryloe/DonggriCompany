import { localeName, type UiLanguage } from "../../i18n";
import type { Agent, Task } from "../../types";
import AgentAvatar from "../AgentAvatar";
import { getRankTier, taskStatusLabel, timeAgo, type TFunction } from "./model";

export interface DepartmentPerformance {
  id: string;
  name: string;
  icon: string;
  done: number;
  total: number;
  ratio: number;
  color: {
    bar: string;
    badge: string;
  };
}

const DEPARTMENT_KO_LABELS: Record<string, string> = {
  development: "개발",
  dev: "개발",
  "planning-architecture": "기획 및 설계",
  planning: "기획 및 설계",
  "ui-ux": "UI/UX",
  design: "UI/UX",
  "cicd-repo": "CI/CD 병합",
  devsecops: "CI/CD 병합",
  management: "관리",
  operations: "관리",
  pmo: "PMO",
  qa: "QA",
  bloggent: "블로그",
  "api-research": "API 전문",
  "security-approval": "보안/승인",
  "knowledge-docs": "지식/문서",
};

function departmentDisplayName(language: UiLanguage, dept: DepartmentPerformance): string {
  if (language !== "ko") return dept.name;
  return DEPARTMENT_KO_LABELS[dept.id] ?? dept.name;
}

interface DashboardDeptAndSquadProps {
  deptData: DepartmentPerformance[];
  workingAgents: Agent[];
  idleAgentsList: Agent[];
  agents: Agent[];
  language: UiLanguage;
  numberFormatter: Intl.NumberFormat;
  t: TFunction;
}

export function DashboardDeptAndSquad({
  deptData,
  workingAgents,
  idleAgentsList,
  agents,
  language,
  numberFormatter,
  t,
}: DashboardDeptAndSquadProps) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div className="game-panel p-5">
        <h2
          className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-wider"
          style={{ color: "var(--th-text-primary)" }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15 text-[10px] font-black text-blue-200">
            DEP
          </span>
          {t({ ko: "부서 성과", en: "DEPT. PERFORMANCE", ja: "DEPT. PERFORMANCE", zh: "DEPT. PERFORMANCE" })}
          <span
            className="ml-auto text-[9px] font-medium normal-case tracking-normal"
            style={{ color: "var(--th-text-muted)" }}
          >
            {t({ ko: "부서별", en: "by department", ja: "by department", zh: "by department" })}
          </span>
        </h2>

        {deptData.length === 0 ? (
          <div
            className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-sm"
            style={{ color: "var(--th-text-muted)" }}
          >
            <span className="text-3xl opacity-30">DEP</span>
            {t({
              ko: "표시할 데이터가 없습니다",
              en: "No data available",
              ja: "No data available",
              zh: "No data available",
            })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {deptData.map((dept) => (
              <article
                key={dept.id}
                className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-200 hover:translate-x-1 hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black transition-transform duration-200 group-hover:scale-110"
                      style={{ background: "var(--th-bg-surface)" }}
                    >
                      {dept.icon}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>
                      {departmentDisplayName(language, dept)}
                    </span>
                  </div>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${dept.color.badge}`}>
                    {dept.ratio}%
                  </span>
                </div>
                <div className="relative mt-2.5 h-2 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.04]">
                  <div
                    className={`xp-bar-fill h-full rounded-full bg-gradient-to-r ${dept.color.bar} transition-all duration-700`}
                    style={{ width: `${dept.ratio}%` }}
                  />
                </div>
                <div
                  className="mt-1.5 flex justify-between text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--th-text-muted)" }}
                >
                  <span>
                    {t({ ko: "완료", en: "cleared", ja: "cleared", zh: "cleared" })} {numberFormatter.format(dept.done)}
                  </span>
                  <span>
                    {t({ ko: "전체", en: "total", ja: "total", zh: "total" })} {numberFormatter.format(dept.total)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="game-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="flex items-center gap-2 text-sm font-black uppercase tracking-wider"
            style={{ color: "var(--th-text-primary)" }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 text-[10px] font-black text-cyan-200">
              SQD
            </span>
            {t({ ko: "스쿼드", en: "SQUAD", ja: "SQUAD", zh: "SQUAD" })}
          </h2>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              ON {numberFormatter.format(workingAgents.length)}
            </span>
            <span
              className="flex items-center gap-1 rounded-md border px-2 py-0.5 font-bold"
              style={{
                borderColor: "var(--th-border)",
                background: "var(--th-bg-surface)",
                color: "var(--th-text-secondary)",
              }}
            >
              OFF {numberFormatter.format(idleAgentsList.length)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {agents.map((agent) => {
            const isWorking = agent.status === "working";
            const tier = getRankTier(agent.stats_xp);
            const delay = (agent.id.charCodeAt(0) * 137) % 1500;
            return (
              <div
                key={agent.id}
                title={`${localeName(language, agent)} - ${isWorking ? t({ ko: "작업 중", en: "Working", ja: "Working", zh: "Working" }) : t({ ko: "대기 중", en: "Idle", ja: "Idle", zh: "Idle" })} - ${tier.name}`}
                className={`group relative flex flex-col items-center gap-1.5 ${isWorking ? "animate-bubble-float" : ""}`}
                style={isWorking ? { animationDelay: `${delay}ms` } : {}}
              >
                <div className="relative">
                  <div
                    className="overflow-hidden rounded-2xl transition-transform duration-200 group-hover:scale-110"
                    style={{
                      boxShadow: isWorking ? `0 0 12px ${tier.glow}` : "none",
                      border: isWorking ? `2px solid ${tier.color}60` : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <AgentAvatar agent={agent} agents={agents} size={40} rounded="2xl" />
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 ${isWorking ? "animate-status-glow bg-emerald-400" : "bg-slate-600"}`}
                    style={{ borderColor: "var(--th-bg-primary)" }}
                  />
                </div>
                <span
                  className="max-w-[52px] truncate text-center text-[9px] font-bold leading-tight"
                  style={{ color: isWorking ? "var(--th-text-primary)" : "var(--th-text-muted)" }}
                >
                  {localeName(language, agent)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface DashboardMissionLogProps {
  recentTasks: Task[];
  agentMap: Map<string, Agent>;
  agents: Agent[];
  language: UiLanguage;
  localeTag: string;
  idleAgents: number;
  numberFormatter: Intl.NumberFormat;
  t: TFunction;
}

export function DashboardMissionLog({
  recentTasks,
  agentMap,
  agents,
  language,
  localeTag,
  idleAgents,
  numberFormatter,
  t,
}: DashboardMissionLogProps) {
  return (
    <div className="game-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2
          className="flex items-center gap-2 text-sm font-black uppercase tracking-wider"
          style={{ color: "var(--th-text-primary)" }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-[10px] font-black text-violet-200">
            LOG
          </span>
          {t({ ko: "미션 로그", en: "MISSION LOG", ja: "MISSION LOG", zh: "MISSION LOG" })}
        </h2>
        <span className="text-[10px]" style={{ color: "var(--th-text-muted)" }}>
          {t({ ko: "최근 활동", en: "Recent activity", ja: "Recent activity", zh: "Recent activity" })} ·{" "}
          {numberFormatter.format(idleAgents)} idle
        </span>
      </div>

      {recentTasks.length === 0 ? (
        <div
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center text-sm"
          style={{ color: "var(--th-text-muted)" }}
        >
          {t({ ko: "로그가 없습니다", en: "No logs", ja: "No logs", zh: "No logs" })}
        </div>
      ) : (
        <div className="space-y-2.5">
          {recentTasks.map((task) => {
            const taskAny = task as any;
            const assignedAgent = taskAny.assigned_agent_id ? agentMap.get(taskAny.assigned_agent_id) : null;
            const timestamp = Number(taskAny.updated_at ?? taskAny.created_at ?? Date.now());
            return (
              <article key={task.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>
                      {task.title}
                    </div>
                    <div
                      className="mt-1 flex flex-wrap items-center gap-2 text-[10px]"
                      style={{ color: "var(--th-text-muted)" }}
                    >
                      <span>{taskStatusLabel(task.status, t)}</span>
                      <span>{timeAgo(timestamp, localeTag)}</span>
                      <span>
                        {assignedAgent
                          ? localeName(language, assignedAgent)
                          : t({ ko: "미배정", en: "Unassigned", ja: "Unassigned", zh: "Unassigned" })}
                      </span>
                    </div>
                  </div>
                  {assignedAgent ? (
                    <AgentAvatar agent={assignedAgent} agents={agents} size={34} rounded="xl" />
                  ) : (
                    <span className="rounded-lg border border-white/[0.08] px-2 py-1 text-[10px] text-slate-400">
                      AI
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

type CommandLaneKey = "planning" | "meeting" | "delegation" | "progress" | "review" | "done" | "report";

const COMMAND_LANE_LABELS: Record<CommandLaneKey, string> = {
  planning: "계획",
  meeting: "회의",
  delegation: "분업",
  progress: "진행",
  review: "검토",
  done: "완료",
  report: "보고",
};

const COMMAND_LANE_DESCRIPTIONS: Record<CommandLaneKey, string> = {
  planning: "CEO 지시가 목표와 범위로 정리된 단계",
  meeting: "PMO와 관련 부서가 공개 발언으로 합의한 단계",
  delegation: "부서/직원 단위 SubTask로 쪼개진 단계",
  progress: "실행자가 worktree에서 진행 중인 단계",
  review: "권한, 쿼럼, 승인 게이트를 검토하는 단계",
  done: "실행과 검토가 완료된 단계",
  report: "텔레그램 단일 그룹 보고가 완료된 단계",
};

function safeParseWorkflowMeta(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function emptyCommandLane() {
  return {
    count: 0,
    active: false,
    latest_at: null as number | null,
    blocked_count: 0,
    blocked_by: [] as string[],
  };
}

function emptyCommandLanes() {
  return Object.fromEntries(Object.keys(COMMAND_LANE_LABELS).map((key) => [key, emptyCommandLane()])) as Record<
    CommandLaneKey,
    ReturnType<typeof emptyCommandLane>
  >;
}

function touchCommandLane(
  lanes: Record<CommandLaneKey, ReturnType<typeof emptyCommandLane>>,
  key: CommandLaneKey,
  at: number,
) {
  const lane = lanes[key];
  lane.count += 1;
  lane.active = true;
  lane.latest_at = lane.latest_at === null ? at : Math.max(lane.latest_at, at);
}

function buildFallbackCommandTimeline(tasks: Task[]) {
  const summaries = new Map<string, any>();
  for (const task of tasks) {
    const taskAny = task as any;
    const projectId = typeof taskAny.project_id === "string" && taskAny.project_id ? taskAny.project_id : null;
    const projectKey = projectId ?? "__unassigned__";
    const latestAt = Number(taskAny.updated_at ?? taskAny.created_at ?? Date.now()) || Date.now();
    const meta = safeParseWorkflowMeta(taskAny.workflow_meta_json);
    const reviewConsent = meta.review_consent && typeof meta.review_consent === "object" ? meta.review_consent : null;
    let summary = summaries.get(projectKey);
    if (!summary) {
      summary = {
        project_id: projectId,
        project_name: projectId ? "프로젝트" : "미지정 프로젝트",
        task_count: 0,
        latest_at: latestAt,
        latest_task_title: null,
        health: "planning",
        departments: [],
        lanes: emptyCommandLanes(),
        signal_counts: {
          meeting_public_feedback: 0,
          messenger_relay_success: 0,
          review_consent_blocked: 0,
        },
      };
      summaries.set(projectKey, summary);
    }
    summary.task_count += 1;
    if (latestAt >= summary.latest_at) {
      summary.latest_at = latestAt;
      summary.latest_task_title = taskAny.title ?? null;
    }
    if (
      typeof taskAny.department_id === "string" &&
      taskAny.department_id &&
      !summary.departments.includes(taskAny.department_id)
    ) {
      summary.departments.push(taskAny.department_id);
    }
    const status = String(taskAny.status ?? "");
    if (status === "inbox" || status === "planned") touchCommandLane(summary.lanes, "planning", latestAt);
    if (status === "planned" || status === "collaborating") touchCommandLane(summary.lanes, "meeting", latestAt);
    if (
      Number(taskAny.subtask_total ?? 0) > 0 ||
      taskAny.source_task_id ||
      String(taskAny.title ?? "").includes("서브태스크")
    ) {
      touchCommandLane(summary.lanes, "delegation", latestAt);
    }
    if (status === "collaborating" || status === "in_progress") touchCommandLane(summary.lanes, "progress", latestAt);
    if (status === "review" || reviewConsent) touchCommandLane(summary.lanes, "review", latestAt);
    if (status === "done") touchCommandLane(summary.lanes, "done", latestAt);
    if (reviewConsent?.state === "approved") touchCommandLane(summary.lanes, "report", latestAt);
    if (reviewConsent?.blocked === true) {
      summary.health = "blocked";
      summary.signal_counts.review_consent_blocked += 1;
      summary.lanes.review.blocked_count += 1;
      const blockedBy = Array.isArray(reviewConsent.blocked_by) ? reviewConsent.blocked_by : [];
      for (const reason of blockedBy) {
        if (typeof reason === "string" && reason && !summary.lanes.review.blocked_by.includes(reason)) {
          summary.lanes.review.blocked_by.push(reason);
        }
      }
    } else if (summary.health !== "blocked") {
      if (summary.lanes.progress.active || summary.lanes.review.active || summary.lanes.delegation.active) {
        summary.health = "active";
      }
      if (summary.lanes.done.active && !summary.lanes.progress.active && !summary.lanes.review.active) {
        summary.health = "complete";
      }
    }
  }
  return Array.from(summaries.values())
    .sort((a, b) => Number(b.latest_at ?? 0) - Number(a.latest_at ?? 0))
    .slice(0, 8);
}

function commandHealthLabel(health: string): string {
  if (health === "blocked") return "차단";
  if (health === "complete") return "완료";
  if (health === "active") return "진행";
  return "계획";
}

function commandHealthClass(health: string): string {
  if (health === "blocked") return "border-rose-400/50 bg-rose-500/15 text-rose-100";
  if (health === "complete") return "border-emerald-400/50 bg-emerald-500/15 text-emerald-100";
  if (health === "active") return "border-sky-400/50 bg-sky-500/15 text-sky-100";
  return "border-amber-400/50 bg-amber-500/15 text-amber-100";
}

function formatCommandTime(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(n);
}

export function DashboardCommandTimeline({
  timeline,
  tasks,
  language,
}: {
  timeline?: any[];
  tasks: Task[];
  language: UiLanguage;
}) {
  const rows = Array.isArray(timeline) && timeline.length > 0 ? timeline : buildFallbackCommandTimeline(tasks);
  const totalProjects = rows.length;
  const blockedProjects = rows.filter((row) => row.health === "blocked").length;
  const reportCount = rows.reduce((sum, row) => sum + Number(row.signal_counts?.messenger_relay_success ?? 0), 0);
  const feedbackCount = rows.reduce((sum, row) => sum + Number(row.signal_counts?.meeting_public_feedback ?? 0), 0);

  return (
    <section className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.32em] text-amber-200/80">
            CEO Project Command Timeline
          </div>
          <h2 className="mt-2 text-2xl font-black text-white">CEO 명령 프로젝트 진행판</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            계획, 회의, 분업, 진행, 검토, 완료, 보고까지 프로젝트별 흐름을 한 화면에 모읍니다. 회의 공개 발언, 텔레그램
            보고 성공, 리뷰 하드블록 메타를 함께 집계합니다.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xl font-black text-white">{totalProjects}</div>
            <div className="text-[10px] font-bold text-slate-400">프로젝트</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xl font-black text-white">{feedbackCount}</div>
            <div className="text-[10px] font-bold text-slate-400">회의 발언</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div
              className={
                blockedProjects > 0 ? "text-xl font-black text-rose-200" : "text-xl font-black text-emerald-200"
              }
            >
              {reportCount}
            </div>
            <div className="text-[10px] font-bold text-slate-400">보고 성공</div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-3">
        {rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
            아직 CEO 명령 기반 프로젝트 흐름이 없습니다.
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={row.project_id ?? "unassigned"}
              className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="min-w-0 truncate text-lg font-black text-white">{row.project_name}</h3>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${commandHealthClass(row.health)}`}
                    >
                      {commandHealthLabel(row.health)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-slate-300">
                      태스크 {row.task_count}
                    </span>
                  </div>
                  <p className="mt-1 min-w-0 truncate text-xs text-slate-400">
                    {row.latest_task_title ?? "최근 태스크 없음"}
                  </p>
                </div>
                <div className="shrink-0 text-xs font-bold text-slate-400">
                  최근 갱신 {formatCommandTime(row.latest_at)}
                </div>
              </div>

              <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-7">
                {(Object.keys(COMMAND_LANE_LABELS) as CommandLaneKey[]).map((key) => {
                  const lane = row.lanes?.[key] ?? emptyCommandLane();
                  const active = Boolean(lane.active || lane.count > 0);
                  return (
                    <div
                      key={key}
                      className={
                        active
                          ? "min-w-0 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3"
                          : "min-w-0 rounded-2xl border border-white/10 bg-slate-900/70 p-3 opacity-70"
                      }
                      title={COMMAND_LANE_DESCRIPTIONS[key]}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={active ? "text-sm font-black text-white" : "text-sm font-black text-slate-500"}
                        >
                          {COMMAND_LANE_LABELS[key]}
                        </span>
                        <span
                          className={
                            active ? "h-2 w-2 rounded-full bg-emerald-300" : "h-2 w-2 rounded-full bg-slate-700"
                          }
                        />
                      </div>
                      <div className="mt-2 text-xl font-black text-white">{lane.count ?? 0}</div>
                      <div className="mt-1 text-[10px] font-bold text-slate-400">
                        {formatCommandTime(lane.latest_at)}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex min-w-0 flex-wrap gap-2 text-[11px] font-bold text-slate-300">
                <span className="rounded-full border border-white/10 bg-slate-900 px-3 py-1">
                  공개 발언 {row.signal_counts?.meeting_public_feedback ?? 0}
                </span>
                <span className="rounded-full border border-white/10 bg-slate-900 px-3 py-1">
                  텔레그램 보고 {row.signal_counts?.messenger_relay_success ?? 0}
                </span>
                <span className="rounded-full border border-white/10 bg-slate-900 px-3 py-1">
                  리뷰 차단 {row.signal_counts?.review_consent_blocked ?? 0}
                </span>
                {(row.departments ?? []).slice(0, 6).map((departmentId: string) => (
                  <span
                    key={departmentId}
                    className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-sky-100"
                  >
                    {departmentDisplayName(language, {
                      id: departmentId,
                      name: departmentId,
                      icon: "",
                      done: 0,
                      total: 0,
                      ratio: 0,
                      color: { bar: "", badge: "" },
                    })}
                  </span>
                ))}
              </div>

              {Array.isArray(row.lanes?.review?.blocked_by) && row.lanes.review.blocked_by.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs font-bold text-rose-100">
                  차단 사유: {row.lanes.review.blocked_by.join(", ")}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
