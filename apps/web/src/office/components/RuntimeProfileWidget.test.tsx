import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AccountPoolView, RuntimeProfileView } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { RuntimeProfileWidget } from "./RuntimeProfileWidget";

const pools: AccountPoolView[] = [
  {
    id: "pool-1",
    key: "pool-1",
    provider: "codex",
    label: "Codex Pool",
    planTier: "pro",
    fatigueMode: "official",
    maxConcurrency: 2,
    isEnabled: true,
    notes: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    latestFatigue: null,
    runtimeProfiles: []
  }
];

const profiles: RuntimeProfileView[] = [
  {
    id: "profile-1",
    key: "codex-main",
    provider: "codex",
    accountPoolId: "pool-1",
    profilePath: ".codex/profiles/main",
    status: "active",
    isEnabled: true,
    capabilities: []
  }
];

const buildProps = (onDelete: () => Promise<boolean>) => ({
  profiles,
  pools,
  selectedProvider: "codex" as const,
  selectedRuntimeProfileId: "profile-1",
  selectedRuntimeProfileKey: "codex-main",
  onSelectRuntimeProfile: vi.fn(),
  createDraft: {
    key: "",
    accountPoolId: "pool-1",
    profilePath: "",
    status: "active"
  },
  updateDraft: {
    key: "codex-main",
    accountPoolId: "pool-1",
    profilePath: ".codex/profiles/main",
    status: "active"
  },
  onChangeCreateDraft: vi.fn(),
  onChangeUpdateDraft: vi.fn(),
  isMutating: false,
  errorMessage: null,
  actionMessage: null,
  onCreate: vi.fn(),
  onUpdate: vi.fn(),
  onDelete
});

describe("RuntimeProfileWidget delete confirmation", () => {
  it("keeps confirmation open when delete fails", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(false);
    render(<RuntimeProfileWidget {...buildProps(onDelete)} />);

    await user.click(screen.getByRole("button", { name: "Delete Selected" }));
    expect(screen.getByRole("button", { name: "Confirm Delete" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Confirm Delete" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Confirm Delete" })).not.toBeNull();
  });

  it("closes confirmation after successful delete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(true);
    render(<RuntimeProfileWidget {...buildProps(onDelete)} />);

    await user.click(screen.getByRole("button", { name: "Delete Selected" }));
    await user.click(screen.getByRole("button", { name: "Confirm Delete" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Confirm Delete" })).toBeNull();
  });
});
