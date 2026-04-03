"use client";

import { useCallback, useEffect, useState } from "react";

import type { ProviderUsageProbeHistoryQuery, UpdateRuntimeProfileRequest } from "@workspace/shared";

import { AgentShell } from "../avatar/AgentShell";
import type { AgentGuidanceEvent } from "../avatar/agent-types";
import { AvatarLayerBoundary } from "../avatar/AvatarLayerBoundary";
import { HistoryBoard } from "../board/HistoryBoard";
import { OfficeBoardScene } from "../board/OfficeBoardScene";
import { AccountPoolWidget } from "../components/AccountPoolWidget";
import { ProbeRunPanel } from "../components/ProbeRunPanel";
import { RuntimeProfileWidget } from "../components/RuntimeProfileWidget";
import { TopOpsBar } from "../components/TopOpsBar";
import { useProviderProbe } from "../hooks/useProviderProbe";
import { useRuntimeProfileCrud } from "../hooks/useRuntimeProfileCrud";
import { useStep2OpsBootstrap } from "../hooks/useStep2OpsBootstrap";
import { classifyProbeUiState } from "../lib/probe-ui-state";

type RuntimeProfileDraft = {
  key: string;
  accountPoolId: string;
  profilePath: string;
  status: string;
};

const emptyDraft: RuntimeProfileDraft = {
  key: "",
  accountPoolId: "",
  profilePath: "",
  status: ""
};

const startsWith = (value: string | null, text: string): boolean => {
  return value ? value.startsWith(text) : false;
};

export default function OfficePage(): JSX.Element {
  const bootstrap = useStep2OpsBootstrap();
  const [createDraft, setCreateDraft] = useState<RuntimeProfileDraft>(emptyDraft);
  const [updateDraft, setUpdateDraft] = useState<RuntimeProfileDraft>(emptyDraft);
  const [agentEvent, setAgentEvent] = useState<AgentGuidanceEvent>({ type: "bootstrap-loading" });

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

  const selectedRuntimeProfile =
    bootstrap.profiles.find((profile) => profile.id === bootstrap.officeOpsState.selectedRuntimeProfileId) ?? null;

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
    setAgentEvent({
      type: "probe-run-start",
      provider: bootstrap.officeOpsState.selectedProvider
    });

    const completed = await probe.runProbe({
      provider: bootstrap.officeOpsState.selectedProvider,
      accountPoolId: bootstrap.officeOpsState.selectedAccountPoolId || undefined,
      runtimeProfileId: bootstrap.officeOpsState.selectedRuntimeProfileId || undefined,
      persistSnapshot: true
    });

    if (completed) {
      await bootstrap.refresh();
    }
  };

  const onRefreshProbe = async (): Promise<void> => {
    await probe.refreshHistory();
  };

  const onChangeHistoryLimit = async (nextLimit: number): Promise<void> => {
    setAgentEvent({
      type: "history-filter-changed",
      provider: bootstrap.officeOpsState.selectedProvider,
      accountPoolId: bootstrap.officeOpsState.selectedAccountPoolId,
      runtimeProfileId: bootstrap.officeOpsState.selectedRuntimeProfileId,
      limit: nextLimit
    });
    await probe.changeHistoryLimit(nextLimit);
  };

  if (bootstrap.isLoading) {
    return (
      <main>
        <section className="panel">
          <h1>Office Avatar Board</h1>
          <p>Loading office resources for avatar board...</p>
        </section>
      </main>
    );
  }

  if (bootstrap.errorMessage) {
    return (
      <main>
        <section className="panel">
          <h1>Office Avatar Board</h1>
          <p className="error">{bootstrap.errorMessage}</p>
          <button type="button" onClick={() => void bootstrap.refresh()}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="panel office-ops-page office-avatar-page">
        <header className="admin-header">
          <h1>Step-5 Avatar Agent Office Board</h1>
          <p>Avatar agent leads operations while Step-2~4 APIs and validation remain the source of truth.</p>
        </header>

        <TopOpsBar
          providers={bootstrap.providers}
          pools={bootstrap.pools}
          profiles={bootstrap.profiles}
          latestProbeRun={probe.latestRun}
          latestProbeState={latestProbeState}
        />

        <AvatarLayerBoundary>
          <AgentShell probeState={latestProbeState} event={agentEvent} />
        </AvatarLayerBoundary>

        <OfficeBoardScene
          accountPoolZone={
            <AccountPoolWidget
              pools={bootstrap.pools}
              selectedProvider={bootstrap.officeOpsState.selectedProvider}
              selectedAccountPoolId={bootstrap.officeOpsState.selectedAccountPoolId}
              onSelectProvider={(provider) => {
                bootstrap.setOfficeOpsState((previous) => ({
                  ...previous,
                  selectedProvider: provider,
                  selectedAccountPoolId: "",
                  selectedRuntimeProfileId: ""
                }));
                setAgentEvent({
                  type: "history-filter-changed",
                  provider,
                  accountPoolId: "",
                  runtimeProfileId: "",
                  limit: probe.historyLimit
                });
              }}
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
            />
          }
          runtimeProfileZone={
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
            />
          }
          probeMonitorZone={
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
            />
          }
          historyBoardZone={
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
            />
          }
        />

        <section className="card compact">
          <strong>Fallback Guarantee</strong>
          <p>If avatar presentation fails, account/profile/probe panels remain available for direct operations.</p>
        </section>
      </section>
    </main>
  );
}
