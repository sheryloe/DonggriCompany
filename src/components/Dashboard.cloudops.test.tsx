import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

vi.mock("../api/control-plane", () => ({
  getControlPlaneState: vi.fn().mockResolvedValue({
    root: { repo_estate_root: { path: "G:/Donggri_DevDrive/repos" } },
    active_spec: { id: "20260528-dongri-grigri-8bit-office-restoration-v1", phase: "implementation" },
    dongri_grigri: {
      project_operators: [{ enabled: true }, { enabled: true }, { enabled: false }],
      master_departments: [{}, {}, {}, {}, {}, {}],
    },
    memory: { health: { available: false } },
  }),
}));

describe("Dashboard office copy", () => {
  it("uses office-screen language and removes CloudOps/tycoon copy", async () => {
    render(
      <Dashboard
        stats={null}
        agents={[]}
        tasks={[]}
        companyName="Dongri-grigri"
        onPrimaryCtaClick={vi.fn()}
        onOpenControlPlane={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Dongri-grigri 사무실" })).toBeInTheDocument();
    expect(screen.getByText("8bit Office Screen")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "OPS 관제 코너 모델" })).toBeInTheDocument();
    expect(screen.getByText("운영 현황")).toBeInTheDocument();
    expect(await screen.findByText("Root Control")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사무실 열기" })).toBeInTheDocument();
    expect(screen.queryByText("Department rooms")).not.toBeInTheDocument();
    expect(screen.queryByText("CloudOps")).not.toBeInTheDocument();
    expect(screen.queryByText("타이쿤")).not.toBeInTheDocument();
  });
});
