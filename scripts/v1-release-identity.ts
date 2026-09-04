import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { resolveDonggriControlRoot } from "../server/config/control-root.ts";
import { resolveReleaseIdentity } from "../server/modules/release/release-identity.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const REPOSITORY_SELECTION_SHA = path.join(PROJECT_ROOT, "contracts", "v1", "selection-manifest.sha256");
const CONTROL_ROOT = resolveDonggriControlRoot({
  envValue: process.env.DONGGRI_CONTROL_ROOT,
  repoRoot: PROJECT_ROOT,
});
const CONTROL_PLANE_SELECTION_SHA = path.resolve(
  CONTROL_ROOT,
  "storage",
  "codex-control",
  "specs",
  "20260725-donggricompany-v1-stabilization-certification-v1",
  "SELECTION_MANIFEST.sha256",
);

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name}_value_required`);
  return value;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function assertCleanCandidate(): void {
  const status = execFileSync("git", ["-C", PROJECT_ROOT, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  if (status) throw new Error("release_identity_candidate_worktree_dirty");
}

function currentGitSha(): string {
  const supplied = process.env.DONGRI_RELEASE_GIT_SHA?.trim().toLowerCase();
  if (supplied && !/^[0-9a-f]{40}$/.test(supplied)) throw new Error("release_git_sha_invalid");
  const head = execFileSync("git", ["-C", PROJECT_ROOT, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  })
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error("release_git_sha_invalid");
  if (supplied && supplied !== head) throw new Error("release_git_sha_head_mismatch");
  return head;
}

function selectionManifestSha256(): string {
  const explicitPath = argumentValue("--selection-sha-file");
  const checksumPath = path.resolve(explicitPath ?? REPOSITORY_SELECTION_SHA);
  const checksum = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/.test(checksum)) throw new Error("selection_manifest_sha256_invalid");
  if (!explicitPath && fs.existsSync(CONTROL_PLANE_SELECTION_SHA)) {
    const controlPlaneChecksum =
      fs.readFileSync(CONTROL_PLANE_SELECTION_SHA, "utf8").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (controlPlaneChecksum !== checksum) {
      throw new Error("selection_manifest_contract_drift");
    }
  }
  return checksum;
}

function expectedCandidateId(productVersion: string): string {
  const suffix = productVersion.replace(/^1\.0\.0-/, "");
  return `dongri-grigri-v01-${suffix}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256(bytes: string): string {
  return crypto.createHash("sha256").update(bytes, "utf8").digest("hex");
}

function writeAsset(outputPath: string, serialized: string): void {
  const absoluteOutput = path.resolve(outputPath);
  if (!absoluteOutput.startsWith(`${PROJECT_ROOT}${path.sep}`)) {
    throw new Error("release_identity_output_outside_project");
  }
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, serialized, { encoding: "utf8", flag: "w" });
  fs.writeFileSync(`${absoluteOutput}.sha256`, `${sha256(serialized)}  ${path.basename(absoluteOutput)}\n`, {
    encoding: "utf8",
    flag: "w",
  });
}

function main(): void {
  if (hasFlag("--require-clean")) assertCleanCandidate();
  const selectionSha = selectionManifestSha256();
  const gitSha = currentGitSha();
  if (hasFlag("--require-build-binding")) {
    const supplied = process.env.DONGRI_RELEASE_GIT_SHA?.trim().toLowerCase() ?? "";
    if (supplied !== gitSha) throw new Error("release_identity_build_git_sha_not_bound");
  }
  const identity = resolveReleaseIdentity(PROJECT_ROOT, {
    ...process.env,
    DONGRI_RELEASE_GIT_SHA: gitSha,
    DONGRI_SOURCE_EPOCH: `sha256:${selectionSha}`,
  });

  if (identity.source_epoch !== `sha256:${selectionSha}`) {
    throw new Error("release_identity_selection_manifest_mismatch");
  }
  if (identity.git_sha !== gitSha || identity.target_revision !== gitSha) {
    throw new Error("release_identity_git_binding_mismatch");
  }
  if (identity.candidate_id !== expectedCandidateId(identity.product_version)) {
    throw new Error(
      `release_identity_candidate_id_mismatch:${identity.candidate_id}:${expectedCandidateId(identity.product_version)}`,
    );
  }

  const serialized = canonicalJson(identity);
  const output = argumentValue("--write");
  if (output) writeAsset(output, serialized);

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: output ? "write" : "check",
      candidate_id: identity.candidate_id,
      product_version: identity.product_version,
      git_sha: identity.git_sha,
      source_epoch: identity.source_epoch,
      identity_sha256: sha256(serialized),
      clean_required: hasFlag("--require-clean"),
      build_binding_required: hasFlag("--require-build-binding"),
      output: output ? path.resolve(output) : null,
    })}\n`,
  );
}

main();
