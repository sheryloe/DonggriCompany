import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import type { Agent, Department } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { useOfficeWorkflowPackChange } from "./useOfficeWorkflowPackChange";

vi.mock("../api", () => ({
  saveSettingsPatch: vi.fn(),
  getDepartments: vi.fn(),
  getAgents: vi.fn(),
  getSettings: vi.fn(),
}));

const planningDepartment: Department = {
  id: "planning",
  name: "Planning",
  name_ko: "기획",
  description: "Planning department",
  prompt: null,
  icon: "planning",
  color: "#58c4dd",
  sort_order: 2,
  created_at: 1,
  agent_count: 1,
};

const planningAgent: Agent = {
  id: "planning-lead",
  name: "Planning Lead",
  name_ko: "기획 리드",
  avatar_emoji: "P",
  role: "team_leader",
  department_id: "planning",
  cli_provider: "codex",
  status: "idle",
  current_task_id: null,
  personality: null,
  stats_tasks_done: 0,
  stats_xp: 0,
  created_at: 1,
};

function useHarness() {
  const [settings, setSettings] = useState<typeof DEFAULT_SETTINGS>({
    ...DEFAULT_SETTINGS,
    officeWorkflowPack: "development",
  });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const officePack = useOfficeWorkflowPackChange({
    settings,
    setSettings,
    setDepartments,
    setAgents,
  });

  return {
    settings,
    departments,
    agents,
    ...officePack,
  };
}

describe("useOfficeWorkflowPackChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("optimistically changes the pack and hydrates departments, agents, and settings", async () => {
    vi.mocked(api.saveSettingsPatch).mockResolvedValue(undefined);
    vi.mocked(api.getDepartments).mockResolvedValue([planningDepartment]);
    vi.mocked(api.getAgents).mockResolvedValue([planningAgent]);
    vi.mocked(api.getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      officeWorkflowPack: "report",
    });

    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.handleOfficeWorkflowPackChange("report");
    });

    expect(result.current.settings.officeWorkflowPack).toBe("report");

    await waitFor(() => {
      expect(result.current.departments).toEqual([planningDepartment]);
      expect(result.current.agents).toEqual([planningAgent]);
      expect(result.current.settings.officeWorkflowPack).toBe("report");
    });
    expect(api.saveSettingsPatch).toHaveBeenCalledWith({ officeWorkflowPack: "report" });
    expect(api.getDepartments).toHaveBeenCalledWith({ workflowPackKey: "report" });
  });

  it("rolls back the optimistic pack when saving fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.saveSettingsPatch).mockRejectedValue(new Error("save failed"));

    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.handleOfficeWorkflowPackChange("report");
    });

    expect(result.current.settings.officeWorkflowPack).toBe("report");

    await waitFor(() => {
      expect(result.current.settings.officeWorkflowPack).toBe("development");
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith("Save office workflow pack failed:", expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
});
