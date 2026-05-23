import type { Agent, CompanyStats, Task } from "../types";
import ControlPlaneSummaryCard from "./ControlPlaneSummaryCard";

interface DashboardProps {
  stats: CompanyStats | null;
  agents: Agent[];
  tasks: Task[];
  companyName: string;
  onPrimaryCtaClick: () => void;
  onOpenControlPlane?: () => void;
}

function countTasks(tasks: Task[], status: string): number {
  return tasks.filter((task) => task.status === status).length;
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <article className="game-panel p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--th-text-muted)" }}>
        {label}
      </div>
      <div className="mt-2 text-3xl font-black tracking-tight text-cyan-600">{value}</div>
      <div className="mt-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>{hint}</div>
    </article>
  );
}

export default function Dashboard({
  stats,
  agents,
  tasks,
  onPrimaryCtaClick,
  onOpenControlPlane,
}: DashboardProps) {
  const totalTasks = stats?.tasks?.total ?? tasks.length;
  const doneTasks = stats?.tasks?.done ?? countTasks(tasks, "done");
  const inProgressTasks = stats?.tasks?.in_progress ?? countTasks(tasks, "in_progress");
  const reviewTasks = stats?.tasks?.review ?? countTasks(tasks, "review");
  const activeSubagents = agents.filter((agent) => agent.status === "working").length;

  return (
    <section className="space-y-4" style={{ color: "var(--th-text-primary)" }}>
      <div className="game-panel overflow-hidden p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-600">
              Office-first Control Platform
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Dongri-grigri 운영 대시보드</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--th-text-secondary)" }}>
              8bit 운영실을 중심으로 마스터 에이전트, 프로젝트 scope, SDD pipeline, AgentMemory 상태를 함께 봅니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onPrimaryCtaClick}
            className="inline-flex items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-700 transition hover:bg-cyan-400/20 dark:text-cyan-100"
          >
            업무 보기
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="업무" value={totalTasks} hint={`진행 ${inProgressTasks} · 검토 ${reviewTasks}`} />
        <StatCard label="완료" value={doneTasks} hint="evidence/handoff 기준으로 종료" />
        <StatCard label="마스터 에이전트" value={6} hint="기획 · 개발 · 디자인 · 품질 · 운영 · 외부강사" />
        <StatCard label="활성 실행" value={activeSubagents} hint="서브에이전트는 작업마다 회수" />
      </div>

      <ControlPlaneSummaryCard onOpen={onOpenControlPlane} />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <section className="game-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">Project scopes</div>
              <h2 className="mt-1 text-lg font-bold">운영 마스터 1:N 모델</h2>
            </div>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-100">
              1 운영 · N 프로젝트
            </span>
          </div>
          <p className="mt-3 text-sm leading-6" style={{ color: "var(--th-text-secondary)" }}>
            프로젝트마다 상주 운영자를 늘리지 않고, 운영 마스터가 project scope를 전환합니다.
            구현은 개발 마스터가 승인된 task와 repo-map allowed files 안에서만 수행합니다.
          </p>
        </section>

        <aside className="game-panel p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">Department rooms</div>
          <h2 className="mt-1 text-lg font-bold">부서 대화방</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--th-text-secondary)" }}>
            실제 run, persona, decision 이벤트만 표시합니다. 가짜 대화나 사람 조직 계층은 기본 화면에 만들지 않습니다.
          </p>
        </aside>
      </div>
    </section>
  );
}
