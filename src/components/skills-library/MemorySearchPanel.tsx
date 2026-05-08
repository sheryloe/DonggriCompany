import { useEffect, useMemo, useState } from "react";
import {
  deleteMemorySearchProfile,
  getMemorySearchProfiles,
  getProjects,
  getQualityMetricSummary,
  isApiRequestError,
  saveMemorySearchProfile,
  searchMemory,
} from "../../api";
import type { Agent, MemorySearchProfile, NativeMemory, Project, QualityMetricSummary } from "../../types";

type MemoryLayerFilter = "all" | "core" | "episodic" | "archival" | "global";
type MemoryScopeFilter = "local" | "all" | "global";
type MemoryPromotionFilter = "all" | "local" | "candidate" | "promoted" | "rejected";
type MemorySourceFilter = "all" | "manual" | "task_run" | "beads";
type MemoryRankingMode = "default" | "semantic" | "vector" | "semantic_provider";

type StoredMemorySearch = {
  id: string;
  serverId?: string | null;
  label: string;
  query: string;
  tagText: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
  layer: MemoryLayerFilter;
  scope: MemoryScopeFilter;
  promotionStatus: MemoryPromotionFilter;
  sourceType: MemorySourceFilter;
  rankingMode: MemoryRankingMode;
  agentId: string;
  project: Project | null;
  createdAt: number;
};

const MEMORY_RECENT_SEARCHES_KEY = "donggri.memorySearch.recent.v1";
const MEMORY_SAVED_SEARCHES_KEY = "donggri.memorySearch.saved.v1";

interface MemorySearchPanelProps {
  agents: Agent[];
  initialProject?: Project | null;
  lockProject?: boolean;
  defaultScope?: MemoryScopeFilter;
}

function parseTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\s]+/g)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 12);
}

