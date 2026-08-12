import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  MASTER95_CONTRACT_SCHEMAS,
  MASTER95_CONTRACT_VERSION,
  MASTER95_STATE_EVENT_TYPES,
  Master95StateEventSchema,
} from "../../server/modules/master95/contracts.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const contractsRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "contracts");
const schemaPath = path.join(contractsRoot, "MASTER95_CONTRACTS.schema.json");
const eventPath = path.join(contractsRoot, "MASTER95_EVENTS.schema.json");

const definitions = Object.fromEntries(
  Object.entries(MASTER95_CONTRACT_SCHEMAS).map(([name, schema]) => [
    name,
    z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }),
  ]),
);
const contractDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-contracts-v1.json",
  title: "DonggriCompany Master95 Canonical Contracts",
  version: MASTER95_CONTRACT_VERSION,
  object_count: Object.keys(definitions).length,
  definitions,
};
const eventDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-events-v1.json",
  title: "DonggriCompany Master95 Event Contract",
  version: MASTER95_CONTRACT_VERSION,
  event_types: MASTER95_STATE_EVENT_TYPES,
  schema: z.toJSONSchema(Master95StateEventSchema, { target: "draft-2020-12", unrepresentable: "any" }),
};
const expected = [
  [schemaPath, `${JSON.stringify(contractDocument, null, 2)}\n`],
  [eventPath, `${JSON.stringify(eventDocument, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  fs.mkdirSync(contractsRoot, { recursive: true });
  for (const [file, content] of expected) fs.writeFileSync(file, content, "utf8");
  process.stdout.write(`[master95-contracts] wrote ${expected.length} schema files\n`);
} else {
  const drift = expected.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length > 0) {
    process.stderr.write(`[master95-contracts] drift: ${drift.map(([file]) => file).join(", ")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-contracts] check passed: ${Object.keys(definitions).length} objects, ${MASTER95_STATE_EVENT_TYPES.length} event types\n`,
    );
  }
}
