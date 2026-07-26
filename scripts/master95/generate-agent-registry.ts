import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  MASTER95_AGENT_MANIFEST_SCHEMA_VERSION,
  MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS,
  Master95AgentManifestSchema,
  createMaster95DefaultAgentRegistry,
} from "../../server/modules/master95/agent-registry.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const outputRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "agents");

const registry = createMaster95DefaultAgentRegistry();
const schemaDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-agent-manifest-v1.json",
  title: "DonggriCompany Master95 Agent Version Manifest",
  version: MASTER95_AGENT_MANIFEST_SCHEMA_VERSION,
  schema: z.toJSONSchema(Master95AgentManifestSchema, { target: "draft-2020-12", unrepresentable: "any" }),
};
const baselineDocument = {
  schema_version: MASTER95_AGENT_MANIFEST_SCHEMA_VERSION,
  generated_at: "2026-07-14T00:00:00+09:00",
  manifests: MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS,
  active_versions: Object.fromEntries(
    MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS.map((item) => [item.agent_id, registry.getActiveVersion(item.agent_id)]),
  ),
  records: registry.listRecords(),
};
const expected = [
  [path.join(outputRoot, "AGENT_MANIFEST.schema.json"), `${JSON.stringify(schemaDocument, null, 2)}\n`],
  [path.join(outputRoot, "AGENT_REGISTRY_BASELINE.json"), `${JSON.stringify(baselineDocument, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const [file, content] of expected) fs.writeFileSync(file, content, "utf8");
  process.stdout.write(
    `[master95-agents] wrote ${expected.length} files for ${MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS.length} agents\n`,
  );
} else {
  const drift = expected.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length > 0) {
    process.stderr.write(`[master95-agents] drift: ${drift.map(([file]) => file).join(", ")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-agents] check passed: ${MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS.length} versioned manifests\n`,
    );
  }
}
