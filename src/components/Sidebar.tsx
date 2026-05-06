import { useMemo, useState } from "react";
import type { View } from "../app/types";
import type { Agent, CompanySettings, Department } from "../types";
import { localeName, useI18n } from "../i18n";
import { buildAgentSpriteUrl } from "./office-view/spriteAssets";

interface SidebarProps {
  currentView: View;
  onChangeView: (v: View) => void;
  departments: Department[];
  agents: Agent[];
  settings: CompanySettings;
  connected: boolean;
}

const NAV_ITEMS: Array<{ view: View; mark: string; label: string }> = [
  { view: "office", mark: "OF", label: "오피스" },
  { view: "agents", mark: "AG", label: "직원 관리" },
  { view: "skills", mark: "SK", label: "Skill 문서고" },
  { view: "modules", mark: "MO", label: "모듈" },
  { view: "manual", mark: "MN", label: "메뉴얼" },
  { view: "dashboard", mark: "DB", label: "대시보드" },
  { view: "tasks", mark: "TS", label: "업무 관리" },
  { view: "settings", mark: "ST", label: "설정" },
];

const DEPARTMENT_ORDER = ["pmo", "planning", "dev", "design", "qa", "devsecops", "operations"];
const DEPARTMENT_SHORT_LABELS: Record<string, string> = {
  pmo: "PMO",
  planning: "기획",
  dev: "개발",
  design: "디자인",
  qa: "QA",
  devsecops: "DevSecOps",
  operations: "운영",
};

const ACTIVE_OFFICE_STAFF_LIMIT: Record<string, number> = {
  pmo: 1,
  planning: 3,
  dev: 3,
  design: 3,
  qa: 3,
  devsecops: 3,
  operations: 3,
};

function spriteSrc(agent: Agent): string | null {
  if (typeof agent.sprite_number === "number" && Number.isFinite(agent.sprite_number)) {
    return buildAgentSpriteUrl(agent.sprite_number, "D", 1);
  }
  return null;
}

function selectVisibleSidebarAgents(agents: Agent[]): Agent[] {
  const counts = new Map<string, number>();
  const rankRole = (role: string) => (role === "team_leader" ? 0 : role === "senior" ? 1 : 2);
  return [...agents]
    .sort((a, b) => rankRole(a.role) - rankRole(b.role) || a.created_at - b.created_at || a.name.localeCompare(b.name))
    .filter((agent) => {
      const departmentId = String(agent.department_id ?? "");
      const limit = ACTIVE_OFFICE_STAFF_LIMIT[departmentId] ?? 0;
      if (limit <= 0) return false;
      const current = counts.get(departmentId) ?? 0;
      if (current >= limit) return false;
      counts.set(departmentId, current + 1);
      return true;
    });
}

export default function Sidebar({ currentView, onChangeView, departments, agents, settings, connected }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { locale } = useI18n();
  const visibleAgents = useMemo(() => selectVisibleSidebarAgents(agents), [agents]);
  const workingCount = visibleAgents.filter((agent) => agent.status === "working").length;
  const totalAgents = visibleAgents.length;
  const origin = typeof window === "undefined" ? "http://127.0.0.1:8900" : window.location.origin;
  const visibleDepartments = useMemo(() => {
    const byId = new Map(departments.map((department) => [department.id, department]));
    const ordered = DEPARTMENT_ORDER.map((id) => byId.get(id)).filter((department): department is Department =>
      Boolean(department),
    );
    return ordered.length > 0 ? ordered : departments;
  }, [departments]);

  return (
    <aside
      className={`command-sidebar flex h-full flex-col backdrop-blur-xl transition-all duration-300 ${
        collapsed ? "w-[76px]" : "w-[264px]"
      }`}
    >
      <div className="command-sidebar-brand">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity hover:opacity-90"
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded-2xl border border-sky-400/25 bg-sky-400/10">
            <img
              src="/sprites/ceo-lobster.png"
              alt="CEO"
              className="h-9 w-9 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded bg-amber-300 px-1 text-[9px] font-bold leading-4 text-slate-950 shadow">
              CEO
            </span>
          </div>
          {!collapsed && (
            <div className="min-w-0 text-left">
              <div
                className="truncate text-base font-extrabold tracking-tight"
                style={{ color: "var(--th-text-heading)" }}
              >
                {settings.companyName}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300/90">
                Command Center
              </div>
            </div>
          )}
        </button>
        {!collapsed && (
          <span className="rounded-lg border border-slate-700/70 px-2 py-1 text-xs text-slate-400">v4</span>
        )}
      </div>

      {!collapsed && (
        <div className="mx-3 mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${connected ? "animate-pulse bg-emerald-400" : "bg-rose-400"}`}
              />
              <span className="text-sm font-semibold text-slate-100">{connected ? "연결됨" : "연결 대기"}</span>
            </div>
            <span className="font-mono text-[11px] text-cyan-300">LIVE</span>
          </div>
          <div className="mt-2 truncate font-mono text-[11px] text-slate-400">{origin}</div>
          <div className="mt-1 text-[11px] text-slate-400">
            직원 {workingCount}/{totalAgents} 근무 중
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            type="button"
            onClick={() => onChangeView(item.view)}
            className={`sidebar-nav-item ${currentView === item.view ? "active font-semibold" : ""}`}
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              {item.mark}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span className="font-mono text-[10px] text-slate-500">{item.mark}</span>
              </>
            )}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="mx-3 mb-3 rounded-xl border border-slate-700/70 bg-slate-950/35 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">부서 현황</div>
            <span className="rounded-md border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">7부서</span>
          </div>
          <div className="space-y-1.5">
            {visibleDepartments.map((department) => {
              const departmentAgents = visibleAgents.filter((agent) => agent.department_id === department.id);
              const working = departmentAgents.filter((agent) => agent.status === "working").length;
              const label = DEPARTMENT_SHORT_LABELS[department.id] ?? localeName(locale, department);
              return (
                <div
                  key={department.id}
                  className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-xs transition hover:border-slate-700/70 hover:bg-slate-900/60"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: department.color || "#38bdf8" }}
                    />
                    <span className="truncate text-slate-200">{label}</span>
                  </div>
                  <div className="flex -space-x-1">
                    {departmentAgents.slice(0, 3).map((agent) => {
                      const src = spriteSrc(agent);
                      return (
                        <span
                          key={agent.id}
                          className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-md border border-slate-800 bg-slate-900 text-[10px]"
                          title={localeName(locale, agent)}
                        >
                          {src ? (
                            <img
                              src={src}
                              alt=""
                              className="h-full w-full object-cover"
                              style={{ imageRendering: "pixelated" }}
                            />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-slate-500" />
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <span
                    className={
                      working > 0 ? "font-mono text-[11px] text-emerald-300" : "font-mono text-[11px] text-slate-500"
                    }
                  >
                    {working}/{departmentAgents.length}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="mx-3 mb-3 rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-amber-300/20 bg-amber-300/10">
              <img
                src="/sprites/ceo-lobster.png"
                alt=""
                className="h-8 w-8 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">{settings.ceoName}</div>
              <div className="text-[11px] text-slate-500">최고 관리자</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
