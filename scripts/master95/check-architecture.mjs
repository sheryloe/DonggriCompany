#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const controlRoot = process.env.DONGGRI_DEVDRIVE_ROOT
  ? path.resolve(process.env.DONGGRI_DEVDRIVE_ROOT)
  : path.resolve(repoRoot, "..", "..");
const architectureRoot = path.join(controlRoot, "storage", "codex-control", "quality", "master-95", "architecture");
const masterPath = path.join(architectureRoot, "ARCHITECTURE_MASTER.md");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const requiredFiles = ["ARCHITECTURE_MASTER.md", "THREAT_MODEL.md", "FAILURE_MODEL.md"];
for (const file of requiredFiles)
  assert(fs.existsSync(path.join(architectureRoot, file)), `missing architecture file: ${file}`);
const master = fs.readFileSync(masterPath, "utf8");
const requiredSections = [
  "## 1. 시스템 컨텍스트",
  "## 2. 컨테이너와 서비스",
  "## 3. 책임과 금지 영역",
  "## 4. 명령 데이터 흐름",
  "## 5. 신뢰 경계",
  "## 6. 프로젝트 격리와 BloggerGent",
  "## 7. 저장 위치와 보존 정책",
  "## 8. 장애 전파",
  "## 9. 네트워크와 권한 구조",
  "## 10. 단일 장애점과 단계별 제거",
  "## 11. 복구 목표",
  "## 12. P0 결정 원장",
];
for (const section of requiredSections) assert(master.includes(section), `missing architecture section: ${section}`);
const mermaidCount = (master.match(/```mermaid/g) ?? []).length;
assert(mermaidCount >= 6, `at least six architecture diagrams are required, got ${mermaidCount}`);
const requiredServices = [
  "Control Tower UI",
  "Project Gateway",
  "COO-Orchestrator",
  "Agent Registry",
  "Project Registry",
  "Task/Run State Engine",
  "Event Store / Checkpoint",
  "Policy / Approval Engine",
  "Skill / MCP Gateway",
  "Memory Service",
  "Artifact Store",
  "Event Queue",
  "Trace / Evaluation",
  "Image Workbench",
  "Auth / Secret Boundary",
  "Backup / Recovery",
];
for (const service of requiredServices)
  assert(master.includes(`| ${service} |`), `missing service responsibility: ${service}`);
assert(!/\bTBD\b|미정|추후 결정/.test(master), "P0 architecture contains unresolved decision markers");
assert(!/D:\\/.test(master), "system-reserved D: path must not appear in target architecture");

const adrFiles = fs.readdirSync(architectureRoot).filter((file) => /^ADR-\d{3}-.+\.md$/.test(file));
assert(adrFiles.length >= 4, `at least four ADRs are required, got ${adrFiles.length}`);
for (const file of adrFiles) {
  const content = fs.readFileSync(path.join(architectureRoot, file), "utf8");
  assert(content.includes("Status: accepted"), `${file}: ADR must be accepted`);
  assert(content.includes("## Decision"), `${file}: Decision section is required`);
  assert(content.includes("## Consequences"), `${file}: Consequences section is required`);
}

const threat = fs.readFileSync(path.join(architectureRoot, "THREAT_MODEL.md"), "utf8");
const failure = fs.readFileSync(path.join(architectureRoot, "FAILURE_MODEL.md"), "utf8");
const threatRows = (threat.match(/^\| T\d{2} \|/gm) ?? []).length;
const failureRows = (failure.match(/^\| F\d{2} \|/gm) ?? []).length;
assert(threatRows >= 12, `at least 12 threats are required, got ${threatRows}`);
assert(failureRows >= 12, `at least 12 failure modes are required, got ${failureRows}`);

process.stdout.write(
  `${JSON.stringify({ required_files: requiredFiles.length, diagrams: mermaidCount, services: requiredServices.length, adrs: adrFiles.length, threats: threatRows, failure_modes: failureRows, p0_unresolved: 0, passed: true }, null, 2)}\n`,
);
