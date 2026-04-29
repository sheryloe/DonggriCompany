import type { DatabaseSync } from "node:sqlite";
import type { AgentRow } from "./direct-chat-types.ts";
import {
  DEFAULT_WORKFLOW_PACK_KEY,
  isWorkflowPackKey,
  type WorkflowPackKey,
} from "../../workflow/packs/definitions.ts";
import { normalizeAgentProfile, serializeAgentProfile } from "../../workflow/agents/agent-profile.ts";
import { resolveAgentRunMode } from "../../workflow/agents/run-mode.ts";

type DbLike = Pick<DatabaseSync, "prepare">;

const VALID_AGENT_ROLES = new Set(["team_leader", "senior", "junior", "intern"]);
const VALID_CLI_PROVIDERS = new Set([
  "claude",
  "codex",
  "gemini",
  "jules",
  "opencode",
  "kimi",
  "copilot",
  "antigravity",
  "api",
]);

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value: unknown): string | null {
  const text = normalizeText(value);
  return text.length > 0 ? text : null;
}

function normalizeAgentRole(value: unknown): "team_leader" | "senior" | "junior" | "intern" {
  const role = normalizeText(value).toLowerCase();
  if (role === "team_leader" || role === "senior" || role === "junior" || role === "intern") return role;
  return "senior";
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const i = Math.trunc(num);
  return i >= 0 ? i : fallback;
}

function normalizeNullablePositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const i = Math.trunc(num);
  return i > 0 ? i : null;
}

