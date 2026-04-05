import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TycoonEventLogPanel } from "./TycoonEventLogPanel";

describe("TycoonEventLogPanel accessibility", () => {
  it("exposes a live log region", () => {
    render(
      <TycoonEventLogPanel
        events={[
          {
            id: "evt-1",
            tick: 12,
            category: "system",
            message: "HUD committed: runProbe"
          }
        ]}
      />
    );

    const log = screen.getByRole("log");
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(log.getAttribute("aria-relevant")).toBe("additions text");
  });
});
