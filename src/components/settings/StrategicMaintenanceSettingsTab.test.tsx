import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StrategicMaintenanceSettingsTab from "./StrategicMaintenanceSettingsTab";
import type { LocalSettings } from "./types";

const apiMocks = vi.hoisted(() => ({
  getStrategicMaintenanceStatus: vi.fn(),
  runStrategicMaintenance: vi.fn(),
  sendStrategicMaintenanceTestEmail: vi.fn(),
}));

vi.mock("../../api", () => ({
  getStrategicMaintenanceStatus: apiMocks.getStrategicMaintenanceStatus,
  runStrategicMaintenance: apiMocks.runStrategicMaintenance,
  sendStrategicMaintenanceTestEmail: apiMocks.sendStrategicMaintenanceTestEmail,
}));

function makeSettings(): LocalSettings {
  return {
    companyName: "DonggriCompany",
    ceoName: "CEO",
    autoAssign: true,
    yoloMode: false,
    autoUpdateEnabled: false,
    oauthAutoSwap: true,
    theme: "dark",
    language: "ko",
    defaultProvider: "codex",
    strategicMaintenance: {
      enabled: false,
      cadence: "weekly",
      dayOfWeek: 1,
      hour: 9,
      timezone: "Asia/Seoul",
      createTasks: true,
      maxTasksPerRun: 5,
      emailEnabled: false,
      emailTo: [],
      emailCc: [],
    },
  };
}

describe("StrategicMaintenanceSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getStrategicMaintenanceStatus.mockResolvedValue({
      settings: makeSettings().strategicMaintenance,
      latestRun: null,
      nextRunAt: null,
      inFlight: false,
      gmail: {
        configured: false,
        authorized: false,
        sendScopeGranted: false,
        email: null,
        expiresAt: null,
        missingReason: "gmail_oauth_missing",
      },
    });
    apiMocks.runStrategicMaintenance.mockResolvedValue({
      id: "SM-20260513-abc123",
      status: "completed",
      email_status: "skipped",
    });
    apiMocks.sendStrategicMaintenanceTestEmail.mockResolvedValue({ ok: true, recipientCount: 1 });
  });

  it("saves scheduler and Gmail recipient settings", async () => {
    const user = userEvent.setup();
    const persistSettings = vi.fn();
    function Harness() {
      const [form, setForm] = useState<LocalSettings>(makeSettings());
      return (
        <StrategicMaintenanceSettingsTab
          t={(messages) => messages.ko}
          form={form}
          setForm={setForm}
          persistSettings={persistSettings}
        />
      );
    }

    render(<Harness />);

    await waitFor(() => expect(apiMocks.getStrategicMaintenanceStatus).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "주간 자동 점검" }));
    await user.type(screen.getByLabelText("Gmail 수신자"), "ops@example.com");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(persistSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        strategicMaintenance: expect.objectContaining({
          enabled: true,
          emailTo: ["ops@example.com"],
        }),
      }),
    );
  });

  it("runs a manual strategic maintenance check", async () => {
    const user = userEvent.setup();
    render(
      <StrategicMaintenanceSettingsTab
        t={(messages) => messages.ko}
        form={makeSettings()}
        setForm={vi.fn()}
        persistSettings={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "지금 점검" }));
    await waitFor(() => expect(apiMocks.runStrategicMaintenance).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/점검 실행 완료/)).toBeInTheDocument();
  });
});
