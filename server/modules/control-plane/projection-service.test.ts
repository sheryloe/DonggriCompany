import { describe, expect, it } from "vitest";
import type { ControlPlaneSourceSnapshot } from "./source-adapter.ts";
import { ProjectionService } from "./projection-service.ts";

function snapshot(): ControlPlaneSourceSnapshot {
  return {
    generated_at: "2026-07-25T00:00:00Z",
    source_epoch: `sha256:${"a".repeat(64)}`,
    projection_epoch: `sha256:${"b".repeat(64)}`,
    degraded: false,
    parse_errors: [],
    active_specs: [
      {
        id: "20260725-donggricompany-v1-stabilization-certification-v1",
        status: "implementation",
        phase: "g1-g2-implementation",
        related_repo: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
        related_repos: ["G:\\Donggri_DevDrive\\repos\\DonggriCompany"],
        scope: "DonggriCompany / V1 Stabilization",
        heading: "Current Active Spec (DonggriCompany / V1 Stabilization)",
        line: 1,
        next_recommended_action: null,
      },
    ],
    active_spec: null,
    next_recommended_action: null,
    projects: [
      {
        key: "DonggriCompany",
        path: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
        type: "runtime-projection",
        has_agents: true,
        status: "active",
        summary: null,
        operation_agent: null,
        enabled: true,
      },
    ],
    files: {
      projects: {
        relative_path: "registry/projects.yaml",
        absolute_path: "G:\\projects.yaml",
        exists: true,
        size: 1,
        mtime: "2026-07-25T00:00:00Z",
        sha256: "b".repeat(64),
        content: "projects: {}",
        error: null,
      },
      active_specs: {
        relative_path: "specs/_active.md",
        absolute_path: "G:\\_active.md",
        exists: true,
        size: 1,
        mtime: "2026-07-25T00:00:00Z",
        sha256: "c".repeat(64),
        content: "# active",
        error: null,
      },
    },
  };
}

describe("ProjectionService", () => {
  it("keeps Control Plane, live runtime, and local durable evidence provenance explicit", async () => {
    const source = snapshot();
    const service = new ProjectionService({
      source_adapter: { readSnapshot: () => source },
      runtime_provider: () => ({
        source_epoch: source.source_epoch,
        projection_epoch: source.projection_epoch,
        generated_at: source.generated_at,
        data: { active_runs: 2 },
      }),
      evidence_provider: () => ({
        source_epoch: source.source_epoch,
        projection_epoch: source.projection_epoch,
        generated_at: source.generated_at,
        data: { journal_sequence: 7 },
      }),
    });
    const state = await service.readState();
    expect(state).toMatchObject({
      source_epoch: source.source_epoch,
      projection_epoch: source.projection_epoch,
      degraded: false,
      runtime: { data: { active_runs: 2 } },
      evidence: { data: { journal_sequence: 7 } },
      provenance: {
        control_plane: "root-control-plane",
        runtime: "live-runtime",
        evidence: "local-durable-evidence",
      },
    });
  });

  it("discards stale runtime/evidence responses instead of mixing source epochs", async () => {
    const source = snapshot();
    const service = new ProjectionService({
      source_adapter: { readSnapshot: () => source },
      runtime_provider: () => ({
        source_epoch: `sha256:${"d".repeat(64)}`,
        projection_epoch: source.projection_epoch,
        generated_at: source.generated_at,
        data: { stale: true },
      }),
    });
    const state = await service.readState();
    expect(state.runtime).toBeNull();
    expect(state.degraded).toBe(true);
    expect(state.provenance.runtime).toBe("discarded-source-epoch-mismatch");
    expect(state.parse_errors).toEqual([
      expect.objectContaining({ code: "projection_source_epoch_mismatch", path: "projection.runtime.source_epoch" }),
    ]);
  });

  it("discards a stale mutable projection without invalidating the immutable candidate epoch", async () => {
    const source = snapshot();
    const service = new ProjectionService({
      source_adapter: { readSnapshot: () => source },
      evidence_provider: () => ({
        source_epoch: source.source_epoch,
        projection_epoch: `sha256:${"e".repeat(64)}`,
        generated_at: source.generated_at,
        data: { stale: true },
      }),
    });

    const state = await service.readState();

    expect(state.source_epoch).toBe(source.source_epoch);
    expect(state.projection_epoch).toBe(source.projection_epoch);
    expect(state.evidence).toBeNull();
    expect(state.degraded).toBe(true);
    expect(state.provenance.evidence).toBe("discarded-projection-epoch-mismatch");
    expect(state.parse_errors).toEqual([
      expect.objectContaining({
        code: "projection_epoch_mismatch",
        path: "projection.evidence.projection_epoch",
      }),
    ]);
  });
});
