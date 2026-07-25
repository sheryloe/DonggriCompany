import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getControlPlaneState, type ControlPlaneState } from "../api/control-plane";
import ControlPlaneSummaryCard from "./ControlPlaneSummaryCard";

vi.mock("../api/control-plane", () => ({
  getControlPlaneState: vi.fn(),
}));

function buildState(activeSpecs: Array<{ id: string; phase: string }> | undefined): ControlPlaneState {
  return {
    active_specs: activeSpecs,
    active_spec: { id: "legacy-spec", phase: "legacy-phase" },
    root: { repo_estate_root: { path: "G:\\Donggri_DevDrive\\repos" } },
    dongri_grigri: {
      project_operators: [],
      master_departments: [],
    },
    memory: { health: { available: false } },
  } as unknown as ControlPlaneState;
}

describe("ControlPlaneSummaryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses active_specs as the authoritative current spec", async () => {
    vi.mocked(getControlPlaneState).mockResolvedValue(buildState([{ id: "authoritative-spec", phase: "preflight" }]));

    render(<ControlPlaneSummaryCard />);

    expect(await screen.findByText("authoritative-spec")).toBeInTheDocument();
    expect(screen.getByText("preflight")).toBeInTheDocument();
    expect(screen.queryByText("legacy-spec")).not.toBeInTheDocument();
  });

  it("keeps the deprecated single-spec alias as a read compatibility fallback", async () => {
    vi.mocked(getControlPlaneState).mockResolvedValue(buildState(undefined));

    render(<ControlPlaneSummaryCard />);

    expect(await screen.findByText("legacy-spec")).toBeInTheDocument();
    expect(screen.getByText("legacy-phase")).toBeInTheDocument();
  });
});
