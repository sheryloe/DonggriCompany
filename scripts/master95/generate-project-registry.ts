import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  MASTER95_BLOGGERGENT_LANES,
  MASTER95_BLOGGERGENT_ROLE_AGENTS,
  MASTER95_DEFAULT_PROJECT_MANIFESTS,
  MASTER95_PROJECT_REGISTRY_SCHEMA_VERSION,
  Master95ProjectManifestSchema,
} from "../../server/modules/master95/project-registry.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const outputRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "projects");
const registryPath = path.join(controlRoot, "storage", "codex-control", "registry", "projects.yaml");
const registryText = fs.readFileSync(registryPath, "utf8");

for (const token of [
  "BloggerGent:",
  "owner_department: OPS",
  "assignment_policy: single-ops-agent-project-scope-implement-delegated",
  ...MASTER95_BLOGGERGENT_ROLE_AGENTS.map((role) => `${role}:`),
  "google-travel-blog:",
  "mystery-google-blog:",
  "cloudflare-blog:",
  "mystery-cloudflare-blog:",
  "shared-infra:",
  "metadata_tag: cloudflare:dongriarchive:mystery",
]) {
  if (!registryText.includes(token)) throw new Error(`projects_yaml_missing:${token}`);
}

const schemaDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-project-registry-v1.json",
  title: "DonggriCompany Master95 Project Registry",
  version: MASTER95_PROJECT_REGISTRY_SCHEMA_VERSION,
  schema: z.toJSONSchema(Master95ProjectManifestSchema, { target: "draft-2020-12", unrepresentable: "any" }),
};
const baselineDocument = {
  schema_version: MASTER95_PROJECT_REGISTRY_SCHEMA_VERSION,
  generated_at: "2026-07-14T00:00:00+09:00",
  source_registry: registryPath,
  projects: MASTER95_DEFAULT_PROJECT_MANIFESTS,
  bloggergent: {
    owner_department: "OPS",
    implementation_delegate: "IMPLEMENT",
    role_agents: MASTER95_BLOGGERGENT_ROLE_AGENTS,
    lanes: MASTER95_BLOGGERGENT_LANES,
  },
};
const expected = [
  [path.join(outputRoot, "PROJECT_REGISTRY.schema.json"), `${JSON.stringify(schemaDocument, null, 2)}\n`],
  [path.join(outputRoot, "PROJECT_REGISTRY_BASELINE.json"), `${JSON.stringify(baselineDocument, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const [file, content] of expected) fs.writeFileSync(file, content, "utf8");
  process.stdout.write(
    `[master95-projects] wrote ${expected.length} files for ${MASTER95_DEFAULT_PROJECT_MANIFESTS.length} projects and ${MASTER95_BLOGGERGENT_LANES.length} BloggerGent lanes\n`,
  );
} else {
  const drift = expected.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length > 0) {
    process.stderr.write(`[master95-projects] drift: ${drift.map(([file]) => file).join(", ")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-projects] check passed: ${MASTER95_DEFAULT_PROJECT_MANIFESTS.length} projects, ${MASTER95_BLOGGERGENT_ROLE_AGENTS.length} BloggerGent roles, ${MASTER95_BLOGGERGENT_LANES.length} lanes\n`,
    );
  }
}
