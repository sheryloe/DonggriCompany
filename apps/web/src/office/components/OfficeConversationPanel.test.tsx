import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { BOSS_COMMAND_STORAGE_KEY } from "../lib/office-console";
import { OfficeConversationPanel } from "./OfficeConversationPanel";

describe("OfficeConversationPanel", () => {
  beforeEach(() => {
    window.localStorage.removeItem(BOSS_COMMAND_STORAGE_KEY);
  });

  it("defaults to all-log tab with collapsed filter row", async () => {
    const user = userEvent.setup();
    render(
      <OfficeConversationPanel
        events={[
          {
            id: "evt-1",
            tick: 9,
            category: "system",
            message: "HUD committed: runProbe backend-success",
            actorId: "boss",
            speaker: "Boss"
          }
        ]}
        guidanceMessage={{
          headline: "Probe stable",
          body: "Signal aligned",
          primaryAction: "Proceed",
          supportingHint: "History in sync",
          riskLevel: "low"
        }}
        mainAgentName="CODEX Agent"
      />
    );

    expect(screen.getByTestId("all-log-panel")).not.toBeNull();
    expect(screen.queryByLabelText("Log filters")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show Filters" }));
    expect(screen.getByLabelText("Log filters")).not.toBeNull();
  });
});
