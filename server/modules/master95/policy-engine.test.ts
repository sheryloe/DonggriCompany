import { describe, expect, it } from "vitest";
import {
  MASTER95_DEFAULT_SANDBOX_PROFILES,
  Master95GuardedToolGateway,
  Master95PolicyEngine,
} from "./policy-engine.ts";

const now = "2026-07-14T04:00:00+09:00";
const request = (overrides = {}) => ({
  project_id: "project:DonggriCompany",
  agent_id: "IMPLEMENT" as const,
  operation_class: "write_repo_code" as const,
  path: "G:/Donggri_DevDrive/repos/DonggriCompany/server/modules/master95/policy-engine.ts",
  command: "pnpm test",
  now,
  trace_id: "trace:policy:test",
  ...overrides,
});

describe("Master95 enforced policy, approval, and sandbox", () => {
  it("blocks every risky operation without an approval ID", () => {
    const engine = new Master95PolicyEngine(MASTER95_DEFAULT_SANDBOX_PROFILES);
    for (const operation of [
      "write_repo_code",
      "external_process",
      "git_operation",
      "file_deletion",
      "db_write",
      "docker_destructive",
      "deploy",
      "secret_mutation",
      "agentmemory_runtime",
    ] as const) {
      expect(engine.authorize(request({ operation_class: operation, command: null }))).toMatchObject({
        decision: "approval_required",
        reason_code: "approval_id_required",
      });
    }
  });

  it("allows a valid approved scope and records audit", () => {
    const engine = approvedEngine();
    expect(engine.authorize(request({ approval_id: "approval:policy:1" }))).toMatchObject({
      decision: "allow",
      reason_code: "approved_scope_and_sandbox",
    });
    expect(engine.listAudit().some((entry) => entry.event === "policy.evaluated")).toBe(true);
  });

  it("supports expiry and revocation", () => {
    const expired = approvedEngine();
    expect(
      expired.authorize(request({ approval_id: "approval:policy:1", now: "2026-07-14T06:00:00+09:00" })),
    ).toMatchObject({ decision: "block", reason_code: "approval_expired" });
    const revoked = approvedEngine();
    revoked.revokeApproval("approval:policy:1", {
      actor_agent_id: "CONTROL",
      revoked_at: "2026-07-14T04:30:00+09:00",
      trace_id: "trace:revoke",
    });
    expect(revoked.authorize(request({ approval_id: "approval:policy:1" }))).toMatchObject({
      decision: "block",
      reason_code: "approval_revoked",
    });
  });

  it("prevents Agent self-approval and non-CONTROL decisions", () => {
    const engine = new Master95PolicyEngine(MASTER95_DEFAULT_SANDBOX_PROFILES);
    expect(() => engine.requestApproval({ ...approvalInput(), requester_agent_id: "CONTROL" })).toThrow(
      "self_approval_request_denied",
    );
    engine.requestApproval(approvalInput());
    expect(() =>
      engine.decideApproval("approval:policy:1", {
        actor_agent_id: "IMPLEMENT",
        decision: "approved",
        decided_at: now,
        trace_id: "trace:bad",
      }),
    ).toThrow("control_approver_required");
  });

  it("blocks path traversal, network expansion, command injection, and unlisted commands", () => {
    const engine = approvedEngine();
    expect(
      engine.authorize(
        request({
          approval_id: "approval:policy:1",
          path: "G:/Donggri_DevDrive/repos/DonggriCompany/../BloggerGent/file.ts",
        }),
      ),
    ).toMatchObject({ decision: "block", reason_code: "sandbox_path_escape" });
    expect(
      engine.authorize(request({ approval_id: "approval:policy:1", network_url: "https://example.com" })),
    ).toMatchObject({ decision: "block", reason_code: "sandbox_network_denied" });
    expect(engine.authorize(request({ approval_id: "approval:policy:1", command: "pnpm test; whoami" }))).toMatchObject(
      { decision: "block", reason_code: "sandbox_shell_metacharacter_denied" },
    );
    expect(
      engine.authorize(request({ approval_id: "approval:policy:1", command: "powershell Get-ChildItem" })),
    ).toMatchObject({ decision: "block", reason_code: "sandbox_command_denied" });
  });

  it("blocks approval reuse across Agent, Project, and operation scope", () => {
    const engine = approvedEngine();
    expect(
      engine.authorize(request({ approval_id: "approval:policy:1", agent_id: "OPS", path: null, command: null })),
    ).toMatchObject({ decision: "block", reason_code: "approval_agent_mismatch" });
    expect(
      engine.authorize(request({ approval_id: "approval:policy:1", project_id: "project:BloggerGent" })),
    ).toMatchObject({ decision: "block", reason_code: "approval_project_mismatch" });
    expect(
      engine.authorize(request({ approval_id: "approval:policy:1", operation_class: "deploy", command: null })),
    ).toMatchObject({ decision: "block", reason_code: "approval_operation_mismatch" });
  });

  it("never calls the Tool executor unless policy returns allow", () => {
    let executions = 0;
    const blockedGateway = new Master95GuardedToolGateway(new Master95PolicyEngine(MASTER95_DEFAULT_SANDBOX_PROFILES));
    expect(
      blockedGateway.dispatch(request(), () => {
        executions += 1;
        return "executed";
      }),
    ).toMatchObject({ executed: false, result: null });
    expect(executions).toBe(0);

    const allowedGateway = new Master95GuardedToolGateway(approvedEngine());
    expect(
      allowedGateway.dispatch(request({ approval_id: "approval:policy:1" }), () => {
        executions += 1;
        return "executed";
      }),
    ).toMatchObject({ executed: true, result: "executed" });
    expect(executions).toBe(1);
  });
});

function approvedEngine() {
  const engine = new Master95PolicyEngine(MASTER95_DEFAULT_SANDBOX_PROFILES);
  engine.requestApproval(approvalInput());
  engine.decideApproval("approval:policy:1", {
    actor_agent_id: "CONTROL",
    decision: "approved",
    decided_at: now,
    trace_id: "trace:approve",
  });
  return engine;
}

function approvalInput() {
  return {
    approval_id: "approval:policy:1",
    project_id: "project:DonggriCompany",
    requester_agent_id: "IMPLEMENT" as const,
    approver_agent_id: "CONTROL" as const,
    operation_class: "write_repo_code",
    scope: "server/modules/master95/policy-engine.ts",
    requested_at: "2026-07-14T03:00:00+09:00",
    expires_at: "2026-07-14T05:00:00+09:00",
    trace_id: "trace:approval",
    reason: "bounded policy engine implementation",
  };
}
