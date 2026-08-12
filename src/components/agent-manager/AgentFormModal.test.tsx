import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

function ModalHarness({
  initialForm = buildForm(),
  currentXp = 0,
  locale = "en",
}: {
  initialForm?: FormData;
  currentXp?: number;
  locale?: "ko" | "en";
}) {
  const [form, setForm] = useState<FormData>(initialForm);
  const tr: (ko: string, en: string, ja?: string, zh?: string) => string =
    locale === "ko" ? (ko) => ko : (_ko, en, ja = en, zh = en) => en ?? ja ?? zh;

  return (
    <AgentFormModal
      locale={locale}
      tr={tr}
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

describe("AgentFormModal canonical cutover", () => {
  it("localizes canonical and compatibility labels in Korean mode", async () => {
    render(<ModalHarness locale="ko" />);

    expect(screen.getByText("표준 정체성")).toBeInTheDocument();
    expect(screen.getByText("레거시 호환 정보")).toBeInTheDocument();
    expect(screen.getByLabelText("능력군")).toBeInTheDocument();
    expect(screen.getByLabelText("경력 단계")).toBeInTheDocument();
    expect(screen.getByLabelText("권한 레벨")).toBeInTheDocument();
    expect(screen.getAllByText(/저장됨|파생됨/).length).toBeGreaterThan(0);
    expect(screen.getByText(/해석된 정체성:/)).toHaveTextContent("백엔드 / 주니어");
    expect(screen.getByText("정책 메모")).toBeInTheDocument();
    expect(getPreviewTextarea().value).toContain("워크플로우 역할: 리뷰어");
  });

  it("shows canonical identity controls and compatibility mirrors", async () => {
    render(<ModalHarness />);

    expect(screen.getByText("Canonical Identity")).toBeInTheDocument();
    expect(screen.getByText("Legacy Compatibility")).toBeInTheDocument();
    expect(screen.getByLabelText("Family")).toBeInTheDocument();
    expect(screen.getByLabelText("Career Stage")).toBeInTheDocument();
    expect(screen.getByLabelText("Authority Level")).toBeInTheDocument();
    expect(screen.getByLabelText("Specialization Key")).toBeInTheDocument();
    expect(screen.getByLabelText("Execution Capability Profile")).toBeInTheDocument();
    expect(screen.getAllByText("Junior").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reviewer").length).toBeGreaterThan(0);
    expect(getPreviewTextarea().value).toContain("Role template: 주니어");
  });

  it("updates the generated prompt preview immediately when sliders change", async () => {
    render(<ModalHarness currentXp={920} />);

    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "5" } });
    fireEvent.change(sliders[1], { target: { value: "5" } });

    await waitFor(() => {
      expect(getPreviewTextarea().value).toContain("Execution Expert(5)");
    });
  });

  it("switches canonical identity source to stored when canonical fields are edited", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.selectOptions(screen.getByLabelText("Family"), "reviewer");
    await user.selectOptions(screen.getByLabelText("Career Stage"), "team-lead");
    await user.clear(screen.getByLabelText("Authority Level"));
    await user.type(screen.getByLabelText("Authority Level"), "4");
    await user.type(screen.getByLabelText("Specialization Key"), "security.audit");

    await waitFor(() => {
      expect(screen.getAllByText("stored").length).toBeGreaterThan(0);
      expect(screen.getByText(/Resolved identity:/)).toHaveTextContent("Reviewer / Team Lead");
    });
  });

  it("keeps provider-specific model controls out of the modal for codex", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.selectOptions(screen.getByLabelText("CLI Provider"), "codex");

    expect(
      screen.getByText("Model and reasoning selection are controlled by centralized provider policy."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Codex Model")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reasoning Level")).not.toBeInTheDocument();
  });

  it("keeps provider-specific model controls out of the modal for agy", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.selectOptions(screen.getByLabelText("CLI Provider"), "agy");

    expect(
      screen.getByText("Model and reasoning selection are controlled by centralized provider policy."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("AGY Model")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reasoning Level")).not.toBeInTheDocument();
  });
});
