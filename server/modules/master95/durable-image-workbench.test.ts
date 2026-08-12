import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  Master95DurableImageWorkbench,
  Master95MemoryImageAssetStore,
  Master95MemoryImageJournal,
} from "./durable-image-workbench.js";

function artifact(id: string, overrides: Record<string, unknown> = {}) {
  return {
    artifact_id: id,
    project_id: "project:DonggriCompany",
    task_id: "task:image:durable",
    run_id: "run:image:durable",
    trace_id: `trace:image:${id}`,
    created_by_agent_id: "design-worker:1",
    skill_id: "image.local-workbench",
    skill_version: "1.0.0",
    model: "browser-canvas",
    prompt_version: "local-preview-v1",
    operation: "generate",
    version: 1,
    parent_artifact_id: null,
    source_artifact_ids: [],
    source_uri: `memory://${id}`,
    output_uri: `DonggriCompany/${id}.png`,
    sha256: "a".repeat(64),
    mime_type: "image/png",
    width: 1200,
    height: 630,
    rights_source: "user-supplied-local",
    created_at: "2026-07-15T00:00:00.000Z",
    modified_at: "2026-07-15T00:00:00.000Z",
    processing_status: "complete",
    failure_reason: null,
    analysis_summary: null,
    approval_status: "draft",
    exported_at: null,
    ...overrides,
  };
}

