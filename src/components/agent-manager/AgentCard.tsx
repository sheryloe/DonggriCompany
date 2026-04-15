import type { Agent, Department } from "../../types";
import { buildAgentCapabilityCompactSummary, normalizeAgentProfile } from "../../agent-profile";
import { localeName } from "../../i18n";
import AgentAvatar from "../AgentAvatar";
import { ROLE_BADGE, ROLE_LABEL, STATUS_DOT } from "./constants";
import type { Translator } from "./types";

interface AgentCardProps {
  agent: Agent;
  spriteMap: Map<string, number>;
  isKo: boolean;
  locale: string;
  tr: Translator;
  departments: Department[];
  onEdit: () => void;
  confirmDeleteId: string | null;
  onDeleteClick: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  saving: boolean;
}

export default function AgentCard({
  agent,
  spriteMap,
  isKo,
  locale,
  tr,
  departments,
  onEdit,
  confirmDeleteId,
  onDeleteClick,
  onDeleteConfirm,
  onDeleteCancel,
  saving,
}: AgentCardProps) {
  const isDeleting = confirmDeleteId === agent.id;
  const dept = departments.find((d) => d.id === agent.department_id);
  const profile = normalizeAgentProfile(agent.agent_profile, agent.role);
  const capabilitySummary = buildAgentCapabilityCompactSummary(profile, locale, ["execution", "architecture", "review"]);

  return (
    <div
      onClick={onEdit}
      className="group cursor-pointer rounded-xl p-4 transition-all hover:scale-[1.01] hover:shadow-lg hover:shadow-black/10"
      style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <AgentAvatar agent={agent} spriteMap={spriteMap} size={44} rounded="xl" />
          <div
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 ${STATUS_DOT[agent.status] ?? STATUS_DOT.idle}`}
            style={{ borderColor: "var(--th-card-bg)" }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
              {localeName(locale, agent)}
            </span>
            <span className="shrink-0 text-[10px]" style={{ color: "var(--th-text-muted)" }}>
              {(() => {
                const primary = localeName(locale, agent);
                const sub = locale === "en" ? agent.name_ko || "" : agent.name;
                return primary !== sub ? sub : "";
              })()}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE[agent.role] || ""}`}>
              {isKo ? ROLE_LABEL[agent.role]?.ko : ROLE_LABEL[agent.role]?.en}
            </span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px]"
              style={{ background: "var(--th-bg-surface)", color: "var(--th-text-muted)" }}
            >
              Tier {profile.growth_tier}
            </span>
            {dept && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px]"
                style={{ background: "var(--th-bg-surface)", color: "var(--th-text-muted)" }}
              >
                {dept.icon} {localeName(locale, dept)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-2.5" style={{ borderTop: "1px solid var(--th-card-border)" }}>
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-mono"
            style={{ background: "var(--th-bg-surface)", color: "var(--th-text-muted)" }}
          >
            {agent.cli_provider}
          </span>
        </div>
        <div className="max-w-[170px] truncate text-[10px]" style={{ color: "var(--th-text-muted)" }} title={capabilitySummary}>
          {capabilitySummary}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={(event) => event.stopPropagation()}>
          {isDeleting ? (
            <>
              <button
                onClick={onDeleteConfirm}
                disabled={saving || agent.status === "working"}
                className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-40"
              >
                {tr("삭제", "Delete")}
              </button>
              <button
                onClick={onDeleteCancel}
                className="rounded px-2 py-0.5 text-[10px] transition-colors"
                style={{ color: "var(--th-text-muted)" }}
              >
                {tr("취소", "Cancel")}
              </button>
            </>
          ) : (
            <button
              onClick={onDeleteClick}
              className="rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-red-500/15 hover:text-red-400"
              style={{ color: "var(--th-text-muted)" }}
              title={tr("삭제", "Delete")}
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
