import type { Agent, Department, PixelAgentModeSettings } from "../../types";
import { buildAgentCapabilityCompactSummary, normalizeAgentProfile } from "../../agent-profile";
import { localeName, normalizeLanguage } from "../../i18n";
import { getCanonicalFamilyLabel, getCanonicalStageLabel } from "../../i18n/canonical-label-registry";
import AgentAvatar from "../AgentAvatar";
import { ROLE_BADGE, STATUS_DOT, getLegacyRoleLabel } from "./constants";
import type { Translator } from "./types";

interface AgentCardProps {
  agent: Agent;
  spriteMap: Map<string, number>;
  locale: string;
  tr: Translator;
  departments: Department[];
  onEdit: () => void;
  confirmDeleteId: string | null;
  onDeleteClick: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  saving: boolean;
  pixelAgentMode?: PixelAgentModeSettings;
}

function statBar(value: number): string {
  const clamped = Math.max(1, Math.min(5, value));
  return `${(clamped / 5) * 100}%`;
}

export default function AgentCard({
  agent,
  spriteMap,
  locale,
  tr,
  departments,
  onEdit,
  confirmDeleteId,
  onDeleteClick,
  onDeleteConfirm,
  onDeleteCancel,
  saving,
  pixelAgentMode,
}: AgentCardProps) {
  const isDeleting = confirmDeleteId === agent.id;
  const pixelModeEnabled = pixelAgentMode?.enabled === true;
  const dept = departments.find((department) => department.id === agent.department_id);
  const profile = normalizeAgentProfile(agent.agent_profile, agent.role);
  const capabilitySummary = buildAgentCapabilityCompactSummary(profile, locale, [
    "execution",
    "architecture",
    "review",
  ]);
  const language = normalizeLanguage(locale);
  const canonicalFamily = getCanonicalFamilyLabel(agent.family ?? "backend", language);
  const canonicalStage = getCanonicalStageLabel(agent.career_stage ?? "junior", language);
  const specialization = String(agent.specialization_key ?? "").trim();
  const primaryBadge = specialization
    ? `${canonicalFamily} · ${canonicalStage} · ${specialization}`
    : `${canonicalFamily} · ${canonicalStage}`;

  return (
    <div
      onClick={onEdit}
      className={`group cursor-pointer rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl ${
        pixelModeEnabled ? "pixel-agent-card" : ""
      }`}
      style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <AgentAvatar
            agent={agent}
            spriteMap={spriteMap}
            size={pixelModeEnabled ? 58 : 52}
            rounded="xl"
            className={pixelModeEnabled ? "pixel-agent-portrait" : ""}
          />
          <div
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 ${STATUS_DOT[agent.status] ?? STATUS_DOT.idle}`}
            style={{ borderColor: "var(--th-card-bg)" }}
          />
          {pixelModeEnabled && (
            <div className="absolute -left-1.5 -top-1.5 rounded-md border border-cyan-300/40 bg-slate-950 px-1 py-0.5 font-mono text-[9px] font-bold text-cyan-100">
              #{agent.sprite_number ?? spriteMap.get(agent.id) ?? "--"}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
              {localeName(locale, agent)}
            </span>
            <span className="shrink-0 text-[10px]" style={{ color: "var(--th-text-muted)" }}>
              {(() => {
                const primary = localeName(locale, agent);
                const secondary = locale === "en" ? agent.name_ko || "" : agent.name;
                return primary !== secondary ? secondary : "";
              })()}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-200">
              {primaryBadge}
            </span>
            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE[agent.role] || ""}`}>
              {getLegacyRoleLabel(agent.role, locale)}
            </span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px]"
              style={{ background: "var(--th-bg-surface)", color: "var(--th-text-muted)" }}
            >
              A{agent.authority_level ?? 0}
            </span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px]"
              style={{ background: "var(--th-bg-surface)", color: "var(--th-text-muted)" }}
            >
              Tier {profile.growth_tier}
            </span>
            {dept ? (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px]"
                style={{ background: "var(--th-bg-surface)", color: "var(--th-text-muted)" }}
              >
                {dept.icon} {localeName(locale, dept)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="mt-3 space-y-1.5 rounded-xl border p-2.5"
        style={{ borderColor: "var(--th-card-border)", background: "var(--th-bg-surface)" }}
      >
        {[
          { key: "execution", label: tr("실행", "Execution", "実行", "执行"), value: profile.capabilities.execution },
          { key: "review", label: tr("리뷰", "Review", "レビュー", "评审"), value: profile.capabilities.review },
          {
            key: "leadership",
            label: tr("리더십", "Leadership", "リーダーシップ", "领导力"),
            value: profile.capabilities.leadership,
          },
        ].map((stat) => (
          <div key={stat.key} className="grid grid-cols-[68px_minmax(0,1fr)_30px] items-center gap-2 text-[10px]">
            <span style={{ color: "var(--th-text-muted)" }}>{stat.label}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                style={{ width: statBar(stat.value) }}
              />
            </div>
            <span className="text-right tabular-nums" style={{ color: "var(--th-text-primary)" }}>
              {stat.value}/5
            </span>
          </div>
        ))}
      </div>

      <div
        className="mt-3 flex items-center justify-between border-t pt-2.5"
        style={{ borderTop: "1px solid var(--th-card-border)" }}
      >
        <div className="flex items-center gap-2">
          {pixelModeEnabled && (
            <span className="rounded px-1.5 py-0.5 font-mono text-[10px] text-cyan-100 ring-1 ring-cyan-300/20">
              픽셀
            </span>
          )}
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-mono"
            style={{ background: "var(--th-bg-surface)", color: "var(--th-text-muted)" }}
          >
            {agent.cli_provider}
          </span>
          <span className="text-[10px] tabular-nums" style={{ color: "var(--th-text-muted)" }}>
            XP {agent.stats_xp}
          </span>
        </div>

        <div
          className="max-w-[190px] truncate text-[10px]"
          style={{ color: "var(--th-text-muted)" }}
          title={capabilitySummary}
        >
          {capabilitySummary}
        </div>

        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          {isDeleting ? (
            <>
              <button
                onClick={onDeleteConfirm}
                disabled={saving || agent.status === "working"}
                className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-40"
              >
                {tr("삭제", "Delete", "削除", "删除")}
              </button>
              <button
                onClick={onDeleteCancel}
                className="rounded px-2 py-0.5 text-[10px] transition-colors"
                style={{ color: "var(--th-text-muted)" }}
              >
                {tr("취소", "Cancel", "キャンセル", "取消")}
              </button>
            </>
          ) : (
            <button
              onClick={onDeleteClick}
              className="rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-red-500/15 hover:text-red-400"
              style={{ color: "var(--th-text-muted)" }}
              title={tr("삭제", "Delete", "削除", "删除")}
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
