import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { validateComponentReport } from "../../server/modules/control-plane/certification-contract.js";
import { Master95ImageWorkbench } from "../../server/modules/master95/image-workbench.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const historicalQualityRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "quality",
  "master-95",
  "image-workbench",
);
const historicalReportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-14",
  "master95-image-workbench",
);
const historicalBaselinePath = path.join(historicalQualityRoot, "IMAGE_WORKBENCH_BASELINE.json");
const historicalReportPath = path.join(historicalReportRoot, "visual-v2-asset-verification-report.json");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
  donggriRelease?: {
    candidateId?: string;
    sourceEpoch?: string;
    builtAt?: string;
  };
};
const release = z
  .object({
    candidateId: z.string().regex(/^[A-Za-z0-9._-]+$/),
    sourceEpoch: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    builtAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "invalid_built_at"),
  })
  .parse(packageJson.donggriRelease);
const candidateRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "quality",
  "dongri-grigri-v1",
  "candidates",
  release.candidateId,
);
const candidateInputRoot = path.join(candidateRoot, "inputs");
const candidateEvidenceRoot = path.join(candidateInputRoot, "evidence", "image-workbench");
const browserEvidencePath = path.join(candidateEvidenceRoot, "IMAGE_WORKBENCH_BROWSER_EVIDENCE.json");
const staticReportPath = path.join(candidateEvidenceRoot, "IMAGE_WORKBENCH_STATIC_VERIFICATION.json");
const componentReportPath = path.join(candidateInputRoot, "component-reports", "image_workbench_test.json");
const styleManifestPath = path.join(
  repoRoot,
  "assets",
  "generated",
  "game_asset_pipeline",
  "donggri-visual-v2-styleboard",
  "manifest.json",
);
const spriteManifestPath = path.join(
  repoRoot,
  "assets",
  "generated",
  "game_asset_pipeline",
  "donggri-visual-v2-sprites",
  "manifest.json",
);
const styleManifest = JSON.parse(fs.readFileSync(styleManifestPath, "utf8")) as {
  source_files: string[];
  published_files: string[];
};
const spriteManifest = JSON.parse(fs.readFileSync(spriteManifestPath, "utf8")) as {
  sprite_contract: {
    sprite_numbers: number;
    directions: string[];
    frames_per_direction: number;
    expected_files: number;
  };
  published_directory: string;
  runtime_props_atlas: string;
};
const workbench = new Master95ImageWorkbench();
const sourcePath = styleManifest.source_files.find((file) => file.endsWith(".png"))!;
const source = register("visual-v2-styleboard-source", sourcePath, sourcePath, [], "approved");
const published = styleManifest.published_files.map((file, index) =>
  register(`visual-v2-published-${index + 1}`, sourcePath, file, [source.artifact_id], "approved"),
);
const runtimeAtlas = register(
  "visual-v2-runtime-props-atlas",
  sourcePath,
  spriteManifest.runtime_props_atlas,
  [source.artifact_id],
  "approved",
);
const spriteDir = path.join(repoRoot, spriteManifest.published_directory);
const actualSpriteFiles = fs
  .readdirSync(spriteDir)
  .filter((file) => /^\d+-(?:D|L|B|R)-[123]\.png$/.test(file))
  .sort();
const expectedSpriteFiles = [];
for (let sprite = 1; sprite <= spriteManifest.sprite_contract.sprite_numbers; sprite += 1) {
  for (const direction of spriteManifest.sprite_contract.directions) {
    for (let frame = 1; frame <= spriteManifest.sprite_contract.frames_per_direction; frame += 1) {
      expectedSpriteFiles.push(`${sprite}-${direction}-${frame}.png`);
    }
  }
}
expectedSpriteFiles.sort();
const missingSprites = expectedSpriteFiles.filter((file) => !actualSpriteFiles.includes(file));
const unexpectedSprites = actualSpriteFiles.filter((file) => !expectedSpriteFiles.includes(file));
const missingPublished = styleManifest.published_files.filter((file) => !fs.existsSync(path.join(repoRoot, file)));
const lineageCoverage = [...published, runtimeAtlas].filter((artifact) =>
  workbench.lineage(artifact.artifact_id).some((item) => item.artifact_id === source.artifact_id),
).length;
const spriteAggregateSha256 = crypto
  .createHash("sha256")
  .update(actualSpriteFiles.map((file) => `${file}:${sha256(path.join(spriteDir, file))}`).join("\n"))
  .digest("hex");
