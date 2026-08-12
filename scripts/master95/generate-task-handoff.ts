import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  Master95HandoffContextSchema,
  Master95LifecycleTaskSchema,
} from "../../server/modules/master95/task-handoff-lifecycle.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const outputRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "lifecycle");
const document = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-task-handoff-lifecycle-v1.json",
  title: "DonggriCompany Master95 Task and Handoff Lifecycle",
  version: "1.0.0",
  definitions: {
    Task: z.toJSONSchema(Master95LifecycleTaskSchema, { target: "draft-2020-12", unrepresentable: "any" }),
    Handoff: z.toJSONSchema(Master95HandoffContextSchema, { target: "draft-2020-12", unrepresentable: "any" }),
  },
};
const schemaPath = path.join(outputRoot, "TASK_HANDOFF.schema.json");
const content = `${JSON.stringify(document, null, 2)}\n`;
if (process.argv.includes("--write")) {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(schemaPath, content, "utf8");
  process.stdout.write("[master95-lifecycle] wrote Task/Handoff schema\n");
} else if (!fs.existsSync(schemaPath) || fs.readFileSync(schemaPath, "utf8") !== content) {
  process.stderr.write(`[master95-lifecycle] drift: ${schemaPath}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("[master95-lifecycle] schema check passed\n");
}
