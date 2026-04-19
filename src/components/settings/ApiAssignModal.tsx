import { getOfficePackMeta } from "../../app/office-workflow-pack";
import { getRoleDisplayLabel } from "../../app/canonical-display";
import AgentAvatar, { buildSpriteMap } from "../AgentAvatar";
import type { Agent, WorkflowPackKey } from "../../types";
import { getSettingsCommonCopy } from "./settings-copy";
import type { ApiStateBundle, TFunction } from "./types";

interface ApiAssignModalProps {
  t: TFunction;
  localeTag: string;
  apiState: ApiStateBundle;
}

function isWorkflowPackKey(value: unknown): value is WorkflowPackKey {
  return (
    typeof value === "string" &&
    ["development", "donggri", "novel", "report", "video_preprod", "web_research_report", "roleplay"].includes(value)
  );
}

function normalizeWorkflowPackKey(value: unknown): WorkflowPackKey {
  return isWorkflowPackKey(value) ? value : "development";
}

function resolveLocalizedName(
  localeTag: string,
  names: { name: string; name_ko?: string | null; name_ja?: string | null; name_zh?: string | null },
): string {
  const locale = (localeTag || "en").toLowerCase();
  if (locale.startsWith("ko")) return names.name_ko || names.name || names.name_ja || names.name_zh || "";
  if (locale.startsWith("ja")) return names.name_ja || names.name || names.name_ko || names.name_zh || "";
  if (locale.startsWith("zh")) return names.name_zh || names.name || names.name_ko || names.name_ja || "";
  return names.name || names.name_ko || names.name_ja || names.name_zh || "";
}

function getPackSectionLabel(packKey: WorkflowPackKey, t: TFunction): string {
  if (packKey === "development") {
    return t({
      ko: "개발 오피스",
      en: "Development Office",
      ja: "開発オフィス",
      zh: "开发办公室",
    });
  }
  if (packKey === "video_preprod") {
    return t({
      ko: "영상 프리프로덕션",
      en: "Video Pre-production",
      ja: "映像プリプロダクション",
      zh: "视频前期制作",
    });
  }
  return t(getOfficePackMeta(packKey).label);
}

