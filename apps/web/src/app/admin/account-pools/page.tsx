"use client";

import { useEffect, useState } from "react";

import type { AccountPoolView, CreateAccountPoolRequest } from "@workspace/shared";

import {
  ApiClientError,
  createAccountPool,
  listAccountPools,
  runProviderUsageProbe,
  updateAccountPool
} from "../../../lib/api";

const toErrorMessage = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "Unexpected error";
};

const defaultCreateForm: CreateAccountPoolRequest = {
  key: "",
  provider: "codex",
  label: "",
  fatigueMode: "derived",
  maxConcurrency: 2
};

export default function AdminAccountPoolsPage(): JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pools, setPools] = useState<AccountPoolView[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateAccountPoolRequest>(defaultCreateForm);

  const load = async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await listAccountPools();
      setPools(response.pools);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onToggleEnabled = async (pool: AccountPoolView): Promise<void> => {
    setIsSaving(true);
    setActionMessage(null);
    setErrorMessage(null);
    try {
      await updateAccountPool(pool.id, { isEnabled: !pool.isEnabled });
      await load();
      setActionMessage(`Updated ${pool.key}`);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const onRunProbe = async (pool: AccountPoolView): Promise<void> => {
    setIsSaving(true);
    setActionMessage(null);
    setErrorMessage(null);
    try {
      await runProviderUsageProbe({
        provider: pool.provider,
        accountPoolId: pool.id,
        persistSnapshot: true
      });
      await load();
      setActionMessage(`Probe completed for ${pool.key}`);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const onCreatePool = async (): Promise<void> => {
    setIsSaving(true);
    setActionMessage(null);
    setErrorMessage(null);
    try {
      await createAccountPool(createForm);
      setCreateForm(defaultCreateForm);
      await load();
      setActionMessage("Account pool created");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main>
      <section className="panel admin-page">
        <header className="admin-header">
          <h1>Admin - Account Pools</h1>
          <p>Inspect fatigue status, enable or disable pools, and run manual usage probes.</p>
        </header>

        <section className="admin-form">
          <h2>Create Account Pool</h2>
          <div className="form-grid two-cols">
            <label>
              <span>Key</span>
              <input
                value={createForm.key}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, key: event.target.value }))}
                placeholder="codex-new-main"
              />
            </label>
            <label>
              <span>Label</span>
              <input
                value={createForm.label}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, label: event.target.value }))}
                placeholder="Codex New Main"
              />
            </label>
            <label>
              <span>Provider</span>
              <select
                value={createForm.provider}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    provider: event.target.value as CreateAccountPoolRequest["provider"]
                  }))
                }
              >
                <option value="claude">claude</option>
                <option value="codex">codex</option>
                <option value="gemini">gemini</option>
              </select>
            </label>
            <label>
              <span>Fatigue Mode</span>
              <select
                value={createForm.fatigueMode ?? "derived"}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    fatigueMode: event.target.value as NonNullable<CreateAccountPoolRequest["fatigueMode"]>
                  }))
                }
              >
                <option value="official">official</option>
                <option value="derived">derived</option>
                <option value="manual">manual</option>
              </select>
            </label>
          </div>
          <button type="button" onClick={() => void onCreatePool()} disabled={isSaving}>
            Create
          </button>
        </section>

        {errorMessage ? <p className="error">{errorMessage}</p> : null}
        {actionMessage ? <p className="hint">{actionMessage}</p> : null}

        {isLoading ? (
          <p>Loading pools...</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Provider</th>
                  <th>Fatigue</th>
                  <th>State</th>
                  <th>Precision</th>
                  <th>Enabled</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((pool) => (
                  <tr key={pool.id}>
                    <td>{pool.key}</td>
                    <td>{pool.provider}</td>
                    <td>{pool.latestFatigue ? `${pool.latestFatigue.normalizedPercent.toFixed(1)}%` : "-"}</td>
                    <td>{pool.latestFatigue?.fatigueState ?? "unknown"}</td>
                    <td>{pool.latestFatigue?.precision ?? pool.fatigueMode}</td>
                    <td>{pool.isEnabled ? "enabled" : "disabled"}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void onToggleEnabled(pool)}
                        disabled={isSaving}
                      >
                        {pool.isEnabled ? "Disable" : "Enable"}
                      </button>
                      <button type="button" className="secondary" onClick={() => void onRunProbe(pool)} disabled={isSaving}>
                        Probe
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
