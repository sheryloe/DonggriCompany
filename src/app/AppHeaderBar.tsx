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
  agents: "AG",
  skills: "SK",
  modules: "MO",
  manual: "MN",
  dashboard: "DB",
  tasks: "TS",
  settings: "ST",
};

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: "light" | "dark" }) {
  return theme === "dark" ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

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
          className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/40 text-slate-300 transition hover:border-sky-400/50 hover:text-sky-200 lg:hidden"
          aria-label="내비게이션 열기"
        >
          <span className="font-mono text-sm font-bold">DG</span>
        </button>
        <h1 className="flex min-w-0 items-center gap-3 truncate text-base font-bold sm:text-lg">
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-400/10 font-mono text-sm text-sky-200 sm:inline-flex">
            {viewMark}
          </span>
          {currentView === "agents" && (
            <span className="relative inline-flex items-center" style={{ width: 30, height: 22 }}>
              <img
                src="/sprites/8-D-1.png"
                alt=""
                className="absolute left-0 top-0 h-5 w-5 rounded-full object-cover"
                style={{ imageRendering: "pixelated", opacity: 0.85 }}
              />
              <img
                src="/sprites/3-D-1.png"
                alt=""
                className="absolute left-2.5 top-0.5 h-5 w-5 rounded-full object-cover"
                style={{ imageRendering: "pixelated", zIndex: 1 }}
              />
            </span>
          )}
          <span className="truncate text-slate-50 max-[430px]:hidden">{viewTitle}</span>
        </h1>
        {currentView === "manual" && (
          <button type="button" onClick={focusManualSearch} className="manual-header-search">
            <SearchIcon />
            <span>메뉴얼 검색...</span>
            <kbd>Ctrl K</kbd>
          </button>
        )}
        {officePackControl && (
          <label className="hidden items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/35 px-3 py-2 xl:flex">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {officePackControl.label}
            </span>
            <select
              value={officePackControl.value}
              onChange={(e) => officePackControl.onChange(e.target.value as WorkflowPackKey)}
              className="min-w-[170px] bg-transparent text-xs font-semibold text-slate-100 focus:outline-none"
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
          <button
            onClick={onOpenTasks}
            className="header-action-btn header-action-btn-primary"
            aria-label={tasksPrimaryLabel}
          >
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
            <span>{decisionInboxLoading ? "확인 중" : "의사결정"}</span>
            {decisionInboxCount > 0 && <span className="header-decision-badge">{decisionInboxCount}</span>}
          </button>
          <button onClick={onOpenAgentStatus} className="header-action-btn header-action-btn-secondary">
            {agentStatusLabel}
          </button>
        </div>
        <div className="hidden items-center gap-2 xl:flex">
          <button onClick={onOpenReportHistory} className="header-action-btn header-action-btn-ghost">
            {reportLabel}
          </button>
          <button onClick={onOpenAnnouncement} className="header-action-btn header-action-btn-ghost">
            {announcementLabel}
          </button>
          <button onClick={onOpenRoomManager} className="header-action-btn header-action-btn-ghost">
            {roomManagerLabel}
          </button>
        </div>
        <button
          onClick={onOpenTasks}
          className="header-action-btn header-action-btn-primary header-mobile-action"
          aria-label={tasksPrimaryLabel}
        >
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
          {decisionInboxLoading ? "확인" : "결정"}
          {decisionInboxCount > 0 && <span className="header-decision-badge">{decisionInboxCount}</span>}
        </button>
        <button
          onClick={onToggleTheme}
          className="theme-toggle-btn"
          aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          title={theme === "dark" ? "라이트 모드" : "다크 모드"}
        >
          <span className="theme-toggle-icon">
            <ThemeIcon theme={theme} />
          </span>
        </button>
        <div className="relative sm:hidden">
          <button
            onClick={onToggleMobileHeaderMenu}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/40 text-slate-300 transition hover:border-sky-400/50 hover:text-sky-200"
            aria-label="더보기 메뉴"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
          {mobileHeaderMenuOpen && (
            <>
              <button className="fixed inset-0 z-40" onClick={onCloseMobileHeaderMenu} aria-label="메뉴 닫기" />
              <div className="absolute right-0 top-full z-50 mt-2 min-w-[210px] rounded-2xl border border-slate-700/70 bg-slate-950/95 py-1 shadow-2xl shadow-black/30">
                {officePackControl && (
                  <div className="border-b border-slate-800 px-3 py-2">
                    <label
                      htmlFor="mobile-office-pack-selector"
                      className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500"
                    >
                      {officePackControl.label}
                    </label>
                    <select
                      id="mobile-office-pack-selector"
                      value={officePackControl.value}
                      onChange={(e) => {
                        officePackControl.onChange(e.target.value as WorkflowPackKey);
                        onCloseMobileHeaderMenu();
                      }}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:outline-none"
                    >
                      {officePackControl.options.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.slug} · {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={() => {
                    onOpenAgentStatus();
                    onCloseMobileHeaderMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-slate-900"
                >
                  {agentStatusLabel}
                </button>
                <button
                  onClick={() => {
                    onOpenReportHistory();
                    onCloseMobileHeaderMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-slate-900"
                >
                  {reportLabel}
                </button>
                <button
                  onClick={() => {
                    onOpenAnnouncement();
                    onCloseMobileHeaderMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-slate-900"
                >
                  {announcementLabel}
                </button>
                <button
                  onClick={() => {
                    onOpenRoomManager();
                    onCloseMobileHeaderMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-slate-900"
                >
                  {roomManagerLabel}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="hidden items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/35 px-2.5 py-2 text-xs text-slate-400 sm:flex">
          <div className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400"}`} />
          <span>{connected ? "연결됨" : "오프라인"}</span>
        </div>
      </div>
    </header>
  );
}