export default function ApiAssignModal({ t, localeTag, apiState }: ApiAssignModalProps) {
  const common = getSettingsCommonCopy(t);
  const {
    apiAssignTarget,
    apiAssignAgents,
    apiAssignDepts,
    setApiAssignTarget,
  } = apiState;

  if (!apiAssignTarget) return null;

  const spriteMap = buildSpriteMap(apiAssignAgents);
  const roleBadge = (agent: Agent) => {
    const text = getRoleDisplayLabel(agent.role, localeTag);
    const color =
      agent.role === "team_leader"
        ? "bg-amber-500/15 text-amber-400"
        : agent.role === "senior"
          ? "bg-blue-500/15 text-blue-400"
          : agent.role === "junior"
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-slate-500/15 text-slate-400";
    return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${color}`}>{text}</span>;
  };

  const packKeys = [
    ...new Set<WorkflowPackKey>([
      "development",
      ...apiAssignDepts.map((dept) => normalizeWorkflowPackKey(dept.workflow_pack_key)),
      ...apiAssignAgents.map((agent) => normalizeWorkflowPackKey(agent.workflow_pack_key)),
    ]),
  ];

  const packSections = packKeys
    .map((packKey) => {
      const depts = apiAssignDepts.filter((dept) => normalizeWorkflowPackKey(dept.workflow_pack_key) === packKey);
      const deptIds = new Set(depts.map((dept) => dept.id));
      const departments = depts
        .map((dept) => {
          const agents = apiAssignAgents.filter(
            (agent) => agent.department_id === dept.id && normalizeWorkflowPackKey(agent.workflow_pack_key) === packKey,
          );
          const allAssigned =
            agents.length > 0 &&
            agents.every(
              (agent) =>
                agent.cli_provider === "api" &&
                agent.api_provider_id === apiAssignTarget.providerId &&
                agent.api_model === apiAssignTarget.model,
            );
          return { dept, agents, allAssigned };
        })
        .filter((group) => group.agents.length > 0);

      const unassigned = apiAssignAgents.filter(
        (agent) =>
          normalizeWorkflowPackKey(agent.workflow_pack_key) === packKey &&
          (!agent.department_id || !deptIds.has(agent.department_id)),
      );

      return { packKey, departments, unassigned };
    })
    .filter((section) => section.departments.length > 0 || section.unassigned.length > 0);

  const renderAgentRow = (agent: Agent) => {
    const isAssigned =
      agent.cli_provider === "api" &&
      agent.api_provider_id === apiAssignTarget.providerId &&
      agent.api_model === apiAssignTarget.model;

    return (
      <button
        key={agent.id}
        type="button"
        disabled
        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
          isAssigned ? "cursor-default bg-green-500/10 text-green-400" : "cursor-not-allowed text-slate-400"
        } disabled:opacity-60`}
      >
        <AgentAvatar agent={agent} spriteMap={spriteMap} size={28} rounded="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium">
              {resolveLocalizedName(localeTag, agent)}
            </span>
            {roleBadge(agent)}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-slate-500">
            {agent.cli_provider === "api" && agent.api_model ? `API: ${agent.api_model}` : agent.cli_provider}
          </div>
        </div>
        {isAssigned ? (
          <span className="flex-shrink-0 text-green-400">{common.applied}</span>
        ) : (
          <span className="flex-shrink-0 text-slate-500">
            {t({ ko: "읽기전용", en: "Read-only", ja: "Read-only", zh: "Read-only" })}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setApiAssignTarget(null)}
    >
      <div
        className="max-h-[75vh] w-96 overflow-hidden rounded-xl border border-slate-600 bg-slate-800 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-700 px-4 py-3">
          <h4 className="text-sm font-semibold text-white">
            {t({ ko: "모델 할당", en: "Assign Model", ja: "モデル割り当て", zh: "分配模型" })}
          </h4>
          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{apiAssignTarget.model}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {t({
              ko: "수동 모델 할당은 compatibility-only로 전환되어 이 화면은 검사 전용입니다.",
              en: "Manual model assignment is compatibility-only; this view is inspection-only.",
              ja: "Manual model assignment is compatibility-only; this view is inspection-only.",
              zh: "Manual model assignment is compatibility-only; this view is inspection-only.",
            })}
          </p>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto p-2">
          {apiAssignAgents.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">
              {t({ ko: "에이전트를 불러오는 중...", en: "Loading agents...", ja: "エージェントを読み込み中...", zh: "正在加载代理..." })}
            </p>
          ) : (
            packSections.map(({ packKey, departments, unassigned }) => (
              <div key={packKey} className="space-y-2">
                <div className="px-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {getPackSectionLabel(packKey, t)}
                  </span>
                </div>

                {departments.map(({ dept, agents, allAssigned }) => (
                  <div key={`${packKey}:${dept.id}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-700/40 px-2 py-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="text-sm">{dept.icon}</span>
                        <span className="text-[11px] font-semibold tracking-wide text-slate-300">
                          {resolveLocalizedName(localeTag, dept)}
                        </span>
                        <span className="text-[10px] text-slate-600">({agents.length})</span>
                      </div>
                      <button
                        type="button"
                        disabled
                        className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                          allAssigned ? "cursor-default bg-green-500/10 text-green-400" : "bg-slate-700/70 text-slate-400"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {allAssigned
                          ? common.applied
                          : t({ ko: "읽기전용", en: "Read-only", ja: "Read-only", zh: "Read-only" })}
                      </button>
                    </div>
                    {agents.map(renderAgentRow)}
                  </div>
                ))}

                {unassigned.length > 0 ? (
                  <div>
                    <div className="flex items-center gap-1.5 border-b border-slate-700/40 px-2 py-1.5">
                      <span className="text-sm text-slate-600">-</span>
                      <span className="text-[11px] font-semibold tracking-wide text-slate-500">{common.unassigned}</span>
                    </div>
                    {unassigned.map(renderAgentRow)}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end border-t border-slate-700 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setApiAssignTarget(null)}
            className="rounded-lg bg-slate-600 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-500"
          >
            {common.close}
          </button>
        </div>
      </div>
    </div>
  );
}
