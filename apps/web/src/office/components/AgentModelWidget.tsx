import { useEffect, useMemo, useState } from "react";

import type {
  AccountPoolView,
  AgentId,
  AgentModelAssignmentView,
  ProviderUsageProbeProvider,
  RuntimeProfileView
} from "@workspace/shared";

import { monitorActorDescriptors } from "../board/office-agents";
import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";

type DraftRow = {
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  runtimeProfileId: string;
};

type AgentModelWidgetProps = {
  pools: AccountPoolView[];
  profiles: RuntimeProfileView[];
  assignmentsByAgentId: Partial<Record<AgentId, AgentModelAssignmentView>>;
  defaultSelection: DraftRow;
  isMutating: boolean;
  errorMessage: string | null;
  actionMessage: string | null;
  onSave: (agentId: AgentId, payload: DraftRow) => Promise<void>;
  t?: OfficeTranslator;
};

const providers: ProviderUsageProbeProvider[] = ["claude", "codex", "gemini"];

const buildInitialDraftRows = (
  assignmentsByAgentId: Partial<Record<AgentId, AgentModelAssignmentView>>,
  fallback: DraftRow
): Record<AgentId, DraftRow> => {
  return monitorActorDescriptors.reduce(
    (accumulator, descriptor) => {
      const saved = assignmentsByAgentId[descriptor.id];
      accumulator[descriptor.id] = {
        provider: saved?.provider ?? fallback.provider,
        accountPoolId: saved?.accountPoolId ?? fallback.accountPoolId,
        runtimeProfileId: saved?.runtimeProfileId ?? fallback.runtimeProfileId
      };
      return accumulator;
    },
    {} as Record<AgentId, DraftRow>
  );
};

export function AgentModelWidget({
  pools,
  profiles,
  assignmentsByAgentId,
  defaultSelection,
  isMutating,
  errorMessage,
  actionMessage,
  onSave,
  t = createOfficeTranslator("en")
}: AgentModelWidgetProps): JSX.Element {
  const [draftRows, setDraftRows] = useState<Record<AgentId, DraftRow>>(() =>
    buildInitialDraftRows(assignmentsByAgentId, defaultSelection)
  );

  const syncKey = useMemo(() => {
    const base = monitorActorDescriptors
      .map((descriptor) => {
        const assignment = assignmentsByAgentId[descriptor.id];
        return `${descriptor.id}:${assignment?.provider ?? "-"}:${assignment?.accountPoolId ?? "-"}:${assignment?.runtimeProfileId ?? "-"}`;
      })
      .join("|");
    return `${defaultSelection.provider}:${defaultSelection.accountPoolId}:${defaultSelection.runtimeProfileId}|${base}`;
  }, [assignmentsByAgentId, defaultSelection.accountPoolId, defaultSelection.provider, defaultSelection.runtimeProfileId]);

  useEffect(() => {
    setDraftRows(buildInitialDraftRows(assignmentsByAgentId, defaultSelection));
  }, [assignmentsByAgentId, defaultSelection, syncKey]);

  return (
    <section className="card office-widget">
      <header>
        <h2>{t("widget.agentModel.title")}</h2>
      </header>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("widget.agentModel.agent")}</th>
              <th>{t("widget.agentModel.provider")}</th>
              <th>{t("widget.agentModel.pool")}</th>
              <th>{t("widget.agentModel.profile")}</th>
              <th>{t("widget.agentModel.action")}</th>
            </tr>
          </thead>
          <tbody>
            {monitorActorDescriptors.map((descriptor) => {
              const draft = draftRows[descriptor.id];
              const poolCandidates = pools.filter((pool) => pool.provider === draft.provider);
              const profileCandidates = profiles.filter(
                (profile) =>
                  profile.provider === draft.provider &&
                  profile.accountPoolId === draft.accountPoolId
              );

              return (
                <tr key={descriptor.id}>
                  <td>
                    <strong>{descriptor.displayName}</strong>
                    <p className="hint">{descriptor.roleLabel}</p>
                  </td>
                  <td>
                    <select
                      value={draft.provider}
                      onChange={(event) => {
                        const provider = event.target.value as ProviderUsageProbeProvider;
                        const nextPool = pools.find((pool) => pool.provider === provider)?.id ?? "";
                        const nextProfile =
                          profiles.find(
                            (profile) =>
                              profile.provider === provider &&
                              profile.accountPoolId === nextPool
                          )?.id ?? "";
                        setDraftRows((previous) => ({
                          ...previous,
                          [descriptor.id]: {
                            provider,
                            accountPoolId: nextPool,
                            runtimeProfileId: nextProfile
                          }
                        }));
                      }}
                    >
                      {providers.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={draft.accountPoolId}
                      onChange={(event) => {
                        const accountPoolId = event.target.value;
                        const nextProfile =
                          profiles.find(
                            (profile) =>
                              profile.provider === draft.provider &&
                              profile.accountPoolId === accountPoolId
                          )?.id ?? "";
                        setDraftRows((previous) => ({
                          ...previous,
                          [descriptor.id]: {
                            ...previous[descriptor.id],
                            accountPoolId,
                            runtimeProfileId: nextProfile
                          }
                        }));
                      }}
                    >
                      <option value="">{t("widget.account.none")}</option>
                      {poolCandidates.map((pool) => (
                        <option key={pool.id} value={pool.id}>
                          {pool.key}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={draft.runtimeProfileId}
                      onChange={(event) =>
                        setDraftRows((previous) => ({
                          ...previous,
                          [descriptor.id]: {
                            ...previous[descriptor.id],
                            runtimeProfileId: event.target.value
                          }
                        }))
                      }
                    >
                      <option value="">{t("widget.runtime.none")}</option>
                      {profileCandidates.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.key}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      disabled={
                        isMutating ||
                        !draft.accountPoolId ||
                        !draft.runtimeProfileId
                      }
                      onClick={() => void onSave(descriptor.id, draft)}
                    >
                      {isMutating ? t("widget.agentModel.saving") : t("widget.agentModel.save")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {actionMessage ? <p className="hint">{actionMessage}</p> : null}
      {errorMessage ? <p className="error">{errorMessage}</p> : null}
    </section>
  );
}
