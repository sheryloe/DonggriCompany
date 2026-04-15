#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SOURCE_REPO = "VoltAgent/awesome-codex-subagents";
const SOURCE_REF = "main";
const SOURCE_URL = `https://github.com/${SOURCE_REPO}`;
const SOURCE_TARBALL_URL = `https://codeload.github.com/${SOURCE_REPO}/tar.gz/refs/heads/${SOURCE_REF}`;
const SOURCE_ZIP_URL = `https://codeload.github.com/${SOURCE_REPO}/zip/refs/heads/${SOURCE_REF}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const OUTPUT_DIR = path.join(ROOT_DIR, "docs", "agents");
const OUTPUT_MD_PATH = path.join(OUTPUT_DIR, "codex-subagents.by-department.md");
const OUTPUT_JSON_PATH = path.join(OUTPUT_DIR, "codex-subagents.by-department.json");
const OUTPUT_CLASS_TREE_PATH = path.join(OUTPUT_DIR, "agent-class-tree.json");
const CLASS_DOCS_ROOT = path.join(ROOT_DIR, "agents", "classes");

const DEPT_ORDER = /** @type {const} */ (["planning", "dev", "design", "qa", "devsecops", "operations"]);

const DEPT_LABELS = {
  planning: "Planning",
  dev: "Development",
  design: "Design",
  qa: "QA/QC",
  devsecops: "DevSecOps",
  operations: "Operations",
};

const STAGE1_BY_DEPARTMENT = {
  planning: "planning-core",
  dev: "development-core",
  design: "design-core",
  qa: "quality-core",
  devsecops: "devsecops-core",
  operations: "operations-core",
};

const STAGE2_BY_CATEGORY = {
  "01-core-development": "core-engineering",
  "02-language-specialists": "language-specialists",
  "03-infrastructure": "platform-infrastructure",
  "04-quality-security": "quality-and-security",
  "05-data-ai": "data-and-ai",
  "06-developer-experience": "developer-experience",
  "07-specialized-domains": "domain-specialists",
  "08-business-product": "business-and-product",
  "09-meta-orchestration": "orchestration",
  "10-research-analysis": "research-and-analysis",
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function emptyDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toSlug(raw, fallback = "unknown") {
  const slug = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z._\-\u3131-\u318e\uac00-\ud7a3]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function titleCaseFromSlug(value) {
  return String(value ?? "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

async function downloadToFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
  return filePath;
}

async function extractRepo(tempRoot) {
  emptyDir(tempRoot);
  const tarballPath = path.join(tempRoot, "awesome-codex-subagents-main.tar.gz");
  await downloadToFile(SOURCE_TARBALL_URL, tarballPath);
  try {
    execFileSync("tar", ["-xzf", tarballPath, "-C", tempRoot], { stdio: "ignore" });
  } catch (tarError) {
    if (process.platform !== "win32") {
      throw tarError;
    }

    emptyDir(tempRoot);
    const zipPath = path.join(tempRoot, "awesome-codex-subagents-main.zip");
    await downloadToFile(SOURCE_ZIP_URL, zipPath);
    const extractionScript = [
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      `$zip = '${zipPath.replace(/'/g, "''")}'`,
      `$dest = '${tempRoot.replace(/'/g, "''")}'`,
      "[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dest)",
    ].join("; ");
    execFileSync("powershell", ["-NoProfile", "-Command", extractionScript], { stdio: "ignore" });
  }

  const extractedRoot = fs
    .readdirSync(tempRoot, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.startsWith("awesome-codex-subagents-"));
  if (!extractedRoot) {
    throw new Error("Unable to locate extracted awesome-codex-subagents repository root");
  }
  return path.join(tempRoot, extractedRoot.name);
}

function parseTomlHeader(fileText) {
  const nameMatch = fileText.match(/^name\s*=\s*"([^"]+)"\s*$/m);
  const descMatch = fileText.match(/^description\s*=\s*"([^"]*)"\s*$/m);
  return {
    name: nameMatch?.[1]?.trim() ?? "",
    description: descMatch?.[1]?.trim() ?? "",
  };
}

