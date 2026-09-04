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
  files.set("SECURITY.md", "unreleased Alpha source candidate");
  files.set("docs/ROADMAP.md", "atomic one-time approval consumption Runner Supervisor binding");
  files.set(".github/pull_request_template.md", "Base branch is `main`");
  files.set(
    ".github/ISSUE_TEMPLATE/config.yml",
    "https://github.com/sheryloe/DonggriCompany/security/advisories/new",
  );
  files.set(".github/ISSUE_TEMPLATE/feature_request.yml", "Dongri-grigri");
  files.set(".github/ISSUE_TEMPLATE/question.yml", "Dongri-grigri");
  files.set("docs/api.md", "/api/control-plane/dashboard");
  files.set(".github/workflows/ci.yml", "pnpm run public:verify smoke:command-loop:self-test");
  files.set(".env.example", "DONGGRI_CONTROL_ROOT=");
  files.set("docker-compose.yml", "/livez");
  files.set("docker-compose.demo.yml", "/livez");
  files.set("scripts/smoke-command-loop.mjs", "SMOKE_PROJECT_PATH");
  files.set("docs/QUALITY-949.md", "72-hour Soak credit: `0` clean-clone");
  files.set("package.json", '"license": "Apache-2.0" "channel": "alpha"');
  return files;
}

test("accepts a coherent unreleased Alpha candidate contract", () => {
  const files = validFixture();
  assert.deepEqual(
    evaluatePublicReadiness(
      (file) => files.get(file) ?? "",
      (file) => files.has(file),
    ),
    [],
  );
});

test("rejects Docker healthchecks coupled to dependency readiness", () => {
  const files = validFixture();
  files.set("docker-compose.yml", "http://127.0.0.1:8900/api/health");
  assert.match(
    evaluatePublicReadiness(
      (file) => files.get(file) ?? "",
      (file) => files.has(file),
    ).join("\n"),
    /process liveness/,
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

test("rejects released-alpha wording before a release exists", () => {
  const files = validFixture();
  files.set("SECURITY.md", "Dongri-grigri is currently a public Alpha");
  assert.match(
    evaluatePublicReadiness(
      (file) => files.get(file) ?? "",
      (file) => files.has(file),
    ).join("\n"),
    /unreleased Alpha candidate truth/,
  );
});

test("rejects contribution templates that target dev", () => {
  const files = validFixture();
  files.set(".github/pull_request_template.md", "External contributors target `dev`; main -> dev");
  assert.match(
    evaluatePublicReadiness(
      (file) => files.get(file) ?? "",
      (file) => files.has(file),
    ).join("\n"),
    /main-only branch model/,
  );
});

test("rejects an issue security link for another repository", () => {
  const files = validFixture();
  files.set(
    ".github/ISSUE_TEMPLATE/config.yml",
    "https://github.com/GreenSheep01201/claw-empire/security/advisories/new",
  );
  assert.match(
    evaluatePublicReadiness(
      (file) => files.get(file) ?? "",
      (file) => files.has(file),
    ).join("\n"),
    /security reporting must point to this repository/,
  );
});
