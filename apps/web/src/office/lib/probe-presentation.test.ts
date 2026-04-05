import { describe, expect, it } from "vitest";

import type { ProviderProbeRunView } from "@workspace/shared";

import { classifyProbeUiState, type ProbeUiState } from "./probe-ui-state";
import { mapProbeStateToPresentation } from "./probe-presentation";

const states: ProbeUiState[] = ["success", "partial", "stale", "no-signal", "error"];

describe("mapProbeStateToPresentation", () => {
  it("keeps semantic contract stable for all state keys", () => {
    for (const state of states) {
      const presentation = mapProbeStateToPresentation(state);
      expect(presentation.stateKey).toBe(state);
      expect(presentation.stateLabel.length).toBeGreaterThan(0);
      expect(presentation.hudLabel.length).toBeGreaterThan(0);
      expect(presentation.stateSummary.length).toBeGreaterThan(0);
      expect(presentation.emote.length).toBeGreaterThan(0);
      expect(presentation.confidenceHint).toMatch(/^(high|medium|low|none)$/);
      expect(presentation.copyTone).toMatch(/^(normal|caution|nudge|critical)$/);
      expect(presentation.motionPreset).toMatch(/^(steady|scan|drift|glitch|alarm)$/);
    }
  });

  it("stays compatible with classifier outputs including stale failures", () => {
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
        id: "run-stale-failure",
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
      const presentation = mapProbeStateToPresentation(state);
      expect(presentation.stateKey).toBe(state);
    }
  });
});
