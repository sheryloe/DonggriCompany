import { localeName, type UiLanguage } from "../../i18n";
import {
  buildAgentCapabilityCompactSummary,
  normalizeAgentProfile,
  recommendGrowthTierFromXp,
  resolveAgentProfileOverrideText,
  stringifySpecialties,
} from "../../agent-profile";
import { getRoleDisplayLabel, getWorkflowRoleDisplayLabel } from "../../app/canonical-display";
import { getCanonicalFamilyLabel, getCanonicalStageLabel } from "../../i18n/canonical-label-registry";
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
  return [
    classPath.class_stage_1 ?? classPath.stage1,
    classPath.class_stage_2 ?? classPath.stage2,
    classPath.class_stage_3 ?? classPath.stage3,
  ]
    .filter(Boolean)
    .join(" > ");
}

function infoField(label: string, value: string | number | null | undefined) {
  return (
    <div className="rounded-md bg-slate-800/60 px-2.5 py-2 text-slate-300">
      <div className="text-slate-500">{label}</div>
      <div className="mt-1 break-all font-semibold text-white">{value || "-"}</div>
    </div>
  );
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
  const canonicalFamily = agent.family ? getCanonicalFamilyLabel(agent.family, language) : "-";
  const canonicalStage = agent.career_stage ? getCanonicalStageLabel(agent.career_stage, language) : "-";
  const canonicalSource = agent.canonical_identity_source ?? "derived";
  const workflowRoleMirror = agent.workflow_profile?.role
    ? getWorkflowRoleDisplayLabel(agent.workflow_profile.role, language)
    : t({ ko: "설정 없음", en: "Not set", ja: "Not set", zh: "Not set" });
  const executionCapability = String(agent.execution_capability_profile ?? "").trim() || "-";
  const capabilityBars = [
    { key: "execution", label: t({ ko: "실행", en: "Execution", ja: "Execution", zh: "Execution" }), value: profile.capabilities.execution },
    { key: "architecture", label: t({ ko: "설계", en: "Architecture", ja: "Architecture", zh: "Architecture" }), value: profile.capabilities.architecture },
    { key: "review", label: t({ ko: "리뷰", en: "Review", ja: "Review", zh: "Review" }), value: profile.capabilities.review },
    { key: "leadership", label: t({ ko: "리더십", en: "Leadership", ja: "Leadership", zh: "Leadership" }), value: profile.capabilities.leadership },
  ] as const;

  if (tab === "info") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-700/30 p-3">
          <div className="mb-1 text-xs text-slate-500">
            {t({ ko: "Canonical Identity", en: "Canonical Identity", ja: "Canonical Identity", zh: "Canonical Identity" })}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {infoField(t({ ko: "Family", en: "Family", ja: "Family", zh: "Family" }), canonicalFamily)}
            {infoField(t({ ko: "Career Stage", en: "Career Stage", ja: "Career Stage", zh: "Career Stage" }), canonicalStage)}
            {infoField(t({ ko: "Specialization", en: "Specialization", ja: "Specialization", zh: "Specialization" }), agent.specialization_key ?? "-")}
            {infoField(t({ ko: "Authority Level", en: "Authority Level", ja: "Authority Level", zh: "Authority Level" }), agent.authority_level ?? "-")}
            {infoField(
              t({ ko: "Execution Capability", en: "Execution Capability", ja: "Execution Capability", zh: "Execution Capability" }),
              agent.execution_capability_profile ?? "-",
            )}
            {infoField(t({ ko: "Source", en: "Source", ja: "Source", zh: "Source" }), canonicalSource)}
          </div>
        </div>

        <div className="rounded-lg bg-slate-700/30 p-3">
          <div className="mb-1 text-xs text-slate-500">
            {t({ ko: "Legacy Compatibility", en: "Legacy Compatibility", ja: "Legacy Compatibility", zh: "Legacy Compatibility" })}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {infoField(t({ ko: "Legacy Role", en: "Legacy Role", ja: "Legacy Role", zh: "Legacy Role" }), getRoleDisplayLabel(agent.role, language))}
            {infoField(
              t({
                ko: "Workflow Capability (Compat)",
                en: "Workflow Capability (Compat)",
                ja: "Workflow Capability (Compat)",
                zh: "Workflow Capability (Compat)",
              }),
              executionCapability,
            )}
            {infoField(
              t({
                ko: "Legacy Workflow Role Mirror",
                en: "Legacy Workflow Role Mirror",
                ja: "Legacy Workflow Role Mirror",
                zh: "Legacy Workflow Role Mirror",
              }),
              workflowRoleMirror,
            )}
            {infoField(t({ ko: "Applied Tier", en: "Applied Tier", ja: "Applied Tier", zh: "Applied Tier" }), `Tier ${profile.growth_tier}`)}
            {infoField(
              t({ ko: "Recommended Tier", en: "Recommended Tier", ja: "Recommended Tier", zh: "Recommended Tier" }),
              `Tier ${recommendedTier}`,
            )}
            {infoField(t({ ko: "Class Path", en: "Class Path", ja: "Class Path", zh: "Class Path" }), classPath || "-")}
          </div>
          <div className="mt-2 text-sm text-slate-300">{capabilitySummary}</div>
          {specialtiesText ? <div className="mt-2 text-xs text-slate-400">{specialtiesText}</div> : null}
        </div>

        <div className="rounded-lg bg-slate-700/30 p-3">
          <div className="mb-2 text-xs text-slate-500">
            {t({ ko: "능력치", en: "Capability Stats", ja: "Capability Stats", zh: "Capability Stats" })}
          </div>
          <div className="space-y-1.5">
            {capabilityBars.map((entry) => (
              <div key={entry.key} className="grid grid-cols-[84px_minmax(0,1fr)_34px] items-center gap-2 text-[11px]">
                <span className="text-slate-400">{entry.label}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                    style={{ width: `${Math.max(1, Math.min(5, entry.value)) * 20}%` }}
                  />
                </div>
                <span className="text-right tabular-nums text-slate-200">{entry.value}/5</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-slate-700/30 p-3">
          <div className="mb-1 text-xs text-slate-500">
            {t({ ko: "Custom Prompt Override", en: "Custom Prompt Override", ja: "Custom Prompt Override", zh: "Custom Prompt Override" })}
          </div>
          <div className="text-sm text-slate-300">
            {overrideText || t({ ko: "설정 없음", en: "Not set", ja: "Not set", zh: "Not set" })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-700/30 p-3 text-center">
            <div className="text-lg font-bold text-white">{agent.stats_tasks_done}</div>
            <div className="text-[10px] text-slate-500">{t({ ko: "완료 작업", en: "Completed", ja: "Completed", zh: "Completed" })}</div>
          </div>
          <div className="rounded-lg bg-slate-700/30 p-3 text-center">
            <div className="text-lg font-bold text-white">{xpLevel}</div>
            <div className="text-[10px] text-slate-500">{t({ ko: "레벨", en: "Level", ja: "Level", zh: "Level" })}</div>
          </div>
          <div className="rounded-lg bg-slate-700/30 p-3 text-center">
            <div className="text-lg font-bold text-white">{agentSubAgents.filter((subAgent) => subAgent.status === "working").length}</div>
            <div className="text-[10px] text-slate-500">{t({ ko: "서브에이전트", en: "Sub-agents", ja: "Sub-agents", zh: "Sub-agents" })}</div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => onChat(agent)}
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            {t({ ko: "대화하기", en: "Chat", ja: "Chat", zh: "Chat" })}
          </button>
          <button
            onClick={() => onAssignTask(agent.id)}
            className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
          >
            {t({ ko: "작업 배정", en: "Assign Task", ja: "Assign Task", zh: "Assign Task" })}
          </button>
        </div>

        {agent.status === "working" && agent.current_task_id && onOpenTerminal ? (
          <button
            onClick={() => onOpenTerminal(agent.current_task_id!)}
            className="mt-2 w-full rounded-lg bg-slate-700 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
          >
            {t({ ko: "터미널 보기", en: "View Terminal", ja: "View Terminal", zh: "View Terminal" })}
          </button>
        ) : null}
      </div>
    );
  }

  if (tab === "tasks") {
    return (
      <div className="space-y-2">
        {agentTasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            {t({ ko: "배정된 작업이 없습니다", en: "No assigned tasks", ja: "No assigned tasks", zh: "No assigned tasks" })}
          </div>
        ) : (
          agentTasks.map((taskItem) => {
            const taskSubtasks = subtasksByTask[taskItem.id] ?? [];
            const isExpanded = expandedTaskId === taskItem.id;
            const subTotal = taskItem.subtask_total ?? taskSubtasks.length;
            const subDone = taskItem.subtask_done ?? taskSubtasks.filter((subtask) => subtask.status === "done").length;
            return (
              <div key={taskItem.id} className="rounded-lg bg-slate-700/30 p-3">
                <button onClick={() => setExpandedTaskId(isExpanded ? null : taskItem.id)} className="flex w-full items-start gap-3 text-left">
                  <div
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      taskItem.status === "done" ? "bg-green-500" : taskItem.status === "in_progress" ? "bg-blue-500" : "bg-slate-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{taskItem.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {taskStatusLabel(taskItem.status, t)} · {taskTypeLabel(taskItem.task_type, t)}
                    </div>
                    {subTotal > 0 ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-600">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all"
                            style={{ width: `${Math.round((subDone / subTotal) * 100)}%` }}
                          />
                        </div>
                        <span className="whitespace-nowrap text-[10px] text-slate-400">
                          {subDone}/{subTotal}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </button>

                {isExpanded && taskSubtasks.length > 0 ? (
                  <div className="ml-5 mt-2 space-y-1 border-l border-slate-600 pl-2">
                    {taskSubtasks.map((subtask) => {
                      const targetDepartment = subtask.target_department_id
                        ? departments.find((department) => department.id === subtask.target_department_id)
                        : null;
                      return (
                        <div key={subtask.id} className="flex items-center gap-1.5 text-xs">
                          <span>{SUBTASK_STATUS_ICON[subtask.status] || "•"}</span>
                          <span
                            className={`flex-1 truncate ${
                              subtask.status === "done" ? "line-through text-slate-500" : "text-slate-300"
                            }`}
                          >
                            {normalizeSubtaskTitleForUi(subtask.title)}
                          </span>
                          {targetDepartment ? (
                            <span
                              className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: `${targetDepartment.color}30`, color: targetDepartment.color }}
                            >
                              {localeName(language, targetDepartment)}
                            </span>
                          ) : null}
                          {subtask.status === "blocked" && subtask.blocked_reason ? (
                            <span className="max-w-[80px] truncate text-[10px] text-red-400" title={subtask.blocked_reason}>
                              {subtask.blocked_reason}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
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
        <div className="py-8 text-center text-sm text-slate-500">
          {t({ ko: "현재 서브 에이전트가 없습니다", en: "No sub-agents currently", ja: "No sub-agents currently", zh: "No sub-agents currently" })}
          <div className="mt-1 text-xs text-slate-600">
            {t({
              ko: "병렬 처리 중에 자동으로 생성됩니다.",
              en: "They are spawned automatically during parallel work.",
              ja: "They are spawned automatically during parallel work.",
              zh: "They are spawned automatically during parallel work.",
            })}
          </div>
        </div>
      ) : (
        agentSubAgents.map((subAgent) => (
          <div
            key={subAgent.id}
            className={`flex items-center gap-3 rounded-lg bg-slate-700/30 p-3 ${subAgent.status === "working" ? "animate-alba-spawn" : ""}`}
          >
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-amber-500/20">
              <img
                src={`/sprites/${getSubAgentSpriteNum(subAgent.id)}-D-1.png`}
                alt="sub-agent"
                className="h-full w-full object-cover"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white">{subAgent.task}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {subAgent.status === "working"
                  ? t({ ko: "작업 중...", en: "Working...", ja: "Working...", zh: "Working..." })
                  : t({ ko: "완료", en: "Done", ja: "Done", zh: "Done" })}
              </div>
            </div>
            {subAgent.status === "working" ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
