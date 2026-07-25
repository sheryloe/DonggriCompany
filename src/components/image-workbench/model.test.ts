import { describe, expect, it } from "vitest";
import {
  buildImageArtifactMetadata,
  canExportImageVersion,
  deriveImageVersion,
  derivePartialImageVersion,
  restoreImageVersion,
  type ImageWorkbenchVersion,
} from "./model";

function version(overrides: Partial<ImageWorkbenchVersion> = {}): ImageWorkbenchVersion {
  return {
    id: "artifact:image:1",
    projectId: "project:DonggriCompany",
    taskId: "task:image:1",
    runId: "run:image:1",
    traceId: "trace:image:1",
    createdByAgentId: "design-worker:1",
    skillId: "image.local-workbench",
    skillVersion: "1.0.0",
    model: "browser-canvas",
    promptVersion: "local-input-v1",
    operation: "input",
    version: 1,
    parentId: null,
    sourceIds: [],
    sourceName: "source.png",
    outputName: "source.png",
    objectUrl: "blob:source",
    blob: new Blob(["source"], { type: "image/png" }),
    sha256: "a".repeat(64),
    mimeType: "image/png",
    width: 120,
    height: 80,
    rightsSource: "user-supplied-local",
    createdAt: "2026-07-15T00:00:00.000Z",
    modifiedAt: "2026-07-15T00:00:00.000Z",
    processingStatus: "complete",
    failureReason: null,
    analysisSummary: null,
    approvalStatus: "draft",
    exportedAt: null,
    ...overrides,
  };
}

describe("Image Workbench client model", () => {
  it("builds the complete Artifact metadata contract", () => {
    expect(buildImageArtifactMetadata(version())).toMatchObject({
      project_id: "project:DonggriCompany",
      task_id: "task:image:1",
      run_id: "run:image:1",
      trace_id: "trace:image:1",
      created_by_agent_id: "design-worker:1",
      skill_id: "image.local-workbench",
      model: "browser-canvas",
      prompt_version: "local-input-v1",
      rights_source: "user-supplied-local",
    });
  });

  it("derives an immutable next version with exact lineage", () => {
    const derived = deriveImageVersion(version(), {
      id: "artifact:image:2",
      traceId: "trace:image:2",
      operation: "resize",
      blob: new Blob(["result"], { type: "image/webp" }),
      objectUrl: "blob:result",
      sha256: "b".repeat(64),
      mimeType: "image/webp",
      width: 60,
      height: 40,
      outputName: "source-v2.webp",
      createdAt: "2026-07-15T00:01:00.000Z",
    });
    expect(derived).toMatchObject({
      version: 2,
      parentId: "artifact:image:1",
      sourceIds: ["artifact:image:1"],
      operation: "resize",
      approvalStatus: "draft",
    });
  });

  it("restores a prior result as a new draft version", () => {
    const restored = restoreImageVersion(version({ version: 3 }), {
      id: "artifact:image:restore",
      traceId: "trace:image:restore",
      objectUrl: "blob:restore",
      createdAt: "2026-07-15T00:02:00.000Z",
    });
    expect(restored).toMatchObject({ version: 4, operation: "restore", approvalStatus: "draft" });
  });

  it("restores an old source into the next globally monotonic version", () => {
    const source = version({ version: 1 });
    const head = version({ id: "artifact:image:7", version: 7, parentId: source.id });
    const restored = restoreImageVersion(source, {
      id: "artifact:image:restore-global",
      traceId: "trace:image:restore-global",
      objectUrl: "blob:restore-global",
      createdAt: "2026-07-15T00:03:00.000Z",
      nextVersion: 8,
      parent: head,
    });
    expect(restored).toMatchObject({ version: 8, parentId: "artifact:image:7", sourceIds: ["artifact:image:1"] });
  });

  it("preserves a failed transform as a traced partial result", () => {
    const partial = derivePartialImageVersion(version(), {
      id: "artifact:image:partial",
      traceId: "trace:image:partial",
      operation: "edit",
      createdAt: "2026-07-15T00:04:00.000Z",
      nextVersion: 2,
      failureReason: "canvas unavailable",
    });
    expect(partial).toMatchObject({
      version: 2,
      parentId: "artifact:image:1",
      sourceIds: ["artifact:image:1"],
      processingStatus: "partial",
      failureReason: "canvas unavailable",
      approvalStatus: "draft",
    });
  });

  it("allows export only after approval", () => {
    expect(canExportImageVersion(version())).toBe(false);
    expect(canExportImageVersion(version({ approvalStatus: "approved" }))).toBe(true);
    expect(canExportImageVersion(version({ approvalStatus: "approved", processingStatus: "failed" }))).toBe(false);
    expect(canExportImageVersion(version({ approvalStatus: "approved", processingStatus: "partial" }))).toBe(false);
  });

  it("repeats the supported local edit, compare, approve, export, and restore slice 100 times", () => {
    const artifactIds = new Set<string>();
    const traceIds = new Set<string>();

    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const source = version({
        id: `artifact:image:${attempt}:source`,
        taskId: `task:image:${attempt}`,
        runId: `run:image:${attempt}`,
        traceId: `trace:image:${attempt}:source`,
      });
      const edited = deriveImageVersion(source, {
        id: `artifact:image:${attempt}:edit`,
        traceId: `trace:image:${attempt}:edit`,
        operation: "edit",
        blob: new Blob([`result-${attempt}`], { type: "image/png" }),
        objectUrl: `blob:result-${attempt}`,
        sha256: attempt.toString(16).padStart(64, "0"),
        mimeType: "image/png",
        width: 120,
        height: 80,
        outputName: `source-${attempt}-v2.png`,
        createdAt: `2026-07-15T00:${String(attempt % 60).padStart(2, "0")}:00.000Z`,
        nextVersion: 2,
      });
      const approved = { ...edited, approvalStatus: "approved" as const };
      const restored = restoreImageVersion(source, {
        id: `artifact:image:${attempt}:restore`,
        traceId: `trace:image:${attempt}:restore`,
        objectUrl: `blob:restore-${attempt}`,
        createdAt: `2026-07-15T01:${String(attempt % 60).padStart(2, "0")}:00.000Z`,
        nextVersion: 3,
        parent: edited,
      });

      expect(buildImageArtifactMetadata(edited)).toMatchObject({
        parent_artifact_id: source.id,
        source_artifact_ids: [source.id],
        project_id: source.projectId,
      });
      expect(canExportImageVersion(approved)).toBe(true);
      expect(restored).toMatchObject({
        version: 3,
        parentId: edited.id,
        sourceIds: [source.id],
        operation: "restore",
      });
      for (const item of [source, edited, restored]) {
        expect(artifactIds.has(item.id)).toBe(false);
        expect(traceIds.has(item.traceId)).toBe(false);
        artifactIds.add(item.id);
        traceIds.add(item.traceId);
      }
    }

    expect(artifactIds.size).toBe(300);
    expect(traceIds.size).toBe(300);
  });
});
