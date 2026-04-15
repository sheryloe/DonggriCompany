import fs from "node:fs";
import path from "node:path";

type AgentGuideInput = {
  id: string;
  name: string;
  role: string | null | undefined;
  departmentId: string | null | undefined;
  workflowProfileJson: string | null | undefined;
  agentProfileJson?: string | null | undefined;
  statsTasksDone?: number | null | undefined;
  statsXp?: number | null | undefined;
};

type AgentProfileExtras = {
  classPath: string;
  promotionPolicy: string;
};

const RESERVED_ROOT_DIRS = new Set(["archive", "classes"]);
const DEFAULT_CLASS_PATH = "(unclassified)";
const DEFAULT_PROMOTION_POLICY = "junior -> senior @xp>=300, team_leader manual only";

function resolveGuideRoot(): string {
  const envRoot = String(process.env.AGENT_GUIDE_ROOT ?? "").trim();
  if (envRoot) {
    return path.resolve(envRoot);
  }
  return path.resolve(process.cwd(), "agents");
}

function normalizeFileToken(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^0-9A-Za-z._\-\u3131-\u318E\uAC00-\uD7A3]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function idSuffix(id: string): string {
  return String(id ?? "")
    .replace(/[^0-9A-Za-z]/g, "")
    .slice(0, 8)
    .toLowerCase();
}

function safeNumber(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeClassPath(raw: unknown): string {
  if (!raw) {
    return DEFAULT_CLASS_PATH;
  }
  if (typeof raw === "string") {
    return raw.trim() || DEFAULT_CLASS_PATH;
  }
  if (Array.isArray(raw)) {
    const parts = raw.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(" > ") : DEFAULT_CLASS_PATH;
  }
  if (typeof raw === "object") {
    const source = raw as Record<string, unknown>;
    const stage1 = String(source.stage1 ?? source.class_stage_1 ?? "").trim();
    const stage2 = String(source.stage2 ?? source.class_stage_2 ?? "").trim();
    const stage3 = String(source.stage3 ?? source.class_stage_3 ?? "").trim();
    const parts = [stage1, stage2, stage3].filter(Boolean);
    return parts.length > 0 ? parts.join(" > ") : DEFAULT_CLASS_PATH;
  }
  return DEFAULT_CLASS_PATH;
}

function normalizePromotionPolicy(raw: unknown): string {
  if (!raw) {
    return DEFAULT_PROMOTION_POLICY;
  }
  if (typeof raw === "string") {
    return raw.trim() || DEFAULT_PROMOTION_POLICY;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return DEFAULT_PROMOTION_POLICY;
  }
}

function extractAgentProfileExtras(agentProfileJson: string | null | undefined): AgentProfileExtras {
  const parsed = parseJsonObject(agentProfileJson);
  if (!parsed) {
    return {
      classPath: DEFAULT_CLASS_PATH,
      promotionPolicy: DEFAULT_PROMOTION_POLICY,
    };
  }
  return {
    classPath: normalizeClassPath(parsed.class_path),
    promotionPolicy: normalizePromotionPolicy(parsed.promotion_policy),
  };
}

function readTextSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function findAgentGuideFileById(root: string, agentId: string): string | null {
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (path.resolve(current) === path.resolve(root) && RESERVED_ROOT_DIRS.has(entry.name)) {
          continue;
        }
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith("_AGENTS.md")) {
        continue;
      }

      if (readTextSafe(fullPath).includes(`Agent ID: ${agentId}`)) {
        return fullPath;
      }
    }
  }

  return null;
}

function findAgentRootById(root: string, agentId: string): string | null {
  const guideFile = findAgentGuideFileById(root, agentId);
  return guideFile ? path.dirname(guideFile) : null;
}

function folderContainsAgentId(folderPath: string, agentId: string): boolean {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith("_AGENTS.md")) {
      continue;
    }
    if (readTextSafe(path.join(folderPath, entry.name)).includes(`Agent ID: ${agentId}`)) {
      return true;
    }
  }

  return false;
}

function resolveBundlePath(root: string, input: AgentGuideInput): string {
  const departmentToken = normalizeFileToken(input.departmentId || "unassigned") || "unassigned";
  const baseToken = normalizeFileToken(input.name || input.id || "agent") || "agent";
  const preferred = path.join(root, departmentToken, baseToken);

  if (!fs.existsSync(preferred) || folderContainsAgentId(preferred, input.id)) {
    return preferred;
  }

  return path.join(root, departmentToken, `${baseToken}_${idSuffix(input.id) || "id"}`);
}

function cleanupLegacyBundleFiles(bundleRoot: string, keepNames: Set<string>): void {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(bundleRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const isManagedFile =
      entry.name.endsWith("_AGENTS.md") || entry.name.endsWith("_skills.md") || /^\..+_설정$/u.test(entry.name);
    if (!isManagedFile || keepNames.has(entry.name)) {
      continue;
    }

    try {
      fs.unlinkSync(path.join(bundleRoot, entry.name));
    } catch {
      // ignore cleanup failures
    }
  }
}

