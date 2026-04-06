"use client";

import { useMemo } from "react";
import type { Agent, CompanyStats, Department, Task } from "@workspace/shared";
import AgentAvatar, { useSpriteMap } from "./AgentAvatar";

interface DashboardProps {
  stats: CompanyStats | null;
  agents: Agent[];
  tasks: Task[];
  departments: Department[];
  companyName: string;
}

const DEPT_COLORS = [
  "#6366f1", "#3b82f6", "#ec4899", "#10b981",
  "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4",
];

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub: string; color: string; icon: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gray-900/60 p-4 backdrop-blur-sm">
      <div className="absolute -right-3 -top-3 text-5xl opacity-10 select-none">{icon}</div>
      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color }}>
        {label}
      </p>
      <p className="text-3xl font-black tabular-nums" style={{ color }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function XpBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-700/60">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export default function Dashboard({ stats, agents, tasks, departments, companyName }: DashboardProps) {
  const spriteMap = useSpriteMap(agents);

  const totalTasks = stats?.tasks.total ?? tasks.length;
  const doneTasks = stats?.tasks.done ?? tasks.filter((t) => t.status === "done").length;
  const inProgress = stats?.tasks.in_progress ?? tasks.filter((t) => t.status === "in_progress").length;
  const planned = stats?.tasks.planned ?? tasks.filter((t) => t.status === "planned").length;
  const completionRate = stats?.tasks.completion_rate ??
    (totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0);
  const totalAgents = stats?.agents.total ?? agents.length;
  const workingAgents = stats?.agents.working ?? agents.filter((a) => a.status === "working").length;
  const activeRate = totalAgents > 0 ? Math.round((workingAgents / totalAgents) * 100) : 0;

  const topAgents = useMemo(() => {
    if (stats?.topAgents?.length) return stats.topAgents.slice(0, 5);
    return [...agents].sort((a, b) => b.statsXp - a.statsXp).slice(0, 5).map((a) => ({
      id: a.id,
      name: a.name,
      statsXp: a.statsXp,
      statsTasksDone: a.statsTasksDone,
    }));
  }, [stats, agents]);
  const maxXp = Math.max(...topAgents.map((a) => a.statsXp), 1);

  const deptData = useMemo(() => {
    const src = stats?.tasksByDepartment;
    if (src?.length) return src.map((d, i) => ({ ...d, color: DEPT_COLORS[i % DEPT_COLORS.length] }));
    const deptMap = new Map<string, { name: string; icon: string; total: number; done: number }>();
    departments.forEach((d) => deptMap.set(d.id, { name: d.name, icon: d.icon, total: 0, done: 0 }));
    tasks.forEach((t) => {
      if (!t.departmentId) return;
      const e = deptMap.get(t.departmentId);
      if (!e) return;
      e.total++;
      if (t.status === "done") e.done++;
    });
    return Array.from(deptMap.entries()).map(([id, v], i) => ({
      id, name: v.name, icon: v.icon,
      totalTasks: v.total, doneTasks: v.done,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }));
  }, [stats, tasks, departments]);

  const recentTasks = useMemo(
    () => [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
    [tasks]
  );

  const TASK_STATUS_LABELS: Record<string, string> = {
    inbox: "Inbox", planned: "Planned", in_progress: "In Progress", review: "Review", done: "Done",
  };
  const TASK_STATUS_COLORS: Record<string, string> = {
    inbox: "#6b7280", planned: "#6366f1", in_progress: "#f59e0b", review: "#3b82f6", done: "#10b981",
  };

  return (
    <div className="space-y-6 p-4 text-white">
      {/* Hero */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-950/80 to-gray-900/80 p-6 backdrop-blur-sm">
        <h1 className="text-2xl font-black tracking-tight">{companyName}</h1>
        <p className="mt-1 text-sm text-gray-400">AI Agent Company Dashboard</p>
      </div>

      {/* HUD Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Missions" value={totalTasks} sub={`${doneTasks} completed`} color="#3b82f6" icon="📋" />
        <StatCard label="Clear Rate" value={`${completionRate}%`} sub={`${doneTasks} cleared`} color="#10b981" icon="✅" />
        <StatCard label="Squad" value={`${workingAgents}/${totalAgents}`} sub={`uptime ${activeRate}%`} color="#00f0ff" icon="🤖" />
        <StatCard label="In Progress" value={inProgress} sub={`planned ${planned}`} color="#f59e0b" icon="⚡" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Ranking Board */}
        <div className="rounded-xl border border-white/10 bg-gray-900/60 p-4 backdrop-blur-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gray-400">Agent Ranking</h2>
          <div className="space-y-3">
            {topAgents.map((a, idx) => {
              const agent = agents.find((ag) => ag.id === a.id);
              const medals = ["🥇", "🥈", "🥉"];
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="w-6 text-center text-lg">{medals[idx] ?? `#${idx + 1}`}</span>
                  <AgentAvatar agent={agent} spriteMap={spriteMap} size={32} showStatus />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold">{a.name}</p>
                    <XpBar value={a.statsXp} max={maxXp} color={DEPT_COLORS[idx % DEPT_COLORS.length]} />
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums">{a.statsXp.toLocaleString()} XP</span>
                </div>
              );
            })}
            {topAgents.length === 0 && (
              <p className="text-center text-sm text-gray-500 py-4">에이전트 없음</p>
            )}
          </div>
        </div>

        {/* Department Performance */}
        <div className="rounded-xl border border-white/10 bg-gray-900/60 p-4 backdrop-blur-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gray-400">Departments</h2>
          <div className="space-y-3">
            {deptData.map((d) => {
              const pct = d.totalTasks > 0 ? Math.round((d.doneTasks / d.totalTasks) * 100) : 0;
              return (
                <div key={d.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span>{d.icon}</span>
                      <span>{d.name}</span>
                    </span>
                    <span className="text-xs text-gray-400">{d.doneTasks}/{d.totalTasks}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-700/60">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: d.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Tasks */}
      <div className="rounded-xl border border-white/10 bg-gray-900/60 p-4 backdrop-blur-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gray-400">Recent Tasks</h2>
        <div className="divide-y divide-white/5">
          {recentTasks.map((t) => {
            const assignee = agents.find((a) => a.id === t.assignedAgentId);
            return (
              <div key={t.id} className="flex items-center gap-3 py-2.5">
                <AgentAvatar agent={assignee} spriteMap={spriteMap} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-gray-500">{assignee?.name ?? "Unassigned"}</p>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: `${TASK_STATUS_COLORS[t.status] ?? "#6b7280"}22`,
                    color: TASK_STATUS_COLORS[t.status] ?? "#6b7280",
                  }}
                >
                  {TASK_STATUS_LABELS[t.status] ?? t.status}
                </span>
              </div>
            );
          })}
          {recentTasks.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500">태스크 없음</p>
          )}
        </div>
      </div>
    </div>
  );
}