function categorizeDepartment({ categoryDirName, agentName }) {
  // Explicit overrides (deterministic)
  if (
    agentName === "ui-designer" ||
    agentName === "ui-fixer" ||
    agentName === "ux-researcher" ||
    agentName === "accessibility-tester"
  ) {
    return "design";
  }

  if (
    agentName === "incident-responder" ||
    agentName === "devops-incident-responder" ||
    agentName === "sre-engineer" ||
    agentName === "it-ops-orchestrator" ||
    agentName === "m365-admin" ||
    agentName === "windows-infra-admin" ||
    agentName === "customer-success-manager"
  ) {
    return "operations";
  }

  if (
    agentName === "security-engineer" ||
    agentName === "security-auditor" ||
    agentName === "penetration-tester" ||
    agentName === "compliance-auditor" ||
    agentName === "ad-security-reviewer" ||
    agentName === "powershell-security-hardening"
  ) {
    return "devsecops";
  }

  // Category defaults
  if (categoryDirName.startsWith("08-") || categoryDirName.startsWith("10-")) return "planning";
  if (categoryDirName.startsWith("03-")) return "devsecops";
  if (categoryDirName.startsWith("04-")) return "qa";
  if (categoryDirName.startsWith("09-")) return "planning";

  // Remaining categories are generally "dev"
  return "dev";
}

function resolveStage2(categoryDirName) {
  return STAGE2_BY_CATEGORY[categoryDirName] ?? "specialized-track";
}

function renderMarkdown({ generatedAtIso, agents, departmentSummary, byDepartment }) {
  const total = agents.length;
  const deptLines = DEPT_ORDER.map((id) => `${id}=${departmentSummary[id] ?? 0}`).join(", ");

  let out = "";
  out += "# Codex Subagents (Department Map)\n\n";
  out += `- Source: ${SOURCE_URL} (ref: ${SOURCE_REF})\n`;
  out += `- Generated at: ${generatedAtIso}\n`;
  out += `- Total: ${total}\n`;
  out += `- Departments: ${deptLines}\n\n`;

  for (const deptId of DEPT_ORDER) {
    const label = DEPT_LABELS[deptId] ?? deptId;
    const list = byDepartment.get(deptId) ?? [];
    out += `## ${deptId} (${label}) - ${list.length}\n\n`;
    for (const item of list) {
      const desc = item.description ? item.description : "(no description)";
      out += `- \`${item.name}\` - ${desc} (\`${item.upstreamPath}\`) [${item.class_stage_1} > ${item.class_stage_2} > ${item.class_stage_3}]\n`;
    }
    out += "\n";
  }

  return out;
}

function buildClassTemplate(agent) {
  const stage1Label = titleCaseFromSlug(agent.class_stage_1);
  const stage2Label = titleCaseFromSlug(agent.class_stage_2);
  return [
    `# ${agent.class_stage_3}`,
    "",
    "## Class Path",
    `- Department: ${agent.department}`,
    `- Stage 1: ${agent.class_stage_1} (${stage1Label})`,
    `- Stage 2: ${agent.class_stage_2} (${stage2Label})`,
    `- Stage 3: ${agent.class_stage_3}`,
    "",
    "## Upstream Mapping",
    `- Agent Name: ${agent.name}`,
    `- Category: ${agent.upstreamCategory}`,
    `- Source File: ${agent.upstreamPath}`,
    "",
    "## Promotion Notes",
    "- Stage progression is managed by XP and policy rules.",
    "- junior -> senior is auto-promoted at 300 XP.",
    "- team_leader promotion remains manual.",
    "",
  ].join("\n");
}

function writeClassTemplates(agents) {
  emptyDir(CLASS_DOCS_ROOT);

  const usedRelativePaths = new Set();
  for (const agent of agents) {
    let stage3 = toSlug(agent.class_stage_3, toSlug(agent.name));
    let relativePath = path.join(agent.department, agent.class_stage_1, agent.class_stage_2, `${stage3}.md`);
    let duplicateSuffix = 2;
    while (usedRelativePaths.has(relativePath)) {
      stage3 = `${toSlug(agent.class_stage_3)}-${duplicateSuffix}`;
      relativePath = path.join(agent.department, agent.class_stage_1, agent.class_stage_2, `${stage3}.md`);
      duplicateSuffix += 1;
    }
    usedRelativePaths.add(relativePath);
    const absolutePath = path.join(CLASS_DOCS_ROOT, relativePath);
    writeText(absolutePath, buildClassTemplate({ ...agent, class_stage_3: stage3 }));
  }
}

