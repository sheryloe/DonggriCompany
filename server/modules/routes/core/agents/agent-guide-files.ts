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
  skillBundle?: string[] | null | undefined;
  memorySnapshot?: string[] | null | undefined;
  skillGrowthSnapshot?: string[] | null | undefined;
  recentLessons?: string[] | null | undefined;
  projectExperience?: string[] | null | undefined;
};

type AgentProfileExtras = {
  classPath: string;
  promotionPolicy: string;
  visualProfileKey: string;
  preferredSubagents: string[];
};

const RESERVED_ROOT_DIRS = new Set(["archive", "classes"]);
const DEFAULT_CLASS_PATH = "(unclassified)";
const DEFAULT_PROMOTION_POLICY = "junior -> senior @xp>=300, team_leader manual only";
const MASTER_AGENT_PROMOTION_POLICY = "master_agent fixed role; no junior/senior ladder";
const PROJECT_AGENTS_ROOT = path.resolve(process.cwd(), "agents");
const ISOLATED_E2E_RUNTIME_ROOT = path.resolve(process.cwd(), ".tmp", "e2e-runtime");
const ISOLATED_E2E_GUIDE_ROOT = path.join(ISOLATED_E2E_RUNTIME_ROOT, "projects", "agent-guides");
const ISOLATED_E2E_DB_PATH = path.join(ISOLATED_E2E_RUNTIME_ROOT, "claw-empire.e2e.sqlite");
let warnedExternalGuideRoot = false;

// Exported for contract tests; this is not an HTTP or product API surface.
export function resolveGuideRoot(): string {
  const envRoot = String(process.env.AGENT_GUIDE_ROOT ?? "").trim();
  const resolvedEnvRoot = envRoot ? path.resolve(envRoot) : "";
  const configuredDbPath = String(process.env.DB_PATH ?? "").trim();
  const allowIsolatedE2ERoot =
    process.env.E2E_ISOLATED_RUNTIME === "1" &&
    resolvedEnvRoot === ISOLATED_E2E_GUIDE_ROOT &&
    Boolean(configuredDbPath) &&
    path.resolve(configuredDbPath) === ISOLATED_E2E_DB_PATH;
  const allowExternalTestRoot =
    resolvedEnvRoot && (process.env.VITEST === "true" || process.env.NODE_ENV === "test" || allowIsolatedE2ERoot);
  if (allowExternalTestRoot) {
    return resolvedEnvRoot;
  }
  if (envRoot && !warnedExternalGuideRoot) {
    warnedExternalGuideRoot = true;
    if (resolvedEnvRoot !== PROJECT_AGENTS_ROOT) {
      console.warn(
        `[compat_warning] AGENT_GUIDE_ROOT='${resolvedEnvRoot}' ignored. agents_source_mode=root_only -> '${PROJECT_AGENTS_ROOT}'`,
      );
    }
  }
  return PROJECT_AGENTS_ROOT;
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
      visualProfileKey: "(none)",
      preferredSubagents: [],
    };
  }
  const isDongriMaster = parsed.model === "dongri-grigri-master-agent";
  return {
    classPath: normalizeClassPath(parsed.class_path),
    promotionPolicy: isDongriMaster
      ? normalizePromotionPolicy(parsed.promotion_policy ?? MASTER_AGENT_PROMOTION_POLICY)
      : normalizePromotionPolicy(parsed.promotion_policy),
    visualProfileKey: String(parsed.visual_profile_key ?? "").trim() || "(none)",
    preferredSubagents: Array.isArray(parsed.preferred_subagents)
      ? parsed.preferred_subagents.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [],
  };
}

function isDongriMasterProfile(agentProfileJson: string | null | undefined): boolean {
  return parseJsonObject(agentProfileJson)?.model === "dongri-grigri-master-agent";
}

