import React from "react";
import { render, screen } from "@testing-library/react";
import type { ProviderProbeRunView } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { HistoryBoard } from "./HistoryBoard";

const makeRun = (
  partial: Partial<ProviderProbeRunView> & Pick<ProviderProbeRunView, "id" | "status">
): ProviderProbeRunView => ({
  provider: "codex",
  accountPoolId: "pool-1",
  runtimeProfileId: "profile-1",
  probeKind: "usage",
  precision: "official",
  degraded: false,
  ...partial,
  id: partial.id,
  status: partial.status,
  startedAt: partial.startedAt ?? "2026-04-03T00:00:00.000Z",
  finishedAt: partial.finishedAt ?? "2026-04-03T00:00:00.000Z"
});

const baseProps = {
  provider: "codex",
  accountPoolId: "pool-1",
  runtimeProfileId: "profile-1",
  historyLimit: 20,
  isHistoryLoading: false,
  historyRuns: [] as ProviderProbeRunView[],
  errorMessage: null,
  actionMessage: null,
  onRefresh: vi.fn(),
  onHistoryLimitChange: vi.fn()
};

describe("HistoryBoard", () => {
  it("renders loading and empty states", () => {
    const { rerender } = render(<HistoryBoard {...baseProps} isHistoryLoading />);
    expect(screen.getByText("Loading probe history...")).not.toBeNull();

    rerender(<HistoryBoard {...baseProps} isHistoryLoading={false} historyRuns={[]} />);
    expect(
      screen.getByText(
        "No probe history for current filters. Run probe or widen filters (provider/pool/profile/limit)."
      )
    ).not.toBeNull();
  });

  it("renders retry message and classified history states", () => {
    render(
      <HistoryBoard
        {...baseProps}
        errorMessage="history unavailable"
        historyRuns={[
          makeRun({ id: "run-success", status: "success" }),
          makeRun({
            id: "run-stale",
            status: "failure",
            startedAt: "2026-03-01T00:00:00.000Z",
            finishedAt: "2026-03-01T00:00:00.000Z"
          })
        ]}
      />
    );

    expect(screen.getByText("Retry History")).not.toBeNull();
    expect(screen.getByText("history unavailable Use retry to fetch probe history again.")).not.toBeNull();
    expect(screen.getAllByText("success").length).toBeGreaterThan(0);
    expect(screen.getByText("stale")).not.toBeNull();
  });
});
