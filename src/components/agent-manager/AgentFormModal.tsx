import { useEffect, useMemo, useRef, useState } from "react";
import type { Department } from "../../types";
import type { CliAccountPoolView } from "../../api";
import * as api from "../../api";
import { CLI_PROVIDERS, ROLE_BADGE, ROLE_LABEL, ROLES } from "./constants";
import EmojiPicker from "./EmojiPicker";
import type { FormData } from "./types";

const CLI_POOL_PROVIDERS: FormData["cli_provider"][] = ["codex", "gemini", "jules"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AgentFormModal({
  isKo,
  tr,
  form,
  setForm,
  cliAccountPools,
  cliAccountPoolsLoading,
  departments,
  isEdit,
  saving,
  onSave,
  onClose,
}: {
  isKo: boolean;
  locale: string;
  tr: (ko: string, en: string) => string;
  form: FormData;
  setForm: (f: FormData) => void;
  cliAccountPools: CliAccountPoolView[];
  cliAccountPoolsLoading: boolean;
  departments: Department[];
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
    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors";
  const inputStyle = {
    background: "var(--th-input-bg)",
    borderColor: "var(--th-input-border)",
    color: "var(--th-text-primary)",
  };

  const canSave = Boolean(form.name.trim()) && (!requiresCliPool || Boolean(form.cli_account_pool_id));

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
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl"
        style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold" style={{ color: "var(--th-text-heading)" }}>
            {isEdit ? tr("에이전트 수정", "Edit Agent") : tr("신규 에이전트", "Create Agent")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[var(--th-bg-surface-hover)]"
            style={{ color: "var(--th-text-muted)" }}
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <label className="block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
              {tr("이름", "Name")} *
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
              style={inputStyle}
            />

            <label className="block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
              {tr("한글 이름", "Korean Name")}
            </label>
            <input
              value={form.name_ko}
              onChange={(e) => setForm({ ...form, name_ko: e.target.value })}
              className={inputClass}
              style={inputStyle}
            />

            <label className="block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
              {tr("일본어 이름", "Japanese Name")}
            </label>
            <input
              value={form.name_ja}
              onChange={(e) => setForm({ ...form, name_ja: e.target.value })}
              className={inputClass}
              style={inputStyle}
            />

            <label className="block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
              {tr("중국어 이름", "Chinese Name")}
            </label>
            <input
              value={form.name_zh}
              onChange={(e) => setForm({ ...form, name_zh: e.target.value })}
              className={inputClass}
              style={inputStyle}
            />

            <div className="grid grid-cols-[72px_1fr] gap-2">
              <div>
                <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--th-text-secondary)" }}>
                  Emoji
                </label>
                <EmojiPicker tr={tr} value={form.avatar_emoji} onChange={(emoji) => setForm({ ...form, avatar_emoji: emoji })} />
              </div>
              <div>
                <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--th-text-secondary)" }}>
                  {tr("부서", "Department")}
                </label>
                <select
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">{tr("미지정", "Unassigned")}</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.icon} {isKo ? dept.name_ko || dept.name : dept.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--th-text-secondary)" }}>
                {tr("직급", "Role")}
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {ROLES.map((role) => {
                  const active = form.role === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setForm({ ...form, role })}
                      className={`py-2 rounded-lg text-xs font-medium border transition-all ${active ? ROLE_BADGE[role] : ""}`}
                      style={!active ? { borderColor: "var(--th-input-border)", color: "var(--th-text-muted)" } : undefined}
                    >
                      {isKo ? ROLE_LABEL[role].ko : ROLE_LABEL[role].en}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--th-input-border)" }}>
              <label className="block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                {tr("2x 리뷰 역할", "2x Workflow Role")}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, workflow_role: "primary_author", max_review_rounds: form.max_review_rounds ?? 2 })}
                  className={`py-1.5 rounded-lg text-xs border transition-all ${
                    form.workflow_role === "primary_author"
                      ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                      : "hover:bg-white/5"
                  }`}
                  style={
                    form.workflow_role !== "primary_author"
                      ? { borderColor: "var(--th-input-border)", color: "var(--th-text-muted)" }
                      : undefined
                  }
                >
                  Primary Author
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, workflow_role: "reviewer", max_review_rounds: null })}
                  className={`py-1.5 rounded-lg text-xs border transition-all ${
                    form.workflow_role === "reviewer"
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "hover:bg-white/5"
                  }`}
                  style={
                    form.workflow_role !== "reviewer"
                      ? { borderColor: "var(--th-input-border)", color: "var(--th-text-muted)" }
                      : undefined
                  }
                >
                  Reviewer
                </button>
              </div>

              <label className="block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                {tr("리뷰 렌즈", "Review Lenses")}
              </label>
              <textarea
                value={form.review_lenses_text}
                onChange={(e) => setForm({ ...form, review_lenses_text: e.target.value })}
                rows={2}
                className={`${inputClass} resize-none`}
                style={inputStyle}
                placeholder="security, performance, ux"
              />

              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={form.two_pass_required}
                  onChange={(e) => setForm({ ...form, two_pass_required: e.target.checked })}
                />
                {tr("2x 심사숙고 강제", "Force 2-pass review")}
              </label>

              {form.workflow_role === "primary_author" && (
                <div>
                  <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--th-text-secondary)" }}>
                    {tr("최대 리뷰 라운드", "Max Review Rounds")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={2}
                    value={form.max_review_rounds ?? 2}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      const next = Number.isFinite(parsed) ? Math.max(1, Math.min(2, parsed)) : 2;
                      setForm({ ...form, max_review_rounds: next });
                    }}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--th-text-secondary)" }}>
                CLI Provider
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CLI_PROVIDERS.map((provider) => {
                  const active = form.cli_provider === provider;
                  return (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => {
                        const nextPools = cliAccountPools.filter((pool) => pool.provider === provider);
                        const nextPoolId =
                          CLI_POOL_PROVIDERS.includes(provider) ? form.cli_account_pool_id || nextPools[0]?.accountPoolId || "" : "";
                        setForm({
                          ...form,
                          cli_provider: provider,
                          cli_account_pool_id: nextPoolId,
                        });
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono border transition-all ${
                        active ? "bg-blue-500/15 text-blue-400 border-blue-500/30" : ""
                      }`}
                      style={!active ? { borderColor: "var(--th-input-border)", color: "var(--th-text-muted)" } : undefined}
                    >
                      {provider}
                    </button>
                  );
                })}
              </div>
            </div>

            {requiresCliPool && (
              <div>
                <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--th-text-secondary)" }}>
                  CLI Account Pool
                </label>
                <select
                  value={form.cli_account_pool_id}
                  onChange={(e) => setForm({ ...form, cli_account_pool_id: e.target.value })}
                  className={inputClass}
                  style={inputStyle}
                  disabled={cliAccountPoolsLoading || selectedProviderPools.length <= 0}
                >
                  {selectedProviderPools.length <= 0 ? (
                    <option value="">
                      {cliAccountPoolsLoading ? tr("로딩 중...", "Loading account pools...") : tr("연결된 계정 없음", "No connected account pool")}
                    </option>
                  ) : (
                    selectedProviderPools.map((pool) => (
                      <option key={pool.id} value={pool.accountPoolId}>
                        {String(pool.label || pool.accountPoolId)}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--th-text-secondary)" }}>
                {tr("성격/프롬프트", "Personality / Prompt")}
              </label>
              <textarea
                value={form.personality}
                onChange={(e) => setForm({ ...form, personality: e.target.value })}
                rows={3}
                className={`${inputClass} resize-none`}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--th-card-border)" }}>
          <div className="text-xs font-semibold mb-3" style={{ color: "var(--th-text-secondary)" }}>
            {tr("캐릭터 스프라이트", "Character Sprite")}
          </div>

          {!previews && !processing && (
            <label
              className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed cursor-pointer"
              style={{ borderColor: "var(--th-input-border)", color: "var(--th-text-muted)" }}
            >
              <span className="text-2xl">🖼️</span>
              <span className="text-xs">{tr("2x2 시트 업로드", "Upload 2x2 sprite sheet")}</span>
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
          )}

          {processing && <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>{tr("처리 중...", "Processing...")}</div>}

          {previews && !processing && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {(["D", "L", "R"] as const).map((dir) => (
                  <div key={dir} className="text-center">
                    <div className="text-[10px] mb-1" style={{ color: "var(--th-text-muted)" }}>
                      {dir}
                    </div>
                    <div
                      className="rounded-lg p-2 flex items-center justify-center h-24"
                      style={{ background: "var(--th-input-bg)", border: "1px solid var(--th-input-border)" }}
                    >
                      <img src={previews[dir]} alt={dir} className="max-h-20 object-contain" style={{ imageRendering: "pixelated" }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs" style={{ color: "var(--th-text-secondary)" }}>
                  Sprite #
                </label>
                <input
                  type="number"
                  min={1}
                  value={spriteNum}
                  onChange={(e) => setSpriteNum(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 px-2 py-1 border rounded-lg text-sm"
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
                  className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white disabled:opacity-50"
                >
                  {registering ? tr("등록 중...", "Registering...") : registered ? tr("등록 완료", "Registered") : tr("스프라이트 등록", "Register Sprite")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviews(null);
                    setRegistered(false);
                  }}
                  className="px-2 py-1 text-xs rounded-lg"
                  style={{ color: "var(--th-text-muted)" }}
                >
                  {tr("다시 업로드", "Re-upload")}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--th-card-border)" }}>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !canSave}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white disabled:opacity-40"
          >
            {saving ? tr("저장 중...", "Saving...") : isEdit ? tr("변경 저장", "Save Changes") : tr("에이전트 생성", "Create Agent")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ border: "1px solid var(--th-input-border)", color: "var(--th-text-secondary)" }}
          >
            {tr("취소", "Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
