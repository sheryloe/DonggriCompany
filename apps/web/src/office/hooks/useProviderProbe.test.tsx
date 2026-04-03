import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  ProviderProbeRunView,
  ProviderUsageProbeRunResponse
} from "@workspace/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { classifyProbeUiState } from "../lib/probe-ui-state";
import { useProviderProbe } from "./useProviderProbe";

const apiMocks = vi.hoisted(() => ({
  listProviderUsageProbeHistory: vi.fn(),
  runProviderUsageProbe: vi.fn()
}));

vi.mock("../../lib/api/office-step2", () => ({
  listProviderUsageProbeHistory: apiMocks.listProviderUsageProbeHistory,
  runProviderUsageProbe: apiMocks.runProviderUsageProbe
}));

const now = "2026-04-03T00:00:00.000Z";
const stale = "2026-04-01T00:00:00.000Z";

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
  startedAt: partial.startedAt ?? now,
  finishedAt: partial.finishedAt ?? now
});

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value)
  };
};

describe("classifyProbeUiState", () => {
  it("classifies success/partial/stale/no-signal/error consistently", () => {
    const successRun = makeRun({ id: "success", status: "success" });
    const partialRun = makeRun({ id: "partial", status: "partial" });
    const staleRun = makeRun({
      id: "stale",
      status: "failure",
      startedAt: stale,
      finishedAt: stale
    });
    const nowTimestamp = Date.parse(now);

    expect(classifyProbeUiState({ run: successRun, nowTimestamp })).toBe("success");
    expect(classifyProbeUiState({ run: partialRun, nowTimestamp })).toBe("partial");
    expect(classifyProbeUiState({ run: staleRun, nowTimestamp })).toBe("stale");
    expect(classifyProbeUiState({ run: null, nowTimestamp })).toBe("no-signal");
    expect(classifyProbeUiState({ run: successRun, errorMessage: "failed", nowTimestamp })).toBe("error");
  });
});

describe("useProviderProbe", () => {
  beforeEach(() => {
    apiMocks.listProviderUsageProbeHistory.mockReset();
    apiMocks.runProviderUsageProbe.mockReset();
  });

  it("applies filters and limit when refreshing history", async () => {
    const run = makeRun({ id: "hist-1", status: "success" });
    apiMocks.listProviderUsageProbeHistory.mockResolvedValue({
      ok: true,
      runs: [run]
    });

    const { result } = renderHook(() =>
      useProviderProbe({
        getHistoryQuery: () => ({
          provider: "codex",
          accountPoolId: "pool-1",
          runtimeProfileId: "profile-1"
        })
      })
    );

    await act(async () => {
      await result.current.refreshHistory();
    });

    expect(apiMocks.listProviderUsageProbeHistory).toHaveBeenCalledWith({
      provider: "codex",
      accountPoolId: "pool-1",
      runtimeProfileId: "profile-1",
      limit: 20
    });
    expect(result.current.latestRun?.id).toBe("hist-1");

    await act(async () => {
      await result.current.changeHistoryLimit(5);
    });

    expect(result.current.historyLimit).toBe(5);
    expect(apiMocks.listProviderUsageProbeHistory).toHaveBeenLastCalledWith({
      provider: "codex",
      accountPoolId: "pool-1",
      runtimeProfileId: "profile-1",
      limit: 5
    });
  });

  it("handles run transitions and supports retry after history fetch error", async () => {
    const deferred = createDeferred<ProviderUsageProbeRunResponse>();
    const fallbackRun = makeRun({ id: "run-direct", status: "partial" });
    const historyRun = makeRun({ id: "run-history", status: "success" });

    apiMocks.runProviderUsageProbe.mockReturnValueOnce(deferred.promise);
    apiMocks.listProviderUsageProbeHistory
      .mockRejectedValueOnce(new Error("history unavailable"))
      .mockResolvedValueOnce({
        ok: true,
        runs: [historyRun]
      });

    const { result } = renderHook(() =>
      useProviderProbe({
        getHistoryQuery: () => ({
          provider: "codex"
        })
      })
    );

    let runPromise!: Promise<boolean>;
    act(() => {
      runPromise = result.current.runProbe({
        provider: "codex",
        persistSnapshot: true
      });
    });

    expect(result.current.isRunning).toBe(true);

    await act(async () => {
      deferred.resolve({
        ok: true,
        run: fallbackRun,
        usage: null,
        fatigueSnapshot: null
      });
      const completed = await runPromise;
      expect(completed).toBe(true);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.latestRun?.id).toBe("run-direct");
    expect(result.current.errorMessage).toBe("history unavailable");

    await act(async () => {
      await result.current.refreshHistory();
    });

    await waitFor(() => {
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.latestRun?.id).toBe("run-history");
    });
  });
});
