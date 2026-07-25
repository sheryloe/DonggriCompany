import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  MASTER95_DEFAULT_SANDBOX_PROFILES,
  Master95ApprovalRecordSchema,
} from "../../server/modules/master95/policy-engine.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const outputRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "policy");
const document = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-approval-v1.json",
  title: "DonggriCompany Master95 Approval and Sandbox Policy",
  version: "1.0.0",
  approval_schema: z.toJSONSchema(Master95ApprovalRecordSchema, { target: "draft-2020-12", unrepresentable: "any" }),
  sandbox_profiles: MASTER95_DEFAULT_SANDBOX_PROFILES,
};
const file = path.join(outputRoot, "POLICY_APPROVAL_SANDBOX_BASELINE.json");
const content = `${JSON.stringify(document, null, 2)}\n`;
if (process.argv.includes("--write")) {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  process.stdout.write(
    `[master95-policy] wrote approval schema and ${MASTER95_DEFAULT_SANDBOX_PROFILES.length} sandbox profiles\n`,
  );
} else if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) {
  process.stderr.write(`[master95-policy] drift: ${file}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `[master95-policy] check passed: ${MASTER95_DEFAULT_SANDBOX_PROFILES.length} sandbox profiles\n`,
  );
}
