import { useMemo, useState } from "react";
import type { ProjectDecisionEventItem, ProjectReportHistoryItem, ProjectTaskHistoryItem } from "../../api";
import type { Project, ProjectMemoryResponse } from "../../types";
import type { GroupedProjectTaskCard, ProjectDetailView, ProjectI18nTranslate } from "./types";
import { fmtTime } from "./utils";

type BoardColumnKey = "pending" | "board" | "reports";

function getTaskStatusLabel(status: string, t: ProjectI18nTranslate): string {
  const labels: Record<string, string> = {
    inbox: t({ ko: "대기", en: "Inbox", ja: "Inbox", zh: "Inbox" }),
    pending: t({ ko: "대기", en: "Pending", ja: "Pending", zh: "Pending" }),
    in_progress: t({ ko: "진행 중", en: "In Progress", ja: "In Progress", zh: "In Progress" }),
    review: t({ ko: "리뷰", en: "Review", ja: "Review", zh: "Review" }),
    done: t({ ko: "완료", en: "Done", ja: "Done", zh: "Done" }),
    blocked: t({ ko: "차단", en: "Blocked", ja: "Blocked", zh: "Blocked" }),
  };
  return labels[status] ?? status;
}

function getTaskTypeLabel(taskType: string | null | undefined, t: ProjectI18nTranslate): string {
  const value = String(taskType ?? "").trim();
  const labels: Record<string, string> = {
    task: t({ ko: "작업", en: "Task", ja: "Task", zh: "Task" }),
    bugfix: t({ ko: "버그 수정", en: "Bugfix", ja: "Bugfix", zh: "Bugfix" }),
    review: t({ ko: "리뷰", en: "Review", ja: "Review", zh: "Review" }),
    planning: t({ ko: "기획", en: "Planning", ja: "Planning", zh: "Planning" }),
    research: t({ ko: "리서치", en: "Research", ja: "Research", zh: "Research" }),
  };
  return labels[value] ?? (value || t({ ko: "작업", en: "Task", ja: "Task", zh: "Task" }));
}

interface ProjectInsightsPanelProps {
  t: ProjectI18nTranslate;
  selectedProject: Project | null;
  loadingDetail: boolean;
  isCreating: boolean;
  groupedTaskCards: GroupedProjectTaskCard[];
  sortedReports: ProjectReportHistoryItem[];
  sortedDecisionEvents: ProjectDecisionEventItem[];
  getDecisionEventLabel: (eventType: ProjectDecisionEventItem["event_type"]) => string;
  handleOpenTaskDetail: (taskId: string) => Promise<void>;
  projectMemory?: ProjectMemoryResponse | null;
  projectMemoryLoading?: boolean;
}

function statusColumnKey(status: string): BoardColumnKey {
  if (status === "in_progress") return "board";
  if (status === "review" || status === "done") return "reports";
  return "pending";
}

