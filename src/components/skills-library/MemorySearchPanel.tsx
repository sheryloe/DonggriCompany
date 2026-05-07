import { useMemo, useState } from "react";
import { isApiRequestError, searchMemory } from "../../api";
import type { Agent, NativeMemory } from "../../types";

type MemoryLayerFilter = "all" | "core" | "episodic" | "archival" | "global";
type MemoryScopeFilter = "local" | "all" | "global";

interface MemorySearchPanelProps {
  agents: Agent[];
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

export default function MemorySearchPanel({ agents }: MemorySearchPanelProps) {
  const [query, setQuery] = useState("");
  const [tagText, setTagText] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [updatedTo, setUpdatedTo] = useState("");
  const [layer, setLayer] = useState<MemoryLayerFilter>("all");
  const [scope, setScope] = useState<MemoryScopeFilter>("local");
  const [agentId, setAgentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [results, setResults] = useState<NativeMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => (a.name_ko || a.name || a.id).localeCompare(b.name_ko || b.name || b.id, "ko")),
    [agents],
  );

  const canSearch =
    query.trim() ||
    tagText.trim() ||
    createdFrom ||
    createdTo ||
    updatedFrom ||
    updatedTo ||
    layer !== "all" ||
    agentId ||
    projectId ||
    scope === "global";

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
        agent_id: agentId || null,
        project_id: projectId.trim() || null,
        limit: 20,
      });
      setResults(rows);
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
    setScope("local");
    setAgentId("");
    setProjectId("");
    setResults([]);
    setSearched(false);
    setError(null);
  };

  return (
    <section className="border-y border-slate-800/80 bg-slate-950/25 py-3" data-testid="memory-search-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">장기기억 검색</h3>
          <div className="mt-0.5 text-[11px] text-slate-500">프로젝트/에이전트 메모리 조회</div>
        </div>
        <div className="text-[11px] text-slate-500">결과 {results.length}개</div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.8fr)_repeat(4,minmax(120px,0.75fr))]">
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
            placeholder="작업, 결정, 오류, 라우팅"
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

      <div className="mt-2 grid gap-2 md:grid-cols-[minmax(130px,0.8fr)_minmax(130px,0.8fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto_auto]">
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
        <label className="min-w-0 text-[11px] font-medium text-slate-400">
          프로젝트 ID
          <input
            data-testid="memory-search-project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-400"
            placeholder="project_id"
          />
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
          onClick={handleClear}
          className="self-end rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 active:translate-y-px"
        >
          초기화
        </button>
      </div>

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
                    {memory.project_id ? <span>project {memory.project_id}</span> : null}
                    {memory.agent_id ? <span>agent {memory.agent_id}</span> : null}
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
