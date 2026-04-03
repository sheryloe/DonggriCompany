import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AvatarLayerBoundary } from "./AvatarLayerBoundary";

function BrokenAvatar(): JSX.Element {
  throw new Error("avatar crashed");
}

describe("AvatarLayerBoundary", () => {
  it("renders fallback alert when avatar layer crashes", () => {
    render(
      <AvatarLayerBoundary>
        <BrokenAvatar />
      </AvatarLayerBoundary>
    );

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("Avatar layer is temporarily unavailable.")).not.toBeNull();
    expect(screen.getByText("Fallback panels remain active below for all operations.")).not.toBeNull();
  });
});
