import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkflowPacksTab from "./WorkflowPacksTab";

const apiMocks = vi.hoisted(() => ({
  getWorkflowPacks: vi.fn(),
  updateWorkflowPack: vi.fn(),
}));

vi.mock("../../api", () => ({
  getWorkflowPacks: apiMocks.getWorkflowPacks,
  updateWorkflowPack: apiMocks.updateWorkflowPack,
}));

describe("WorkflowPacksTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getWorkflowPacks.mockResolvedValue({
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
          created_at: 1,
          updated_at: 1,
        },
      ],
    });
    apiMocks.updateWorkflowPack.mockResolvedValue({
      ok: true,
      pack: {
        key: "development",
        name: "Development Updated",
        enabled: false,
        routing_keywords: ["ship"],
        input_schema: { required: ["task", "owner"] },
        prompt_preset: { system: "Updated" },
        qa_rules: { checklist: ["tests", "lint"] },
        output_template: { sections: ["summary", "risks"] },
        cost_profile: { tier: "lean" },
        created_at: 1,
        updated_at: 2,
      },
    });
  });

  it("loads packs and saves validated JSON payloads", async () => {
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={(messages) => messages.en} />);

    await waitFor(() => {
      expect(screen.getByText("development")).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Development Updated");
    fireEvent.change(screen.getByLabelText("Routing keywords"), { target: { value: '["ship"]' } });
    fireEvent.change(screen.getByLabelText("Input schema"), { target: { value: '{"required":["task","owner"]}' } });
    fireEvent.change(screen.getByLabelText("Prompt preset"), { target: { value: '{"system":"Updated"}' } });
    fireEvent.change(screen.getByLabelText("QA rules"), { target: { value: '{"checklist":["tests","lint"]}' } });
    fireEvent.change(screen.getByLabelText("Output template"), {
      target: { value: '{"sections":["summary","risks"]}' },
    });
    fireEvent.change(screen.getByLabelText("Cost profile"), { target: { value: '{"tier":"lean"}' } });
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Save pack" }));

    await waitFor(() => {
      expect(apiMocks.updateWorkflowPack).toHaveBeenCalledWith("development", {
        name: "Development Updated",
        enabled: false,
        routing_keywords: ["ship"],
        input_schema: { required: ["task", "owner"] },
        prompt_preset: { system: "Updated" },
        qa_rules: { checklist: ["tests", "lint"] },
        output_template: { sections: ["summary", "risks"] },
        cost_profile: { tier: "lean" },
      });
    });

    expect(screen.getByText("Workflow pack policy saved.")).toBeInTheDocument();
  });

  it("blocks save when JSON is invalid", async () => {
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={(messages) => messages.en} />);

    await waitFor(() => {
      expect(screen.getByText("development")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("QA rules"), { target: { value: "{invalid" } });
    await user.click(screen.getByRole("button", { name: "Save pack" }));

    expect(apiMocks.updateWorkflowPack).not.toHaveBeenCalled();
    expect(screen.getByText("Fix JSON validation errors before saving.")).toBeInTheDocument();
    expect(screen.getByText("Enter valid JSON.")).toBeInTheDocument();
  });
});