function dateToEpoch(value: string, edge: "start" | "end"): number | null {
  if (!value) return null;
  const date = new Date(`${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}`);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function memoryTags(memory: NativeMemory): string[] {
  try {
    const parsed = JSON.parse(memory.tags_json);
    return Array.isArray(parsed)
      ? parsed
          .map((tag) => String(tag))
          .filter(Boolean)
          .slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function formatDate(value: number | null | undefined): string {
  if (!Number.isFinite(Number(value))) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(Number(value));
}

function summarizeMemory(memory: NativeMemory): string {
  const summary = memory.display_summary_ko?.trim();
  if (summary) return summary;
  const compact = memory.body.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
}

function shortId(value: string): string {
  return value.length > 14 ? `${value.slice(0, 7)}...${value.slice(-4)}` : value;
}

function projectDescription(project: Project): string {
  return project.core_goal?.trim() || "핵심 목표가 기록되지 않았습니다.";
}

function readStoredSearches(key: string): StoredMemorySearch[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? (parsed as StoredMemorySearch[]).slice(0, 12) : [];
  } catch {
    return [];
  }
}

function writeStoredSearches(key: string, searches: StoredMemorySearch[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(searches.slice(0, 12)));
  } catch {
    // localStorage is a fallback cache only.
  }
}

function parseProfileFilters(profile: MemorySearchProfile): Partial<StoredMemorySearch> {
  try {
    const parsed = JSON.parse(profile.filters_json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Partial<StoredMemorySearch>) : {};
  } catch {
    return {};
  }
}

function profileToStoredSearch(profile: MemorySearchProfile): StoredMemorySearch {
  const filters = parseProfileFilters(profile);
  return {
    id: profile.id,
    serverId: profile.id,
    label: profile.label || profile.query || "저장 검색",
    query: profile.query ?? "",
    tagText: String(filters.tagText ?? ""),
    createdFrom: String(filters.createdFrom ?? ""),
    createdTo: String(filters.createdTo ?? ""),
    updatedFrom: String(filters.updatedFrom ?? ""),
    updatedTo: String(filters.updatedTo ?? ""),
    layer: (filters.layer as MemoryLayerFilter) ?? "all",
    scope: (filters.scope as MemoryScopeFilter) ?? "local",
    promotionStatus: (filters.promotionStatus as MemoryPromotionFilter) ?? "all",
    sourceType: (filters.sourceType as MemorySourceFilter) ?? "all",
    rankingMode: (filters.rankingMode as MemoryRankingMode) ?? "default",
    agentId: String(filters.agentId ?? ""),
    project: (filters.project as Project | null | undefined) ?? null,
    createdAt: profile.created_at,
  };
}

function snapshotFilters(snapshot: StoredMemorySearch): Record<string, unknown> {
  return {
    tagText: snapshot.tagText,
    createdFrom: snapshot.createdFrom,
    createdTo: snapshot.createdTo,
    updatedFrom: snapshot.updatedFrom,
    updatedTo: snapshot.updatedTo,
    layer: snapshot.layer,
    scope: snapshot.scope,
    promotionStatus: snapshot.promotionStatus,
    sourceType: snapshot.sourceType,
    rankingMode: snapshot.rankingMode,
    agentId: snapshot.agentId,
    project: snapshot.project,
  };
}

function metricValue(summary: QualityMetricSummary[], metricKey: string): number {
  return summary
    .filter((item) => item.metric_key === metricKey)
    .reduce((sum, item) => sum + Number(item.sum_value ?? item.latest_value ?? 0), 0);
}

function coveragePercent(summary: QualityMetricSummary[]): number | null {
  const rows = summary.filter((item) => item.metric_key === "memory.embedding.coverage");
  if (rows.length === 0) return null;
  const latest = rows.sort((a, b) => b.latest_recorded_at - a.latest_recorded_at)[0];
  return Math.round(Number(latest.latest_value ?? latest.avg_value ?? 0) * 100);
}

export default function MemorySearchPanel({
  agents,
  initialProject = null,
  lockProject = false,
  defaultScope = "local",
}: MemorySearchPanelProps) {
  const [query, setQuery] = useState("");
  const [tagText, setTagText] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [updatedTo, setUpdatedTo] = useState("");
  const [layer, setLayer] = useState<MemoryLayerFilter>("all");
  const [scope, setScope] = useState<MemoryScopeFilter>(defaultScope);
  const [promotionStatus, setPromotionStatus] = useState<MemoryPromotionFilter>("all");
  const [sourceType, setSourceType] = useState<MemorySourceFilter>("all");
  const [rankingMode, setRankingMode] = useState<MemoryRankingMode>("default");
  const [agentId, setAgentId] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(initialProject);
  const [projectQuery, setProjectQuery] = useState(initialProject?.name ?? "");
  const [projectResults, setProjectResults] = useState<Project[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [results, setResults] = useState<NativeMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<StoredMemorySearch[]>([]);
  const [savedSearches, setSavedSearches] = useState<StoredMemorySearch[]>([]);
  const [serverSearchFallback, setServerSearchFallback] = useState(false);
  const [qualitySummary, setQualitySummary] = useState<QualityMetricSummary[]>([]);

  useEffect(() => {
    const localRecent = readStoredSearches(MEMORY_RECENT_SEARCHES_KEY);
    const localSaved = readStoredSearches(MEMORY_SAVED_SEARCHES_KEY);
    setRecentSearches(localRecent);
    setSavedSearches(localSaved);

    let cancelled = false;
    Promise.all([
      getMemorySearchProfiles({ kind: "recent", project_id: initialProject?.id ?? undefined, limit: 8 }),
      getMemorySearchProfiles({ kind: "saved", project_id: initialProject?.id ?? undefined, limit: 12 }),
    ])
      .then(([recent, saved]) => {
        if (cancelled) return;
        const nextRecent = recent.map(profileToStoredSearch).slice(0, 5);
        const nextSaved = saved.map(profileToStoredSearch).slice(0, 8);
        setRecentSearches(nextRecent.length > 0 ? nextRecent : localRecent);
        setSavedSearches(nextSaved.length > 0 ? nextSaved : localSaved);
        setServerSearchFallback(false);

        if (recent.length === 0) {
          localRecent.slice(0, 5).forEach((snapshot) => {
            void saveMemorySearchProfile({
              kind: "recent",
              project_id: snapshot.project?.id ?? null,
              label: snapshot.label,
              query: snapshot.query,
              filters: snapshotFilters(snapshot),
            }).catch(() => undefined);
          });
        }
        if (saved.length === 0) {
          localSaved.slice(0, 8).forEach((snapshot) => {
            void saveMemorySearchProfile({
              kind: "saved",
              project_id: snapshot.project?.id ?? null,
              label: snapshot.label,
              query: snapshot.query,
              filters: snapshotFilters(snapshot),
            }).catch(() => undefined);
          });
        }
      })
      .catch(() => {
        if (!cancelled) setServerSearchFallback(true);
      });

    return () => {
      cancelled = true;
    };
  }, [initialProject?.id]);

  useEffect(() => {
    let cancelled = false;
    const from = Date.now() - 7 * 86_400_000;
    getQualityMetricSummary({ from, bucket: "total", limit: 80 })
      .then((summary) => {
        if (!cancelled) setQualitySummary(summary);
      })
      .catch(() => {
        if (!cancelled) setQualitySummary([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setScope(defaultScope);
  }, [defaultScope]);

  useEffect(() => {
    setSelectedProject(initialProject);
    setProjectQuery(initialProject?.name ?? "");
  }, [initialProject]);

  useEffect(() => {
    if (lockProject) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setProjectLoading(true);
      setProjectError(null);
      getProjects({
        page: 1,
        page_size: 8,
        search: projectQuery.trim() || undefined,
      })
        .then((response) => {
          if (!cancelled) setProjectResults(response.projects);
        })
        .catch(() => {
          if (!cancelled) {
            setProjectResults([]);
            setProjectError("프로젝트 목록을 불러오지 못했습니다.");
          }
        })
        .finally(() => {
          if (!cancelled) setProjectLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [lockProject, projectQuery]);

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => (a.name_ko || a.name || a.id).localeCompare(b.name_ko || b.name || b.id, "ko")),
    [agents],
  );

  const projectLookup = useMemo(() => {
    const rows = new Map<string, Project>();
    if (selectedProject) rows.set(selectedProject.id, selectedProject);
    projectResults.forEach((project) => rows.set(project.id, project));
    savedSearches.forEach((item) => {
      if (item.project) rows.set(item.project.id, item.project);
    });
    recentSearches.forEach((item) => {
      if (item.project) rows.set(item.project.id, item.project);
    });
    return rows;
  }, [projectResults, recentSearches, savedSearches, selectedProject]);

  const qualityCoverage = coveragePercent(qualitySummary);
  const capacity429Count = metricValue(qualitySummary, "provider.capacity_429");
  const embeddingFailCount = metricValue(qualitySummary, "memory.embedding.backfill_failed");
  const fallbackCount = metricValue(qualitySummary, "memory.search.provider_fallback");

  const buildSearchSnapshot = (): StoredMemorySearch => {
    const label =
      query.trim() ||
      selectedProject?.name ||
      parseTags(tagText).join(", ") ||
      `${layer}/${scope}/${promotionStatus}/${sourceType}`;
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      query,
      tagText,
      createdFrom,
      createdTo,
      updatedFrom,
      updatedTo,
      layer,
      scope,
      promotionStatus,
      sourceType,
      rankingMode,
      agentId,
      project: selectedProject,
      createdAt: Date.now(),
    };
  };

  const applySearchSnapshot = (snapshot: StoredMemorySearch) => {
    setQuery(snapshot.query);
    setTagText(snapshot.tagText);
    setCreatedFrom(snapshot.createdFrom);
    setCreatedTo(snapshot.createdTo);
    setUpdatedFrom(snapshot.updatedFrom);
    setUpdatedTo(snapshot.updatedTo);
    setLayer(snapshot.layer);
    setScope(snapshot.scope);
    setPromotionStatus(snapshot.promotionStatus);
    setSourceType(snapshot.sourceType);
    setRankingMode(snapshot.rankingMode ?? "default");
    setAgentId(snapshot.agentId);
    const nextProject = lockProject ? initialProject : snapshot.project;
    setSelectedProject(nextProject ?? null);
    setProjectQuery(nextProject?.name ?? "");
  };

  const upsertLocalRecent = (snapshot: StoredMemorySearch) => {
    setRecentSearches((prev) => {
      const deduped = prev.filter(
        (item) =>
          !(
            item.query === snapshot.query &&
            item.tagText === snapshot.tagText &&
            item.project?.id === snapshot.project?.id &&
            item.rankingMode === snapshot.rankingMode
          ),
      );
      const next = [snapshot, ...deduped].slice(0, 5);
      writeStoredSearches(MEMORY_RECENT_SEARCHES_KEY, next);
      return next;
    });
  };

  const rememberRecentSearch = async (snapshot: StoredMemorySearch) => {
    upsertLocalRecent(snapshot);
    try {
      const saved = await saveMemorySearchProfile({
        kind: "recent",
        project_id: snapshot.project?.id ?? null,
        label: snapshot.label,
        query: snapshot.query,
        filters: snapshotFilters(snapshot),
      });
      const serverSnapshot = profileToStoredSearch(saved);
      upsertLocalRecent(serverSnapshot);
      setServerSearchFallback(false);
    } catch {
      setServerSearchFallback(true);
    }
  };

  const handleSaveSearch = async () => {
    if (!canSearch || saving) return;
    const snapshot = buildSearchSnapshot();
    setSaving(true);
    setSavedSearches((prev) => {
      const next = [snapshot, ...prev.filter((item) => item.label !== snapshot.label)].slice(0, 8);
      writeStoredSearches(MEMORY_SAVED_SEARCHES_KEY, next);
      return next;
    });
    try {
      const saved = await saveMemorySearchProfile({
        kind: "saved",
        project_id: snapshot.project?.id ?? null,
        label: snapshot.label,
        query: snapshot.query,
        filters: snapshotFilters(snapshot),
      });
      const serverSnapshot = profileToStoredSearch(saved);
      setSavedSearches((prev) => {
        const next = [serverSnapshot, ...prev.filter((item) => item.id !== snapshot.id && item.label !== snapshot.label)].slice(0, 8);
        writeStoredSearches(MEMORY_SAVED_SEARCHES_KEY, next);
        return next;
      });
      setServerSearchFallback(false);
    } catch {
      setServerSearchFallback(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSavedSearch = async (snapshot: StoredMemorySearch) => {
    setSavedSearches((prev) => {
      const next = prev.filter((item) => item.id !== snapshot.id);
      writeStoredSearches(MEMORY_SAVED_SEARCHES_KEY, next);
      return next;
    });
    if (!snapshot.serverId) return;
    try {
      await deleteMemorySearchProfile(snapshot.serverId);
      setServerSearchFallback(false);
    } catch {
      setServerSearchFallback(true);
    }
  };

  const canSearch =
    query.trim() ||
    tagText.trim() ||
    createdFrom ||
    createdTo ||
    updatedFrom ||
    updatedTo ||
    layer !== "all" ||
    agentId ||
    selectedProject ||
    scope === "global" ||
    promotionStatus !== "all" ||
    sourceType !== "all";

  const handleSearch = async () => {
    if (!canSearch || loading) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const tags = parseTags(tagText);
      const created_from = dateToEpoch(createdFrom, "start");
      const created_to = dateToEpoch(createdTo, "end");
      const updated_from = dateToEpoch(updatedFrom, "start");
      const updated_to = dateToEpoch(updatedTo, "end");
      const rows = await searchMemory({
        q: query.trim(),
        tags,
        created_from,
        created_to,
        updated_from,
        updated_to,
        layer,
        scope,
        promotion_status: promotionStatus === "all" ? null : promotionStatus,
        source_type: sourceType === "all" ? null : sourceType,
        ranking: rankingMode,
        agent_id: agentId || null,
        project_id: selectedProject?.id ?? null,
        limit: 20,
      });
      setResults(rows);
      await rememberRecentSearch(buildSearchSnapshot());
    } catch (err) {
      setResults([]);
      setError(isApiRequestError(err) ? err.message : "메모리 검색에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setTagText("");
    setCreatedFrom("");
    setCreatedTo("");
    setUpdatedFrom("");
    setUpdatedTo("");
    setLayer("all");
    setScope(defaultScope);
    setPromotionStatus("all");
    setSourceType("all");
    setRankingMode("default");
    setAgentId("");
    setSelectedProject(lockProject ? initialProject : null);
    setProjectQuery(lockProject ? (initialProject?.name ?? "") : "");
    setResults([]);
    setSearched(false);
    setError(null);
  };

  const renderProjectLabel = (projectId: string | null): string => {
    if (!projectId) return "프로젝트 없음";
    const project = projectLookup.get(projectId);
    return project?.name ?? shortId(projectId);
  };

  return (
    <section className="border-y border-slate-800/80 bg-slate-950/25 py-3" data-testid="memory-search-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">장기기억 검색</h3>
          <div className="mt-0.5 text-[11px] text-slate-500">프로젝트와 에이전트 기억을 조건별로 조회합니다.</div>
        </div>
        <div className="text-[11px] text-slate-500">결과 {results.length}개</div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4" data-testid="memory-quality-summary">
        <div className="rounded-md border border-slate-800/80 bg-slate-950/45 px-3 py-2">
          <div className="text-[10px] text-slate-500">임베딩 커버리지</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{qualityCoverage === null ? "-" : `${qualityCoverage}%`}</div>
        </div>
        <div className="rounded-md border border-slate-800/80 bg-slate-950/45 px-3 py-2">
          <div className="text-[10px] text-slate-500">Provider 429</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{capacity429Count}</div>
        </div>
        <div className="rounded-md border border-slate-800/80 bg-slate-950/45 px-3 py-2">
          <div className="text-[10px] text-slate-500">임베딩 실패</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{embeddingFailCount}</div>
        </div>
        <div className="rounded-md border border-slate-800/80 bg-slate-950/45 px-3 py-2">
          <div className="text-[10px] text-slate-500">Provider fallback</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{fallbackCount}</div>
        </div>
      </div>

      {serverSearchFallback ? (
        <div className="mt-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
          서버 저장 검색을 사용할 수 없어 브라우저 로컬 캐시로 동작 중입니다.
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.4fr)]">
        <div className="min-w-0 rounded-lg border border-slate-800/80 bg-slate-950/45 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-slate-300">프로젝트</div>
            {lockProject ? (
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100">
                고정
              </span>
            ) : null}
          </div>

          {!lockProject ? (
            <input
              data-testid="memory-project-query"
              value={projectQuery}
              onChange={(event) => {
                setProjectQuery(event.target.value);
                setSelectedProject(null);
              }}
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              placeholder="프로젝트 이름, 경로, 목표 검색"
            />
          ) : null}

          {selectedProject ? (
            <div
              className="mt-2 rounded-md border border-cyan-400/25 bg-cyan-500/10 px-3 py-2"
              data-testid="memory-selected-project"
            >
              <div className="truncate text-xs font-semibold text-cyan-100" title={selectedProject.name}>
                {selectedProject.name}
              </div>
              <div className="mt-1 truncate text-[10px] text-slate-400" title={selectedProject.project_path}>
                {selectedProject.project_path}
              </div>
              <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-300">
                {projectDescription(selectedProject)}
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-dashed border-slate-800 px-3 py-2 text-[11px] text-slate-500">
              프로젝트를 선택하지 않으면 전사 또는 에이전트 범위로 검색합니다.
            </div>
          )}

          {!lockProject ? (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-slate-800/80 bg-slate-950/50">
              {projectLoading ? (
                <div className="px-3 py-2 text-[11px] text-slate-500">프로젝트를 불러오는 중</div>
              ) : projectError ? (
                <div className="px-3 py-2 text-[11px] text-rose-200">{projectError}</div>
              ) : projectResults.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-slate-500">검색 결과가 없습니다.</div>
              ) : (
                projectResults.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    data-testid={`memory-project-option-${project.id}`}
                    onClick={() => {
                      setSelectedProject(project);
                      setProjectQuery(project.name);
                    }}
                    className={`w-full px-3 py-2 text-left transition ${
                      selectedProject?.id === project.id ? "bg-cyan-500/15" : "hover:bg-slate-900"
                    }`}
                  >
                    <div className="truncate text-xs font-semibold text-slate-100" title={project.name}>
                      {project.name}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500" title={project.project_path}>
                      {project.project_path}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="grid gap-2 lg:grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.8fr)_repeat(4,minmax(120px,0.75fr))]">
            <label className="min-w-0 text-[11px] font-medium text-slate-400">
              검색어
              <input
                data-testid="memory-search-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleSearch();
                }}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
                placeholder="작업, 결정, 오류, 노하우"
              />
            </label>
            <label className="min-w-0 text-[11px] font-medium text-slate-400">
              태그
              <input
                data-testid="memory-search-tags"
                value={tagText}
                onChange={(event) => setTagText(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
                placeholder="design, approved"
              />
            </label>
            <label className="text-[11px] font-medium text-slate-400">
              생성 시작
              <input
                data-testid="memory-search-created-from"
                type="date"
                value={createdFrom}
                onChange={(event) => setCreatedFrom(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              />
            </label>
            <label className="text-[11px] font-medium text-slate-400">
              생성 종료
              <input
                data-testid="memory-search-created-to"
                type="date"
                value={createdTo}
                onChange={(event) => setCreatedTo(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              />
            </label>
            <label className="text-[11px] font-medium text-slate-400">
              수정 시작
              <input
                data-testid="memory-search-updated-from"
                type="date"
                value={updatedFrom}
                onChange={(event) => setUpdatedFrom(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              />
            </label>
            <label className="text-[11px] font-medium text-slate-400">
              수정 종료
              <input
                data-testid="memory-search-updated-to"
                type="date"
                value={updatedTo}
                onChange={(event) => setUpdatedTo(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              />
            </label>
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-[repeat(6,minmax(120px,1fr))_auto_auto_auto]">
            <label className="text-[11px] font-medium text-slate-400">
              레이어
              <select
                data-testid="memory-search-layer"
                value={layer}
                onChange={(event) => setLayer(event.target.value as MemoryLayerFilter)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              >
                <option value="all">전체</option>
                <option value="core">핵심</option>
                <option value="episodic">경험</option>
                <option value="archival">보관</option>
                <option value="global">전사</option>
              </select>
            </label>
            <label className="text-[11px] font-medium text-slate-400">
              범위
              <select
                data-testid="memory-search-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as MemoryScopeFilter)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              >
                <option value="local">로컬</option>
                <option value="all">로컬+승인</option>
                <option value="global">승인 전사</option>
              </select>
            </label>
            <label className="text-[11px] font-medium text-slate-400">
              승격 상태
              <select
                data-testid="memory-search-promotion"
                value={promotionStatus}
                onChange={(event) => setPromotionStatus(event.target.value as MemoryPromotionFilter)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              >
                <option value="all">전체</option>
                <option value="local">local</option>
                <option value="candidate">candidate</option>
                <option value="promoted">promoted</option>
                <option value="rejected">rejected</option>
              </select>
            </label>
            <label className="text-[11px] font-medium text-slate-400">
              출처
              <select
                data-testid="memory-search-source"
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value as MemorySourceFilter)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              >
                <option value="all">전체</option>
                <option value="manual">manual</option>
                <option value="task_run">task_run</option>
                <option value="beads">beads</option>
              </select>
            </label>
            <label className="text-[11px] font-medium text-slate-400">
              랭킹
              <select
                data-testid="memory-search-ranking"
                value={rankingMode}
                onChange={(event) => setRankingMode(event.target.value as MemoryRankingMode)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              >
                <option value="default">기본</option>
                <option value="semantic">semantic</option>
                <option value="vector">local vector</option>
                <option value="semantic_provider">provider semantic</option>
              </select>
            </label>
            <label className="min-w-0 text-[11px] font-medium text-slate-400">
              에이전트
              <select
                data-testid="memory-search-agent"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
              >
                <option value="">전체</option>
                {sortedAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name_ko || agent.name || agent.id}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={!canSearch || loading}
              className="self-end rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "검색 중" : "검색"}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveSearch()}
              disabled={!canSearch || saving}
              className="self-end rounded-md border border-cyan-500/30 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/10 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "저장 중" : "저장"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="self-end rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 active:translate-y-px"
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      {(savedSearches.length > 0 || recentSearches.length > 0) && (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {savedSearches.length > 0 && (
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/35 p-2" data-testid="memory-saved-searches">
              <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">저장 검색</div>
              <div className="flex flex-wrap gap-1">
                {savedSearches.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex max-w-full items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 text-[10px] text-cyan-100"
                  >
                    <button
                      type="button"
                      onClick={() => applySearchSnapshot(item)}
                      className="max-w-[180px] truncate px-2 py-1 hover:bg-cyan-500/20"
                      title={item.label}
                    >
                      {item.label}
                    </button>
                    <button
                      type="button"
                      aria-label={`${item.label} 삭제`}
                      onClick={() => void handleDeleteSavedSearch(item)}
                      className="border-l border-cyan-400/20 px-1.5 py-1 text-cyan-200 hover:bg-cyan-500/20"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {recentSearches.length > 0 && (
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/35 p-2" data-testid="memory-recent-searches">
              <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">최근 검색</div>
              <div className="flex flex-wrap gap-1">
                {recentSearches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applySearchSnapshot(item)}
                    className="max-w-full truncate rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                    title={item.label}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error ? (
        <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="mt-3 max-h-[320px] overflow-y-auto rounded-lg border border-slate-800/80 bg-slate-950/50">
        {results.length > 0 ? (
          <div className="divide-y divide-slate-800/80">
            {results.map((memory) => {
              const tags = memoryTags(memory);
              return (
                <article key={`${memory.id}-${memory.updated_at}`} className="p-3" data-testid="memory-search-result">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-100" title={memory.title}>
                        {memory.title}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-400">{summarizeMemory(memory)}</div>
                    </div>
                    <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-100">
                      {memory.memory_layer}/{memory.memory_type}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                    <span>생성 {formatDate(memory.created_at)}</span>
                    <span>수정 {formatDate(memory.updated_at)}</span>
                    {memory.project_id ? <span>project {renderProjectLabel(memory.project_id)}</span> : null}
                    {memory.agent_id ? <span>agent {memory.agent_id}</span> : null}
                    <span>status {memory.promotion_status}</span>
                    <span>source {memory.source_type}</span>
                    {tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-slate-700 px-1.5 py-0.5 text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-slate-500">
            {searched ? "검색 결과가 없습니다." : "검색 조건을 입력하세요."}
          </div>
        )}
      </div>
    </section>
  );
}
