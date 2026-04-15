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

export default function ApiAssignModal({ t, localeTag, apiState }: ApiAssignModalProps) {
  const common = getSettingsCommonCopy(t);
  const {
    apiAssignTarget,
    apiAssigning,
    apiAssignAgents,
    apiAssignDepts,
    setApiAssignTarget,
    handleApiAssignToAgent,
    handleApiAssignToDepartment,
  } = apiState;

  if (!apiAssignTarget) return null;

  const spriteMap = buildSpriteMap(apiAssignAgents);
  const localName = (nameEn: string, nameKo: string) => (localeTag === "ko" ? nameKo || nameEn : nameEn || nameKo);
  const normalizeWorkflowPackKey = (value: unknown): WorkflowPackKey =>
    typeof value === "string" &&
    ["development", "novel", "report", "video_preprod", "web_research_report", "roleplay", "donggri"].includes(value)
      ? (value as WorkflowPackKey)
      : "development";

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
    ...new Set([
      "development",
      ...apiAssignDepts.map((dept) => dept.workflow_pack_key),
      ...apiAssignAgents.map((agent) => normalizeWorkflowPackKey(agent.workflow_pack_key)),
    ]),
  ] as WorkflowPackKey[];

  const packSections = packKeys
    .map((packKey) => {
      const depts = apiAssignDepts.filter((dept) => dept.workflow_pack_key === packKey);
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
        disabled={apiAssigning || isAssigned}
        onClick={() => void handleApiAssignToAgent(agent.id)}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
          isAssigned ? "cursor-default bg-green-500/10 text-green-400" : "text-slate-300 hover:bg-slate-700/60"
        } disabled:opacity-60`}
      >
        <AgentAvatar agent={agent} spriteMap={spriteMap} size={28} rounded="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium">{localName(agent.name, agent.name_ko)}</span>
            {roleBadge(agent)}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-slate-500">
            {agent.cli_provider === "api" && agent.api_model ? `API: ${agent.api_model}` : agent.cli_provider}
          </div>
        </div>
        {isAssigned ? <span className="flex-shrink-0 text-green-400">{common.applied}</span> : null}
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
          <h4 className="text-sm font-semibold text-white">{t({ ko: "모델 할당", en: "Assign Model" })}</h4>
          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{apiAssignTarget.model}</p>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto p-2">
          {apiAssignAgents.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">
              {t({ ko: "에이전트 불러오는 중...", en: "Loading agents..." })}
            </p>
          ) : (
            <>
              {packSections.map(({ packKey, departments, unassigned }) => (
                <div key={packKey} className="space-y-2">
                  <div className="px-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {t(getOfficePackMeta(packKey).label)}
                    </span>
                  </div>

                  {departments.map(({ dept, agents, allAssigned }) => (
                    <div key={`${packKey}:${dept.id}`}>
                      <div className="flex items-center justify-between gap-2 border-b border-slate-700/40 px-2 py-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="text-sm">{dept.icon}</span>
                          <span className="text-[11px] font-semibold tracking-wide text-slate-300">
                            {localName(dept.name, dept.name_ko)}
                          </span>
                          <span className="text-[10px] text-slate-600">({agents.length})</span>
                        </div>
                        <button
                          disabled={apiAssigning || allAssigned}
                          onClick={() => void handleApiAssignToDepartment(dept.id, packKey)}
                          className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                            allAssigned
                              ? "cursor-default bg-green-500/10 text-green-400"
                              : "bg-blue-600/20 text-blue-300 hover:bg-blue-600/30"
                          } disabled:opacity-60`}
                        >
                          {allAssigned ? common.applied : t({ ko: "팀 전체 적용", en: "Apply to team" })}
                        </button>
                      </div>
                      {agents.map(renderAgentRow)}
                    </div>
                  ))}

                  {unassigned.length > 0 ? (
                    <div>
                      <div className="flex items-center gap-1.5 border-b border-slate-700/40 px-2 py-1.5">
                        <span className="text-sm text-slate-600">•</span>
                        <span className="text-[11px] font-semibold tracking-wide text-slate-500">
                          {common.unassigned}
                        </span>
                      </div>
                      {unassigned.map(renderAgentRow)}
                    </div>
                  ) : null}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-700 px-4 py-2.5">
          <button
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
