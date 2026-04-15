import type { Dispatch, SetStateAction } from "react";
import type { ProjectDetailResponse } from "../../api";
import { getAssignmentModeDisplayLabel, getRoleDisplayLabel } from "../../app/canonical-display";
import { localeName } from "../../i18n";
import type { Agent, AssignmentMode, Department, Project } from "../../types";
import AgentAvatar from "../AgentAvatar";
import type { ManualAssignmentWarning, ProjectI18nTranslate, ProjectManualSelectionStats } from "./types";

interface ManualAssignmentSelectorProps {
  t: ProjectI18nTranslate;
  language: string;
  isCreating: boolean;
  editingProjectId: string | null;
  assignmentMode: AssignmentMode;
  setAssignmentMode: Dispatch<SetStateAction<AssignmentMode>>;
  setManualAssignmentWarning: Dispatch<SetStateAction<ManualAssignmentWarning | null>>;
  manualSelectionStats: ProjectManualSelectionStats;
  selectedAgentIds: Set<string>;
  setSelectedAgentIds: Dispatch<SetStateAction<Set<string>>>;
  agentFilterDept: string;
  setAgentFilterDept: Dispatch<SetStateAction<string>>;
  departments: Department[];
  agents: Agent[];
  spriteMap: Map<string, number>;
  detail: ProjectDetailResponse | null;
  selectedProject: Project | null;
}

export default function ManualAssignmentSelector({
  t,
  language,
  isCreating,
  editingProjectId,
  assignmentMode,
  setAssignmentMode,
  setManualAssignmentWarning,
  manualSelectionStats,
  selectedAgentIds,
  setSelectedAgentIds,
  agentFilterDept,
  setAgentFilterDept,
  departments,
  agents,
  spriteMap,
  detail,
  selectedProject,
}: ManualAssignmentSelectorProps) {
  return (
    <>
      {(isCreating || !!editingProjectId) && (
        <div className="mt-2 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-400">
              {t({ ko: "배정 방식", en: "Assignment Mode", ja: "Assignment Mode", zh: "Assignment Mode" })}
            </span>
            <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-800 p-0.5">
              {(["auto", "manual"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setAssignmentMode(mode);
                    setManualAssignmentWarning(null);
                  }}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                    assignmentMode === mode
                      ? mode === "auto"
                        ? "bg-blue-600 text-white"
                        : "bg-violet-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {getAssignmentModeDisplayLabel(mode, language)}
                </button>
              ))}
            </div>
          </div>

          {assignmentMode === "manual" && (
            <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {t({ ko: "참여 에이전트 선택", en: "Select Agents", ja: "Select Agents", zh: "Select Agents" })}
                  <span className="ml-2 font-medium text-blue-400">
                    {selectedAgentIds.size}
                    {t({ ko: "명 선택", en: " selected", ja: " selected", zh: " selected" })}
                  </span>
                </span>
                {departments.length > 0 && (
                  <select
                    value={agentFilterDept}
                    onChange={(event) => setAgentFilterDept(event.target.value)}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 outline-none"
                  >
                    <option value="all">
                      {t({ ko: "전체 부서", en: "All Departments", ja: "All Departments", zh: "All Departments" })}
                    </option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.icon} {localeName(language, department)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300">
                  {t({ ko: "총계", en: "Total", ja: "Total", zh: "Total" })}: {manualSelectionStats.total}
                </span>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                  {t({ ko: "팀장", en: "Leaders", ja: "Leaders", zh: "Leaders" })}: {manualSelectionStats.leaders}
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                  {t({ ko: "실무 에이전트", en: "Subordinates", ja: "Subordinates", zh: "Subordinates" })}:{" "}
                  {manualSelectionStats.subordinates}
                </span>
              </div>

              {manualSelectionStats.subordinates === 0 && (
                <p className="text-[11px] text-amber-300">
                  {t({
                    ko: "실무 에이전트가 없으면 팀장이 직접 실행할 수 있습니다.",
                    en: "Without subordinate agents, team leaders may execute tasks directly.",
                    ja: "Without subordinate agents, team leaders may execute tasks directly.",
                    zh: "Without subordinate agents, team leaders may execute tasks directly.",
                  })}
                </p>
              )}

              <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {agents
                  .filter((agent) => agentFilterDept === "all" || agent.department_id === agentFilterDept)
                  .sort((left, right) => {
                    const roleOrder: Record<string, number> = {
                      team_leader: 0,
                      senior: 1,
                      junior: 2,
                      intern: 3,
                    };
                    return (
                      (roleOrder[left.role] ?? 9) - (roleOrder[right.role] ?? 9) || left.name.localeCompare(right.name)
                    );
                  })
                  .map((agent) => {
                    const checked = selectedAgentIds.has(agent.id);
                    const department = departments.find((row) => row.id === agent.department_id);
                    return (
                      <label
                        key={agent.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-all ${
                          checked ? "border-blue-500/30 bg-blue-600/10" : "border-transparent hover:bg-slate-800"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(selectedAgentIds);
                            if (checked) next.delete(agent.id);
                            else next.add(agent.id);
                            setSelectedAgentIds(next);
                            setManualAssignmentWarning(null);
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-600 accent-blue-500"
                        />
                        <AgentAvatar agent={agent} spriteMap={spriteMap} size={24} />
                        <span className="text-xs font-medium text-slate-200">{localeName(language, agent)}</span>
                        {department && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px]"
                            style={{ background: `${department.color}22`, color: department.color }}
                          >
                            {localeName(language, department)}
                          </span>
                        )}
                        <span
                          className="ml-auto rounded px-1.5 py-0.5 text-[10px]"
                          style={{ color: "var(--th-text-muted)", background: "rgba(255,255,255,0.05)" }}
                        >
                          {getRoleDisplayLabel(agent.role, language)}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {!isCreating && !editingProjectId && selectedProject && selectedProject.assignment_mode === "manual" && (
        <div className="mt-2 rounded-lg border border-violet-500/20 bg-violet-600/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-violet-400">
              {t({ ko: "수동 배정 모드", en: "Manual Assignment", ja: "Manual Assignment", zh: "Manual Assignment" })}
            </span>
            <span className="text-xs text-slate-400">
              {detail?.assigned_agents?.length ?? 0}
              {t({ ko: "명 배정", en: " agents", ja: " agents", zh: " agents" })}
            </span>
          </div>
          {detail?.assigned_agents && detail.assigned_agents.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {detail.assigned_agents.map((agent) => (
                <span
                  key={agent.id}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300"
                >
                  <AgentAvatar agent={agent} spriteMap={spriteMap} size={16} />
                  {localeName(language, agent)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
