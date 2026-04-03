import type { ProviderProbeRunView } from "@workspace/shared";

import { classifyProbeUiState } from "../lib/probe-ui-state";
import { ProbeStateBadge } from "../components/ProbeStateBadge";

type HistoryBoardProps = {
  provider: string;
  accountPoolId: string;
  runtimeProfileId: string;
  historyLimit: number;
  isHistoryLoading: boolean;
  historyRuns: ProviderProbeRunView[];
  errorMessage: string | null;
  actionMessage: string | null;
  onRefresh: () => void;
  onHistoryLimitChange: (nextLimit: number) => void;
};

export function HistoryBoard({
  provider,
  accountPoolId,
  runtimeProfileId,
  historyLimit,
  isHistoryLoading,
  historyRuns,
  errorMessage,
  actionMessage,
  onRefresh,
  onHistoryLimitChange
}: HistoryBoardProps): JSX.Element {
  const refreshLabel = errorMessage ? "Retry History" : "Refresh History";

  return (
    <section className="card office-widget">
      <header>
        <h2>Probe History</h2>
      </header>

      <p>provider filter: {provider}</p>
      <p>pool filter: {accountPoolId || "-"}</p>
      <p>profile filter: {runtimeProfileId || "-"}</p>

      <div className="row-actions">
        <button type="button" className="secondary" onClick={onRefresh} disabled={isHistoryLoading}>
          {isHistoryLoading ? "Refreshing..." : refreshLabel}
        </button>
      </div>

      <div className="form-grid two-cols">
        <label>
          <span>History Limit</span>
          <select
            aria-label="History Limit"
            value={String(historyLimit)}
            onChange={(event) => onHistoryLimitChange(Number(event.target.value))}
            disabled={isHistoryLoading}
          >
            <option value="1">1</option>
            <option value="5">5</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
      </div>

      {errorMessage ? (
        <p className="error">
          {errorMessage} Use retry to fetch probe history again.
        </p>
      ) : null}
      {actionMessage ? <p className="hint">{actionMessage}</p> : null}

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>UI State</th>
              <th>Result</th>
              <th>Precision</th>
              <th>Pool</th>
              <th>Profile</th>
              <th>Finished At</th>
            </tr>
          </thead>
          <tbody>
            {isHistoryLoading ? (
              <tr>
                <td colSpan={7}>Loading probe history...</td>
              </tr>
            ) : historyRuns.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  No probe history for current filters. Run probe or widen filters (provider/pool/profile/limit).
                </td>
              </tr>
            ) : (
              historyRuns.map((run) => (
                <tr key={run.id}>
                  <td>{run.provider}</td>
                  <td>
                    <ProbeStateBadge state={classifyProbeUiState({ run })} />
                  </td>
                  <td>{run.status}</td>
                  <td>{run.precision ?? "-"}</td>
                  <td>{run.accountPoolId ?? "-"}</td>
                  <td>{run.runtimeProfileId ?? "-"}</td>
                  <td>{run.finishedAt ?? run.startedAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
