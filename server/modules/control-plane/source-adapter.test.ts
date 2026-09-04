import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeProjectionEpoch,
  ControlPlaneSourceAdapter,
  parseActiveSpecsMarkdown,
  parseProjectsYaml,
  type ControlPlaneSourceFile,
} from "./source-adapter.ts";

const temporaryDirectories: string[] = [];
const CANDIDATE_SOURCE_EPOCH = `sha256:${"9".repeat(64)}`;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("ControlPlaneSourceAdapter parsers", () => {
  it("preserves every valid Current Active Spec section in file order", () => {
    const parsed = parseActiveSpecsMarkdown(`# Active Specs

<!-- parser comments must not become fields -->
## Current Active Spec (DonggriCompany / V1)

- Spec ID: \`20260725-donggricompany-v1\`
- Status: implementation
- Phase: g1-projection
- Related repo: \`G:\\Donggri_DevDrive\\repos\\DonggriCompany\`

## Current Active Spec (BloggerGent)

- Spec ID: \`20260725-bloggergent-v1\`
- Status: active
- Phase: preflight
- Related repo: \`G:\\Donggri_DevDrive\\repos\\BloggerGent\`

## Next Recommended Action

Run the next approved verification gate.
`);

    expect(parsed.parse_errors).toEqual([]);
    expect(parsed.active_specs).toHaveLength(2);
    expect(parsed.active_specs.map((spec) => spec.id)).toEqual([
      "20260725-donggricompany-v1",
      "20260725-bloggergent-v1",
    ]);
    expect(parsed.active_specs[0]).toMatchObject({
      scope: "DonggriCompany / V1",
      phase: "g1-projection",
      next_recommended_action: null,
    });
    expect(parsed.next_recommended_action).toBe("Run the next approved verification gate.");
  });

  it("fails malformed YAML as degraded parse evidence instead of projecting partial defaults", () => {
    const parsed = parseProjectsYaml(`projects:
  Broken:
    path: [unterminated
    status: active
`);

    expect(parsed.projects).toEqual([]);
    expect(parsed.parse_errors.length).toBeGreaterThan(0);
    expect(parsed.parse_errors[0]).toMatchObject({
      source: "storage/codex-control/registry/projects.yaml",
    });
  });

  it("keeps archived projects disabled even when reusable YAML mappings are used", () => {
    const parsed = parseProjectsYaml(`disabled_agent: &disabled_agent
  status: disabled-missing
  enabled: false

projects:
  ArchivedProject:
    path: repos/ArchivedProject
    type: git-repo
    status: archived
    operation_agent: *disabled_agent
  ActiveProject:
    path: repos/ActiveProject
    type: git-repo
    operation_agent:
      status: active
      enabled: true
`);

    expect(parsed.parse_errors).toEqual([]);
    expect(parsed.projects).toHaveLength(2);
    expect(parsed.projects[0]).toMatchObject({
      key: "ArchivedProject",
      status: "archived",
      enabled: false,
      operation_agent: { enabled: false },
    });
    expect(parsed.projects[1]).toMatchObject({
      key: "ActiveProject",
      status: "active",
      enabled: true,
      operation_agent: { enabled: true },
    });
  });

  it("computes a stable content epoch independent of source enumeration order", () => {
    const files: Array<Pick<ControlPlaneSourceFile, "relative_path" | "exists" | "size" | "sha256">> = [
      {
        relative_path: "storage/codex-control/specs/_active.md",
        exists: true,
        size: 20,
        sha256: "b".repeat(64),
      },
      {
        relative_path: "storage/codex-control/registry/projects.yaml",
        exists: true,
        size: 10,
        sha256: "a".repeat(64),
      },
    ];

    const first = computeProjectionEpoch(files);
    const reordered = computeProjectionEpoch([...files].reverse());
    const changed = computeProjectionEpoch([{ ...files[0], sha256: "c".repeat(64) }, files[1]]);

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("keeps immutable candidate source authority while root document changes advance only projection epoch", async () => {
    const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "donggri-source-adapter-"));
    temporaryDirectories.push(controlRoot);
    const controlPlaneRoot = path.join(controlRoot, "storage", "codex-control");
    await fs.mkdir(path.join(controlPlaneRoot, "registry"), { recursive: true });
    await fs.mkdir(path.join(controlPlaneRoot, "specs"), { recursive: true });
    await fs.writeFile(
      path.join(controlPlaneRoot, "registry", "projects.yaml"),
      "projects:\n  DonggriCompany:\n    path: repos/DonggriCompany\n    status: active\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(controlPlaneRoot, "specs", "_active.md"),
      [
        "## Current Active Spec (DonggriCompany)",
        "",
        "- Spec ID: `20260725-donggricompany-v1`",
        "- Status: implementation",
        "- Phase: preflight",
        "- Related repo: `G:\\Donggri_DevDrive\\repos\\DonggriCompany`",
        "",
      ].join("\n"),
      "utf8",
    );
    const adapter = new ControlPlaneSourceAdapter({
      controlRoot,
      controlPlaneRoot,
      sourceEpoch: CANDIDATE_SOURCE_EPOCH,
      now: () => new Date("2026-07-25T00:00:00Z"),
    });

    const before = adapter.readSnapshot();
    await fs.appendFile(
      path.join(controlPlaneRoot, "specs", "_active.md"),
      "\n## Next Recommended Action\n\nVerify.\n",
    );
    const after = adapter.readSnapshot();

    expect(before.source_epoch).toBe(CANDIDATE_SOURCE_EPOCH);
    expect(after.source_epoch).toBe(CANDIDATE_SOURCE_EPOCH);
    expect(after.projection_epoch).not.toBe(before.projection_epoch);
  });

  it("resolves relative project paths against controlRoot without rebasing absolute paths", async () => {
    const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "donggri-source-adapter-paths-"));
    temporaryDirectories.push(controlRoot);
    const controlPlaneRoot = path.join(controlRoot, "storage", "codex-control");
    await fs.mkdir(path.join(controlPlaneRoot, "registry"), { recursive: true });
    await fs.mkdir(path.join(controlPlaneRoot, "specs"), { recursive: true });
    await fs.writeFile(
      path.join(controlPlaneRoot, "registry", "projects.yaml"),
      [
        "projects:",
        "  RelativeProject:",
        "    path: repos/DonggriCompany",
        "    status: active",
        "  WindowsProject:",
        "    path: 'G:\\External\\WindowsProject'",
        "    status: active",
        "  PosixProject:",
        "    path: /srv/donggri/PosixProject",
        "    status: active",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(controlPlaneRoot, "specs", "_active.md"),
      [
        "## Current Active Spec (DonggriCompany)",
        "",
        "- Spec ID: `20260725-donggricompany-v1`",
        "- Status: implementation",
        "- Phase: preflight",
        "- Related repo: `G:\\Donggri_DevDrive\\repos\\DonggriCompany`",
        "",
      ].join("\n"),
      "utf8",
    );

    const snapshot = new ControlPlaneSourceAdapter({
      controlRoot,
      controlPlaneRoot,
      sourceEpoch: CANDIDATE_SOURCE_EPOCH,
    }).readSnapshot();

    expect(snapshot.parse_errors).toEqual([]);
    expect(snapshot.projects.map((project) => [project.key, project.path])).toEqual([
      ["RelativeProject", path.resolve(controlRoot, "repos", "DonggriCompany")],
      ["WindowsProject", "G:\\External\\WindowsProject"],
      ["PosixProject", "/srv/donggri/PosixProject"],
    ]);
  });

  it("fails closed with explicit source-missing evidence when the Control Plane documents are absent", async () => {
    const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "donggri-source-adapter-missing-"));
    temporaryDirectories.push(controlRoot);
    const adapter = new ControlPlaneSourceAdapter({
      controlRoot,
      controlPlaneRoot: path.join(controlRoot, "storage", "codex-control"),
      sourceEpoch: CANDIDATE_SOURCE_EPOCH,
      now: () => new Date("2026-07-25T00:00:00Z"),
    });

    const snapshot = adapter.readSnapshot();

    expect(snapshot.degraded).toBe(true);
    expect(snapshot.projects).toEqual([]);
    expect(snapshot.active_specs).toEqual([]);
    expect(snapshot.active_spec).toBeNull();
    expect(snapshot.parse_errors).toHaveLength(2);
    expect(snapshot.parse_errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "storage/codex-control/registry/projects.yaml",
          code: "source_missing",
        }),
        expect.objectContaining({
          source: "storage/codex-control/specs/_active.md",
          code: "source_missing",
        }),
      ]),
    );
  });

  it("fails closed when immutable candidate source authority is absent or malformed", () => {
    expect(() => new ControlPlaneSourceAdapter()).toThrow("candidate_source_epoch_required");
    expect(() => new ControlPlaneSourceAdapter({ sourceEpoch: "sha256:not-a-digest" })).toThrow(
      "candidate_source_epoch_required",
    );
  });

  it("uses the current repository as the portable degraded default instead of a private drive", () => {
    const snapshot = new ControlPlaneSourceAdapter({ sourceEpoch: CANDIDATE_SOURCE_EPOCH }).readSnapshot();

    expect(snapshot.files.projects.absolute_path).toBe(
      path.resolve(process.cwd(), "storage", "codex-control", "registry", "projects.yaml"),
    );
    expect(snapshot.files.projects.absolute_path).toContain(path.basename(process.cwd()));
  });
});
