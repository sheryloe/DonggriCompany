import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  MASTER95_SPECIALIST_CONTRACTS,
  MASTER95_SPECIALIST_FIXTURES,
  Master95SpecialistContractSchema,
  evaluateMaster95SpecialistAction,
} from "../../server/modules/master95/specialist-agents.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const outputRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "specialists");
const results = MASTER95_SPECIALIST_FIXTURES.map((fixture) => ({
  fixture_id: fixture.fixture_id,
  role_id: fixture.role_id,
  expected: fixture.expected_decision,
  actual: evaluateMaster95SpecialistAction(fixture.action).decision,
}));
const passed = results.filter((result) => result.expected === result.actual).length;
const schemaDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dongri.local/schemas/master95-specialist-agent-v1.json",
  title: "DonggriCompany Master95 Specialist Agent Contract",
  version: "1.0.0",
  schema: z.toJSONSchema(Master95SpecialistContractSchema, { target: "draft-2020-12", unrepresentable: "any" }),
};
const baselineDocument = {
  schema_version: "2026-07-14.master95.specialists.v1",
  contracts: MASTER95_SPECIALIST_CONTRACTS,
  acceptance: {
    fixtures: results.length,
    passed,
    success_rate_percent: (passed / results.length) * 100,
    fixtures_per_role: 10,
    results,
  },
};
const expected = [
  [path.join(outputRoot, "SPECIALIST_AGENT.schema.json"), `${JSON.stringify(schemaDocument, null, 2)}\n`],
  [path.join(outputRoot, "SPECIALIST_AGENT_BASELINE.json"), `${JSON.stringify(baselineDocument, null, 2)}\n`],
] as const;

if (process.argv.includes("--write")) {
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const [file, content] of expected) fs.writeFileSync(file, content, "utf8");
  process.stdout.write(
    `[master95-specialists] wrote ${expected.length} files; ${MASTER95_SPECIALIST_CONTRACTS.length} roles, ${passed}/${results.length} fixtures\n`,
  );
} else {
  const drift = expected.filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  if (drift.length > 0) {
    process.stderr.write(`[master95-specialists] drift: ${drift.map(([file]) => file).join(", ")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `[master95-specialists] check passed: ${MASTER95_SPECIALIST_CONTRACTS.length} roles, ${passed}/${results.length} fixtures (${(passed / results.length) * 100}%)\n`,
    );
  }
}
