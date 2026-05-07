import { localeName, type UiLanguage } from "../../i18n";
import { useMemo, useState } from "react";
import {
  buildAgentCapabilityCompactSummary,
  normalizeAgentProfile,
  recommendGrowthTierFromXp,
  resolveAgentProfileOverrideText,
  stringifySpecialties,
} from "../../agent-profile";
import { getRoleDisplayLabel, getWorkflowRoleDisplayLabel } from "../../app/canonical-display";
import { getCanonicalFamilyLabel, getCanonicalStageLabel } from "../../i18n/canonical-label-registry";
import {
  getAgentVisualProfileFallbackPool,
  getAgentVisualProfileDescriptionKo,
  getAgentVisualProfileStatusLabelKo,
  getSpriteDirectionLabelKo,
  resolveAgentVisualProfile,
} from "../../agent-visual-profiles";
import { getProjectModuleTitle } from "../../app/module-display";
import type { Agent, AgentMemoryResponse, AgentVisualProfile, Department, SubAgent, SubTask, Task } from "../../types";
import { normalizeSubtaskTitleForUi } from "../../app/subtask-title-normalizer";
import { getSubAgentSpriteNum, SUBTASK_STATUS_ICON, taskStatusLabel, taskTypeLabel, type TFunction } from "./constants";

type AgentMemoryFilter = "all" | "core" | "archival" | "episodic" | "candidate";

