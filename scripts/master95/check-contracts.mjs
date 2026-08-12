#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const root = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "contracts");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const contracts = readJson("MASTER95_CONTRACTS.schema.json");
const events = readJson("MASTER95_EVENTS.schema.json");
const baseline = readJson("CONTRACT_BASELINE.v1.json");
const errors = readJson("ERROR_CODES.json");
const names = Object.keys(contracts.definitions ?? {});
assert(contracts.version === baseline.version, "contract and baseline versions must match");
assert(names.length === 15, `expected 15 objects, got ${names.length}`);
assert(JSON.stringify(names) === JSON.stringify(baseline.object_names), "object order/names drifted from baseline");
for (const name of names) {
  const schema = contracts.definitions[name];
  const required = schema.required ?? [];
  for (const field of baseline.common_required_fields)
    assert(required.includes(field), `${name}: missing required field ${field}`);
  assert(schema.additionalProperties === false, `${name}: unknown fields must be rejected`);
}
const eventRequired = events.schema?.required ?? [];
for (const field of baseline.required_event_fields)
  assert(eventRequired.includes(field), `Event: missing required field ${field}`);
assert(
  Array.isArray(events.event_types) && events.event_types.length === 18,
  "exactly 18 canonical event types are required",
);
const errorCodes = errors.errors.map((item) => item.code);
assert(errorCodes.length >= 15, "at least 15 error codes are required");
assert(new Set(errorCodes).size === errorCodes.length, "error codes must be unique");
for (const file of ["API_EVENT_CONTRACT.md", "VERSION_POLICY.md", "MIGRATION_POLICY.md"])
  assert(fs.existsSync(path.join(root, file)), `missing policy doc: ${file}`);
assert(
  !fs.readFileSync(path.join(root, "API_EVENT_CONTRACT.md"), "utf8").includes("TBD"),
  "API/Event contract contains unresolved TBD",
);

process.stdout.write(
  `${JSON.stringify({ version: contracts.version, objects: names.length, common_required_fields: baseline.common_required_fields.length, event_types: events.event_types.length, event_required_fields: eventRequired.length, error_codes: errorCodes.length, compatibility_baseline: "pass", passed: true }, null, 2)}\n`,
);