describe("Master95DurableImageWorkbench", () => {
  it("replays registered and approved Artifact state after restart", () => {
    const journal = new Master95MemoryImageJournal();
    const first = new Master95DurableImageWorkbench(journal);
    first.register({
      artifact: artifact("artifact:image:restart"),
      idempotency_key: "register:restart",
      occurred_at: "2026-07-15T00:00:00.000Z",
    });
    first.submit({
      project_id: "project:DonggriCompany",
      artifact_id: "artifact:image:restart",
      modified_at: "2026-07-15T00:01:00.000Z",
      idempotency_key: "submit:restart",
      occurred_at: "2026-07-15T00:01:00.000Z",
    });
    first.decide({
      project_id: "project:DonggriCompany",
      artifact_id: "artifact:image:restart",
      actor: "CONTROL",
      decision: "approved",
      modified_at: "2026-07-15T00:02:00.000Z",
      idempotency_key: "approve:restart",
      occurred_at: "2026-07-15T00:02:00.000Z",
    });

    const restarted = new Master95DurableImageWorkbench(journal);
    expect(restarted.get("project:DonggriCompany", "artifact:image:restart")).toMatchObject({
      approval_status: "approved",
      modified_at: "2026-07-15T00:02:00.000Z",
    });
    expect(restarted.events("project:DonggriCompany")).toHaveLength(3);
  });

  it("returns an exact duplicate without appending and rejects conflicting reuse", () => {
    const journal = new Master95MemoryImageJournal();
    const workbench = new Master95DurableImageWorkbench(journal);
    const input = {
      artifact: artifact("artifact:image:idempotent"),
      idempotency_key: "register:idempotent",
      occurred_at: "2026-07-15T00:00:00.000Z",
    };
    expect(workbench.register(input).duplicate).toBe(false);
    expect(workbench.register(input).duplicate).toBe(true);
    expect(journal.events).toHaveLength(1);
    expect(() => workbench.register({ ...input, artifact: artifact("artifact:image:conflict") })).toThrow(
      "idempotency_key_conflict",
    );
  });

  it("denies cross-project reads and invalid parent lineage", () => {
    const workbench = new Master95DurableImageWorkbench(new Master95MemoryImageJournal());
    workbench.register({
      artifact: artifact("artifact:image:isolated"),
      idempotency_key: "register:isolated",
      occurred_at: "2026-07-15T00:00:00.000Z",
    });
    expect(() => workbench.get("project:BloggerGent", "artifact:image:isolated")).toThrow(
      "cross_project_artifact_access_denied",
    );
    expect(() =>
      workbench.register({
        artifact: artifact("artifact:image:foreign", {
          project_id: "project:BloggerGent",
          version: 2,
          parent_artifact_id: "artifact:image:isolated",
        }),
        idempotency_key: "register:foreign",
        occurred_at: "2026-07-15T00:00:00.000Z",
      }),
    ).toThrow("cross_project_parent_denied");
  });

  it("restores old bytes through a latest parent and preserves restart lineage", () => {
    const journal = new Master95MemoryImageJournal();
    const workbench = new Master95DurableImageWorkbench(journal);
    workbench.register({
      artifact: artifact("artifact:image:v1"),
      idempotency_key: "register:v1",
      occurred_at: "2026-07-15T00:00:00.000Z",
    });
    workbench.register({
      artifact: artifact("artifact:image:v2", {
        version: 2,
        parent_artifact_id: "artifact:image:v1",
        source_artifact_ids: ["artifact:image:v1"],
      }),
      idempotency_key: "register:v2",
      occurred_at: "2026-07-15T00:01:00.000Z",
    });
    workbench.restore({
      project_id: "project:DonggriCompany",
      artifact_id: "artifact:image:v1",
      parent_artifact_id: "artifact:image:v2",
      new_artifact_id: "artifact:image:v3-restore",
      task_id: "task:image:restore",
      run_id: "run:image:restore",
      trace_id: "trace:image:restore",
      actor_agent_id: "design-worker:2",
      created_at: "2026-07-15T00:02:00.000Z",
      idempotency_key: "restore:v1-as-v3",
      occurred_at: "2026-07-15T00:02:00.000Z",
    });
    const restarted = new Master95DurableImageWorkbench(journal);
    expect(restarted.get("project:DonggriCompany", "artifact:image:v3-restore")).toMatchObject({
      version: 3,
      parent_artifact_id: "artifact:image:v2",
      source_artifact_ids: ["artifact:image:v1"],
    });
  });

  it("completes the durable register, approve, Handoff, export, and restart slice 100 times", () => {
    const journal = new Master95MemoryImageJournal();
    const workbench = new Master95DurableImageWorkbench(journal);
    let completed = 0;

    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const artifactId = `artifact:image:repeat:${attempt}`;
      const taskId = `task:image:repeat:${attempt}`;
      const runId = `run:image:repeat:${attempt}`;
      const timestamp = `2026-07-15T${String(Math.floor(attempt / 60)).padStart(2, "0")}:${String(attempt % 60).padStart(2, "0")}:00.000Z`;
      workbench.register({
        artifact: artifact(artifactId, {
          task_id: taskId,
          run_id: runId,
          created_at: timestamp,
          modified_at: timestamp,
        }),
        idempotency_key: `repeat:${attempt}:register`,
        occurred_at: timestamp,
      });
      workbench.submit({
        project_id: "project:DonggriCompany",
        artifact_id: artifactId,
        modified_at: timestamp,
        idempotency_key: `repeat:${attempt}:submit`,
        occurred_at: timestamp,
      });
      workbench.decide({
        project_id: "project:DonggriCompany",
        artifact_id: artifactId,
        actor: "CONTROL",
        decision: "approved",
        modified_at: timestamp,
        idempotency_key: `repeat:${attempt}:approve`,
        occurred_at: timestamp,
      });
      workbench.handoff({
        handoff: {
          handoff_id: `handoff:image:repeat:${attempt}`,
          artifact_id: artifactId,
          project_id: "project:DonggriCompany",
          task_id: taskId,
          run_id: runId,
          trace_id: `trace:image:handoff:${attempt}`,
          from_agent_id: "design-worker:1",
          to_agent_id: "frontend-worker:1",
          occurred_at: timestamp,
        },
        idempotency_key: `repeat:${attempt}:handoff`,
        occurred_at: timestamp,
      });
      workbench.acceptHandoff({
        receipt: {
          handoff_id: `handoff:image:repeat:${attempt}`,
          artifact_id: artifactId,
          project_id: "project:DonggriCompany",
          receiver_agent_id: "frontend-worker:1",
          receiver_agent_version: "1.0.0",
          trace_id: `trace:image:handoff:${attempt}`,
          accepted_at: timestamp,
        },
        idempotency_key: `repeat:${attempt}:handoff-accept`,
        occurred_at: timestamp,
      });
      workbench.export({
        project_id: "project:DonggriCompany",
        artifact_id: artifactId,
        exported_at: timestamp,
        idempotency_key: `repeat:${attempt}:export`,
        occurred_at: timestamp,
      });
      completed += 1;
    }

    const restarted = new Master95DurableImageWorkbench(journal);
    expect(completed / 100).toBe(1);
    expect(restarted.events("project:DonggriCompany")).toHaveLength(600);
    expect(restarted.handoffs("project:DonggriCompany")).toHaveLength(100);
    expect(restarted.handoffReceipts("project:DonggriCompany")).toHaveLength(100);
    expect(restarted.list("project:DonggriCompany")).toHaveLength(100);
    expect(restarted.list("project:DonggriCompany").every((item) => item.exported_at !== null)).toBe(true);
  });
});

describe("Master95MemoryImageAssetStore", () => {
  it("verifies SHA-256 and deduplicates immutable content", () => {
    const store = new Master95MemoryImageAssetStore();
    const bytes = Buffer.from("bounded-image-bytes");
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const input = { project_id: "project:DonggriCompany", sha256: hash, mime_type: "image/png" as const, bytes };
    expect(store.put(input)).toMatchObject({ duplicate: false, size_bytes: bytes.length });
    expect(store.put(input)).toMatchObject({ duplicate: true, size_bytes: bytes.length });
    expect(() => store.put({ ...input, sha256: "0".repeat(64) })).toThrow("image_asset_sha256_mismatch");
  });
});
