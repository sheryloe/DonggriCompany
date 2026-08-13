import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateV01SmokeAuthority } from "./v01-smoke-authority.mjs";

const approvalId = "APR-V01-ALPHA2-SMOKE-TEST-001";
const candidate = Object.freeze({
  candidate_id: "dongri-grigri-v01-alpha.2",
  git_sha: "1".repeat(40),
  source_epoch: `sha256:${"2".repeat(64)}`,
});
const now = new Date("2026-08-13T12:00:00+09:00");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-v01-smoke-authority-"));
  const reportRoot = path.join(root, "g-report");
  const fiveRuntime = path.join(root, "e-five");
  const a11yRuntime = path.join(root, "e-a11y");
  const serviceRuntime = path.join(root, "e-service");
  const supervisorRoot = path.join(root, "f-supervisor");
  const fiveOutput = path.join(reportRoot, "FIVE_JOURNEY_EVIDENCE.json");
  const a11yOutput = path.join(reportRoot, "ACCESSIBILITY_AUTOMATION.json");
  const freezeRecordPath = path.join(root, "CANDIDATE_FREEZE_RECORD.json");
  const manifestPath = path.join(root, "SMOKE_BOUNDARY_MANIFEST.json");
  const ledgerPath = path.join(root, "approvals.md");

  const freezeIdentity = {
    product_id: "dongri-grigri",
    release_epoch: "dongri-grigri-v1",
    product_version: "1.0.0-alpha.2",
    channel: "alpha",
    ...candidate,
  };
  const freezeUnsigned = {
    schema: "donggri-source-epoch-freeze/v1",
    approval_id: "APR-V01-FREEZE-TEST-001",
    selection_manifest_sha256: candidate.source_epoch.slice("sha256:".length),
    candidate_identity: freezeIdentity,
    candidate_identity_sha256: canonicalSha256(freezeIdentity),
    source_epoch: candidate.source_epoch,
    approved_at: "2026-08-13T00:00:00+09:00",
    approval_expires_at: "2026-08-31T23:59:59+09:00",
    frozen_at: "2026-08-13T00:00:01+09:00",
  };
  const freezeRecord = { ...freezeUnsigned, freeze_record_sha256: canonicalSha256(freezeUnsigned) };
  fs.writeFileSync(freezeRecordPath, `${JSON.stringify(freezeRecord, null, 2)}\n`);

  const fiveCommand = [
    "--approval",
    approvalId,
    "--manifest",
    manifestPath,
    "--freeze-record",
    freezeRecordPath,
    "--runtime-root",
    fiveRuntime,
    "--output",
    fiveOutput,
  ];
  const a11yCommand = [
    "--approval",
    approvalId,
    "--manifest",
    manifestPath,
    "--freeze-record",
    freezeRecordPath,
    "--base-url",
    "http://127.0.0.1:8810",
    "--artifact-root",
    a11yRuntime,
    "--output",
    a11yOutput,
  ];
  const manifest = {
    schema_version: "donggri-v01-alpha2-smoke-boundary/v1",
    attempt_id: "v01-alpha2-smoke-test-attempt-01",
    approval_id: approvalId,
    candidate: {
      ...candidate,
      freeze_record_sha256: freezeRecord.freeze_record_sha256,
      freeze_file_sha256: sha256(fs.readFileSync(freezeRecordPath)),
    },
    repo: { worktree: root, expected_head: candidate.git_sha, clean_required: true },
    network_boundary: {
      api_origin: "http://127.0.0.1:8790",
      web_origin: "http://127.0.0.1:8810",
      allowed_hosts: ["127.0.0.1"],
      external_network_effects_allowed: false,
    },
    process_boundary: { maximum_runtime_seconds: 900, persistent_autostart_allowed: false },
    storage_boundary: {
      e_runtime_paths: [serviceRuntime, fiveRuntime, a11yRuntime],
      g_report_root: reportRoot,
      g_new_outputs: [
        "FIVE_JOURNEY_EVIDENCE.json",
        "FIVE_JOURNEY_EVIDENCE.json.sha256",
        "ACCESSIBILITY_AUTOMATION.json",
        "ACCESSIBILITY_AUTOMATION.json.sha256",
      ],
      f_supervisor_log_root: supervisorRoot,
      overwrite_allowed: false,
      cleanup_allowed: false,
    },
    evidence_commands: {
      five_journey: ["corepack", "pnpm", "run", "master95:ux-audit:v01:five-journey", "--", ...fiveCommand],
      accessibility_automation: [
        "corepack",
        "pnpm",
        "run",
        "master95:ux-audit:v01:accessibility:automate",
        "--",
        ...a11yCommand,
      ],
    },
  };

  function writeManifest() {
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  function ledgerSection(overrides = {}) {
    const fields = {
      approval_id: approvalId,
      expires_at: "2026-08-31 KST",
      candidate: candidate.candidate_id,
      git_sha: candidate.git_sha,
      source_epoch: candidate.source_epoch,
      freeze_record_sha256: freezeRecord.freeze_record_sha256,
      boundary_manifest: manifestPath,
      boundary_manifest_sha256: sha256(fs.readFileSync(manifestPath)),
      attempt_id: manifest.attempt_id,
      operation_class: "bounded-isolated-local-alpha2-smoke-runtime",
      policy_decision: "approved",
      ...overrides,
    };
    return `## ${approvalId}\n\n${Object.entries(fields)
      .map(([name, value]) => `- ${name}: \`${value}\``)
      .join("\n")}\n- exact_runtime_paths:\n${[serviceRuntime, fiveRuntime, a11yRuntime, supervisorRoot, reportRoot]
      .map((value) => `  - \`${value}\``)
      .join("\n")}\n- loopback_ports: API \`127.0.0.1:8790\`; web \`127.0.0.1:8810\`\n`;
  }

  function writeLedger(overrides = {}, prefix = "") {
    fs.writeFileSync(ledgerPath, `${prefix}${ledgerSection(overrides)}`);
  }

  writeManifest();
  writeLedger();
  return {
    root,
    manifest,
    manifestPath,
    ledgerPath,
    freezeRecordPath,
    fiveCommand,
    a11yCommand,
    ledgerSection,
    writeLedger,
    input(component = "five_journey") {
      return {
        approvalId,
        ledgerPath,
        manifestPath,
        freezeRecordPath,
        component,
        commandArgs: component === "five_journey" ? [...fiveCommand] : [...a11yCommand],
        candidate: { ...candidate, worktree: root, clean: true },
        now,
      };
    },
  };
}

