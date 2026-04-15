import { localeName, type UiLanguage } from "../../i18n";
import {
  buildAgentCapabilityCompactSummary,
  normalizeAgentProfile,
  recommendGrowthTierFromXp,
  resolveAgentProfileOverrideText,
  stringifySpecialties,
} from "../../agent-profile";
import { getRoleDisplayLabel } from "../../app/canonical-display";
import type { Agent, Department, SubAgent, SubTask, Task } from "../../types";
import { normalizeSubtaskTitleForUi } from "../../app/subtask-title-normalizer";
import { getSubAgentSpriteNum, SUBTASK_STATUS_ICON, taskStatusLabel, taskTypeLabel, type TFunction } from "./constants";

interface AgentDetailTabContentProps {
  tab: "info" | "tasks" | "alba";
  t: TFunction;
  language: UiLanguage;
  agent: Agent;
  departments: Department[];
  agentTasks: Task[];
  agentSubAgents: SubAgent[];
  subtasksByTask: Record<string, SubTask[]>;
  expandedTaskId: string | null;
  setExpandedTaskId: (taskId: string | null) => void;
  onChat: (agent: Agent) => void;
  onAssignTask: (agentId: string) => void;
  onOpenTerminal?: (taskId: string) => void;
}

function classPathText(profile: ReturnType<typeof normalizeAgentProfile>): string {
  const classPath = profile.class_path;
  if (!classPath) return "";
  if (typeof classPath === "string") return classPath;
  if (Array.isArray(classPath)) return classPath.join(" > ");
  return [classPath.class_stage_1 ?? classPath.stage1, classPath.class_stage_2 ?? classPath.stage2, classPath.class_stage_3 ?? classPath.stage3]
    .filter(Boolean)
    .join(" > ");
}

