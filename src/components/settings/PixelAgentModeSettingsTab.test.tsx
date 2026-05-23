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
  it("saves the pixel agent mode settings", async () => {
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

    await user.click(screen.getByRole("button", { name: "픽셀 에이전트 모드" }));
    await user.click(screen.getByRole("button", { name: /쇼케이스/ }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(persistSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelAgentMode: {
          enabled: true,
          density: "showcase",
          officeTheme: "donggri_cloud_lab",
        },
      }),
    );
  });
});
