import { describe, expect, it } from "vitest";
import { Master95ImageArtifactSchema, Master95ImageWorkbench } from "./image-workbench.js";

const hash = "a".repeat(64);
function artifact(id: string, overrides: Record<string, unknown> = {}) {
  return {
    artifact_id: id,
    project_id: "project:DonggriCompany",
    task_id: "task:image:1",
    run_id: "run:image:1",
    trace_id: "trace:image:1",
    created_by_agent_id: "design-worker:1",
    skill_id: "image.generate",
    skill_version: "1.0.0",
    model: "gpt-image-contract",
    prompt_version: "prompt-v1",
    operation: "generate",
    version: 1,
    parent_artifact_id: null,
    source_artifact_ids: [],
    source_uri: `assets/source/${id}.png`,
    output_uri: `public/generated/${id}.png`,
    sha256: hash,
    mime_type: "image/png",
    width: 96,
    height: 96,
    rights_source: "internal-codex-imagegen",
    created_at: "2026-07-14T00:00:00.000Z",
    modified_at: "2026-07-14T00:00:00.000Z",
    processing_status: "complete",
    failure_reason: null,
    analysis_summary: null,
    approval_status: "draft",
    exported_at: null,
    ...overrides,
  };
}

describe("Master95ImageWorkbench", () => {
  it("records exact source and version lineage", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("source"));
    workbench.register(artifact("derived", { source_artifact_ids: ["source"] }));
    workbench.register(
      artifact("derived-v2", { version: 2, parent_artifact_id: "derived", source_artifact_ids: ["source"] }),
    );
    expect(workbench.lineage("derived-v2").map((item) => item.artifact_id)).toEqual([
      "derived-v2",
      "source",
      "derived",
    ]);
  });

  it("requires CONTROL approval before export", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("image"));
    expect(() => workbench.export({ artifact_id: "image", exported_at: "2026-07-14T00:00:00.000Z" })).toThrow(
      "artifact_export_approval_required",
    );
    workbench.submit("image");
    expect(() => workbench.decide({ artifact_id: "image", actor: "REVIEW", decision: "approved" })).toThrow(
      "artifact_approval_control_only",
    );
    workbench.decide({ artifact_id: "image", actor: "CONTROL", decision: "approved" });
    expect(
      workbench.export({ artifact_id: "image", exported_at: "2026-07-14T00:00:00.000Z" }).exported_at,
    ).not.toBeNull();
  });

  it("rejects missing and cross-project lineage", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("source"));
    expect(() => workbench.register(artifact("missing", { source_artifact_ids: ["unknown"] }))).toThrow(
      "source_artifact_not_found",
    );
    expect(() =>
      workbench.register(artifact("foreign", { project_id: "project:BloggerGent", source_artifact_ids: ["source"] })),
    ).toThrow("cross_project_source_denied");
  });

  it("requires sequential parent versions", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("v1"));
    expect(() => workbench.register(artifact("v3", { version: 3, parent_artifact_id: "v1" }))).toThrow(
      "artifact_version_sequence_invalid",
    );
  });

  it("rejects unapproved exported records at schema boundary", () => {
    expect(() =>
      Master95ImageArtifactSchema.parse(artifact("bad", { exported_at: "2026-07-14T00:00:00.000Z" })),
    ).toThrow("unapproved_export_forbidden");
  });

  it("requires complete provenance and Trace metadata", () => {
    const { trace_id: _traceId, ...withoutTrace } = artifact("missing-trace");
    expect(() => Master95ImageArtifactSchema.parse(withoutTrace)).toThrow();
    const { task_id: _taskId, ...withoutTask } = artifact("missing-task");
    expect(() => Master95ImageArtifactSchema.parse(withoutTask)).toThrow();
  });

  it("records partial output with an actionable failure reason", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("partial"));
    const result = workbench.recordPartialFailure({
      artifact_id: "partial",
      failure_reason: "background edge mask needs manual review",
      modified_at: "2026-07-14T00:01:00.000Z",
    });
    expect(result).toMatchObject({
      processing_status: "partial",
      failure_reason: "background edge mask needs manual review",
      output_uri: "public/generated/partial.png",
    });
  });

  it("restores an earlier version as a new draft with lineage", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("restore-source"));
    const restored = workbench.restore({
      artifact_id: "restore-source",
      new_artifact_id: "restore-v2",
      task_id: "task:image:restore",
      run_id: "run:image:restore",
      trace_id: "trace:image:restore",
      actor_agent_id: "design-worker:2",
      created_at: "2026-07-14T00:02:00.000Z",
    });
    expect(restored).toMatchObject({
      version: 2,
      parent_artifact_id: "restore-source",
      source_artifact_ids: ["restore-source"],
      operation: "restore",
      approval_status: "draft",
    });
    expect(workbench.lineage("restore-v2").map((item) => item.artifact_id)).toEqual(["restore-v2", "restore-source"]);
  });

  it("restores old content on top of the latest sequential parent", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("restore-old"));
    workbench.register(artifact("restore-head", { version: 2, parent_artifact_id: "restore-old" }));
    const restored = workbench.restore({
      artifact_id: "restore-old",
      parent_artifact_id: "restore-head",
      new_artifact_id: "restore-v3",
      task_id: "task:image:restore",
      run_id: "run:image:restore",
      trace_id: "trace:image:restore-v3",
      actor_agent_id: "design-worker:2",
      created_at: "2026-07-14T00:03:00.000Z",
    });
    expect(restored).toMatchObject({
      version: 3,
      parent_artifact_id: "restore-head",
      source_artifact_ids: ["restore-old"],
    });
  });

  it("forbids exporting partial artifacts", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("partial-export"));
    workbench.recordPartialFailure({
      artifact_id: "partial-export",
      failure_reason: "manual edge repair required",
      modified_at: "2026-07-14T00:01:00.000Z",
    });
    workbench.submit("partial-export");
    workbench.decide({ artifact_id: "partial-export", actor: "CONTROL", decision: "approved" });
    expect(() => workbench.export({ artifact_id: "partial-export", exported_at: "2026-07-14T00:04:00.000Z" })).toThrow(
      "incomplete_artifact_export_forbidden",
    );
  });

  it("blocks unapproved and cross-project downstream handoffs", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("handoff"));
    const handoff = {
      handoff_id: "handoff:image:1",
      artifact_id: "handoff",
      project_id: "project:DonggriCompany",
      task_id: "task:image:1",
      run_id: "run:image:1",
      trace_id: "trace:image:handoff",
      from_agent_id: "design-worker:1",
      to_agent_id: "frontend-worker:1",
      occurred_at: "2026-07-14T00:03:00.000Z",
    };
    expect(() => workbench.handoff(handoff)).toThrow("artifact_handoff_approval_required");
    workbench.submit("handoff");
    workbench.decide({ artifact_id: "handoff", actor: "CONTROL", decision: "approved" });
    expect(() => workbench.handoff({ ...handoff, project_id: "project:BloggerGent" })).toThrow(
      "cross_project_handoff_denied",
    );
    expect(workbench.handoff(handoff)).toMatchObject({ artifact_id: "handoff", to_agent_id: "frontend-worker:1" });
  });

  it("records an exact downstream receiver acceptance", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("accepted-handoff"));
    workbench.submit("accepted-handoff");
    workbench.decide({ artifact_id: "accepted-handoff", actor: "CONTROL", decision: "approved" });
    workbench.handoff({
      handoff_id: "handoff:image:accepted",
      artifact_id: "accepted-handoff",
      project_id: "project:DonggriCompany",
      task_id: "task:image:1",
      run_id: "run:image:1",
      trace_id: "trace:image:accepted",
      from_agent_id: "design-worker:1",
      to_agent_id: "IMPLEMENT",
      occurred_at: "2026-07-14T00:03:00.000Z",
    });
    expect(
      workbench.acceptHandoff({
        handoff_id: "handoff:image:accepted",
        artifact_id: "accepted-handoff",
        project_id: "project:DonggriCompany",
        receiver_agent_id: "IMPLEMENT",
        receiver_agent_version: "1.0.0",
        trace_id: "trace:image:accepted",
        accepted_at: "2026-07-14T00:03:01.000Z",
      }),
    ).toMatchObject({ receiver_agent_id: "IMPLEMENT", receiver_agent_version: "1.0.0" });
    expect(() =>
      workbench.acceptHandoff({
        handoff_id: "handoff:image:accepted",
        artifact_id: "accepted-handoff",
        project_id: "project:DonggriCompany",
        receiver_agent_id: "REVIEW",
        receiver_agent_version: "1.0.0",
        trace_id: "trace:image:accepted",
        accepted_at: "2026-07-14T00:03:02.000Z",
      }),
    ).toThrow("handoff_already_accepted");
  });

  it("supports CONTROL discard and forbids export", () => {
    const workbench = new Master95ImageWorkbench();
    workbench.register(artifact("discard"));
    workbench.submit("discard");
    expect(workbench.decide({ artifact_id: "discard", actor: "CONTROL", decision: "discarded" })).toMatchObject({
      approval_status: "discarded",
    });
    expect(() => workbench.export({ artifact_id: "discard", exported_at: "2026-07-14T00:04:00.000Z" })).toThrow(
      "artifact_export_approval_required",
    );
  });
});
