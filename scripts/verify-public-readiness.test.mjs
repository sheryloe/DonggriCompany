import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePublicReadiness, REQUIRED_PUBLIC_FILES } from "./verify-public-readiness.mjs";

function validFixture() {
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
  return files;
}

test("accepts a coherent public Alpha contract", () => {
  const files = validFixture();
  assert.deepEqual(
    evaluatePublicReadiness(
      (file) => files.get(file) ?? "",
      (file) => files.has(file),
    ),
    [],
  );
});

test("rejects an obsolete dev-branch contribution flow", () => {
  const files = validFixture();
  files.set("CONTRIBUTING.md", "only long-lived branch --base main --base dev");
  assert.match(
    evaluatePublicReadiness(
      (file) => files.get(file) ?? "",
      (file) => files.has(file),
    ).join("\n"),
    /obsolete dev branch/,
  );
});

test("rejects missing portable-root and command-loop documentation", () => {
  const files = validFixture();
  files.set("README.md", "Command Center /old public:verify Docker is optional");
  assert.match(
    evaluatePublicReadiness(
      (file) => files.get(file) ?? "",
      (file) => files.has(file),
    ).join("\n"),
    /portable Control Plane root/,
  );
});
