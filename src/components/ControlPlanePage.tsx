import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  activateCodexThread,
  attachEngineThread,
  applyControlPlaneSync,
  applyHarnessBlueprint,
  createEngineRun,
  createControlPlanePersona,
  decideControlPlanePersona,
  finishCodexThread,
  getAgentMemoryContext,
  getCodexThreadCurrent,
  getControlPlaneState,
  rememberAgentMemory,
  prepareControlPlaneRun,
  previewEngineRoute,
  previewControlPlaneSync,
  previewHarnessBlueprint,
  reconcileEngineSync,
  searchAgentMemoryFunctional,
  saveHarnessBlueprintDraft,
  startControlPlaneRun,
  type CodexThreadCurrentResult,
  type EngineProvider,
  type EngineRoutePreviewResult,
  type EngineRunResult,
  type ControlPlaneDepartmentMemory,
  type ControlPlaneMasterDepartment,
  type ControlPlaneMemoryContextResult,
  type ControlPlaneMemoryRememberResult,
  type ControlPlaneMemorySearchResult,
  type ControlPlaneProjectOperator,
  type ControlPlaneRunResult,
  type ControlPlaneState,
  type ControlPlaneSyncResult,
  type HarnessBlueprintPattern,
  type HarnessBlueprintResult,
  type HarnessBlueprintTargetMode,
} from "../api/control-plane";
import Master95OperationsPanel from "./control-tower/Master95OperationsPanel";

type TabKey =
  | "root"
  | "projects"
  | "departments"
  | "operators"
  | "operations"
  | "runner"
  | "memory"
  | "tasks"
  | "safety";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "root", label: "Root" },
  { key: "projects", label: "프로젝트 관리" },
  { key: "operators", label: "프로젝트" },
  { key: "departments", label: "마스터 에이전트" },
  { key: "operations", label: "관제" },
  { key: "runner", label: "Runner" },
  { key: "memory", label: "Memory" },
  { key: "tasks", label: "업무" },
  { key: "safety", label: "안전" },
];

