import { z } from "zod";
import {
  MASTER95_AGENT_MANIFESTS,
  MASTER95_RUNTIME_OPERATION_CLASSES,
  type Master95Department,
  type Master95RuntimeOperationClass,
} from "./agent-runtime.js";

export const MASTER95_AGENT_MANIFEST_SCHEMA_VERSION = "1.0.0" as const;
export const MASTER95_AGENT_VERSION_LIFECYCLES = ["candidate", "active", "deprecated", "revoked"] as const;

const NonEmpty = z.string().trim().min(1);
const Semver = z.string().regex(/^\d+\.\d+\.\d+$/);
const IsoDateTime = z.iso.datetime({ offset: true });
const Department = z.enum(["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"]);

export const Master95AgentManifestSchema = z
  .object({
    schema_version: z.literal(MASTER95_AGENT_MANIFEST_SCHEMA_VERSION),
    manifest_id: NonEmpty,
    agent_id: Department,
    version: Semver,
    display_name: NonEmpty,
    owner_department: Department,
    authority: z.enum([
      "root-control",
      "specification",
      "read-only-exploration",
      "bounded-implementation",
      "read-only-review",
      "operations",
    ]),
    model_policy: NonEmpty,
    allowed_skills: z.array(NonEmpty).min(1),
    denied_skills: z.array(NonEmpty),
    allowed_tools: z.array(NonEmpty).min(1),
    allowed_operations: z.array(z.enum(MASTER95_RUNTIME_OPERATION_CLASSES)).min(1),
    allowed_project_patterns: z.array(NonEmpty).min(1),
    file_scope: z.array(NonEmpty),
    max_steps: z.number().int().positive(),
    max_handoffs: z.number().int().nonnegative(),
    timeout_seconds: z.number().int().positive(),
    requires_evidence: z.boolean(),
    input_schema_ref: NonEmpty,
    output_schema_ref: NonEmpty,
    created_at: IsoDateTime,
    created_by: Department,
    change_reason: NonEmpty,
    rollback_target_version: Semver.nullable(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const uniqueFields = [
      "allowed_skills",
      "denied_skills",
      "allowed_tools",
      "allowed_operations",
      "allowed_project_patterns",
      "file_scope",
    ] as const;
    for (const field of uniqueFields) {
      if (new Set(manifest[field]).size !== manifest[field].length) {
        context.addIssue({ code: "custom", path: [field], message: `${field}_must_be_unique` });
      }
    }
    const denied = new Set(manifest.denied_skills);
    if (manifest.allowed_skills.some((skill) => denied.has(skill))) {
      context.addIssue({ code: "custom", path: ["denied_skills"], message: "allowed_and_denied_skills_overlap" });
    }
  });

export type Master95AgentVersionManifest = z.infer<typeof Master95AgentManifestSchema>;
export type Master95AgentVersionLifecycle = (typeof MASTER95_AGENT_VERSION_LIFECYCLES)[number];

export type Master95AgentVersionRecord = {
  agent_id: Master95Department;
  version: string;
  lifecycle: Master95AgentVersionLifecycle;
  registered_at: string;
  activated_at: string | null;
  deactivated_at: string | null;
};

export type Master95AgentRegistryEvent = {
  event_id: string;
  event_type:
    | "agent.version.registered"
    | "agent.version.activated"
    | "agent.version.rolled_back"
    | "agent.version.revoked";
  agent_id: Master95Department;
  version: string;
  previous_version: string | null;
  actor_agent_id: "CONTROL";
  trace_id: string;
  reason: string;
  occurred_at: string;
};

export type Master95AgentExecutionRequest = {
  agent_id: Master95Department;
  version?: string | null;
  project_id: string;
  skill_id: string;
  tool_id: string;
  operation_class: Master95RuntimeOperationClass;
};

export type Master95AgentExecutionDecision = {
  decision: "allow" | "block";
  reason_code:
    | "authorized_by_active_manifest"
    | "manifest_missing"
    | "manifest_version_missing"
    | "manifest_version_not_active"
    | "project_not_allowed"
    | "skill_denied"
    | "skill_not_allowed"
    | "tool_not_allowed"
    | "operation_not_allowed";
  agent_id: Master95Department;
  version: string | null;
  manifest_id: string | null;
};

export type Master95ExecutionLimitInput = {
  steps: number;
  handoffs: number;
  elapsed_seconds: number;
  evidence_refs: string[];
};

export class Master95AgentVersionRegistry {
  readonly #manifests = new Map<string, Readonly<Master95AgentVersionManifest>>();
  readonly #records = new Map<string, Master95AgentVersionRecord>();
  readonly #activeVersions = new Map<Master95Department, string>();
  readonly #events: Master95AgentRegistryEvent[] = [];

  register(
    manifestInput: unknown,
    traceId: string,
    reason = "register agent version",
  ): Readonly<Master95AgentVersionManifest> {
    const manifest = Master95AgentManifestSchema.parse(manifestInput);
    const key = versionKey(manifest.agent_id, manifest.version);
    if (this.#manifests.has(key)) throw new Error("agent_version_already_registered");
    if ([...this.#manifests.values()].some((item) => item.manifest_id === manifest.manifest_id)) {
      throw new Error("manifest_id_already_registered");
    }
    const frozen = deepFreeze(structuredClone(manifest));
    this.#manifests.set(key, frozen);
    this.#records.set(key, {
      agent_id: manifest.agent_id,
      version: manifest.version,
      lifecycle: "candidate",
      registered_at: manifest.created_at,
      activated_at: null,
      deactivated_at: null,
    });
    this.#recordEvent(
      "agent.version.registered",
      manifest.agent_id,
      manifest.version,
      null,
      traceId,
      reason,
      manifest.created_at,
    );
    return frozen;
  }

  activate(agentId: Master95Department, version: string, input: RegistryChangeInput): Master95AgentVersionRecord {
    assertControlChange(input);
    const key = versionKey(agentId, version);
    const record = this.#records.get(key);
    if (!record) throw new Error("agent_version_not_found");
    if (record.lifecycle === "revoked") throw new Error("revoked_agent_version_cannot_activate");
    const previousVersion = this.#activeVersions.get(agentId) ?? null;
    if (previousVersion && previousVersion !== version) {
      const previous = this.#records.get(versionKey(agentId, previousVersion));
      if (previous) {
        previous.lifecycle = "deprecated";
        previous.deactivated_at = input.occurred_at;
      }
    }
    record.lifecycle = "active";
    record.activated_at = input.occurred_at;
    record.deactivated_at = null;
    this.#activeVersions.set(agentId, version);
    this.#recordEvent(
      "agent.version.activated",
      agentId,
      version,
      previousVersion,
      input.trace_id,
      input.reason,
      input.occurred_at,
    );
    return { ...record };
  }

  rollback(agentId: Master95Department, targetVersion: string, input: RegistryChangeInput): Master95AgentVersionRecord {
    assertControlChange(input);
    const currentVersion = this.#activeVersions.get(agentId) ?? null;
    if (!currentVersion) throw new Error("active_agent_version_missing");
    if (currentVersion === targetVersion) throw new Error("rollback_target_is_current");
    const target = this.#records.get(versionKey(agentId, targetVersion));
    if (!target) throw new Error("rollback_target_not_found");
    if (target.lifecycle === "revoked") throw new Error("rollback_target_revoked");
    const activated = this.activate(agentId, targetVersion, input);
    this.#recordEvent(
      "agent.version.rolled_back",
      agentId,
      targetVersion,
      currentVersion,
      input.trace_id,
      input.reason,
      input.occurred_at,
    );
    return activated;
  }

  revoke(agentId: Master95Department, version: string, input: RegistryChangeInput): Master95AgentVersionRecord {
    assertControlChange(input);
    const record = this.#records.get(versionKey(agentId, version));
    if (!record) throw new Error("agent_version_not_found");
    if (this.#activeVersions.get(agentId) === version) this.#activeVersions.delete(agentId);
    record.lifecycle = "revoked";
    record.deactivated_at = input.occurred_at;
    this.#recordEvent("agent.version.revoked", agentId, version, null, input.trace_id, input.reason, input.occurred_at);
    return { ...record };
  }

  authorizeExecution(request: Master95AgentExecutionRequest): Master95AgentExecutionDecision {
    const versions = [...this.#manifests.values()].filter((manifest) => manifest.agent_id === request.agent_id);
    if (versions.length === 0) return blocked(request.agent_id, request.version ?? null, null, "manifest_missing");
    const version = request.version ?? this.#activeVersions.get(request.agent_id) ?? null;
    if (!version) return blocked(request.agent_id, null, null, "manifest_version_not_active");
    const manifest = this.#manifests.get(versionKey(request.agent_id, version));
    if (!manifest) return blocked(request.agent_id, version, null, "manifest_version_missing");
    const record = this.#records.get(versionKey(request.agent_id, version));
    if (record?.lifecycle !== "active")
      return blocked(request.agent_id, version, manifest.manifest_id, "manifest_version_not_active");
    if (!manifest.allowed_project_patterns.some((pattern) => matchesPattern(request.project_id, pattern))) {
      return blocked(request.agent_id, version, manifest.manifest_id, "project_not_allowed");
    }
    if (manifest.denied_skills.includes(request.skill_id))
      return blocked(request.agent_id, version, manifest.manifest_id, "skill_denied");
    if (!manifest.allowed_skills.includes(request.skill_id))
      return blocked(request.agent_id, version, manifest.manifest_id, "skill_not_allowed");
    if (!manifest.allowed_tools.includes(request.tool_id))
      return blocked(request.agent_id, version, manifest.manifest_id, "tool_not_allowed");
    if (!manifest.allowed_operations.includes(request.operation_class)) {
      return blocked(request.agent_id, version, manifest.manifest_id, "operation_not_allowed");
    }
    return {
      decision: "allow",
      reason_code: "authorized_by_active_manifest",
      agent_id: request.agent_id,
      version,
      manifest_id: manifest.manifest_id,
    };
  }

  evaluateLimits(agentId: Master95Department, version: string, input: Master95ExecutionLimitInput) {
    const manifest = this.#manifests.get(versionKey(agentId, version));
    if (!manifest) throw new Error("agent_version_not_found");
    const violations: string[] = [];
    if (input.steps > manifest.max_steps) violations.push("max_steps_exceeded");
    if (input.handoffs > manifest.max_handoffs) violations.push("max_handoffs_exceeded");
    if (input.elapsed_seconds > manifest.timeout_seconds) violations.push("timeout_exceeded");
    if (manifest.requires_evidence && input.evidence_refs.length === 0) violations.push("evidence_required");
    return { allowed: violations.length === 0, violations };
  }

  getManifest(agentId: Master95Department, version: string) {
    return this.#manifests.get(versionKey(agentId, version)) ?? null;
  }

  getActiveVersion(agentId: Master95Department) {
    return this.#activeVersions.get(agentId) ?? null;
  }

  listRecords() {
    return [...this.#records.values()].map((record) => ({ ...record }));
  }

  listEvents() {
    return this.#events.map((event) => ({ ...event }));
  }

  #recordEvent(
    eventType: Master95AgentRegistryEvent["event_type"],
    agentId: Master95Department,
    version: string,
    previousVersion: string | null,
    traceId: string,
    reason: string,
    occurredAt: string,
  ) {
    this.#events.push({
      event_id: `agent-event:${this.#events.length + 1}`,
      event_type: eventType,
      agent_id: agentId,
      version,
      previous_version: previousVersion,
      actor_agent_id: "CONTROL",
      trace_id: required(traceId, "trace_id"),
      reason: required(reason, "reason"),
      occurred_at: IsoDateTime.parse(occurredAt),
    });
  }
}

