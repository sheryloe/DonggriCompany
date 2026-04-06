"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AgentId,
  OAuthProvider,
  ProviderUsageProbeProvider,
  ProviderUsageProbeHistoryQuery,
  UpdateRuntimeProfileRequest
} from "@workspace/shared";

import { getAgentGuidanceMessage } from "../avatar/agent-copy";
import type { AgentGuidanceEvent } from "../avatar/agent-types";
import { getMonitorEntries } from "../board/office-agents";
import { HistoryBoard } from "../board/HistoryBoard";
import { OfficeBoardScene } from "../board/OfficeBoardScene";
import type { SceneSyncState } from "../board/scene-types";
import { AccountPoolWidget } from "../components/AccountPoolWidget";
import { AgentModelWidget } from "../components/AgentModelWidget";
import { AgentMonitorGrid } from "../components/AgentMonitorGrid";
import { CliRunPanel } from "../components/CliRunPanel";
import { KanbanBoardPanel } from "../components/KanbanBoardPanel";
import { MeetingPanel } from "../components/MeetingPanel";
import { OfficeConversationPanel } from "../components/OfficeConversationPanel";
import { ProbeRunPanel } from "../components/ProbeRunPanel";
import { RuntimeProfileWidget } from "../components/RuntimeProfileWidget";
import { useAgentModelAssignments } from "../hooks/useAgentModelAssignments";
import { useOAuthSessions } from "../hooks/useOAuthSessions";
import { useOfficeRealtimeSync } from "../hooks/useOfficeRealtimeSync";
import { useProviderProbe } from "../hooks/useProviderProbe";
import { useRuntimeProfileCrud } from "../hooks/useRuntimeProfileCrud";
import { useStep2OpsBootstrap } from "../hooks/useStep2OpsBootstrap";
import {
  DEFAULT_OFFICE_LOCALE,
  createOfficeTranslator,
  loadOfficeLocale,
  resolveOfficeLocale,
  saveOfficeLocale,
  type OfficeLocale,
  type OfficeSettingsTab
} from "../i18n/office-i18n";
import { mapProbeStateToPresentation } from "../lib/probe-presentation";
import { classifyProbeUiState } from "../lib/probe-ui-state";
import type { OfficeEventLogView } from "@workspace/shared";

type RuntimeProfileDraft = {
  key: string;
  accountPoolId: string;
  profilePath: string;
  status: string;
};

type OfficeThemeMode = "system" | "light" | "dark";

const emptyDraft: RuntimeProfileDraft = {
  key: "",
  accountPoolId: "",
  profilePath: "",
  status: ""
};

const OFFICE_THEME_STORAGE_KEY = "donggri.office.theme";

const startsWith = (value: string | null, text: string): boolean => {
  return value ? value.startsWith(text) : false;
};

const settingsTabs: OfficeSettingsTab[] = [
  "account",
  "runtime",
  "agent-models",
  "probe",
  "history",
  "kanban",
  "meetings",
  "cli"
];

const localeLangCode: Record<OfficeLocale, string> = {
  ko: "ko",
  en: "en",
  zh: "zh-CN"
};

const resolveThemeMode = (value: string | null): OfficeThemeMode => {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
};

