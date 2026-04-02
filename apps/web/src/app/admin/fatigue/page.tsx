"use client";

import { useEffect, useMemo, useState } from "react";

import type { AccountPoolView, FatigueSnapshotView } from "@workspace/shared";

import { ApiClientError, listAccountPoolFatigueHistory, listAccountPools } from "../../../lib/api";

const toErrorMessage = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "Unexpected error";
};

export default function AdminFatiguePage(): JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [pools, setPools] = useState<AccountPoolView[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>("");
  const [snapshots, setSnapshots] = useState<FatigueSnapshotView[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadPools = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await listAccountPools();
        if (!mounted) {
          return;
        }
        setPools(response.pools);
        const defaultPoolId = response.pools[0]?.id ?? "";
        setSelectedPoolId((previous) => previous || defaultPoolId);
      } catch (error) {
        if (mounted) {
          setErrorMessage(toErrorMessage(error));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadPools();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPoolId) {
      setSnapshots([]);
      return;
    }

    let mounted = true;
    const loadSnapshots = async () => {
      setErrorMessage(null);
      try {
        const response = await listAccountPoolFatigueHistory(selectedPoolId, 200);
        if (mounted) {
          setSnapshots(response.snapshots);
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(toErrorMessage(error));
        }
      }
    };

    void loadSnapshots();
    return () => {
      mounted = false;
    };
  }, [selectedPoolId]);

  const selectedPool = useMemo(
    () => pools.find((pool) => pool.id === selectedPoolId) ?? null,
    [pools, selectedPoolId]
  );

  return (
    <main>
      <section className="panel admin-page">
        <header className="admin-header">
          <h1>Admin - Fatigue</h1>
          <p>Inspect raw usage, normalized fatigue percent, and precision level by account pool.</p>
        </header>

        {errorMessage ? <p className="error">{errorMessage}</p> : null}

        {isLoading ? (
          <p>Loading pools...</p>
        ) : (
          <>
            <div className="form-grid one-col">
              <label>
                <span>Account Pool</span>
                <select
                  value={selectedPoolId}
                  onChange={(event) => setSelectedPoolId(event.target.value)}
                >
                  {pools.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.key}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="card compact">
              <strong>Selected Pool</strong>
              <p>{selectedPool?.key ?? "-"}</p>
              <p>provider: {selectedPool?.provider ?? "-"}</p>
              <p>fatigue mode: {selectedPool?.fatigueMode ?? "-"}</p>
            </div>

            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Observed At</th>
                    <th>Raw Usage</th>
                    <th>Raw Limit</th>
                    <th>Unit</th>
                    <th>Normalized %</th>
                    <th>State</th>
                    <th>Precision</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snapshot) => (
                    <tr key={snapshot.id}>
                      <td>{snapshot.observedAt}</td>
                      <td>{snapshot.rawUsageValue ?? "-"}</td>
                      <td>{snapshot.rawLimitValue ?? "-"}</td>
                      <td>{snapshot.rawUnit ?? "-"}</td>
                      <td>{snapshot.normalizedPercent.toFixed(1)}</td>
                      <td>{snapshot.fatigueState}</td>
                      <td>{snapshot.precision}</td>
                      <td>{snapshot.confidenceScore.toFixed(2)}</td>
                    </tr>
                  ))}
                  {snapshots.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No fatigue snapshots found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
