import { describe, expect, it, vi } from "vitest";
import { RELEASE_IDENTITY } from "../../../../config/runtime.ts";
import { applyUpdateNow, type UpdateStatusPayload } from "./apply-update.ts";

describe("V1 prerelease update apply policy", () => {
  it("keeps alpha updates status-only even when manual force is explicitly confirmed", async () => {
    const commands: string[] = [];
    const fetchUpdateStatus = vi.fn(
      async (): Promise<UpdateStatusPayload> => ({
        current_version: RELEASE_IDENTITY.product_version,
        latest_version: "1.0.0-alpha.1",
        latest_revision: "a".repeat(40),
        update_available: true,
        comparison_state: "update_available",
        auto_apply_allowed: false,
        current_release_identity: RELEASE_IDENTITY,
        latest_release_identity: {
          ...RELEASE_IDENTITY,
          product_version: "1.0.0-alpha.1",
          candidate_id: "dongri-grigri-v1-alpha.1",
          git_sha: "a".repeat(40),
          target_revision: "a".repeat(40),
        },
        release_url: "https://github.com/sheryloe/DonggriCompany/releases/tag/v1.0.0-alpha.1",
        checked_at: Date.now(),
        enabled: true,
        repo: RELEASE_IDENTITY.source_repository,
        error: null,
      }),
    );
    const runCommandCapture = vi.fn(async (cmd: string, args: string[]) => {
      commands.push(`${cmd} ${args.join(" ")}`);
      if (args[0] === "rev-parse") return { ok: true, code: 0, stdout: "main\n", stderr: "" };
      if (args[0] === "remote") {
        return {
          ok: true,
          code: 0,
          stdout: "https://github.com/sheryloe/DonggriCompany.git\n",
          stderr: "",
        };
      }
      return { ok: true, code: 0, stdout: "", stderr: "" };
    });

    const result = await applyUpdateNow(
      {
        AUTO_UPDATE_CHANNEL: "all",
        AUTO_UPDATE_IDLE_ONLY: true,
        AUTO_UPDATE_TARGET_BRANCH: "main",
        AUTO_UPDATE_RESTART_MODE: "notify",
        AUTO_UPDATE_RESTART_COMMAND: "",
        AUTO_UPDATE_EXIT_DELAY_MS: 10_000,
        AUTO_UPDATE_TOTAL_TIMEOUT_MS: 60_000,
        updateCommandTimeoutMs: { gitFetch: 10_000, gitPull: 10_000, pnpmInstall: 10_000 },
        activeProcesses: new Map(),
        getInProgressTaskCount: () => 0,
        fetchUpdateStatus,
        runCommandCapture,
        logAutoUpdate: vi.fn(),
        notifyCeo: vi.fn(),
        scheduleExit: vi.fn(),
      },
      { trigger: "manual", force: true, forceConfirmed: true },
    );

    expect(result).toMatchObject({
      status: "skipped",
      dry_run: false,
      reasons: ["prerelease_status_only", "release_apply_blocked:update_available"],
    });
    expect(commands).toEqual([
      "git rev-parse --abbrev-ref HEAD",
      "git remote get-url origin",
      "git status --porcelain",
    ]);
    expect(commands.some((command) => /\bgit (fetch|pull)\b/.test(command))).toBe(false);
    expect(commands.some((command) => /\bpnpm install\b/.test(command))).toBe(false);
  });
});
