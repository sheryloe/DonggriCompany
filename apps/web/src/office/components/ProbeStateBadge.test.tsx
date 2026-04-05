import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProbeStateBadge } from "./ProbeStateBadge";

describe("ProbeStateBadge", () => {
  it("renders all supported ui states", () => {
    const { rerender } = render(<ProbeStateBadge state="success" />);
    expect(screen.getByText("STABLE")).not.toBeNull();

    rerender(<ProbeStateBadge state="partial" />);
    expect(screen.getByText("VERIFY")).not.toBeNull();

    rerender(<ProbeStateBadge state="stale" />);
    expect(screen.getByText("STALE")).not.toBeNull();

    rerender(<ProbeStateBadge state="no-signal" />);
    expect(screen.getByText("NO SIGNAL")).not.toBeNull();

    rerender(<ProbeStateBadge state="error" />);
    expect(screen.getByText("ERROR")).not.toBeNull();
  });
});
