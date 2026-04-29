import { useCallback, useEffect, useMemo, useState } from "react";
import type { CliAccountPoolView, OAuthStatus } from "../api";
import * as api from "../api";
import { getRoleDisplayLabel } from "../app/canonical-display";
import { localeName, useI18n } from "../i18n";
import { getCanonicalFamilyLabel, getCanonicalStageLabel } from "../i18n/canonical-label-registry";
import type { Agent, Department, SubAgent, SubTask, Task, WorkflowPackKey } from "../types";
import AgentAvatar from "./AgentAvatar";
import AgentDetailTabContent from "./agent-detail/AgentDetailTabContent";
import { CLI_LABELS, oauthAccountLabel, STATUS_CONFIG, statusLabel } from "./agent-detail/constants";

interface AgentDetailProps {
  agent: Agent;
  agents: Agent[];
  department: Department | undefined;
  departments: Department[];
  tasks: Task[];
  subAgents: SubAgent[];
  subtasks: SubTask[];
  activeOfficeWorkflowPack: WorkflowPackKey;
  onClose: () => void;
  onChat: (agent: Agent) => void;
  onAssignTask: (agentId: string) => void;
  onOpenTerminal?: (taskId: string) => void;
  onAgentUpdated?: () => void;
}

const CLI_POOL_PROVIDERS: Agent["cli_provider"][] = ["codex", "gemini", "jules"];

