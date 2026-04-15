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
  AgentPromptStyleKey,
  AgentPromotionPolicy,
} from "../../types";
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

function readClassPath(pathValue: FormData["agent_profile"]["class_path"]): AgentClassPath {
  if (!pathValue || typeof pathValue === "string" || Array.isArray(pathValue)) {
    return {};
  }
  return pathValue;
}

function readPromotionPolicy(value: FormData["agent_profile"]["promotion_policy"]): AgentPromotionPolicy {
  if (!value || typeof value === "string") {
    return {
      from_role: "junior",
      to_role: "senior",
      auto_promote_at_xp: 300,
      team_leader_manual: true,
      notes: "default_junior_to_senior",
    };
  }
  return {
    from_role: value.from_role ?? "junior",
    to_role: value.to_role ?? "senior",
    auto_promote_at_xp: value.auto_promote_at_xp ?? 300,
    team_leader_manual: value.team_leader_manual ?? true,
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

  const promptPreview = buildAgentPromptPreview({
    profile: {
      ...form.agent_profile,
      role_template: form.role,
    },
    workflowProfile: {
      role: form.workflow_role,
      review_lenses: form.review_lenses_text
        .split(/[\n,]/g)
        .map((entry) => entry.trim())
        .filter(Boolean),
      two_pass_required: form.two_pass_required,
      max_review_rounds: form.max_review_rounds,
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
          Lv.{value} {getLevelWord(value, locale)}
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
            {tr("성장/프로필 빌더", "Growth / Profile Builder")}
          </div>
          <div className="text-xs" style={{ color: "var(--th-text-muted)" }}>
            {tr(
              "이 값은 저장되며 런타임 프롬프트와 에이전트 번들에 함께 반영됩니다.",
              "These values are saved and reflected in runtime prompts and agent bundles.",
            )}
          </div>
        </div>
        <div
          className="rounded-lg border px-3 py-2 text-right text-xs"
          style={{ borderColor: "var(--th-input-border)" }}
        >
          <div style={{ color: "var(--th-text-muted)" }}>{tr("XP 기준 추천 티어", "Recommended Tier by XP")}</div>
          <div className="font-semibold" style={{ color: "var(--th-text-heading)" }}>
            Tier {recommendedGrowthTier} · {currentXp} XP
          </div>
        </div>
      </div>

      <div className="rounded-lg border px-3 py-3" style={{ borderColor: "var(--th-input-border)" }}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
            {tr("적용 성장 티어", "Applied Growth Tier")}
          </label>
          <span className="text-xs font-semibold" style={{ color: "var(--th-text-heading)" }}>
            Tier {form.agent_profile.growth_tier} / 5
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
            {tr("추천", "Recommended")}: Tier {recommendedGrowthTier}
          </span>
          <span>{getLevelWord(form.agent_profile.growth_tier, locale)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
            {tr("역량 매트릭스", "Capability Matrix")}
          </div>
          {CAPABILITY_KEYS.map((key) =>
            renderSlider(key, getCapabilityLabel(key, locale), form.agent_profile.capabilities[key], (next) =>
              updateCapability(key, next),
            ),
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
            {tr("프롬프트 스타일", "Prompt Style")}
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                key: "class_stage_1",
                labelKo: "클래스 1단계",
                labelEn: "Class Stage 1",
                value: classPath.class_stage_1 ?? classPath.stage1 ?? "",
              },
              {
                key: "class_stage_2",
                labelKo: "클래스 2단계",
                labelEn: "Class Stage 2",
                value: classPath.class_stage_2 ?? classPath.stage2 ?? "",
              },
              {
                key: "class_stage_3",
                labelKo: "클래스 3단계",
                labelEn: "Class Stage 3",
                value: classPath.class_stage_3 ?? classPath.stage3 ?? "",
              },
            ].map((item) => (
              <div key={item.key}>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
                  {tr(item.labelKo, item.labelEn)}
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
                  placeholder={item.labelEn.toLowerCase()}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
              {tr("전문 분야 태그", "Specialties")}
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
              )}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
              {tr("최종 수동 보정", "Final Manual Override")}
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
                "생성된 프로필보다 우선 적용할 최종 지침을 입력합니다.",
                "Add final instructions that must override the generated profile.",
              )}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border px-3 py-3" style={{ borderColor: "var(--th-input-border)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
              {tr("승급 정책", "Promotion Policy")}
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--th-text-muted)" }}>
              {getPromotionPolicyDisplayLabel(String(promotionPolicy.notes ?? "default_junior_to_senior"), locale)}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                value={promotionPolicy.from_role ?? ""}
                onChange={(event) =>
                  updateAgentProfile({ promotion_policy: { ...promotionPolicy, from_role: event.target.value.trim() } })
                }
                className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                style={{
                  background: "var(--th-input-bg)",
                  borderColor: "var(--th-input-border)",
                  color: "var(--th-text-primary)",
                }}
                placeholder="from_role"
              />
              <input
                value={promotionPolicy.to_role ?? ""}
                onChange={(event) =>
                  updateAgentProfile({ promotion_policy: { ...promotionPolicy, to_role: event.target.value.trim() } })
                }
                className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                style={{
                  background: "var(--th-input-bg)",
                  borderColor: "var(--th-input-border)",
                  color: "var(--th-text-primary)",
                }}
                placeholder="to_role"
              />
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
                className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                style={{
                  background: "var(--th-input-bg)",
                  borderColor: "var(--th-input-border)",
                  color: "var(--th-text-primary)",
                }}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--th-text-secondary)" }}>
              {tr("자동 생성 프롬프트 미리보기", "Generated Prompt Preview")}
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
