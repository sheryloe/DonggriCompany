import { useState } from "react";
import type { View } from "../app/types";
import type { Agent, CompanySettings, Department } from "../types";
import { localeName, useI18n } from "../i18n";

interface SidebarProps {
  currentView: View;
  onChangeView: (v: View) => void;
  departments: Department[];
  agents: Agent[];
  settings: CompanySettings;
  connected: boolean;
}

const NAV_ITEMS: Array<{ view: View; icon: string; sprite?: string }> = [
  { view: "office", icon: "OF" },
  { view: "agents", icon: "AG", sprite: "/sprites/3-D-1.png" },
  { view: "skills", icon: "SK" },
  { view: "modules", icon: "MO" },
  { view: "dashboard", icon: "DB" },
  { view: "tasks", icon: "TS" },
  { view: "settings", icon: "ST" },
];

const NAV_LABELS: Record<View, string> = {
  office: "오피스",
  agents: "직원 관리",
  dashboard: "대시보드",
  tasks: "업무 관리",
  skills: "Skill 문서고",
  modules: "모듈",
  settings: "설정",
};

export default function Sidebar({ currentView, onChangeView, departments, agents, settings, connected }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { locale } = useI18n();
  const workingCount = agents.filter((agent) => agent.status === "working").length;
  const totalAgents = agents.length;

  return (
    <aside
      className={`flex h-full flex-col backdrop-blur-sm transition-all duration-300 ${collapsed ? "w-16" : "w-48"}`}
      style={{ background: "var(--th-bg-sidebar)", borderRight: "1px solid var(--th-border)" }}
    >
      <div
        className="flex items-center gap-2 px-3 py-4"
        style={{ borderBottom: "1px solid var(--th-border)", boxShadow: "0 4px 12px rgba(59, 130, 246, 0.06)" }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-lg">
            <img
              src="/sprites/ceo-lobster.png"
              alt="CEO"
              className="h-8 w-8 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded bg-amber-300 px-1 text-[9px] font-bold leading-4 text-slate-950 shadow">
              CEO
            </span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden text-left">
              <div className="truncate text-sm font-bold" style={{ color: "var(--th-text-heading)" }}>
                {settings.companyName}
              </div>
              <div className="text-[10px]" style={{ color: "var(--th-text-muted)" }}>
                {settings.ceoName}
              </div>
            </div>
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            type="button"
            onClick={() => onChangeView(item.view)}
            className={`sidebar-nav-item ${
              currentView === item.view ? "active font-semibold shadow-sm shadow-blue-500/10" : ""
            }`}
          >
            <span className="shrink-0 text-[11px] font-bold tracking-tight">
              {item.sprite ? (
                <img
                  src={item.sprite}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                item.icon
              )}
            </span>
            {!collapsed && <span>{NAV_LABELS[item.view]}</span>}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-3 py-2" style={{ borderTop: "1px solid var(--th-border)" }}>
          <div
            className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--th-text-muted)" }}
          >
            부서 현황
          </div>
          {departments.map((department) => {
            const departmentAgents = agents.filter((agent) => agent.department_id === department.id);
            const working = departmentAgents.filter((agent) => agent.status === "working").length;
            return (
              <div
                key={department.id}
                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-[var(--th-bg-surface-hover)]"
                style={{ color: "var(--th-text-secondary)" }}
              >
                <span>{department.icon}</span>
                <span className="flex-1 truncate">{localeName(locale, department)}</span>
                <span className={working > 0 ? "font-medium text-blue-400" : ""}>
                  {working}/{departmentAgents.length}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-3 py-2.5" style={{ borderTop: "1px solid var(--th-border)" }}>
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${connected ? "animate-pulse bg-green-500" : "bg-red-500"}`} />
          {!collapsed && (
            <div className="text-[10px]" style={{ color: "var(--th-text-muted)" }}>
              {connected ? "연결됨" : "연결 끊김"} · {workingCount}/{totalAgents} 근무 중
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