const BLOGGERGENT_GROUP_LABELS: Record<string, string> = {
  "google-travel-blog": "Google Travel Blog Portfolio",
  "mystery-google-blog": "Mystery Google Blog",
  "cloudflare-blog": "Cloudflare Blog Portfolio",
  "mystery-cloudflare-blog": "Mystery Cloudflare Lane",
  "shared-infra": "Shared Platform / Quality",
};

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
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${tone(ok)}`}>{children}</span>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section className="command-panel p-4">
      {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">{eyebrow}</div>}
      <h2 className="mt-1 text-base font-bold" style={{ color: "var(--th-text-primary)" }}>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  const valueText = String(value);
  const compactValue = valueText.length > 18;
  return (
    <div
      className="min-w-0 rounded-lg border p-3"
      style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--th-text-muted)" }}>
        {label}
      </div>
      <div
        className={`mt-1 font-bold leading-tight ${compactValue ? "text-sm" : "text-lg"}`}
        style={{ color: "var(--th-text-primary)", overflowWrap: "anywhere", wordBreak: "break-word" }}
        title={valueText}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 break-words text-xs" style={{ color: "var(--th-text-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function formatMemoryScopeLabel(scope: string): string {
  if (scope === "root") return "Root 전체";
  if (scope.startsWith("department:")) return `부서: ${scope.slice("department:".length)}`;
  if (scope.startsWith("project:")) return `프로젝트: ${scope.slice("project:".length)}`;
  if (scope.startsWith("spec:")) return `Spec: ${scope.slice("spec:".length)}`;
  if (scope.startsWith("run:")) return "최근 Run";
  if (scope.startsWith("persona:")) return "최근 Persona";
  return scope;
}

function formatLifecycleStatus(status: string | null | undefined): string {
  if (status === "active") return "진행";
  if (status === "candidate") return "후보";
  if (status === "completed") return "완료";
  if (status === "archived") return "보관";
  return "미분류";
}

function lifecycleIsActive(status: string | null | undefined): boolean {
  return status === "active";
}

function formatDiscoveryClassification(value: string): string {
  if (value === "registered") return "등록";
  if (value === "candidate") return "후보";
  if (value === "excluded") return "제외";
  return value;
}

function summarizeMemoryPayload(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["요약 가능한 결과가 아직 없습니다."];
  const record = value as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof record.result_count === "number") lines.push(`결과 ${record.result_count}건`);
  if (typeof record.result_container === "string") lines.push(`컨테이너: ${record.result_container}`);
  if (Array.isArray(record.sample_keys) && record.sample_keys.length > 0)
    lines.push(`샘플 키: ${record.sample_keys.slice(0, 5).join(", ")}`);
  if (Array.isArray(record.top_level_keys) && record.top_level_keys.length > 0)
    lines.push(`상위 키: ${record.top_level_keys.slice(0, 5).join(", ")}`);
  if (record.raw_payload_omitted === true) lines.push("원문 payload는 표시하지 않음");
  return lines.length > 0 ? lines : ["요약 결과를 카드로 표시할 수 없습니다."];
}

function formatMemoryUnavailable(error: string | null | undefined): string {
  if (error === "query_required") return "검색어를 입력하면 작업대가 결과를 확인합니다.";
  if (error === "agentmemory_unavailable") return "AgentMemory 미실행 상태입니다. 검색은 runtime 연결 후 가능합니다.";
  if (error === "approval_required") return "승인 항목이 없어 저장을 막았습니다.";
  return error ?? "AgentMemory 응답을 기다리는 중입니다.";
}

function formatBlockedOperation(operation: string): string {
  const labels: Record<string, string> = {
    "runtime connect": "런타임 연결",
    "install/start": "설치/시작",
    "MCP wiring": "MCP 연결",
    "global hooks": "전역 hooks",
    "transcript capture": "대화 원문 수집",
    "delete/forget": "삭제/망각",
    import: "가져오기",
  };
  return labels[operation] ?? operation;
}

function MemoryResultCard({
  title,
  result,
  payloadKey,
}: {
  title: string;
  result: ControlPlaneMemorySearchResult | ControlPlaneMemoryContextResult | ControlPlaneMemoryRememberResult | null;
  payloadKey: "results" | "context" | "result";
}) {
  if (!result) return null;
  const payload = result[payloadKey as keyof typeof result];
  const lines = result.available ? summarizeMemoryPayload(payload) : [formatMemoryUnavailable(result.error)];
  return (
    <article
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>
            {title}
          </h4>
          <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>
            {result.available ? "AgentMemory 응답 수신" : "AgentMemory 미실행"}
          </div>
        </div>
        <Pill ok={result.ok}>{result.ok ? "정상" : "대기"}</Pill>
      </div>
      <div className="mt-3 grid gap-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
        {lines.map((line) => (
          <div
            key={line}
            className="rounded-md border px-2 py-1"
            style={{ borderColor: "var(--th-border)", background: "var(--th-bg-muted)" }}
          >
            {line}
          </div>
        ))}
      </div>
    </article>
  );
}

type MemoryViewerFrameState = "loading" | "embedded" | "fallback";

function getRunId(result: ControlPlaneRunResult | null): string | null {
  const id = result?.run?.id;
  return typeof id === "string" ? id : null;
}

function getRecordId(record: Record<string, unknown> | null | undefined): string | null {
  const id = record?.id;
  return typeof id === "string" ? id : null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getHarnessBlueprintId(result: HarnessBlueprintResult | null): string | null {
  if (!result) return null;
  if (typeof result.blueprint_id === "string") return result.blueprint_id;
  const draftId = result.draft?.id;
  if (typeof draftId === "string") return draftId;
  const previewId = result.blueprint?.preview_id;
  return typeof previewId === "string" ? previewId : null;
}

function parseRunContext(record: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const raw = record?.context_pack_json;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function getActivationThreadId(record: Record<string, unknown> | null | undefined): string | null {
  const value = parseRunContext(record).codex_thread_id;
  return typeof value === "string" ? value : null;
}

function getActivationScopeKey(record: Record<string, unknown> | null | undefined): string | null {
  const value = parseRunContext(record).scope_key;
  return typeof value === "string" ? value : null;
}

function getActivationSpecId(record: Record<string, unknown> | null | undefined): string | null {
  const context = parseRunContext(record);
  const snapshot = context.active_spec_snapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const id = (snapshot as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  return typeof record?.spec_id === "string" ? record.spec_id : null;
}

function shortThreadId(threadId: string | null | undefined): string {
  if (!threadId) return "-";
  return threadId.length > 13 ? `${threadId.slice(0, 8)}...${threadId.slice(-4)}` : threadId;
}

function activeSpecRelativePath(
  specId: string | null | undefined,
  fileName: "evidence.md" | "handoff.md",
): string | null {
  if (!specId) return null;
  return `storage/codex-control/specs/${specId}/${fileName}`;
}

function stableEvidenceHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ui-${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
    <article
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: department.accent }} />
            <h3 className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
              {department.label}
            </h3>
            <Pill ok>{department.short_label}</Pill>
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--th-text-secondary)" }}>
            {department.mission}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--th-text-muted)" }}>
            {department.write_boundary}
          </p>
        </div>
        <div className="text-right text-xs" style={{ color: "var(--th-text-muted)" }}>
          <div>{department.memory_scope}</div>
          <div>{department.can_create_write_persona ? "write gated" : "read-only"}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill ok={department.can_create_read_persona}>서브에이전트 생성</Pill>
        <Pill ok={department.can_create_write_persona}>쓰기 권한 gate</Pill>
        <Pill ok={memory?.agentmemory_available ?? false}>
          {memory?.agentmemory_available ? "memory online" : "memory 대기"}
        </Pill>
      </div>
      <div className="mt-3 text-xs" style={{ color: "var(--th-text-muted)" }}>
        {department.memory_focus}
      </div>
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
            <Pill ok={lifecycleIsActive(scope.lifecycle_status)}>{formatLifecycleStatus(scope.lifecycle_status)}</Pill>
            <Pill ok={scope.enabled}>{scope.enabled ? "운영 대상" : "후보"}</Pill>
            <Pill ok={!scope.can_write_repo}>직접 쓰기 차단</Pill>
          </div>
          <p className="mt-2 truncate font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>
            {scope.project_path}
          </p>
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
        {scope.notes && <Pill ok={scope.enabled}>{scope.notes}</Pill>}
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
  const [threadInfo, setThreadInfo] = useState<CodexThreadCurrentResult | null>(null);
  const [threadResult, setThreadResult] = useState<ControlPlaneRunResult | null>(null);
  const [threadScope, setThreadScope] = useState<"root" | "project" | "spec">("project");
  const [manualThreadId, setManualThreadId] = useState("");
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryScope, setMemoryScope] = useState("root");
  const [memoryCaptureText, setMemoryCaptureText] = useState("");
  const [memoryEvidenceRef, setMemoryEvidenceRef] = useState("EV-MEM-SUMMARY");
  const [memoryResult, setMemoryResult] = useState<ControlPlaneMemorySearchResult | null>(null);
  const [memoryContextResult, setMemoryContextResult] = useState<ControlPlaneMemoryContextResult | null>(null);
  const [memoryRememberResult, setMemoryRememberResult] = useState<ControlPlaneMemoryRememberResult | null>(null);
  const [memoryViewerState, setMemoryViewerState] = useState<MemoryViewerFrameState>("fallback");
  const [harnessTargetMode, setHarnessTargetMode] = useState<HarnessBlueprintTargetMode>("both");
  const [harnessProjectKey, setHarnessProjectKey] = useState("DonggriCompany");
  const [harnessPattern, setHarnessPattern] = useState<HarnessBlueprintPattern>("auto");
  const [harnessObjective, setHarnessObjective] = useState("Dongri-grigri 제품급 에이전트 하네스와 QMS 증거 루프 설계");
  const [harnessResult, setHarnessResult] = useState<HarnessBlueprintResult | null>(null);
  const [engineObjective, setEngineObjective] = useState(
    "Codex Engine Sync Bridge 상태를 점검하고 안전한 실행 엔진을 라우팅",
  );
  const [engineProvider, setEngineProvider] = useState<EngineProvider>("codex_exec");
  const [enginePreview, setEnginePreview] = useState<EngineRoutePreviewResult | null>(null);
  const [engineRunResult, setEngineRunResult] = useState<EngineRunResult | null>(null);
  const [engineAttachThreadId, setEngineAttachThreadId] = useState("");
  const [engineEvidenceRef, setEngineEvidenceRef] = useState("EV-CODEX-ENGINE-SYNC");

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextState, nextThreadInfo] = await Promise.all([getControlPlaneState(), getCodexThreadCurrent()]);
      setState(nextState);
      setThreadInfo(nextThreadInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const memoryViewerReachableForState = Boolean(state?.memory.viewer_preflight?.reachable);

  useEffect(() => {
    setMemoryViewerState(memoryViewerReachableForState ? "loading" : "fallback");
  }, [memoryViewerReachableForState, state?.memory.viewer_preflight?.viewer_url]);

  useEffect(() => {
    if (memoryViewerState !== "loading") return undefined;
    const timer = window.setTimeout(() => setMemoryViewerState("fallback"), 2500);
    return () => window.clearTimeout(timer);
  }, [memoryViewerState, state?.memory.viewer_preflight?.viewer_url]);

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
  const bloggerGentOps = state.master_95?.bloggergent_ops;
  const bloggerGentGroupsById = new Map<string, NonNullable<typeof bloggerGentOps>["lanes"]>();
  for (const lane of bloggerGentOps?.lanes ?? []) {
    const lanes = bloggerGentGroupsById.get(lane.group_id) ?? [];
    lanes.push(lane);
    bloggerGentGroupsById.set(lane.group_id, lanes);
  }
  const bloggerGentGroups = [...bloggerGentGroupsById.entries()].map(([groupId, lanes]) => ({
    group_id: groupId,
    label: BLOGGERGENT_GROUP_LABELS[groupId] ?? groupId,
    lanes,
    roles: [...new Set(lanes.map((lane) => lane.role_agent))].join(", "),
  }));
  const activeLifecycleScopes = scopes.filter((scope) => scope.lifecycle_status === "active");
  const candidateLifecycleScopes = scopes.filter((scope) => scope.lifecycle_status === "candidate");
  const completedLifecycleScopes = scopes.filter((scope) => scope.lifecycle_status === "completed");
  const archivedLifecycleScopes = scopes.filter((scope) => scope.lifecycle_status === "archived");
  const defaultProjectScopes = scopes.filter((scope) => scope.default_visible !== false);
  const filteredProjectScopes = scopes.filter((scope) => scope.default_visible === false);
  const adsFilteredScopes = scopes.filter((scope) => scope.filter_group === "ADS");
  const repoDiscovery = state.registry.repo_estate_discovery ?? [];
  const discoveryCandidates = repoDiscovery.filter((item) => item.classification === "candidate");
  const discoveryExcluded = repoDiscovery.filter((item) => item.classification === "excluded");
  const enabledScopes = scopes.filter((scope) => scope.enabled);
  const candidateScopes = scopes.filter((scope) => !scope.enabled);
  const projectKeys = Array.from(new Set(scopes.map((scope) => scope.project_key).filter(Boolean))).sort();
  const defaultSelectedScope =
    scopes.find((scope) => scope.project_key === "DonggriCompany") ?? enabledScopes[0] ?? scopes[0] ?? null;
  const selectedScope = scopes.find((scope) => scope.operator_id === selectedScopeId) ?? defaultSelectedScope;
  const selectedProjectKey = selectedScope?.project_key ?? "DonggriCompany";
  const selectedProjectMemoryScope = selectedScope?.memory_scope ?? `project:${selectedProjectKey}`;
  const linkedScopeCount = scopes.filter((scope) => scope.link_status === "linked").length;
  const runId = getRunId(runnerResult);
  const personaId = getLatestPersonaId(runnerResult);
  const detectedThreadId = threadInfo?.detected_thread.thread_id ?? "";
  const latestSessionThreadId =
    threadInfo?.session_candidates.find((candidate) => candidate.thread_id)?.thread_id ?? "";
  const currentThreadId = manualThreadId.trim() || detectedThreadId;
  const sessionCandidateHint =
    !detectedThreadId && latestSessionThreadId
      ? `session 후보 ${shortThreadId(latestSessionThreadId)} · 수동 입력 후 연결`
      : null;
  const activeActivation = threadInfo?.active_activation ?? null;
  const resultActivation = threadResult?.run ?? null;
  const activeActivationThreadId = getActivationThreadId(activeActivation);
  const resultActivationThreadId = getActivationThreadId(resultActivation);
  const sameThreadActivation =
    resultActivationThreadId && resultActivationThreadId === currentThreadId
      ? resultActivation
      : activeActivationThreadId && activeActivationThreadId === currentThreadId
        ? activeActivation
        : null;
  const previousThreadActivation =
    activeActivation && activeActivationThreadId && currentThreadId && activeActivationThreadId !== currentThreadId
      ? activeActivation
      : null;
  const activeThreadRunId = getRecordId(sameThreadActivation);
  const threadConnectionLabel = sameThreadActivation
    ? "현재 thread 연결됨"
    : previousThreadActivation
      ? "이전 thread 연결됨"
      : currentThreadId
        ? "현재 thread 진행 중"
        : "대기";
  const threadScopeValue =
    threadScope === "root" ? null : threadScope === "spec" ? (state.active_spec.id ?? null) : selectedProjectKey;
  const finishSpecId = getActivationSpecId(sameThreadActivation) ?? state.active_spec.id;
  const activeSpecEvidencePath = activeSpecRelativePath(finishSpecId, "evidence.md");
  const activeSpecHandoffPath = activeSpecRelativePath(finishSpecId, "handoff.md");
  const harnessBlueprint = harnessResult?.blueprint ?? null;
  const harnessPhases = asRecordArray(harnessBlueprint?.phases);
  const harnessPersonas = asRecordArray(harnessBlueprint?.suggested_personas);
  const harnessEvidencePlan = asStringArray(harnessBlueprint?.evidence_plan);
  const harnessApprovalMap = asRecordArray(harnessBlueprint?.approval_map);
  const harnessQmsChecks = asStringArray(harnessBlueprint?.qms_checks);
  const harnessDraftId = getHarnessBlueprintId(harnessResult);
  const harnessSavedDraftId =
    typeof harnessResult?.draft?.id === "string"
      ? harnessResult.draft.id
      : harnessResult?.writes && typeof harnessResult.blueprint_id === "string"
        ? harnessResult.blueprint_id
        : null;
  const harnessBlueprintStatus =
    harnessResult?.harness_blueprints ??
    state.harness_blueprints ??
    state.quality_harness.harness_blueprint_coverage ??
    null;
  const memoryScopes = Array.from(
    new Set([
      "root",
      ...masterDepartments.map((department) => department.memory_scope),
      ...enabledScopes.map((scope) => scope.memory_scope),
      "run:latest",
      "persona:latest",
    ]),
  );
  const memoryViewerReachable = Boolean(state.memory.viewer_preflight?.reachable);
  const showMemoryViewer = memoryViewerReachable && memoryViewerState !== "fallback";
  const memoryRememberAllowed = Boolean(state.quality_harness.agentmemory_gate.remember_approved);
  const memoryRememberDisabledReason = !memoryRememberAllowed
    ? "APR-MEM-001 승인이 없어 기억 저장을 막았습니다."
    : !memoryCaptureText.trim()
      ? "기록할 운영 메모를 입력하면 저장 준비가 됩니다."
      : !memoryEvidenceRef.trim()
        ? "증거 ID가 필요합니다. 예: EV-MEM-SUMMARY"
        : null;
  const engineSync = engineRunResult?.engine_sync ?? state.engine_sync ?? null;
  const engineProviderStatuses = engineSync?.provider_status ?? [];
  const engineRecentRuns = engineSync?.recent_runs ?? [];
  const engineRecentEvents = engineSync?.recent_events ?? [];
  const engineThreadLinks = engineSync?.recent_thread_links ?? [];
  const engineRunId =
    engineRunResult?.run &&
    "run" in engineRunResult.run &&
    engineRunResult.run.run &&
    typeof engineRunResult.run.run === "object"
      ? String((engineRunResult.run.run as Record<string, unknown>).id ?? "")
      : "";

  return (
    <section className="space-y-4" style={{ color: "var(--th-text-primary)" }}>
      {!compactHeader && (
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">
                <ShieldCheck className="h-4 w-4" />
                Dongri-grigri Ver.1
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-normal">Office Control Platform</h1>
              <p className="mt-2 max-w-3xl text-sm" style={{ color: "var(--th-text-secondary)" }}>
                Root Control Plane, Kiro식 SDD 구조, AgentMemory, 마스터 에이전트, 프로젝트 scope를 한 화면에서
                운영합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || busy}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              style={{
                borderColor: "var(--th-border)",
                background: "var(--th-bg-surface)",
                color: "var(--th-text-primary)",
              }}
            >
              <RefreshCw className="h-4 w-4" />
              새로고침
            </button>
          </div>
          {error && (
            <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-100">
              {error}
            </div>
          )}
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
            style={
              activeTab === tab.key ? undefined : { borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }
            }
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
              <Metric
                label="Active Spec"
                value={state.active_spec.id ?? "-"}
                hint={state.active_spec.phase ?? undefined}
              />
            </div>
          </Panel>
          <Panel title="품질 게이트" eyebrow="Ver.1">
            <div className="grid gap-3">
              <Metric
                label="Score"
                value={`${state.ver1.quality_score.score}/${state.ver1.quality_score.target}`}
                hint={state.ver1.quality_score.pass ? "pass" : "확인 필요"}
              />
              <div className="flex flex-wrap gap-2">
                <Pill ok={!state.ver1.hard_gates.has_kiro_dir}>.kiro 없음</Pill>
                <Pill ok={state.ver1.hard_gates.no_team_hierarchy}>직원 계층 기본 모델 아님</Pill>
                <Pill ok={state.dongri_grigri.korean_text_integrity.pass}>한글 무결성</Pill>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "projects" && (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel title="프로젝트 관리" eyebrow="repo별 project scopes">
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <Metric label="기본 표시" value={defaultProjectScopes.length} hint="ADS 필터 제외" />
              <Metric
                label="진행"
                value={activeLifecycleScopes.filter((scope) => scope.default_visible !== false).length}
                hint="active"
              />
              <Metric
                label="후보"
                value={candidateLifecycleScopes.filter((scope) => scope.default_visible !== false).length}
                hint="candidate"
              />
              <Metric label="ADS 필터" value={adsFilteredScopes.length} hint="기본 목록 제외" />
            </div>
            <div className="grid gap-3">
              {defaultProjectScopes.map((scope) => (
                <ProjectScopeCard
                  key={scope.operator_id}
                  scope={scope}
                  selected={selectedScope?.operator_id === scope.operator_id}
                  onSelect={() => setSelectedScopeId(scope.operator_id)}
                />
              ))}
            </div>
            {filteredProjectScopes.length > 0 && (
              <details
                className="mt-4 rounded-lg border p-3"
                style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
              >
                <summary className="cursor-pointer text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>
                  별도 필터 프로젝트
                </summary>
                <div className="mt-3 grid gap-3">
                  {filteredProjectScopes.map((scope) => (
                    <ProjectScopeCard
                      key={scope.operator_id}
                      scope={scope}
                      selected={selectedScope?.operator_id === scope.operator_id}
                      onSelect={() => setSelectedScopeId(scope.operator_id)}
                    />
                  ))}
                </div>
              </details>
            )}
          </Panel>

          <Panel
            title={selectedScope ? `${selectedScope.project_key} 실행 준비` : "프로젝트 실행 준비"}
            eyebrow="selected project context"
          >
            {selectedScope ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Metric label="Project" value={selectedScope.project_key} hint={selectedScope.absolute_path} />
                  <Metric
                    label="Memory scope"
                    value={selectedProjectMemoryScope}
                    hint={formatLifecycleStatus(selectedScope.lifecycle_status)}
                  />
                  <Metric
                    label="Filter"
                    value={selectedScope.filter_group ?? "default"}
                    hint={selectedScope.default_visible ? "기본 관리 목록" : "별도 필터"}
                  />
                  <Metric label="Write policy" value="IMPLEMENT 위임" hint="OPS project scope는 repo 직접 쓰기 금지" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-700 dark:text-cyan-100"
                    onClick={() => {
                      setSelectedScopeId(selectedScope.operator_id);
                      setActiveTab("runner");
                    }}
                  >
                    Runner에서 실행 준비
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-2 text-sm font-semibold"
                    style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                    onClick={() => {
                      setMemoryScope(selectedProjectMemoryScope);
                      setActiveTab("memory");
                    }}
                  >
                    Memory scope 열기
                  </button>
                </div>
                {selectedScope.project_key === "BloggerGent" && (
                  <div
                    className="rounded-lg border p-3"
                    style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>
                        BloggerGent OPS Project Scope
                      </div>
                      <div className="flex gap-2">
                        <Pill ok={bloggerGentOps?.mode === "read-only-dry-run-routing-preview"}>
                          read-only / dry-run
                        </Pill>
                        <Pill ok={bloggerGentOps?.lanes.length === 8}>{bloggerGentOps?.lanes.length ?? 0} lanes</Pill>
                        <Pill ok={bloggerGentOps?.role_agents.length === 7}>
                          {bloggerGentOps?.role_agents.length ?? 0} roles
                        </Pill>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {bloggerGentGroups.map((group) => (
                        <button
                          key={group.group_id}
                          type="button"
                          className="rounded-lg border p-3 text-left text-xs"
                          style={{
                            borderColor: "var(--th-border)",
                            background: "var(--th-bg-muted)",
                            color: "var(--th-text-secondary)",
                          }}
                          onClick={() => {
                            setSelectedScopeId(selectedScope.operator_id);
                            setMemoryScope("project:BloggerGent");
                            setEngineObjective(`${group.label} 작업을 BloggerGent project scope 내부에서 준비`);
                            setActiveTab("runner");
                          }}
                        >
                          <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                            {group.label}
                          </div>
                          <div className="mt-1 font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                            {group.roles}
                          </div>
                          <div className="mt-2 space-y-1">
                            {group.lanes.map((lane) => (
                              <div key={lane.lane_id} className="flex flex-wrap justify-between gap-2">
                                <span>{lane.lane_id}</span>
                                <span>{lane.channel_ref ?? lane.operating_mode}</span>
                              </div>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                    {bloggerGentOps && (
                      <div className="mt-3 text-xs" style={{ color: "var(--th-text-muted)" }}>
                        OPS가 라우팅하고 IMPLEMENT가 수정하며 REVIEW가 검토합니다. live publish·DB·Docker·deploy·Git
                        작업은 별도 승인입니다.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>
                선택된 프로젝트가 없습니다.
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === "departments" && (
        <Panel title="6개 마스터 에이전트" eyebrow="business model">
          <div
            className="mb-4 rounded-lg border p-3 text-sm"
            style={{
              borderColor: "var(--th-border)",
              background: "var(--th-bg-surface)",
              color: "var(--th-text-secondary)",
            }}
          >
            CONTROL/SPEC 같은 내부 SDD 역할은 실행 규칙으로만 남기고, 사용자 화면에는 실제 업무 부서 마스터를
            표시합니다.
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
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <Metric label="진행 프로젝트" value={activeLifecycleScopes.length} hint="status: active" />
              <Metric label="후보 프로젝트" value={candidateLifecycleScopes.length} hint="status: candidate" />
              <Metric label="완료 프로젝트" value={completedLifecycleScopes.length} hint="status: completed" />
              <Metric label="보관 프로젝트" value={archivedLifecycleScopes.length} hint="status: archived" />
            </div>
            <div
              className="mb-3 rounded-lg border p-3 text-sm"
              style={{
                borderColor: "var(--th-border)",
                background: "var(--th-bg-surface)",
                color: "var(--th-text-secondary)",
              }}
            >
              프로젝트마다 운영 에이전트를 늘리지 않습니다. 운영 마스터가 project scope를 바꿔 잡고, 조사/요약은
              서브에이전트로 처리합니다.
            </div>
            <div
              className="mb-4 rounded-lg border p-3"
              style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold" style={{ color: "var(--th-text-primary)" }}>
                    Repo estate 인식
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>
                    `repos` 폴더를 프로젝트 후보로 훑고, `.git/.codex/.agents/storage`는 운영 인프라로 제외합니다.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill ok>{repoDiscovery.filter((item) => item.classification === "registered").length} 등록</Pill>
                  <Pill ok={discoveryCandidates.length === 0}>{discoveryCandidates.length} 후보</Pill>
                  <Pill ok={discoveryExcluded.length > 0}>{discoveryExcluded.length} 제외</Pill>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {repoDiscovery.slice(0, 18).map((item) => (
                  <div
                    key={item.name}
                    className="grid gap-2 border-t py-2 text-xs md:grid-cols-[1fr_90px_120px]"
                    style={{ borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                        {item.name}
                      </div>
                      <div className="truncate font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                        {item.path}
                      </div>
                    </div>
                    <Pill ok={item.classification === "registered"}>
                      {formatDiscoveryClassification(item.classification)}
                    </Pill>
                    <div className="truncate font-mono text-[11px]" title={item.reason}>
                      {item.registry_key ?? item.reason}
                    </div>
                  </div>
                ))}
              </div>
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
                  <Metric
                    label="Lifecycle"
                    value={formatLifecycleStatus(selectedScope.lifecycle_status)}
                    hint={`status: ${selectedScope.lifecycle_status}`}
                  />
                  <Metric label="Policy" value="operations-only" hint="repo write는 개발 마스터로 위임" />
                  <Metric label="Git" value={selectedScope.git_status} hint={selectedScope.git_branch ?? undefined} />
                  <Metric
                    label="Risk"
                    value={selectedScope.risk_flags.length}
                    hint={selectedScope.risk_flags.join(", ") || "없음"}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-5">
                  {["Memory", "Runs", "Handoff", "Backlog", "Risk"].map((tab) => (
                    <div
                      key={tab}
                      className="rounded-lg border p-3 text-sm"
                      style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
                    >
                      <div className="font-semibold">{tab}</div>
                      <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>
                        scope 기반 요약
                      </div>
                    </div>
                  ))}
                </div>
                {selectedScope.project_key === "BloggerGent" && (
                  <div
                    className="rounded-lg border p-3"
                    style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
                  >
                    <div className="text-xs font-bold" style={{ color: "var(--th-text-primary)" }}>
                      BloggerGent 운영 레인
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {bloggerGentGroups.map((group) => (
                        <div
                          key={group.group_id}
                          className="rounded-lg border p-2 text-xs"
                          style={{ borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
                        >
                          <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                            {group.label}
                          </div>
                          <div className="mt-1 font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                            {group.roles}
                          </div>
                          <div className="mt-2">
                            {group.lanes.length} lane · {group.lanes.map((lane) => lane.operating_mode).join(", ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>
                선택된 프로젝트 scope가 없습니다.
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === "operations" && (
        <Master95OperationsPanel
          master95={state.master_95}
          initialProjectId={`project:${selectedProjectKey}`}
          projectOptions={scopes.map((scope) => ({
            project_id: `project:${scope.project_key}`,
            project_key: scope.project_key,
          }))}
        />
      )}

      {activeTab === "runner" && (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title="마스터/서브에이전트 Runner" eyebrow="orchestrator">
            <div
              className="mb-4 rounded-lg border p-3"
              style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-600">
                    Codex Desktop Thread
                  </div>
                  <h3 className="mt-1 font-bold" style={{ color: "var(--th-text-primary)" }}>
                    현재 Codex thread 연결
                  </h3>
                  <p className="mt-1 text-sm" style={{ color: "var(--th-text-secondary)" }}>
                    이전 thread 연결은 관찰 이력으로 유지하고, 현재 thread는 별도 run으로 이어갑니다. memory scope는
                    공유하고 transcript 본문은 저장하지 않습니다.
                  </p>
                </div>
                <Pill ok={Boolean(sameThreadActivation)}>{threadConnectionLabel}</Pill>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <div
                  className="rounded-lg border p-2"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-muted)" }}
                >
                  <div className="text-[11px] font-semibold uppercase" style={{ color: "var(--th-text-muted)" }}>
                    현재 thread
                  </div>
                  <div className="mt-1 font-mono text-xs" style={{ color: "var(--th-text-primary)" }}>
                    {shortThreadId(currentThreadId)}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                    {sameThreadActivation ? "운영실에 연결됨" : "현재 thread 진행 중 / 연결 준비"}
                  </div>
                </div>
                <div
                  className="rounded-lg border p-2"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-muted)" }}
                >
                  <div className="text-[11px] font-semibold uppercase" style={{ color: "var(--th-text-muted)" }}>
                    이전 thread
                  </div>
                  <div className="mt-1 font-mono text-xs" style={{ color: "var(--th-text-primary)" }}>
                    {shortThreadId(getActivationThreadId(previousThreadActivation))}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                    {previousThreadActivation
                      ? `${String(previousThreadActivation.status ?? "observing")} / ${getActivationScopeKey(previousThreadActivation) ?? "scope"}`
                      : "이전 연결 없음"}
                  </div>
                </div>
                <div
                  className="rounded-lg border p-2"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-muted)" }}
                >
                  <div className="text-[11px] font-semibold uppercase" style={{ color: "var(--th-text-muted)" }}>
                    Memory
                  </div>
                  <div className="mt-1 text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
                    scope 공유
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                    raw transcript 미수집
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_220px]">
                <input
                  value={manualThreadId}
                  onChange={(event) => setManualThreadId(event.target.value)}
                  placeholder={currentThreadId || latestSessionThreadId || "thread id 수동 입력"}
                  className="min-w-0 rounded-lg border px-3 py-2 font-mono text-xs outline-none focus:border-cyan-400/60"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                />
                <select
                  value={threadScope}
                  onChange={(event) => setThreadScope(event.target.value as "root" | "project" | "spec")}
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                >
                  <option value="project">project:DonggriCompany</option>
                  <option value="root">root</option>
                  <option value="spec">spec:{state.active_spec.id ?? "active"}</option>
                </select>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !currentThreadId}
                  onClick={() =>
                    void runAction(async () => {
                      const result = await activateCodexThread({
                        thread_id: currentThreadId,
                        scope_type: threadScope,
                        scope_value: threadScopeValue,
                        status: "observing",
                        objective: "현재 Codex Desktop thread를 Dongri-grigri 운영실에 연결",
                      });
                      setThreadResult(result);
                    })
                  }
                  className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-700 disabled:opacity-50 dark:text-cyan-100"
                >
                  현재 thread 연결
                </button>
                <button
                  type="button"
                  disabled={busy || !activeThreadRunId}
                  onClick={() =>
                    void runAction(async () => {
                      if (!activeThreadRunId) return;
                      if (!activeSpecEvidencePath || !activeSpecHandoffPath)
                        throw new Error("active_spec_finish_docs_missing");
                      const result = await finishCodexThread(activeThreadRunId, {
                        final_status: "completed",
                        evidence_refs: [activeSpecEvidencePath],
                        handoff_path: activeSpecHandoffPath,
                      });
                      setThreadResult(result);
                    })
                  }
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                >
                  evidence/handoff 후 종료
                </button>
                <span className="font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                  {currentThreadId || "감지된 thread 없음"} ·{" "}
                  {threadScope === "root" ? "root" : `${threadScope}:${threadScopeValue ?? "-"}`}
                </span>
                {sessionCandidateHint && (
                  <span className="text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                    {sessionCandidateHint}
                  </span>
                )}
              </div>
            </div>
            <div
              className="mb-4 rounded-lg border p-3"
              style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-600">Engine Sync</div>
                  <h3 className="mt-1 font-bold" style={{ color: "var(--th-text-primary)" }}>
                    Codex 엔진 동기화
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pill ok>{selectedProjectKey}</Pill>
                    <Pill ok={selectedScope?.default_visible !== false}>
                      {selectedScope?.filter_group ?? "default"}
                    </Pill>
                  </div>
                  <p className="mt-1 text-sm" style={{ color: "var(--th-text-secondary)" }}>
                    DonggriCompany는 목표를 라우팅하고, Codex/Claude/AGY/Hermes 실행 표면은 요약 이벤트와 증거 ID만
                    공유합니다. OAuth 토큰, 인증 코드, raw transcript는 저장하지 않습니다.
                  </p>
                </div>
                <Pill ok={Boolean(engineSync?.tables_exist)}>
                  {engineSync?.tables_exist ? "원장 준비됨" : "원장 대기"}
                </Pill>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <Metric
                  label="실행 Run"
                  value={Object.values(engineSync?.run_counts ?? {}).reduce((sum, count) => sum + count, 0)}
                  hint="managed engine runs"
                />
                <Metric
                  label="Thread Link"
                  value={Object.values(engineSync?.link_counts ?? {}).reduce((sum, count) => sum + count, 0)}
                  hint="observed threads"
                />
                <Metric
                  label="app-server"
                  value={engineSync?.app_server_poc.mode ?? "blocked"}
                  hint={engineSync?.app_server_poc.detail ?? "승인 전 대기"}
                />
                <Metric label="최근 Event" value={engineRecentEvents.length} hint="sanitized summaries" />
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_180px]">
                <textarea
                  value={engineObjective}
                  onChange={(event) => setEngineObjective(event.target.value)}
                  rows={3}
                  className="min-w-0 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                />
                <label className="text-xs font-semibold" style={{ color: "var(--th-text-secondary)" }}>
                  실행 표면
                  <select
                    value={engineProvider}
                    onChange={(event) => setEngineProvider(event.target.value as EngineProvider)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                    style={{
                      borderColor: "var(--th-border)",
                      background: "var(--th-bg-surface)",
                      color: "var(--th-text-primary)",
                    }}
                  >
                    <option value="codex_exec">Codex CLI</option>
                    <option value="codex_app_server">Codex app-server</option>
                    <option value="claude">Claude</option>
                    <option value="agy">AGY CLI</option>
                    <option value="hermes">Hermes</option>
                  </select>
                </label>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_220px]">
                <input
                  value={engineAttachThreadId}
                  onChange={(event) => setEngineAttachThreadId(event.target.value)}
                  placeholder={currentThreadId || "Codex thread id 연결"}
                  className="min-w-0 rounded-lg border px-3 py-2 font-mono text-xs outline-none focus:border-cyan-400/60"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                />
                <input
                  value={engineEvidenceRef}
                  onChange={(event) => setEngineEvidenceRef(event.target.value)}
                  placeholder="EV-CODEX-ENGINE-SYNC"
                  className="rounded-lg border px-3 py-2 text-xs outline-none focus:border-cyan-400/60"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !engineObjective.trim()}
                  onClick={() =>
                    void runAction(async () => {
                      setEnginePreview(
                        await previewEngineRoute({
                          objective: engineObjective,
                          provider: engineProvider,
                          scope_type: "project",
                          scope_value: selectedProjectKey,
                        }),
                      );
                    })
                  }
                  className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-700 disabled:opacity-50 dark:text-cyan-100"
                >
                  라우팅 미리보기
                </button>
                <button
                  type="button"
                  disabled={busy || !engineObjective.trim()}
                  onClick={() =>
                    void runAction(async () => {
                      setEngineRunResult(
                        await createEngineRun({
                          objective: engineObjective,
                          provider: engineProvider,
                          scope_type: "project",
                          scope_value: selectedProjectKey,
                          evidence_refs: [engineEvidenceRef],
                        }),
                      );
                    })
                  }
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                >
                  원장 Run 만들기
                </button>
                <button
                  type="button"
                  disabled={busy || !(engineAttachThreadId.trim() || currentThreadId)}
                  onClick={() =>
                    void runAction(async () => {
                      setEngineRunResult(
                        await attachEngineThread({
                          provider: "codex_exec",
                          external_thread_id: engineAttachThreadId.trim() || currentThreadId,
                          scope_type: "project",
                          scope_value: selectedProjectKey,
                          title: "Codex observed thread",
                          summary:
                            "사용자가 Codex 앱에서 직접 만든 thread를 DonggriCompany engine sync에 연결했습니다.",
                          evidence_refs: [engineEvidenceRef],
                        }),
                      );
                    })
                  }
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                >
                  Thread 연결
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      setEngineRunResult(await reconcileEngineSync());
                    })
                  }
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                >
                  동기화 점검
                </button>
              </div>

              {enginePreview?.route && (
                <div
                  className="mt-3 rounded-lg border p-3 text-sm"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-muted)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                        {enginePreview.route.provider} / {enginePreview.route.decision}
                      </div>
                      <div className="mt-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                        {enginePreview.route.reason}
                      </div>
                    </div>
                    <Pill ok={enginePreview.route.decision === "routeable"}>
                      {enginePreview.route.computer_use_required ? "Codex 앱 승인 필요" : "자동 승인 없음"}
                    </Pill>
                  </div>
                </div>
              )}

              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                <div
                  className="rounded-lg border p-3"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-muted)" }}
                >
                  <div className="text-xs font-bold" style={{ color: "var(--th-text-primary)" }}>
                    Provider 상태
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {engineProviderStatuses.map((provider) => (
                      <Pill key={provider.provider} ok={provider.available}>
                        {provider.label}: {provider.mode}
                      </Pill>
                    ))}
                  </div>
                </div>
                <div
                  className="rounded-lg border p-3"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-muted)" }}
                >
                  <div className="text-xs font-bold" style={{ color: "var(--th-text-primary)" }}>
                    최근 Run
                  </div>
                  <div className="mt-2 space-y-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                    {(engineRecentRuns.length ? engineRecentRuns : [{ id: "none", status: "대기", provider: "-" }])
                      .slice(0, 3)
                      .map((run) => (
                        <div key={String(run.id)} className="break-all">
                          {String(run.provider ?? "-")} / {String(run.status ?? "-")} / {String(run.id ?? "-")}
                        </div>
                      ))}
                  </div>
                </div>
                <div
                  className="rounded-lg border p-3"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-muted)" }}
                >
                  <div className="text-xs font-bold" style={{ color: "var(--th-text-primary)" }}>
                    Thread 연결
                  </div>
                  <div className="mt-2 space-y-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                    {(engineThreadLinks.length
                      ? engineThreadLinks
                      : [{ id: "none", external_thread_id: "연결 대기", status: "-" }]
                    )
                      .slice(0, 3)
                      .map((link) => (
                        <div key={String(link.id)} className="break-all">
                          {shortThreadId(String(link.external_thread_id ?? ""))} / {String(link.status ?? "-")}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
              {engineRunId && (
                <div className="mt-2 font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                  latest engine run: {engineRunId}
                </div>
              )}
            </div>
            <div
              className="mb-4 rounded-lg border p-3"
              style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-600">
                    Harness Factory
                  </div>
                  <h3 className="mt-1 font-bold" style={{ color: "var(--th-text-primary)" }}>
                    하네스 메타 생성기
                  </h3>
                  <p className="mt-1 text-sm" style={{ color: "var(--th-text-secondary)" }}>
                    revfactory/harness의 팀 아키텍처 패턴만 Donggri SDD, 부서 에이전트, persona evidence, QMS ledger로
                    흡수합니다. `.claude` 파일 생성과 플러그인 설치는 제안하지 않습니다.
                  </p>
                </div>
                <Pill ok={Boolean(harnessSavedDraftId)}>{harnessSavedDraftId ? "draft saved" : "preview first"}</Pill>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <label className="text-xs font-semibold" style={{ color: "var(--th-text-secondary)" }}>
                  대상
                  <select
                    value={harnessTargetMode}
                    onChange={(event) => setHarnessTargetMode(event.target.value as HarnessBlueprintTargetMode)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                    style={{
                      borderColor: "var(--th-border)",
                      background: "var(--th-bg-surface)",
                      color: "var(--th-text-primary)",
                    }}
                  >
                    <option value="both">둘 다</option>
                    <option value="department">부서 표준</option>
                    <option value="project">프로젝트 scope</option>
                  </select>
                </label>
                <label className="text-xs font-semibold" style={{ color: "var(--th-text-secondary)" }}>
                  프로젝트
                  <select
                    value={harnessProjectKey}
                    onChange={(event) => setHarnessProjectKey(event.target.value)}
                    disabled={harnessTargetMode === "department"}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60 disabled:opacity-50"
                    style={{
                      borderColor: "var(--th-border)",
                      background: "var(--th-bg-surface)",
                      color: "var(--th-text-primary)",
                    }}
                  >
                    {(projectKeys.length > 0 ? projectKeys : ["DonggriCompany"]).map((projectKey) => (
                      <option key={projectKey} value={projectKey}>
                        {projectKey}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold" style={{ color: "var(--th-text-secondary)" }}>
                  패턴
                  <select
                    value={harnessPattern}
                    onChange={(event) => setHarnessPattern(event.target.value as HarnessBlueprintPattern)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                    style={{
                      borderColor: "var(--th-border)",
                      background: "var(--th-bg-surface)",
                      color: "var(--th-text-primary)",
                    }}
                  >
                    <option value="auto">Auto</option>
                    <option value="pipeline">Pipeline</option>
                    <option value="fan-out-fan-in">Fan-out/Fan-in</option>
                    <option value="expert-pool">Expert Pool</option>
                    <option value="producer-reviewer">Producer-Reviewer</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="hierarchical-delegation">Hierarchical Delegation</option>
                  </select>
                </label>
              </div>

              <label className="mt-3 block text-xs font-semibold" style={{ color: "var(--th-text-secondary)" }}>
                목적
                <textarea
                  value={harnessObjective}
                  onChange={(event) => setHarnessObjective(event.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                />
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      const result = await previewHarnessBlueprint({
                        target_mode: harnessTargetMode,
                        project_key: harnessTargetMode === "department" ? undefined : harnessProjectKey,
                        objective: harnessObjective,
                        preferred_pattern: harnessPattern,
                      });
                      setHarnessResult(result);
                    })
                  }
                  className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-700 disabled:opacity-50 dark:text-cyan-100"
                >
                  Preview
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      const result = await saveHarnessBlueprintDraft({
                        target_mode: harnessTargetMode,
                        project_key: harnessTargetMode === "department" ? undefined : harnessProjectKey,
                        objective: harnessObjective,
                        preferred_pattern: harnessPattern,
                        evidence_refs: ["EV-HARNESS-META-002"],
                      });
                      setHarnessResult(result);
                    })
                  }
                  className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                >
                  Draft 저장
                </button>
                <button
                  type="button"
                  disabled={busy || !harnessSavedDraftId}
                  onClick={() =>
                    void runAction(async () => {
                      if (!harnessSavedDraftId) return;
                      setHarnessResult(await applyHarnessBlueprint(harnessSavedDraftId));
                    })
                  }
                  className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50 dark:text-amber-100"
                >
                  Apply 차단 확인
                </button>
                <span className="text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                  적용은 APR-HARNESS-APPLY-* 승인 전 v1에서 차단됩니다.
                </span>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <Metric label="Draft" value={harnessBlueprintStatus?.draft_count ?? 0} hint="저장된 blueprint" />
                <Metric
                  label="Department"
                  value={harnessBlueprintStatus?.department_draft_count ?? 0}
                  hint="부서 표준 coverage"
                />
                <Metric
                  label="Project"
                  value={harnessBlueprintStatus?.project_draft_count ?? 0}
                  hint="프로젝트 scope coverage"
                />
                <Metric
                  label="Evidence"
                  value={harnessBlueprintStatus?.evidence_backed_count ?? 0}
                  hint="증거 ref 포함"
                />
              </div>

              {harnessResult && (
                <div
                  className="mt-3 rounded-lg border p-3"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-muted)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
                        {harnessResult.ok ? "Blueprint 준비됨" : "Blueprint 차단됨"}
                      </div>
                      <div className="mt-1 font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                        {harnessResult.ok ? (harnessDraftId ?? "-") : (harnessResult.error ?? harnessDraftId ?? "-")}
                      </div>
                    </div>
                    <Pill ok={harnessResult.ok}>{harnessResult.writes ? "write" : "preview"}</Pill>
                  </div>
                  {harnessResult.message && (
                    <div className="mt-2 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                      {harnessResult.message}
                    </div>
                  )}
                  {harnessPhases.length > 0 && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {harnessPhases.map((phase) => (
                        <div
                          key={String(phase.id ?? phase.phase ?? phase.owner_department ?? phase.owner)}
                          className="rounded-md border p-2 text-xs"
                          style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
                        >
                          <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                            {String(phase.owner_department ?? phase.owner ?? phase.department ?? "phase")}
                          </div>
                          <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                            {String(phase.name ?? phase.output ?? phase.phase ?? phase.summary ?? "-")}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {harnessPersonas.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
                        추천 disposable persona
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {harnessPersonas.map((persona) => (
                          <Pill key={String(persona.persona_id ?? persona.id ?? persona.name)} ok>
                            {String(persona.persona_id ?? persona.id ?? persona.name)} ·{" "}
                            {String(persona.write_policy ?? persona.policy ?? "single-task")}
                          </Pill>
                        ))}
                      </div>
                    </div>
                  )}
                  {(harnessEvidencePlan.length > 0 || harnessApprovalMap.length > 0 || harnessQmsChecks.length > 0) && (
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <div className="rounded-md border p-2 text-xs" style={{ borderColor: "var(--th-border)" }}>
                        <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                          Evidence plan
                        </div>
                        <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                          {harnessEvidencePlan.slice(0, 3).join(" / ") || "-"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2 text-xs" style={{ borderColor: "var(--th-border)" }}>
                        <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                          Approval map
                        </div>
                        <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                          {harnessApprovalMap
                            .map((item) => String(item.approval_class ?? item.id ?? "approval"))
                            .slice(0, 3)
                            .join(" / ") || "-"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2 text-xs" style={{ borderColor: "var(--th-border)" }}>
                        <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                          QMS checks
                        </div>
                        <div className="mt-1" style={{ color: "var(--th-text-secondary)" }}>
                          {harnessQmsChecks.slice(0, 3).join(" / ") || "-"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
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
                      objective: "Dongri-grigri office control operational evidence run",
                      task_id: "T-004",
                      selected_repo: "DonggriCompany",
                      persona_needed: true,
                      confidence: "high",
                      evidence: ["EV-HARNESS-RUN"],
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
                        task_id: "T-004",
                        write_policy: "read-only",
                        allowed_paths: { read: ["G:/Donggri_DevDrive/storage/codex-control"], write: [] },
                        return_schema: ["summary", "evidence_path", "risk"],
                        evidence_refs: ["EV-PERSONA-EVIDENCE"],
                        quality_bar_result: "pending-review",
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
                        reason: "Read-only persona returned evidence-backed operational findings.",
                        evidence_refs: ["EV-PERSONA-EVIDENCE"],
                        source_hash: stableEvidenceHash(`${personaId}:source`),
                        output_hash: stableEvidenceHash(`${personaId}:output`),
                        quality_bar_result: "accepted-with-evidence",
                        payload: {
                          source_hash: stableEvidenceHash(`${personaId}:source`),
                          output_hash: stableEvidenceHash(`${personaId}:output`),
                          quality_bar_result: "accepted-with-evidence",
                        },
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
          <div className="grid gap-4">
            <Panel title="품질 하네스 현재 수준" eyebrow="ISO 9001-inspired, not certified">
              <div className="grid gap-3 md:grid-cols-3">
                <Metric
                  label="Harness score"
                  value={`${state.quality_harness.score}/${state.quality_harness.target_score}`}
                  hint={state.quality_harness.level}
                />
                <Metric label="Certification" value={state.quality_harness.certification_claim} hint="인증 주장 없음" />
                <Metric
                  label="Persona evidence"
                  value={state.quality_harness.persona_evidence.persona_total}
                  hint={`${state.quality_harness.persona_evidence.recent_event_count} recent events`}
                />
              </div>
              <div className="mt-3 grid gap-2">
                {state.quality_harness.checks.map((check) => (
                  <div
                    key={check.key}
                    className="rounded-lg border p-2"
                    style={{ borderColor: "var(--th-border)", background: "var(--th-bg-muted)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
                        {check.label}
                      </div>
                      <Pill ok={check.status === "pass"}>{check.status}</Pill>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                      {check.detail}
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                      {check.next_safe_action}
                    </div>
                  </div>
                ))}
              </div>
              {state.quality_harness.qms && (
                <div
                  className="mt-3 rounded-lg border p-3"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
                      QMS ledger
                    </div>
                    <Pill ok={state.quality_harness.qms.counts.open_nonconformances === 0}>
                      NC {state.quality_harness.qms.counts.open_nonconformances} / CAPA{" "}
                      {state.quality_harness.qms.counts.open_capas}
                    </Pill>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    {[
                      ...state.quality_harness.qms.nonconformances,
                      ...state.quality_harness.qms.capas,
                      ...state.quality_harness.qms.internal_audits,
                    ]
                      .slice(0, 6)
                      .map((record) => (
                        <div
                          key={record.id}
                          className="rounded-md border p-2 text-xs"
                          style={{ borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
                        >
                          <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                            {record.id}
                          </div>
                          <div>
                            {record.status} · {record.owner_department}
                          </div>
                          <div className="mt-1 line-clamp-2">{record.effectiveness_check ?? record.source}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <div
                className="mt-3 rounded-lg border p-2"
                style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
              >
                <div className="text-xs font-semibold" style={{ color: "var(--th-text-primary)" }}>
                  Release hygiene groups
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {state.quality_harness.release_hygiene.grouped_changes.length > 0 ? (
                    state.quality_harness.release_hygiene.grouped_changes.map((group) => (
                      <Pill
                        key={group.group}
                        ok={
                          !state.quality_harness.release_hygiene.commit_exclusion_manifest?.exclude_groups.includes(
                            group.group,
                          )
                        }
                      >
                        {group.group}: {group.count}
                      </Pill>
                    ))
                  ) : (
                    <Pill ok>clean</Pill>
                  )}
                </div>
                {state.quality_harness.release_hygiene.commit_exclusion_manifest && (
                  <div className="mt-2 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                    Exclude: {state.quality_harness.release_hygiene.commit_exclusion_manifest.exclude_groups.join(", ")}
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="최근 run" eyebrow="actual events only">
              {runnerResult ? (
                <pre
                  className="max-h-80 overflow-auto rounded-lg border p-3 text-xs"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-secondary)",
                  }}
                >
                  {JSON.stringify(runnerResult, null, 2)}
                </pre>
              ) : (
                <div
                  className="rounded-lg border border-dashed p-4 text-sm"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-muted)" }}
                >
                  아직 현재 화면에서 실행한 run이 없습니다.
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "memory" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_430px]">
          <Panel title="AgentMemory Workbench" eyebrow="내부 Viewer + 안전 작업대">
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              <Metric
                label="Server 3111"
                value={state.memory.server_url}
                hint={state.memory.health.available ? "online" : "offline 또는 미실행"}
              />
              <Metric
                label="Viewer 3113"
                value={state.memory.viewer_preflight?.viewer_url ?? state.memory.viewer_url}
                hint={state.memory.viewer_preflight?.reachable ? "내부 Viewer 준비" : "Viewer 미실행"}
              />
              <Metric
                label="Runtime path"
                value={state.memory.runtime_path}
                hint={state.memory.runtime_preflight?.runtime_path_exists ? "path 확인" : "runtime path 없음"}
              />
              <Metric
                label="Data path"
                value={state.memory.data_path ?? "E:\\DonggriPlatform_Asset\\storage\\agentmemory"}
                hint="index/backup 기준 경로"
              />
              <Metric
                label="승인 게이트"
                value={state.memory.approval_gate.runtime_connect_allowed ? "허용" : "차단"}
                hint={state.memory.approval_gate.runtime_connect_required_approval}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Pill ok={state.memory.health.available}>서버 상태</Pill>
              <Pill ok={state.memory.viewer_preflight?.reachable}>Viewer 점검</Pill>
              <Pill ok={state.memory.safe_proxy_available}>안전 작업대</Pill>
              <Pill ok={state.memory.readiness?.smart_search_available}>스마트 검색</Pill>
              <Pill ok={state.memory.readiness?.context_available}>컨텍스트 회수</Pill>
              <Pill ok={state.memory.runtime_preflight?.approved_runtime_connect}>런타임 승인</Pill>
              <Pill ok={!state.memory.readiness?.delete_forget_enabled}>삭제/망각 차단</Pill>
              <Pill ok={!state.memory.readiness?.hook_auto_capture_enabled}>자동 hooks 꺼짐</Pill>
            </div>

            <div
              className="mt-4 overflow-hidden rounded-xl border"
              style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2"
                style={{ borderColor: "var(--th-border)" }}
              >
                <div>
                  <div className="text-sm font-bold" style={{ color: "var(--th-text-primary)" }}>
                    내부 Viewer
                  </div>
                  <div className="text-xs" style={{ color: "var(--th-text-muted)" }}>
                    {showMemoryViewer
                      ? "AgentMemory Viewer를 내부 창으로 표시합니다."
                      : "Viewer 미실행 또는 내부 표시 차단 상태입니다. 안전 작업대를 사용합니다."}
                  </div>
                </div>
                <Pill ok={showMemoryViewer}>
                  {showMemoryViewer
                    ? memoryViewerState === "loading"
                      ? "불러오는 중"
                      : "내부 창 활성"
                    : "안전 작업대 활성"}
                </Pill>
              </div>

              {showMemoryViewer ? (
                <iframe
                  title="AgentMemory Viewer"
                  src={state.memory.viewer_preflight?.viewer_url ?? state.memory.viewer_url}
                  sandbox="allow-scripts allow-forms allow-same-origin"
                  className="h-[520px] w-full bg-white"
                  onError={() => setMemoryViewerState("fallback")}
                  onLoad={() => setMemoryViewerState("embedded")}
                />
              ) : (
                <div className="grid min-h-[360px] place-items-center p-6 text-center">
                  <div className="max-w-xl">
                    <div className="text-lg font-black" style={{ color: "var(--th-text-primary)" }}>
                      AgentMemory Viewer 대기 중
                    </div>
                    <p className="mt-2 text-sm leading-6" style={{ color: "var(--th-text-secondary)" }}>
                      현재 `3111/3113` 런타임이 연결되지 않았거나 Viewer 내부 표시가 차단되어 있습니다. 이 화면은
                      비워두지 않고 아래 안전 작업대로 검색, 컨텍스트 회수, 승인 기반 기억 저장을 처리합니다.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Pill ok={false}>설치/시작 차단</Pill>
                      <Pill ok={false}>MCP 연결 차단</Pill>
                      <Pill ok={false}>전역 hooks 차단</Pill>
                      <Pill ok={false}>대화 원문 수집 차단</Pill>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="안전 작업대" eyebrow="검색 / 컨텍스트 / 기억 저장">
            <div className="grid gap-3">
              <div
                className="rounded-lg border p-3 text-sm"
                style={{
                  borderColor: "var(--th-border)",
                  background: "var(--th-bg-muted)",
                  color: "var(--th-text-secondary)",
                }}
              >
                <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                  Runtime 연결 게이트
                </div>
                <div className="mt-1">
                  AgentMemory runtime start/connect는 {state.memory.approval_gate.runtime_connect_required_approval}{" "}
                  없이는 실행하지 않습니다.
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Pill ok={state.memory.approval_gate.runtime_connect_allowed}>런타임 연결</Pill>
                  <Pill ok={memoryRememberAllowed}>기억 저장 승인</Pill>
                  {state.memory.approval_gate.blocked_operations.slice(0, 4).map((operation) => (
                    <Pill key={operation} ok={false}>
                      {formatBlockedOperation(operation)} 차단
                    </Pill>
                  ))}
                </div>
              </div>

              <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
                검색어 또는 컨텍스트 질문
                <input
                  value={memoryQuery}
                  onChange={(event) => setMemoryQuery(event.target.value)}
                  placeholder="예: active spec memory policy"
                  className="min-w-0 rounded-lg border px-3 py-2 text-sm font-normal outline-none focus:border-cyan-400/60"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                />
              </label>

              <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
                범위
                <select
                  value={memoryScope}
                  onChange={(event) => setMemoryScope(event.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm font-normal outline-none focus:border-cyan-400/60"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                >
                  {memoryScopes.map((scope) => (
                    <option key={scope} value={scope}>
                      {formatMemoryScopeLabel(scope)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () =>
                      setMemoryResult(await searchAgentMemoryFunctional({ query: memoryQuery, scope: memoryScope })),
                    )
                  }
                  className="rounded-lg border px-3 py-2 text-sm font-semibold transition active:translate-y-px disabled:opacity-50"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                >
                  스마트 검색
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () =>
                      setMemoryContextResult(await getAgentMemoryContext({ query: memoryQuery, scope: memoryScope })),
                    )
                  }
                  className="rounded-lg border px-3 py-2 text-sm font-semibold transition active:translate-y-px disabled:opacity-50"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-primary)" }}
                >
                  컨텍스트 회수
                </button>
              </div>

              <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
                승인된 운영 메모
                <textarea
                  value={memoryCaptureText}
                  onChange={(event) => setMemoryCaptureText(event.target.value)}
                  placeholder="승인된 범위 안에서 기록할 운영 메모를 입력하세요."
                  rows={4}
                  className="min-h-24 rounded-lg border px-3 py-2 text-sm font-normal outline-none focus:border-cyan-400/60"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                />
              </label>

              <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--th-text-primary)" }}>
                증거 ID
                <input
                  value={memoryEvidenceRef}
                  onChange={(event) => setMemoryEvidenceRef(event.target.value)}
                  placeholder="예: EV-MEM-SUMMARY"
                  className="min-w-0 rounded-lg border px-3 py-2 text-sm font-normal outline-none focus:border-cyan-400/60"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                />
              </label>

              <button
                type="button"
                disabled={busy || !memoryRememberAllowed || !memoryCaptureText.trim() || !memoryEvidenceRef.trim()}
                onClick={() =>
                  void runAction(async () => {
                    if (
                      !window.confirm(
                        "APR-MEM-001 범위 안에서만 메모리를 저장합니다. delete/forget/import/hook 작업은 실행하지 않습니다.",
                      )
                    )
                      return;
                    const evidenceRefs = memoryEvidenceRef
                      .split(/[,;]/)
                      .map((item) => item.trim())
                      .filter(Boolean);
                    setMemoryRememberResult(
                      await rememberAgentMemory({
                        text: memoryCaptureText,
                        scope: memoryScope,
                        spec_id: state.active_spec.id ?? undefined,
                        source_ref: "Dongri-grigri Office Control Platform",
                        evidence_refs: evidenceRefs,
                        confirm: "remember-to-agentmemory",
                      }),
                    );
                  })
                }
                className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-700 transition active:translate-y-px disabled:opacity-50 dark:text-cyan-100"
              >
                기억 저장
              </button>

              {memoryRememberDisabledReason && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-100">
                  {memoryRememberDisabledReason} 필요한 승인: `APR-MEM-001`. 증거 ID 예시: `EV-MEM-SUMMARY`.
                </div>
              )}

              <div className="grid gap-2">
                <MemoryResultCard title="검색 결과" result={memoryResult} payloadKey="results" />
                <MemoryResultCard title="컨텍스트 요약" result={memoryContextResult} payloadKey="context" />
                <MemoryResultCard title="기억 저장 결과" result={memoryRememberResult} payloadKey="result" />
              </div>

              {(memoryResult || memoryContextResult || memoryRememberResult) && (
                <details
                  className="rounded-lg border p-3 text-xs"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-secondary)",
                  }}
                >
                  <summary className="cursor-pointer font-semibold" style={{ color: "var(--th-text-primary)" }}>
                    디버그 응답 보기
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto">
                    {JSON.stringify(
                      { search: memoryResult, context: memoryContextResult, remember: memoryRememberResult },
                      null,
                      2,
                    )}
                  </pre>
                </details>
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
              <Metric
                label="Latest snapshot"
                value={state.sync.latest_snapshot?.id ? "present" : "-"}
                hint={state.sync.latest_snapshot?.active_spec_id ?? undefined}
              />
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
                      if (
                        !window.confirm(
                          "control_plane_* 전용 테이블에 sync snapshot/link를 기록할까요? 기존 domain table은 수정하지 않습니다.",
                        )
                      )
                        return;
                      setSyncResult(await applyControlPlaneSync());
                    })
                  }
                  className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-700 disabled:opacity-50 dark:text-cyan-100"
                >
                  DB sync apply
                </button>
              </div>
              {syncResult && (
                <pre
                  className="max-h-72 overflow-auto rounded-lg border p-3 text-xs"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-secondary)",
                  }}
                >
                  {JSON.stringify(syncResult.counts, null, 2)}
                </pre>
              )}
            </div>
          </Panel>
          <Panel title="Registry" eyebrow="projects.yaml">
            <div className="space-y-2">
              {state.registry.projects.map((project) => (
                <div
                  key={project.key}
                  className="grid gap-2 border-t py-2 text-xs md:grid-cols-[1fr_100px_120px_120px]"
                  style={{ borderColor: "var(--th-border)", color: "var(--th-text-secondary)" }}
                >
                  <div className="min-w-0">
                    <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                      {project.key}
                    </div>
                    <div className="truncate font-mono text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                      {project.path}
                    </div>
                  </div>
                  <Pill ok={project.lifecycle_status === "active"}>
                    {formatLifecycleStatus(project.lifecycle_status)}
                  </Pill>
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
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-secondary)",
                  }}
                >
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  {item}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="한글 무결성" eyebrow="text integrity">
            <div className="grid gap-3">
              <Metric
                label="Scan"
                value={state.dongri_grigri.korean_text_integrity.pass ? "pass" : "needs fix"}
                hint={`${state.dongri_grigri.korean_text_integrity.total_matches} matches / ${state.dongri_grigri.korean_text_integrity.checked_files} files`}
              />
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--th-text-secondary)" }}>
                {state.dongri_grigri.korean_text_integrity.pass ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                깨진 한글 패턴은 UI 품질 게이트에서 차단합니다.
              </div>
            </div>
          </Panel>
        </div>
      )}
    </section>
  );
}
