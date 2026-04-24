import { describe, expect, it } from "vitest";
import {
  getCanonicalSnapshotByVersion,
  getCurrentCanonicalVersion,
  getCanonicalPolicy,
  getCanonicalAgentsSourceMode,
  getCanonicalSpecializationRegistry,
  previewCanonicalRouting,
  reloadCanonicalSnapshot,
} from "./canonical-policy.ts";

describe("canonical policy", () => {
  it("builds governance and specialization snapshots from canonical sources", () => {
    const policy = getCanonicalPolicy();
    const registry = getCanonicalSpecializationRegistry();

    expect(policy.families.map((item) => item.key)).toContain("orchestrator");
    expect(policy.stages.map((item) => item.key)).toContain("team-lead");
    expect(policy.packProfiles.find((item) => item.key === "donggri")?.baseKey).toBeNull();
    expect(registry.total).toBeGreaterThan(100);
    expect(registry.familyAssignments.backend).toBeGreaterThan(0);
  });

  it("previews routing with artifact and approval explanations", () => {
    const preview = previewCanonicalRouting({
      text: "Review the deployment security impact and prepare a release decision.",
      workflowPackKey: "donggri",
    });

    expect(preview.family).toBe("qa");
    expect(preview.tier).toBe("tier-1");
    expect(preview.provider).toBeTruthy();
    expect(preview.explanation.length).toBeGreaterThan(0);
  });

  it("supports dry-run reload without applying a broken snapshot", () => {
    const result = reloadCanonicalSnapshot("dry-run");
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.snapshot?.policy.version).toBeTruthy();
  });

  it("keeps applied snapshots addressable by version and rollback target", () => {
    const applied = reloadCanonicalSnapshot("apply");
    expect(applied.ok).toBe(true);
    expect(applied.applied).toBe(true);
    const appliedVersion = applied.snapshot?.policy.version ?? "";
    expect(appliedVersion).toBeTruthy();
    expect(getCanonicalSnapshotByVersion(appliedVersion)?.policy.version).toBe(appliedVersion);
    expect(getCurrentCanonicalVersion()).toBe(appliedVersion);

    const rolledBack = reloadCanonicalSnapshot("rollback", appliedVersion);
    expect(rolledBack.ok).toBe(true);
    expect(rolledBack.currentVersion).toBe(appliedVersion);
    expect(getCanonicalSnapshotByVersion(appliedVersion)?.policy.hash).toBe(applied.snapshot?.policy.hash);
  });

  it("supports pinned routing preview by policy version", () => {
    const currentVersion = getCurrentCanonicalVersion();
    const preview = previewCanonicalRouting({
      text: "Prepare a backend implementation plan.",
      workflowPackKey: "donggri",
      policyVersion: currentVersion,
    });

    expect(preview.policyVersion).toBe(currentVersion);
    expect(preview.snapshotScope).toBe("pinned");
    expect(preview.policySnapshotHash).toBeTruthy();
  });

  it("enforces root-only AGENTS source mode", () => {
    expect(getCanonicalAgentsSourceMode()).toBe("root_only");
  });
});
