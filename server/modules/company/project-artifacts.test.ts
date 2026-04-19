import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyProjectArtifactPatch, ensureProjectArtifacts, inspectProjectArtifacts } from "./project-artifacts.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("project artifacts", () => {
  it("bootstraps canonical PM artifacts inside project root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-artifacts-"));
    tempDirs.push(root);

    const state = ensureProjectArtifacts({
      projectPath: root,
      projectName: "Canonical Test",
      coreGoal: "Bootstrap canonical artifacts",
      packProfile: "donggri",
      snapshotHash: "hash-123",
    });

    expect(fs.existsSync(path.join(root, "STATUS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "KANBAN.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "GANTT.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "NEXT_ACTIONS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "DAILY"))).toBe(true);
    expect(state.parsedState.manifest?.packProfile).toBe("donggri");
    expect(state.parsedState.manifest?.schemaVersion).toBe(2);
    expect(state.parsedState.manifest?.policyVersion).toBeTruthy();
    expect(state.parsedState.manifest?.projectionVersion).toMatch(/^pv-/);
  });

  it("reports blocking validation when a required artifact is missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-artifact-state-"));
    tempDirs.push(root);
    ensureProjectArtifacts({
      projectPath: root,
      projectName: "Canonical Test",
      coreGoal: "Bootstrap canonical artifacts",
      packProfile: "donggri",
      snapshotHash: "hash-456",
    });

    fs.rmSync(path.join(root, "GANTT.md"), { force: true });
    const state = inspectProjectArtifacts({
      projectId: "project-1",
      projectPath: root,
    });

    expect(state.artifactHealth.GANTT.blocking).toBe(true);
    expect(state.validation.some((item) => item.code === "artifact_missing")).toBe(true);
  });

  it("applies task events into canonical files and refreshes manifest metadata", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-artifact-patch-"));
    tempDirs.push(root);

    ensureProjectArtifacts({
      projectPath: root,
      projectName: "Canonical Patch Test",
      coreGoal: "Track task events",
      packProfile: "development",
      snapshotHash: "hash-789",
      policyVersion: "policy-v1",
    });

    const state = applyProjectArtifactPatch({
      projectId: "project-1",
      projectPath: root,
      actor: "test-suite",
      packProfile: "development",
      policyVersion: "policy-v2",
      note: "Task lifecycle changed",
      task: {
        id: "task-1",
        title: "Stabilize canonical compiler",
        status: "in_progress",
        priority: 2,
        taskType: "development",
      },
    });

    expect(state.parsedState.manifest?.lastPatchedBy).toBe("test-suite");
    expect(state.parsedState.manifest?.policyVersion).toBe("policy-v2");
    expect(state.parsedState.documents.STATUS?.keyValues["Policy Version"]).toBe("policy-v2");
    expect(state.parsedState.documents.NEXT_ACTIONS?.listItems.some((item) => item.includes("Stabilize canonical compiler"))).toBe(true);
    expect(state.parsedState.documents.DAILY?.listItems.some((item) => item.includes("Task lifecycle changed"))).toBe(true);
  });
});
