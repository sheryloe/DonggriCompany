import {
  buildAgentPromptPreview,
  getCapabilityLabel,
  getLevelWord,
  getPromptStyleLabel,
  recommendGrowthTierFromXp,
} from "../../agent-profile";
import { getPromotionPolicyDisplayLabel } from "../../app/canonical-display";
import type {
  AgentCapabilityKey,
  AgentClassPath,
  AgentLevelValue,
  AgentProfile,
  AgentPromptStyleKey,
  AgentPromotionPolicy,
} from "../../types";
import { resolveCanonicalIdentityFromForm } from "./canonical-identity";
import type { FormData, Translator } from "./types";

const CAPABILITY_KEYS: AgentCapabilityKey[] = [
  "execution",
  "architecture",
  "review",
  "research",
  "communication",
  "leadership",
];

const PROMPT_STYLE_KEYS: AgentPromptStyleKey[] = ["tone", "autonomy", "strictness", "collaboration"];

function clampLevel(value: number): AgentLevelValue {
  return Math.max(1, Math.min(5, Math.trunc(value || 1))) as AgentLevelValue;
}

function readClassPath(pathValue: AgentProfile["class_path"]): AgentClassPath {
  if (!pathValue || typeof pathValue === "string" || Array.isArray(pathValue)) return {};
  return pathValue;
}

function readPromotionPolicy(value: AgentProfile["promotion_policy"]): AgentPromotionPolicy {
  if (!value || typeof value === "string") {
    return {
      auto_promote_at_xp: 300,
      notes: "default_junior_to_senior",
    };
  }
  return {
    auto_promote_at_xp: value.auto_promote_at_xp ?? 300,
    notes: value.notes ?? "default_junior_to_senior",
  };
}

