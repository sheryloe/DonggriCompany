import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProbeStateBadge } from "./ProbeStateBadge";

describe("ProbeStateBadge", () => {
  it("renders all supported ui states", () => {
    const { rerender } = render(<ProbeStateBadge state="success" />);
    expect(screen.getByText("success")).not.toBeNull();

    rerender(<ProbeStateBadge state="partial" />);
    expect(screen.getByText("partial")).not.toBeNull();

    rerender(<ProbeStateBadge state="stale" />);
    expect(screen.getByText("stale")).not.toBeNull();

    rerender(<ProbeStateBadge state="no-signal" />);
    expect(screen.getByText("no-signal")).not.toBeNull();

    rerender(<ProbeStateBadge state="error" />);
    expect(screen.getByText("error")).not.toBeNull();
  });
});
