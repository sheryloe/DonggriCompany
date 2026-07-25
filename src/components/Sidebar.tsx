import {
  Brain,
  BriefcaseBusiness,
  Building2,
  FolderKanban,
  Gauge,
  Library,
  Network,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { View } from "../app/types";
import type { Agent, CompanySettings, Department } from "../types";

interface SidebarProps {
  currentView: View;
  onChangeView: (v: View) => void;
  departments: Department[];
  agents: Agent[];
  settings: CompanySettings;
  connected: boolean;
}

type NavItem = {
  view: View;
  label: string;
  mark: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { view: "office", label: "사무실", mark: "OF", icon: Building2 },
  { view: "projects", label: "프로젝트", mark: "PJ", icon: FolderKanban },
  { view: "departments", label: "마스터 에이전트", mark: "AG", icon: Network },
  { view: "tasks", label: "업무", mark: "TS", icon: BriefcaseBusiness },
  { view: "skills", label: "Skill", mark: "SK", icon: Library },
  { view: "memory", label: "Memory", mark: "MM", icon: Brain },
  { view: "settings", label: "설정", mark: "ST", icon: Settings },
];

const MASTER_DEPARTMENTS = [
  { id: "strategy", label: "기획", color: "#2563eb", scope: "목표와 요구사항" },
  { id: "engineering", label: "개발", color: "#16a34a", scope: "구현과 코드 구조" },
  { id: "design", label: "디자인", color: "#d946ef", scope: "UI/UX와 시각 품질" },
  { id: "quality", label: "품질", color: "#f97316", scope: "검토와 테스트" },
  { id: "operations", label: "운영", color: "#0f766e", scope: "프로젝트 scope와 실행 상태" },
  { id: "instructor", label: "외부강사", color: "#7c3aed", scope: "스킬과 학습 가이드" },
];

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sidebar-nav-item ${active ? "active font-semibold" : ""}`}
      title={item.label}
    >
      <span className="sidebar-nav-icon" aria-hidden="true">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <span className="font-mono text-[10px]" style={{ color: "var(--th-text-muted)" }}>
        {item.mark}
      </span>
    </button>
  );
}

export default function Sidebar({ currentView, onChangeView, connected }: SidebarProps) {
  const origin = typeof window === "undefined" ? "Dongri-grigri local" : window.location.origin;

  return (
    <aside className="command-sidebar dongri-sidebar flex h-full w-[236px] flex-col backdrop-blur-xl">
      <div className="command-sidebar-brand">
        <button
          type="button"
          onClick={() => onChangeView("office")}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity hover:opacity-90"
          aria-label="Dongri-grigri 사무실 열기"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10">
            <Gauge className="h-5 w-5 text-cyan-500 dark:text-cyan-300" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 text-left">
            <div
              className="truncate text-base font-extrabold tracking-normal"
              style={{ color: "var(--th-text-primary)" }}
            >
              Dongri-grigri
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-600 dark:text-cyan-400">
              8bit Office
            </div>
          </div>
        </button>
        <span
          className="rounded-md border px-2 py-1 text-[10px] font-semibold"
          style={{ borderColor: "var(--th-border)", color: "var(--th-text-muted)" }}
        >
          Ver.1
        </span>
      </div>

      <div
        className="mx-3 mt-3 rounded-lg border p-3"
        style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
              {connected ? "연결됨" : "연결 대기"}
            </span>
          </div>
          <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400">LIVE</span>
        </div>
        <div className="mt-2 truncate font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>
          Dongri-grigri local · {origin}
        </div>
      </div>

      <nav className="flex-1 space-y-4 px-3 py-4">
        <div className="space-y-1">
          <div
            className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--th-text-muted)" }}
          >
            Main
          </div>
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.view}
              item={item}
              active={currentView === item.view}
              onClick={() => onChangeView(item.view)}
            />
          ))}
        </div>
      </nav>

      <div
        className="mx-3 mb-3 rounded-lg border p-3"
        style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--th-text-muted)" }}
          >
            마스터 에이전트
          </div>
          <span
            className="rounded-md border px-1.5 py-0.5 text-[10px]"
            style={{ borderColor: "var(--th-border)", color: "var(--th-text-muted)" }}
          >
            6개
          </span>
        </div>
        <div className="space-y-1.5">
          {MASTER_DEPARTMENTS.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: agent.color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold" style={{ color: "var(--th-text-primary)" }}>
                  {agent.label}
                </div>
                <div className="truncate text-[10px]" style={{ color: "var(--th-text-muted)" }}>
                  {agent.scope}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mx-3 mb-3 rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-3 text-xs"
        style={{ color: "var(--th-text-secondary)" }}
      >
        OPS는 작은 관제 코너로 프로젝트 scope를 맡고, 부서 마스터는 업무마다 필요한 실행 담당과 증거를 연결합니다.
      </div>
    </aside>
  );
}
