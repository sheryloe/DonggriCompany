import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import { localeName } from "../../i18n";
import type { Department } from "../../types";
import type { Translator } from "./types";

type Catalog = api.CodexSubagentCatalogSnapshot;
type CatalogAgent = api.CodexSubagentEntry;

const STANDARD_DEPT_ORDER = ["planning", "dev", "design", "qa", "devsecops", "operations"] as const;

function safeLower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function matchesQuery(agent: CatalogAgent, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return (
    safeLower(agent.name).includes(normalized) ||
    safeLower(agent.description).includes(normalized) ||
    safeLower(agent.upstreamCategory).includes(normalized) ||
    safeLower(agent.upstreamPath).includes(normalized) ||
    safeLower(agent.department).includes(normalized) ||
    safeLower(agent.class_stage_1).includes(normalized) ||
    safeLower(agent.class_stage_2).includes(normalized) ||
    safeLower(agent.class_stage_3).includes(normalized)
  );
}

function formatClassPath(agent: CatalogAgent): string {
  const parts = [agent.class_stage_1, agent.class_stage_2, agent.class_stage_3].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" > ") : "-";
}

function groupByDepartment(agents: CatalogAgent[]): Map<string, CatalogAgent[]> {
  const grouped = new Map<string, CatalogAgent[]>();
  for (const agent of agents) {
    const current = grouped.get(agent.department) ?? [];
    current.push(agent);
    grouped.set(agent.department, current);
  }

  for (const entries of grouped.values()) {
    entries.sort((left, right) => left.name.localeCompare(right.name));
  }

  return grouped;
}

