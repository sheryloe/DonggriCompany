import { useEffect, useState } from "react";

import type {
  AccountPoolView,
  ProviderUsageProbeProvider,
  RuntimeProfileView
} from "@workspace/shared";
import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";

type RuntimeProfileDraft = {
  key: string;
  accountPoolId: string;
  profilePath: string;
  status: string;
};

type RuntimeProfileWidgetProps = {
  profiles: RuntimeProfileView[];
  pools: AccountPoolView[];
  selectedProvider: ProviderUsageProbeProvider;
  selectedRuntimeProfileId: string;
  selectedRuntimeProfileKey: string | null;
  onSelectRuntimeProfile: (runtimeProfileId: string) => void;
  createDraft: RuntimeProfileDraft;
  updateDraft: RuntimeProfileDraft;
  onChangeCreateDraft: (next: RuntimeProfileDraft) => void;
  onChangeUpdateDraft: (next: RuntimeProfileDraft) => void;
  isMutating: boolean;
  errorMessage: string | null;
  actionMessage: string | null;
  onCreate: () => void;
  onUpdate: () => void;
  onDelete: () => Promise<boolean>;
  onDeleteIntent?: (runtimeProfileKey: string) => void;
  onDeleteCancel?: () => void;
  t?: OfficeTranslator;
};

export function RuntimeProfileWidget({
  profiles,
  pools,
  selectedProvider,
  selectedRuntimeProfileId,
  selectedRuntimeProfileKey,
  onSelectRuntimeProfile,
  createDraft,
  updateDraft,
  onChangeCreateDraft,
  onChangeUpdateDraft,
  isMutating,
  errorMessage,
  actionMessage,
  onCreate,
  onUpdate,
  onDelete,
  onDeleteIntent,
  onDeleteCancel,
  t = createOfficeTranslator("en")
}: RuntimeProfileWidgetProps): JSX.Element {
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const filteredPools = pools.filter((pool) => pool.provider === selectedProvider);
  const filteredProfiles = profiles.filter((profile) => profile.provider === selectedProvider);

  useEffect(() => {
    setIsDeleteConfirmOpen(false);
  }, [selectedRuntimeProfileId]);

  const onConfirmDelete = async (): Promise<void> => {
    const deleted = await onDelete();
    if (deleted) {
      setIsDeleteConfirmOpen(false);
    }
  };

  const onOpenDeleteConfirm = (): void => {
    setIsDeleteConfirmOpen(true);
    if (selectedRuntimeProfileId) {
      onDeleteIntent?.(selectedRuntimeProfileKey ?? selectedRuntimeProfileId);
    }
  };

  return (
    <section className="card office-widget">
      <header>
        <h2>{t("widget.runtime.title")}</h2>
      </header>

      <div className="form-grid two-cols">
        <label>
          <span>{t("widget.runtime.profile")}</span>
          <select
            value={selectedRuntimeProfileId}
            onChange={(event) => onSelectRuntimeProfile(event.target.value)}
            disabled={isMutating}
          >
            <option value="">{t("widget.runtime.none")}</option>
            {filteredProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.key}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-grid two-cols">
        <label>
          <span>{t("widget.runtime.createKey")}</span>
          <input
            value={createDraft.key}
            onChange={(event) => onChangeCreateDraft({ ...createDraft, key: event.target.value })}
            placeholder="codex-new-profile"
            disabled={isMutating}
          />
        </label>
        <label>
          <span>{t("widget.runtime.createPool")}</span>
          <select
            value={createDraft.accountPoolId}
            onChange={(event) => onChangeCreateDraft({ ...createDraft, accountPoolId: event.target.value })}
            disabled={isMutating}
          >
            <option value="">{t("widget.runtime.selectPool")}</option>
            {filteredPools.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.key}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("widget.runtime.createPath")}</span>
          <input
            value={createDraft.profilePath}
            onChange={(event) => onChangeCreateDraft({ ...createDraft, profilePath: event.target.value })}
            placeholder=".codex/profiles/new"
            disabled={isMutating}
          />
        </label>
        <label>
          <span>{t("widget.runtime.createStatus")}</span>
          <input
            value={createDraft.status}
            onChange={(event) => onChangeCreateDraft({ ...createDraft, status: event.target.value })}
            placeholder="active"
            disabled={isMutating}
          />
        </label>
      </div>
      <button type="button" onClick={onCreate} disabled={isMutating}>
        {isMutating ? t("widget.runtime.submitting") : t("widget.runtime.create")}
      </button>
      <p className="hint">Create requires provider/pool consistency and a lower-case key.</p>

      <div className="form-grid two-cols">
        <label>
          <span>{t("widget.runtime.updateKey")}</span>
          <input
            value={updateDraft.key}
            onChange={(event) => onChangeUpdateDraft({ ...updateDraft, key: event.target.value })}
            placeholder="optional"
            disabled={isMutating}
          />
        </label>
        <label>
          <span>{t("widget.runtime.updatePool")}</span>
          <select
            value={updateDraft.accountPoolId}
            onChange={(event) => onChangeUpdateDraft({ ...updateDraft, accountPoolId: event.target.value })}
            disabled={isMutating}
          >
            <option value="">(keep current)</option>
            {filteredPools.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.key}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("widget.runtime.updatePath")}</span>
          <input
            value={updateDraft.profilePath}
            onChange={(event) => onChangeUpdateDraft({ ...updateDraft, profilePath: event.target.value })}
            placeholder="optional"
            disabled={isMutating}
          />
        </label>
        <label>
          <span>{t("widget.runtime.updateStatus")}</span>
          <input
            value={updateDraft.status}
            onChange={(event) => onChangeUpdateDraft({ ...updateDraft, status: event.target.value })}
            placeholder="optional"
            disabled={isMutating}
          />
        </label>
      </div>

      <div className="row-actions">
        <button type="button" className="secondary" onClick={onUpdate} disabled={isMutating || !selectedRuntimeProfileId}>
          {t("widget.runtime.update")}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onOpenDeleteConfirm}
          disabled={isMutating || !selectedRuntimeProfileId}
        >
          {t("widget.runtime.delete")}
        </button>
      </div>

      {isDeleteConfirmOpen ? (
        <div className="card compact danger-box">
          <strong>{t("widget.runtime.confirmTitle")}</strong>
          <p>
            Delete runtime profile <code>{selectedRuntimeProfileKey ?? selectedRuntimeProfileId}</code>? This cannot be
            undone.
          </p>
          <div className="row-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setIsDeleteConfirmOpen(false);
                onDeleteCancel?.();
              }}
              disabled={isMutating}
            >
              {t("widget.runtime.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void onConfirmDelete()}
              disabled={isMutating}
            >
              {isMutating ? t("widget.runtime.deleting") : t("widget.runtime.confirmDelete")}
            </button>
          </div>
        </div>
      ) : null}

      {errorMessage ? <p className="error">{errorMessage}</p> : null}
      {actionMessage ? <p className="hint">{actionMessage}</p> : null}

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Pool</th>
              <th>Status</th>
              <th>Path</th>
            </tr>
          </thead>
          <tbody>
            {filteredProfiles.map((profile) => (
              <tr key={profile.id}>
                <td>{profile.key}</td>
                <td>{profile.accountPoolId ?? "-"}</td>
                <td>{profile.status}</td>
                <td className="mono">{profile.profilePath ?? "-"}</td>
              </tr>
            ))}
            {filteredProfiles.length === 0 ? (
              <tr>
                <td colSpan={4}>{t("widget.runtime.empty")}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
