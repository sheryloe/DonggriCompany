import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_PUBLIC_FILES = [
  "README.md",
  "README_ko.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "PRODUCT.md",
  "docs/DESIGN.md",
  "docs/QUALITY-949.md",
  "docs/api.md",
  "docs/openapi.json",
  ".github/workflows/ci.yml",
  ".env.example",
  "scripts/smoke-command-loop.mjs",
  "scripts/smoke-command-loop.test.mjs",
  "src/api/control-plane-dashboard.ts",
];

export function evaluatePublicReadiness(readText, exists) {
  const errors = [];
  for (const file of REQUIRED_PUBLIC_FILES) {
    if (!exists(file)) errors.push(`${file}: required public file is missing`);
  }

  const readme = readText("README.md");
  const contributing = readText("CONTRIBUTING.md");
  const security = readText("SECURITY.md");
  const api = readText("docs/api.md");
  const workflow = readText(".github/workflows/ci.yml");
  const quality = readText("docs/QUALITY-949.md");
  const packageJson = readText("package.json");
  const envExample = readText(".env.example");
  const smoke = readText("scripts/smoke-command-loop.mjs");

  const expectations = [
    [
      readme.includes("Command Center") && readme.includes("/old"),
      "README.md: current and compatibility experiences must be explicit",
    ],
    [
      readme.includes("public:verify") && readme.includes("Docker is optional"),
      "README.md: public gate and Docker-optional path are required",
    ],
    [
      contributing.includes("only long-lived branch") && contributing.includes("--base main"),
      "CONTRIBUTING.md: main-only branch model is required",
    ],
    [
      !contributing.includes("--base dev") && !contributing.includes("main -> dev"),
      "CONTRIBUTING.md: obsolete dev branch instructions remain",
    ],
    [
      security.includes("public Alpha") && !security.includes("2.0.x"),
      "SECURITY.md: supported line must match the current Alpha",
    ],
    [api.includes("/api/control-plane/dashboard"), "docs/api.md: compact dashboard route is missing"],
    [
      readme.includes("DONGGRI_CONTROL_ROOT") && readme.includes("smoke:command-loop"),
      "README.md: portable Control Plane root or command-loop instructions are missing",
    ],
    [workflow.includes("pnpm run public:verify"), "CI: public readiness gate is not wired"],
    [workflow.includes("smoke:command-loop:self-test"), "CI: command-loop harness self-test is not wired"],
    [
      envExample.includes("DONGGRI_CONTROL_ROOT=") && smoke.includes("SMOKE_PROJECT_PATH"),
      "portable local configuration: Control Plane root or disposable smoke project is missing",
    ],
    [
      quality.includes("72-hour Soak credit: `0`") && quality.includes("clean-clone"),
      "quality contract: non-claims or reproducibility gate is missing",
    ],
    [
      packageJson.includes('"license": "Apache-2.0"') && packageJson.includes('"channel": "alpha"'),
      "package.json: public identity is inconsistent",
    ],
  ];
  for (const [passed, message] of expectations) if (!passed) errors.push(message);
  return errors;
}

export function verifyRoot(root) {
  const resolve = (relative) => path.join(root, ...relative.split("/"));
  return evaluatePublicReadiness(
    (relative) => {
      try {
        return fs.readFileSync(resolve(relative), "utf8");
      } catch {
        return "";
      }
    },
    (relative) => fs.existsSync(resolve(relative)),
  );
}

function selfTest() {
  const files = new Map(REQUIRED_PUBLIC_FILES.map((file) => [file, ""]));
  files.set(
    "README.md",
    "Command Center /old public:verify Docker is optional DONGGRI_CONTROL_ROOT smoke:command-loop",
  );
  files.set("CONTRIBUTING.md", "only long-lived branch --base main");
  files.set("SECURITY.md", "public Alpha");
  files.set("docs/api.md", "/api/control-plane/dashboard");
  files.set(".github/workflows/ci.yml", "pnpm run public:verify smoke:command-loop:self-test");
  files.set(".env.example", "DONGGRI_CONTROL_ROOT=");
  files.set("scripts/smoke-command-loop.mjs", "SMOKE_PROJECT_PATH");
  files.set("docs/QUALITY-949.md", "72-hour Soak credit: `0` clean-clone");
  files.set("package.json", '"license": "Apache-2.0" "channel": "alpha"');
  const errors = evaluatePublicReadiness(
    (file) => files.get(file) ?? "",
    (file) => files.has(file),
  );
  if (errors.length > 0) throw new Error(`self-test failed: ${errors.join("; ")}`);
  console.log("Public readiness verifier self-test passed.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--self-test")) selfTest();
  else {
    const errors = verifyRoot(process.cwd());
    if (errors.length > 0) {
      console.error("Public readiness verification failed:");
      for (const error of errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else console.log(`Public readiness verification passed (${REQUIRED_PUBLIC_FILES.length} required files).`);
  }
}
