import { Bell, CheckSquare, FileText, Menu, Moon, Radio, Search, Sun, X } from "lucide-react";
import type { WorkflowPackKey } from "../types";
import type { View } from "./types";

type OfficePackOption = {
  key: WorkflowPackKey;
  label: string;
  summary: string;
  slug: string;
  accent: number;
};

interface AppHeaderBarProps {
  currentView: View;
  connected: boolean;
  viewTitle: string;
  tasksPrimaryLabel: string;
  decisionLabel: string;
  decisionInboxLoading: boolean;
  decisionInboxCount: number;
  agentStatusLabel: string;
  reportLabel: string;
  announcementLabel: string;
  roomManagerLabel: string;
  officePackControl?: {
    label: string;
    value: WorkflowPackKey;
    options: OfficePackOption[];
    onChange: (packKey: WorkflowPackKey) => void;
  } | null;
  theme: "light" | "dark";
  mobileHeaderMenuOpen: boolean;
  onOpenMobileNav: () => void;
  onOpenTasks: () => void;
  onOpenDecisionInbox: () => void;
  onOpenAgentStatus: () => void;
  onOpenReportHistory: () => void;
  onOpenAnnouncement: () => void;
  onOpenRoomManager: () => void;
  onToggleTheme: () => void;
  onToggleMobileHeaderMenu: () => void;
  onCloseMobileHeaderMenu: () => void;
}

const VIEW_MARKS: Partial<Record<View, string>> = {
  office: "OF",
  dashboard: "DB",
  projects: "PJ",
  departments: "AG",
  tasks: "TS",
  skills: "SK",
  memory: "MM",
  controlPlane: "CP",
  settings: "ST",
  agents: "LG",
  modules: "MO",
  departmentComponents: "LC",
  manual: "MN",
};

