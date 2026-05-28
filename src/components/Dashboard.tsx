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
      <div className="mt-2 text-3xl font-black tracking-normal text-cyan-600">{value}</div>
      <div className="mt-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
        {hint}
      </div>
    </article>
  );
}

export default function Dashboard({
  stats,
  agents,
  tasks,
  companyName,
  onPrimaryCtaClick,
  onOpenControlPlane,
}: DashboardProps) {
  const totalTasks = stats?.tasks?.total ?? tasks.length;
  const doneTasks = stats?.tasks?.done ?? countTasks(tasks, "done");
  const inProgressTasks = stats?.tasks?.in_progress ?? countTasks(tasks, "in_progress");
  const reviewTasks = stats?.tasks?.review ?? countTasks(tasks, "review");
  const activeAgents = agents.filter((agent) => agent.status === "working").length;
  const displayName = companyName?.trim() || "Dongri-grigri";

  return (
    <section className="space-y-4" style={{ color: "var(--th-text-primary)" }}>
      <div className="game-panel overflow-hidden p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-600">
              8bit Office Screen
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-normal sm:text-4xl">{displayName} 사무실</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--th-text-secondary)" }}>
              대시보드는 raw 데이터 목록이 아니라 운영자가 누르고 이해할 수 있는 기능 화면입니다. 업무 흐름,
              승인 대기, 품질 점검, 기억 안전 모드, 프로젝트 scope를 8bit 사무실에서 확인합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onPrimaryCtaClick}
            className="inline-flex items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-700 transition hover:bg-cyan-400/20 dark:text-cyan-100"
          >
            사무실 열기
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="전체 업무" value={totalTasks} hint={`진행 ${inProgressTasks} · 검토 ${reviewTasks}`} />
        <StatCard label="완료" value={doneTasks} hint="evidence와 handoff 기준으로 종료" />
        <StatCard label="마스터 부서" value={6} hint="기획 · 개발 · 디자인 · 품질 · OPS · 외부강사" />
        <StatCard label="실행 에이전트" value={activeAgents} hint="현재 움직이는 업무 담당" />
      </div>

      <ControlPlaneSummaryCard onOpen={onOpenControlPlane} />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <section className="game-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">프로젝트 scope</div>
              <h2 className="mt-1 text-lg font-bold">OPS 관제 코너 모델</h2>
            </div>
            <span className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-100">
              작은 관제 코너 · 여러 프로젝트
            </span>
          </div>
          <p className="mt-3 text-sm leading-6" style={{ color: "var(--th-text-secondary)" }}>
            OPS는 큰 사무실이 아니라 프로젝트 scope를 관찰하고 승인, 품질, 실행 상태를 묶는 작은 관제 코너입니다.
            실제 구현은 승인된 task와 repo-map 허용 파일 안에서만 진행됩니다.
          </p>
        </section>

        <aside className="game-panel p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">운영 현황</div>
          <h2 className="mt-1 text-lg font-bold">실행 신호 중심</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--th-text-secondary)" }}>
            run, persona, decision, evidence 이벤트를 운영 신호로 묶어 현재 작업 흐름을 빠르게 읽게 합니다.
          </p>
        </aside>
      </div>
    </section>
  );
}
