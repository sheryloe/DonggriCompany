import { useEffect, useMemo, useState } from "react";
import type { ProjectDecisionEventItem, ProjectReportHistoryItem, ProjectTaskHistoryItem } from "../../api";
import { getProjectModules } from "../../api";
import { getProjectModuleBindingStatusLabel, getProjectModuleTitle } from "../../app/module-display";
import { approveMemoryPromotion, drainBeadsOutbox, scanMemoryPromotions } from "../../api/memory";
import type { Agent, NativeMemory, Project, ProjectMemoryResponse, ProjectModuleBinding } from "../../types";
import MemorySearchPanel from "../skills-library/MemorySearchPanel";
import type { GroupedProjectTaskCard, ProjectDetailView, ProjectI18nTranslate } from "./types";
import { fmtTime } from "./utils";

type BoardColumnKey = "pending" | "board" | "reports";
type ProjectMemoryFilter = "all" | "core" | "archival" | "episodic" | "candidate";

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

function statusColumnKey(status: string): BoardColumnKey {
  if (status === "in_progress") return "board";
  if (status === "review" || status === "done") return "reports";
  return "pending";
}

function memoryFilterLabel(filter: ProjectMemoryFilter): string {
  const labels: Record<ProjectMemoryFilter, string> = {
    all: "전체",
    core: "핵심 기억",
    archival: "보관 기억",
    episodic: "프로젝트 경험",
    candidate: "전사 공통 Skill 후보",
  };
  return labels[filter];
}

function filterProjectMemories(memories: NativeMemory[], filter: ProjectMemoryFilter): NativeMemory[] {
  if (filter === "all") return memories;
  if (filter === "candidate") return memories.filter((memory) => memory.promotion_status === "candidate");
  return memories.filter((memory) => memory.memory_layer === filter);
}

