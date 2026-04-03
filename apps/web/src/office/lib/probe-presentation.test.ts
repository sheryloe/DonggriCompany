import { describe, expect, it } from "vitest";

import type { ProviderProbeRunView } from "@workspace/shared";

import { classifyProbeUiState, type ProbeUiState } from "./probe-ui-state";
import { mapProbeStateToPresentation } from "./probe-presentation";

const states: ProbeUiState[] = ["success", "partial", "stale", "no-signal", "error"];

describe("mapProbeStateToPresentation", () => {
  it("maps each probe ui state to avatar/board/copy presentation", () => {
    const mapped = states.map((state) => mapProbeStateToPresentation(state));
    expect(mapped).toEqual([
      { avatarMood: "calm", boardSignal: "stable", copyTone: "normal" },
      { avatarMood: "cautious", boardSignal: "mixed", copyTone: "caution" },
      { avatarMood: "sleepy", boardSignal: "dim", copyTone: "nudge" },
      { avatarMood: "disconnected", boardSignal: "muted", copyTone: "caution" },
      { avatarMood: "alert", boardSignal: "warning", copyTone: "critical" }
    ]);
  });

  it("stays consistent with classifyProbeUiState outputs", () => {
    const nowTimestamp = Date.parse("2026-04-03T00:00:00.000Z");
    const staleTimestamp = "2026-04-01T00:00:00.000Z";
    const runs: Array<ProviderProbeRunView | null> = [
      {
        id: "run-success",
        provider: "codex",
        accountPoolId: "pool-1",
        runtimeProfileId: "profile-1",
        probeKind: "usage",
        status: "success",
        precision: "official",
        degraded: false,
        startedAt: "2026-04-03T00:00:00.000Z",
        finishedAt: "2026-04-03T00:00:00.000Z"
      },
      {
        id: "run-partial",
        provider: "codex",
        accountPoolId: "pool-1",
        runtimeProfileId: "profile-1",
        probeKind: "usage",
        status: "partial",
        precision: "derived",
        degraded: true,
        startedAt: "2026-04-03T00:00:00.000Z",
        finishedAt: "2026-04-03T00:00:00.000Z"
      },
      {
        id: "run-stale",
        provider: "codex",
        accountPoolId: "pool-1",
        runtimeProfileId: "profile-1",
        probeKind: "usage",
        status: "failure",
        precision: null,
        degraded: true,
        startedAt: staleTimestamp,
        finishedAt: staleTimestamp
      },
      null
    ];

    for (const run of runs) {
      const state = classifyProbeUiState({
        run,
        nowTimestamp
      });
      expect(mapProbeStateToPresentation(state)).toBeDefined();
    }
  });
});