const verifiedArtifacts = published.length + 1 + actualSpriteFiles.length;
const expectedArtifacts = styleManifest.published_files.length + 1 + spriteManifest.sprite_contract.expected_files;
const staticStatus =
  missingPublished.length === 0 &&
  missingSprites.length === 0 &&
  unexpectedSprites.length === 0 &&
  verifiedArtifacts === expectedArtifacts &&
  lineageCoverage === published.length + 1
    ? "pass"
    : "fail";
const BrowserEvidenceSchema = z
  .object({
    schema: z.literal("donggri-image-workbench-browser-evidence/v1"),
    candidate_id: z.literal(release.candidateId),
    source_epoch: z.literal(release.sourceEpoch),
    generated_at: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "invalid_generated_at"),
    evidence_mode: z.literal("actual"),
    status: z.enum(["pass", "fail"]),
    browser_journeys_performed: z.literal(true),
    journey_count: z.number().int().positive(),
    summary: z.string().min(1),
  })
  .strict();
const browserEvidence = fs.existsSync(browserEvidencePath)
  ? BrowserEvidenceSchema.parse(JSON.parse(fs.readFileSync(browserEvidencePath, "utf8")))
  : null;
const componentStatus =
  staticStatus === "fail" || browserEvidence?.status === "fail"
    ? "fail"
    : browserEvidence?.status === "pass"
      ? "pass"
      : "collecting";
