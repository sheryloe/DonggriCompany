import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CanonicalInspectorTab from "./CanonicalInspectorTab";

const apiMocks = vi.hoisted(() => ({
  getCanonicalCompanyPolicy: vi.fn(),
  getCanonicalSpecializationRegistry: vi.fn(),
  getProjects: vi.fn(),
  getProjectArtifactState: vi.fn(),
  reloadCanonicalRules: vi.fn(),
  previewCanonicalRouting: vi.fn(),
  bootstrapProjectArtifacts: vi.fn(),
}));

vi.mock("../../api", () => ({
  getCanonicalCompanyPolicy: apiMocks.getCanonicalCompanyPolicy,
  getCanonicalSpecializationRegistry: apiMocks.getCanonicalSpecializationRegistry,
  getProjects: apiMocks.getProjects,
  getProjectArtifactState: apiMocks.getProjectArtifactState,
  reloadCanonicalRules: apiMocks.reloadCanonicalRules,
  previewCanonicalRouting: apiMocks.previewCanonicalRouting,
  bootstrapProjectArtifacts: apiMocks.bootstrapProjectArtifacts,
}));

describe("CanonicalInspectorTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getCanonicalCompanyPolicy.mockResolvedValue({
      currentVersion: "2026-04-15-abcd1234",
      policy: {
        version: "2026-04-15-abcd1234",
        hash: "abcd1234",
        compiledAt: "2026-04-15T10:00:00.000Z",
        sourceRoot: "D:/canonical",
        families: [{ key: "backend", sourcePath: "x", systemPromptPath: null }],
        stages: [{ key: "senior", sourcePath: "y" }],
        approvalGates: [{ id: "human-approval-general", summary: "approval", sourcePath: "z" }],
        routingRules: [],
        modelTierRules: [
          {
            id: "tier-2-default",
            condition: "default",
            tier: "tier-2",
            summary: "default tier",
            sourcePath: "tier.ts",
          },
        ],
        packProfiles: [
          {
            key: "donggri",
            baseKey: null,
            derivedFrom: null,
            routingBias: [],
            requiredArtifacts: ["STATUS.md"],
            outputContract: ["summary"],
            modelTierPreference: "tier-2",
            sourceLayer: "compiler",
          },
        ],
        reloadPolicy: {
          strategy: "snapshot_pinning",
          inFlightBehavior: "pin_current_snapshot",
          reloadModes: ["dry-run", "apply", "rollback"],
          lastGoodAvailable: true,
        },
        diagnostics: [],
      },
      diagnostics: [],
    });
    apiMocks.getCanonicalSpecializationRegistry.mockResolvedValue({
      registry: {
        version: "2026-04-15-abcd1234",
        hash: "abcd1234",
        generatedAt: "2026-04-15T10:00:00.000Z",
        sourceRepo: "repo",
        sourceRef: "main",
        sourceUrl: "url",
        total: 1,
        familyAssignments: { backend: 1 },
        stageClassTree: { stage1: ["development-core"], stage2: ["core-engineering"], stage3: ["backend-developer"] },
        specializations: [],
        diagnostics: [],
      },
      diagnostics: [],
    });
    apiMocks.getProjects.mockResolvedValue({
      projects: [
        {
          id: "p1",
          name: "Proj",
          project_path: "D:/p",
          core_goal: "goal",
          created_at: 1,
          updated_at: 1,
          last_used_at: 1,
          assignment_mode: "auto",
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
    });
    apiMocks.getProjectArtifactState.mockResolvedValue({
      state: {
        projectId: "p1",
        projectPath: "D:/p",
        manifestPath: "D:/p/.donggri/canonical-artifacts.manifest.json",
        artifactPaths: { STATUS: "D:/p/STATUS.md" },
        artifactHealth: {
          STATUS: { exists: true, parseOk: true, blocking: false, size: 10, updatedAt: "2026-04-15T10:00:00.000Z" },
        },
        parsedState: {
          manifest: {
            schemaVersion: 2,
            artifactLayoutVersion: 2,
            policyVersion: "2026-04-15-abcd1234",
            packProfile: "donggri",
            projectionVersion: "hash",
            migrationPhase: "canonical",
            lastValidatedAt: "2026-04-15T10:00:00.000Z",
            lastGoodSnapshotHash: "abcd1234",
            lastPatchedBy: "tester",
          },
          documents: {},
        },
        projectionVersion: "hash",
        validation: [],
      },
    });
    apiMocks.reloadCanonicalRules.mockResolvedValue({
      mode: "rollback",
      ok: true,
      applied: true,
      restoredFromLastGood: false,
      diagnostics: [],
      snapshot: null,
      currentVersion: "2026-04-15-abcd1234",
      targetVersion: "2026-04-15-abcd1234",
    });
    apiMocks.previewCanonicalRouting.mockResolvedValue({
      policy: {
        policyVersion: "2026-04-15-abcd1234",
        policySnapshotHash: "abcd1234",
        snapshotScope: "current",
        family: "backend",
        stage: "senior",
        specialization: "backend-developer",
        provider: "codex",
        model: "gpt-5.3-codex",
        reasoningLevel: "high",
        subProvider: "codex",
        subModel: "gpt-5.3-codex",
        subReasoningLevel: "high",
        requiredArtifacts: ["STATUS.md"],
        approvalGates: [],
        explanation: ["family=backend matched from routing hints"],
        selectedBy: ["family"],
        blockedBy: ["artifact-health-block"],
        whyNot: [{ candidate: "reviewer", reason: "family mismatch" }],
        tier: "tier-2",
      },
      snapshot_scope: "current",
      currentVersion: "2026-04-15-abcd1234",
    });
    apiMocks.bootstrapProjectArtifacts.mockResolvedValue({
      state: {
        projectId: "p1",
        projectPath: "D:/p",
        manifestPath: "D:/p/.donggri/canonical-artifacts.manifest.json",
        artifactPaths: { STATUS: "D:/p/STATUS.md" },
        artifactHealth: {
          STATUS: { exists: true, parseOk: true, blocking: false, size: 10, updatedAt: "2026-04-15T10:00:00.000Z" },
        },
        parsedState: { manifest: null, documents: {} },
        projectionVersion: "hash",
        validation: [],
      },
    });
  });

  it("renders tabbed inspector and routing preview details", async () => {
    render(<CanonicalInspectorTab t={(messages) => messages.en} locale="en" />);

    await waitFor(() => {
      expect(screen.getByText("Canonical Policy Inspector")).toBeInTheDocument();
      expect(screen.getAllByText("2026-04-15-abcd1234").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Run Preview" }));

    await waitFor(() => {
      expect(apiMocks.previewCanonicalRouting).toHaveBeenCalled();
    });

    expect(screen.getByText("Decision")).toBeInTheDocument();
    expect(screen.getByText("Family: Backend")).toBeInTheDocument();
    expect(screen.getByText("selectedBy")).toBeInTheDocument();
    expect(screen.getByText("- family")).toBeInTheDocument();
    expect(screen.getByText("blockedBy")).toBeInTheDocument();
    expect(screen.getByText("- artifact-health-block")).toBeInTheDocument();
  });

  it("supports rollback target input", async () => {
    render(<CanonicalInspectorTab t={(messages) => messages.en} locale="en" />);

    await waitFor(() => {
      expect(screen.getByText("Canonical Policy Inspector")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Reload / Rollback" }));
    fireEvent.change(screen.getByPlaceholderText("target version"), {
      target: { value: "2026-04-15-abcd1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rollback" }));

    await waitFor(() => {
      expect(apiMocks.reloadCanonicalRules).toHaveBeenCalledWith("rollback", "2026-04-15-abcd1234");
    });
  });
});
