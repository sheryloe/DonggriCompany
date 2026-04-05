import { describe, expect, it } from "vitest";

import type { ProviderProbeRunView } from "@workspace/shared";

import { PROBE_STALE_WINDOW_MS, PROBE_UI_PRIORITY, classifyProbeUiState } from "./probe-ui-state";

const buildRun = (overrides: Partial<ProviderProbeRunView>): ProviderProbeRunView => {
  return {
    id: "run-test",
    provider: "codex",
    accountPoolId: "pool-1",
    runtimeProfileId: "profile-1",
    probeKind: "usage",
    status: "success",
    precision: "official",
    degraded: false,
    startedAt: "2026-04-04T00:00:00.000Z",
    finishedAt: "2026-04-04T00:00:00.000Z",
    ...overrides
  };
};

describe("classifyProbeUiState", () => {
  it("marks stale before success when timestamp is outdated", () => {
    const run = buildRun({
      status: "success",
      finishedAt: "2026-04-01T00:00:00.000Z"
    });
    const nowTimestamp = Date.parse("2026-04-04T02:00:00.000Z");

    expect(nowTimestamp - Date.parse(run.finishedAt ?? run.startedAt)).toBeGreaterThan(PROBE_STALE_WINDOW_MS);
    expect(classifyProbeUiState({ run, nowTimestamp })).toBe("stale");
  });

  it("returns error when transport layer fails", () => {
    const run = buildRun({});
    expect(classifyProbeUiState({ run, errorMessage: "network down" })).toBe("error");
  });

  it("treats degraded or non-official precision as partial", () => {
    const degradedRun = buildRun({
      status: "success",
      degraded: true,
      finishedAt: "2026-04-04T00:00:00.000Z"
    });
    const derivedRun = buildRun({
      status: "success",
      degraded: false,
      precision: "derived",
      finishedAt: "2026-04-04T00:00:00.000Z"
    });
    const nowTimestamp = Date.parse("2026-04-04T01:00:00.000Z");

    expect(classifyProbeUiState({ run: degradedRun, nowTimestamp })).toBe("partial");
    expect(classifyProbeUiState({ run: derivedRun, nowTimestamp })).toBe("partial");
  });

  it("treats recent failure as error", () => {
    const run = buildRun({
      status: "failure",
      finishedAt: "2026-04-04T00:30:00.000Z"
    });
    const nowTimestamp = Date.parse("2026-04-04T01:00:00.000Z");
    expect(classifyProbeUiState({ run, nowTimestamp })).toBe("error");
  });

  it("keeps stale failure classified as error", () => {
    const run = buildRun({
      status: "failure",
      finishedAt: "2026-03-01T00:00:00.000Z"
    });
    const nowTimestamp = Date.parse("2026-04-04T01:00:00.000Z");
    expect(classifyProbeUiState({ run, nowTimestamp })).toBe("error");
  });

  it("treats invalid timestamp signals as no-signal", () => {
    const run = buildRun({
      status: "success",
      startedAt: "invalid-date",
      finishedAt: "invalid-date"
    });
    const nowTimestamp = Date.parse("2026-04-04T01:00:00.000Z");
    expect(classifyProbeUiState({ run, nowTimestamp })).toBe("no-signal");
  });

  it("keeps explicit priority contract stable", () => {
    expect(PROBE_UI_PRIORITY).toEqual(["error", "no-signal", "stale", "partial", "success"]);
  });
});
