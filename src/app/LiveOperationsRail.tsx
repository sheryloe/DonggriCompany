import type { Agent, Task, TaskStatus } from "../types";
import { getTaskStatusDotClass, getTaskStatusKoLabel, isLiveTaskStatus } from "./task-status-display";

interface LiveOperationsRailProps {
  agents: Agent[];
  tasks: Task[];
  connected: boolean;
}

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

function statusTone(status: TaskStatus): string {
  return getTaskStatusDotClass(status);
}

function safeDisplayText(value: string | null | undefined, fallback = "제목 확인 필요"): string {
  const text = (value ?? "").trim();
  const brokenMarkerCodes = [
    0xfffd, 0x6e72, 0x5a9b, 0x63f4, 0x5bc3, 0xf9cd, 0xb311, 0xc295, 0xafa8, 0xb0c5, 0xbc40, 0xb349, 0xbab3,
    0xca0c,
  ];
  const brokenMarkers = brokenMarkerCodes.map((code) => String.fromCharCode(code));
  if (!text) return fallback;
  if (/\?{3,}/.test(text) || brokenMarkers.some((marker) => text.includes(marker))) return fallback;
  return text;
}

export default function LiveOperationsRail({ agents, tasks, connected }: LiveOperationsRailProps) {
  const workingAgents = agents.filter((agent) => agent.status === "working");
  const idleAgents = agents.filter((agent) => agent.status === "idle");
  const liveTasks = tasks
    .filter((task) => isLiveTaskStatus(task.status))
    .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
    .slice(0, 6);
  const recentTasks = [...tasks].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0)).slice(0, 4);

  return (
    <aside className="live-ops-rail" aria-label="운영 현황">
      <section className="command-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-600">운영 현황</div>
            <h2 className="mt-1 text-base font-bold" style={{ color: "var(--th-text-primary)" }}>
              실시간 운영 신호
            </h2>
          </div>
          <span className={`live-status-pill ${connected ? "is-online" : "is-offline"}`}>
            {connected ? "온라인" : "오프라인"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
            <div className="text-[11px]" style={{ color: "var(--th-text-muted)" }}>
              실행 중
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-300">
              {workingAgents.length}
            </div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
            <div className="text-[11px]" style={{ color: "var(--th-text-muted)" }}>
              대기 에이전트
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-cyan-600 dark:text-sky-300">{idleAgents.length}</div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {liveTasks.length === 0 ? (
            <div
              className="rounded-lg border px-3 py-4 text-sm"
              style={{
                borderColor: "var(--th-border)",
                background: "var(--th-bg-surface)",
                color: "var(--th-text-muted)",
              }}
            >
              현재 진행 중인 업무가 없습니다.
            </div>
          ) : (
            liveTasks.map((task) => {
              const agent = agents.find((candidate) => candidate.id === task.assigned_agent_id);
              const sprite = agentSprite(agent);
              const title = safeDisplayText(task.title);
              return (
                <div key={task.id} className="live-task-row">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
                    style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
                  >
                    {sprite ? (
                      <img
                        src={sprite}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <span className="text-sm">AG</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
                      {title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                      <span>{safeDisplayText(agent?.name_ko || agent?.name, "미배정")}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(task.updated_at)}</span>
                    </div>
                  </div>
                  <span className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-700 dark:text-sky-200">
                    {getTaskStatusKoLabel(task.status)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="command-panel p-4">
        <h2 className="text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>
          시스템 상태
        </h2>
        <div className="mt-3 space-y-2">
          <div className="system-status-row">
            <span>서버 연결</span>
            <strong className={connected ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}>
              {connected ? "정상" : "확인 필요"}
            </strong>
          </div>
          <div className="system-status-row">
            <span>업무 수</span>
            <strong>{tasks.length}건</strong>
          </div>
          <div className="system-status-row">
            <span>에이전트 수</span>
            <strong>{agents.length}명</strong>
          </div>
        </div>
      </section>

      <section className="command-panel p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>
            최근 실행 로그
          </h2>
          <span className="text-[10px]" style={{ color: "var(--th-text-muted)" }}>
            최근 {recentTasks.length}건
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {recentTasks.length === 0 ? (
            <div
              className="rounded-lg border px-3 py-3 text-xs"
              style={{
                borderColor: "var(--th-border)",
                background: "var(--th-bg-surface)",
                color: "var(--th-text-muted)",
              }}
            >
              표시할 업무 로그가 없습니다.
            </div>
          ) : (
            recentTasks.map((task) => (
              <div key={task.id} className="flex items-start gap-2 text-xs">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${statusTone(task.status)}`} />
                <div className="min-w-0">
                  <div className="truncate font-mono text-emerald-600 dark:text-emerald-300">
                    Task #{task.id.slice(0, 6)}
                  </div>
                  <div className="truncate" style={{ color: "var(--th-text-secondary)" }}>
                    {safeDisplayText(task.title)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}
