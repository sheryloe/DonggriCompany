import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkflowPacksTab from "./WorkflowPacksTab";

const apiMocks = vi.hoisted(() => ({
  getWorkflowPacks: vi.fn(),
}));

vi.mock("../../api", () => ({
  getWorkflowPacks: apiMocks.getWorkflowPacks,
}));

describe("WorkflowPacksTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getWorkflowPacks.mockResolvedValue({
      source: "canonical_projection",
      readOnly: true,
      packs: [
        {
          key: "development",
          name: "Development",
          enabled: true,
          routing_keywords: ["ship", "build"],
          input_schema: { required: ["task"] },
          prompt_preset: { system: "Do the work" },
          qa_rules: { checklist: ["tests"] },
          output_template: { sections: ["summary"] },
          cost_profile: { tier: "standard" },
          required_artifacts: ["STATUS.md"],
          output_contract: ["summary"],
          base_key: "donggri",
          derived_from: "donggri",
          model_tier_preference: "tier-2",
          source_layer: "compiler",
        },
      ],
    });
  });

  it("renders canonical projection sections in read-only mode", async () => {
    render(<WorkflowPacksTab t={(messages) => messages.en} />);

    await waitFor(() => {
      expect(screen.getByText("Workflow Pack Inspector")).toBeInTheDocument();
      expect(screen.getByText("Development")).toBeInTheDocument();
      expect(screen.getByText("development")).toBeInTheDocument();
    });

    expect(screen.getByText("Read-only projection")).toBeInTheDocument();
    expect(screen.getByText("canonical_projection")).toBeInTheDocument();
    expect(screen.getByText("base:donggri")).toBeInTheDocument();
    expect(screen.getByText("derived:donggri")).toBeInTheDocument();
    expect(screen.getByText("tier:tier-2")).toBeInTheDocument();
    expect(screen.getByText("Routing Keywords")).toBeInTheDocument();
    expect(screen.getByText(/STATUS\.md/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save pack" })).not.toBeInTheDocument();
  });

  it("refreshes the projection", async () => {
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={(messages) => messages.en} />);

    await waitFor(() => {
      expect(apiMocks.getWorkflowPacks).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(apiMocks.getWorkflowPacks).toHaveBeenCalledTimes(2);
    });
  });
});