export default function AgentProfileBuilder({
  form,
  setForm,
  locale,
  tr,
  currentXp = 0,
}: {
  form: FormData;
  setForm: (next: FormData) => void;
  locale: string;
  tr: Translator;
  currentXp?: number;
}) {
  const recommendedGrowthTier = recommendGrowthTierFromXp(currentXp);
  const classPath = readClassPath(form.agent_profile.class_path);
  const promotionPolicy = readPromotionPolicy(form.agent_profile.promotion_policy);
  const canonicalIdentity = resolveCanonicalIdentityFromForm(form);
  const previewWorkflowRole: FormData["workflow_role"] = canonicalIdentity.execution_capability_profile
    .toLowerCase()
    .includes("author")
    ? "primary_author"
    : "reviewer";

  const promptPreview = buildAgentPromptPreview({
    profile: {
      ...form.agent_profile,
      role_template: form.role,
    },
    workflowProfile: {
      role: previewWorkflowRole,
      review_lenses: ["general"],
      two_pass_required: true,
      max_review_rounds: previewWorkflowRole === "primary_author" ? 2 : null,
    },
    legacyPersonality: form.personality,
    locale,
  });

  const updateAgentProfile = (patch: Partial<FormData["agent_profile"]>) => {
    setForm({
      ...form,
      agent_profile: {
        ...form.agent_profile,
        role_template: form.role,
        ...patch,
      },
    });
  };

  const updateCapability = (key: AgentCapabilityKey, value: number) => {
    updateAgentProfile({
      capabilities: {
        ...form.agent_profile.capabilities,
        [key]: clampLevel(value),
      },
    });
  };

  const updatePromptStyle = (key: AgentPromptStyleKey, value: number) => {
    updateAgentProfile({
      prompt_style: {
        ...form.agent_profile.prompt_style,
        [key]: clampLevel(value),
      },
    });
  };

  const renderSlider = (
    key: AgentCapabilityKey | AgentPromptStyleKey,
    label: string,
    value: AgentLevelValue,
    onChange: (next: number) => void,
  ) => (
    <div
      key={key}
      className="space-y-1.5 rounded-lg border px-3 py-2"
      style={{ borderColor: "var(--th-input-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
          {label}
        </span>
        <span className="text-[11px] font-semibold" style={{ color: "var(--th-text-heading)" }}>
          {`Lv.${value} ${getLevelWord(value, locale)}`}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-blue-500"
      />
    </div>
  );

  return (
    <div className="mt-5 space-y-4 rounded-xl border p-4" style={{ borderColor: "var(--th-card-border)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
            {tr("성장 / 프로필 빌더", "Growth / Profile Builder", "成長 / プロファイルビルダー", "成长 / 配置构建器")}
          </div>
          <div className="text-xs" style={{ color: "var(--th-text-muted)" }}>
            {tr(
              "이 값은 저장되며 런타임 프롬프트와 에이전트 번들에 반영됩니다.",
              "These values are saved and reflected in runtime prompts and agent bundles.",
              "これらの値は保存され、ランタイムプロンプトとエージェントバンドルに反映されます。",
              "这些值会被保存，并反映到运行时提示与代理配置中。",
            )}
          </div>
        </div>
        <div className="rounded-lg border px-3 py-2 text-right text-xs" style={{ borderColor: "var(--th-input-border)" }}>
          <div style={{ color: "var(--th-text-muted)" }}>
            {tr("XP 기반 추천 티어", "Recommended Tier by XP", "XP ベース推奨ティア", "基于 XP 的推荐层级")}
          </div>
          <div className="font-semibold" style={{ color: "var(--th-text-heading)" }}>
            {`Tier ${recommendedGrowthTier} · ${currentXp} XP`}
          </div>
        </div>
      </div>

      <div className="rounded-lg border px-3 py-3" style={{ borderColor: "var(--th-input-border)" }}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
            {tr("적용 성장 티어", "Applied Growth Tier", "適用成長ティア", "应用成长层级")}
          </label>
          <span className="text-xs font-semibold" style={{ color: "var(--th-text-heading)" }}>
            {`Tier ${form.agent_profile.growth_tier} / 5`}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={form.agent_profile.growth_tier}
          onChange={(event) => updateAgentProfile({ growth_tier: clampLevel(Number(event.target.value)) })}
          className="w-full accent-blue-500"
        />
        <div className="mt-1 flex items-center justify-between text-[11px]" style={{ color: "var(--th-text-muted)" }}>
          <span>
            {tr("추천", "Recommended", "推奨", "推荐")} {`Tier ${recommendedGrowthTier}`}
          </span>
          <span>{getLevelWord(form.agent_profile.growth_tier, locale)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
            {tr("역량 매트릭스", "Capability Matrix", "能力マトリクス", "能力矩阵")}
          </div>
          {CAPABILITY_KEYS.map((key) =>
            renderSlider(key, getCapabilityLabel(key, locale), form.agent_profile.capabilities[key], (next) =>
              updateCapability(key, next),
            ),
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
            {tr("프롬프트 스타일", "Prompt Style", "プロンプトスタイル", "提示风格")}
          </div>
          {PROMPT_STYLE_KEYS.map((key) =>
            renderSlider(key, getPromptStyleLabel(key, locale), form.agent_profile.prompt_style[key], (next) =>
              updatePromptStyle(key, next),
            ),
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-lg border px-3 py-3" style={{ borderColor: "var(--th-input-border)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
              {tr("Resolved Canonical Identity", "Resolved Canonical Identity", "Resolved Canonical Identity", "Resolved Canonical Identity")}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {[
                { label: tr("패밀리", "Family", "ファミリー", "家族"), value: canonicalIdentity.family },
                { label: tr("커리어 단계", "Career Stage", "キャリア段階", "职业阶段"), value: canonicalIdentity.career_stage },
                { label: tr("권한 레벨", "Authority Level", "権限レベル", "权限等级"), value: String(canonicalIdentity.authority_level) },
                { label: tr("소스", "Source", "ソース", "来源"), value: canonicalIdentity.canonical_identity_source },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--th-input-border)" }}>
                  <div className="text-[11px] font-medium" style={{ color: "var(--th-text-muted)" }}>
                    {item.label}
                  </div>
                  <div className="mt-1 break-all text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="agent-profile-specialization-key" className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                  {tr("프로필 전문화 키", "Profile Specialization Key", "プロファイル専門化キー", "配置专门化键")}
                </label>
                <input
                  id="agent-profile-specialization-key"
                  value={form.specialization_key}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      specialization_key: event.target.value,
                      canonical_identity_source: "stored",
                    })
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  style={{
                    background: "var(--th-input-bg)",
                    borderColor: "var(--th-input-border)",
                    color: "var(--th-text-primary)",
                  }}
                  placeholder="frontend.react"
                />
              </div>
              <div>
                <label htmlFor="agent-profile-capability-profile" className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                  {tr("프로필 실행 역량 프로필", "Profile Execution Capability", "プロファイル実行能力", "配置执行能力")}
                </label>
                <input
                  id="agent-profile-capability-profile"
                  value={form.execution_capability_profile}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      execution_capability_profile: event.target.value,
                      canonical_identity_source: "stored",
                    })
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  style={{
                    background: "var(--th-input-bg)",
                    borderColor: "var(--th-input-border)",
                    color: "var(--th-text-primary)",
                  }}
                  placeholder="reviewer"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                key: "class_stage_1",
                label: tr("클래스 1단계", "Class Stage 1", "クラス段階 1", "分类阶段 1"),
                value: classPath.class_stage_1 ?? classPath.stage1 ?? "",
              },
              {
                key: "class_stage_2",
                label: tr("클래스 2단계", "Class Stage 2", "クラス段階 2", "分类阶段 2"),
                value: classPath.class_stage_2 ?? classPath.stage2 ?? "",
              },
              {
                key: "class_stage_3",
                label: tr("클래스 3단계", "Class Stage 3", "クラス段階 3", "分类阶段 3"),
                value: classPath.class_stage_3 ?? classPath.stage3 ?? "",
              },
            ].map((item) => (
              <div key={item.key}>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                  {item.label}
                </label>
                <input
                  value={item.value}
                  onChange={(event) =>
                    updateAgentProfile({
                      class_path: {
                        ...classPath,
                        [item.key]: event.target.value.trim(),
                      },
                    })
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  style={{
                    background: "var(--th-input-bg)",
                    borderColor: "var(--th-input-border)",
                    color: "var(--th-text-primary)",
                  }}
                  placeholder={item.label}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
              {tr("전문 분야", "Specialties", "専門分野", "专长领域")}
            </label>
            <textarea
              value={form.specialties_text}
              onChange={(event) => {
                const specialties = event.target.value
                  .split(/[\n,]/g)
                  .map((entry) => entry.trim())
                  .filter(Boolean);
                setForm({
                  ...form,
                  specialties_text: event.target.value,
                  agent_profile: {
                    ...form.agent_profile,
                    role_template: form.role,
                    specialties,
                  },
                });
              }}
              rows={3}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{
                background: "var(--th-input-bg)",
                borderColor: "var(--th-input-border)",
                color: "var(--th-text-primary)",
              }}
              placeholder={tr(
                "예: backend, orchestration, prompt design",
                "e.g. backend, orchestration, prompt design",
                "例: backend, orchestration, prompt design",
                "例如: backend, orchestration, prompt design",
              )}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
              {tr("Final Manual Override", "Final Manual Override", "Final Manual Override", "Final Manual Override")}
            </label>
            <textarea
              value={form.personality}
              onChange={(event) => {
                setForm({
                  ...form,
                  personality: event.target.value,
                  agent_profile: {
                    ...form.agent_profile,
                    role_template: form.role,
                    custom_prompt_override: event.target.value.trim() || null,
                  },
                });
              }}
              rows={5}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{
                background: "var(--th-input-bg)",
                borderColor: "var(--th-input-border)",
                color: "var(--th-text-primary)",
              }}
              placeholder={tr(
                "생성된 프로필보다 우선 적용할 최종 지시를 입력합니다.",
                "Add final instructions that must override the generated profile.",
                "生成されたプロファイルより優先される最終指示を入力します。",
                "填写必须覆盖生成配置的最终指令。",
              )}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border px-3 py-3" style={{ borderColor: "var(--th-input-border)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
              {tr("승급 정책", "Promotion Policy", "昇格ポリシー", "晋升策略")}
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>
              {getPromotionPolicyDisplayLabel(String(promotionPolicy.notes ?? "default_junior_to_senior"), locale)}
            </div>
            <div className="mt-3 space-y-3">
              <input
                type="number"
                min={0}
                value={promotionPolicy.auto_promote_at_xp ?? 300}
                onChange={(event) =>
                  updateAgentProfile({
                    promotion_policy: {
                      ...promotionPolicy,
                      auto_promote_at_xp: Math.max(0, Number(event.target.value) || 0),
                    },
                  })
                }
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                style={{
                  background: "var(--th-input-bg)",
                  borderColor: "var(--th-input-border)",
                  color: "var(--th-text-primary)",
                }}
              />
              <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--th-input-border)", color: "var(--th-text-muted)" }}>
                <div>{tr("호환성 사유", "Compatibility reason", "互換理由", "兼容原因")}:</div>
                <div className="mt-1" style={{ color: "var(--th-text-primary)" }}>
                  {String(promotionPolicy.notes ?? "default_junior_to_senior")}
                </div>
              </div>
            </div>
            <div className="mt-2 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
              {tr(
                "승급 role 필드는 compatibility-only입니다. 실제 편집은 XP 기준만 유지합니다.",
                "Promotion role fields are compatibility-only. Only the XP threshold remains editable.",
                "昇格 role フィールドは compatibility-only です。実際の編集対象は XP 基準のみです。",
                "晋升 role 字段仅用于兼容。实际可编辑项只保留 XP 阈值。",
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
              {tr("자동 생성 프롬프트 미리보기", "Generated Prompt Preview", "生成プロンプトプレビュー", "生成提示预览")}
            </label>
            <textarea
              value={promptPreview}
              readOnly
              rows={14}
              className="w-full resize-none rounded-lg border px-3 py-2 font-mono text-[12px] leading-5 focus:outline-none"
              style={{
                background: "var(--th-input-bg)",
                borderColor: "var(--th-input-border)",
                color: "var(--th-text-primary)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