export default function OfficePage(): JSX.Element {
  const bootstrap = useStep2OpsBootstrap();
  const [createDraft, setCreateDraft] = useState<RuntimeProfileDraft>(emptyDraft);
  const [updateDraft, setUpdateDraft] = useState<RuntimeProfileDraft>(emptyDraft);
  const [agentEvent, setAgentEvent] = useState<AgentGuidanceEvent>({ type: "bootstrap-loading" });
  const [lastSceneActionAt, setLastSceneActionAt] = useState<string>("boot");
  const [activeSettingsTab, setActiveSettingsTab] = useState<OfficeSettingsTab>("account");
  const [selectedOAuthProvider, setSelectedOAuthProvider] = useState<OAuthProvider>("codex");
  const [locale, setLocale] = useState<OfficeLocale>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_OFFICE_LOCALE;
    }
    return loadOfficeLocale(window.localStorage);
  });
  const [themeMode, setThemeMode] = useState<OfficeThemeMode>(() => {
    if (typeof window === "undefined") {
      return "system";
    }
    return resolveThemeMode(window.localStorage.getItem(OFFICE_THEME_STORAGE_KEY));
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    if (typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const contextKeyRef = useRef<string>("");
  const previousProbeStateRef = useRef<string>("");
  const t = useMemo(() => createOfficeTranslator(locale), [locale]);
  const resolvedTheme = themeMode === "system" ? (systemPrefersDark ? "dark" : "light") : themeMode;
  const tabLabelMap = useMemo(
    () =>
      ({
        account: t("settings.tab.account"),
        runtime: t("settings.tab.runtime"),
        "agent-models": t("settings.tab.agentModels"),
        probe: t("settings.tab.probe"),
        history: t("settings.tab.history"),
        kanban: t("settings.tab.kanban"),
        meetings: t("settings.tab.meetings"),
        cli: t("settings.tab.cli")
      }) as Record<OfficeSettingsTab, string>,
    [t]
  );

  const markSceneAction = useCallback((reason: string): void => {
    const nowLabel = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setLastSceneActionAt(`${reason}@${nowLabel}`);
  }, []);

  const getHistoryQuery = useCallback((): ProviderUsageProbeHistoryQuery => {
    const state = bootstrap.officeOpsState;
    const selectedRuntimeProfile = bootstrap.profiles.find((profile) => profile.id === state.selectedRuntimeProfileId);
    const isProviderMatch = selectedRuntimeProfile?.provider === state.selectedProvider;
    const isPoolMatch =
      !state.selectedAccountPoolId ||
      selectedRuntimeProfile?.accountPoolId === state.selectedAccountPoolId;

    return {
      provider: state.selectedProvider,
      accountPoolId: state.selectedAccountPoolId || undefined,
      runtimeProfileId: isProviderMatch && isPoolMatch ? selectedRuntimeProfile?.id : undefined
    };
  }, [bootstrap.officeOpsState, bootstrap.profiles]);

  const probe = useProviderProbe({
    getHistoryQuery
  });

  const runtimeCrud = useRuntimeProfileCrud({
    onAfterMutation: async () => {
      await bootstrap.refresh();
      await probe.refreshHistory();
    }
  });
  const agentModelAssignments = useAgentModelAssignments();
  const oauthSessions = useOAuthSessions(selectedOAuthProvider);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    saveOfficeLocale(locale, window.localStorage);
    document.documentElement.lang = localeLangCode[locale];
  }, [locale]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(OFFICE_THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (typeof window.matchMedia !== "function") {
      setSystemPrefersDark(false);
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent): void => {
      setSystemPrefersDark(event.matches);
    };
    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    const providerPoolIds = new Set(
      bootstrap.pools
        .filter((pool) => pool.provider === bootstrap.officeOpsState.selectedProvider)
        .map((pool) => pool.id)
    );

    if (bootstrap.officeOpsState.selectedAccountPoolId.length === 0) {
      return;
    }

    if (!providerPoolIds.has(createDraft.accountPoolId)) {
      setCreateDraft((previous) => ({
        ...previous,
        accountPoolId: bootstrap.officeOpsState.selectedAccountPoolId
      }));
    }
  }, [
    bootstrap.officeOpsState.selectedAccountPoolId,
    bootstrap.officeOpsState.selectedProvider,
    bootstrap.pools,
    createDraft.accountPoolId
  ]);

  useEffect(() => {
    const selectedProfile = bootstrap.profiles.find(
      (profile) => profile.id === bootstrap.officeOpsState.selectedRuntimeProfileId
    );
    if (!selectedProfile) {
      setUpdateDraft(emptyDraft);
      return;
    }

    setUpdateDraft({
      key: selectedProfile.key,
      accountPoolId: selectedProfile.accountPoolId ?? "",
      profilePath: selectedProfile.profilePath ?? "",
      status: selectedProfile.status
    });
  }, [bootstrap.officeOpsState.selectedRuntimeProfileId, bootstrap.profiles]);

  useEffect(() => {
    if (bootstrap.isLoading || bootstrap.errorMessage) {
      return;
    }
    void probe.refreshHistory();
  }, [
    bootstrap.isLoading,
    bootstrap.errorMessage,
    bootstrap.officeOpsState.selectedProvider,
    bootstrap.officeOpsState.selectedAccountPoolId,
    bootstrap.officeOpsState.selectedRuntimeProfileId
  ]);

  useEffect(() => {
    if (bootstrap.isLoading) {
      setAgentEvent({ type: "bootstrap-loading" });
      return;
    }

    if (bootstrap.errorMessage) {
      setAgentEvent({ type: "bootstrap-error", message: bootstrap.errorMessage });
      return;
    }

    setAgentEvent((previous) => {
      if (previous.type !== "bootstrap-loading" && previous.type !== "bootstrap-error") {
        return previous;
      }

      return {
        type: "bootstrap-ready",
        provider: bootstrap.officeOpsState.selectedProvider,
        poolCount: bootstrap.pools.length,
        profileCount: bootstrap.profiles.length
      };
    });
  }, [
    bootstrap.isLoading,
    bootstrap.errorMessage,
    bootstrap.officeOpsState.selectedProvider,
    bootstrap.pools.length,
    bootstrap.profiles.length
  ]);

  const latestProbeState = classifyProbeUiState({
    run: probe.latestRun,
    errorMessage: probe.errorMessage
  });
  const latestProbePresentation = mapProbeStateToPresentation(latestProbeState);
  const selectedRuntimeProfile =
    bootstrap.profiles.find((profile) => profile.id === bootstrap.officeOpsState.selectedRuntimeProfileId) ?? null;
  const selectedPool = bootstrap.pools.find((pool) => pool.id === bootstrap.officeOpsState.selectedAccountPoolId) ?? null;
  const agentName = `${bootstrap.officeOpsState.selectedProvider.toUpperCase()} Agent`;
  const selectedPoolKey = selectedPool?.key ?? "";
  const selectedProfileKey = selectedRuntimeProfile?.key ?? "";
  const agentModelById = useMemo(() => {
    return agentModelAssignments.assignments.reduce((accumulator, assignment) => {
      const profile = bootstrap.profiles.find(
        (candidate) => candidate.id === assignment.runtimeProfileId
      );
      const pool = bootstrap.pools.find((candidate) => candidate.id === assignment.accountPoolId);
      if (!profile || !pool) {
        return accumulator;
      }
      if (
        profile.provider !== assignment.provider ||
        pool.provider !== assignment.provider ||
        profile.accountPoolId !== assignment.accountPoolId
      ) {
        return accumulator;
      }

      accumulator[assignment.agentId] = {
        provider: assignment.provider,
        accountPoolId: assignment.accountPoolId,
        accountPoolKey: pool.key,
        runtimeProfileId: assignment.runtimeProfileId,
        runtimeProfileKey: profile.key,
        modelLabel: `${assignment.provider.toUpperCase()} / ${profile.key}`
      };
      return accumulator;
    }, {} as SceneSyncState["agentModelById"]);
  }, [agentModelAssignments.assignments, bootstrap.pools, bootstrap.profiles]);
  const monitorProviderLabel =
    agentModelById.main?.modelLabel ??
    `${bootstrap.officeOpsState.selectedProvider.toUpperCase()} / ${selectedProfileKey || t("page.profileUnselected")}`;
  const realtime = useOfficeRealtimeSync();
  const runnerByPoolId = useMemo(() => {
    return realtime.runners.items.reduce((accumulator, current) => {
      accumulator[current.accountPoolId] = current;
      return accumulator;
    }, {} as Record<string, (typeof realtime.runners.items)[number]>);
  }, [realtime.runners.items]);
  const runnerQueueByPoolId = useMemo(() => {
    return realtime.runners.queue.reduce((accumulator, current) => {
      const next = accumulator[current.accountPoolId] ?? [];
      next.push(current);
      accumulator[current.accountPoolId] = next;
      return accumulator;
    }, {} as Record<string, Array<(typeof realtime.runners.queue)[number]>>);
  }, [realtime.runners.queue]);
  const resetAgentLoop = useCallback(
    async (detail = "context-switch"): Promise<void> => {
      await realtime.sendCommand({
        command: "resetSimulation",
        phase: "committed",
        detail
      });
      markSceneAction("loop-reset");
    },
    [markSceneAction, realtime]
  );

  const sceneSync: SceneSyncState = {
    loopState: realtime.runtimeState.loopState,
    lastLoopEvent: realtime.runtimeState.lastLoopEvent,
    activeAgents: realtime.runtimeState.actors.length,
    actors: realtime.runtimeState.actors,
    agentLoadById: realtime.runtimeState.agentLoadById,
    selectedProvider: bootstrap.officeOpsState.selectedProvider,
    selectedPoolKey,
    selectedProfileKey,
    agentModelById,
    probeState: latestProbeState,
    lastActionAt: lastSceneActionAt,
    kpi: realtime.runtimeState.kpi,
    simSpeed: realtime.runtimeState.simSpeed,
    isPaused: realtime.runtimeState.isPaused
  };

  const conversationEvents = useMemo(
    () =>
      realtime.logs.map((item: OfficeEventLogView) => ({
        id: item.id,
        tick: item.tick,
        category: item.category,
        message: item.message,
        actorId: item.actorId ?? undefined,
        speaker: item.speaker ?? undefined
      })),
    [realtime.logs]
  );

  useEffect(() => {
    const previousProbeState = previousProbeStateRef.current;
    if (!previousProbeState) {
      previousProbeStateRef.current = latestProbeState;
      return;
    }
    if (previousProbeState === latestProbeState) {
      return;
    }
    previousProbeStateRef.current = latestProbeState;

    if (latestProbeState === "error") {
      void realtime.sendCommand({
        command: "probeError",
        phase: "committed",
        detail: "probe-state=error"
      });
      return;
    }
    if (previousProbeState === "error") {
      void realtime.sendCommand({
        command: "probeRecovered",
        phase: "committed",
        detail: `probe-state=${latestProbeState}`
      });
    }
  }, [latestProbeState, realtime]);

  const guidanceMessage = useMemo(
    () => getAgentGuidanceMessage(agentEvent, latestProbeState),
    [agentEvent, latestProbeState]
  );
  const monitorEntries = getMonitorEntries(sceneSync, agentName, t);

  useEffect(() => {
    if (bootstrap.isLoading || bootstrap.errorMessage) {
      void resetAgentLoop("bootstrap-state-change");
    }
  }, [bootstrap.isLoading, bootstrap.errorMessage, resetAgentLoop]);

  useEffect(() => {
    if (bootstrap.isLoading || bootstrap.errorMessage) {
      return;
    }
    const nextContextKey = [
      bootstrap.officeOpsState.selectedProvider,
      bootstrap.officeOpsState.selectedAccountPoolId,
      bootstrap.officeOpsState.selectedRuntimeProfileId
    ].join("|");

    if (!contextKeyRef.current) {
      contextKeyRef.current = nextContextKey;
      return;
    }
    if (contextKeyRef.current === nextContextKey) {
      return;
    }
    contextKeyRef.current = nextContextKey;
    void resetAgentLoop("context-switch");
  }, [
    bootstrap.errorMessage,
    bootstrap.isLoading,
    bootstrap.officeOpsState.selectedAccountPoolId,
    bootstrap.officeOpsState.selectedProvider,
    bootstrap.officeOpsState.selectedRuntimeProfileId,
    resetAgentLoop
  ]);

  useEffect(() => {
    if (runtimeCrud.errorMessage) {
      setAgentEvent({ type: "runtime-error", message: runtimeCrud.errorMessage });
    }
  }, [runtimeCrud.errorMessage]);

  useEffect(() => {
    if (probe.errorMessage) {
      setAgentEvent({ type: "probe-error", message: probe.errorMessage });
      return;
    }

    if (startsWith(probe.actionMessage, "Probe run completed.")) {
      setAgentEvent({
        type: "probe-run-finish",
        state: latestProbeState,
        provider: bootstrap.officeOpsState.selectedProvider
      });
      return;
    }

    if (startsWith(probe.actionMessage, "No probe history matched current filters.")) {
      setAgentEvent({
        type: "history-empty",
        provider: bootstrap.officeOpsState.selectedProvider,
        accountPoolId: bootstrap.officeOpsState.selectedAccountPoolId,
        runtimeProfileId: bootstrap.officeOpsState.selectedRuntimeProfileId,
        limit: probe.historyLimit
      });
      return;
    }

    if (startsWith(probe.actionMessage, "Loaded ")) {
      setAgentEvent({
        type: "history-loaded",
        count: probe.historyRuns.length,
        limit: probe.historyLimit
      });
    }
  }, [
    probe.errorMessage,
    probe.actionMessage,
    probe.historyRuns.length,
    probe.historyLimit,
    bootstrap.officeOpsState.selectedProvider,
    bootstrap.officeOpsState.selectedAccountPoolId,
    bootstrap.officeOpsState.selectedRuntimeProfileId,
    latestProbeState
  ]);

  useEffect(() => {
    if (sceneSync.loopState === "reporting" || sceneSync.loopState === "waiting_review") {
      setAgentEvent({
        type: "pm-report",
        agentName
      });
    }
  }, [sceneSync.loopState, agentName]);

  const onCreateRuntimeProfile = async (): Promise<void> => {
    const key = createDraft.key.trim();
    const created = await runtimeCrud.createProfile({
      key,
      provider: bootstrap.officeOpsState.selectedProvider,
      accountPoolId: createDraft.accountPoolId || bootstrap.officeOpsState.selectedAccountPoolId,
      profilePath: createDraft.profilePath.trim() ? createDraft.profilePath.trim() : null,
      status: createDraft.status.trim() || undefined
    });

    if (created) {
      setCreateDraft((previous) => ({
        ...previous,
        key: "",
        profilePath: ""
      }));
      setAgentEvent({ type: "runtime-create-success", key });
    }
  };

  const onUpdateRuntimeProfile = async (): Promise<void> => {
    if (!bootstrap.officeOpsState.selectedRuntimeProfileId) {
      return;
    }

    const payload: UpdateRuntimeProfileRequest = {};
    if (updateDraft.key.trim()) {
      payload.key = updateDraft.key.trim();
    }
    if (updateDraft.accountPoolId.trim()) {
      payload.accountPoolId = updateDraft.accountPoolId.trim();
    }
    if (updateDraft.profilePath.trim()) {
      payload.profilePath = updateDraft.profilePath.trim();
    }
    if (updateDraft.status.trim()) {
      payload.status = updateDraft.status.trim();
    }

    const updated = await runtimeCrud.updateProfile(bootstrap.officeOpsState.selectedRuntimeProfileId, payload);
    if (updated) {
      setAgentEvent({
        type: "runtime-update-success",
        key: selectedRuntimeProfile?.key ?? bootstrap.officeOpsState.selectedRuntimeProfileId
      });
    }
  };

  const onDeleteRuntimeProfile = async (): Promise<boolean> => {
    if (!bootstrap.officeOpsState.selectedRuntimeProfileId) {
      return false;
    }

    const deleted = await runtimeCrud.removeProfile(bootstrap.officeOpsState.selectedRuntimeProfileId);
    if (deleted) {
      setAgentEvent({
        type: "runtime-delete-success",
        key: selectedRuntimeProfile?.key ?? bootstrap.officeOpsState.selectedRuntimeProfileId
      });
    }
    return deleted;
  };

  const onRunProbe = async (): Promise<void> => {
    if (!bootstrap.officeOpsState.selectedAccountPoolId) {
      setAgentEvent({
        type: "probe-error",
        message: "Account pool is required before running probe."
      });
      return;
    }

    if (latestProbeState === "error") {
      await realtime.sendCommand({
        command: "runProbe",
        phase: "committed",
        detail: "blocked-probe-error"
      });
      markSceneAction("probe-run-blocked");
      setAgentEvent({
        type: "probe-error",
        message: "Probe run is blocked while probe state is ERROR. Recover signal first."
      });
      return;
    }

    setAgentEvent({
      type: "probe-run-start",
      provider: bootstrap.officeOpsState.selectedProvider
    });
    markSceneAction("probe-run");

    const completed = await probe.runProbe({
      provider: bootstrap.officeOpsState.selectedProvider,
      accountPoolId: bootstrap.officeOpsState.selectedAccountPoolId,
      runtimeProfileId: bootstrap.officeOpsState.selectedRuntimeProfileId || undefined,
      persistSnapshot: true
    });

    if (completed) {
      await realtime.sendCommand({
        command: "runProbe",
        phase: "committed",
        detail: "backend-success"
      });
      await bootstrap.refresh();
      return;
    }

    await realtime.sendCommand({
      command: "runProbe",
      phase: "rejected",
      detail: "backend-failed"
    });
  };

  const onRefreshProbe = async (): Promise<void> => {
    markSceneAction("history-refresh");
    const refreshed = await probe.refreshHistory();
    await realtime.sendCommand({
      command: "refreshHistory",
      phase: refreshed ? "committed" : "rejected",
      detail: refreshed ? "backend-success" : "backend-failed"
    });
  };

  const onChangeHistoryLimit = async (nextLimit: number): Promise<void> => {
    setAgentEvent({
      type: "history-filter-changed",
      provider: bootstrap.officeOpsState.selectedProvider,
      accountPoolId: bootstrap.officeOpsState.selectedAccountPoolId,
      runtimeProfileId: bootstrap.officeOpsState.selectedRuntimeProfileId,
      limit: nextLimit
    });
    markSceneAction("history-limit");
    await probe.changeHistoryLimit(nextLimit);
  };

  const defaultAgentModelSelection = useMemo(() => {
    const provider = bootstrap.officeOpsState.selectedProvider as ProviderUsageProbeProvider;
    const accountPoolId =
      bootstrap.officeOpsState.selectedAccountPoolId ||
      bootstrap.pools.find((pool) => pool.provider === provider)?.id ||
      "";
    const runtimeProfileId =
      bootstrap.officeOpsState.selectedRuntimeProfileId ||
      bootstrap.profiles.find(
        (profile) => profile.provider === provider && profile.accountPoolId === accountPoolId
      )?.id ||
      "";

    return {
      provider,
      accountPoolId,
      runtimeProfileId
    };
  }, [
    bootstrap.officeOpsState.selectedAccountPoolId,
    bootstrap.officeOpsState.selectedProvider,
    bootstrap.officeOpsState.selectedRuntimeProfileId,
    bootstrap.pools,
    bootstrap.profiles
  ]);

  const onSaveAgentModel = async (
    agentId: AgentId,
    payload: {
      provider: ProviderUsageProbeProvider;
      accountPoolId: string;
      runtimeProfileId: string;
    }
  ): Promise<void> => {
    const saved = await agentModelAssignments.upsert(agentId, payload);
    if (saved) {
      markSceneAction(`agent-model-${agentId}`);
    }
  };

  const settingsPanel = (() => {
    if (activeSettingsTab === "account") {
      return (
        <AccountPoolWidget
          pools={bootstrap.pools}
          selectedProvider={bootstrap.officeOpsState.selectedProvider}
          selectedAccountPoolId={bootstrap.officeOpsState.selectedAccountPoolId}
          oauthSessionByPoolId={oauthSessions.sessionByPoolId}
          runnerByPoolId={runnerByPoolId}
          runnerQueueByPoolId={runnerQueueByPoolId}
          isOAuthMutating={oauthSessions.isMutating}
            selectedOAuthProvider={selectedOAuthProvider}
            isOAuthProviderConfigured={oauthSessions.isProviderConfigured}
            onSelectProvider={(provider) => {
              bootstrap.setOfficeOpsState((previous) => ({
                ...previous,
                selectedProvider: provider,
                selectedAccountPoolId: "",
                selectedRuntimeProfileId: ""
              }));
              setSelectedOAuthProvider(provider);
              setAgentEvent({
                type: "history-filter-changed",
                provider,
                accountPoolId: "",
                runtimeProfileId: "",
                limit: probe.historyLimit
              });
            }}
            onSelectOAuthProvider={setSelectedOAuthProvider}
            onSelectAccountPool={(accountPoolId) => {
              bootstrap.setOfficeOpsState((previous) => ({
                ...previous,
              selectedAccountPoolId: accountPoolId,
              selectedRuntimeProfileId: ""
            }));
            setAgentEvent({
              type: "history-filter-changed",
              provider: bootstrap.officeOpsState.selectedProvider,
              accountPoolId,
              runtimeProfileId: "",
              limit: probe.historyLimit
            });
          }}
          onConnectOAuth={(accountPoolId) => void oauthSessions.connect(accountPoolId)}
          onDisconnectOAuth={(accountPoolId) => void oauthSessions.disconnect(accountPoolId)}
          onActivateRunner={(provider, accountPoolId) =>
            void realtime.activateRunner(provider, accountPoolId)
          }
          onDeactivateRunner={(provider, accountPoolId) =>
            void realtime.deactivateRunner(provider, accountPoolId)
          }
          t={t}
        />
      );
    }

    if (activeSettingsTab === "agent-models") {
      return (
        <AgentModelWidget
          pools={bootstrap.pools}
          profiles={bootstrap.profiles}
          assignmentsByAgentId={agentModelAssignments.assignmentByAgentId}
          defaultSelection={defaultAgentModelSelection}
          isMutating={agentModelAssignments.isMutating}
          errorMessage={agentModelAssignments.errorMessage}
          actionMessage={agentModelAssignments.actionMessage}
          onSave={(agentId, payload) => onSaveAgentModel(agentId, payload)}
          t={t}
        />
      );
    }

    if (activeSettingsTab === "runtime") {
      return (
        <RuntimeProfileWidget
          profiles={bootstrap.profiles}
          pools={bootstrap.pools}
          selectedProvider={bootstrap.officeOpsState.selectedProvider}
          selectedRuntimeProfileId={bootstrap.officeOpsState.selectedRuntimeProfileId}
          selectedRuntimeProfileKey={selectedRuntimeProfile?.key ?? null}
          onSelectRuntimeProfile={(runtimeProfileId) => {
            bootstrap.setOfficeOpsState((previous) => ({
              ...previous,
              selectedRuntimeProfileId: runtimeProfileId
            }));
            setAgentEvent({
              type: "history-filter-changed",
              provider: bootstrap.officeOpsState.selectedProvider,
              accountPoolId: bootstrap.officeOpsState.selectedAccountPoolId,
              runtimeProfileId,
              limit: probe.historyLimit
            });
          }}
          createDraft={createDraft}
          updateDraft={updateDraft}
          onChangeCreateDraft={setCreateDraft}
          onChangeUpdateDraft={setUpdateDraft}
          isMutating={runtimeCrud.isMutating}
          errorMessage={runtimeCrud.errorMessage}
          actionMessage={runtimeCrud.actionMessage}
          onCreate={() => void onCreateRuntimeProfile()}
          onUpdate={() => void onUpdateRuntimeProfile()}
          onDelete={onDeleteRuntimeProfile}
          onDeleteIntent={(runtimeProfileKey) =>
            setAgentEvent({ type: "runtime-delete-intent", key: runtimeProfileKey })
          }
          onDeleteCancel={() => setAgentEvent({ type: "idle" })}
          t={t}
        />
      );
    }

    if (activeSettingsTab === "probe") {
      return (
        <ProbeRunPanel
          provider={bootstrap.officeOpsState.selectedProvider}
          accountPoolId={bootstrap.officeOpsState.selectedAccountPoolId}
          runtimeProfileId={bootstrap.officeOpsState.selectedRuntimeProfileId}
          latestProbeRun={probe.latestRun}
          latestProbeState={latestProbeState}
          isRunning={probe.isRunning}
          errorMessage={probe.errorMessage}
          actionMessage={probe.actionMessage}
          onRun={() => void onRunProbe()}
          t={t}
        />
      );
    }

    if (activeSettingsTab === "kanban") {
      return (
        <KanbanBoardPanel
          departments={realtime.kanban.departments}
          tasks={realtime.kanban.tasks}
          isMutating={realtime.isMutating}
          errorMessage={realtime.errorMessage}
          onCreateTask={async (payload) => realtime.createKanbanTask(payload)}
          onUpdateTask={async (taskId, payload) =>
            realtime.updateKanbanTask(taskId, payload)
          }
          t={t}
        />
      );
    }

    if (activeSettingsTab === "meetings") {
      return (
        <MeetingPanel
          meetings={realtime.meetings}
          departments={realtime.kanban.departments}
          isMutating={realtime.isMutating}
          errorMessage={realtime.errorMessage}
          onCreateMeeting={async (payload) => realtime.createMeeting(payload)}
          onStartMeeting={async (meetingId) => realtime.startMeeting(meetingId)}
          onCompleteMeeting={async (meetingId) => realtime.completeMeeting(meetingId)}
          onDeleteMeeting={async (meetingId) => realtime.deleteMeeting(meetingId)}
          t={t}
        />
      );
    }

    if (activeSettingsTab === "cli") {
      return (
        <CliRunPanel
          runs={realtime.cli.runs}
          logsByTaskId={realtime.cli.logsByTaskId}
          subtasksByTaskId={realtime.cli.subtasksByTaskId}
          selectedAccountPoolId={bootstrap.officeOpsState.selectedAccountPoolId}
          isMutating={realtime.isMutating}
          errorMessage={realtime.errorMessage}
          onRun={async (payload) => realtime.runCli(payload)}
          onStop={async (taskId) => realtime.stopCli(taskId)}
          onLoadLogs={async (taskId) => realtime.loadCliLogs(taskId)}
          onLoadSubtasks={async (taskId) => realtime.loadCliSubtasks(taskId)}
          t={t}
        />
      );
    }

    return (
      <HistoryBoard
        provider={bootstrap.officeOpsState.selectedProvider}
        accountPoolId={bootstrap.officeOpsState.selectedAccountPoolId}
        runtimeProfileId={bootstrap.officeOpsState.selectedRuntimeProfileId}
        historyLimit={probe.historyLimit}
        historyRuns={probe.historyRuns}
        isHistoryLoading={probe.isHistoryLoading}
        errorMessage={probe.errorMessage}
        actionMessage={probe.actionMessage}
        onRefresh={() => void onRefreshProbe()}
        onHistoryLimitChange={(nextLimit) => void onChangeHistoryLimit(nextLimit)}
        t={t}
      />
    );
  })();

  if (bootstrap.isLoading) {
    return (
      <main className="office-page-main" data-office-theme={resolvedTheme}>
        <section className="panel office-avatar-page">
          <h1>{t("page.loadingTitle")}</h1>
          <p>{t("page.loadingMessage")}</p>
        </section>
      </main>
    );
  }

  if (bootstrap.errorMessage) {
    return (
      <main className="office-page-main" data-office-theme={resolvedTheme}>
        <section className="panel office-avatar-page">
          <h1>{t("page.loadingTitle")}</h1>
          <p className="error">{bootstrap.errorMessage}</p>
          <button type="button" onClick={() => void bootstrap.refresh()}>
            {t("page.retry")}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="office-page-main" data-office-theme={resolvedTheme}>
      <section className="panel office-ops-page office-avatar-page">
        <header className="admin-header office-command-header">
          <div>
            <p className="office-command-kicker">{t("page.kicker")}</p>
            <h1>{t("page.title")}</h1>
            <p>{t("page.summary")}</p>
          </div>
          <div className="office-command-context" aria-label="Current command context">
            <span>{bootstrap.officeOpsState.selectedProvider.toUpperCase()}</span>
            <span>{selectedPoolKey || t("page.poolUnassigned")}</span>
            <span>{selectedProfileKey || t("page.profileUnselected")}</span>
            <span>{latestProbePresentation.hudLabel}</span>
          </div>
        </header>

        <section className="office-app-layout">
          <aside className="office-settings-rail">
            <header>
              <strong>{t("layout.settingsTitle")}</strong>
              <p className="hint">{t("layout.settingsHint")}</p>
            </header>
            <section className="office-settings-summary card compact">
              <p>
                <span>{t("widget.account.provider")}</span>
                <strong>{bootstrap.officeOpsState.selectedProvider.toUpperCase()}</strong>
              </p>
              <p>
                <span>{t("widget.account.pool")}</span>
                <strong>{selectedPoolKey || t("page.poolUnassigned")}</strong>
              </p>
              <p>
                <span>{t("widget.runtime.profile")}</span>
                <strong>{selectedProfileKey || t("page.profileUnselected")}</strong>
              </p>
              <p>
                <span>{t("topbar.confidence")}</span>
                <strong>{latestProbePresentation.hudLabel}</strong>
              </p>
            </section>
            <div className="office-settings-tab-list" role="tablist" aria-label={t("layout.settingsTitle")}>
              {settingsTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeSettingsTab === tab}
                  className={`secondary${activeSettingsTab === tab ? " active" : ""}`}
                  onClick={() => setActiveSettingsTab(tab)}
                >
                  {tabLabelMap[tab]}
                </button>
              ))}
            </div>
            <section className="office-locale-card office-locale-inline">
              <strong>{t("settings.languageTitle")}</strong>
              <label>
                <span>{t("settings.languageLabel")}</span>
                <select
                  aria-label={t("settings.languageLabel")}
                  value={locale}
                  onChange={(event) => setLocale(resolveOfficeLocale(event.target.value))}
                >
                  <option value="ko">{t("locale.ko")}</option>
                  <option value="en">{t("locale.en")}</option>
                  <option value="zh">{t("locale.zh")}</option>
                </select>
              </label>
              <p className="hint">{t("settings.languageHint")}</p>
            </section>
            <section className="office-locale-card office-theme-inline">
              <strong>{t("settings.themeTitle")}</strong>
              <label>
                <span>{t("settings.themeLabel")}</span>
                <select
                  aria-label={t("settings.themeLabel")}
                  value={themeMode}
                  onChange={(event) => setThemeMode(resolveThemeMode(event.target.value))}
                >
                  <option value="system">{t("theme.system")}</option>
                  <option value="light">{t("theme.light")}</option>
                  <option value="dark">{t("theme.dark")}</option>
                </select>
              </label>
              <p className="hint">{t("settings.themeHint")}</p>
            </section>
            <section className="office-inline-settings-panel" role="tabpanel">
              {settingsPanel}
            </section>
          </aside>

          <section className="office-center-column" aria-label={t("layout.centerTitle")}>
            <header className="office-column-header">
              <strong>{t("layout.centerTitle")}</strong>
              <p className="hint">{t("layout.centerHint")}</p>
            </header>
            <OfficeBoardScene
              sceneSync={sceneSync}
              agentName={agentName}
              emphasisTarget={latestProbePresentation.emphasisTarget}
              showStatusPanel={false}
              onEditorAction={(action) => {
                markSceneAction(`editor-${action.type}`);
              }}
              t={t}
            />
            <AgentMonitorGrid
              entries={monitorEntries}
              providerLabel={monitorProviderLabel}
              t={t}
            />
          </section>

          <aside className="office-right-column" aria-label={t("layout.rightTitle")}>
            <header className="office-column-header">
              <strong>{t("layout.rightTitle")}</strong>
              <p className="hint">{t("layout.rightHint")}</p>
            </header>
            <OfficeConversationPanel
              events={conversationEvents}
              guidanceMessage={guidanceMessage}
              mainAgentName={agentName}
              threads={realtime.threads}
              isMutating={realtime.isMutating}
              onCreateThread={async (payload) => realtime.createThread(payload)}
              onAppendFeedback={async (threadId, payload) =>
                realtime.appendThreadMessage(threadId, payload)
              }
              onUpdateThreadStatus={async (threadId, payload) =>
                realtime.updateThreadStatus(threadId, payload)
              }
              contextChips={[
                bootstrap.officeOpsState.selectedProvider.toUpperCase(),
                selectedPool?.label ?? t("page.poolUnassigned"),
                selectedRuntimeProfile?.key ?? t("page.profileUnselected"),
                latestProbePresentation.stateLabel
              ]}
              t={t}
            />
          </aside>
        </section>
      </section>
    </main>
  );
}