function beadsStatusLabel(projectMemory: ProjectMemoryResponse | null | undefined): string {
  const status = projectMemory?.beads_status;
  if (!status?.installed) return "미설치";
  if (!status.initialized) return "프로젝트 미초기화";
  const hasPending = (projectMemory?.memory_outbox ?? []).some((item) => item.status === "pending");
  const hasFailed = (projectMemory?.memory_outbox ?? []).some((item) => item.status === "failed");
  if (hasFailed) return "동기화 실패";
  if (hasPending) return "동기화 대기";
  return "동기화 완료";
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
  agents: Agent[];
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
  agents,
}: ProjectInsightsPanelProps) {
  const [activeView, setActiveView] = useState<ProjectDetailView>("overview");
  const [projectModules, setProjectModules] = useState<ProjectModuleBinding[]>([]);
  const [projectModulesLoading, setProjectModulesLoading] = useState(false);
  const [memoryFilter, setMemoryFilter] = useState<ProjectMemoryFilter>("all");
  const [promotionBusyId, setPromotionBusyId] = useState<string | null>(null);
  const [approvedPromotionIds, setApprovedPromotionIds] = useState<Set<string>>(() => new Set());
  const [promotionActionMessage, setPromotionActionMessage] = useState<string | null>(null);
  const [beadsDrainRunning, setBeadsDrainRunning] = useState(false);
  const [beadsActionMessage, setBeadsActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProject?.id) {
      setProjectModules([]);
      return;
    }
    let cancelled = false;
    setProjectModulesLoading(true);
    getProjectModules(selectedProject.id)
      .then((response) => {
        if (!cancelled) setProjectModules(response.bindings);
      })
      .catch(() => {
        if (!cancelled) setProjectModules([]);
      })
      .finally(() => {
        if (!cancelled) setProjectModulesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProject?.id]);

  const boardColumns = useMemo(() => {
    const columns: Record<BoardColumnKey, GroupedProjectTaskCard[]> = {
      pending: [],
      board: [],
      reports: [],
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

  const filteredMemories = useMemo(
    () => filterProjectMemories(projectMemory?.memories ?? [], memoryFilter),
    [memoryFilter, projectMemory?.memories],
  );
  const visiblePromotionCandidates = useMemo(
    () => (projectMemory?.promotion_candidates ?? []).filter((candidate) => !approvedPromotionIds.has(candidate.id)),
    [approvedPromotionIds, projectMemory?.promotion_candidates],
  );

  async function handleScanPromotions() {
    setPromotionActionMessage(null);
    setPromotionBusyId("scan");
    try {
      const candidates = await scanMemoryPromotions();
      setPromotionActionMessage(`전사 공통 Skill 후보 ${candidates.length}개를 다시 계산했습니다.`);
    } catch {
      setPromotionActionMessage("전사 공통 Skill 후보 스캔에 실패했습니다.");
    } finally {
      setPromotionBusyId(null);
    }
  }

  async function handleApprovePromotion(candidateId: string) {
    setPromotionActionMessage(null);
    setPromotionBusyId(candidateId);
    try {
      await approveMemoryPromotion(candidateId);
      setApprovedPromotionIds((previous) => new Set([...previous, candidateId]));
      setPromotionActionMessage("전사 공통 Skill 후보를 승인했습니다.");
    } catch {
      setPromotionActionMessage("전사 공통 Skill 후보 승인에 실패했습니다.");
    } finally {
      setPromotionBusyId(null);
    }
  }

  async function handleDrainBeadsOutbox() {
    if (!selectedProject?.id) return;
    setBeadsActionMessage(null);
    setBeadsDrainRunning(true);
    try {
      const result = await drainBeadsOutbox(selectedProject.id);
      setBeadsActionMessage(
        `Beads 동기화 재시도 완료: 처리 ${result.processed}건, 성공 ${result.succeeded}건, 실패 ${result.failed}건`,
      );
    } catch {
      setBeadsActionMessage("Beads 동기화 재시도에 실패했습니다.");
    } finally {
      setBeadsDrainRunning(false);
    }
  }

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
    return {
      sampleMode,
      progress: Math.round((doneCount / steps.length) * 100),
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
    { key: "rollout20", label: "Rollout 20" },
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
                ko: "저장값은 영어 canonical 기준을 유지하고 화면만 한국어로 표시합니다.",
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
                className={`rounded-lg px-3 py-1.5 text-xs transition ${
                  activeView === tab.key ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-300 hover:bg-slate-700"
                }`}
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
                {t({ ko: "불러오는 중입니다.", en: "Loading...", ja: "Loading...", zh: "Loading..." })}
              </p>
            ) : isCreating ? (
              <p className="mt-2 text-xs text-slate-500">
                {t({
                  ko: "새 프로젝트를 입력 중입니다.",
                  en: "Creating a new project",
                  ja: "Creating a new project",
                  zh: "Creating a new project",
                })}
              </p>
            ) : !selectedProject ? (
              <p className="mt-2 text-xs text-slate-500">
                {t({
                  ko: "프로젝트를 선택하세요.",
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
                  ko: "연결된 작업이 없습니다.",
                  en: "No mapped tasks",
                  ja: "No mapped tasks",
                  zh: "No mapped tasks",
                })}
              </p>
            ) : (
              <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                {groupedTaskCards.slice(0, 8).map((group) => (
                  <button
                    key={group.root.id}
                    type="button"
                    onClick={() => void handleOpenTaskDetail(group.root.id)}
                    className="w-full rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-left hover:border-blue-500/70"
                  >
                    <p className="break-all text-xs font-semibold text-slate-100">{group.root.title}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {getTaskStatusLabel(group.root.status, t)} · {fmtTime(group.root.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <h4 className="text-sm font-semibold text-white">
              {t({ ko: "적용된 모듈", en: "Applied Modules", ja: "Applied Modules", zh: "Applied Modules" })}
            </h4>
            {!selectedProject ? (
              <p className="mt-2 text-xs text-slate-500">-</p>
            ) : projectModulesLoading ? (
              <p className="mt-2 text-xs text-slate-400">
                {t({
                  ko: "모듈 상태를 불러오는 중입니다.",
                  en: "Loading module state",
                  ja: "Loading module state",
                  zh: "Loading module state",
                })}
              </p>
            ) : projectModules.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                {t({
                  ko: "아직 프로젝트에 적용된 모듈이 없습니다.",
                  en: "No modules applied yet",
                  ja: "No modules applied yet",
                  zh: "No modules applied yet",
                })}
              </p>
            ) : (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {projectModules.slice(0, 6).map((binding) => (
                  <div key={binding.id} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs font-semibold text-slate-100">
                        {getProjectModuleTitle(binding.module_key)}
                      </p>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                        {getProjectModuleBindingStatusLabel(binding.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">버전 {binding.module_version}</p>
                  </div>
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
                    <p className="break-all text-xs font-semibold text-slate-100">{group.root.title}</p>
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
                  ko: "표시할 일정이 없습니다.",
                  en: "No schedule data",
                  ja: "No schedule data",
                  zh: "No schedule data",
                })}
              </p>
            ) : (
              ganttItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="break-all text-xs font-semibold text-slate-100">{item.title}</p>
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
            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
              {sortedReports.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {t({
                    ko: "연결된 보고가 없습니다.",
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
                    <p className="break-all text-xs font-medium text-slate-100">{row.title}</p>
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
            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
              {sortedDecisionEvents.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {t({
                    ko: "기록된 의사결정이 없습니다.",
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
        <div className="space-y-4">
          {selectedProject ? (
            <MemorySearchPanel agents={agents} initialProject={selectedProject} lockProject defaultScope="local" />
          ) : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-white">프로젝트 기억</h4>
                {projectMemoryLoading ? <span className="text-[11px] text-slate-400">동기화 중</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["all", "core", "archival", "episodic", "candidate"] as ProjectMemoryFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setMemoryFilter(filter)}
                    className={`rounded-full px-3 py-1.5 text-xs transition ${
                      memoryFilter === filter
                        ? "bg-cyan-500 text-slate-950"
                        : "border border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-400"
                    }`}
                  >
                    {memoryFilterLabel(filter)}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {filteredMemories.length === 0 ? (
                  <p className="text-xs text-slate-500">선택한 조건에 맞는 프로젝트 기억이 없습니다.</p>
                ) : (
                  filteredMemories.slice(0, 14).map((memory) => (
                    <div key={memory.id} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-semibold text-slate-100">{memory.title}</p>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-200">
                            {memory.memory_layer}
                          </span>
                          <span className="rounded bg-slate-700 px-2 py-0.5 text-[10px] text-slate-200">
                            {memory.memory_type}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">{memory.display_summary_ko || memory.body}</p>
                      {memory.promotion_status === "candidate" ? (
                        <p className="mt-1 text-[10px] text-amber-200">전사 공통 Skill 후보</p>
                      ) : null}
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
                    <span className="text-slate-500">상태</span>
                    <span>{beadsStatusLabel(projectMemory)}</span>
                  </div>
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
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Outbox 대기</span>
                    <span>
                      {(projectMemory?.memory_outbox ?? []).filter((item) => item.status === "pending").length}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Outbox 실패</span>
                    <span>
                      {(projectMemory?.memory_outbox ?? []).filter((item) => item.status === "failed").length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDrainBeadsOutbox()}
                    disabled={beadsDrainRunning || !selectedProject?.id}
                    className="mt-2 w-full rounded-lg border border-cyan-400/30 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {beadsDrainRunning ? "동기화 재시도 중" : "Beads Outbox 동기화 재시도"}
                  </button>
                  {beadsActionMessage ? <p className="text-[11px] text-cyan-100">{beadsActionMessage}</p> : null}
                  {projectMemory?.beads_status?.error ? (
                    <p className="break-all rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">
                      {projectMemory.beads_status.error}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-white">전사 공통 Skill 후보</h4>
                  <button
                    type="button"
                    onClick={() => void handleScanPromotions()}
                    disabled={promotionBusyId !== null}
                    className="rounded-lg border border-amber-400/30 px-2 py-1 text-[10px] font-semibold text-amber-100 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {promotionBusyId === "scan" ? "스캔 중" : "후보 재스캔"}
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {visiblePromotionCandidates.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      승인 대기 후보가 없습니다. 여러 프로젝트에서 반복 성공한 skill이 쌓이면 표시됩니다.
                    </p>
                  ) : (
                    visiblePromotionCandidates.slice(0, 6).map((candidate) => (
                      <div key={candidate.id} className="rounded-lg bg-slate-900/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate font-medium text-slate-100">{candidate.title}</span>
                          <span className="shrink-0 text-amber-200">{candidate.project_count}개 프로젝트</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{candidate.summary}</p>
                        <button
                          type="button"
                          onClick={() => void handleApprovePromotion(candidate.id)}
                          disabled={promotionBusyId !== null}
                          className="mt-2 rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-100 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {promotionBusyId === candidate.id ? "승인 중" : "전사 지식으로 승인"}
                        </button>
                      </div>
                    ))
                  )}
                  {promotionActionMessage ? (
                    <p className="text-[11px] text-amber-100">{promotionActionMessage}</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <h4 className="text-sm font-semibold text-white">품질 증거</h4>
                <div className="mt-3 space-y-2">
                  {(projectMemory?.quality_events ?? []).length === 0 ? (
                    <p className="text-xs text-slate-500">아직 기록된 기억 품질 증거가 없습니다.</p>
                  ) : (
                    (projectMemory?.quality_events ?? []).slice(0, 5).map((event) => (
                      <div key={event.id} className="rounded-lg bg-slate-900/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate font-medium text-slate-100">{event.title}</span>
                          <span className="shrink-0 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                            {event.status}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{event.summary}</p>
                      </div>
                    ))
                  )}
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
                          <span className="text-slate-400">사용 {skill.use_count}회</span>
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
        </div>
      )}

      {activeView === "rollout20" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-white">
                {t({
                  ko: "Rollout 20 진행률",
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