export default function SubagentsTab({
  tr,
  locale,
  departments,
  deptTab,
  setDeptTab,
  search,
  setSearch,
}: {
  tr: Translator;
  locale: string;
  isKo: boolean;
  departments: Department[];
  deptTab: string;
  setDeptTab: (deptId: string) => void;
  search: string;
  setSearch: (next: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deptById = useMemo(() => new Map(departments.map((dept) => [dept.id, dept])), [departments]);
  const orderedDepartmentIds = useMemo(() => {
    const existing = new Set(departments.map((dept) => dept.id));
    const primary = STANDARD_DEPT_ORDER.filter((deptId) => existing.has(deptId));
    const extra = departments
      .filter((dept) => !STANDARD_DEPT_ORDER.includes(dept.id as (typeof STANDARD_DEPT_ORDER)[number]))
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((dept) => dept.id);

    return [...primary, ...extra];
  }, [departments]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.getCodexSubagentCatalog();
      setCatalog(next);
    } catch (loadError) {
      if (api.isApiRequestError(loadError)) {
        setError(`${loadError.code ?? "request_failed"} (${loadError.status})`);
      } else {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const filteredAgents = useMemo(() => {
    const query = search.trim();
    return (catalog?.agents ?? []).filter((agent) => {
      if (deptTab !== "all" && agent.department !== deptTab) {
        return false;
      }
      return matchesQuery(agent, query);
    });
  }, [catalog, deptTab, search]);

  const groupedAgents = useMemo(() => groupByDepartment(filteredAgents), [filteredAgents]);
  const totalCount = catalog?.total ?? 0;
  const generatedAt = catalog?.generatedAt ? new Date(catalog.generatedAt).toLocaleString() : "-";
  const departmentTotals = catalog?.departmentSummary ?? {};
  const inputStyle = {
    background: "var(--th-input-bg)",
    border: "1px solid var(--th-input-border)",
    color: "var(--th-text-primary)",
  };

  if (loading && !catalog) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>
          {tr("서브에이전트 카탈로그를 불러오는 중입니다.", "Loading the sub-agent catalog.")}
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div
        className="rounded-xl px-4 py-4"
        style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
      >
        <div className="text-sm font-medium" style={{ color: "var(--th-text-heading)" }}>
          {tr("서브에이전트 카탈로그를 불러오지 못했습니다.", "Unable to load the sub-agent catalog.")}
        </div>
        <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>
          {error ?? "unknown_error"}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <code
            className="rounded px-2 py-1 text-xs"
            style={{ background: "var(--th-bg-surface-hover)", color: "var(--th-text-primary)" }}
          >
            pnpm subagents:sync
          </code>
          <button
            onClick={() => void loadCatalog()}
            className="rounded-lg border px-3 py-1.5 text-xs transition-all hover:bg-white/5"
            style={{ borderColor: "var(--th-input-border)", color: "var(--th-text-muted)" }}
          >
            {tr("다시 시도", "Retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: tr("전체", "Total"), value: totalCount },
          { label: tr("현재 표시", "Shown"), value: filteredAgents.length },
          { label: tr("생성 시각", "Generated"), value: generatedAt },
        ].map((summary) => (
          <div
            key={summary.label}
            className="rounded-xl px-4 py-3"
            style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
          >
            <div className="text-xs" style={{ color: "var(--th-text-muted)" }}>
              {summary.label}
            </div>
            <div className="mt-1 text-sm font-bold tabular-nums" style={{ color: "var(--th-text-heading)" }}>
              {summary.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: "var(--th-card-border)" }}>
        <button
          onClick={() => setDeptTab("all")}
          className={`px-3 py-1.5 text-xs font-medium ${deptTab === "all" ? "border-b-2 border-blue-400 text-blue-400" : ""}`}
          style={deptTab === "all" ? undefined : { color: "var(--th-text-muted)" }}
        >
          {tr("전체", "All")} <span className="opacity-60">{totalCount}</span>
        </button>

        {orderedDepartmentIds.map((deptId) => {
          const dept = deptById.get(deptId);
          const count = Number(departmentTotals[deptId] ?? 0);
          if (!dept || count <= 0) {
            return null;
          }

          return (
            <button
              key={deptId}
              onClick={() => setDeptTab(deptId)}
              className={`px-3 py-1.5 text-xs font-medium ${deptTab === deptId ? "border-b-2 border-blue-400 text-blue-400" : ""}`}
              style={deptTab === deptId ? undefined : { color: "var(--th-text-muted)" }}
            >
              {localeName(locale, dept)} <span className="opacity-60">{count}</span>
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`${tr("검색", "Search")}...`}
            className="w-52 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/40"
            style={inputStyle}
          />
          <button
            onClick={() => void loadCatalog()}
            className="rounded-lg border px-3 py-1.5 text-xs transition-all hover:bg-white/5"
            style={{ borderColor: "var(--th-input-border)", color: "var(--th-text-muted)" }}
          >
            {tr("새로고침", "Reload")}
          </button>
        </div>
      </div>

      {filteredAgents.length === 0 ? (
        <div
          className="rounded-xl px-4 py-6 text-sm"
          style={{
            background: "var(--th-card-bg)",
            border: "1px solid var(--th-card-border)",
            color: "var(--th-text-muted)",
          }}
        >
          {tr("조건에 맞는 서브에이전트가 없습니다.", "No sub-agents match the current filters.")}
        </div>
      ) : null}

      {[...groupedAgents.entries()].map(([departmentId, agents]) => {
        const department = deptById.get(departmentId);
        return (
          <section key={departmentId} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                {department ? localeName(locale, department) : departmentId}
              </div>
              <div className="text-xs" style={{ color: "var(--th-text-muted)" }}>
                {agents.length}
              </div>
            </div>

            <div className="grid gap-3">
              {agents.map((agent) => (
                <article
                  key={`${agent.department}:${agent.name}`}
                  className="rounded-xl px-4 py-4"
                  style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                        {agent.name}
                      </div>
                      <div className="mt-1 text-xs leading-5" style={{ color: "var(--th-text-muted)" }}>
                        {agent.description || "-"}
                      </div>
                    </div>
                    <code
                      className="rounded px-2 py-1 text-[11px]"
                      style={{ background: "var(--th-bg-surface-hover)", color: "var(--th-text-primary)" }}
                    >
                      {agent.upstreamCategory}
                    </code>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs">
                    <div style={{ color: "var(--th-text-secondary)" }}>
                      <strong>{tr("클래스 경로", "Class path")}:</strong> {formatClassPath(agent)}
                    </div>
                    <div style={{ color: "var(--th-text-secondary)" }}>
                      <strong>{tr("원본 경로", "Source")}:</strong> <code>{agent.upstreamPath}</code>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
