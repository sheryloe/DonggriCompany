import { useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import { getCanonicalBadgeLabel, getCanonicalFamilyLabel, getCanonicalStageLabel, validateCanonicalLabels } from "../../i18n/canonical-label-registry";
import type { UiLanguage } from "../../i18n";
import type { Project } from "../../types";
import type { TFunction } from "./types";

type CanonicalInspectorTabProps = {
  t: TFunction;
  locale: UiLanguage;
};

type BadgeTone = "source" | "derived" | "projection" | "localized";
type InspectorKey =
  | "governance"
  | "routing"
  | "model-tiers"
  | "approval-gates"
  | "specialization-registry"
  | "pm-artifact-state"
  | "validation"
  | "reload-rollback";

type TabOption = {
  key: InspectorKey;
  label: Record<UiLanguage, string>;
};

const TAB_OPTIONS: TabOption[] = [
  { key: "governance", label: { ko: "Governance", en: "Governance", ja: "Governance", zh: "Governance" } },
  { key: "routing", label: { ko: "Routing", en: "Routing", ja: "Routing", zh: "Routing" } },
  { key: "model-tiers", label: { ko: "Model Tiers", en: "Model Tiers", ja: "Model Tiers", zh: "Model Tiers" } },
  { key: "approval-gates", label: { ko: "Approval Gates", en: "Approval Gates", ja: "Approval Gates", zh: "Approval Gates" } },
  {
    key: "specialization-registry",
    label: { ko: "Specialization Registry", en: "Specialization Registry", ja: "Specialization Registry", zh: "Specialization Registry" },
  },
  { key: "pm-artifact-state", label: { ko: "PM Artifact State", en: "PM Artifact State", ja: "PM Artifact State", zh: "PM Artifact State" } },
  { key: "validation", label: { ko: "Validation", en: "Validation", ja: "Validation", zh: "Validation" } },
  { key: "reload-rollback", label: { ko: "Reload / Rollback", en: "Reload / Rollback", ja: "Reload / Rollback", zh: "Reload / Rollback" } },
];

const TAB_DESCRIPTIONS: Record<InspectorKey, Record<UiLanguage, string>> = {
  governance: {
    ko: "정책 스냅샷과 조직 기준(Family/Stage)을 확인합니다.",
    en: "Inspect policy snapshots and governance baselines (Family/Stage).",
    ja: "ポリシースナップショットと組織基準（Family/Stage）を確認します。",
    zh: "查看策略快照与组织基线（Family/Stage）。",
  },
  routing: {
    ko: "입력 텍스트가 어떤 canonical precedence로 라우팅되는지 미리 확인합니다.",
    en: "Preview how canonical precedence routes an input.",
    ja: "入力が canonical precedence でどうルーティングされるかを確認します。",
    zh: "预览输入在 canonical precedence 下的路由结果。",
  },
  "model-tiers": {
    ko: "모델 티어 규칙과 요약을 확인합니다.",
    en: "Review model tier rules and summaries.",
    ja: "モデルティアのルールと要約を確認します。",
    zh: "查看模型层级规则与摘要。",
  },
  "approval-gates": {
    ko: "승인 게이트 규칙을 확인합니다.",
    en: "Review approval gate rules.",
    ja: "承認ゲートのルールを確認します。",
    zh: "查看审批闸门规则。",
  },
  "specialization-registry": {
    ko: "전문화 레지스트리 버전과 family 매핑을 확인합니다.",
    en: "Inspect specialization registry version and family assignments.",
    ja: "専門化レジストリのバージョンと family 割当を確認します。",
    zh: "查看专业化注册表版本与 family 分配。",
  },
  "pm-artifact-state": {
    ko: "프로젝트 아티팩트 상태와 projection 건강도를 확인합니다.",
    en: "Inspect project artifact state and projection health.",
    ja: "プロジェクトアーティファクト状態と projection 健全性を確認します。",
    zh: "查看项目产物状态与 projection 健康度。",
  },
  validation: {
    ko: "KO/EN/JA/ZH 라벨 레지스트리 유효성을 검증합니다.",
    en: "Validate KO/EN/JA/ZH label registry health.",
    ja: "KO/EN/JA/ZH ラベルレジストリの整合性を検証します。",
    zh: "校验 KO/EN/JA/ZH 标签注册表有效性。",
  },
  "reload-rollback": {
    ko: "규칙 재로드/롤백을 실행하고 버전 포인터 이동 결과를 확인합니다.",
    en: "Run rule reload/rollback and inspect version pointer changes.",
    ja: "ルールの reload/rollback を実行し、バージョンポインタ変更を確認します。",
    zh: "执行规则重载/回滚并查看版本指针变化。",
  },
};

function pick(locale: UiLanguage, messages: Record<UiLanguage, string>): string {
  return messages[locale] ?? messages.en;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
      <div className="text-sm font-semibold text-white">{title}</div>
      {children}
    </section>
  );
}