interface AgentDetailTabContentProps {
  tab: "info" | "tasks" | "alba" | "memory";
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
  agentMemory?: AgentMemoryResponse | null;
  agentMemoryLoading?: boolean;
  onApproveReserveProfile?: (profileKey: string) => void | Promise<void>;
  approvingReserveProfileKey?: string | null;
  reserveProfileError?: string | null;
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

function canonicalSourceLabel(value: string | null | undefined, language: UiLanguage): string {
  const normalized = String(value ?? "derived").trim();
  if (language !== "ko") return normalized || "-";
  const labels: Record<string, string> = {
    stored: "저장됨",
    derived: "파생됨",
    default: "기본값",
    canonical: "표준 규칙",
  };
  return (labels[normalized] ?? normalized) || "-";
}

function tierLabel(value: number, language: UiLanguage): string {
  return language === "ko" ? `티어 ${value}` : `Tier ${value}`;
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
  agentMemory,
  agentMemoryLoading,
  onApproveReserveProfile,
  approvingReserveProfileKey,
  reserveProfileError,
}: AgentDetailTabContentProps) {
  const [memoryFilter, setMemoryFilter] = useState<AgentMemoryFilter>("all");
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
  const visualProfile = resolveAgentVisualProfile(agent);
  const visualProfileDescription = getAgentVisualProfileDescriptionKo(visualProfile);
  const visualProfileSpriteText = `${visualProfile.sprite_profile.directions.map(getSpriteDirectionLabelKo).join(" / ")} · ${
    visualProfile.sprite_profile.supports_walk ? "걷기 애니메이션 준비됨" : "정지 이미지 전용"
  }`;
  const visualProfileModuleText = visualProfile.preferred_asset_modules.map(getProjectModuleTitle).join(", ");
  const visualProfileStatusText = getAgentVisualProfileStatusLabelKo(visualProfile.status);
  const canonicalFamily = agent.family ? getCanonicalFamilyLabel(agent.family, language) : "-";
  const canonicalStage = agent.career_stage ? getCanonicalStageLabel(agent.career_stage, language) : "-";
  const canonicalSource = canonicalSourceLabel(agent.canonical_identity_source, language);
  const workflowRoleMirror = agent.workflow_profile?.role
    ? getWorkflowRoleDisplayLabel(agent.workflow_profile.role, language)
    : t({ ko: "설정 없음", en: "Not set", ja: "Not set", zh: "Not set" });
  const executionCapability = String(agent.execution_capability_profile ?? "").trim() || "-";
  const capabilityBars = [
    {
      key: "execution",
      label: t({ ko: "실행", en: "Execution", ja: "Execution", zh: "Execution" }),
      value: profile.capabilities.execution,
    },
    {
      key: "architecture",
      label: t({ ko: "아키텍처", en: "Architecture", ja: "Architecture", zh: "Architecture" }),
      value: profile.capabilities.architecture,
    },
    {
      key: "review",
      label: t({ ko: "리뷰", en: "Review", ja: "Review", zh: "Review" }),
      value: profile.capabilities.review,
    },
    {
      key: "leadership",
      label: t({ ko: "리더십", en: "Leadership", ja: "Leadership", zh: "Leadership" }),
      value: profile.capabilities.leadership,
    },
  ] as const;
  const allAgentMemories = useMemo(() => agentMemory?.memories ?? [], [agentMemory?.memories]);
  const filteredAgentMemories = useMemo(() => {
    if (memoryFilter === "all") return allAgentMemories;
    if (memoryFilter === "candidate") {
      return allAgentMemories.filter((memory) => memory.promotion_status === "candidate");
    }
    return allAgentMemories.filter((memory) => memory.memory_layer === memoryFilter);
  }, [allAgentMemories, memoryFilter]);
  const memoryFilterOptions: Array<{ key: AgentMemoryFilter; label: string }> = [
    { key: "all", label: "전체" },
    { key: "core", label: "핵심 기억" },
    { key: "archival", label: "보관 기억" },
    { key: "episodic", label: "프로젝트 경험" },
    { key: "candidate", label: "전사 공통 Skill 후보" },
  ];
  const skillUsage = agentMemory?.skill_usage ?? [];
  const growthEvents = agentMemory?.growth_events ?? [];
  const candidateMemoryCount = allAgentMemories.filter((memory) => memory.promotion_status === "candidate").length;
  const activeSubAgentCount = agentSubAgents.filter((subAgent) => subAgent.status === "working").length;
  const preferredSubagents = useMemo(() => {
    const configured = profile.preferred_subagents ?? [];
    if (configured.length > 0) return configured;
    const liveTasks = agentSubAgents.map((subAgent) => subAgent.task.trim()).filter(Boolean);
    if (liveTasks.length > 0) return liveTasks.slice(0, 4);
    if (agent.family === "frontend" || agent.department_id === "design") {
      return ["ui-designer", "ux-researcher", "accessibility-tester"];
    }
    if (agent.family === "qa" || agent.department_id === "qa") {
      return ["test-automator", "reviewer", "performance-monitor"];
    }
    if (agent.family === "backend" || agent.department_id === "dev") {
      return ["backend-developer", "typescript-pro", "database-optimizer"];
    }
    if (agent.department_id === "devsecops") {
      return ["security-auditor", "devops-engineer", "github:gh-fix-ci"];
    }
    if (agent.department_id === "operations") {
      return ["sre-engineer", "documentation-engineer", "customer-success-manager"];
    }
    return ["task-distributor", "project-manager", "risk-manager"];
  }, [agent.department_id, agent.family, agentSubAgents, profile.preferred_subagents]);
  const reserveProfileCandidates = useMemo<AgentVisualProfile[]>(() => {
    const currentKey = visualProfile.agent_visual_profile_key;
    return getAgentVisualProfileFallbackPool(currentKey).slice(0, 4);
  }, [visualProfile.agent_visual_profile_key]);
  const generationHistory = [
    {
      label: "프로필 매핑",
      value: visualProfile.agent_visual_profile_key,
      detail: visualProfileStatusText,
    },
    {
      label: "스프라이트",
      value: typeof agent.sprite_number === "number" ? `#${agent.sprite_number}` : "미지정",
      detail: visualProfile.sprite_profile.supports_walk ? "4방향 walk 준비" : "정적 이미지 전용",
    },
    {
      label: "생성 모듈",
      value: visualProfileModuleText || "연결 없음",
      detail: "프로필 저장값 기준",
    },
  ];

  if (tab === "info") {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <section
            data-testid="agent-operational-profile-panel"
            className="rounded-lg border border-slate-700 bg-slate-800/55 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">운영 프로필 보드</div>
                <h3 className="mt-1 text-base font-semibold text-white">{visualProfile.label_ko}</h3>
              </div>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100">
                {visualProfileStatusText}
              </span>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="rounded-md bg-slate-900/55 p-3">
                <div className="text-[11px] font-semibold text-slate-400">캐릭터 설정</div>
                <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-300">
                  {visualProfileDescription || "저장된 캐릭터 설정이 없습니다."}
                </p>
              </div>
              <div className="rounded-md bg-slate-900/55 p-3">
                <div className="text-[11px] font-semibold text-slate-400">스프라이트 설정</div>
                <p className="mt-1 text-xs leading-5 text-slate-300">{visualProfileSpriteText}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Canvas {visualProfile.sprite_profile.canvas_size} · modules {visualProfileModuleText || "-"}
                </p>
              </div>
              <div className="rounded-md bg-slate-900/55 p-3 md:col-span-2">
                <div className="mb-2 text-[11px] font-semibold text-slate-400">생성 이력</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {generationHistory.map((event) => (
                    <div key={event.label} className="min-w-0 rounded border border-slate-700/70 px-2.5 py-2">
                      <div className="text-[10px] text-slate-500">{event.label}</div>
                      <div className="mt-1 truncate text-xs font-semibold text-slate-100" title={event.value}>
                        {event.value}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-500" title={event.detail}>
                        {event.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-3">
            <section
              data-testid="agent-memory-growth-summary"
              className="rounded-lg border border-slate-700 bg-slate-800/55 p-3"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">기억·성장·위임</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-slate-900/55 p-2">
                  <div className="text-lg font-bold text-white">{allAgentMemories.length}</div>
                  <div className="text-[10px] text-slate-500">기억</div>
                </div>
                <div className="rounded-md bg-slate-900/55 p-2">
                  <div className="text-lg font-bold text-white">{growthEvents.length}</div>
                  <div className="text-[10px] text-slate-500">성장</div>
                </div>
                <div className="rounded-md bg-slate-900/55 p-2">
                  <div className="text-lg font-bold text-white">{activeSubAgentCount}</div>
                  <div className="text-[10px] text-slate-500">실행중</div>
                </div>
              </div>
              <div className="mt-3 rounded-md bg-slate-900/55 p-2">
                <div className="text-[11px] text-slate-500">추천 subagent</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {preferredSubagents.map((subagent) => (
                    <span
                      key={subagent}
                      className="max-w-full truncate rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-200"
                      title={subagent}
                    >
                      {subagent}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                전사 후보 기억 {candidateMemoryCount}개 · skill 기록 {skillUsage.length}개
              </div>
            </section>

            <section
              data-testid="reserve-profile-approval-panel"
              className="rounded-lg border border-slate-700 bg-slate-800/55 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">예비 프로필 승인</div>
                <span className="text-[10px] text-slate-500">{reserveProfileCandidates.length} 후보</span>
              </div>
              <div className="mt-3 space-y-2">
                {reserveProfileCandidates.map((candidate) => {
                  const savingCandidate = approvingReserveProfileKey === candidate.agent_visual_profile_key;
                  return (
                    <div
                      key={candidate.agent_visual_profile_key}
                      className="rounded-md border border-slate-700/70 bg-slate-900/55 p-2"
                    >
                      <div className="min-w-0 text-xs font-semibold text-slate-100">{candidate.label_ko}</div>
                      <div
                        className="mt-1 truncate text-[10px] text-slate-500"
                        title={candidate.agent_visual_profile_key}
                      >
                        {candidate.agent_visual_profile_key}
                      </div>
                      <button
                        type="button"
                        disabled={!onApproveReserveProfile || Boolean(approvingReserveProfileKey)}
                        onClick={() => {
                          void onApproveReserveProfile?.(candidate.agent_visual_profile_key);
                        }}
                        className="mt-2 w-full rounded-md bg-cyan-600 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-cyan-500 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`${candidate.label_ko} 예비 프로필 승인`}
                      >
                        {savingCandidate ? "승인 저장 중..." : "교체 승인"}
                      </button>
                    </div>
                  );
                })}
              </div>
              {reserveProfileError ? <p className="mt-2 text-xs text-rose-300">{reserveProfileError}</p> : null}
            </section>
          </aside>
        </div>

        <div className="rounded-lg bg-slate-700/30 p-3">
          <div className="mb-1 text-xs text-slate-500">
            {t({ ko: "표준 정체성", en: "Canonical Identity", ja: "Canonical Identity", zh: "Canonical Identity" })}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {infoField(t({ ko: "직군", en: "Family", ja: "Family", zh: "Family" }), canonicalFamily)}
            {infoField(
              t({ ko: "경력 단계", en: "Career Stage", ja: "Career Stage", zh: "Career Stage" }),
              canonicalStage,
            )}
            {infoField(
              t({ ko: "전문화", en: "Specialization", ja: "Specialization", zh: "Specialization" }),
              agent.specialization_key ?? "-",
            )}
            {infoField(
              t({ ko: "권한 레벨", en: "Authority Level", ja: "Authority Level", zh: "Authority Level" }),
              agent.authority_level ?? "-",
            )}
            {infoField(
              t({
                ko: "실행 역량",
                en: "Execution Capability",
                ja: "Execution Capability",
                zh: "Execution Capability",
              }),
              agent.execution_capability_profile ?? "-",
            )}
            {infoField(t({ ko: "출처", en: "Source", ja: "Source", zh: "Source" }), canonicalSource)}
          </div>
        </div>

        <div className="rounded-lg bg-slate-700/30 p-3">
          <div className="mb-1 text-xs text-slate-500">
            {t({
              ko: "레거시 호환 정보",
              en: "Legacy Compatibility",
              ja: "Legacy Compatibility",
              zh: "Legacy Compatibility",
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {infoField(
              t({ ko: "레거시 역할", en: "Legacy Role", ja: "Legacy Role", zh: "Legacy Role" }),
              getRoleDisplayLabel(agent.role, language),
            )}
            {infoField(
              t({
                ko: "워크플로우 역량(호환)",
                en: "Workflow Capability (Compat)",
                ja: "Workflow Capability (Compat)",
                zh: "Workflow Capability (Compat)",
              }),
              executionCapability,
            )}
            {infoField(
              t({
                ko: "레거시 워크플로우 역할 미러",
                en: "Legacy Workflow Role Mirror",
                ja: "Legacy Workflow Role Mirror",
                zh: "Legacy Workflow Role Mirror",
              }),
              workflowRoleMirror,
            )}
            {infoField(
              t({ ko: "적용 티어", en: "Applied Tier", ja: "Applied Tier", zh: "Applied Tier" }),
              tierLabel(profile.growth_tier, language),
            )}
            {infoField(
              t({ ko: "추천 티어", en: "Recommended Tier", ja: "Recommended Tier", zh: "Recommended Tier" }),
              tierLabel(recommendedTier, language),
            )}
            {infoField(
              t({ ko: "클래스 경로", en: "Class Path", ja: "Class Path", zh: "Class Path" }),
              classPath || "-",
            )}
          </div>
          <div className="mt-2 text-sm text-slate-300">{capabilitySummary}</div>
          {specialtiesText ? <div className="mt-2 text-xs text-slate-400">{specialtiesText}</div> : null}
        </div>

        <div className="rounded-lg bg-slate-700/30 p-3">
          <div className="mb-1 text-xs text-slate-500">
            {t({ ko: "비주얼 프로필", en: "Visual Profile", ja: "Visual Profile", zh: "Visual Profile" })}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {infoField(t({ ko: "프로필", en: "Profile", ja: "Profile", zh: "Profile" }), visualProfile.label_ko)}
            {infoField(t({ ko: "스프라이트", en: "Sprite", ja: "Sprite", zh: "Sprite" }), visualProfileSpriteText)}
            {infoField(
              t({ ko: "추천 모듈", en: "Recommended Modules", ja: "Recommended Modules", zh: "Recommended Modules" }),
              visualProfileModuleText || "-",
            )}
            {infoField(t({ ko: "상태", en: "Status", ja: "Status", zh: "Status" }), visualProfileStatusText)}
          </div>
          <div className="mt-2 rounded-md bg-slate-900/50 p-2 text-xs leading-5 text-slate-300">
            <div className="font-semibold text-slate-200">
              {t({ ko: "캐릭터 설정", en: "Character Bible", ja: "Character Bible", zh: "Character Bible" })}
            </div>
            <p className="mt-1">{visualProfileDescription || "캐릭터 설정 설명이 아직 없습니다."}</p>
            <div className="mt-2 font-semibold text-slate-200">
              {t({ ko: "생성 규칙", en: "Generation Rules", ja: "Generation Rules", zh: "Generation Rules" })}
            </div>
            <p className="mt-1">
              화면에는 한국어 설명만 표시하고, 실제 이미지 생성 프롬프트와 캐릭터 설정은 영어 canonical 값으로
              저장됩니다.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-700/30 p-3">
          <div className="mb-2 text-xs text-slate-500">
            {t({ ko: "역량 스탯", en: "Capability Stats", ja: "Capability Stats", zh: "Capability Stats" })}
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
            {t({
              ko: "사용자 프롬프트 보정",
              en: "Custom Prompt Override",
              ja: "Custom Prompt Override",
              zh: "Custom Prompt Override",
            })}
          </div>
          <div className="text-sm text-slate-300">
            {overrideText || t({ ko: "설정 없음", en: "Not set", ja: "Not set", zh: "Not set" })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-700/30 p-3 text-center">
            <div className="text-lg font-bold text-white">{agent.stats_tasks_done}</div>
            <div className="text-[10px] text-slate-500">
              {t({ ko: "완료 작업", en: "Completed", ja: "Completed", zh: "Completed" })}
            </div>
          </div>
          <div className="rounded-lg bg-slate-700/30 p-3 text-center">
            <div className="text-lg font-bold text-white">{xpLevel}</div>
            <div className="text-[10px] text-slate-500">{t({ ko: "레벨", en: "Level", ja: "Level", zh: "Level" })}</div>
          </div>
          <div className="rounded-lg bg-slate-700/30 p-3 text-center">
            <div className="text-lg font-bold text-white">
              {agentSubAgents.filter((subAgent) => subAgent.status === "working").length}
            </div>
            <div className="text-[10px] text-slate-500">
              {t({ ko: "서브에이전트", en: "Sub-agents", ja: "Sub-agents", zh: "Sub-agents" })}
            </div>
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
            {t({
              ko: "배정된 작업이 없습니다",
              en: "No assigned tasks",
              ja: "No assigned tasks",
              zh: "No assigned tasks",
            })}
          </div>
        ) : (
          agentTasks.map((taskItem) => {
            const taskSubtasks = subtasksByTask[taskItem.id] ?? [];
            const isExpanded = expandedTaskId === taskItem.id;
            const subTotal = taskItem.subtask_total ?? taskSubtasks.length;
            const subDone = taskItem.subtask_done ?? taskSubtasks.filter((subtask) => subtask.status === "done").length;
            return (
              <div key={taskItem.id} className="rounded-lg bg-slate-700/30 p-3">
                <button
                  onClick={() => setExpandedTaskId(isExpanded ? null : taskItem.id)}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <div
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      taskItem.status === "done"
                        ? "bg-green-500"
                        : taskItem.status === "in_progress"
                          ? "bg-blue-500"
                          : "bg-slate-500"
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
                            <span
                              className="max-w-[80px] truncate text-[10px] text-red-400"
                              title={subtask.blocked_reason}
                            >
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

  if (tab === "memory") {
    const memories = filteredAgentMemories;
    return (
      <div className="space-y-3">
        {agentMemoryLoading ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300">
            기억과 성장 정보를 불러오는 중입니다.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
            <div className="text-[11px] text-slate-400">장기기억</div>
            <div className="mt-1 text-2xl font-bold text-white">{allAgentMemories.length}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
            <div className="text-[11px] text-slate-400">스킬 숙련 항목</div>
            <div className="mt-1 text-2xl font-bold text-white">{skillUsage.length}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
            <div className="text-[11px] text-slate-400">성장 이벤트</div>
            <div className="mt-1 text-2xl font-bold text-white">{growthEvents.length}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {memoryFilterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMemoryFilter(option.key)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                memoryFilter === option.key
                  ? "bg-cyan-500 text-slate-950"
                  : "border border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-400"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="mb-2 text-xs font-semibold text-white">장기기억</div>
          {memories.length === 0 ? (
            <p className="text-xs text-slate-500">선택한 조건에 맞는 기억이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {memories.slice(0, 10).map((memory) => (
                <div key={memory.id} className="rounded-md bg-slate-900/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-slate-100">{memory.title}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200">
                        {memory.memory_layer}
                      </span>
                      <span className="rounded bg-slate-700 px-2 py-0.5 text-[10px] text-slate-200">
                        {memory.memory_type}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{memory.display_summary_ko || memory.body}</p>
                  {memory.promotion_status === "candidate" ? (
                    <p className="mt-1 text-[10px] text-amber-200">전사 공통 Skill 후보</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="mb-2 text-xs font-semibold text-white">스킬 숙련도</div>
          {skillUsage.length === 0 ? (
            <p className="text-xs text-slate-500">아직 기록된 스킬 사용 이력이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {skillUsage.slice(0, 10).map((skill) => (
                <div key={skill.skill_id} className="rounded-md bg-slate-900/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-100">{skill.skill_id}</span>
                    <span className="text-slate-400">
                      사용 {skill.use_count}회 · 성공 {skill.success_count}회
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                      style={{ width: `${Math.round(Math.max(0, Math.min(1, skill.proficiency)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="mb-2 text-xs font-semibold text-white">최근 실수/교훈 및 성장</div>
          {growthEvents.length === 0 ? (
            <p className="text-xs text-slate-500">아직 성장 이벤트가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {growthEvents.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-md bg-slate-900/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-slate-100">{event.title}</p>
                    <span className="text-[10px] text-amber-200">XP +{event.xp_delta}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{event.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {agentSubAgents.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          {t({
            ko: "현재 서브 에이전트가 없습니다",
            en: "No sub-agents currently",
            ja: "No sub-agents currently",
            zh: "No sub-agents currently",
          })}
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