export default function AppHeaderBar({
  currentView,
  connected,
  viewTitle,
  tasksPrimaryLabel,
  decisionLabel,
  decisionInboxLoading,
  decisionInboxCount,
  agentStatusLabel,
  reportLabel,
  announcementLabel,
  roomManagerLabel,
  officePackControl,
  theme,
  mobileHeaderMenuOpen,
  onOpenMobileNav,
  onOpenTasks,
  onOpenDecisionInbox,
  onOpenAgentStatus,
  onOpenReportHistory,
  onOpenAnnouncement,
  onOpenRoomManager,
  onToggleTheme,
  onToggleMobileHeaderMenu,
  onCloseMobileHeaderMenu,
}: AppHeaderBarProps) {
  const viewMark = VIEW_MARKS[currentView] ?? "DG";
  const focusManualSearch = () => {
    window.dispatchEvent(new Event("donggri:manual-search-focus"));
  };

  return (
    <header className="app-topbar sticky top-0 z-30 flex items-center justify-between px-3 py-2 sm:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onOpenMobileNav}
          className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition lg:hidden"
          style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
          aria-label="내비게이션 열기"
        >
          <Menu className="h-4 w-4" />
        </button>
        <h1 className="flex min-w-0 items-center gap-3 truncate text-base font-bold sm:text-lg">
          <span
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border font-mono text-sm sm:inline-flex"
            style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
          >
            {viewMark}
          </span>
          <span className="truncate max-[430px]:hidden" style={{ color: "var(--th-text-primary)" }}>
            {viewTitle}
          </span>
        </h1>
        {currentView === "manual" && (
          <button type="button" onClick={focusManualSearch} className="manual-header-search">
            <Search className="h-4 w-4" />
            <span>도움말 검색</span>
            <kbd>Ctrl K</kbd>
          </button>
        )}
        {officePackControl && (
          <label className="hidden items-center gap-2 rounded-xl border px-3 py-2 xl:flex" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--th-text-muted)" }}>
              {officePackControl.label}
            </span>
            <select
              value={officePackControl.value}
              onChange={(e) => officePackControl.onChange(e.target.value as WorkflowPackKey)}
              className="min-w-[170px] bg-transparent text-xs font-semibold focus:outline-none"
              style={{ color: "var(--th-text-primary)" }}
            >
              {officePackControl.options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.slug} · {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 md:flex">
          <button onClick={onOpenTasks} className="header-action-btn header-action-btn-primary" aria-label={tasksPrimaryLabel}>
            <CheckSquare className="h-4 w-4" />
            <span>업무</span>
          </button>
          <button
            onClick={onOpenDecisionInbox}
            disabled={decisionInboxLoading}
            className={`header-action-btn header-action-btn-secondary disabled:cursor-wait disabled:opacity-60${
              decisionInboxCount > 0 ? " decision-has-pending" : ""
            }`}
            aria-label={decisionLabel}
          >
            <span>{decisionInboxLoading ? "확인 중" : "승인"}</span>
            {decisionInboxCount > 0 && <span className="header-decision-badge">{decisionInboxCount}</span>}
          </button>
          <button onClick={onOpenAgentStatus} className="header-action-btn header-action-btn-secondary">
            <Radio className="h-4 w-4" />
            {agentStatusLabel}
          </button>
        </div>
        <div className="hidden items-center gap-2 xl:flex">
          <button onClick={onOpenReportHistory} className="header-action-btn header-action-btn-ghost">
            <FileText className="h-4 w-4" />
            {reportLabel}
          </button>
          <button onClick={onOpenAnnouncement} className="header-action-btn header-action-btn-ghost">
            <Bell className="h-4 w-4" />
            {announcementLabel}
          </button>
          <button onClick={onOpenRoomManager} className="header-action-btn header-action-btn-ghost">
            {roomManagerLabel}
          </button>
        </div>
        <button onClick={onOpenTasks} className="header-action-btn header-action-btn-primary header-mobile-action" aria-label={tasksPrimaryLabel}>
          업무
        </button>
        <button
          onClick={onOpenDecisionInbox}
          disabled={decisionInboxLoading}
          className={`header-action-btn header-action-btn-secondary header-mobile-action disabled:cursor-wait disabled:opacity-60${
            decisionInboxCount > 0 ? " decision-has-pending" : ""
          }`}
          aria-label={decisionLabel}
        >
          {decisionInboxLoading ? "확인" : "승인"}
          {decisionInboxCount > 0 && <span className="header-decision-badge">{decisionInboxCount}</span>}
        </button>
        <button
          onClick={onToggleTheme}
          className="theme-toggle-btn"
          aria-label={theme === "dark" ? "주간 테마로 전환" : "야간 테마로 전환"}
          title={theme === "dark" ? "주간 테마" : "야간 테마"}
        >
          <span className="theme-toggle-icon">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</span>
        </button>
        <div className="relative sm:hidden">
          <button
            onClick={onToggleMobileHeaderMenu}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border transition"
            style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
            aria-label="추가 메뉴"
          >
            {mobileHeaderMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          {mobileHeaderMenuOpen && (
            <>
              <button className="fixed inset-0 z-40" onClick={onCloseMobileHeaderMenu} aria-label="메뉴 닫기" />
              <div className="absolute right-0 top-full z-50 mt-2 min-w-[210px] rounded-2xl border py-1 shadow-2xl" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-elevated)" }}>
                {officePackControl && (
                  <div className="border-b px-3 py-2" style={{ borderColor: "var(--th-border)" }}>
                    <label htmlFor="mobile-office-pack-selector" className="mb-1 block text-[10px] uppercase tracking-wider" style={{ color: "var(--th-text-muted)" }}>
                      {officePackControl.label}
                    </label>
                    <select
                      id="mobile-office-pack-selector"
                      value={officePackControl.value}
                      onChange={(e) => {
                        officePackControl.onChange(e.target.value as WorkflowPackKey);
                        onCloseMobileHeaderMenu();
                      }}
                      className="w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none"
                      style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
                    >
                      {officePackControl.options.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.slug} · {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {[
                  [agentStatusLabel, onOpenAgentStatus],
                  [reportLabel, onOpenReportHistory],
                  [announcementLabel, onOpenAnnouncement],
                  [roomManagerLabel, onOpenRoomManager],
                ].map(([label, handler]) => (
                  <button
                    key={String(label)}
                    onClick={() => {
                      (handler as () => void)();
                      onCloseMobileHeaderMenu();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:opacity-80"
                    style={{ color: "var(--th-text-primary)" }}
                  >
                    {String(label)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="hidden items-center gap-2 rounded-xl border px-2.5 py-2 text-xs sm:flex" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-muted)" }}>
          <div className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`} />
          <span>{connected ? "연결됨" : "오프라인"}</span>
        </div>
      </div>
    </header>
  );
}