const staticReport = {
  schema: "donggri-image-workbench-static-verification/v1",
  candidate_id: release.candidateId,
  source_epoch: release.sourceEpoch,
  generated_at: release.builtAt,
  evidence_mode: "actual",
  static_status: staticStatus,
  component_status: componentStatus,
  certification_claimed: false,
  source_artifact_id: source.artifact_id,
  source_sha256: source.sha256,
  published_image_count: published.length,
  runtime_props_atlas_verified: fs.existsSync(path.join(repoRoot, spriteManifest.runtime_props_atlas)),
  expected_sprite_count: spriteManifest.sprite_contract.expected_files,
  actual_sprite_count: actualSpriteFiles.length,
  expected_artifact_count: expectedArtifacts,
  verified_artifact_count: verifiedArtifacts,
  artifact_loss_count: expectedArtifacts - verifiedArtifacts,
  missing_published_files: missingPublished,
  missing_sprite_files: missingSprites,
  misdirected_sprite_files: unexpectedSprites,
  source_lineage_coverage: lineageCoverage / (published.length + 1),
  approved_export_coverage:
    workbench.snapshot().filter((item) => item.approval_status === "approved").length / workbench.snapshot().length,
  sprite_aggregate_sha256: spriteAggregateSha256,
  browser_journeys_performed: browserEvidence?.browser_journeys_performed ?? false,
  browser_evidence_status: browserEvidence?.status ?? "missing",
  historical_evidence_credited: false,
  historical_references: [
    historicalReference("master95-image-workbench-baseline", historicalBaselinePath),
    historicalReference("master95-image-workbench-report", historicalReportPath),
  ],
};
const staticReportContent = `${JSON.stringify(staticReport, null, 2)}\n`;
const evidenceFiles = [
  evidenceReference(
    staticReportPath,
    componentReportPath,
    Buffer.byteLength(staticReportContent, "utf8"),
    sha256Text(staticReportContent),
  ),
];
if (browserEvidence) {
  evidenceFiles.push(
    evidenceReference(
      browserEvidencePath,
      componentReportPath,
      fs.statSync(browserEvidencePath).size,
      sha256(browserEvidencePath),
    ),
  );
}
const componentReport = validateComponentReport({
  schema: "donggri-component-report/v1",
  report_type: "component",
  component: "image_workbench_test",
  candidate_id: release.candidateId,
  source_epoch: release.sourceEpoch,
  generated_at: release.builtAt,
  evidence_mode: "actual",
  component_status: componentStatus,
  certification_claimed: false,
  evidence_files: evidenceFiles,
  summary:
    componentStatus === "pass"
      ? "Candidate-scoped static asset and browser journey evidence passed."
      : componentStatus === "fail"
        ? "Candidate-scoped Image Workbench evidence contains a failed gate."
        : "Static asset verification passed, but candidate-scoped browser/run evidence is still collecting.",
});
const outputs = [
  [staticReportPath, staticReportContent],
  [componentReportPath, `${JSON.stringify(componentReport, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  for (const [file, content] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  process.stdout.write(
    `[master95-image-workbench] wrote candidate=${release.candidateId}, component=${componentStatus}, static=${staticStatus}\n`,
  );
} else {
  const drift = outputs.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length) {
    for (const [file] of drift) process.stderr.write(`[master95-image-workbench] drift: ${file}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-image-workbench] check passed: candidate=${release.candidateId}, component=${componentStatus}, sprites=${actualSpriteFiles.length}, loss=${staticReport.artifact_loss_count}\n`,
    );
  }
}
if (componentStatus === "fail") process.exitCode = 1;

function register(
  artifactId: string,
  sourceUri: string,
  outputUri: string,
  sourceArtifactIds: string[],
  approvalStatus: "approved" | "draft",
) {
  const absolute = path.join(repoRoot, outputUri);
  const size = pngSize(absolute);
  return workbench.register({
    artifact_id: artifactId,
    project_id: "project:DonggriCompany",
    task_id: "task:image:visual-v2",
    run_id: "run:image:visual-v2",
    trace_id: `trace:image:${artifactId}`,
    created_by_agent_id: "design-worker:visual-v2",
    skill_id: "image.asset.verify",
    skill_version: "1.0.0",
    model: "deterministic-file-verifier",
    prompt_version: "visual-v2-manifest-v1",
    operation: sourceArtifactIds.length === 0 ? "input" : "analyze",
    version: 1,
    parent_artifact_id: null,
    source_artifact_ids: sourceArtifactIds,
    source_uri: sourceUri,
    output_uri: outputUri,
    sha256: sha256(absolute),
    mime_type: "image/png",
    width: size.width,
    height: size.height,
    rights_source: "internal-codex-imagegen-and-deterministic-derivation",
    created_at: "2026-07-13T00:00:00.000Z",
    modified_at: "2026-07-13T00:00:00.000Z",
    processing_status: "complete",
    failure_reason: null,
    analysis_summary: "Visual V2 file existence, dimensions, checksum, and source lineage verified.",
    approval_status: approvalStatus,
    exported_at: approvalStatus === "approved" ? "2026-07-13T00:00:00.000Z" : null,
  });
}

function sha256(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sha256Text(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function historicalReference(kind: string, file: string) {
  if (!fs.existsSync(file)) {
    return {
      kind,
      path: path.relative(controlRoot, file).replaceAll("\\", "/"),
      exists: false,
      sha256: null,
      bytes: null,
      evidence_credited: false,
    };
  }
  return {
    kind,
    path: path.relative(controlRoot, file).replaceAll("\\", "/"),
    exists: true,
    sha256: sha256(file),
    bytes: fs.statSync(file).size,
    evidence_credited: false,
  };
}

function evidenceReference(file: string, reportFile: string, bytes: number, hash: string) {
  return {
    path: path.relative(path.dirname(reportFile), file).replaceAll("\\", "/"),
    sha256: hash,
    bytes,
  };
}

function pngSize(file: string) {
  const bytes = fs.readFileSync(file);
  if (bytes.toString("ascii", 1, 4) !== "PNG") throw new Error(`not_png:${file}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