function parseJsonSafe(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

type OfficePackProfileAgent = {
  id: string;
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  department_id: string | null;
  role: "team_leader" | "senior" | "junior" | "intern";
  cli_provider: string;
  cli_model: string | null;
  cli_reasoning_level: string | null;
  run_mode: "standard" | "plan";
  avatar_emoji: string;
  sprite_number: number | null;
  personality: string | null;
  agent_profile_json: string | null;
  created_at: number;
};

type OfficePackProfileDepartment = {
  id: string;
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  icon: string;
  color: string;
  description: string | null;
  prompt: string | null;
  sort_order: number;
  created_at: number;
};

function normalizeOfficePackProfileAgent(raw: unknown, nowMs: number): OfficePackProfileAgent | null {
  const obj = asObject(raw);
  if (!obj) return null;

  const id = normalizeText(obj.id);
  if (!id) return null;

  const name = normalizeText(obj.name) || id;
  const roleRaw = normalizeText(obj.role).toLowerCase();
  const role = VALID_AGENT_ROLES.has(roleRaw) ? normalizeAgentRole(roleRaw) : "senior";
  const cliProviderRaw = normalizeText(obj.cli_provider).toLowerCase();
  const canonicalCliProvider = VALID_CLI_PROVIDERS.has(cliProviderRaw) ? cliProviderRaw : "codex";

  return {
    id,
    name,
    name_ko: normalizeText(obj.name_ko) || name,
    name_ja: normalizeText(obj.name_ja),
    name_zh: normalizeText(obj.name_zh),
    department_id: normalizeOptionalText(obj.department_id),
    role,
    cli_provider: canonicalCliProvider,
    cli_model: normalizeOptionalText(obj.cli_model),
    cli_reasoning_level: normalizeOptionalText(obj.cli_reasoning_level),
    run_mode: resolveAgentRunMode({
      runMode: obj.run_mode,
      cliProvider: canonicalCliProvider,
      cliModel: normalizeOptionalText(obj.cli_model),
    }),
    avatar_emoji: normalizeText(obj.avatar_emoji) || "BOT",
    sprite_number: normalizeNullablePositiveInt(obj.sprite_number),
    personality: normalizeOptionalText(obj.personality),
    agent_profile_json: serializeAgentProfile(normalizeAgentProfile(obj.agent_profile ?? obj.agent_profile_json, role)),
    created_at: normalizePositiveInt(obj.created_at, nowMs),
  };
}

function normalizeOfficePackProfileDepartment(raw: unknown, nowMs: number): OfficePackProfileDepartment | null {
  const obj = asObject(raw);
  if (!obj) return null;

  const id = normalizeText(obj.id);
  if (!id) return null;

  const name = normalizeText(obj.name) || id;
  return {
    id,
    name,
    name_ko: normalizeText(obj.name_ko) || name,
    name_ja: normalizeText(obj.name_ja),
    name_zh: normalizeText(obj.name_zh),
    icon: normalizeText(obj.icon) || "ORG",
    color: normalizeText(obj.color) || "#64748b",
    description: normalizeOptionalText(obj.description),
    prompt: normalizeOptionalText(obj.prompt),
    sort_order: normalizePositiveInt(obj.sort_order, 99),
    created_at: normalizePositiveInt(obj.created_at, nowMs),
  };
}

function findOfficePackProfileAgentById(
  root: Record<string, unknown>,
  agentId: string,
  nowMs: number,
): { packKey: WorkflowPackKey; agent: OfficePackProfileAgent; department: OfficePackProfileDepartment | null } | null {
  for (const [rawPackKey, profileRaw] of Object.entries(root)) {
    if (!isWorkflowPackKey(rawPackKey)) continue;
    const profile = asObject(profileRaw);
    if (!profile) continue;

    const departments = Array.isArray(profile.departments)
      ? profile.departments.map((entry) => normalizeOfficePackProfileDepartment(entry, nowMs)).filter(Boolean)
      : [];
    const agents = Array.isArray(profile.agents)
      ? profile.agents.map((entry) => normalizeOfficePackProfileAgent(entry, nowMs)).filter(Boolean)
      : [];

    const agent = (agents as OfficePackProfileAgent[]).find((entry) => entry.id === agentId);
    if (!agent) continue;

    const department = agent.department_id
      ? ((departments as OfficePackProfileDepartment[]).find((entry) => entry.id === agent.department_id) ?? null)
      : null;
    return { packKey: rawPackKey, agent, department };
  }
  return null;
}

function buildReadOnlyAgentRow(found: {
  packKey: WorkflowPackKey;
  agent: OfficePackProfileAgent;
  department: OfficePackProfileDepartment | null;
}): AgentRow {
  return {
    id: found.agent.id,
    name: found.agent.name,
    name_ko: found.agent.name_ko,
    created_at: found.agent.created_at,
    role: found.agent.role,
    acts_as_planning_leader: 0,
    personality: found.agent.personality,
    status: "idle",
    department_id: found.department?.id ?? found.agent.department_id,
    current_task_id: null,
    avatar_emoji: found.agent.avatar_emoji,
    sprite_number: found.agent.sprite_number,
    cli_provider: found.agent.cli_provider,
    oauth_account_id: null,
    api_provider_id: null,
    api_model: null,
    cli_model: found.agent.cli_model,
    cli_reasoning_level: found.agent.cli_reasoning_level,
    run_mode: found.agent.run_mode,
    cli_account_pool_id: null,
    agent_profile_json: found.agent.agent_profile_json,
    workflow_profile: null,
  } as AgentRow;
}

export function hydrateOfficePackAgentFromSettings(db: DbLike, agentId: string, nowMs: () => number): AgentRow | null {
  void nowMs;
  const normalizedAgentId = normalizeText(agentId);
  if (!normalizedAgentId) return null;

  const existing = db.prepare("SELECT * FROM agents WHERE id = ?").get(normalizedAgentId) as AgentRow | undefined;
  if (!existing) return null;
  return existing;
}

export function syncOfficePackAgentsFromProfiles(
  _db: DbLike,
  profilesRaw: unknown,
  nowMs: () => number,
): { departmentsSynced: number; agentsSynced: number } {
  const root = asObject(parseJsonSafe(profilesRaw));
  if (!root) return { departmentsSynced: 0, agentsSynced: 0 };

  const now = nowMs();
  let departmentsSynced = 0;
  let agentsSynced = 0;

  for (const [rawPackKey, profileRaw] of Object.entries(root)) {
    if (!isWorkflowPackKey(rawPackKey)) continue;
    const profile = asObject(profileRaw);
    if (!profile) continue;

    const departments = Array.isArray(profile.departments)
      ? profile.departments.map((entry) => normalizeOfficePackProfileDepartment(entry, now)).filter(Boolean)
      : [];
    const agents = Array.isArray(profile.agents)
      ? profile.agents.map((entry) => normalizeOfficePackProfileAgent(entry, now)).filter(Boolean)
      : [];

    departmentsSynced += departments.length;
    agentsSynced += agents.length;
  }

  return { departmentsSynced, agentsSynced };
}

export function syncOfficePackAgentsForPack(
  _db: DbLike,
  profilesRaw: unknown,
  packKey: string,
  nowMs: () => number,
): { departmentsSynced: number; agentsSynced: number } {
  const root = asObject(parseJsonSafe(profilesRaw));
  const normalizedPackKey = normalizeText(packKey);
  if (!root || !normalizedPackKey) return { departmentsSynced: 0, agentsSynced: 0 };

  const resolvedPackKey = isWorkflowPackKey(normalizedPackKey) ? normalizedPackKey : DEFAULT_WORKFLOW_PACK_KEY;
  const profile = asObject(root[resolvedPackKey]);
  if (!profile) return { departmentsSynced: 0, agentsSynced: 0 };

  const now = nowMs();
  const departments = Array.isArray(profile.departments)
    ? profile.departments.map((entry) => normalizeOfficePackProfileDepartment(entry, now)).filter(Boolean)
    : [];
  const agents = Array.isArray(profile.agents)
    ? profile.agents.map((entry) => normalizeOfficePackProfileAgent(entry, now)).filter(Boolean)
    : [];

  return {
    departmentsSynced: departments.length,
    agentsSynced: agents.length,
  };
}
