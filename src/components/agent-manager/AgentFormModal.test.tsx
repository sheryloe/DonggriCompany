import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api";
import { createPresetAgentProfile } from "../../agent-profile";
import type { Department } from "../../types";
import AgentFormModal from "./AgentFormModal";
import { BLANK } from "./constants";
import type { FormData } from "./types";

vi.mock("./EmojiPicker", () => ({
  default: ({ value }: { value: string }) => <div data-testid="emoji-picker">{value}</div>,
}));

const DEPARTMENTS: Department[] = [
  {
    id: "dev",
    name: "Development",
    name_ko: "개발",
    name_ja: "開発",
    name_zh: "开发",
    icon: "DEV",
    color: "#3b82f6",
    description: null,
    prompt: null,
    sort_order: 1,
    created_at: 1,
  },
];

function buildForm(overrides: Partial<FormData> = {}): FormData {
  const role = overrides.role ?? "junior";
  return {
    ...BLANK,
    ...overrides,
    role,
    personality: overrides.personality ?? "",
    specialties_text: overrides.specialties_text ?? "",
    agent_profile: overrides.agent_profile ?? createPresetAgentProfile(role),
  };
}

function ModalHarness({ initialForm = buildForm(), currentXp = 0 }: { initialForm?: FormData; currentXp?: number }) {
  const [form, setForm] = useState<FormData>(initialForm);

  return (
    <AgentFormModal
      isKo={false}
      locale="en"
      tr={(_ko, en) => en}
      form={form}
      setForm={setForm}
      cliAccountPools={[]}
      cliAccountPoolsLoading={false}
      departments={DEPARTMENTS}
      currentXp={currentXp}
      isEdit={false}
      saving={false}
      onSave={() => undefined}
      onClose={() => undefined}
    />
  );
}

function getPreviewTextarea(): HTMLTextAreaElement {
  const preview = document.querySelector("textarea[readonly]") as HTMLTextAreaElement | null;
  if (!preview) throw new Error("Generated prompt preview textarea not found");
  return preview;
}

describe("AgentFormModal agent profile builder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getCliModels").mockResolvedValue({
      codex: [
        {
          slug: "gpt-5.4",
          displayName: "GPT-5.4",
          reasoningLevels: [
            { effort: "low", description: "Fast" },
            { effort: "high", description: "Thorough" },
          ],
          defaultReasoningLevel: "high",
        },
      ],
      gemini: [
        {
          slug: "gemini-2.5-flash",
          displayName: "Gemini 2.5 Flash",
        },
      ],
    });
  });

  it("applies role presets and regenerates the preview", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "Senior" }));

    await waitFor(() => {
      expect(getPreviewTextarea().value).toContain("Role template: Senior");
      expect(getPreviewTextarea().value).toContain("Applied growth tier: 3/5");
    });
  });

  it("updates the generated prompt preview immediately when sliders change", async () => {
    render(<ModalHarness currentXp={920} />);

    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "5" } });
    fireEvent.change(sliders[1], { target: { value: "5" } });

    await waitFor(() => {
      expect(getPreviewTextarea().value).toContain("Applied growth tier: 5/5");
      expect(getPreviewTextarea().value).toContain("Execution Expert(5)");
    });
  });

  it("separates reviewer settings from author settings in the workflow form", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    expect(screen.getByText("Review Settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Review Lenses")).toBeInTheDocument();
    expect(screen.getByLabelText("Force 2-pass review")).toBeInTheDocument();
    expect(screen.queryByLabelText("Max Review Rounds")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Primary Author" }));

    await waitFor(() => {
      expect(screen.getByText("Author Settings")).toBeInTheDocument();
      expect(screen.getByLabelText("Max Review Rounds")).toBeInTheDocument();
      expect(screen.queryByLabelText("Review Lenses")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Force 2-pass review")).not.toBeInTheDocument();
      expect(getPreviewTextarea().value).toContain("2x role: Primary Author");
      expect(getPreviewTextarea().value).toContain("Max review rounds: 2");
    });
  });

  it("shows Codex plan mode only after a Codex model is explicitly selected", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "codex" }));

    expect(await screen.findByLabelText("Codex Model")).toBeInTheDocument();
    expect(screen.queryByLabelText("Codex Plan Mode")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Codex Model"), "gpt-5.4");

    await waitFor(() => {
      expect(screen.getByLabelText("Reasoning Level")).toBeInTheDocument();
      expect(screen.getByLabelText("Codex Plan Mode")).toBeInTheDocument();
    });
  });

  it("shows Gemini model selector without Codex-only controls", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "gemini" }));

    const geminiModelSelect = await screen.findByLabelText("Gemini Model");
    expect(geminiModelSelect).toBeInTheDocument();

    await user.selectOptions(geminiModelSelect, "gemini-2.5-flash");

    expect(screen.queryByLabelText("Reasoning Level")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Codex Plan Mode")).not.toBeInTheDocument();
  });
});