function Badge({ tone, label }: { tone: BadgeTone; label: string }) {
  const toneClass: Record<BadgeTone, string> = {
    source: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    derived: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    projection: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    localized: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${toneClass[tone]}`}>{label}</span>;
}

function renderList(items: string[]): React.ReactNode {
  if (items.length <= 0) return <div className="text-xs text-slate-500">-</div>;
  return (
    <ul className="space-y-1 text-xs text-slate-300">
      {items.map((item) => (
        <li key={item}>- {item}</li>
      ))}
    </ul>
  );
}

export default function CanonicalInspectorTab({ t, locale }: CanonicalInspectorTabProps) {
  const [tab, setTab] = useState<InspectorKey>("governance");
  const [policyResponse, setPolicyResponse] = useState<Awaited<ReturnType<typeof api.getCanonicalCompanyPolicy>> | null>(null);
  const [registryResponse, setRegistryResponse] = useState<Awaited<ReturnType<typeof api.getCanonicalSpecializationRegistry>> | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [artifactState, setArtifactState] = useState<Awaited<ReturnType<typeof api.getProjectArtifactState>>["state"] | null>(null);
  const [previewText, setPreviewText] = useState("Ship the backend review flow and keep PM artifacts healthy.");
  const [previewResult, setPreviewResult] = useState<Awaited<ReturnType<typeof api.previewCanonicalRouting>> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [reloading, setReloading] = useState<"dry-run" | "apply" | "rollback" | null>(null);
  const [reloadResult, setReloadResult] = useState<Awaited<ReturnType<typeof api.reloadCanonicalRules>> | null>(null);
  const [targetVersion, setTargetVersion] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBase = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPolicy, nextRegistry, nextProjects] = await Promise.all([
        api.getCanonicalCompanyPolicy(),
        api.getCanonicalSpecializationRegistry(),
        api.getProjects({ page: 1, page_size: 20 }),
      ]);
      setPolicyResponse(nextPolicy);
      setRegistryResponse(nextRegistry);
      setProjects(nextProjects.projects ?? []);
      const firstProjectId = nextProjects.projects?.[0]?.id ?? "";
      setSelectedProjectId((current) => current || firstProjectId);
      if (firstProjectId) {
        const artifact = await api.getProjectArtifactState(firstProjectId);
        setArtifactState(artifact.state);
      } else {
        setArtifactState(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBase();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setArtifactState(null);
      return;
    }
    void api
      .getProjectArtifactState(selectedProjectId)
      .then((result) => setArtifactState(result.state))
      .catch((artifactError) => {
        console.error("Failed to load project artifact state:", artifactError);
        setArtifactState(null);
      });
  }, [selectedProjectId]);

  const labelIssues = useMemo(() => validateCanonicalLabels(locale), [locale]);
  const currentVersion = policyResponse?.currentVersion ?? "-";
  const projectPath = projects.find((project) => project.id === selectedProjectId)?.project_path ?? undefined;

  const runPreview = async () => {
    setLoadingPreview(true);
    try {
      const result = await api.previewCanonicalRouting({
        text: previewText,
        ...(selectedProjectId ? { project_id: selectedProjectId } : {}),
        ...(projectPath ? { project_path: projectPath } : {}),
      });
      setPreviewResult(result);
    } finally {
      setLoadingPreview(false);
    }
  };

  const runReload = async (mode: "dry-run" | "apply" | "rollback") => {
    setReloading(mode);
    try {
      const result = await api.reloadCanonicalRules(mode, targetVersion.trim() || undefined);
      setReloadResult(result);
      await loadBase();
    } finally {
      setReloading(null);
    }
  };

  return (
    <section className="space-y-5 rounded-xl border border-slate-700/60 bg-slate-950/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Canonical Policy Inspector</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{currentVersion}</span>
            <Badge tone="source" label={getCanonicalBadgeLabel("source", locale)} />
            <Badge tone="derived" label={getCanonicalBadgeLabel("derived", locale)} />
            <Badge tone="projection" label={getCanonicalBadgeLabel("projection", locale)} />
            <Badge tone="localized" label={getCanonicalBadgeLabel("localized", locale)} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadBase()}
          className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 transition hover:border-slate-400 hover:text-white"
        >
          {t({ ko: "새로고침", en: "Refresh", ja: "Refresh", zh: "Refresh" })}
        </button>
      </div>

      {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
      {loading ? <div className="text-sm text-slate-400">{t({ ko: "불러오는 중...", en: "Loading...", ja: "Loading...", zh: "Loading..." })}</div> : null}

      <div className="flex flex-wrap gap-2">
        {TAB_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            className={`rounded-lg border px-3 py-2 text-xs transition ${
              tab === option.key
                ? "border-blue-400/60 bg-blue-500/10 text-blue-200"
                : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
            }`}
          >
            {pick(locale, option.label)}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
        {pick(locale, TAB_DESCRIPTIONS[tab])}
      </div>

      {tab === "governance" && policyResponse ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title={t({ ko: "스냅샷", en: "Snapshot", ja: "Snapshot", zh: "Snapshot" })}>
            <div className="space-y-1 text-sm text-slate-300">
              <div>Version: {policyResponse.policy.version}</div>
              <div>Hash: {policyResponse.policy.hash}</div>
              <div>Compiled: {policyResponse.policy.compiledAt}</div>
              <div>Source Root: {policyResponse.policy.sourceRoot}</div>
            </div>
          </Panel>
          <Panel title={t({ ko: "조직 기준", en: "Governance", ja: "Governance", zh: "Governance" })}>
            <div className="space-y-3 text-xs text-slate-300">
              <div>
                <div className="mb-1 font-medium text-slate-200">Families</div>
                {renderList(policyResponse.policy.families.map((family) => `${getCanonicalFamilyLabel(family.key, locale)} (${family.key})`))}
              </div>
              <div>
                <div className="mb-1 font-medium text-slate-200">Stages</div>
                {renderList(policyResponse.policy.stages.map((stage) => `${getCanonicalStageLabel(stage.key, locale)} (${stage.key})`))}
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === "routing" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Panel title={t({ ko: "Preview Input", en: "Preview Input", ja: "Preview Input", zh: "Preview Input" })}>
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-300">
                {t({ ko: "프로젝트", en: "Project", ja: "Project", zh: "Project" })}
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                >
                  <option value="">{t({ ko: "선택 안 함", en: "None", ja: "None", zh: "None" })}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-300">
                {t({ ko: "라우팅 입력", en: "Routing Input", ja: "Routing Input", zh: "Routing Input" })}
                <textarea
                  rows={6}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={previewText}
                  onChange={(event) => setPreviewText(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => void runPreview()}
                className="rounded-lg border border-blue-400/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-200 transition hover:border-blue-300"
              >
                {loadingPreview ? t({ ko: "실행 중...", en: "Running...", ja: "Running...", zh: "Running..." }) : t({ ko: "미리보기 실행", en: "Run Preview", ja: "Run Preview", zh: "Run Preview" })}
              </button>
            </div>
          </Panel>
          <Panel title={t({ ko: "결정", en: "Decision", ja: "Decision", zh: "Decision" })}>
            {previewResult ? (
              <div className="space-y-3 text-sm text-slate-300">
                <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
                  <div>
                    - selectedBy:{" "}
                    {t({
                      ko: "최종 선택에 기여한 canonical rule",
                      en: "Canonical rules that selected the final route",
                      ja: "最終ルート選択に寄与した canonical rule",
                      zh: "决定最终路由的 canonical 规则",
                    })}
                  </div>
                  <div>
                    - blockedBy:{" "}
                    {t({
                      ko: "차단을 발생시킨 rule/gate",
                      en: "Rules or gates that blocked candidates",
                      ja: "候補をブロックした rule/gate",
                      zh: "导致阻断的规则或闸门",
                    })}
                  </div>
                  <div>
                    - whyNot:{" "}
                    {t({
                      ko: "후보가 탈락한 상세 사유",
                      en: "Detailed reasons a candidate was rejected",
                      ja: "候補が除外された詳細理由",
                      zh: "候选被排除的详细原因",
                    })}
                  </div>
                  <div>
                    - snapshotScope:{" "}
                    {t({
                      ko: "계산에 사용한 정책 스냅샷 범위",
                      en: "Snapshot scope used for policy evaluation",
                      ja: "評価に使われたスナップショット範囲",
                      zh: "用于策略计算的快照范围",
                    })}
                  </div>
                  <div>
                    - policyVersion:{" "}
                    {t({
                      ko: "적용된 canonical 정책 버전",
                      en: "Canonical policy version applied to this decision",
                      ja: "この判断に適用された canonical policy version",
                      zh: "本次决策使用的 canonical 策略版本",
                    })}
                  </div>
                </div>
                <div>Family: {getCanonicalFamilyLabel(previewResult.policy.family, locale)}</div>
                <div>Stage: {getCanonicalStageLabel(previewResult.policy.stage, locale)}</div>
                <div>Specialization: {previewResult.policy.specialization ?? "-"}</div>
                <div>Provider: {previewResult.policy.provider}</div>
                <div>Model: {previewResult.policy.model ?? "-"}</div>
                <div>Scope: {previewResult.policy.snapshotScope}</div>
                <div>Policy Version: {previewResult.policy.policyVersion}</div>
                <div>
                  <div className="font-medium text-slate-100">selectedBy</div>
                  {renderList(previewResult.policy.selectedBy)}
                </div>
                <div>
                  <div className="font-medium text-slate-100">blockedBy</div>
                  {renderList(previewResult.policy.blockedBy)}
                </div>
                <div>
                  <div className="font-medium text-slate-100">whyNot</div>
                  {previewResult.policy.whyNot.length > 0 ? (
                    <ul className="space-y-1 text-xs text-slate-300">
                      {previewResult.policy.whyNot.map((entry) => (
                        <li key={`${entry.candidate}:${entry.reason}`}>- {entry.candidate}: {entry.reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-slate-500">-</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">{t({ ko: "Preview를 실행하면 canonical precedence 결과가 표시됩니다.", en: "Run the preview to inspect canonical precedence results.", ja: "Run the preview to inspect canonical precedence results.", zh: "Run the preview to inspect canonical precedence results." })}</div>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === "model-tiers" && policyResponse ? (
        <Panel title="Model Tiers">
          {renderList(policyResponse.policy.modelTierRules.map((rule) => `${rule.tier} - ${rule.summary} (${rule.id})`))}
        </Panel>
      ) : null}

      {tab === "approval-gates" && policyResponse ? (
        <Panel title="Approval Gates">
          {renderList(policyResponse.policy.approvalGates.map((gate) => `${gate.id} - ${gate.summary}`))}
        </Panel>
      ) : null}

      {tab === "specialization-registry" && registryResponse ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title={t({ ko: "레지스트리 요약", en: "Registry Summary", ja: "Registry Summary", zh: "Registry Summary" })}>
            <div className="space-y-1 text-sm text-slate-300">
              <div>Total: {registryResponse.registry.total}</div>
              <div>Version: {registryResponse.registry.version}</div>
              <div>Source: {registryResponse.registry.sourceRepo}@{registryResponse.registry.sourceRef}</div>
            </div>
          </Panel>
          <Panel title={t({ ko: "가족별 매핑", en: "Family Assignments", ja: "Family Assignments", zh: "Family Assignments" })}>
            {renderList(Object.entries(registryResponse.registry.familyAssignments).map(([family, count]) => `${getCanonicalFamilyLabel(family, locale)} (${family}) - ${count}`))}
          </Panel>
        </div>
      ) : null}

      {tab === "pm-artifact-state" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Panel title={t({ ko: "프로젝트", en: "Project", ja: "Project", zh: "Project" })}>
            <div className="space-y-3">
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                <option value="">{t({ ko: "선택 안 함", en: "None", ja: "None", zh: "None" })}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedProjectId}
                onClick={() =>
                  void (selectedProjectId
                    ? api.bootstrapProjectArtifacts(selectedProjectId).then((result) => setArtifactState(result.state))
                    : Promise.resolve())
                }
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t({ ko: "아티팩트 부트스트랩", en: "Bootstrap Artifacts", ja: "Bootstrap Artifacts", zh: "Bootstrap Artifacts" })}
              </button>
            </div>
          </Panel>
          <Panel title={t({ ko: "상태", en: "State", ja: "State", zh: "State" })}>
            {artifactState ? (
              <div className="space-y-3 text-sm text-slate-300">
                <div>Project Path: {artifactState.projectPath}</div>
                <div>Manifest: {artifactState.manifestPath}</div>
                <div>Projection Version: {artifactState.projectionVersion}</div>
                <div>
                  <div className="font-medium text-slate-100">Artifacts</div>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {Object.entries(artifactState.artifactHealth).map(([key, health]) => (
                      <li key={key}>
                        - {key}: exists={String(health.exists)} parseOk={String(health.parseOk)} blocking={String(health.blocking)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">{t({ ko: "프로젝트를 선택하세요.", en: "Select a project.", ja: "Select a project.", zh: "Select a project." })}</div>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === "validation" ? (
        <Panel title={t({ ko: "Locale Validation", en: "Locale Validation", ja: "Locale Validation", zh: "Locale Validation" })}>
          {labelIssues.length > 0 ? (
            <ul className="space-y-1 text-xs text-slate-300">
              {labelIssues.map((issue) => (
                <li key={`${issue.key}:${issue.message}`}>- {issue.key}: {issue.message}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-300">{t({ ko: "KO/EN/JA/ZH label registry가 모두 유효합니다.", en: "All KO/EN/JA/ZH label registry entries are valid.", ja: "All KO/EN/JA/ZH label registry entries are valid.", zh: "All KO/EN/JA/ZH label registry entries are valid." })}</div>
          )}
        </Panel>
      ) : null}

      {tab === "reload-rollback" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title={t({ ko: "Reload", en: "Reload", ja: "Reload", zh: "Reload" })}>
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                {t({
                  ko: "Rollback은 target version을 입력하면 해당 snapshot으로 current pointer만 이동합니다.",
                  en: "Rollback moves only the current pointer when a target version is provided.",
                  ja: "Rollback moves only the current pointer when a target version is provided.",
                  zh: "Rollback moves only the current pointer when a target version is provided.",
                })}
              </div>
              <input
                value={targetVersion}
                onChange={(event) => setTargetVersion(event.target.value)}
                placeholder="target version"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
              <div className="flex flex-wrap gap-2">
                {(["dry-run", "apply", "rollback"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => void runReload(mode)}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-slate-500"
                  >
                    {reloading === mode ? `${mode}...` : mode === "dry-run" ? "Dry Run" : mode === "apply" ? "Apply" : "Rollback"}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title={t({ ko: "결과", en: "Result", ja: "Result", zh: "Result" })}>
            {reloadResult ? (
              <div className="space-y-1 text-sm text-slate-300">
                <div>Mode: {reloadResult.mode}</div>
                <div>Applied: {String(reloadResult.applied)}</div>
                <div>Current Version: {reloadResult.currentVersion ?? "-"}</div>
                <div>Target Version: {reloadResult.targetVersion ?? "-"}</div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">{t({ ko: "아직 실행 결과가 없습니다.", en: "No reload result yet.", ja: "No reload result yet.", zh: "No reload result yet." })}</div>
            )}
          </Panel>
        </div>
      ) : null}
    </section>
  );
}