function buildAgentGuideContent(input: AgentGuideInput, relativeBundlePath: string): string {
  const safeName = input.name || input.id || "agent";
  const tasksDone = safeNumber(input.statsTasksDone);
  const xp = safeNumber(input.statsXp);
  const level = Math.floor(xp / 100) + 1;
  const role = String(input.role ?? "junior");
  const departmentId = String(input.departmentId ?? "unassigned");
  const workflowProfileRaw = String(input.workflowProfileJson ?? "").trim() || "(none)";
  const workflowPreview = workflowProfileRaw.length > 300 ? `${workflowProfileRaw.slice(0, 300)}...` : workflowProfileRaw;
  const extras = extractAgentProfileExtras(input.agentProfileJson ?? null);
  const updatedAt = new Date().toISOString();

  return [
    `# ${safeName}_AGENTS`,
    "",
    "## Identity",
    `- Agent Name: ${safeName}`,
    `- Agent ID: ${input.id}`,
    `- Role: ${role}`,
    `- Department ID: ${departmentId}`,
    `- Bundle Path: agents/${relativeBundlePath.replace(/\\/g, "/")}`,
    "",
    "## References",
    "- Policy Document: AgentSelectModels.md",
    "- Runtime Mode: default automatic selection with manual override blocked unless explicitly allowed",
    "",
    "## Class Path",
    `- Class Path: ${extras.classPath}`,
    "- Stage Rule: stage1(<100 XP), stage2(100~299 XP), stage3(>=300 XP)",
    "",
    "## Growth",
    `- Tasks Done: ${tasksDone}`,
    `- XP: ${xp}`,
    `- Level: ${level}`,
    "",
    "## Promotion Policy",
    "- Default: junior -> senior auto-promotion at 300 XP",
    "- Exception: team_leader promotion remains manual only",
    `- Applied Rule: ${extras.promotionPolicy}`,
    "",
    "## Latest Snapshot",
    `- ${updatedAt} | tasks_done=${tasksDone} | xp=${xp} | role=${role}`,
    "",
    "## Workflow Profile",
    `- Raw: ${workflowPreview}`,
    "",
  ].join("\n");
}

function buildSkillsContent(input: AgentGuideInput): string {
  const safeName = input.name || input.id || "agent";
  return [
    `# ${safeName}_skills`,
    "",
    "## Active Skills",
    "- (none)",
    "",
    "## Notes",
    "- This file records durable skill history for the agent bundle.",
    "- Append purpose, outcome, and verification when a new skill is adopted.",
    "",
  ].join("\n");
}

function buildSettingsContent(input: AgentGuideInput): string {
  const extras = extractAgentProfileExtras(input.agentProfileJson ?? null);
  const payload = {
    agent_id: input.id,
    agent_name: input.name,
    role: input.role ?? "junior",
    department_id: input.departmentId ?? "unassigned",
    workflow_profile: input.workflowProfileJson ? String(input.workflowProfileJson) : null,
    agent_profile_json: input.agentProfileJson ? String(input.agentProfileJson) : null,
    class_path: extras.classPath,
    promotion_policy: extras.promotionPolicy,
    stats_tasks_done: safeNumber(input.statsTasksDone),
    stats_xp: safeNumber(input.statsXp),
    updated_at: new Date().toISOString(),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

function ensureAgentBundleFiles(root: string, input: AgentGuideInput): string {
  const fileToken = normalizeFileToken(input.name || input.id || "agent") || "agent";
  fs.mkdirSync(root, { recursive: true });

  const agentsFileName = `${fileToken}_AGENTS.md`;
  const skillsFileName = `${fileToken}_skills.md`;
  const settingsFileName = `.${fileToken}_설정`;
  cleanupLegacyBundleFiles(root, new Set([agentsFileName, skillsFileName, settingsFileName]));

  const guideRoot = resolveGuideRoot();
  const relativeBundlePath = path.relative(guideRoot, root);
  const agentsPath = path.join(root, agentsFileName);
  const skillsPath = path.join(root, skillsFileName);
  const settingsPath = path.join(root, settingsFileName);

  fs.writeFileSync(agentsPath, buildAgentGuideContent(input, relativeBundlePath), "utf8");
  if (!fs.existsSync(skillsPath)) {
    fs.writeFileSync(skillsPath, buildSkillsContent(input), "utf8");
  }
  fs.writeFileSync(settingsPath, buildSettingsContent(input), "utf8");

  return agentsPath;
}

export function upsertAgentGuideFile(input: AgentGuideInput): string {
  const root = resolveGuideRoot();
  fs.mkdirSync(root, { recursive: true });

  const currentRoot = findAgentRootById(root, input.id);
  const targetRoot = resolveBundlePath(root, input);

  if (currentRoot && path.resolve(currentRoot) !== path.resolve(targetRoot)) {
    fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
    fs.renameSync(currentRoot, targetRoot);
  }

  const finalRoot = currentRoot && path.resolve(currentRoot) === path.resolve(targetRoot) ? currentRoot : targetRoot;
  return ensureAgentBundleFiles(finalRoot, input);
}

export function archiveAgentGuideFile(agentId: string): string | null {
  const root = resolveGuideRoot();
  const bundleRoot = findAgentRootById(root, agentId);
  if (!bundleRoot) {
    return null;
  }

  const relativeBundlePath = path.relative(root, bundleRoot);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(root, "archive", timestamp, relativeBundlePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(bundleRoot, destination);
  return destination;
}
