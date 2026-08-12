import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Master95ImageArtifactSchema, Master95ImageWorkbench } from "../../server/modules/master95/image-workbench.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const qualityRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "image-workbench");
const reportRoot = path.join(
  controlRoot,
  "storage",
  "codex-control",
  "reports",
  "DonggriCompany",
  "2026-07-14",
  "master95-image-workbench",
);
const baselinePath = path.join(qualityRoot, "IMAGE_WORKBENCH_BASELINE.json");
const reportPath = path.join(reportRoot, "visual-v2-asset-verification-report.json");
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
const baseline = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-image-workbench-v1.json",
  title: "DonggriCompany Master95 Image Workbench",
  version: "1.0.0",
  artifact_schema: z.toJSONSchema(Master95ImageArtifactSchema, { target: "draft-2020-12", unrepresentable: "any" }),
  artifacts: workbench.snapshot(),
  gates: {
    source_lineage_coverage_required: 1,
    missing_asset_required: 0,
    misdirected_asset_required: 0,
    unapproved_export_required: 0,
  },
};
const verifiedArtifacts = published.length + 1 + actualSpriteFiles.length;
const expectedArtifacts = styleManifest.published_files.length + 1 + spriteManifest.sprite_contract.expected_files;
const report = {
  schema_version: "2026-07-14.master95.image-workbench-evaluation.v1",
  status:
    missingPublished.length === 0 &&
    missingSprites.length === 0 &&
    unexpectedSprites.length === 0 &&
    verifiedArtifacts === expectedArtifacts &&
    lineageCoverage === published.length + 1
      ? "pass"
      : "fail",
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
  browser_journeys_performed: false,
  evaluated_at: "2026-07-14T12:00:00.000Z",
};
const outputs = [
  [baselinePath, `${JSON.stringify(baseline, null, 2)}\n`],
  [reportPath, `${JSON.stringify(report, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  for (const [file, content] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  process.stdout.write(`[master95-image-workbench] wrote ${verifiedArtifacts}-asset verification\n`);
} else {
  const drift = outputs.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length) {
    for (const [file] of drift) process.stderr.write(`[master95-image-workbench] drift: ${file}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-image-workbench] check passed: sprites=${actualSpriteFiles.length}, loss=${report.artifact_loss_count}\n`,
    );
  }
}
if (report.status !== "pass") process.exitCode = 1;

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

function pngSize(file: string) {
  const bytes = fs.readFileSync(file);
  if (bytes.toString("ascii", 1, 4) !== "PNG") throw new Error(`not_png:${file}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
