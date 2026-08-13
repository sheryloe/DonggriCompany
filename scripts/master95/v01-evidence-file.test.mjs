import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { writeV01EvidencePairCreateNew } from "./v01-evidence-file.mjs";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("creates and verifies one report and SHA sidecar pair", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v01-evidence-pair-"));
  try {
    const outputPath = path.join(root, "REPORT.json");
    const serialized = '{"ok":true}\n';
    const result = writeV01EvidencePairCreateNew({ outputPath, serialized });
    assert.equal(fs.readFileSync(outputPath, "utf8"), serialized);
    assert.equal(fs.readFileSync(`${outputPath}.sha256`, "utf8"), `${sha256(serialized)}  REPORT.json\n`);
    assert.equal(result.sha256, sha256(serialized));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rolls back only the newly claimed report when a pre-existing sidecar blocks the pair", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v01-evidence-pair-"));
  try {
    const outputPath = path.join(root, "REPORT.json");
    const sidecarPath = `${outputPath}.sha256`;
    fs.writeFileSync(sidecarPath, "preserve-existing-sidecar\n", { flag: "wx" });
    assert.throws(() => writeV01EvidencePairCreateNew({ outputPath, serialized: '{"ok":true}\n' }), /EEXIST/);
    assert.equal(fs.existsSync(outputPath), false);
    assert.equal(fs.readFileSync(sidecarPath, "utf8"), "preserve-existing-sidecar\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("does not alter a pre-existing report or create its sidecar", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v01-evidence-pair-"));
  try {
    const outputPath = path.join(root, "REPORT.json");
    fs.writeFileSync(outputPath, "preserve-existing-report\n", { flag: "wx" });
    assert.throws(() => writeV01EvidencePairCreateNew({ outputPath, serialized: '{"ok":true}\n' }), /EEXIST/);
    assert.equal(fs.readFileSync(outputPath, "utf8"), "preserve-existing-report\n");
    assert.equal(fs.existsSync(`${outputPath}.sha256`), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
