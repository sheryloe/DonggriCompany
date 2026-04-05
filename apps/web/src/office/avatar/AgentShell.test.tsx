import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentShell } from "./AgentShell";

describe("AgentShell guidance", () => {
  it("renders bootstrap guidance on first load", () => {
    render(<AgentShell probeState="no-signal" event={{ type: "bootstrap-loading" }} />);
    expect(screen.getAllByText("Command deck booting").length).toBeGreaterThan(0);
    expect(screen.getByText("When loading ends, set pool/profile first, then run the baseline probe.")).not.toBeNull();
  });

  it("renders delete confirmation guidance", () => {
    render(
      <AgentShell
        probeState="success"
        event={{ type: "runtime-delete-intent", key: "codex-main" }}
      />
    );
    expect(screen.getAllByText("Destructive action locked").length).toBeGreaterThan(0);
    expect(screen.getByText("runtime profile 'codex-main' deletion is requested.")).not.toBeNull();
  });

  it("renders filter change guidance", () => {
    render(
      <AgentShell
        probeState="partial"
        event={{
          type: "history-filter-changed",
          provider: "codex",
          accountPoolId: "pool-1",
          runtimeProfileId: "profile-1",
          limit: 5
        }}
      />
    );
    expect(screen.getAllByText("Filter context updated").length).toBeGreaterThan(0);
    expect(screen.getByText("provider=codex, pool=pool-1, profile=profile-1, limit=5 applied.")).not.toBeNull();
  });

  it("announces only the summary line in live region", () => {
    const { container } = render(<AgentShell probeState="success" event={{ type: "idle" }} />);
    const live = container.querySelector(".agent-speech-live");
    expect(live).not.toBeNull();
    expect(live?.getAttribute("aria-live")).toBe("polite");
  });

  it("renders speech-only variant without avatar status presenter", () => {
    const { container } = render(
      <AgentShell probeState="success" event={{ type: "idle" }} variant="speech-only" />
    );
    expect(container.querySelector(".agent-status")).toBeNull();
    expect(container.querySelector(".agent-speech")).not.toBeNull();
  });
});
