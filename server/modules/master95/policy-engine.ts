import path from "node:path";
import { z } from "zod";
import type { Master95Department, Master95RuntimeOperationClass } from "./agent-runtime.js";
import { createMaster95DefaultProjectRegistry, type Master95ProjectRegistry } from "./project-registry.js";

const NonEmpty = z.string().trim().min(1);
export const Master95ApprovalRecordSchema = z
  .object({
    approval_id: NonEmpty,
    project_id: NonEmpty,
    requester_agent_id: z.enum(["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"]),
    approver_agent_id: z.literal("CONTROL"),
    operation_class: NonEmpty,
    scope: NonEmpty,
    status: z.enum(["pending", "approved", "rejected", "revoked"]),
    requested_at: z.iso.datetime({ offset: true }),
    decided_at: z.iso.datetime({ offset: true }).nullable(),
    expires_at: z.iso.datetime({ offset: true }),
    revoked_at: z.iso.datetime({ offset: true }).nullable(),
    trace_id: NonEmpty,
    reason: NonEmpty,
  })
  .strict();

export type Master95ApprovalRecord = z.infer<typeof Master95ApprovalRecordSchema>;
export type Master95SandboxProfile = {
  agent_id: Master95Department;
  allowed_paths: string[];
  allowed_hosts: string[];
  allowed_commands: string[];
};
export type Master95PolicyToolRequest = {
  project_id: string;
  agent_id: Master95Department;
  operation_class: Master95RuntimeOperationClass;
  approval_id?: string | null;
  path?: string | null;
  network_url?: string | null;
  command?: string | null;
  now: string;
  trace_id: string;
};
export type Master95EnforcedPolicyDecision = {
  decision_id: string;
  decision: "allow" | "approval_required" | "block";
  reason_code: string;
  approval_id: string | null;
  trace_id: string;
};

const APPROVAL_REQUIRED = new Set<Master95RuntimeOperationClass>([
  "write_control_plane_docs",
  "write_repo_code",
  "external_process",
  "git_operation",
  "file_deletion",
  "db_write",
  "docker_destructive",
  "deploy",
  "secret_mutation",
  "agentmemory_runtime",
]);

export class Master95PolicyEngine {
  readonly #approvals = new Map<string, Master95ApprovalRecord>();
  readonly #audit: Array<Record<string, unknown>> = [];
  #decisionSequence = 0;

  constructor(
    readonly profiles: Master95SandboxProfile[],
    readonly projects: Master95ProjectRegistry = createMaster95DefaultProjectRegistry(),
  ) {}

  requestApproval(input: Omit<Master95ApprovalRecord, "status" | "decided_at" | "revoked_at">) {
    const approval = Master95ApprovalRecordSchema.parse({
      ...input,
      status: "pending",
      decided_at: null,
      revoked_at: null,
    });
    if (approval.requester_agent_id === approval.approver_agent_id) throw new Error("self_approval_request_denied");
    if (this.#approvals.has(approval.approval_id)) throw new Error("approval_already_exists");
    this.projects.require(approval.project_id);
    this.#approvals.set(approval.approval_id, approval);
    this.#audit.push({ event: "approval.requested", approval_id: approval.approval_id, trace_id: approval.trace_id });
    return structuredClone(approval);
  }

  decideApproval(
    approvalId: string,
    input: {
      actor_agent_id: Master95Department;
      decision: "approved" | "rejected";
      decided_at: string;
      trace_id: string;
    },
  ) {
    if (input.actor_agent_id !== "CONTROL") throw new Error("control_approver_required");
    const approval = this.#requireApproval(approvalId);
    if (approval.status !== "pending") throw new Error("approval_not_pending");
    approval.status = input.decision;
    approval.decided_at = z.iso.datetime({ offset: true }).parse(input.decided_at);
    this.#approvals.set(approvalId, approval);
    this.#audit.push({
      event: "approval.decided",
      approval_id: approvalId,
      decision: input.decision,
      trace_id: input.trace_id,
    });
    return structuredClone(approval);
  }

  revokeApproval(
    approvalId: string,
    input: { actor_agent_id: Master95Department; revoked_at: string; trace_id: string },
  ) {
    if (input.actor_agent_id !== "CONTROL") throw new Error("control_approver_required");
    const approval = this.#requireApproval(approvalId);
    if (approval.status !== "approved") throw new Error("approved_status_required_for_revoke");
    approval.status = "revoked";
    approval.revoked_at = z.iso.datetime({ offset: true }).parse(input.revoked_at);
    this.#approvals.set(approvalId, approval);
    this.#audit.push({ event: "approval.revoked", approval_id: approvalId, trace_id: input.trace_id });
    return structuredClone(approval);
  }

  authorize(request: Master95PolicyToolRequest): Master95EnforcedPolicyDecision {
    this.projects.require(request.project_id);
    const profile = this.profiles.find((item) => item.agent_id === request.agent_id);
    if (!profile) return this.#decision(request, "block", "sandbox_profile_missing");
    const sandboxFailure = evaluateSandbox(profile, request);
    if (sandboxFailure) return this.#decision(request, "block", sandboxFailure);
    if (!APPROVAL_REQUIRED.has(request.operation_class))
      return this.#decision(request, "allow", "side_effect_free_operation");
    if (!request.approval_id) return this.#decision(request, "approval_required", "approval_id_required");
    const approval = this.#approvals.get(request.approval_id);
    if (!approval) return this.#decision(request, "block", "approval_not_found");
    if (approval.status !== "approved") return this.#decision(request, "block", `approval_${approval.status}`);
    if (Date.parse(request.now) >= Date.parse(approval.expires_at))
      return this.#decision(request, "block", "approval_expired");
    if (approval.project_id !== request.project_id)
      return this.#decision(request, "block", "approval_project_mismatch");
    if (approval.requester_agent_id !== request.agent_id)
      return this.#decision(request, "block", "approval_agent_mismatch");
    if (approval.operation_class !== request.operation_class)
      return this.#decision(request, "block", "approval_operation_mismatch");
    return this.#decision(request, "allow", "approved_scope_and_sandbox");
  }

  listAudit() {
    return structuredClone(this.#audit);
  }

  #requireApproval(approvalId: string) {
    const approval = this.#approvals.get(approvalId);
    if (!approval) throw new Error("approval_not_found");
    return structuredClone(approval);
  }

  #decision(
    request: Master95PolicyToolRequest,
    decision: Master95EnforcedPolicyDecision["decision"],
    reasonCode: string,
  ) {
    this.#decisionSequence += 1;
    const result = {
      decision_id: `policy-decision:${this.#decisionSequence}`,
      decision,
      reason_code: reasonCode,
      approval_id: request.approval_id ?? null,
      trace_id: required(request.trace_id, "trace_id"),
    };
    this.#audit.push({
      event: "policy.evaluated",
      ...result,
      project_id: request.project_id,
      agent_id: request.agent_id,
      operation_class: request.operation_class,
    });
    return result;
  }
}

