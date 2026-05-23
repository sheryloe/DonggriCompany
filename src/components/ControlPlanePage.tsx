import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  applyControlPlaneSync,
  createControlPlanePersona,
  decideControlPlanePersona,
  getAgentMemoryContext,
  getControlPlaneState,
  rememberAgentMemory,
  prepareControlPlaneRun,
  previewControlPlaneSync,
  searchAgentMemoryFunctional,
  startControlPlaneRun,
  type ControlPlaneDepartmentMemory,
  type ControlPlaneMasterDepartment,
  type ControlPlaneMemoryContextResult,
  type ControlPlaneMemoryRememberResult,
  type ControlPlaneMemorySearchResult,
  type ControlPlaneProjectOperator,
  type ControlPlaneRunResult,
  type ControlPlaneState,
  type ControlPlaneSyncResult,
} from "../api/control-plane";

type TabKey = "root" | "departments" | "operators" | "runner" | "memory" | "tasks" | "safety";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "root", label: "Root" },
  { key: "operators", label: "프로젝트" },
  { key: "departments", label: "마스터 에이전트" },
  { key: "runner", label: "Runner" },
  { key: "memory", label: "Memory" },
  { key: "tasks", label: "업무" },
  { key: "safety", label: "안전" },
];

interface ControlPlanePageProps {
  initialTab?: TabKey;
  compactHeader?: boolean;
}

function formatDate(value: string | number | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function tone(ok: boolean | null | undefined): string {
  if (ok === true) return "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100";
  if (ok === false) return "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-100";
  return "border-slate-400/40 bg-slate-400/10";
}

function Pill({ children, ok }: { children: ReactNode; ok?: boolean | null }) {
  return <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${tone(ok)}`}>{children}</span>;
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section className="command-panel p-4">
      {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">{eyebrow}</div>}
      <h2 className="mt-1 text-base font-bold" style={{ color: "var(--th-text-primary)" }}>{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--th-text-muted)" }}>{label}</div>
      <div className="mt-1 text-lg font-bold" style={{ color: "var(--th-text-primary)" }}>{value}</div>
      {hint && <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>{hint}</div>}
    </div>
  );
}

function getRunId(result: ControlPlaneRunResult | null): string | null {
  const id = result?.run?.id;
  return typeof id === "string" ? id : null;
}

function getLatestPersonaId(result: ControlPlaneRunResult | null): string | null {
  const personas = result?.personas;
  if (!Array.isArray(personas) || personas.length === 0) return null;
  const id = personas[0]?.persona_id;
  return typeof id === "string" ? id : null;
}

function MasterDepartmentCard({
  department,
  memory,
}: {
  department: ControlPlaneMasterDepartment;
  memory?: ControlPlaneDepartmentMemory;
}) {
  return (
    <article className="rounded-lg border p-3" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: department.accent }} />
            <h3 className="font-semibold" style={{ color: "var(--th-text-primary)" }}>{department.label}</h3>
            <Pill ok>{department.short_label}</Pill>
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--th-text-secondary)" }}>{department.mission}</p>
          <p className="mt-2 text-xs" style={{ color: "var(--th-text-muted)" }}>{department.write_boundary}</p>
        </div>
        <div className="text-right text-xs" style={{ color: "var(--th-text-muted)" }}>
          <div>{department.memory_scope}</div>
          <div>{department.can_create_write_persona ? "write gated" : "read-only"}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill ok={department.can_create_read_persona}>서브에이전트 생성</Pill>
        <Pill ok={department.can_create_write_persona}>쓰기 권한 gate</Pill>
        <Pill ok={memory?.agentmemory_available ?? false}>{memory?.agentmemory_available ? "memory online" : "memory 대기"}</Pill>
      </div>
      <div className="mt-3 text-xs" style={{ color: "var(--th-text-muted)" }}>{department.memory_focus}</div>
    </article>
  );
}

function ProjectScopeCard({
  scope,
  selected,
  onSelect,
}: {
  scope: ControlPlaneProjectOperator;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition ${selected ? "ring-2 ring-cyan-400/35" : ""}`}
      style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{scope.project_key}</h3>
            <Pill ok={scope.enabled}>{scope.enabled ? "운영 대상" : "후보"}</Pill>
            <Pill ok={!scope.can_write_repo}>직접 쓰기 차단</Pill>
          </div>
          <p className="mt-2 truncate font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>{scope.project_path}</p>
          <p className="mt-2 text-sm" style={{ color: "var(--th-text-secondary)" }}>
            운영 마스터가 project scope로 잡고, 구현은 승인된 개발 마스터 작업으로 위임합니다.
          </p>
        </div>
        <div className="text-right text-xs" style={{ color: "var(--th-text-muted)" }}>
          <div>운영 마스터</div>
          <div>{scope.memory_scope}</div>
          <div>{scope.link_status}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill ok={scope.link_status === "linked"}>{scope.link_status}</Pill>
        <Pill ok={scope.git_status === "clean"}>{scope.git_status}</Pill>
        <Pill ok={scope.risk_flags.length === 0}>{scope.risk_flags.length} risk</Pill>
      </div>
    </button>
  );
}