function displayRole(input: AgentGuideInput): string {
  if (isDongriMasterProfile(input.agentProfileJson ?? null)) {
    return "master_agent";
  }
  return String(input.role ?? "junior");
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
      entry.name.endsWith("_AGENTS.md") ||
      entry.name.endsWith("_skills.md") ||
      /^\..+_(settings(\\.json)?|설정)$/u.test(entry.name);
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

function buildAgentGuideContent(input: AgentGuideInput, relativeBundlePath: string, updatedAt: string): string {
  const safeName = input.name || input.id || "agent";
  const tasksDone = safeNumber(input.statsTasksDone);
  const xp = safeNumber(input.statsXp);
  const level = Math.floor(xp / 100) + 1;
  const role = displayRole(input);
  const departmentId = String(input.departmentId ?? "unassigned");
  const workflowProfileRaw = String(input.workflowProfileJson ?? "").trim() || "(none)";
  const workflowPreview =
    workflowProfileRaw.length > 300 ? `${workflowProfileRaw.slice(0, 300)}...` : workflowProfileRaw;
  const extras = extractAgentProfileExtras(input.agentProfileJson ?? null);
  const memorySnapshot = Array.isArray(input.memorySnapshot) ? input.memorySnapshot.filter(Boolean) : [];
  const skillGrowthSnapshot = Array.isArray(input.skillGrowthSnapshot) ? input.skillGrowthSnapshot.filter(Boolean) : [];
  const recentLessons = Array.isArray(input.recentLessons) ? input.recentLessons.filter(Boolean) : [];
  const projectExperience = Array.isArray(input.projectExperience) ? input.projectExperience.filter(Boolean) : [];

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
    "- Goal Command Router: use Donggri-native /dg-* commands only; /octo-* aliases are not enabled.",
    "",
    "## Goal Command Collaboration Rules",
    "- Read goal_command and team_preset from task workflow_meta_json when present.",
    "- Follow required_departments before adding extra departments.",
    "- Do not involve every department by default.",
    "- Split independent work up to max_parallel_workstreams and keep one owner per workstream.",
    "- Produce evidence for each verification gate before claiming completion.",
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
    "## Role Policy",
    role === "master_agent"
      ? "- Master agents are fixed department operators and do not use junior/senior promotion ladders."
      : "- Default: junior -> senior auto-promotion at 300 XP",
    role === "master_agent"
      ? "- Master agents may spawn disposable single-task subagents and must accept, reject, recreate, or merge their results."
      : "- Exception: team_leader promotion remains manual only",
    `- Applied Rule: ${extras.promotionPolicy}`,
    "",
    "## Visual Profile",
    `- Visual Profile Key: ${extras.visualProfileKey}`,
    "- Runtime Sprite Source: /sprites/{sprite_number}-D-1.png for v1 preview",
    "- Contact Sheet: public/generated/agent-visual-profiles/agent-visual-profile-sheet-v1.png",
    "",
    "## Subagent Delegation",
    role === "master_agent"
      ? "- This department master creates disposable subagents only for bounded work and collects their evidence before merge."
      : "- Staff members supervise specialized subagents instead of owning every specialty directly.",
    ...(extras.preferredSubagents.length > 0
      ? extras.preferredSubagents.map((subagent) => `- Preferred Subagent: ${subagent}`)
      : ["- Preferred Subagent: task-specific catalog selection"]),
    "",
    "## Latest Snapshot",
    `- ${updatedAt} | tasks_done=${tasksDone} | xp=${xp} | role=${role}`,
    "",
    "## Workflow Profile",
    `- Raw: ${workflowPreview}`,
    "",
    "## Memory Snapshot",
    ...(memorySnapshot.length > 0 ? memorySnapshot.map((item) => `- ${item}`) : ["- No durable memory snapshot yet."]),
    "",
    "## Skill Growth Snapshot",
    ...(skillGrowthSnapshot.length > 0
      ? skillGrowthSnapshot.map((item) => `- ${item}`)
      : ["- No skill usage history yet."]),
    "",
    "## Recent Lessons",
    ...(recentLessons.length > 0 ? recentLessons.map((item) => `- ${item}`) : ["- No recent lesson extracted yet."]),
    "",
    "## Project Experience",
    ...(projectExperience.length > 0
      ? projectExperience.map((item) => `- ${item}`)
      : ["- No project experience extracted yet."]),
    "",
  ].join("\n");
}

function buildSkillsContent(input: AgentGuideInput): string {
  const safeName = input.name || input.id || "agent";
  const skills = Array.isArray(input.skillBundle) ? input.skillBundle.filter(Boolean) : [];
  const skillGrowthSnapshot = Array.isArray(input.skillGrowthSnapshot) ? input.skillGrowthSnapshot.filter(Boolean) : [];
  return [
    `# ${safeName}_skills`,
    "",
    "## Active Skills",
    ...(skills.length > 0
      ? skills.map((skill) => `- ${skill}`)
      : ["- learned snapshot: none", "- installed snapshot: none"]),
    "",
    "## Learned Skills History",
    ...(skillGrowthSnapshot.length > 0
      ? skillGrowthSnapshot.map((skill) => `- ${skill}`)
      : ["- No durable skill usage history yet."]),
    "",
    "## Auto-selection Hints",
    "- Prefer skills with the highest proficiency score for similar workflow packs.",
    "- Confirm provider readiness before using provider-specific skills.",
    "- Record verification notes after every successful skill-assisted task.",
    "",
    "## Verification Notes",
    "- Skill usage is updated from task completion and review outcomes.",
    "- Manual edits should keep canonical English skill identifiers.",
    "",
    "## Notes",
    "- This file records durable skill history for the agent bundle.",
    "- Append purpose, outcome, and verification when a new skill is adopted.",
    "- Current file state: placeholder generated by bundle sync.",
    "- Replace placeholder lines after a real learned/installed skill snapshot exists.",
    "",
  ].join("\n");
}

