import React from "react";
import { act, render, screen } from "@testing-library/react";
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
  startedAt: partial.startedAt ?? new Date().toISOString(),
  finishedAt: partial.finishedAt ?? new Date().toISOString()
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
    expect(screen.getByRole("heading", { name: "Probe History" }).closest("section")?.getAttribute("aria-busy")).toBe("true");

    rerender(<HistoryBoard {...baseProps} isHistoryLoading={false} historyRuns={[]} />);
    expect(
      screen.getByText(
        "No probe history for current filters. Run probe or widen filters (provider/pool/profile/limit)."
      )
    ).not.toBeNull();
    expect(screen.getByText("context lock: provider=codex")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Probe History" }).closest("section")?.getAttribute("aria-busy")).toBe("false");
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
    expect(screen.getAllByText("STABLE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ERROR").length).toBeGreaterThan(0);
  });

  it("replays timeline frames with controls", () => {
    vi.useFakeTimers();
    render(
      <HistoryBoard
        {...baseProps}
        historyRuns={[
          makeRun({ id: "run-1", status: "success", finishedAt: "2026-04-05T01:00:00.000Z" }),
          makeRun({ id: "run-2", status: "partial", finishedAt: "2026-04-05T01:05:00.000Z" })
        ]}
      />
    );

    expect(screen.getByText("1/2")).not.toBeNull();

    act(() => {
      screen.getByRole("button", { name: "Play Replay" }).click();
    });
    act(() => {
      vi.advanceTimersByTime(1300);
    });

    expect(screen.getByText("2/2")).not.toBeNull();
    vi.useRealTimers();
  });

  it("uses the same limited dataset for replay and table", () => {
    render(
      <HistoryBoard
        {...baseProps}
        historyLimit={1}
        historyRuns={[
          makeRun({ id: "run-1", status: "success", finishedAt: "2026-04-05T01:00:00.000Z" }),
          makeRun({ id: "run-2", status: "partial", finishedAt: "2026-04-05T01:05:00.000Z" })
        ]}
      />
    );

    expect(screen.getByText("1/1")).not.toBeNull();
    expect(screen.getByText("run-1 | success | 2026-04-05T01:00:00.000Z")).not.toBeNull();
    expect(screen.queryByText("run-2")).toBeNull();
  });

  it("rewinds and pauses replay when reset is pressed", () => {
    vi.useFakeTimers();
    render(
      <HistoryBoard
        {...baseProps}
        historyRuns={[
          makeRun({ id: "run-1", status: "success", finishedAt: "2026-04-05T01:00:00.000Z" }),
          makeRun({ id: "run-2", status: "partial", finishedAt: "2026-04-05T01:05:00.000Z" })
        ]}
      />
    );

    act(() => {
      screen.getByRole("button", { name: "Play Replay" }).click();
    });
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(screen.getByText("2/2")).not.toBeNull();

    act(() => {
      screen.getByRole("button", { name: "Reset Replay" }).click();
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText("1/2")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Play Replay" })).not.toBeNull();
    vi.useRealTimers();
  });

  it("clamps replay index when history runs are replaced", () => {
    const { rerender } = render(
      <HistoryBoard
        {...baseProps}
        historyRuns={[
          makeRun({ id: "run-1", status: "success", finishedAt: "2026-04-05T01:00:00.000Z" }),
          makeRun({ id: "run-2", status: "partial", finishedAt: "2026-04-05T01:05:00.000Z" }),
          makeRun({ id: "run-3", status: "success", finishedAt: "2026-04-05T01:10:00.000Z" })
        ]}
      />
    );

    act(() => {
      screen.getByRole("button", { name: "Next Frame" }).click();
      screen.getByRole("button", { name: "Next Frame" }).click();
    });
    expect(screen.getByText("3/3")).not.toBeNull();

    rerender(
      <HistoryBoard
        {...baseProps}
        historyRuns={[
          makeRun({ id: "run-1", status: "success", finishedAt: "2026-04-05T01:00:00.000Z" })
        ]}
      />
    );

    expect(screen.getByText("1/1")).not.toBeNull();
  });
});