function buildClassTree(agents) {
  return DEPT_ORDER.map((departmentId) => {
    const stage1 = STAGE1_BY_DEPARTMENT[departmentId];
    const deptAgents = agents.filter((agent) => agent.department === departmentId);
    const stage2Map = new Map();
    for (const agent of deptAgents) {
      const list = stage2Map.get(agent.class_stage_2) ?? [];
      list.push({
        name: agent.name,
        class_stage_3: agent.class_stage_3,
        upstreamCategory: agent.upstreamCategory,
        upstreamPath: agent.upstreamPath,
      });
      stage2Map.set(agent.class_stage_2, list);
    }
    const stage2 = [...stage2Map.entries()]
      .map(([id, items]) => ({
        id,
        total: items.length,
        agents: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      department: departmentId,
      class_stage_1: stage1,
      total: deptAgents.length,
      stage_2: stage2,
    };
  });
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "awesome-codex-subagents-"));
  try {
    const extractedRoot = await extractRepo(tempRoot);
    const categoriesRoot = path.join(extractedRoot, "categories");
    if (!fs.existsSync(categoriesRoot)) {
      throw new Error(`Missing upstream categories directory: ${categoriesRoot}`);
    }

    /** @type {{name: string; description: string; upstreamCategory: string; upstreamPath: string; department: typeof DEPT_ORDER[number]; class_stage_1: string; class_stage_2: string; class_stage_3: string;}[]} */
    const agents = [];

    const categoryDirs = fs
      .readdirSync(categoriesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    for (const categoryDirName of categoryDirs) {
      const categoryDirPath = path.join(categoriesRoot, categoryDirName);
      const tomlFiles = fs
        .readdirSync(categoryDirPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".toml"))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));

      for (const fileName of tomlFiles) {
        const filePath = path.join(categoryDirPath, fileName);
        const fileText = fs.readFileSync(filePath, "utf8");
        const header = parseTomlHeader(fileText);
        const name = header.name || path.basename(fileName, ".toml");
        const description = header.description || "";
        const upstreamPath = `categories/${categoryDirName}/${fileName}`.replace(/\\/g, "/");
        const department = categorizeDepartment({ categoryDirName, agentName: name });
        const class_stage_1 = STAGE1_BY_DEPARTMENT[department];
        const class_stage_2 = resolveStage2(categoryDirName);
        const class_stage_3 = toSlug(name);

        agents.push({
          name,
          description,
          upstreamCategory: categoryDirName,
          upstreamPath,
          department,
          class_stage_1,
          class_stage_2,
          class_stage_3,
        });
      }
    }

    agents.sort((a, b) => a.name.localeCompare(b.name));

    /** @type {Map<typeof DEPT_ORDER[number], typeof agents>} */
    const byDepartment = new Map();
    for (const deptId of DEPT_ORDER) byDepartment.set(deptId, []);
    for (const agent of agents) {
      const list = byDepartment.get(agent.department);
      if (list) list.push(agent);
    }
    for (const deptId of DEPT_ORDER) {
      byDepartment.get(deptId)?.sort((a, b) => a.name.localeCompare(b.name));
    }

    /** @type {Record<string, number>} */
    const departmentSummary = {};
    for (const deptId of DEPT_ORDER) departmentSummary[deptId] = byDepartment.get(deptId)?.length ?? 0;

    const generatedAtIso = new Date().toISOString();
    const classTree = buildClassTree(agents);

    const jsonOut = {
      sourceRepo: SOURCE_REPO,
      sourceRef: SOURCE_REF,
      sourceUrl: SOURCE_URL,
      generatedAt: generatedAtIso,
      total: agents.length,
      departmentSummary,
      agents,
    };
    const classTreeOut = {
      sourceRepo: SOURCE_REPO,
      sourceRef: SOURCE_REF,
      sourceUrl: SOURCE_URL,
      generatedAt: generatedAtIso,
      total: agents.length,
      stage1ByDepartment: STAGE1_BY_DEPARTMENT,
      stage2ByCategory: STAGE2_BY_CATEGORY,
      departments: classTree,
    };
    const mdOut = renderMarkdown({ generatedAtIso, agents, departmentSummary, byDepartment });

    writeJson(OUTPUT_JSON_PATH, jsonOut);
    writeText(OUTPUT_MD_PATH, mdOut);
    writeJson(OUTPUT_CLASS_TREE_PATH, classTreeOut);
    writeClassTemplates(agents);

    console.log(
      `[subagents-sync] wrote ${path.relative(ROOT_DIR, OUTPUT_MD_PATH)}, ${path.relative(ROOT_DIR, OUTPUT_JSON_PATH)}, ${path.relative(ROOT_DIR, OUTPUT_CLASS_TREE_PATH)} and class templates (${agents.length} agents)`,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

await main();
