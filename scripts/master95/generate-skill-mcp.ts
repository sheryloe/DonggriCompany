import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  MASTER95_DEFAULT_SKILLS,
  Master95SkillManifestSchema,
} from "../../server/modules/master95/skill-mcp-gateway.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const outputRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "skills");
const document = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-skill-registry-v1.json",
  title: "DonggriCompany Master95 Skill Registry and MCP Gateway",
  version: "1.0.0",
  schema: z.toJSONSchema(Master95SkillManifestSchema, { target: "draft-2020-12", unrepresentable: "any" }),
  skills: MASTER95_DEFAULT_SKILLS,
  mcp_capabilities: ["tools", "resources", "prompts", "cancellation", "timeout", "failure-isolation", "audit-log"],
};
const file = path.join(outputRoot, "SKILL_MCP_BASELINE.json");
const content = `${JSON.stringify(document, null, 2)}\n`;
if (process.argv.includes("--write")) {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  process.stdout.write(`[master95-skill-mcp] wrote ${MASTER95_DEFAULT_SKILLS.length} Skill manifests\n`);
} else if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) {
  process.stderr.write(`[master95-skill-mcp] drift: ${file}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`[master95-skill-mcp] check passed: ${MASTER95_DEFAULT_SKILLS.length} Skills\n`);
}
