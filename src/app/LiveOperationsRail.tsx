import type { Agent, Task, TaskStatus } from "../types";

interface LiveOperationsRailProps {
  agents: Agent[];
  tasks: Task[];
  connected: boolean;
}

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "대기",
  planned: "계획됨",
  collaborating: "협업 중",
  in_progress: "진행 중",
  review: "검토 중",
  done: "완료",
  pending: "보류",
  cancelled: "취소",
};

const LIVE_STATUSES = new Set<TaskStatus>(["planned", "collaborating", "in_progress", "review"]);

function formatRelativeTime(value: number | null | undefined): string {
  if (!value) return "방금 전";
  const diffMs = Math.max(0, Date.now() - value);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function agentSprite(agent: Agent | undefined): string | null {
  if (!agent || typeof agent.sprite_number !== "number" || !Number.isFinite(agent.sprite_number)) return null;
  return `/sprites/${agent.sprite_number}-D-1.png`;
}

export default function LiveOperationsRail({ agents, tasks, connected }: LiveOperationsRailProps) {
  const workingAgents = agents.filter((agent) => agent.status === "working");
  const idleAgents = agents.filter((agent) => agent.status === "idle");
  const liveTasks = tasks
    .filter((task) => LIVE_STATUSES.has(task.status))
    .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
    .slice(0, 6);
  const recentTasks = [...tasks].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0)).slice(0, 4);

  return (
    <aside className="live-ops-rail" aria-label="실시간 업무 현황">
      <section className="command-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">Live Ops</div>
            <h2 className="mt-1 text-base font-bold text-slate-50">실시간 업무 현황</h2>
          </div>
          <span className={`live-status-pill ${connected ? "is-online" : "is-offline"}`}>
            {connected ? "라이브" : "오프라인"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
            <div className="text-[11px] text-slate-500">근무 직원</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-300">{workingAgents.length}</div>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
            <div className="text-[11px] text-slate-500">대기 직원</div>
            <div className="mt-1 font-mono text-xl font-bold text-sky-300">{idleAgents.length}</div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {liveTasks.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-4 text-sm text-slate-400">
              현재 진행 중인 업무가 없습니다.
            </div>
          ) : (
            liveTasks.map((task) => {
              const agent = agents.find((candidate) => candidate.id === task.assigned_agent_id);
              const sprite = agentSprite(agent);
              return (
                <div key={task.id} className="live-task-row">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                    {sprite ? (
                      <img
                        src={sprite}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <span className="text-sm">{agent?.avatar_emoji ?? "·"}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-100">{task.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{agent?.name_ko || agent?.name || "미배정"}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(task.updated_at)}</span>
                    </div>
                  </div>
                  <span className="rounded-md border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-[10px] font-semibold text-sky-200">
                    {TASK_STATUS_LABELS[task.status]}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="command-panel p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-50">최근 시스템 로그</h2>
          <span className="text-[10px] text-slate-500">최근 {recentTasks.length}건</span>
        </div>
        <div className="mt-3 space-y-2">
          {recentTasks.map((task) => (
            <div key={task.id} className="flex items-start gap-2 text-xs">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <div className="min-w-0">
                <div className="truncate font-mono text-emerald-300">Task #{task.id.slice(0, 6)}</div>
                <div className="truncate text-slate-400">{task.title}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
