"use client";

import { useCallback, useEffect, useState } from "react";

import type { UpdateRuntimeProfileRequest } from "@workspace/shared";

import { AccountPoolWidget } from "../components/AccountPoolWidget";
import { ProbeRunPanel } from "../components/ProbeRunPanel";
import { RuntimeProfileWidget } from "../components/RuntimeProfileWidget";
import { TopOpsBar } from "../components/TopOpsBar";
import { classifyProbeUiState, useProviderProbe } from "../hooks/useProviderProbe";
import { useRuntimeProfileCrud } from "../hooks/useRuntimeProfileCrud";
import { useStep2OpsBootstrap } from "../hooks/useStep2OpsBootstrap";
import { toProbeHistoryQuery } from "../stores/officeOpsStore";

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

export default function OfficePage(): JSX.Element {
  const bootstrap = useStep2OpsBootstrap();
  const [createDraft, setCreateDraft] = useState<RuntimeProfileDraft>(emptyDraft);
  const [updateDraft, setUpdateDraft] = useState<RuntimeProfileDraft>(emptyDraft);

  const getHistoryQuery = useCallback(
    () => toProbeHistoryQuery(bootstrap.officeOpsState),
    [bootstrap.officeOpsState]
  );

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

  const selectedRuntimeProfile =
    bootstrap.profiles.find((profile) => profile.id === bootstrap.officeOpsState.selectedRuntimeProfileId) ?? null;

  const latestProbeState = classifyProbeUiState({
    run: probe.latestRun,
    errorMessage: probe.errorMessage
  });

  const onCreateRuntimeProfile = async (): Promise<void> => {
    const created = await runtimeCrud.createProfile({
      key: createDraft.key.trim(),
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

    await runtimeCrud.updateProfile(bootstrap.officeOpsState.selectedRuntimeProfileId, payload);
  };

  const onDeleteRuntimeProfile = async (): Promise<boolean> => {
    if (!bootstrap.officeOpsState.selectedRuntimeProfileId) {
      return false;
    }
    return runtimeCrud.removeProfile(bootstrap.officeOpsState.selectedRuntimeProfileId);
  };

  const onRunProbe = async (): Promise<void> => {
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

  if (bootstrap.isLoading) {
    return (
      <main>
        <section className="panel">
          <h1>Office Dashboard</h1>
          <p>Loading Step-3 bridge data...</p>
        </section>
      </main>
    );
  }

  if (bootstrap.errorMessage) {
    return (
      <main>
        <section className="panel">
          <h1>Office Dashboard</h1>
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
      <section className="panel office-ops-page">
        <header className="admin-header">
          <h1>Step-3 Office Bridge</h1>
          <p>Step-2 account pool/runtime profile/probe APIs are connected to the office layer.</p>
        </header>

        <TopOpsBar
          providers={bootstrap.providers}
          pools={bootstrap.pools}
          profiles={bootstrap.profiles}
          latestProbeRun={probe.latestRun}
          latestProbeState={latestProbeState}
        />

        <div className="office-ops-grid">
          <AccountPoolWidget
            pools={bootstrap.pools}
            selectedProvider={bootstrap.officeOpsState.selectedProvider}
            selectedAccountPoolId={bootstrap.officeOpsState.selectedAccountPoolId}
            onSelectProvider={(provider) =>
              bootstrap.setOfficeOpsState((previous) => ({
                ...previous,
                selectedProvider: provider,
                selectedAccountPoolId: "",
                selectedRuntimeProfileId: ""
              }))
            }
            onSelectAccountPool={(accountPoolId) =>
              bootstrap.setOfficeOpsState((previous) => ({
                ...previous,
                selectedAccountPoolId: accountPoolId,
                selectedRuntimeProfileId: ""
              }))
            }
          />

          <RuntimeProfileWidget
            profiles={bootstrap.profiles}
            pools={bootstrap.pools}
            selectedProvider={bootstrap.officeOpsState.selectedProvider}
            selectedRuntimeProfileId={bootstrap.officeOpsState.selectedRuntimeProfileId}
            selectedRuntimeProfileKey={selectedRuntimeProfile?.key ?? null}
            onSelectRuntimeProfile={(runtimeProfileId) =>
              bootstrap.setOfficeOpsState((previous) => ({
                ...previous,
                selectedRuntimeProfileId: runtimeProfileId
              }))
            }
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
          />
        </div>

        <ProbeRunPanel
          provider={bootstrap.officeOpsState.selectedProvider}
          accountPoolId={bootstrap.officeOpsState.selectedAccountPoolId}
          runtimeProfileId={bootstrap.officeOpsState.selectedRuntimeProfileId}
          latestProbeRun={probe.latestRun}
          latestProbeState={latestProbeState}
          isRunning={probe.isRunning}
          isHistoryLoading={probe.isHistoryLoading}
          historyLimit={probe.historyLimit}
          historyRuns={probe.historyRuns}
          errorMessage={probe.errorMessage}
          actionMessage={probe.actionMessage}
          onRun={() => void onRunProbe()}
          onRefresh={() => void onRefreshProbe()}
          onHistoryLimitChange={(nextLimit) => void probe.changeHistoryLimit(nextLimit)}
        />
      </section>
    </main>
  );
}
