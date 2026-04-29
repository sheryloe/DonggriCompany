import { useMemo, useState } from "react";
import type { Agent, Department } from "../../types";
import { localeName } from "../../i18n";
import AgentCard from "./AgentCard";
import { StackedSpriteIcon } from "./EmojiPicker";
import type { Translator } from "./types";

interface AgentsTabProps {
  tr: Translator;
  locale: string;
  agents: Agent[];
  departments: Department[];
  deptTab: string;
  setDeptTab: (deptId: string) => void;
  search: string;
  setSearch: (next: string) => void;
  sortedAgents: Agent[];
  spriteMap: Map<string, number>;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  onEditAgent: (agent: Agent) => void;
  onEditDepartment: (department: Department) => void;
  onDeleteAgent: (agentId: string) => void;
  saving: boolean;
  randomIconSprites: {
    total: [number, number];
  };
}

const DEPT_ROW_HEIGHT = 36;
const DEPT_VIEWPORT_HEIGHT = 288;
const DEPT_OVERSCAN = 6;

export default function AgentsTab({
  tr,
  locale,
  agents,
  departments,
  deptTab,
  setDeptTab,
  search,
  setSearch,
  sortedAgents,
  spriteMap,
  confirmDeleteId,
  setConfirmDeleteId,
  onEditAgent,
  onEditDepartment,
  onDeleteAgent,
  saving,
  randomIconSprites,
}: AgentsTabProps) {
  const workingCount = agents.filter((agent) => agent.status === "working").length;
  const deptCounts = new Map<string, { total: number; working: number }>();
  for (const agent of agents) {
    const key = agent.department_id || "__none";
    const count = deptCounts.get(key) ?? { total: 0, working: 0 };
    count.total += 1;
    if (agent.status === "working") count.working += 1;
    deptCounts.set(key, count);
  }

  const [deptScrollTop, setDeptScrollTop] = useState(0);
  const deptRows = useMemo(
    () =>
      departments.map((department) => ({
        department,
        label: localeName(locale, department),
        count: deptCounts.get(department.id) ?? { total: 0, working: 0 },
      })),
    [departments, locale, deptCounts],
  );

  const visibleDeptWindow = useMemo(() => {
    const total = deptRows.length;
    if (total <= 0) {
      return { start: 0, end: 0, items: [] as typeof deptRows, topSpacer: 0, bottomSpacer: 0 };
    }
    const start = Math.max(0, Math.floor(deptScrollTop / DEPT_ROW_HEIGHT) - DEPT_OVERSCAN);
    const viewportCount = Math.ceil(DEPT_VIEWPORT_HEIGHT / DEPT_ROW_HEIGHT) + DEPT_OVERSCAN * 2;
    const end = Math.min(total, start + viewportCount);
    const items = deptRows.slice(start, end);
    return {
      start,
      end,
      items,
      topSpacer: start * DEPT_ROW_HEIGHT,
      bottomSpacer: Math.max(0, (total - end) * DEPT_ROW_HEIGHT),
    };
  }, [deptRows, deptScrollTop]);

  const departmentGroups = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const row of deptRows) {
      const key = row.label[0]?.toUpperCase() || "#";
      grouped.set(key, (grouped.get(key) ?? 0) + row.count.total);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 12);
  }, [deptRows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: tr("전체 인원", "Total Agents", "総人数", "总人数"),
            value: agents.length,
            icon: <StackedSpriteIcon sprites={randomIconSprites.total} />,
          },
          { label: tr("근무 중", "Working", "稼働中", "工作中"), value: workingCount, icon: "W" },
          { label: tr("부서 수", "Departments", "部門数", "部门数"), value: departments.length, icon: "D" },
          {
            label: tr("대기", "Idle", "待機", "待机"),
            value: Math.max(0, agents.length - workingCount),
            icon: "I",
          },
        ].map((summary) => (
          <div
            key={summary.label}
            className="rounded-xl px-4 py-3"
            style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
          >
            <div className="text-xs mb-1" style={{ color: "var(--th-text-muted)" }}>
              {summary.icon} {summary.label}
            </div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--th-text-heading)" }}>
              {summary.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
          >
            <button
              onClick={() => setDeptTab("all")}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                deptTab === "all"
                  ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              {tr("전체", "All", "全体", "全部")}
            </button>
            {deptTab !== "all" ? (
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
                {deptRows.find((row) => row.department.id === deptTab)?.label ?? deptTab}
              </span>
            ) : null}
            <input
              type="text"
              placeholder={`${tr("검색", "Search", "検索", "搜索")}...`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="ml-auto w-52 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{
                background: "var(--th-input-bg)",
                border: "1px solid var(--th-input-border)",
                color: "var(--th-text-primary)",
              }}
            />
          </div>

          {sortedAgents.length === 0 ? (
            <div
              className="rounded-xl py-16 text-center"
              style={{
                background: "var(--th-card-bg)",
                border: "1px solid var(--th-card-border)",
                color: "var(--th-text-muted)",
              }}
            >
              <div className="text-3xl mb-2">-</div>
              {tr("검색 결과 없음", "No agents found", "検索結果なし", "无搜索结果")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {sortedAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  spriteMap={spriteMap}
                  locale={locale}
                  tr={tr}
                  departments={departments}
                  onEdit={() => onEditAgent(agent)}
                  confirmDeleteId={confirmDeleteId}
                  onDeleteClick={() => setConfirmDeleteId(agent.id)}
                  onDeleteConfirm={() => onDeleteAgent(agent.id)}
                  onDeleteCancel={() => setConfirmDeleteId(null)}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </div>

        <aside
          className="rounded-xl p-3"
          style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
        >
          <div
            className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: "var(--th-text-muted)" }}
          >
            {tr("부서 집계", "Department Summary", "部門集計", "部门汇总")}
          </div>

          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {departmentGroups.map(([group, count]) => (
              <div
                key={group}
                className="rounded-md px-2 py-1 text-[11px]"
                style={{ background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
              >
                {group}: {count}
              </div>
            ))}
          </div>

          <div className="mb-2 text-xs" style={{ color: "var(--th-text-muted)" }}>
            {tr(
              "가상 스크롤(136+ 부서 대응)",
              "Virtual list (136+ departments)",
              "仮想スクロール（136+部門対応）",
              "虚拟列表（支持 136+ 部门）",
            )}
          </div>

          <div
            className="overflow-y-auto rounded-lg border"
            style={{
              height: `${DEPT_VIEWPORT_HEIGHT}px`,
              borderColor: "var(--th-card-border)",
              background: "var(--th-bg-surface)",
            }}
            onScroll={(event) => setDeptScrollTop(event.currentTarget.scrollTop)}
          >
            <div style={{ height: visibleDeptWindow.topSpacer }} />
            {visibleDeptWindow.items.map((row) => {
              const isActive = deptTab === row.department.id;
              return (
                <button
                  key={row.department.id}
                  onClick={() => setDeptTab(row.department.id)}
                  onDoubleClick={() => onEditDepartment(row.department)}
                  className={`flex w-full items-center justify-between px-2.5 text-left text-xs transition ${
                    isActive ? "bg-blue-500/20 text-blue-200" : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                  style={{ height: `${DEPT_ROW_HEIGHT}px` }}
                  title={tr(
                    "더블 클릭: 부서 편집",
                    "Double-click: edit department",
                    "ダブルクリック: 部門編集",
                    "双击：编辑部门",
                  )}
                >
                  <span className="truncate">
                    {row.department.icon} {row.label}
                  </span>
                  <span
                    className="ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                    style={{ background: "var(--th-card-bg)", color: "var(--th-text-muted)" }}
                  >
                    {row.count.working}/{row.count.total}
                  </span>
                </button>
              );
            })}
            <div style={{ height: visibleDeptWindow.bottomSpacer }} />
          </div>
        </aside>
      </div>
    </div>
  );
}
