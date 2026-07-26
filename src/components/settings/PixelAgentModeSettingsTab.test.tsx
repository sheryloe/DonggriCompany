import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../types";
import PixelAgentModeSettingsTab from "./PixelAgentModeSettingsTab";
import type { LocalSettings } from "./types";

function makeSettings(): LocalSettings {
  return {
    ...(DEFAULT_SETTINGS as LocalSettings),
    companyName: "DonggriCompany",
    language: "ko",
  };
}

describe("PixelAgentModeSettingsTab", () => {
  it("saves pixel agent mode settings with the selected visual asset pack", async () => {
    const user = userEvent.setup();
    const persistSettings = vi.fn();

    function Harness() {
      const [form, setForm] = useState<LocalSettings>(makeSettings());
      return (
        <PixelAgentModeSettingsTab
          t={(messages) => messages.ko}
          form={form}
          setForm={setForm}
          persistSettings={persistSettings}
        />
      );
    }

    render(<Harness />);

    const initialButtons = screen.getAllByRole("button");
    await user.click(initialButtons[0]);
    await user.click(initialButtons[3]);
    await user.click(screen.getByRole("button", { name: /Visual V2/ }));
    await user.click(screen.getAllByRole("button").at(-1)!);

    expect(persistSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelAgentMode: expect.objectContaining({
          enabled: true,
          density: "showcase",
          officeTheme: "donggri_cloud_lab",
          visualAssetPack: "donggri_visual_v2",
        }),
      }),
    );
  });
});