export default function AgentDetailTabContent({
  tab,
  t,
  language,
  agent,
  departments,
  agentTasks,
  agentSubAgents,
  subtasksByTask,
  expandedTaskId,
  setExpandedTaskId,
  onChat,
  onAssignTask,
  onOpenTerminal,
}: AgentDetailTabContentProps) {
  const xpLevel = Math.floor(agent.stats_xp / 100) + 1;
  const profile = normalizeAgentProfile(agent.agent_profile, agent.role);
  const recommendedTier = recommendGrowthTierFromXp(agent.stats_xp);
  const capabilitySummary = buildAgentCapabilityCompactSummary(profile, language, [
    "execution",
    "architecture",
    "review",
    "research",
    "communication",
    "leadership",
  ]);
  const specialtiesText = stringifySpecialties(profile.specialties);
  const overrideText = resolveAgentProfileOverrideText(profile, agent.personality);
  const classPath = classPathText(profile);

  if (tab === "info") {
    return (
      <div className="space-y-3">
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">{t({ ko: "역할 / 성장 프로필", en: "Role / Growth Profile", ja: "Role / Growth Profile", zh: "Role / Growth Profile" })}</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-slate-800/60 px-2.5 py-2 text-slate-300">
              <div className="text-slate-500">{t({ ko: "현재 역할", en: "Current Role", ja: "Current Role", zh: "Current Role" })}</div>
              <div className="mt-1 font-semibold text-white">{getRoleDisplayLabel(agent.role, language)}</div>
            </div>
            <div className="rounded-md bg-slate-800/60 px-2.5 py-2 text-slate-300">
              <div className="text-slate-500">{t({ ko: "적용 티어", en: "Applied Tier", ja: "Applied Tier", zh: "Applied Tier" })}</div>
              <div className="mt-1 font-semibold text-white">Tier {profile.growth_tier}</div>
            </div>
            <div className="rounded-md bg-slate-800/60 px-2.5 py-2 text-slate-300">
              <div className="text-slate-500">{t({ ko: "권장 티어", en: "Recommended Tier", ja: "Recommended Tier", zh: "Recommended Tier" })}</div>
              <div className="mt-1 font-semibold text-white">Tier {recommendedTier}</div>
            </div>
            <div className="rounded-md bg-slate-800/60 px-2.5 py-2 text-slate-300">
              <div className="text-slate-500">{t({ ko: "클래스 경로", en: "Class Path", ja: "Class Path", zh: "Class Path" })}</div>
              <div className="mt-1 font-semibold text-white">{classPath || "-"}</div>
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-300">{capabilitySummary}</div>
          {specialtiesText && <div className="mt-2 text-xs text-slate-400">{specialtiesText}</div>}
          {overrideText && <div className="mt-2 text-xs text-slate-500 line-clamp-3">{overrideText}</div>}
        </div>

        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">{t({ ko: "최종 수동 보정", en: "Final Manual Override", ja: "Final Manual Override", zh: "Final Manual Override" })}</div>
          <div className="text-sm text-slate-300">{overrideText || t({ ko: "설정 없음", en: "Not set", ja: "Not set", zh: "Not set" })}</div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-700/30 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-white">{agent.stats_tasks_done}</div>
            <div className="text-[10px] text-slate-500">{t({ ko: "완료 작업", en: "Completed", ja: "Completed", zh: "Completed" })}</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-white">{xpLevel}</div>
            <div className="text-[10px] text-slate-500">{t({ ko: "레벨", en: "Level", ja: "Level", zh: "Level" })}</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-white">{agentSubAgents.filter((subAgent) => subAgent.status === "working").length}</div>
            <div className="text-[10px] text-slate-500">{t({ ko: "서브에이전트", en: "Sub-agents", ja: "Sub-agents", zh: "Sub-agents" })}</div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={() => onChat(agent)} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
            {t({ ko: "대화하기", en: "Chat", ja: "Chat", zh: "Chat" })}
          </button>
          <button onClick={() => onAssignTask(agent.id)} className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors">
            {t({ ko: "작업 배정", en: "Assign Task", ja: "Assign Task", zh: "Assign Task" })}
          </button>
        </div>
        {agent.status === "working" && agent.current_task_id && onOpenTerminal && (
          <button onClick={() => onOpenTerminal(agent.current_task_id!)} className="w-full mt-2 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors">
            {t({ ko: "터미널 보기", en: "View Terminal", ja: "View Terminal", zh: "View Terminal" })}
          </button>
        )}
      </div>
    );
  }

  if (tab === "tasks") {
    return (
      <div className="space-y-2">
        {agentTasks.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">{t({ ko: "배정된 작업이 없습니다", en: "No assigned tasks", ja: "No assigned tasks", zh: "No assigned tasks" })}</div>
        ) : (
          agentTasks.map((taskItem) => {
            const taskSubtasks = subtasksByTask[taskItem.id] ?? [];
            const isExpanded = expandedTaskId === taskItem.id;
            const subTotal = taskItem.subtask_total ?? taskSubtasks.length;
            const subDone = taskItem.subtask_done ?? taskSubtasks.filter((subtask) => subtask.status === "done").length;
            return (
              <div key={taskItem.id} className="bg-slate-700/30 rounded-lg p-3">
                <button onClick={() => setExpandedTaskId(isExpanded ? null : taskItem.id)} className="flex items-start gap-3 w-full text-left">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${taskItem.status === "done" ? "bg-green-500" : taskItem.status === "in_progress" ? "bg-blue-500" : "bg-slate-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{taskItem.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{taskStatusLabel(taskItem.status, t)} · {taskTypeLabel(taskItem.task_type, t)}</div>
                    {subTotal > 0 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1 bg-slate-600 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all" style={{ width: `${Math.round((subDone / subTotal) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{subDone}/{subTotal}</span>
                      </div>
                    )}
                  </div>
                </button>
                {isExpanded && taskSubtasks.length > 0 && (
                  <div className="mt-2 ml-5 space-y-1 border-l border-slate-600 pl-2">
                    {taskSubtasks.map((subtask) => {
                      const targetDepartment = subtask.target_department_id ? departments.find((department) => department.id === subtask.target_department_id) : null;
                      return (
                        <div key={subtask.id} className="flex items-center gap-1.5 text-xs">
                          <span>{SUBTASK_STATUS_ICON[subtask.status] || "⏳"}</span>
                          <span className={`flex-1 truncate ${subtask.status === "done" ? "line-through text-slate-500" : "text-slate-300"}`}>{normalizeSubtaskTitleForUi(subtask.title)}</span>
                          {targetDepartment && (
                            <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${targetDepartment.color}30`, color: targetDepartment.color }}>
                              {localeName(language, targetDepartment)}
                            </span>
                          )}
                          {subtask.status === "blocked" && subtask.blocked_reason && <span className="text-red-400 text-[10px] truncate max-w-[80px]" title={subtask.blocked_reason}>{subtask.blocked_reason}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {agentSubAgents.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          {t({ ko: "현재 서브에이전트가 없습니다", en: "No sub-agents currently", ja: "No sub-agents currently", zh: "No sub-agents currently" })}
          <div className="text-xs mt-1 text-slate-600">{t({ ko: "병렬 처리 중에 자동으로 생성됩니다.", en: "They are spawned automatically during parallel work.", ja: "They are spawned automatically during parallel work.", zh: "They are spawned automatically during parallel work." })}</div>
        </div>
      ) : (
        agentSubAgents.map((subAgent) => (
          <div key={subAgent.id} className={`bg-slate-700/30 rounded-lg p-3 flex items-center gap-3 ${subAgent.status === "working" ? "animate-alba-spawn" : ""}`}>
            <div className="w-8 h-8 rounded-full bg-amber-500/20 overflow-hidden flex items-center justify-center">
              <img src={`/sprites/${getSubAgentSpriteNum(subAgent.id)}-D-1.png`} alt="sub-agent" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">{subAgent.task}</div>
              <div className="text-xs text-slate-500 mt-0.5">{subAgent.status === "working" ? t({ ko: "작업 중...", en: "Working...", ja: "Working...", zh: "Working..." }) : t({ ko: "완료", en: "Done", ja: "Done", zh: "Done" })}</div>
            </div>
            {subAgent.status === "working" && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
          </div>
        ))
      )}
    </div>
  );
}