export default function ControlPlanePage({ initialTab = "root", compactHeader = false }: ControlPlanePageProps) {
  const [state, setState] = useState<ControlPlaneState | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<ControlPlaneSyncResult | null>(null);
  const [runnerResult, setRunnerResult] = useState<ControlPlaneRunResult | null>(null);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryScope, setMemoryScope] = useState("root");
  const [memoryCaptureText, setMemoryCaptureText] = useState("");
  const [memoryResult, setMemoryResult] = useState<ControlPlaneMemorySearchResult | null>(null);
  const [memoryContextResult, setMemoryContextResult] = useState<ControlPlaneMemoryContextResult | null>(null);
  const [memoryRememberResult, setMemoryRememberResult] = useState<ControlPlaneMemoryRememberResult | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await getControlPlaneState());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const memoryByDepartment = useMemo(() => {
    const map = new Map<string, ControlPlaneDepartmentMemory>();
    for (const item of state?.dongri_grigri?.department_memory ?? []) map.set(item.department, item);
    return map;
  }, [state]);

  if (loading && !state) {
    return (
      <div className="command-panel flex items-center gap-3 p-4 text-sm" style={{ color: "var(--th-text-secondary)" }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Dongri-grigri 운영 상태를 불러오는 중입니다.
      </div>
    );
  }

  if (!state) {
    return (
      <div className="command-panel p-4 text-sm text-rose-700 dark:text-rose-100">
        운영 상태를 불러오지 못했습니다. {error}
      </div>
    );
  }

  const masterDepartments = state.dongri_grigri.master_departments ?? [];
  const scopes = state.dongri_grigri.project_scopes ?? state.dongri_grigri.project_operators ?? [];
  const enabledScopes = scopes.filter((scope) => scope.enabled);
  const candidateScopes = scopes.filter((scope) => !scope.enabled);
  const selectedScope =
    scopes.find((scope) => scope.operator_id === selectedScopeId) ?? enabledScopes[0] ?? scopes[0] ?? null;
  const linkedScopeCount = scopes.filter((scope) => scope.link_status === "linked").length;
  const runId = getRunId(runnerResult);
  const personaId = getLatestPersonaId(runnerResult);
  const memoryScopes = Array.from(
    new Set([
      "root",
      ...masterDepartments.map((department) => department.memory_scope),
      ...enabledScopes.map((scope) => scope.memory_scope),
      "run:latest",
      "persona:latest",
    ]),
  );

  return (
    <section className="space-y-4" style={{ color: "var(--th-text-primary)" }}>
      {!compactHeader && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">
                <ShieldCheck className="h-4 w-4" />
                Dongri-grigri Ver.1
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-normal">Office Control Platform</h1>
              <p className="mt-2 max-w-3xl text-sm" style={{ color: "var(--th-text-secondary)" }}>
                Root Control Plane, Kiro식 SDD 구조, AgentMemory, 마스터 에이전트, 프로젝트 scope를 한 화면에서 운영합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || busy}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
            >
              <RefreshCw className="h-4 w-4" />
              새로고침
            </button>
          </div>
          {error && <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-100">{error}</div>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              activeTab === tab.key ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-700 dark:text-cyan-100" : ""
            }`}
            style={activeTab === tab.key ? undefined : { borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "root" && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Root 상태" eyebrow="source of truth">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Control Root" value={state.root.path} hint={state.root.control_root.path} />
              <Metric label="Repos Root" value={state.root.repo_estate_root.path} />
              <Metric label="Runtime App" value={state.root.runtime_projection_app.path} />
              <Metric label="Active Spec" value={state.active_spec.id ?? "-"} hint={state.active_spec.phase ?? undefined} />
            </div>
          </Panel>
          <Panel title="품질 게이트" eyebrow="Ver.1">
            <div className="grid gap-3">
              <Metric label="Score" value={`${state.ver1.quality_score.score}/${state.ver1.quality_score.target}`} hint={state.ver1.quality_score.pass ? "pass" : "확인 필요"} />
              <div className="flex flex-wrap gap-2">
                <Pill ok={!state.ver1.hard_gates.has_kiro_dir}>.kiro 없음</Pill>
                <Pill ok={state.ver1.hard_gates.no_team_hierarchy}>직원 계층 기본 모델 아님</Pill>
                <Pill ok={state.dongri_grigri.korean_text_integrity.pass}>한글 무결성</Pill>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "departments" && (
        <Panel title="6개 마스터 에이전트" eyebrow="business model">
          <div className="mb-4 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-secondary)" }}>
            CONTROL/SPEC 같은 내부 SDD 역할은 실행 규칙으로만 남기고, 사용자 화면에는 실제 업무 부서 마스터를 표시합니다.
          </div>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {masterDepartments.map((department) => (
              <MasterDepartmentCard
                key={department.id}
                department={department}
                memory={memoryByDepartment.get(department.id)}
              />
            ))}
          </div>
        </Panel>
      )}

      {activeTab === "operators" && (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel title="운영 마스터 프로젝트 scope" eyebrow="one operator, many projects">
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <Metric label="운영 마스터" value="1" hint="상주 운영 에이전트" />
              <Metric label="운영 scope" value={enabledScopes.length} hint="확정 프로젝트" />
              <Metric label="후보 scope" value={candidateScopes.length} hint="보류 대상" />
              <Metric label="DB link" value={linkedScopeCount} hint="Control Plane link 상태" />
            </div>
            <div className="mb-3 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-secondary)" }}>
              프로젝트마다 운영 에이전트를 늘리지 않습니다. 운영 마스터가 project scope를 바꿔 잡고, 조사/요약은 서브에이전트로 처리합니다.
            </div>
            <div className="grid gap-3">
              {scopes.map((scope) => (
                <ProjectScopeCard
                  key={scope.operator_id}
                  scope={scope}
                  selected={selectedScope?.operator_id === scope.operator_id}
                  onSelect={() => setSelectedScopeId(scope.operator_id)}
                />
              ))}
            </div>
          </Panel>

          <Panel title={selectedScope ? `${selectedScope.project_key} 상세` : "프로젝트 상세"} eyebrow="scope detail">
            {selectedScope ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Metric label="Memory Scope" value={selectedScope.memory_scope} hint={selectedScope.absolute_path} />
                  <Metric label="Policy" value="operations-only" hint="repo write는 개발 마스터로 위임" />
                  <Metric label="Git" value={selectedScope.git_status} hint={selectedScope.git_branch ?? undefined} />
                  <Metric label="Risk" value={selectedScope.risk_flags.length} hint={selectedScope.risk_flags.join(", ") || "없음"} />
                </div>
                <div className="grid gap-3 md:grid-cols-5">
                  {["Memory", "Runs", "Handoff", "Backlog", "Risk"].map((tab) => (
                    <div key={tab} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}>
                      <div className="font-semibold">{tab}</div>
                      <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>scope 기반 요약</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>선택된 프로젝트 scope가 없습니다.</div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === "runner" && (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title="마스터/서브에이전트 Runner" eyebrow="orchestrator">
            <p className="mb-3 text-sm" style={{ color: "var(--th-text-secondary)" }}>
              runner는 context-pack, hook gate, approval ledger를 확인한 뒤 실제 run/persona 이벤트만 기록합니다.
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const result = await prepareControlPlaneRun({
                      department_agent: "OPS",
                      objective: "Dongri-grigri office control read-only smoke run",
                      selected_repo: "DonggriCompany",
                      persona_needed: true,
                      confidence: "high",
                      evidence: ["EV-20260523-001"],
                    });
                    setRunnerResult(result);
                  })
                }
                className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-700 disabled:opacity-50 dark:text-cyan-100"
              >
                운영 run 준비
              </button>
              <button
                type="button"
                disabled={busy || !runId}
                onClick={() =>
                  void runAction(async () => {
                    if (!runId) return;
                    setRunnerResult(await startControlPlaneRun(runId));
                  })
                }
                className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
              >
                run 시작
              </button>
              <button
                type="button"
                disabled={busy || !runId}
                onClick={() =>
                  void runAction(async () => {
                    if (!runId) return;
                    setRunnerResult(
                      await createControlPlanePersona(runId, {
                        parent_agent: "OPS",
                        persona_id: `ops-scope-${Date.now()}`,
                        objective: "Read-only project scope and memory status check",
                        write_policy: "read-only",
                        allowed_paths: { read: ["G:/Donggri_DevDrive/storage/codex-control"], write: [] },
                        return_schema: ["summary", "evidence_path", "risk"],
                      }),
                    );
                  })
                }
                className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
              >
                read-only 서브에이전트 생성
              </button>
              <button
                type="button"
                disabled={busy || !personaId}
                onClick={() =>
                  void runAction(async () => {
                    if (!personaId) return;
                    setRunnerResult(
                      await decideControlPlanePersona(personaId, {
                        decision: "accept",
                        reason: "Read-only smoke persona returned an evidence-backed result.",
                        evidence_refs: ["EV-20260523-001"],
                      }),
                    );
                  })
                }
                className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50 dark:text-emerald-100"
              >
                서브에이전트 accept
              </button>
            </div>
          </Panel>
          <Panel title="최근 run" eyebrow="actual events only">
            {runnerResult ? (
              <pre className="max-h-80 overflow-auto rounded-lg border p-3 text-xs" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-secondary)" }}>
                {JSON.stringify(runnerResult, null, 2)}
              </pre>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm" style={{ borderColor: "var(--th-border)", color: "var(--th-text-muted)" }}>
                아직 현재 화면에서 실행한 run이 없습니다.
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === "memory" && (
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <Panel title="AgentMemory 상태" eyebrow="safe memory layer">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Server" value={state.memory.server_url} hint={state.memory.health.available ? "online" : "offline 또는 미실행"} />
              <Metric label="Viewer" value={state.memory.viewer_url} hint={state.memory.livez?.available ? "livez ok" : "viewer 대기"} />
              <Metric label="Runtime" value={state.memory.runtime_path} />
              <Metric label="Mode" value={state.memory.integration_mode} hint={state.memory.safe_proxy_available ? "safe proxy on" : "offline fallback"} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill ok={state.memory.health.available}>health</Pill>
              <Pill ok={state.memory.readiness?.smart_search_available}>smart search</Pill>
              <Pill ok={state.memory.readiness?.context_available}>context</Pill>
              <Pill ok={!state.memory.readiness?.delete_forget_enabled}>delete/forget blocked</Pill>
              <Pill ok={!state.memory.readiness?.hook_auto_capture_enabled}>auto hooks off</Pill>
            </div>
          </Panel>

          <Panel title="Search / Context / Remember" eyebrow="department and project scopes">
            <div className="grid gap-3">
              <div className="grid gap-2 md:grid-cols-[1fr_260px]">
                <input
                  value={memoryQuery}
                  onChange={(event) => setMemoryQuery(event.target.value)}
                  placeholder="메모리 검색어 또는 context 질문"
                  className="min-w-0 rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
                />
                <select
                  value={memoryScope}
                  onChange={(event) => setMemoryScope(event.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
                >
                  {memoryScopes.map((scope) => (
                    <option key={scope} value={scope}>{scope}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(async () => setMemoryResult(await searchAgentMemoryFunctional({ query: memoryQuery, scope: memoryScope })))}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                >
                  Smart Search
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(async () => setMemoryContextResult(await getAgentMemoryContext({ query: memoryQuery, scope: memoryScope })))}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                >
                  Context Recall
                </button>
              </div>
              <textarea
                value={memoryCaptureText}
                onChange={(event) => setMemoryCaptureText(event.target.value)}
                placeholder="승인된 범위 안에서 기록할 운영 메모를 입력하세요."
                rows={4}
                className="min-h-24 rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-primary)" }}
              />
              <button
                type="button"
                disabled={busy || !memoryCaptureText.trim()}
                onClick={() =>
                  void runAction(async () => {
                    if (!window.confirm("APR-MEM-001 범위 안에서만 메모리를 저장합니다. delete/forget/import/hook 작업은 실행하지 않습니다.")) return;
                    setMemoryRememberResult(
                      await rememberAgentMemory({
                        text: memoryCaptureText,
                        scope: memoryScope,
                        spec_id: state.active_spec.id ?? undefined,
                        source_ref: "Dongri-grigri Office Control Platform",
                        confirm: "remember-to-agentmemory",
                      }),
                    );
                  })
                }
                className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-700 disabled:opacity-50 dark:text-cyan-100"
              >
                Remember 저장
              </button>
              {(memoryResult || memoryContextResult || memoryRememberResult) && (
                <pre className="max-h-72 overflow-auto rounded-lg border p-3 text-xs" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-secondary)" }}>
                  {JSON.stringify({ search: memoryResult, context: memoryContextResult, remember: memoryRememberResult }, null, 2)}
                </pre>
              )}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "tasks" && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Control Plane Sync" eyebrow="control_plane tables only">
            <div className="grid gap-3">
              <Metric label="Sync tables" value={state.sync.tables_exist ? "ready" : "not created"} />
              <Metric label="Latest snapshot" value={state.sync.latest_snapshot?.id ? "present" : "-"} hint={state.sync.latest_snapshot?.active_spec_id ?? undefined} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(async () => setSyncResult(await previewControlPlaneSync()))}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                >
                  미리보기
                </button>
                <button
                  type="button"
                  disabled={busy || syncResult?.mode !== "preview" || syncResult.approved_for_apply !== true}
                  onClick={() =>
                    void runAction(async () => {
                      if (!window.confirm("control_plane_* 전용 테이블에 sync snapshot/link를 기록할까요? 기존 domain table은 수정하지 않습니다.")) return;
                      setSyncResult(await applyControlPlaneSync());
                    })
                  }
                  className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-700 disabled:opacity-50 dark:text-cyan-100"
                >
                  DB sync apply
                </button>
              </div>
              {syncResult && (
                <pre className="max-h-72 overflow-auto rounded-lg border p-3 text-xs" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-secondary)" }}>
                  {JSON.stringify(syncResult.counts, null, 2)}
                </pre>
              )}
            </div>
          </Panel>
          <Panel title="Registry" eyebrow="projects.yaml">
            <div className="space-y-2">
              {state.registry.projects.map((project) => (
                <div key={project.key} className="grid gap-2 border-t py-2 text-xs md:grid-cols-[1fr_120px_120px]" style={{ borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}>
                  <div className="min-w-0">
                    <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>{project.key}</div>
                    <div className="truncate font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>{project.path}</div>
                  </div>
                  <Pill ok={project.db_project_id !== null}>{project.db_project_id ? "linked" : "unlinked"}</Pill>
                  <Pill ok={project.git.status === "clean"}>{project.git.status}</Pill>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "safety" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="안전 게이트" eyebrow="deny by default">
            <div className="grid gap-3">
              {state.safety.approvals_required.map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)", color: "var(--th-text-secondary)" }}>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  {item}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="한글 무결성" eyebrow="text integrity">
            <div className="grid gap-3">
              <Metric label="Scan" value={state.dongri_grigri.korean_text_integrity.pass ? "pass" : "needs fix"} hint={`${state.dongri_grigri.korean_text_integrity.total_matches} matches / ${state.dongri_grigri.korean_text_integrity.checked_files} files`} />
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--th-text-secondary)" }}>
                {state.dongri_grigri.korean_text_integrity.pass ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                깨진 한글 패턴은 UI 품질 게이트에서 차단합니다.
              </div>
            </div>
          </Panel>
        </div>
      )}
    </section>
  );
}
