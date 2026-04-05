import { useEffect, useMemo, useState } from "react";
import type { ProviderProbeRunView } from "@workspace/shared";

import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";
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
  t?: OfficeTranslator;
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
  onHistoryLimitChange,
  t = createOfficeTranslator("en")
}: HistoryBoardProps): JSX.Element {
  const refreshLabel = errorMessage ? t("widget.history.retry") : t("widget.history.refresh");
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [isReplayRunning, setIsReplayRunning] = useState<boolean>(false);

  const replayRuns = useMemo(() => historyRuns.slice(0, historyLimit), [historyLimit, historyRuns]);
  const replayItem = replayRuns[replayIndex] ?? null;

  useEffect(() => {
    setReplayIndex(0);
    setIsReplayRunning(false);
  }, [provider, accountPoolId, runtimeProfileId, historyLimit]);

  useEffect(() => {
    setReplayIndex((previous) => {
      if (replayRuns.length === 0) {
        return 0;
      }
      return Math.min(previous, replayRuns.length - 1);
    });
    setIsReplayRunning(false);
  }, [replayRuns]);

  useEffect(() => {
    if (!isReplayRunning || replayRuns.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      setReplayIndex((previous) => {
        if (previous + 1 >= replayRuns.length) {
          return 0;
        }
        return previous + 1;
      });
    }, 1200);

    return () => clearInterval(timer);
  }, [isReplayRunning, replayRuns.length]);

  return (
    <section className="card office-widget" aria-busy={isHistoryLoading}>
      <header>
        <h2>{t("widget.history.title")}</h2>
      </header>

      <div className="history-filter-lock" aria-label="history filter context">
        <p>{t("widget.history.contextProvider", { provider })}</p>
        <p>{t("widget.history.contextPool", { pool: accountPoolId || "-" })}</p>
        <p>{t("widget.history.contextProfile", { profile: runtimeProfileId || "-" })}</p>
      </div>

      <div className="row-actions">
        <button type="button" className="secondary" onClick={onRefresh} disabled={isHistoryLoading}>
          {isHistoryLoading ? t("widget.history.refreshing") : refreshLabel}
        </button>
      </div>

      <div className="form-grid two-cols">
        <label>
          <span>{t("widget.history.limit")}</span>
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

      <section className="history-replay card compact" aria-label="history timeline replay">
        <header>
          <h3>{t("widget.history.timeline")}</h3>
          <span>
            {replayRuns.length === 0 ? "0/0" : `${replayIndex + 1}/${replayRuns.length}`}
          </span>
        </header>
        <p className="hint" aria-live="polite">
          {replayRuns.length === 0
            ? "Replay frame 0 of 0."
            : `Replay frame ${replayIndex + 1} of ${replayRuns.length}: ${replayItem?.status ?? "n/a"}.`}
        </p>
        {replayItem ? (
          <p className="mono">
            {replayItem.id} | {replayItem.status} | {replayItem.finishedAt ?? replayItem.startedAt}
          </p>
        ) : (
          <p className="hint">No replay items.</p>
        )}
        <div className="row-actions">
          <button
            type="button"
            className="secondary"
            disabled={replayRuns.length <= 1}
            onClick={() => setIsReplayRunning((previous) => !previous)}
          >
            {isReplayRunning ? t("widget.history.pause") : t("widget.history.play")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={replayRuns.length === 0}
            onClick={() => {
              setReplayIndex(0);
              setIsReplayRunning(false);
            }}
          >
            {t("widget.history.reset")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={replayRuns.length <= 1}
            onClick={() => setReplayIndex((previous) => (previous + 1) % replayRuns.length)}
          >
            {t("widget.history.next")}
          </button>
        </div>
      </section>

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
            ) : replayRuns.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  No probe history for current filters. Run probe or widen filters (provider/pool/profile/limit).
                </td>
              </tr>
            ) : (
              replayRuns.map((run) => (
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