type RegistryChangeInput = {
  actor_agent_id: Master95Department;
  trace_id: string;
  reason: string;
  occurred_at: string;
};

export function createMaster95DefaultAgentRegistry() {
  const registry = new Master95AgentVersionRegistry();
  for (const manifest of MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS) {
    registry.register(manifest, `trace:seed:${manifest.agent_id}`, "canonical v1 seed");
    registry.activate(manifest.agent_id, manifest.version, {
      actor_agent_id: "CONTROL",
      trace_id: `trace:seed:${manifest.agent_id}`,
      reason: "activate canonical v1 seed",
      occurred_at: manifest.created_at,
    });
  }
  return registry;
}

const READ_PROJECTS = ["project:*"];
const CREATED_AT = "2026-07-14T00:00:00+09:00";
const permissionSets: Record<
  Master95Department,
  Pick<
    Master95AgentVersionManifest,
    | "allowed_skills"
    | "denied_skills"
    | "allowed_tools"
    | "allowed_operations"
    | "file_scope"
    | "max_steps"
    | "max_handoffs"
    | "timeout_seconds"
  >
> = {
  CONTROL: {
    allowed_skills: ["source-of-truth.read", "approval.evaluate", "routing.plan"],
    denied_skills: ["repo.write", "deploy.execute"],
    allowed_tools: ["control-plane.read", "policy.preview"],
    allowed_operations: ["read_control_plane", "read_repo", "runtime_preview"],
    file_scope: [],
    max_steps: 40,
    max_handoffs: 12,
    timeout_seconds: 1800,
  },
  SPEC: {
    allowed_skills: ["source-of-truth.read", "sdd.design", "sdd.trace"],
    denied_skills: ["repo.write", "deploy.execute"],
    allowed_tools: ["control-plane.read", "control-plane.docs"],
    allowed_operations: ["read_control_plane", "read_repo", "write_control_plane_docs"],
    file_scope: ["storage/codex-control/specs/**", "storage/codex-control/quality/**"],
    max_steps: 60,
    max_handoffs: 8,
    timeout_seconds: 2400,
  },
  EXPLORE: {
    allowed_skills: ["source-of-truth.read", "repo.inspect", "evidence.collect"],
    denied_skills: ["repo.write", "deploy.execute"],
    allowed_tools: ["control-plane.read", "repo.read", "search.read"],
    allowed_operations: ["read_control_plane", "read_repo", "runtime_preview"],
    file_scope: [],
    max_steps: 80,
    max_handoffs: 6,
    timeout_seconds: 2400,
  },
  IMPLEMENT: {
    allowed_skills: ["source-of-truth.read", "repo.inspect", "repo.write", "test.run"],
    denied_skills: ["deploy.execute", "secret.mutate"],
    allowed_tools: ["repo.read", "repo.patch", "test.runner"],
    allowed_operations: ["read_control_plane", "read_repo", "runtime_preview", "write_repo_code", "external_process"],
    file_scope: ["repo-map:allowlist"],
    max_steps: 120,
    max_handoffs: 8,
    timeout_seconds: 3600,
  },
  REVIEW: {
    allowed_skills: ["source-of-truth.read", "repo.inspect", "review.report", "test.read"],
    denied_skills: ["repo.write", "deploy.execute"],
    allowed_tools: ["control-plane.read", "repo.read", "test.runner.read-only"],
    allowed_operations: ["read_control_plane", "read_repo", "runtime_preview"],
    file_scope: [],
    max_steps: 80,
    max_handoffs: 6,
    timeout_seconds: 2400,
  },
  OPS: {
    allowed_skills: ["source-of-truth.read", "evidence.write", "routing.preview", "operations.report"],
    denied_skills: ["repo.write", "deploy.execute"],
    allowed_tools: ["control-plane.read", "control-plane.docs", "runtime.preview"],
    allowed_operations: ["read_control_plane", "read_repo", "runtime_preview", "write_control_plane_docs"],
    file_scope: ["storage/codex-control/specs/**", "storage/codex-control/reports/**"],
    max_steps: 80,
    max_handoffs: 10,
    timeout_seconds: 3600,
  },
};

