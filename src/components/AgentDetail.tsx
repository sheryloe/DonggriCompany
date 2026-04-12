import { useCallback, useEffect, useMemo, useState } from "react";
import type { CliAccountPoolView, OAuthStatus } from "../api";
import * as api from "../api";
import { localeName, useI18n } from "../i18n";
import type {
  Agent,
  AgentRunMode,
  CliModelInfo,
  Department,
  SubAgent,
  SubTask,
  Task,
  WorkflowPackKey,
} from "../types";
import {
  getCodexReasoningOptions,
  isCodexPlanModeEligible,
  normalizeCodexRunMode,
  resolveCodexReasoningLevel,
} from "../utils/codex-execution";
import AgentAvatar from "./AgentAvatar";
import AgentDetailTabContent from "./agent-detail/AgentDetailTabContent";
import { CLI_LABELS, oauthAccountLabel, roleLabel, STATUS_CONFIG, statusLabel } from "./agent-detail/constants";

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

const CLI_MODEL_OVERRIDE_PROVIDERS: Agent["cli_provider"][] = ["claude", "codex", "gemini", "opencode", "kimi"];
const CLI_POOL_PROVIDERS: Agent["cli_provider"][] = ["codex", "gemini", "jules"];

export default function AgentDetail({
  agent,
  agents,
  department,
  departments,
  tasks,
  subAgents,
  subtasks,
  activeOfficeWorkflowPack,
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
  const [selectedApiProviderId, setSelectedApiProviderId] = useState(agent.api_provider_id ?? "");
  const [selectedApiModel, setSelectedApiModel] = useState(agent.api_model ?? "");
  const [selectedCliModel, setSelectedCliModel] = useState(agent.cli_model ?? "");
  const [selectedCliReasoningLevel, setSelectedCliReasoningLevel] = useState(agent.cli_reasoning_level ?? "");
  const [selectedRunMode, setSelectedRunMode] = useState<AgentRunMode>(agent.run_mode === "plan" ? "plan" : "standard");
  const [selectedCliAccountPoolId, setSelectedCliAccountPoolId] = useState(agent.cli_account_pool_id ?? "");
  const [cliAccountPools, setCliAccountPools] = useState<CliAccountPoolView[]>([]);
  const [cliAccountPoolsLoading, setCliAccountPoolsLoading] = useState(false);
  const [savingCli, setSavingCli] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [cliModels, setCliModels] = useState<Record<string, CliModelInfo[]>>({});
  const [cliModelsLoading, setCliModelsLoading] = useState(false);
  const [cliModelsLoaded, setCliModelsLoaded] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [savingPlanningLead, setSavingPlanningLead] = useState(false);
  const [actsAsPlanningLead, setActsAsPlanningLead] = useState(Number(agent.acts_as_planning_leader ?? 0) === 1);

  const agentTasks = tasks.filter((task) => task.assigned_agent_id === agent.id);
  const subtasksByTask = useMemo(() => {
    const grouped: Record<string, SubTask[]> = {};
    for (const subtask of subtasks) {
      if (!grouped[subtask.task_id]) grouped[subtask.task_id] = [];
      grouped[subtask.task_id].push(subtask);
    }
    return grouped;
  }, [subtasks]);
  const agentSubAgents = subAgents.filter((subAgent) => subAgent.parentAgentId === agent.id);
  const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;
  const oauthProviderKey =
    selectedCli === "copilot" ? "github-copilot" : selectedCli === "antigravity" ? "antigravity" : null;
  const activeOAuthAccounts = useMemo(() => {
    if (!oauthProviderKey || !oauthStatus) return [];
    return (oauthStatus.providers[oauthProviderKey]?.accounts ?? []).filter(
      (account) => account.active && account.status === "active",
    );
  }, [oauthProviderKey, oauthStatus]);
  const requiresOAuthAccount = selectedCli === "copilot" || selectedCli === "antigravity";
  const requiresApiProvider = selectedCli === "api";
  const requiresCliPool = CLI_POOL_PROVIDERS.includes(selectedCli);
  const supportsCliModelOverride = CLI_MODEL_OVERRIDE_PROVIDERS.includes(selectedCli);
  const selectedCliModelOptions = useMemo(() => cliModels[selectedCli] ?? [], [cliModels, selectedCli]);
  const selectedCliModelInfo = useMemo(
    () => selectedCliModelOptions.find((model) => model.slug === selectedCliModel) ?? null,
    [selectedCliModel, selectedCliModelOptions],
  );
  const selectedCliReasoningOptions = useMemo(
    () => (selectedCli === "codex" ? getCodexReasoningOptions(selectedCliModelInfo) : []),
    [selectedCli, selectedCliModelInfo],
  );
  const selectedCliAccountPools = useMemo(
    () => cliAccountPools.filter((pool) => pool.provider === selectedCli),
    [cliAccountPools, selectedCli],
  );
  const poolLabelCountsByProvider = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const pool of cliAccountPools) {
      const base = String(pool.label || pool.accountPoolId).trim() || pool.accountPoolId;
      const provider = String(pool.provider || "").trim();
      if (!provider) continue;
      const providerCounts = map.get(provider) ?? new Map<string, number>();
      providerCounts.set(base, (providerCounts.get(base) ?? 0) + 1);
      map.set(provider, providerCounts);
    }
    return map;
  }, [cliAccountPools]);
  const formatPoolLabel = useCallback(
    (pool: CliAccountPoolView) => {
      const base = String(pool.label || pool.accountPoolId).trim() || pool.accountPoolId;
      const providerCounts = poolLabelCountsByProvider.get(String(pool.provider || "").trim());
      return (providerCounts?.get(base) ?? 0) > 1 ? `${base} (${pool.accountPoolId})` : base;
    },
    [poolLabelCountsByProvider],
  );
  const poolSummaryLabel = useMemo(() => {
    const fallback = t({
      ko: "Pool 미지정",
      en: "Pool not set",
      ja: "Pool not set",
      zh: "Pool not set",
    });
    if (!CLI_POOL_PROVIDERS.includes(agent.cli_provider)) return fallback;
    const poolId = String(agent.cli_account_pool_id ?? "").trim();
    if (!poolId) return fallback;
    const matched = cliAccountPools.find(
      (pool) => pool.provider === agent.cli_provider && pool.accountPoolId === poolId,
    );
    return matched ? formatPoolLabel(matched) : poolId;
  }, [agent.cli_account_pool_id, agent.cli_provider, cliAccountPools, formatPoolLabel, t]);
  const legacyCliSummaryText = useMemo(() => {
    if (agent.cli_provider === "api" && agent.api_model) {
      return `API: ${agent.api_model}`;
    }
    if (CLI_POOL_PROVIDERS.includes(agent.cli_provider)) {
      const providerLabel = CLI_LABELS[agent.cli_provider] ?? agent.cli_provider;
      return `${providerLabel} · ${poolSummaryLabel}`;
    }
    const providerLabel = CLI_LABELS[agent.cli_provider] ?? agent.cli_provider;
    if (agent.cli_model && CLI_MODEL_OVERRIDE_PROVIDERS.includes(agent.cli_provider) && agent.cli_provider !== "api") {
      return `${providerLabel} · ${agent.cli_model}`;
    }
    return providerLabel;
  }, [agent.api_model, agent.cli_model, agent.cli_provider, poolSummaryLabel]);
  const cliSummaryText = useMemo(() => {
    if (agent.cli_provider !== "codex") return legacyCliSummaryText;
    const providerLabel = CLI_LABELS[agent.cli_provider] ?? agent.cli_provider;
    const parts = [providerLabel];
    if (agent.cli_model) parts.push(agent.cli_model);
    if (agent.run_mode === "plan") parts.push("Plan");
    if (agent.cli_account_pool_id) parts.push(poolSummaryLabel);
    return parts.join(" · ");
  }, [
    agent.cli_account_pool_id,
    agent.cli_model,
    agent.cli_provider,
    agent.run_mode,
    legacyCliSummaryText,
    poolSummaryLabel,
  ]);
  const canSaveCli =
    (requiresApiProvider ? false : !requiresOAuthAccount || Boolean(selectedOAuthAccountId)) &&
    (!requiresCliPool || Boolean(selectedCliAccountPoolId));

  const xpLevel = Math.floor(agent.stats_xp / 100) + 1;
  const xpProgress = agent.stats_xp % 100;

  useEffect(() => {
    setSelectedCli(agent.cli_provider);
    setSelectedOAuthAccountId(agent.oauth_account_id ?? "");
    setSelectedApiProviderId(agent.api_provider_id ?? "");
    setSelectedApiModel(agent.api_model ?? "");
    setSelectedCliModel(agent.cli_model ?? "");
    setSelectedCliReasoningLevel(agent.cli_reasoning_level ?? "");
    setSelectedRunMode(agent.run_mode === "plan" ? "plan" : "standard");
    setSelectedCliAccountPoolId(agent.cli_account_pool_id ?? "");
    setActsAsPlanningLead(Number(agent.acts_as_planning_leader ?? 0) === 1);
  }, [
    agent.id,
    agent.cli_provider,
    agent.oauth_account_id,
    agent.api_provider_id,
    agent.api_model,
    agent.cli_model,
    agent.cli_reasoning_level,
    agent.run_mode,
    agent.cli_account_pool_id,
    agent.acts_as_planning_leader,
  ]);

  useEffect(() => {
    if (!editingCli || !requiresOAuthAccount) return;
    setOauthLoading(true);
    api
      .getOAuthStatus()
      .then(setOauthStatus)
      .catch((err) => console.error("Failed to load OAuth status:", err))
      .finally(() => setOauthLoading(false));
  }, [editingCli, requiresOAuthAccount]);

  useEffect(() => {
    if (!editingCli || !supportsCliModelOverride || cliModelsLoaded) return;
    let cancelled = false;
    setCliModelsLoading(true);
    api
      .getCliModels()
      .then((models) => {
        if (cancelled) return;
        setCliModels(models);
      })
      .catch((err) => console.error("Failed to load CLI models:", err))
      .finally(() => {
        if (!cancelled) {
          setCliModelsLoading(false);
          setCliModelsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editingCli, supportsCliModelOverride, cliModelsLoaded]);

  useEffect(() => {
    if (!editingCli && !CLI_POOL_PROVIDERS.includes(agent.cli_provider)) return;
    if (editingCli && !requiresCliPool) return;
    let cancelled = false;
    setCliAccountPoolsLoading(true);
    api
      .getCliAccountPools()
      .then((pools) => {
        if (cancelled) return;
        setCliAccountPools(pools);
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
    if (!supportsCliModelOverride && selectedCliModel) {
      setSelectedCliModel("");
    }
  }, [supportsCliModelOverride, selectedCliModel]);

  useEffect(() => {
    if (selectedCli === "codex") return;
    if (selectedCliReasoningLevel) setSelectedCliReasoningLevel("");
    if (selectedRunMode !== "standard") setSelectedRunMode("standard");
  }, [selectedCli, selectedCliReasoningLevel, selectedRunMode]);

  useEffect(() => {
    if (selectedCli !== "codex") return;
    const trimmedModel = selectedCliModel.trim();
    if (!trimmedModel) {
      if (selectedCliReasoningLevel) setSelectedCliReasoningLevel("");
      if (selectedRunMode !== "standard") setSelectedRunMode("standard");
      return;
    }

    const nextReasoningLevel = resolveCodexReasoningLevel(selectedCliModelInfo, selectedCliReasoningLevel);
    if (nextReasoningLevel !== selectedCliReasoningLevel) {
      setSelectedCliReasoningLevel(nextReasoningLevel);
    }
    const nextRunMode = normalizeCodexRunMode(selectedCli, trimmedModel, selectedRunMode);
    if (nextRunMode !== selectedRunMode) {
      setSelectedRunMode(nextRunMode);
    }
  }, [
    selectedCli,
    selectedCliModel,
    selectedCliModelInfo,
    selectedCliReasoningLevel,
    selectedRunMode,
  ]);

  useEffect(() => {
    if (!requiresCliPool) {
      if (selectedCliAccountPoolId) setSelectedCliAccountPoolId("");
      return;
    }
    if (selectedCliAccountPools.length === 0) return;
    const exists = selectedCliAccountPools.some((pool) => pool.accountPoolId === selectedCliAccountPoolId);
    if (exists) return;
    setSelectedCliAccountPoolId(selectedCliAccountPools[0].accountPoolId);
  }, [requiresCliPool, selectedCliAccountPoolId, selectedCliAccountPools]);

  const handleSaveCli = useCallback(async () => {
    setSavingCli(true);
    try {
      await api.updateAgent(agent.id, {
        cli_provider: selectedCli,
        oauth_account_id: requiresOAuthAccount ? selectedOAuthAccountId || null : null,
        api_provider_id: requiresApiProvider ? selectedApiProviderId || null : null,
        api_model: requiresApiProvider ? selectedApiModel || null : null,
        cli_model:
          selectedCli === "codex" ? selectedCliModel.trim() || null : supportsCliModelOverride ? selectedCliModel || null : null,
        cli_reasoning_level:
          selectedCli === "codex" && selectedCliModel.trim()
            ? selectedCliReasoningLevel || resolveCodexReasoningLevel(selectedCliModelInfo, null) || null
            : null,
        run_mode: normalizeCodexRunMode(selectedCli, selectedCliModel, selectedRunMode),
        cli_account_pool_id:
          requiresCliPool ? selectedCliAccountPoolId || selectedCliAccountPools[0]?.accountPoolId || null : null,
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
    selectedCli,
    requiresOAuthAccount,
    selectedOAuthAccountId,
    requiresApiProvider,
    selectedApiProviderId,
    selectedApiModel,
    supportsCliModelOverride,
    selectedCliModel,
    selectedCliReasoningLevel,
    selectedCliModelInfo,
    requiresCliPool,
    selectedCliAccountPoolId,
    selectedCliAccountPools,
    selectedRunMode,
    onAgentUpdated,
  ]);

  const handleCancelCliEdit = useCallback(() => {
    setEditingCli(false);
    setSelectedCli(agent.cli_provider);
    setSelectedOAuthAccountId(agent.oauth_account_id ?? "");
    setSelectedApiProviderId(agent.api_provider_id ?? "");
    setSelectedApiModel(agent.api_model ?? "");
    setSelectedCliModel(agent.cli_model ?? "");
    setSelectedCliReasoningLevel(agent.cli_reasoning_level ?? "");
    setSelectedRunMode(agent.run_mode === "plan" ? "plan" : "standard");
    setSelectedCliAccountPoolId(agent.cli_account_pool_id ?? "");
  }, [
    agent.cli_provider,
    agent.oauth_account_id,
    agent.api_provider_id,
    agent.api_model,
    agent.cli_model,
    agent.cli_reasoning_level,
    agent.run_mode,
    agent.cli_account_pool_id,
  ]);

  const resolvePackLabel = useCallback(
    (packKey: WorkflowPackKey) => {
      switch (packKey) {
        case "development":
          return t({ ko: "개발", en: "Development", ja: "開発", zh: "开发" });
        case "novel":
          return t({ ko: "소설", en: "Novel", ja: "小説", zh: "小说" });
        case "report":
          return t({ ko: "리포트", en: "Report", ja: "レポート", zh: "报告" });
        case "video_preprod":
          return t({ ko: "영상 프리프로덕션", en: "Video Pre-production", ja: "動画プリプロ", zh: "视频前期" });
        case "web_research_report":
          return t({ ko: "웹 리서치 리포트", en: "Web Research Report", ja: "Webリサーチ", zh: "网页调研报告" });
        case "roleplay":
          return t({ ko: "역할놀이", en: "Roleplay", ja: "ロールプレイ", zh: "角色扮演" });
        default:
          return packKey;
      }
    },
    [t],
  );

  const handlePlanningLeadToggle = useCallback(
    async (nextChecked: boolean) => {
      if (agent.role !== "team_leader" || savingPlanningLead) return;
      const previous = actsAsPlanningLead;
      setActsAsPlanningLead(nextChecked);
      setSavingPlanningLead(true);

      try {
        await api.updateAgent(agent.id, {
          acts_as_planning_leader: nextChecked ? 1 : 0,
          workflow_pack_key: activeOfficeWorkflowPack,
        });
        onAgentUpdated?.();
      } catch (error) {
        if (
          nextChecked &&
          api.isApiRequestError(error) &&
          error.status === 409 &&
          error.code === "planning_leader_exists"
        ) {
          const details = (error.details ?? {}) as {
            existing_leader?: { name?: string | null; name_ko?: string | null };
            pack_key?: WorkflowPackKey | null;
          };
          const existingLeaderName = String(
            details.existing_leader?.name_ko ||
              details.existing_leader?.name ||
              t({ ko: "기존 리더", en: "current leader" }),
          ).trim();
          const packKey = details.pack_key ?? activeOfficeWorkflowPack;
          const packLabel = resolvePackLabel(packKey);
          const confirmed = window.confirm(
            t({
              ko: `이미 ${existingLeaderName}가 ${packLabel} 오피스팩의 리더입니다. 변경하시겠습니까?`,
              en: `${existingLeaderName} is already the leader for the ${packLabel} office pack. Change leader?`,
              ja: `${existingLeaderName}さんが既に${packLabel}オフィスパックのリーダーです。変更しますか？`,
              zh: `${existingLeaderName} 已是 ${packLabel} 办公包负责人。要变更吗？`,
            }),
          );
          if (confirmed) {
            try {
              await api.updateAgent(agent.id, {
                acts_as_planning_leader: 1,
                workflow_pack_key: activeOfficeWorkflowPack,
                force_planning_leader_override: true,
              });
              onAgentUpdated?.();
              return;
            } catch (overrideError) {
              console.error("Failed to override planning lead:", overrideError);
            }
          }
        } else {
          console.error("Failed to update planning lead:", error);
        }
        setActsAsPlanningLead(previous);
      } finally {
        setSavingPlanningLead(false);
      }
    },
    [
      activeOfficeWorkflowPack,
      agent.id,
      agent.role,
      actsAsPlanningLead,
      onAgentUpdated,
      resolvePackLabel,
      savingPlanningLead,
      t,
    ],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[calc(100vw-1.5rem)] max-w-[480px] max-h-[85vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl">
        <div
          className="relative px-6 py-5 border-b border-slate-700"
          style={{
            background: department ? `linear-gradient(135deg, ${department.color}22, transparent)` : undefined,
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-700/50 hover:bg-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            ✕
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
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-800 ${
                  agent.status === "working"
                    ? "bg-blue-500"
                    : agent.status === "idle"
                      ? "bg-green-500"
                      : agent.status === "break"
                        ? "bg-yellow-500"
                        : "bg-slate-500"
                }`}
              />
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{localeName(language, agent)}</h2>
                <span className={`text-xs px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color}`}>
                  {statusLabel(statusCfg.label, t)}
                </span>
              </div>
              <div className="text-sm text-slate-400 mt-0.5">
                {department?.icon} {department ? localeName(language, department) : ""} · {roleLabel(agent.role, t)}
              </div>
              {agent.role === "team_leader" && (
                <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={actsAsPlanningLead}
                    disabled={savingPlanningLead}
                    onChange={(event) => {
                      void handlePlanningLeadToggle(event.target.checked);
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/50 disabled:opacity-60"
                  />
                  <span>
                    {t({
                      ko: "Lead (기획 리더)",
                      en: "Lead (Planning lead)",
                      ja: "Lead（企画リード）",
                      zh: "Lead（企划负责人）",
                    })}
                  </span>
                  {savingPlanningLead && (
                    <span className="text-[10px] text-slate-400">
                      {t({ ko: "저장중...", en: "Saving...", ja: "保存中...", zh: "保存中..." })}
                    </span>
                  )}
                </label>
              )}
              <div className="text-xs text-slate-500 mt-0.5">
                {editingCli ? (
                  requiresCliPool ? (
                    <div className="space-y-1">
                      <div className="flex w-full min-w-0 items-center gap-1 pb-0.5">
                        <span className="shrink-0">🔧</span>
                        <select
                          value={selectedCli}
                          onChange={(event) => {
                            const nextCli = event.target.value as Agent["cli_provider"];
                            setSelectedCli(nextCli);
                            setSelectedCliModel("");
                            setSelectedCliReasoningLevel("");
                            setSelectedRunMode("standard");
                            setSelectedCliAccountPoolId("");
                          }}
                          className="w-[94px] shrink-0 bg-slate-700 text-slate-200 text-xs rounded px-1 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500"
                        >
                          {Object.entries(CLI_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {cliAccountPoolsLoading ? (
                          <span className="text-[10px] text-slate-400">
                            {t({
                              ko: "계정풀 로딩...",
                              en: "Loading pools...",
                              ja: "Loading pools...",
                              zh: "Loading pools...",
                            })}
                          </span>
                        ) : (
                          <select
                            value={selectedCliAccountPoolId}
                            onChange={(event) => setSelectedCliAccountPoolId(event.target.value)}
                            className="w-0 min-w-0 flex-1 bg-slate-700 text-slate-200 text-xs rounded px-1 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500"
                            disabled={selectedCliAccountPools.length === 0}
                          >
                            {selectedCliAccountPools.length === 0 ? (
                              <option value="">
                                {t({
                                  ko: "연결된 계정풀 없음",
                                  en: "No connected account pool",
                                  ja: "No connected account pool",
                                  zh: "No connected account pool",
                                })}
                              </option>
                            ) : (
                              selectedCliAccountPools.map((pool) => (
                                <option key={pool.id} value={pool.accountPoolId}>
                                  {formatPoolLabel(pool)}
                                </option>
                              ))
                            )}
                          </select>
                        )}
                      </div>
                      {selectedCli === "codex" && (
                        <div className="flex flex-wrap items-center gap-1 pb-0.5">
                          {cliModelsLoading ? (
                            <span className="text-[10px] text-slate-400">
                              {t({
                                ko: "모델 로딩 중...",
                                en: "Loading models...",
                                ja: "Loading models...",
                                zh: "Loading models...",
                              })}
                            </span>
                          ) : selectedCliModelOptions.length > 0 ? (
                            <>
                              <select
                                aria-label="Codex model"
                                value={selectedCliModel}
                                onChange={(event) => {
                                  const nextModel = event.target.value;
                                  const nextModelInfo =
                                    selectedCliModelOptions.find((model) => model.slug === nextModel) ?? null;
                                  setSelectedCliModel(nextModel);
                                  setSelectedCliReasoningLevel(
                                    nextModel ? resolveCodexReasoningLevel(nextModelInfo, selectedCliReasoningLevel) : "",
                                  );
                                  setSelectedRunMode(nextModel ? normalizeCodexRunMode("codex", nextModel, selectedRunMode) : "standard");
                                }}
                                className="w-[180px] max-w-full bg-slate-700 text-slate-200 text-xs rounded px-1 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500"
                              >
                                <option value="">
                                  {t({
                                    ko: "Codex 모델 선택",
                                    en: "Select Codex model",
                                    ja: "Select Codex model",
                                    zh: "Select Codex model",
                                  })}
                                </option>
                                {selectedCliModelOptions.map((model) => (
                                  <option key={model.slug} value={model.slug}>
                                    {model.displayName || model.slug}
                                  </option>
                                ))}
                              </select>
                              {selectedCliModel.trim() ? (
                                <>
                                  <select
                                    aria-label="Codex reasoning level"
                                    value={selectedCliReasoningLevel}
                                    onChange={(event) => setSelectedCliReasoningLevel(event.target.value)}
                                    className="w-[150px] max-w-full bg-slate-700 text-slate-200 text-xs rounded px-1 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500"
                                  >
                                    {selectedCliReasoningOptions.map((option) => (
                                      <option key={option.effort} value={option.effort}>
                                        {option.effort}
                                      </option>
                                    ))}
                                  </select>
                                  <label className="inline-flex items-center gap-1 text-[10px] text-slate-300">
                                    <input
                                      type="checkbox"
                                      aria-label="Codex plan mode"
                                      checked={selectedRunMode === "plan"}
                                      onChange={(event) =>
                                        setSelectedRunMode(
                                          event.target.checked && isCodexPlanModeEligible(selectedCli, selectedCliModel)
                                            ? "plan"
                                            : "standard",
                                        )
                                      }
                                      className="h-3 w-3 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/50"
                                    />
                                    <span>Codex Plan</span>
                                  </label>
                                </>
                              ) : (
                                <span className="text-[10px] text-slate-400">
                                  {t({
                                    ko: "모델을 지정하면 추론/플랜 옵션이 열립니다.",
                                    en: "Reasoning and plan options appear after selecting a model.",
                                    ja: "Reasoning and plan options appear after selecting a model.",
                                    zh: "Reasoning and plan options appear after selecting a model.",
                                  })}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400">
                              {t({
                                ko: "사용 가능한 Codex 모델이 없습니다.",
                                en: "No Codex models available",
                                ja: "No Codex models available",
                                zh: "No Codex models available",
                              })}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          disabled={savingCli || !canSaveCli}
                          onClick={() => {
                            void handleSaveCli();
                          }}
                          className="text-[10px] px-1.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                        >
                          {savingCli ? "..." : t({ ko: "저장", en: "Save", ja: "保存", zh: "保存" })}
                        </button>
                        <button
                          onClick={handleCancelCliEdit}
                          className="text-[10px] px-1.5 py-0.5 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded transition-colors"
                        >
                          {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      <span>🔧</span>
                        <select
                          value={selectedCli}
                          onChange={(event) => {
                            const nextCli = event.target.value as Agent["cli_provider"];
                            setSelectedCli(nextCli);
                            setSelectedCliModel("");
                            setSelectedCliReasoningLevel("");
                            setSelectedRunMode("standard");
                            setSelectedCliAccountPoolId("");
                          }}
                        className="bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500"
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
                              ko: "계정 로딩...",
                              en: "Loading accounts...",
                              ja: "アカウント読み込み中...",
                              zh: "正在加载账号...",
                            })}
                          </span>
                        ) : activeOAuthAccounts.length > 0 ? (
                          <select
                            value={selectedOAuthAccountId}
                            onChange={(event) => setSelectedOAuthAccountId(event.target.value)}
                            className="bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500 max-w-[170px]"
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
                              ja: "有効な OAuth アカウントなし",
                              zh: "没有可用的 OAuth 账号",
                            })}
                          </span>
                        ))}
                      {requiresApiProvider && (
                        <span className="text-[10px] text-amber-300">
                          {t({
                            ko: "⚙️ 설정 > API 탭에서 모델을 배정하세요",
                            en: "⚙️ Assign models in Settings > API tab",
                            ja: "⚙️ 設定 > API タブでモデルを割り当ててください",
                            zh: "⚙️ 请在设置 > API 标签页中分配模型",
                          })}
                        </span>
                      )}
                      {supportsCliModelOverride &&
                        (cliModelsLoading ? (
                          <span className="text-[10px] text-slate-400">
                            {t({
                              ko: "모델 로딩...",
                              en: "Loading models...",
                              ja: "モデル読み込み中...",
                              zh: "正在加载模型...",
                            })}
                          </span>
                        ) : selectedCliModelOptions.length > 0 ? (
                          <>
                            <select
                              value={selectedCliModel}
                              onChange={(event) => {
                                const nextModel = event.target.value;
                                setSelectedCliModel(nextModel);
                              }}
                              className="bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500 max-w-[210px]"
                            >
                              <option value="">
                                {t({
                                  ko: "기본값(설정창 모델)",
                                  en: "Default (Settings model)",
                                  ja: "デフォルト（設定モデル）",
                                  zh: "默认（设置中的模型）",
                                })}
                              </option>
                              {selectedCliModelOptions.map((model) => (
                                <option key={model.slug} value={model.slug}>
                                  {model.displayName || model.slug}
                                </option>
                              ))}
                            </select>
                            <span className="text-[10px] text-slate-400">
                              {t({
                                ko: "알바생 모델은 설정창 값을 따릅니다",
                                en: "Sub-agent model follows Settings",
                                ja: "サブエージェントモデルは設定値を使用",
                                zh: "子代理模型沿用设置值",
                              })}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {t({
                              ko: "모델 목록이 없습니다",
                              en: "No model list available",
                              ja: "モデル一覧がありません",
                              zh: "暂无模型列表",
                            })}
                          </span>
                        ))}
                      <button
                        disabled={savingCli || !canSaveCli}
                        onClick={() => {
                          void handleSaveCli();
                        }}
                        className="text-[10px] px-1.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                      >
                        {savingCli ? "..." : t({ ko: "저장", en: "Save", ja: "保存", zh: "保存" })}
                      </button>
                      <button
                        onClick={handleCancelCliEdit}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded transition-colors"
                      >
                        {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    onClick={() => setEditingCli(true)}
                    className="flex items-center gap-1 hover:text-slate-300 transition-colors"
                    title={t({
                      ko: "클릭하여 CLI 변경",
                      en: "Click to change CLI",
                      ja: "クリックして CLI を変更",
                      zh: "点击更改 CLI",
                    })}
                  >
                    🔧{" "}
                    {cliSummaryText}
                    <span className="text-[9px] text-slate-600 ml-0.5">✏️</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-yellow-400 font-bold">Lv.{xpLevel}</span>
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full transition-all"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500">{agent.stats_xp} XP</span>
          </div>
        </div>

        <div className="flex border-b border-slate-700">
          {[
            { key: "info", label: t({ ko: "정보", en: "Info", ja: "情報", zh: "信息" }) },
            {
              key: "tasks",
              label: `${t({ ko: "업무", en: "Tasks", ja: "タスク", zh: "任务" })} (${agentTasks.length})`,
            },
            {
              key: "alba",
              label: `${t({ ko: "알바생", en: "Sub-agents", ja: "サブエージェント", zh: "子代理" })} (${agentSubAgents.length})`,
            },
          ].map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key as typeof tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === tabItem.key ? "text-blue-400 border-b-2 border-blue-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto max-h-[40vh]">
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
