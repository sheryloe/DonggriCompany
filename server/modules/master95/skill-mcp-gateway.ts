import { z } from "zod";
import type { Master95Department } from "./agent-runtime.js";

const NonEmpty = z.string().trim().min(1);
export const Master95SkillManifestSchema = z
  .object({
    skill_id: NonEmpty,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    description: NonEmpty,
    provider: NonEmpty,
    input_schema_ref: NonEmpty,
    output_schema_ref: NonEmpty,
    allowed_agents: z.array(z.enum(["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"])).min(1),
    allowed_projects: z.array(NonEmpty).min(1),
    risk_level: z.enum(["low", "medium", "high", "critical"]),
    approval_required: z.boolean(),
    timeout_ms: z.number().int().positive(),
    retry_limit: z.number().int().nonnegative().max(3),
    cost_limit: z.number().nonnegative(),
    health_status: z.enum(["healthy", "degraded", "unavailable"]),
    mcp_server: NonEmpty,
  })
  .strict();

export type Master95SkillManifest = z.infer<typeof Master95SkillManifestSchema>;
export type Master95McpCallRequest = {
  skill_id: string;
  version?: string | null;
  agent_id: Master95Department;
  project_id: string;
  approval_id?: string | null;
  trace_id: string;
  input: Record<string, unknown>;
  estimated_cost: number;
  signal?: AbortSignal;
};
export type Master95McpHandler = (
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<Record<string, unknown>>;

export class Master95SkillRegistry {
  readonly #skills = new Map<string, Readonly<Master95SkillManifest>>();
  readonly #active = new Map<string, string>();

  register(input: unknown, active = false) {
    const skill = Master95SkillManifestSchema.parse(input);
    const key = `${skill.skill_id}@${skill.version}`;
    if (this.#skills.has(key)) throw new Error("skill_version_already_registered");
    const frozen = deepFreeze(structuredClone(skill));
    this.#skills.set(key, frozen);
    if (active) this.#active.set(skill.skill_id, skill.version);
    return frozen;
  }

  resolve(skillId: string, version?: string | null) {
    const resolvedVersion = version ?? this.#active.get(skillId);
    if (!resolvedVersion) return null;
    return this.#skills.get(`${skillId}@${resolvedVersion}`) ?? null;
  }

  list() {
    return [...this.#skills.values()];
  }
}

export class Master95McpGateway {
  readonly #handlers = new Map<string, Master95McpHandler>();
  readonly #failures = new Map<string, number>();
  readonly #logs: Array<Record<string, unknown>> = [];

  constructor(readonly registry: Master95SkillRegistry) {}

  registerHandler(skillId: string, handler: Master95McpHandler) {
    this.#handlers.set(skillId, handler);
  }

  listTools() {
    return this.registry.list().map((skill) => ({
      name: skill.skill_id,
      version: skill.version,
      description: skill.description,
      input_schema_ref: skill.input_schema_ref,
    }));
  }

  listResources() {
    return [{ uri: "master95://skills/registry", description: "Versioned Skill Registry snapshot" }];
  }

  listPrompts() {
    return [{ name: "master95-safe-tool-use", description: "Require Project, Agent, Trace, approval, and cost gates" }];
  }

  async callTool(request: Master95McpCallRequest) {
    const skill = this.registry.resolve(request.skill_id, request.version);
    if (!skill) return this.#result(request, "block", "skill_not_registered", null);
    if (!skill.allowed_agents.includes(request.agent_id))
      return this.#result(request, "block", "agent_not_allowed", null);
    if (!skill.allowed_projects.some((pattern) => matches(request.project_id, pattern))) {
      return this.#result(request, "block", "project_not_allowed", null);
    }
    if (skill.health_status === "unavailable" || (this.#failures.get(skill.skill_id) ?? 0) >= 3) {
      return this.#result(request, "block", "skill_circuit_open", null);
    }
    if (skill.approval_required && !request.approval_id)
      return this.#result(request, "approval_required", "approval_id_required", null);
    if (request.estimated_cost > skill.cost_limit) return this.#result(request, "block", "cost_limit_exceeded", null);
    if (request.signal?.aborted) return this.#result(request, "canceled", "call_canceled", null);
    const handler = this.#handlers.get(skill.skill_id);
    if (!handler) return this.#result(request, "block", "handler_unavailable", null);
    try {
      const output = await Promise.race([
        handler(request.input, request.signal),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("skill_timeout")), skill.timeout_ms)),
      ]);
      if (request.signal?.aborted) return this.#result(request, "canceled", "call_canceled", null);
      this.#failures.set(skill.skill_id, 0);
      return this.#result(request, "completed", "skill_completed", output);
    } catch (error) {
      this.#failures.set(skill.skill_id, (this.#failures.get(skill.skill_id) ?? 0) + 1);
      return this.#result(request, "failed", error instanceof Error ? error.message : "skill_failed", null);
    }
  }

  listLogs() {
    return structuredClone(this.#logs);
  }

  #result(request: Master95McpCallRequest, status: string, reasonCode: string, output: Record<string, unknown> | null) {
    const result = {
      status,
      reason_code: reasonCode,
      skill_id: request.skill_id,
      agent_id: request.agent_id,
      project_id: request.project_id,
      trace_id: request.trace_id,
      output,
    };
    this.#logs.push({ ...result, output: output ? "redacted-present" : null });
    return result;
  }
}

export const MASTER95_DEFAULT_SKILLS: Master95SkillManifest[] = [
  skill(
    "control-plane.read",
    "Read Control Plane evidence",
    ["CONTROL", "SPEC", "EXPLORE", "REVIEW", "OPS"],
    ["project:*"],
    "low",
    false,
    0,
  ),
  skill(
    "repo.inspect",
    "Read bounded repository context",
    ["EXPLORE", "IMPLEMENT", "REVIEW"],
    ["project:*"],
    "low",
    false,
    0,
  ),
  skill("repo.patch", "Apply a bounded repository patch", ["IMPLEMENT"], ["project:DonggriCompany"], "high", true, 5),
  skill("routing.preview", "Preview an OPS route", ["CONTROL", "OPS"], ["project:*"], "low", false, 1),
  skill("evidence.write", "Write a Control Plane evidence artifact", ["SPEC", "OPS"], ["project:*"], "medium", true, 2),
  skill("memory.retrieve", "Retrieve project-scoped memory references", ["OPS"], ["project:*"], "medium", false, 1),
];

export function createMaster95DefaultSkillRegistry() {
  const registry = new Master95SkillRegistry();
  for (const skill of MASTER95_DEFAULT_SKILLS) registry.register(skill, true);
  return registry;
}

function skill(
  skill_id: string,
  description: string,
  allowed_agents: Master95Department[],
  allowed_projects: string[],
  risk_level: Master95SkillManifest["risk_level"],
  approval_required: boolean,
  cost_limit: number,
): Master95SkillManifest {
  return {
    skill_id,
    version: "1.0.0",
    description,
    provider: "donggri-master95",
    input_schema_ref: `master95://skills/${skill_id}/input@1.0.0`,
    output_schema_ref: `master95://skills/${skill_id}/output@1.0.0`,
    allowed_agents,
    allowed_projects,
    risk_level,
    approval_required,
    timeout_ms: 1000,
    retry_limit: 1,
    cost_limit,
    health_status: "healthy",
    mcp_server: "master95-local-gateway",
  };
}

function matches(value: string, pattern: string) {
  return pattern.endsWith("*") ? value.startsWith(pattern.slice(0, -1)) : value === pattern;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
