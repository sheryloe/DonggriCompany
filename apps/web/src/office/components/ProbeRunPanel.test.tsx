import React from "react";
import { render, screen } from "@testing-library/react";
import type { ProviderProbeRunView } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { ProbeRunPanel } from "./ProbeRunPanel";

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
  latestProbeRun: makeRun({ id: "latest", status: "success" }),
  latestProbeState: "success" as const,
  isRunning: false,
  errorMessage: null,
  actionMessage: null,
  onRun: vi.fn()
};

describe("ProbeRunPanel states", () => {
  it("renders retry affordance and error message", () => {
    render(<ProbeRunPanel {...baseProps} errorMessage="probe failed" />);
    expect(screen.getByText("Retry Probe")).not.toBeNull();
    expect(
      screen.getByText("probe failed Retry probe after checking provider/pool/profile selection.")
    ).not.toBeNull();
  });

  it("renders latest classified state and metadata", () => {
    render(
      <ProbeRunPanel
        {...baseProps}
        latestProbeState="partial"
        latestProbeRun={makeRun({ id: "latest-partial", status: "partial", precision: "derived", degraded: true })}
      />
    );

    expect(screen.getByText("partial")).not.toBeNull();
    expect(screen.getByText("precision: derived")).not.toBeNull();
    expect(screen.getByText("degraded: true")).not.toBeNull();
  });
});
