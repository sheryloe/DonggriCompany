import { useEffect, useMemo, useRef, useState } from "react";
import { localeName, type UiLanguage } from "../../i18n";
import { getWorkflowRoleDisplayLabel } from "../../app/canonical-display";
import { getCanonicalFamilyLabel, getCanonicalStageLabel } from "../../i18n/canonical-label-registry";
import type { AgentWorkflowRole, Department } from "../../types";
import type { CliAccountPoolView } from "../../api";
import * as api from "../../api";
import { CLI_PROVIDERS, getLegacyRoleLabel } from "./constants";
import { CANONICAL_FAMILY_OPTIONS, CANONICAL_STAGE_OPTIONS } from "./canonical-identity";
import AgentProfileBuilder from "./AgentProfileBuilder";
import EmojiPicker from "./EmojiPicker";
import type { FormData } from "./types";

const CLI_POOL_PROVIDERS: FormData["cli_provider"][] = ["codex", "gemini", "jules"];

type CanonicalEditableField =
  | "family"
  | "career_stage"
  | "authority_level"
  | "specialization_key"
  | "execution_capability_profile";

function isKoLocale(locale: UiLanguage | string): boolean {
  return String(locale ?? "en")
    .toLowerCase()
    .startsWith("ko");
}

function getCanonicalSourceDisplayLabel(source: string | null | undefined, locale: UiLanguage | string): string {
  const normalized = String(source ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return "-";
  if (normalized === "stored") return isKoLocale(locale) ? "저장됨" : "stored";
  if (normalized === "derived") return isKoLocale(locale) ? "파생됨" : "derived";
  return normalized;
}

function formatKeyWithDisplayLabel(label: string, raw: string | null | undefined, locale: UiLanguage | string): string {
  const value = String(raw ?? "").trim();
  if (!isKoLocale(locale) || !value || value === label) return label || value || "-";
  return `${label} (${value})`;
}

function isAgentWorkflowRole(value: string | null | undefined): value is AgentWorkflowRole {
  return value === "primary_author" || value === "reviewer";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AgentFormModal({
  locale,
  tr,
  form,
  setForm,
  cliAccountPools,
  cliAccountPoolsLoading,
  departments,
  currentXp = 0,
  isEdit,
  saving,
  onSave,
  onClose,
}: {
  locale: string;
  tr: (ko: string, en: string, ja?: string, zh?: string) => string;
  form: FormData;
  setForm: (f: FormData) => void;
  cliAccountPools: CliAccountPoolView[];
  cliAccountPoolsLoading: boolean;
  departments: Department[];
  currentXp?: number;
  isEdit: boolean;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [processing, setProcessing] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string> | null>(null);
  const [spriteNum, setSpriteNum] = useState(form.sprite_number ?? 0);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);

  const requiresCliPool = CLI_POOL_PROVIDERS.includes(form.cli_provider);
  const selectedProviderPools = useMemo(
    () => cliAccountPools.filter((pool) => pool.provider === form.cli_provider),
    [cliAccountPools, form.cli_provider],
  );
  const providerDisplayName = useMemo(() => {
    if (form.cli_provider === "codex") return "Codex";
    if (form.cli_provider === "gemini") return "Gemini";
    if (form.cli_provider === "claude") return "Claude";
    if (form.cli_provider === "opencode") return "OpenCode";
    if (form.cli_provider === "kimi") return "Kimi";
    if (form.cli_provider === "jules") return "Jules";
    return String(form.cli_provider);
  }, [form.cli_provider]);

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [onClose]);

  useEffect(() => {
    setSpriteNum(form.sprite_number ?? 0);
  }, [form.sprite_number]);

  useEffect(() => {
    if (!requiresCliPool) {
      if (form.cli_account_pool_id) {
        setForm({ ...form, cli_account_pool_id: "" });
      }
      return;
    }
    if (selectedProviderPools.length <= 0) return;
    const exists = selectedProviderPools.some((pool) => pool.accountPoolId === form.cli_account_pool_id);
    if (exists) return;
    setForm({
      ...form,
      cli_account_pool_id: selectedProviderPools[0].accountPoolId,
    });
  }, [form, requiresCliPool, selectedProviderPools, setForm]);

  const inputClass =
    "w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500";
  const inputStyle = {
    background: "var(--th-input-bg)",
    borderColor: "var(--th-input-border)",
    color: "var(--th-text-primary)",
  };
  const cliProviderFieldId = "agent-form-cli-provider";
  const cliAccountPoolFieldId = "agent-form-cli-account-pool";
  const canonicalFamilyFieldId = "agent-form-canonical-family";
  const canonicalStageFieldId = "agent-form-canonical-stage";
  const canonicalAuthorityFieldId = "agent-form-canonical-authority";
  const specializationFieldId = "agent-form-specialization-key";
  const capabilityProfileFieldId = "agent-form-execution-capability-profile";

  const canSave = Boolean(form.name.trim()) && (!requiresCliPool || Boolean(form.cli_account_pool_id));
  const uiLocale = locale as UiLanguage;
  const legacyRoleLabel = getLegacyRoleLabel(form.role, locale);
  const workflowRoleLabel = getWorkflowRoleDisplayLabel(form.workflow_role, locale);
  const workflowCapabilityText =
    String(form.execution_capability_profile ?? "").trim() || String(form.workflow_role ?? "").trim();
  const workflowCapabilityDisplayLabel = formatKeyWithDisplayLabel(
    isAgentWorkflowRole(workflowCapabilityText)
      ? getWorkflowRoleDisplayLabel(workflowCapabilityText, locale)
      : workflowCapabilityText,
    workflowCapabilityText,
    locale,
  );
  const canonicalFamilyLabel = getCanonicalFamilyLabel(form.family, uiLocale);
  const canonicalStageLabel = getCanonicalStageLabel(form.career_stage, uiLocale);
  const canonicalSourceLabel = getCanonicalSourceDisplayLabel(form.canonical_identity_source, locale);

  const updateCanonicalIdentity = (key: CanonicalEditableField, value: FormData[CanonicalEditableField]) => {
    setForm({
      ...form,
      [key]: value,
      canonical_identity_source: "stored",
    });
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--th-modal-overlay)" }}
      onClick={(event) => {
        if (event.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl p-6 shadow-2xl"
        style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: "var(--th-text-heading)" }}>
            {isEdit ? tr("에이전트 수정", "Edit Agent") : tr("신규 에이전트", "Create Agent")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-[var(--th-bg-surface-hover)]"
            style={{ color: "var(--th-text-muted)" }}
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                {tr("이름", "Name")} *
              </label>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className={inputClass}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                {tr("한글 이름", "Korean Name")}
              </label>
              <input
                value={form.name_ko}
                onChange={(event) => setForm({ ...form, name_ko: event.target.value })}
                className={inputClass}
                style={inputStyle}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                  {tr("일본어 이름", "Japanese Name")}
                </label>
                <input
                  value={form.name_ja}
                  onChange={(event) => setForm({ ...form, name_ja: event.target.value })}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                  {tr("중국어 이름", "Chinese Name")}
                </label>
                <input
                  value={form.name_zh}
                  onChange={(event) => setForm({ ...form, name_zh: event.target.value })}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                {tr("부서", "Department")}
              </label>
              <select
                value={form.department_id}
                onChange={(event) => setForm({ ...form, department_id: event.target.value })}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">{tr("부서 미지정", "Unassigned")}</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {localeName(uiLocale, department)}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border p-3" style={{ borderColor: "var(--th-card-border)" }}>
              <div className="mb-2 text-xs font-semibold" style={{ color: "var(--th-text-secondary)" }}>
                {tr("레거시 호환 정보", "Legacy Compatibility")}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--th-input-border)" }}>
                  <div className="text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                    {tr("레거시 역할", "Legacy Role")}
                  </div>
                  <div className="mt-1 text-sm font-medium" style={{ color: "var(--th-text-heading)" }}>
                    {legacyRoleLabel}
                  </div>
                </div>
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--th-input-border)" }}>
                  <div className="text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                    {tr("워크플로우 역량(호환)", "Workflow Capability (compat)")}
                  </div>
                  <div className="mt-1 text-sm font-medium" style={{ color: "var(--th-text-heading)" }}>
                    {workflowCapabilityDisplayLabel || workflowRoleLabel}
                  </div>
                  <div className="mt-0.5 text-[10px]" style={{ color: "var(--th-text-muted)" }}>
                    {workflowRoleLabel}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                {tr(
                  "role / workflow_role / review 제어값은 호환용 읽기 정보로만 유지됩니다.",
                  "role / workflow_role / review controls remain compatibility mirrors only.",
                )}
              </p>
            </div>

            <div>
              <label
                htmlFor={cliProviderFieldId}
                className="mb-1.5 block text-xs font-medium"
                style={{ color: "var(--th-text-secondary)" }}
              >
                {tr("CLI 제공자", "CLI Provider")}
              </label>
              <select
                id={cliProviderFieldId}
                value={form.cli_provider}
                onChange={(event) => setForm({ ...form, cli_provider: event.target.value as FormData["cli_provider"] })}
                className={inputClass}
                style={inputStyle}
              >
                {CLI_PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                {tr(
                  "모델 선택과 추론 레벨은 중앙 Provider 정책에서 결정됩니다.",
                  "Model and reasoning selection are controlled by centralized provider policy.",
                )}
              </p>
            </div>

            {requiresCliPool ? (
              <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--th-card-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={cliAccountPoolFieldId}
                    className="block text-xs font-medium"
                    style={{ color: "var(--th-text-secondary)" }}
                  >
                    {tr("실행 계정 풀", "Execution Account Pool")}
                  </label>
                  {cliAccountPoolsLoading ? (
                    <span className="text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                      {tr("불러오는 중...", "Loading...")}
                    </span>
                  ) : null}
                </div>
                <select
                  id={cliAccountPoolFieldId}
                  value={form.cli_account_pool_id}
                  onChange={(event) => setForm({ ...form, cli_account_pool_id: event.target.value })}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">
                    {tr(`${providerDisplayName} 계정 풀 선택`, `Select ${providerDisplayName} account pool`)}
                  </option>
                  {selectedProviderPools.map((pool) => (
                    <option key={pool.accountPoolId} value={pool.accountPoolId}>
                      {pool.label?.trim() ? pool.label : pool.accountPoolId}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="rounded-lg border p-3" style={{ borderColor: "var(--th-card-border)" }}>
              <div className="mb-2 text-xs font-semibold" style={{ color: "var(--th-text-secondary)" }}>
                {tr("표준 정체성", "Canonical Identity")}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={canonicalFamilyFieldId}
                    className="mb-1.5 block text-xs font-medium"
                    style={{ color: "var(--th-text-secondary)" }}
                  >
                    {tr("능력군", "Family")}
                  </label>
                  <select
                    id={canonicalFamilyFieldId}
                    value={form.family}
                    onChange={(event) => updateCanonicalIdentity("family", event.target.value as FormData["family"])}
                    className={inputClass}
                    style={inputStyle}
                  >
                    {CANONICAL_FAMILY_OPTIONS.map((family) => (
                      <option key={family} value={family}>
                        {getCanonicalFamilyLabel(family, uiLocale)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={canonicalStageFieldId}
                    className="mb-1.5 block text-xs font-medium"
                    style={{ color: "var(--th-text-secondary)" }}
                  >
                    {tr("경력 단계", "Career Stage")}
                  </label>
                  <select
                    id={canonicalStageFieldId}
                    value={form.career_stage}
                    onChange={(event) =>
                      updateCanonicalIdentity("career_stage", event.target.value as FormData["career_stage"])
                    }
                    className={inputClass}
                    style={inputStyle}
                  >
                    {CANONICAL_STAGE_OPTIONS.map((stage) => (
                      <option key={stage} value={stage}>
                        {getCanonicalStageLabel(stage, uiLocale)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={canonicalAuthorityFieldId}
                    className="mb-1.5 block text-xs font-medium"
                    style={{ color: "var(--th-text-secondary)" }}
                  >
                    {tr("권한 레벨", "Authority Level")}
                  </label>
                  <input
                    id={canonicalAuthorityFieldId}
                    type="number"
                    min={1}
                    max={5}
                    value={form.authority_level}
                    onChange={(event) =>
                      updateCanonicalIdentity("authority_level", Math.max(1, Number(event.target.value) || 1))
                    }
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                    {tr("소스", "Source")}
                  </label>
                  <div
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{ ...inputStyle, borderColor: "var(--th-input-border)" }}
                  >
                    {canonicalSourceLabel}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={specializationFieldId}
                    className="mb-1.5 block text-xs font-medium"
                    style={{ color: "var(--th-text-secondary)" }}
                  >
                    {tr("전문화 키", "Specialization Key")}
                  </label>
                  <input
                    id={specializationFieldId}
                    value={form.specialization_key}
                    onChange={(event) => updateCanonicalIdentity("specialization_key", event.target.value)}
                    className={inputClass}
                    style={inputStyle}
                    placeholder={tr("예: frontend.react", "frontend.react")}
                  />
                </div>
                <div>
                  <label
                    htmlFor={capabilityProfileFieldId}
                    className="mb-1.5 block text-xs font-medium"
                    style={{ color: "var(--th-text-secondary)" }}
                  >
                    {tr("실행 역량 프로필", "Execution Capability Profile")}
                  </label>
                  <input
                    id={capabilityProfileFieldId}
                    value={form.execution_capability_profile}
                    onChange={(event) => updateCanonicalIdentity("execution_capability_profile", event.target.value)}
                    className={inputClass}
                    style={inputStyle}
                    placeholder={tr("예: reviewer", "reviewer")}
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                {tr(
                  `해석된 정체성: ${canonicalFamilyLabel} / ${canonicalStageLabel}`,
                  `Resolved identity: ${canonicalFamilyLabel} / ${canonicalStageLabel}`,
                )}
              </p>
            </div>

            <div className="rounded-lg border p-3" style={{ borderColor: "var(--th-card-border)" }}>
              <div className="text-xs font-semibold" style={{ color: "var(--th-text-secondary)" }}>
                {tr("정책 메모", "Policy Notes")}
              </div>
              <div className="mt-2 space-y-1 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                <div>
                  {tr(
                    "워크플로우 역할, 리뷰 렌즈, 리뷰 라운드는 표준 역량과 제공자 정책에서 파생됩니다.",
                    "workflow_role / review_lenses / review rounds are derived from canonical capability and provider policy.",
                  )}
                </div>
                <div>
                  {tr(
                    "화면 표시는 현재 언어를 따르고, 표준 키와 원본 파일은 영어로 유지합니다.",
                    "The UI follows the selected locale, while canonical keys and source files remain in English.",
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                {tr("아바타", "Avatar")}
              </label>
              <EmojiPicker
                tr={tr}
                value={form.avatar_emoji}
                onChange={(emoji) => setForm({ ...form, avatar_emoji: emoji })}
              />
            </div>
          </div>

          <div>
            <AgentProfileBuilder form={form} setForm={setForm} locale={locale} tr={tr} currentXp={currentXp} />
          </div>
        </div>

        <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--th-card-border)" }}>
          <div className="mb-3 text-xs font-semibold" style={{ color: "var(--th-text-secondary)" }}>
            {tr("캐릭터 스프라이트", "Character Sprite")}
          </div>

          {!previews && !processing ? (
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6"
              style={{ borderColor: "var(--th-input-border)", color: "var(--th-text-muted)" }}
            >
              <span className="text-xs">{tr("2x2 스프라이트 시트 업로드", "Upload 2x2 sprite sheet")}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setProcessing(true);
                  setPreviews(null);
                  setRegistered(false);
                  try {
                    const base64 = await fileToBase64(file);
                    const result = await api.processSprite(base64);
                    setPreviews(result.previews);
                    setSpriteNum(result.suggestedNumber);
                  } catch (error) {
                    console.error("Sprite processing failed:", error);
                  } finally {
                    setProcessing(false);
                  }
                }}
              />
            </label>
          ) : null}

          {processing ? (
            <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>
              {tr("처리 중...", "Processing...")}
            </div>
          ) : null}

          {previews && !processing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {(["D", "L", "R"] as const).map((dir) => (
                  <div key={dir} className="text-center">
                    <div className="mb-1 text-[10px]" style={{ color: "var(--th-text-muted)" }}>
                      {dir}
                    </div>
                    <div
                      className="flex h-24 items-center justify-center rounded-lg p-2"
                      style={{ background: "var(--th-input-bg)", border: "1px solid var(--th-input-border)" }}
                    >
                      <img
                        src={previews[dir]}
                        alt={dir}
                        className="max-h-20 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs" style={{ color: "var(--th-text-secondary)" }}>
                  {tr("스프라이트 번호", "Sprite #")}
                </label>
                <input
                  type="number"
                  min={1}
                  value={spriteNum}
                  onChange={(event) => setSpriteNum(Math.max(1, Number(event.target.value) || 1))}
                  className="w-20 rounded-lg border px-2 py-1 text-sm"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!previews) return;
                    setRegistering(true);
                    try {
                      await api.registerSprite(previews, spriteNum);
                      setRegistered(true);
                      setForm({ ...form, sprite_number: spriteNum });
                    } catch (error) {
                      console.error("Sprite register failed:", error);
                    } finally {
                      setRegistering(false);
                    }
                  }}
                  disabled={registering || !spriteNum || registered}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  {registering
                    ? tr("등록 중...", "Registering...")
                    : registered
                      ? tr("등록 완료", "Registered")
                      : tr("스프라이트 등록", "Register Sprite")}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex gap-2 border-t pt-4" style={{ borderTop: "1px solid var(--th-card-border)" }}>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !canSave}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving
              ? tr("저장 중...", "Saving...")
              : isEdit
                ? tr("변경 저장", "Save Changes")
                : tr("에이전트 생성", "Create Agent")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium"
            style={{ border: "1px solid var(--th-input-border)", color: "var(--th-text-secondary)" }}
          >
            {tr("취소", "Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
