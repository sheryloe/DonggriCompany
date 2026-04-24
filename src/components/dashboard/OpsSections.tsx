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

export function DashboardDeptAndSquad({ deptData, workingAgents, idleAgentsList, agents, language, numberFormatter, t }: DashboardDeptAndSquadProps) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div className="game-panel p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15 text-[10px] font-black text-blue-200">DEP</span>
          {t({ ko: "부서 성과", en: "DEPT. PERFORMANCE", ja: "DEPT. PERFORMANCE", zh: "DEPT. PERFORMANCE" })}
          <span className="ml-auto text-[9px] font-medium normal-case tracking-normal" style={{ color: "var(--th-text-muted)" }}>
            {t({ ko: "부서별", en: "by department", ja: "by department", zh: "by department" })}
          </span>
        </h2>

        {deptData.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-sm" style={{ color: "var(--th-text-muted)" }}>
            <span className="text-3xl opacity-30">DEP</span>
            {t({ ko: "표시할 데이터가 없습니다", en: "No data available", ja: "No data available", zh: "No data available" })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {deptData.map((dept) => (
              <article key={dept.id} className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-200 hover:translate-x-1 hover:bg-white/[0.04]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black transition-transform duration-200 group-hover:scale-110" style={{ background: "var(--th-bg-surface)" }}>{dept.icon}</span>
                    <span className="text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>{departmentDisplayName(language, dept)}</span>
                  </div>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${dept.color.badge}`}>{dept.ratio}%</span>
                </div>
                <div className="relative mt-2.5 h-2 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.04]">
                  <div className={`xp-bar-fill h-full rounded-full bg-gradient-to-r ${dept.color.bar} transition-all duration-700`} style={{ width: `${dept.ratio}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--th-text-muted)" }}>
                  <span>{t({ ko: "완료", en: "cleared", ja: "cleared", zh: "cleared" })} {numberFormatter.format(dept.done)}</span>
                  <span>{t({ ko: "전체", en: "total", ja: "total", zh: "total" })} {numberFormatter.format(dept.total)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="game-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 text-[10px] font-black text-cyan-200">SQD</span>
            {t({ ko: "스쿼드", en: "SQUAD", ja: "SQUAD", zh: "SQUAD" })}
          </h2>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />ON {numberFormatter.format(workingAgents.length)}</span>
            <span className="flex items-center gap-1 rounded-md border px-2 py-0.5 font-bold" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-secondary)" }}>OFF {numberFormatter.format(idleAgentsList.length)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {agents.map((agent) => {
            const isWorking = agent.status === "working";
            const tier = getRankTier(agent.stats_xp);
            const delay = (agent.id.charCodeAt(0) * 137) % 1500;
            return (
              <div key={agent.id} title={`${localeName(language, agent)} - ${isWorking ? t({ ko: "작업 중", en: "Working", ja: "Working", zh: "Working" }) : t({ ko: "대기 중", en: "Idle", ja: "Idle", zh: "Idle" })} - ${tier.name}`} className={`group relative flex flex-col items-center gap-1.5 ${isWorking ? "animate-bubble-float" : ""}`} style={isWorking ? { animationDelay: `${delay}ms` } : {}}>
                <div className="relative">
                  <div className="overflow-hidden rounded-2xl transition-transform duration-200 group-hover:scale-110" style={{ boxShadow: isWorking ? `0 0 12px ${tier.glow}` : "none", border: isWorking ? `2px solid ${tier.color}60` : "1px solid rgba(255,255,255,0.08)" }}>
                    <AgentAvatar agent={agent} agents={agents} size={40} rounded="2xl" />
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 ${isWorking ? "animate-status-glow bg-emerald-400" : "bg-slate-600"}`} style={{ borderColor: "var(--th-bg-primary)" }} />
                </div>
                <span className="max-w-[52px] truncate text-center text-[9px] font-bold leading-tight" style={{ color: isWorking ? "var(--th-text-primary)" : "var(--th-text-muted)" }}>{localeName(language, agent)}</span>
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

export function DashboardMissionLog({ recentTasks, agentMap, agents, language, localeTag, idleAgents, numberFormatter, t }: DashboardMissionLogProps) {
  return (
    <div className="game-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-[10px] font-black text-violet-200">LOG</span>
          {t({ ko: "미션 로그", en: "MISSION LOG", ja: "MISSION LOG", zh: "MISSION LOG" })}
        </h2>
        <span className="text-[10px]" style={{ color: "var(--th-text-muted)" }}>
          {t({ ko: "최근 활동", en: "Recent activity", ja: "Recent activity", zh: "Recent activity" })} · {numberFormatter.format(idleAgents)} idle
        </span>
      </div>

      {recentTasks.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center text-sm" style={{ color: "var(--th-text-muted)" }}>
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
                    <div className="truncate text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>{task.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--th-text-muted)" }}>
                      <span>{taskStatusLabel(task.status, t)}</span>
                      <span>{timeAgo(timestamp, localeTag)}</span>
                      <span>{assignedAgent ? localeName(language, assignedAgent) : t({ ko: "미배정", en: "Unassigned", ja: "Unassigned", zh: "Unassigned" })}</span>
                    </div>
                  </div>
                  {assignedAgent ? <AgentAvatar agent={assignedAgent} agents={agents} size={34} rounded="xl" /> : <span className="rounded-lg border border-white/[0.08] px-2 py-1 text-[10px] text-slate-400">AI</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