export class Master95GuardedToolGateway {
  constructor(readonly policy: Master95PolicyEngine) {}

  dispatch<T>(request: Master95PolicyToolRequest, execute: () => T) {
    const policyDecision = this.policy.authorize(request);
    if (policyDecision.decision !== "allow") {
      return { executed: false as const, policy: policyDecision, result: null };
    }
    return { executed: true as const, policy: policyDecision, result: execute() };
  }
}

export const MASTER95_DEFAULT_SANDBOX_PROFILES: Master95SandboxProfile[] = [
  {
    agent_id: "CONTROL",
    allowed_paths: ["G:/Donggri_DevDrive/storage/codex-control"],
    allowed_hosts: ["127.0.0.1"],
    allowed_commands: ["node"],
  },
  {
    agent_id: "SPEC",
    allowed_paths: ["G:/Donggri_DevDrive/storage/codex-control"],
    allowed_hosts: [],
    allowed_commands: ["node"],
  },
  { agent_id: "EXPLORE", allowed_paths: ["G:/Donggri_DevDrive"], allowed_hosts: [], allowed_commands: ["rg", "git"] },
  {
    agent_id: "IMPLEMENT",
    allowed_paths: ["G:/Donggri_DevDrive/repos/DonggriCompany"],
    allowed_hosts: ["127.0.0.1"],
    allowed_commands: ["node", "pnpm"],
  },
  {
    agent_id: "REVIEW",
    allowed_paths: ["G:/Donggri_DevDrive"],
    allowed_hosts: [],
    allowed_commands: ["rg", "node", "pnpm"],
  },
  {
    agent_id: "OPS",
    allowed_paths: ["G:/Donggri_DevDrive/storage/codex-control"],
    allowed_hosts: ["127.0.0.1"],
    allowed_commands: ["node"],
  },
];

function evaluateSandbox(profile: Master95SandboxProfile, request: Master95PolicyToolRequest) {
  if (request.path) {
    const candidate = normalizeWindowsPath(request.path);
    if (!profile.allowed_paths.some((root) => isUnder(candidate, normalizeWindowsPath(root))))
      return "sandbox_path_escape";
  }
  if (request.network_url) {
    let hostname = "";
    try {
      hostname = new URL(request.network_url).hostname.toLowerCase();
    } catch {
      return "sandbox_invalid_network_url";
    }
    if (!profile.allowed_hosts.map((host) => host.toLowerCase()).includes(hostname)) return "sandbox_network_denied";
  }
  if (request.command) {
    if (/[;&|><`]/.test(request.command)) return "sandbox_shell_metacharacter_denied";
    const executable = request.command
      .trim()
      .split(/\s+/)[0]
      .toLowerCase()
      .replace(/\.exe$/, "");
    if (!profile.allowed_commands.map((item) => item.toLowerCase()).includes(executable))
      return "sandbox_command_denied";
  }
  return null;
}

function normalizeWindowsPath(value: string) {
  return path.win32.resolve(value.replace(/\//g, "\\")).toLowerCase();
}

function isUnder(candidate: string, root: string) {
  return candidate === root || candidate.startsWith(`${root}\\`);
}

function required(value: string, field: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}