export default function ProjectInsightsPanel({
  t,
  selectedProject,
  loadingDetail,
  isCreating,
  groupedTaskCards,
  sortedReports,
  sortedDecisionEvents,
  getDecisionEventLabel,
  handleOpenTaskDetail,
  projectMemory,
  projectMemoryLoading,
}: ProjectInsightsPanelProps) {
  const [activeView, setActiveView] = useState<ProjectDetailView>("overview");

  const boardColumns = useMemo(() => {
    const columns: Record<BoardColumnKey, GroupedProjectTaskCard[]> = {
      pending: [] as GroupedProjectTaskCard[],
      board: [] as GroupedProjectTaskCard[],
      reports: [] as GroupedProjectTaskCard[],
    };
    groupedTaskCards.forEach((group) => {
      columns[statusColumnKey(group.root.status)].push(group);
    });
    return columns;
  }, [groupedTaskCards]);

  const ganttItems = useMemo(() => {
    return groupedTaskCards
      .map((group) => ({
        id: group.root.id,
        title: group.root.title,
        startAt: group.root.created_at,
        endAt: group.root.completed_at ?? group.root.updated_at ?? group.root.created_at,
        status: group.root.status,
      }))
      .sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0));
  }, [groupedTaskCards]);

  const rollout20 = useMemo(() => {
    const sampleMode = groupedTaskCards.length === 0 && sortedDecisionEvents.length === 0;
    const blockedEvent = sortedDecisionEvents.find((event) =>
      /block|blocked|gate|quorum|authority/i.test(`${event.summary} ${event.note ?? ""}`),
    );
    const latestDecisionAt = sortedDecisionEvents[0]?.created_at ?? null;
    const latestTaskAt = groupedTaskCards[0]?.latestAt ?? null;
    const latestAt = latestDecisionAt ?? latestTaskAt ?? null;

    const steps = [
      { key: "20A", label: "20-A Locale", done: groupedTaskCards.length > 0 || sampleMode, blocked: false },
      { key: "20B", label: "20-B Legacy Compat", done: sortedDecisionEvents.length > 0 || sampleMode, blocked: false },
      {
        key: "20C",
        label: "20-C Authority",
        done: Boolean(latestDecisionAt) || sampleMode,
        blocked: Boolean(blockedEvent),
      },
      { key: "20D", label: "20-D Delegation Log", done: groupedTaskCards.length >= 2 || sampleMode, blocked: false },
      {
        key: "20E",
        label: "20-E Provider Read-only",
        done: groupedTaskCards.length >= 3 || sampleMode,
        blocked: false,
      },
      { key: "20F", label: "20-F Integration Gate", done: Boolean(latestAt) || sampleMode, blocked: false },
    ];
    const doneCount = steps.filter((step) => step.done).length;
    const progress = Math.round((doneCount / steps.length) * 100);
    return {
      sampleMode,
      progress,
      blockedReason: blockedEvent ? blockedEvent.summary : null,
      latestAt,
      steps,
    };
  }, [groupedTaskCards, sortedDecisionEvents]);

  const tabs: Array<{ key: ProjectDetailView; label: string }> = [
    { key: "overview", label: t({ ko: "개요", en: "Overview", ja: "Overview", zh: "Overview" }) },
    { key: "board", label: t({ ko: "이슈 보드", en: "Issue Board", ja: "Issue Board", zh: "Issue Board" }) },
    { key: "gantt", label: t({ ko: "간트", en: "Gantt", ja: "Gantt", zh: "Gantt" }) },
    {
      key: "reports",
      label: t({
        ko: "보고/의사결정",
        en: "Reports / Decisions",
        ja: "Reports / Decisions",
        zh: "Reports / Decisions",
      }),
    },
    {
      key: "memory",
      label: t({ ko: "프로젝트 기억", en: "Project Memory", ja: "Project Memory", zh: "Project Memory" }),
    },
    {
      key: "rollout20",
      label: t({ ko: "Rollout 20", en: "Rollout 20", ja: "Rollout 20", zh: "Rollout 20" }),
    },
  ];
  const boardViewColumns: Array<{ key: BoardColumnKey; title: string }> = [
    { key: "pending", title: t({ ko: "대기", en: "Pending", ja: "Pending", zh: "Pending" }) },
    { key: "board", title: t({ ko: "진행 중", en: "In Progress", ja: "In Progress", zh: "In Progress" }) },
    { key: "reports", title: t({ ko: "리뷰/완료", en: "Review / Done", ja: "Review / Done", zh: "Review / Done" }) },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-white">
              {t({ ko: "프로젝트 상세", en: "Project Detail", ja: "Project Detail", zh: "Project Detail" })}
            </h4>
            <p className="mt-1 text-xs text-slate-400">
              {t({
                ko: "저장값은 canonical 영어 기준으로 유지되고 화면만 현지화됩니다.",
                en: "Stored values remain canonical English while the UI is localized.",
                ja: "Stored values remain canonical English while the UI is localized.",
                zh: "Stored values remain canonical English while the UI is localized.",
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveView(tab.key)}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${activeView === tab.key ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-300 hover:bg-slate-700"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeView === "overview" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <h4 className="text-sm font-semibold text-white">
              {t({ ko: "프로젝트 정보", en: "Project Info", ja: "Project Info", zh: "Project Info" })}
            </h4>
            {loadingDetail ? (
              <p className="mt-2 text-xs text-slate-400">
                {t({ ko: "불러오는 중...", en: "Loading...", ja: "Loading...", zh: "Loading..." })}
              </p>
            ) : isCreating ? (
              <p className="mt-2 text-xs text-slate-500">
                {t({
                  ko: "새 프로젝트를 입력 중입니다",
                  en: "Creating a new project",
                  ja: "Creating a new project",
                  zh: "Creating a new project",
                })}
              </p>
            ) : !selectedProject ? (
              <p className="mt-2 text-xs text-slate-500">
                {t({
                  ko: "프로젝트를 선택하세요",
                  en: "Select a project",
                  ja: "Select a project",
                  zh: "Select a project",
                })}
              </p>
            ) : (
              <div className="mt-2 space-y-2 text-xs text-slate-200">
                <p>
                  <span className="text-slate-500">ID:</span> {selectedProject.id}
                </p>
                <p className="break-all">
                  <span className="text-slate-500">Path:</span> {selectedProject.project_path}
                </p>
                <p className="break-all">
                  <span className="text-slate-500">Goal:</span> {selectedProject.core_goal}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <h4 className="text-sm font-semibold text-white">
              {t({ ko: "최근 작업", en: "Recent Tasks", ja: "Recent Tasks", zh: "Recent Tasks" })}
            </h4>
            {!selectedProject ? (
              <p className="mt-2 text-xs text-slate-500">-</p>
            ) : groupedTaskCards.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                {t({
                  ko: "연결된 작업이 없습니다",
                  en: "No mapped tasks",
                  ja: "No mapped tasks",
                  zh: "No mapped tasks",
                })}
              </p>
            ) : (
              <div className="mt-2 max-h-72 overflow-y-auto space-y-2 pr-1">
                {groupedTaskCards.slice(0, 8).map((group) => (
                  <button
                    key={group.root.id}
                    type="button"
                    onClick={() => void handleOpenTaskDetail(group.root.id)}
                    className="w-full rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-left hover:border-blue-500/70"
                  >
                    <p className="text-xs font-semibold text-slate-100 break-all">{group.root.title}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {getTaskStatusLabel(group.root.status, t)} · {fmtTime(group.root.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === "board" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {boardViewColumns.map((column) => (
            <div key={column.key} className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">{column.title}</h4>
                <span className="text-xs text-slate-400">{boardColumns[column.key].length}</span>
              </div>
              <div className="space-y-2">
                {boardColumns[column.key].map((group) => (
                  <button
                    key={group.root.id}
                    type="button"
                    onClick={() => void handleOpenTaskDetail(group.root.id)}
                    className="w-full rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-left hover:border-blue-500/70"
                  >
                    <p className="text-xs font-semibold text-slate-100 break-all">{group.root.title}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {getTaskTypeLabel(group.root.task_type, t)} ·{" "}
                      {fmtTime(group.root.updated_at || group.root.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeView === "gantt" && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
          <h4 className="text-sm font-semibold text-white">
            {t({ ko: "간트 타임라인", en: "Gantt Timeline", ja: "Gantt Timeline", zh: "Gantt Timeline" })}
          </h4>
          <div className="mt-3 space-y-3">
            {ganttItems.length === 0 ? (
              <p className="text-xs text-slate-500">
                {t({
                  ko: "표시할 일정이 없습니다",
                  en: "No schedule data",
                  ja: "No schedule data",
                  zh: "No schedule data",
                })}
              </p>
            ) : (
              ganttItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-100 break-all">{item.title}</p>
                    <span className="text-[11px] text-slate-400">{getTaskStatusLabel(item.status, t)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {fmtTime(item.startAt)} → {fmtTime(item.endAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeView === "reports" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <h4 className="text-sm font-semibold text-white">
              {t({ ko: "보고 이력", en: "Report History", ja: "Report History", zh: "Report History" })}
            </h4>
            <div className="mt-2 max-h-72 overflow-y-auto space-y-2 pr-1">
              {sortedReports.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {t({
                    ko: "연결된 보고가 없습니다",
                    en: "No mapped reports",
                    ja: "No mapped reports",
                    zh: "No mapped reports",
                  })}
                </p>
              ) : (
                sortedReports.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => void handleOpenTaskDetail(row.id)}
                    className="w-full rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-left hover:border-emerald-500/70"
                  >
                    <p className="text-xs font-medium text-slate-100 break-all">{row.title}</p>
                    <p className="text-[11px] text-slate-400">{fmtTime(row.completed_at || row.created_at)}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <h4 className="text-sm font-semibold text-white">
              {t({ ko: "의사결정 이력", en: "Decision History", ja: "Decision History", zh: "Decision History" })}
            </h4>
            <div className="mt-2 max-h-72 overflow-y-auto space-y-2 pr-1">
              {sortedDecisionEvents.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {t({
                    ko: "기록된 의사결정이 없습니다",
                    en: "No decision records",
                    ja: "No decision records",
                    zh: "No decision records",
                  })}
                </p>
              ) : (
                sortedDecisionEvents.map((event) => (
                  <div
                    key={`${event.id}-${event.created_at}`}
                    className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs font-semibold text-slate-100">
                        {getDecisionEventLabel(event.event_type)}
                      </p>
                      <p className="text-[11px] text-slate-400">{fmtTime(event.created_at)}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-all text-[11px] text-slate-300">{event.summary}</p>
                    {event.note ? (
                      <p className="mt-1 whitespace-pre-wrap break-all text-[11px] text-emerald-300">{event.note}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeView === "memory" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-white">프로젝트 기억</h4>
              {projectMemoryLoading ? <span className="text-[11px] text-slate-400">동기화 중</span> : null}
            </div>
            <div className="mt-3 space-y-2">
              {(projectMemory?.memories ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">작업 완료, 회고, Beads import 후 프로젝트 기억이 표시됩니다.</p>
              ) : (
                (projectMemory?.memories ?? []).slice(0, 14).map((memory) => (
                  <div key={memory.id} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs font-semibold text-slate-100">{memory.title}</p>
                      <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-200">
                        {memory.memory_type}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{memory.display_summary_ko || memory.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <h4 className="text-sm font-semibold text-white">Beads 연동 상태</h4>
              <div className="mt-3 space-y-2 text-xs text-slate-300">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">CLI 설치</span>
                  <span>{projectMemory?.beads_status?.installed ? "감지됨" : "미감지"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">프로젝트 초기화</span>
                  <span>{projectMemory?.beads_status?.initialized ? "연결됨" : "미연결"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">ready 항목</span>
                  <span>{projectMemory?.beads_status?.ready_count ?? "-"}</span>
                </div>
                {projectMemory?.beads_status?.error ? (
                  <p className="break-all rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">
                    {projectMemory.beads_status.error}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <h4 className="text-sm font-semibold text-white">스킬 성장 요약</h4>
              <div className="mt-3 space-y-2">
                {(projectMemory?.skill_usage ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500">프로젝트 기준 스킬 사용 이력이 없습니다.</p>
                ) : (
                  (projectMemory?.skill_usage ?? []).slice(0, 8).map((skill) => (
                    <div key={skill.skill_id} className="rounded-lg bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-100">{skill.skill_id}</span>
                        <span className="text-slate-400">{skill.use_count}회</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                          style={{ width: `${Math.round(Math.max(0, Math.min(1, skill.proficiency)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeView === "rollout20" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-white">
                {t({
                  ko: "20단계 진행률",
                  en: "Rollout 20 Progress",
                  ja: "Rollout 20 Progress",
                  zh: "Rollout 20 Progress",
                })}
              </h4>
              {rollout20.sampleMode ? (
                <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                  {t({ ko: "샘플 데이터", en: "Sample Data", ja: "Sample Data", zh: "Sample Data" })}
                </span>
              ) : null}
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>{t({ ko: "전체 진행", en: "Overall", ja: "Overall", zh: "Overall" })}</span>
                <span className="font-semibold text-cyan-200">{rollout20.progress}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                  style={{ width: `${rollout20.progress}%` }}
                />
              </div>
            </div>
            {rollout20.blockedReason ? (
              <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {t({ ko: "블록 사유", en: "Blocking Reason", ja: "Blocking Reason", zh: "Blocking Reason" })}:{" "}
                {rollout20.blockedReason}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <h4 className="text-sm font-semibold text-white">
              {t({ ko: "단계 타임라인", en: "Step Timeline", ja: "Step Timeline", zh: "Step Timeline" })}
            </h4>
            <div className="mt-3 space-y-2">
              {rollout20.steps.map((step) => (
                <div key={step.key} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-100">{step.label}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        step.blocked
                          ? "bg-rose-500/20 text-rose-200"
                          : step.done
                            ? "bg-emerald-500/20 text-emerald-200"
                            : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {step.blocked
                        ? t({ ko: "차단", en: "Blocked", ja: "Blocked", zh: "Blocked" })
                        : step.done
                          ? t({ ko: "완료", en: "Done", ja: "Done", zh: "Done" })
                          : t({ ko: "대기", en: "Pending", ja: "Pending", zh: "Pending" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-slate-400">
              {t({ ko: "최근 갱신", en: "Last updated", ja: "Last updated", zh: "Last updated" })}:{" "}
              {rollout20.latestAt ? fmtTime(rollout20.latestAt) : "-"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