export const MASTER95_DEFAULT_AGENT_VERSION_MANIFESTS: Master95AgentVersionManifest[] = MASTER95_AGENT_MANIFESTS.map(
  (agent) => ({
    schema_version: MASTER95_AGENT_MANIFEST_SCHEMA_VERSION,
    manifest_id: `manifest:${agent.agent_id.toLowerCase()}:1.0.0`,
    agent_id: agent.agent_id,
    version: "1.0.0",
    display_name: agent.display_name,
    owner_department: agent.owner_department,
    authority: agent.authority,
    model_policy: "master95-balanced-v1",
    ...permissionSets[agent.agent_id],
    allowed_project_patterns: READ_PROJECTS,
    requires_evidence: true,
    input_schema_ref: "master95://contracts/Task@1.0.0",
    output_schema_ref: "master95://contracts/EvaluationResult@1.0.0",
    created_at: CREATED_AT,
    created_by: "CONTROL",
    change_reason: "canonical department manifest v1",
    rollback_target_version: null,
  }),
);

function assertControlChange(input: RegistryChangeInput) {
  if (input.actor_agent_id !== "CONTROL") throw new Error("control_authority_required");
  required(input.trace_id, "trace_id");
  required(input.reason, "reason");
  IsoDateTime.parse(input.occurred_at);
}

function blocked(
  agentId: Master95Department,
  version: string | null,
  manifestId: string | null,
  reasonCode: Exclude<Master95AgentExecutionDecision["reason_code"], "authorized_by_active_manifest">,
): Master95AgentExecutionDecision {
  return { decision: "block", reason_code: reasonCode, agent_id: agentId, version, manifest_id: manifestId };
}

function matchesPattern(value: string, pattern: string) {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  return value === pattern;
}

function versionKey(agentId: Master95Department, version: string) {
  return `${agentId}@${version}`;
}

function required(value: string, field: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