function buildSettingsContent(input: AgentGuideInput, updatedAt: string): string {
  const extras = extractAgentProfileExtras(input.agentProfileJson ?? null);
  const payload = {
    agent_id: input.id,
    agent_name: input.name,
    role: displayRole(input),
    department_id: input.departmentId ?? "unassigned",
    workflow_profile: input.workflowProfileJson ? String(input.workflowProfileJson) : null,
    agent_profile_json: input.agentProfileJson ? String(input.agentProfileJson) : null,
    goal_command_policy: {
      version: "donggri_goal_commands_v1",
      native_commands_only: true,
      octopus_aliases_enabled: false,
      bottleneck_rule:
        "Use required_departments first; add extra departments only when a verification gate requires them.",
      parallelism_rule: "Split independent work up to max_parallel_workstreams with one owner per workstream.",
    },
    class_path: extras.classPath,
    promotion_policy: extras.promotionPolicy,
    visual_profile_key: extras.visualProfileKey,
    preferred_subagents: extras.preferredSubagents,
    stats_tasks_done: safeNumber(input.statsTasksDone),
    stats_xp: safeNumber(input.statsXp),
    memory_snapshot: Array.isArray(input.memorySnapshot) ? input.memorySnapshot.filter(Boolean) : [],
    skill_growth_snapshot: Array.isArray(input.skillGrowthSnapshot) ? input.skillGrowthSnapshot.filter(Boolean) : [],
    recent_lessons: Array.isArray(input.recentLessons) ? input.recentLessons.filter(Boolean) : [],
    project_experience: Array.isArray(input.projectExperience) ? input.projectExperience.filter(Boolean) : [],
    updated_at: updatedAt,
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

function readExistingUpdatedAt(settingsPath: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as { updated_at?: unknown };
    return typeof parsed.updated_at === "string" && parsed.updated_at.trim() ? parsed.updated_at : null;
  } catch {
    return null;
  }
}

function readExistingSnapshotAt(agentsPath: string): string | null {
  try {
    const match = fs.readFileSync(agentsPath, "utf8").match(/^- ([0-9]{4}-[0-9]{2}-[0-9]{2}T[^|]+Z) \| tasks_done=/m);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function fileContentEquals(filePath: string, expectedContent: string): boolean {
  try {
    return fs.readFileSync(filePath, "utf8") === expectedContent;
  } catch {
    return false;
  }
}

function ensureAgentBundleFiles(root: string, input: AgentGuideInput): string {
  const fileToken = normalizeFileToken(input.name || input.id || "agent") || "agent";
  fs.mkdirSync(root, { recursive: true });

  const agentsFileName = `${fileToken}_AGENTS.md`;
  const skillsFileName = `${fileToken}_skills.md`;
  const settingsFileName = `.${fileToken}_settings.json`;
  cleanupLegacyBundleFiles(root, new Set([agentsFileName, skillsFileName, settingsFileName]));

  const guideRoot = resolveGuideRoot();
  const relativeBundlePath = path.relative(guideRoot, root);
  const agentsPath = path.join(root, agentsFileName);
  const skillsPath = path.join(root, skillsFileName);
  const settingsPath = path.join(root, settingsFileName);

  const existingSettingsUpdatedAt = readExistingUpdatedAt(settingsPath);
  const existingSnapshotAt = readExistingSnapshotAt(agentsPath);
  const stableUpdatedAt = new Date().toISOString();
  const stableSettingsUpdatedAt = existingSettingsUpdatedAt ?? stableUpdatedAt;
  const stableSnapshotAt = existingSnapshotAt ?? stableSettingsUpdatedAt;
  const stableAgentsContent = buildAgentGuideContent(input, relativeBundlePath, stableSnapshotAt);
  const skillsContent = buildSkillsContent(input);
  const stableSettingsContent = buildSettingsContent(input, stableSettingsUpdatedAt);

  if (
    existingSettingsUpdatedAt &&
    existingSnapshotAt &&
    fileContentEquals(agentsPath, stableAgentsContent) &&
    fileContentEquals(skillsPath, skillsContent) &&
    fileContentEquals(settingsPath, stableSettingsContent)
  ) {
    return agentsPath;
  }

  const nextUpdatedAt = new Date().toISOString();
  fs.writeFileSync(agentsPath, buildAgentGuideContent(input, relativeBundlePath, nextUpdatedAt), "utf8");
  fs.writeFileSync(skillsPath, skillsContent, "utf8");
  fs.writeFileSync(settingsPath, buildSettingsContent(input, nextUpdatedAt), "utf8");

  return agentsPath;
}

function moveDirectorySafe(from: string, to: string): void {
  try {
    fs.renameSync(from, to);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "EXDEV" && code !== "EPERM" && code !== "EACCES" && code !== "ENOTEMPTY") {
      throw error;
    }
  }
  fs.cpSync(from, to, { recursive: true, force: true });
  fs.rmSync(from, { recursive: true, force: true });
}

export function upsertAgentGuideFile(input: AgentGuideInput): string {
  const root = resolveGuideRoot();
  fs.mkdirSync(root, { recursive: true });

  const currentRoot = findAgentRootById(root, input.id);
  const targetRoot = resolveBundlePath(root, input);

  if (currentRoot && path.resolve(currentRoot) !== path.resolve(targetRoot)) {
    fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
    moveDirectorySafe(currentRoot, targetRoot);
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
  moveDirectorySafe(bundleRoot, destination);
  return destination;
}