export default function AgentDetail({
  agent,
  agents,
  department,
  departments,
  tasks,
  subAgents,
  subtasks,
  activeOfficeWorkflowPack: _activeOfficeWorkflowPack,
  onClose,
  onChat,
  onAssignTask,
  onOpenTerminal,
  onAgentUpdated,
}: AgentDetailProps) {
  const { t, language } = useI18n();
  const [tab, setTab] = useState<"info" | "tasks" | "alba">("info");
  const [editingCli, setEditingCli] = useState(false);
  const [selectedCli, setSelectedCli] = useState(agent.cli_provider);
  const [selectedOAuthAccountId, setSelectedOAuthAccountId] = useState(agent.oauth_account_id ?? "");
  const [selectedCliAccountPoolId, setSelectedCliAccountPoolId] = useState(agent.cli_account_pool_id ?? "");
  const [cliAccountPools, setCliAccountPools] = useState<CliAccountPoolView[]>([]);
  const [cliAccountPoolsLoading, setCliAccountPoolsLoading] = useState(false);
  const [savingCli, setSavingCli] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const agentTasks = tasks.filter((task) => task.assigned_agent_id === agent.id);
  const agentSubAgents = subAgents.filter((subAgent) => subAgent.parentAgentId === agent.id);
  const subtasksByTask = useMemo(() => {
    const grouped: Record<string, SubTask[]> = {};
    for (const subtask of subtasks) {
      if (!grouped[subtask.task_id]) grouped[subtask.task_id] = [];
      grouped[subtask.task_id].push(subtask);
    }
    return grouped;
  }, [subtasks]);

  const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;
  const oauthProviderKey =
    selectedCli === "copilot" ? "github-copilot" : selectedCli === "antigravity" ? "antigravity" : null;
  const requiresOAuthAccount = selectedCli === "copilot" || selectedCli === "antigravity";
  const requiresCliPool = CLI_POOL_PROVIDERS.includes(selectedCli);

  const activeOAuthAccounts = useMemo(() => {
    if (!oauthProviderKey || !oauthStatus) return [];
    return (oauthStatus.providers[oauthProviderKey]?.accounts ?? []).filter(
      (account) => account.active && account.status === "active",
    );
  }, [oauthProviderKey, oauthStatus]);

  const selectedCliAccountPools = useMemo(
    () => cliAccountPools.filter((pool) => pool.provider === selectedCli),
    [cliAccountPools, selectedCli],
  );
  const canonicalSummary = useMemo(() => {
    const summaryParts: string[] = [];
    summaryParts.push(
      department
        ? localeName(language, department)
        : t({ ko: "미지정 부서", en: "Unassigned", ja: "Unassigned", zh: "Unassigned" }),
    );
    if (agent.family) summaryParts.push(getCanonicalFamilyLabel(agent.family, language));
    if (agent.career_stage) summaryParts.push(getCanonicalStageLabel(agent.career_stage, language));
    if (!agent.family && !agent.career_stage) summaryParts.push(getRoleDisplayLabel(agent.role, language));
    return summaryParts.join(" · ");
  }, [agent.career_stage, agent.family, agent.role, department, language, t]);
  const canSaveCli =
    (!requiresOAuthAccount || Boolean(selectedOAuthAccountId)) &&
    (!requiresCliPool || Boolean(selectedCliAccountPoolId));

  const cliSummaryText = useMemo(() => {
    const providerLabel = CLI_LABELS[agent.cli_provider] ?? agent.cli_provider;
    if (CLI_POOL_PROVIDERS.includes(agent.cli_provider) && agent.cli_account_pool_id) {
      return `${providerLabel} · ${agent.cli_account_pool_id}`;
    }
    if (agent.cli_provider === "api" && agent.api_model) {
      return `${providerLabel} · ${agent.api_model}`;
    }
    return providerLabel;
  }, [agent.api_model, agent.cli_account_pool_id, agent.cli_provider]);

  useEffect(() => {
    setSelectedCli(agent.cli_provider);
    setSelectedOAuthAccountId(agent.oauth_account_id ?? "");
    setSelectedCliAccountPoolId(agent.cli_account_pool_id ?? "");
  }, [agent]);

  useEffect(() => {
    if (!editingCli || !requiresOAuthAccount) return;
    setOauthLoading(true);
    api
      .getOAuthDebugStatus()
      .then(setOauthStatus)
      .catch((err) => console.error("Failed to load OAuth status:", err))
      .finally(() => setOauthLoading(false));
  }, [editingCli, requiresOAuthAccount]);

  useEffect(() => {
    if (!editingCli && !CLI_POOL_PROVIDERS.includes(agent.cli_provider)) return;
    if (editingCli && !requiresCliPool) return;
    let cancelled = false;
    setCliAccountPoolsLoading(true);
    api
      .getCliAccountPools()
      .then((pools) => {
        if (!cancelled) setCliAccountPools(pools);
      })
      .catch((err) => console.error("Failed to load CLI account pools:", err))
      .finally(() => {
        if (!cancelled) setCliAccountPoolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editingCli, selectedCli, agent.cli_provider, requiresCliPool]);

  useEffect(() => {
    if (!requiresOAuthAccount) {
      if (selectedOAuthAccountId) setSelectedOAuthAccountId("");
      return;
    }
    if (activeOAuthAccounts.length === 0) return;
    if (!selectedOAuthAccountId || !activeOAuthAccounts.some((account) => account.id === selectedOAuthAccountId)) {
      setSelectedOAuthAccountId(activeOAuthAccounts[0].id);
    }
  }, [requiresOAuthAccount, activeOAuthAccounts, selectedOAuthAccountId]);

  useEffect(() => {
    if (!requiresCliPool) {
      if (selectedCliAccountPoolId) setSelectedCliAccountPoolId("");
      return;
    }
    if (selectedCliAccountPools.length === 0) return;
    const exists = selectedCliAccountPools.some((pool) => pool.accountPoolId === selectedCliAccountPoolId);
    if (!exists) setSelectedCliAccountPoolId(selectedCliAccountPools[0].accountPoolId);
  }, [requiresCliPool, selectedCliAccountPoolId, selectedCliAccountPools]);

  const handleSaveCli = useCallback(async () => {
    setSavingCli(true);
    try {
      await api.updateAgent(agent.id, {
        cli_provider: selectedCli,
        oauth_account_id: requiresOAuthAccount ? selectedOAuthAccountId || null : null,
        cli_model: null,
        cli_reasoning_level: null,
        run_mode: "standard",
        cli_account_pool_id: requiresCliPool
          ? selectedCliAccountPoolId || selectedCliAccountPools[0]?.accountPoolId || null
          : null,
      });
      onAgentUpdated?.();
      setEditingCli(false);
    } catch (error) {
      console.error("Failed to update CLI:", error);
    } finally {
      setSavingCli(false);
    }
  }, [
    agent.id,
    onAgentUpdated,
    requiresCliPool,
    requiresOAuthAccount,
    selectedCli,
    selectedCliAccountPoolId,
    selectedCliAccountPools,
    selectedOAuthAccountId,
  ]);

  const handleCancelCliEdit = useCallback(() => {
    setEditingCli(false);
    setSelectedCli(agent.cli_provider);
    setSelectedOAuthAccountId(agent.oauth_account_id ?? "");
    setSelectedCliAccountPoolId(agent.cli_account_pool_id ?? "");
  }, [agent.cli_account_pool_id, agent.cli_provider, agent.oauth_account_id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="w-[min(1280px,96vw)] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div
          className="relative border-b border-slate-700 px-6 py-5"
          style={{ background: department ? `linear-gradient(135deg, ${department.color}22, transparent)` : undefined }}
        >
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-700/50 text-slate-400 transition-colors hover:bg-slate-600 hover:text-white"
          >
            ×
          </button>
          <div className="flex items-center gap-4">
            <div className="relative">
              <AgentAvatar
                agent={agent}
                agents={agents}
                size={64}
                rounded="2xl"
                className={agent.status === "working" ? "animate-agent-work" : ""}
              />
              <div
                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-slate-800 ${agent.status === "working" ? "bg-blue-500" : agent.status === "idle" ? "bg-green-500" : agent.status === "break" ? "bg-yellow-500" : "bg-slate-500"}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-bold text-white">{localeName(language, agent)}</h2>
                <span className={`rounded px-1.5 py-0.5 text-xs ${statusCfg.bg} ${statusCfg.color}`}>
                  {statusLabel(statusCfg.label, t)}
                </span>
              </div>
              <div className="mt-0.5 text-sm text-slate-400">{canonicalSummary}</div>
              <div className="mt-1 text-xs text-slate-500">
                {editingCli ? (
                  <div className="space-y-2 rounded-lg border border-slate-700/70 bg-slate-800/60 p-3">
                    <div className="text-[11px] text-slate-400">
                      {t({
                        ko: "모델 선택은 Provider 정책에서 결정됩니다. 여기서는 실행 Provider와 실행 계정만 바꿉니다.",
                        en: "Model selection is controlled by provider policy. Only provider and execution account are editable here.",
                        ja: "Model selection is controlled by provider policy. Only provider and execution account are editable here.",
                        zh: "Model selection is controlled by provider policy. Only provider and execution account are editable here.",
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={selectedCli}
                        onChange={(event) => {
                          const nextCli = event.target.value as Agent["cli_provider"];
                          setSelectedCli(nextCli);
                          setSelectedCliAccountPoolId("");
                          setSelectedOAuthAccountId("");
                        }}
                        className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                      >
                        {Object.entries(CLI_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {requiresOAuthAccount &&
                        (oauthLoading ? (
                          <span className="text-[10px] text-slate-400">
                            {t({
                              ko: "계정 불러오는 중...",
                              en: "Loading accounts...",
                              ja: "Loading accounts...",
                              zh: "Loading accounts...",
                            })}
                          </span>
                        ) : activeOAuthAccounts.length > 0 ? (
                          <select
                            value={selectedOAuthAccountId}
                            onChange={(event) => setSelectedOAuthAccountId(event.target.value)}
                            className="max-w-[220px] rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                          >
                            {activeOAuthAccounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {oauthAccountLabel(account)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[10px] text-amber-300">
                            {t({
                              ko: "활성 OAuth 계정 없음",
                              en: "No active OAuth account",
                              ja: "No active OAuth account",
                              zh: "No active OAuth account",
                            })}
                          </span>
                        ))}
                      {requiresCliPool &&
                        (cliAccountPoolsLoading ? (
                          <span className="text-[10px] text-slate-400">
                            {t({
                              ko: "계정 풀 불러오는 중...",
                              en: "Loading pools...",
                              ja: "Loading pools...",
                              zh: "Loading pools...",
                            })}
                          </span>
                        ) : (
                          <select
                            value={selectedCliAccountPoolId}
                            onChange={(event) => setSelectedCliAccountPoolId(event.target.value)}
                            className="max-w-[220px] rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                          >
                            <option value="">
                              {t({
                                ko: "실행 계정 풀 선택",
                                en: "Select execution pool",
                                ja: "Select execution pool",
                                zh: "Select execution pool",
                              })}
                            </option>
                            {selectedCliAccountPools.map((pool) => (
                              <option key={pool.accountPoolId} value={pool.accountPoolId}>
                                {pool.label}
                              </option>
                            ))}
                          </select>
                        ))}
                      <button
                        disabled={savingCli || !canSaveCli}
                        onClick={() => {
                          void handleSaveCli();
                        }}
                        className="rounded bg-blue-600 px-2 py-1 text-[10px] text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                      >
                        {savingCli ? "..." : t({ ko: "저장", en: "Save", ja: "Save", zh: "Save" })}
                      </button>
                      <button
                        onClick={handleCancelCliEdit}
                        className="rounded bg-slate-600 px-2 py-1 text-[10px] text-slate-300 transition-colors hover:bg-slate-500"
                      >
                        {t({ ko: "취소", en: "Cancel", ja: "Cancel", zh: "Cancel" })}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingCli(true)}
                    className="transition-colors hover:text-slate-300"
                    title={t({
                      ko: "CLI 실행 설정 변경",
                      en: "Change CLI execution settings",
                      ja: "Change CLI execution settings",
                      zh: "Change CLI execution settings",
                    })}
                  >
                    {cliSummaryText}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs font-bold text-yellow-400">Lv.{Math.floor(agent.stats_xp / 100) + 1}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-400"
                style={{ width: `${agent.stats_xp % 100}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500">{agent.stats_xp} XP</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
            <div className="rounded-md border border-slate-700/70 bg-slate-800/60 px-2 py-1.5 text-slate-200">
              <div className="text-[10px] text-slate-400">{t({ ko: "직급", en: "Role", ja: "Role", zh: "Role" })}</div>
              <div className="mt-0.5 font-semibold">{getRoleDisplayLabel(agent.role, language)}</div>
            </div>
            <div className="rounded-md border border-slate-700/70 bg-slate-800/60 px-2 py-1.5 text-slate-200">
              <div className="text-[10px] text-slate-400">
                {t({ ko: "부서", en: "Department", ja: "Department", zh: "Department" })}
              </div>
              <div className="mt-0.5 font-semibold">
                {department
                  ? localeName(language, department)
                  : t({ ko: "미지정", en: "Unassigned", ja: "Unassigned", zh: "Unassigned" })}
              </div>
            </div>
            <div className="rounded-md border border-slate-700/70 bg-slate-800/60 px-2 py-1.5 text-slate-200">
              <div className="text-[10px] text-slate-400">
                {t({ ko: "능력군", en: "Family", ja: "Family", zh: "Family" })}
              </div>
              <div className="mt-0.5 font-semibold">
                {agent.family ? getCanonicalFamilyLabel(agent.family, language) : "-"}
              </div>
            </div>
            <div className="rounded-md border border-slate-700/70 bg-slate-800/60 px-2 py-1.5 text-slate-200">
              <div className="text-[10px] text-slate-400">
                {t({ ko: "커리어 단계", en: "Stage", ja: "Stage", zh: "Stage" })}
              </div>
              <div className="mt-0.5 font-semibold">
                {agent.career_stage ? getCanonicalStageLabel(agent.career_stage, language) : "-"}
              </div>
            </div>
            <div className="rounded-md border border-slate-700/70 bg-slate-800/60 px-2 py-1.5 text-slate-200">
              <div className="text-[10px] text-slate-400">
                {t({ ko: "권한", en: "Authority", ja: "Authority", zh: "Authority" })}
              </div>
              <div className="mt-0.5 font-semibold">A{agent.authority_level ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-700">
          {[
            { key: "info", label: t({ ko: "정보", en: "Info", ja: "Info", zh: "Info" }) },
            {
              key: "tasks",
              label: `${t({ ko: "작업", en: "Tasks", ja: "Tasks", zh: "Tasks" })} (${agentTasks.length})`,
            },
            {
              key: "alba",
              label: `${t({ ko: "서브에이전트", en: "Sub-agents", ja: "Sub-agents", zh: "Sub-agents" })} (${agentSubAgents.length})`,
            },
          ].map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key as typeof tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === tabItem.key ? "border-b-2 border-blue-400 text-blue-400" : "text-slate-400 hover:text-slate-200"}`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        <div className="max-h-[40vh] overflow-y-auto p-4">
          <AgentDetailTabContent
            tab={tab}
            t={t}
            language={language}
            agent={agent}
            departments={departments}
            agentTasks={agentTasks}
            agentSubAgents={agentSubAgents}
            subtasksByTask={subtasksByTask}
            expandedTaskId={expandedTaskId}
            setExpandedTaskId={setExpandedTaskId}
            onChat={onChat}
            onAssignTask={onAssignTask}
            onOpenTerminal={onOpenTerminal}
          />
        </div>
      </div>
    </div>
  );
}
