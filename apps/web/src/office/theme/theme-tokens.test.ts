import { describe, expect, it } from "vitest";

import { officeThemeTokens } from "./theme-tokens";

describe("office theme tokens", () => {
  it("defines complete light/dark token sets", () => {
    const requiredKeys = [
      "shell",
      "panel",
      "panelStrong",
      "border",
      "borderStrong",
      "text",
      "muted",
      "accent",
      "accentSoft",
      "success"
    ] as const;

    for (const theme of ["light", "dark"] as const) {
      for (const key of requiredKeys) {
        expect(officeThemeTokens[theme][key]).toBeTruthy();
      }
    }
  });

  it("uses different shell tokens between light and dark", () => {
    expect(officeThemeTokens.light.shell).not.toBe(officeThemeTokens.dark.shell);
  });
});
