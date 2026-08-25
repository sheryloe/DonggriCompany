import { afterEach, describe, expect, it, vi } from "vitest";

import { getControlPlaneDashboardState } from "./control-plane-dashboard";
import { __resetApiRuntimeForTests } from "./core";

describe("control-plane dashboard API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetApiRuntimeForTests();
  });

  it("uses the dedicated lightweight read endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          generated_at: "2026-08-14T00:00:00.000Z",
          source_epoch: `sha256:${"a".repeat(64)}`,
          projection_epoch: `sha256:${"b".repeat(64)}`,
          degraded: false,
          parse_error_count: 0,
          runtime: { data_mode: "isolated", refresh_interval_ms: 15000 },
          active_specs: [
            {
              id: "spec-v1",
              phase: "applying",
              status: "active",
              related_repo: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
              related_repos: ["G:\\Donggri_DevDrive\\repos\\DonggriCompany"],
              next_recommended_action: "verify",
            },
          ],
          projects: [],
          counts: { projects: 0, clean: 0, dirty: 0, missing: 0, active_specs: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const state = await getControlPlaneDashboardState();

    expect(state.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/control-plane/dashboard",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});
