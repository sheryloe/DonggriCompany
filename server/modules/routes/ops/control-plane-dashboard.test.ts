import { describe, expect, it } from "vitest";
import type { ControlPlaneSourceSnapshot } from "../../control-plane/source-adapter.ts";
import { buildControlPlaneDashboardState } from "./control-plane-dashboard.ts";

function source(): ControlPlaneSourceSnapshot {
  return {
    generated_at: "2026-08-14T00:00:00.000Z",
    source_epoch: `sha256:${"a".repeat(64)}`,
    projection_epoch: `sha256:${"b".repeat(64)}`,
    degraded: true,
    parse_errors: [{ source: "specs/_active.md", code: "parse", message: "bad row", path: "line", line: 1, column: 1 }],
    active_specs: [
      {
        id: "spec-v1",
        status: "implementation",
        phase: "applying",
        related_repo: "repo",
        related_repos: ["repo"],
        scope: null,
        heading: "Spec",
        line: 1,
        next_recommended_action: "verify",
      },
    ],
    active_spec: null,
    next_recommended_action: "verify",
    projects: [],
    files: {
      projects: {
        relative_path: "projects",
        absolute_path: "projects",
        exists: true,
        size: 1,
        mtime: null,
        sha256: null,
        content: "",
        error: null,
      },
      active_specs: {
        relative_path: "specs",
        absolute_path: "specs",
        exists: true,
        size: 1,
        mtime: null,
        sha256: null,
        content: "",
        error: null,
      },
    },
  };
}

describe("buildControlPlaneDashboardState", () => {
  it("keeps source identity and emits only compact project fields", () => {
    const result = buildControlPlaneDashboardState(source(), [
      {
        key: "DonggriCompany",
        path: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
        summary: "runtime projection",
        status: "active",
        enabled: true,
        exists: true,
        git: { status: "dirty", branch: "main", ahead: 15, behind: 0, dirty_count: 9 },
      },
      {
        key: "hidden",
        path: "G:\\Donggri_DevDrive\\repos\\hidden",
        summary: null,
        status: "candidate",
        enabled: false,
        exists: false,
        git: { status: "missing", branch: null, ahead: 0, behind: 0, dirty_count: 0 },
      },
    ]);

    expect(result.source_epoch).toBe(source().source_epoch);
    expect(result.parse_error_count).toBe(1);
    expect(result.runtime).toEqual({ data_mode: "local", refresh_interval_ms: 15_000 });
    expect(result.active_specs[0]).toEqual(expect.objectContaining({ related_repo: "repo", related_repos: ["repo"] }));
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toEqual(
      expect.objectContaining({ key: "DonggriCompany", git: expect.objectContaining({ status: "dirty" }) }),
    );
    expect(JSON.stringify(result).length).toBeLessThan(2_000);
  });
});
