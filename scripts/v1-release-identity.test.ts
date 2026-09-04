import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT_PATH = path.join(PROJECT_ROOT, "scripts", "v1-release-identity.ts");
const TSX_CLI_PATH = path.join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const REPOSITORY_SELECTION_SHA = fs
  .readFileSync(path.join(PROJECT_ROOT, "contracts", "v1", "selection-manifest.sha256"), "utf8")
  .trim()
  .split(/\s+/)[0];
const tempRoots: string[] = [];

function createControlRoot(checksum: string): string {
  const controlRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-identity-control-root-"));
  tempRoots.push(controlRoot);
  const specRoot = path.join(
    controlRoot,
    "storage",
    "codex-control",
    "specs",
    "20260725-donggricompany-v1-stabilization-certification-v1",
  );
  fs.mkdirSync(specRoot, { recursive: true });
  fs.writeFileSync(path.join(specRoot, "SELECTION_MANIFEST.sha256"), `${checksum}  SELECTION_MANIFEST.json\n`, "utf8");
  return controlRoot;
}

function runReleaseIdentity(controlRoot: string) {
  return spawnSync(process.execPath, [TSX_CLI_PATH, SCRIPT_PATH], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      DONGGRI_CONTROL_ROOT: controlRoot,
    },
    encoding: "utf8",
    windowsHide: true,
  });
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const target = tempRoots.pop();
    if (target) fs.rmSync(target, { recursive: true, force: true });
  }
});

describe("v1 release identity control-root binding", () => {
  it("reads the certification checksum under explicit DONGGRI_CONTROL_ROOT", () => {
    const controlRoot = createControlRoot(REPOSITORY_SELECTION_SHA);

    const result = runReleaseIdentity(controlRoot);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as { ok?: unknown; source_epoch?: unknown };
    assert.equal(output.ok, true);
    assert.equal(output.source_epoch, `sha256:${REPOSITORY_SELECTION_SHA}`);
  });

  it("detects drift at the configured control root instead of a fixed drive", () => {
    const controlRoot = createControlRoot("0".repeat(64));

    const result = runReleaseIdentity(controlRoot);

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /selection_manifest_contract_drift/);
  });
});