function withFixture(run) {
  const value = fixture();
  try {
    run(value);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
}

test("accepts an exact approval, manifest, freeze, candidate, component command, and path chain", () =>
  withFixture((value) => {
    const authority = validateV01SmokeAuthority(value.input());
    assert.equal(authority.attempt_id, value.manifest.attempt_id);
    assert.equal(authority.boundary_manifest_path, value.manifestPath);
    assert.equal(authority.component, "five_journey");
  }));

test("rejects a prefix-only approval heading", () =>
  withFixture((value) => {
    fs.writeFileSync(value.ledgerPath, value.ledgerSection().replace(`## ${approvalId}`, `## ${approvalId}-EXTRA`));
    assert.throws(() => validateV01SmokeAuthority(value.input()), /smoke_authority_approval_not_recorded/);
  }));

test("rejects duplicate exact approval headings", () =>
  withFixture((value) => {
    fs.appendFileSync(value.ledgerPath, `\n${value.ledgerSection()}`);
    assert.throws(() => validateV01SmokeAuthority(value.input()), /smoke_authority_approval_heading_duplicate/);
  }));

test("rejects a substituted manifest after ledger approval", () =>
  withFixture((value) => {
    fs.appendFileSync(value.manifestPath, " ");
    assert.throws(() => validateV01SmokeAuthority(value.input()), /smoke_authority_manifest_sha256_mismatch/);
  }));

test("rejects a substituted manifest path even when another readable manifest is supplied", () =>
  withFixture((value) => {
    const substitutedPath = path.join(value.root, "SUBSTITUTED_MANIFEST.json");
    fs.copyFileSync(value.manifestPath, substitutedPath);
    const substituted = value.input();
    substituted.manifestPath = substitutedPath;
    assert.throws(() => validateV01SmokeAuthority(substituted), /smoke_authority_manifest_path_mismatch/);
  }));

test("rejects an expired approval", () =>
  withFixture((value) => {
    value.writeLedger({ expires_at: "2026-08-12 KST" });
    assert.throws(() => validateV01SmokeAuthority(value.input()), /smoke_authority_approval_expired/);
  }));

test("rejects a dirty or wrong-SHA candidate", () =>
  withFixture((value) => {
    const dirty = value.input();
    dirty.candidate.clean = false;
    assert.throws(() => validateV01SmokeAuthority(dirty), /smoke_authority_candidate_worktree_dirty/);
    const stale = value.input();
    stale.candidate.git_sha = "9".repeat(40);
    assert.throws(() => validateV01SmokeAuthority(stale), /smoke_authority_manifest_git_sha_mismatch/);
  }));

test("rejects path, origin, and component command substitution", () =>
  withFixture((value) => {
    const pathSwap = value.input();
    pathSwap.commandArgs[pathSwap.commandArgs.indexOf("--output") + 1] += ".other";
    assert.throws(() => validateV01SmokeAuthority(pathSwap), /smoke_authority_component_command_mismatch/);

    const originSwap = value.input("accessibility_automation");
    originSwap.commandArgs[originSwap.commandArgs.indexOf("--base-url") + 1] = "http://127.0.0.1:9999";
    assert.throws(() => validateV01SmokeAuthority(originSwap), /smoke_authority_component_command_mismatch/);

    const componentSwap = value.input();
    componentSwap.commandArgs = [...value.a11yCommand];
    assert.throws(() => validateV01SmokeAuthority(componentSwap), /smoke_authority_component_command_mismatch/);
  }));
