import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { applyOAuthRunnerIsolationSchema } from "../../bootstrap/schema/oauth-runner-isolation.ts";
import { MutationAuthorizer } from "../../control-plane/mutation-authorizer.ts";
import { SqliteMutationAuthorizerPersistence } from "../../control-plane/mutation-authorizer-sqlite.ts";
import {
  ContinuityHandoffCoordinator,
  type ContinuityHandoffFailpoint,
  type ContinuitySupervisorPort,
} from "./continuity-handoff-coordinator.ts";
import { continuityCheckpointFixture } from "./checkpoint-fixture.ts";
import { SqliteContinuityCheckpointStore } from "./checkpoint-store.ts";
import { SqliteContinuityRunLedger, type ContinuityRun } from "./run-ledger.ts";
import { ContinuityTransferService, type CreateTransferInput } from "./transfer-service.ts";

const NOW = "2026-08-28T09:00:00+09:00";
const PROJECT_ID = "project:DonggriCompany";
const TASK_ID = "task:continuity:atomic";
const PROJECT_PATH = "C:\\fixture";

function input(overrides: Partial<CreateTransferInput> = {}): CreateTransferInput {
  return {
    project_id: PROJECT_ID,
    project_path: PROJECT_PATH,
    task_id: TASK_ID,
    source_run_id: "run:source",
    source_provider: "codex",
    source_account_pool_id: "codex-pool",
    source_account_label: "untrusted source label",
    target_provider: "claude",
    target_account_pool_id: "claude-pool",
    target_account_label: "untrusted target label",
    objective: "RAW PROMPT MUST NOT ENTER RUN EVENTS",
    acceptance_criteria: ["same ownership"],
    completed: ["source paused"],
    pending: ["target start"],
    next_safe_action: "accept",
    idempotency_key: "capture:atomic",
    created_by: "IMPLEMENT",
    ...overrides,
  };
}

describe("ContinuityHandoffCoordinator", () => {
  let db: DatabaseSync;
  let store: SqliteContinuityCheckpointStore;
  let ledger: SqliteContinuityRunLedger;
  let transfer: ContinuityTransferService;
  let supervisor: ContinuitySupervisorPort;
  let pause: ReturnType<typeof vi.fn>;
  let startReserved: ReturnType<typeof vi.fn>;
  let failAt: ContinuityHandoffFailpoint | null;
  const workspace = continuityCheckpointFixture().workspace;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyBaseSchema(db);
    applyOAuthRunnerIsolationSchema(db);
    db.prepare(
      `INSERT INTO projects (id, name, project_path, core_goal)
       VALUES (?, 'Dongri', ?, 'continuity')`,
    ).run(PROJECT_ID, PROJECT_PATH);
    db.prepare(
      `INSERT INTO tasks (id, title, project_id, project_path, status)
       VALUES (?, 'Atomic continuity', ?, ?, 'in_progress')`,
    ).run(TASK_ID, PROJECT_ID, PROJECT_PATH);
    db.prepare(
      `INSERT INTO cli_account_pools (
        id, provider, account_pool_id, label, profile_home, status, last_verified_at, updated_at
      ) VALUES ('pool:claude', 'claude', 'claude-pool', 'Claude registry', 'profile:fixture', 'connected', ?, ?)`,
    ).run(Date.parse(NOW), Date.parse(NOW));
    store = new SqliteContinuityCheckpointStore(db);
    ledger = new SqliteContinuityRunLedger(db);
    ledger.reserve({
      run_id: "run:source",
      project_id: PROJECT_ID,
      task_id: TASK_ID,
      checkpoint_id: null,
      provider: "codex",
      account_pool_id: "codex-pool",
      dispatch_id: "dispatch:source",
      status: "running",
      created_at: NOW,
    });
    ledger.appendEvent({
      run_id: "run:source",
      sequence: 1,
      event_type: "runner.started",
      payload: { source: true },
      occurred_at: NOW,
    });
    transfer = new ContinuityTransferService(
      store,
      () => workspace,
      (provider, accountPoolId) => ({
        provider,
        account_pool_id: accountPoolId,
        account_label: `${provider}-authoritative`,
        state: "ready",
        observed_at: NOW,
        reason: null,
      }),
      async () => {
        throw new Error("legacy_dispatch_must_not_run");
      },
      () => NOW,
    );
    pause = vi.fn(async (runId: string) => {
      const running = ledger.get(runId)!;
      const requested = ledger.transitionWithEvent({
        run_id: runId,
        expected_state_version: running.state_version,
        expected_status: running.status,
        status: "pause_requested",
        event_type: "runner.pause_requested",
        payload: { run_id: runId },
        occurred_at: NOW,
      }).run;
      return ledger.transitionWithEvent({
        run_id: runId,
        expected_state_version: requested.state_version,
        expected_status: "pause_requested",
        status: "paused",
        event_type: "runner.pause_acknowledged",
        payload: { acknowledged: true, alive: false },
        occurred_at: NOW,
      }).run;
    });
    startReserved = vi.fn(async (runId: string, dispatchId?: string) => {
      const reserved = ledger.get(runId)!;
      expect(reserved.dispatch_id).toBe(dispatchId);
      const starting = ledger.transitionWithEvent({
        run_id: runId,
        expected_state_version: reserved.state_version,
        expected_status: "reserved",
        status: "starting",
        event_type: "runner.starting",
        payload: { dispatch_id: dispatchId },
        occurred_at: NOW,
      }).run;
      return ledger.transitionWithEvent({
        run_id: runId,
        expected_state_version: starting.state_version,
        expected_status: "starting",
        status: "running",
        event_type: "runner.running",
        payload: { dispatch_id: dispatchId },
        occurred_at: NOW,
      }).run;
    });
    supervisor = { pause, startReserved };
    failAt = null;
  });

  function coordinator(overrideSupervisor: ContinuitySupervisorPort | null = supervisor) {
    return new ContinuityHandoffCoordinator({
      db,
      store,
      ledger,
      transfer,
      supervisor: overrideSupervisor,
      collectWorkspace: () => workspace,
      readiness: (provider, accountPoolId) => ({
        provider,
        account_pool_id: accountPoolId,
        account_label: `${provider}-authoritative`,
        state: "ready",
        observed_at: NOW,
        reason: null,
      }),
      now: () => NOW,
      failpoint: (name) => {
        if (name === failAt) throw new Error(`failpoint:${name}`);
      },
    });
  }

  function reserveSource(taskId: string, runId: string) {
    ledger.reserve({
      run_id: runId,
      project_id: PROJECT_ID,
      task_id: taskId,
      checkpoint_id: null,
      provider: "codex",
      account_pool_id: "codex-pool",
      dispatch_id: `dispatch:${runId}`,
      status: "running",
      created_at: NOW,
    });
    ledger.appendEvent({
      run_id: runId,
      sequence: 1,
      event_type: "runner.started",
      payload: { source: true },
      occurred_at: NOW,
    });
  }

  async function reachApproval(flow = coordinator(), captureInput = input()) {
    const captured = await flow.capture(captureInput);
    if (captured.status === "idempotency_conflict") throw new Error("capture conflict");
    const validated = transfer.validate(captured.checkpoint.checkpoint_id, PROJECT_PATH, "validate:atomic");
    if (validated.status === "idempotency_conflict") throw new Error("validate conflict");
    const authorizer = new MutationAuthorizer({
      persistence: new SqliteMutationAuthorizerPersistence(db),
      allowed_executable_ids: ["continuity"],
      allowed_cwd_refs: [PROJECT_ID],
      now: () => new Date(NOW),
    });
    const preview = await authorizer.createPreview({
      spec_id: "spec:provider-runner-supervisor-v1",
      project_id: PROJECT_ID,
      operation: "continuity_transfer_accept",
      resolved_target: validated.checkpoint.checkpoint_id,
      scope: {
        checkpoint_id: validated.checkpoint.checkpoint_id,
        task_id: TASK_ID,
        source_run_id: "run:source",
        target_provider: "claude",
        target_account_pool_id: "claude-pool",
      },
      command: {
        executable_id: "continuity",
        args: ["accept", validated.checkpoint.checkpoint_id],
        cwd_ref: PROJECT_ID,
      },
      source_epoch: workspace.workspace_digest,
      projection_epoch: "projection:test",
      requester: "IMPLEMENT",
    });
    const receipt = await authorizer.issueApproval(preview.preview_id, "user");
    return { flow, checkpoint: validated.checkpoint, receipt };
  }

  it("rejects client source claims and requires a durable pause ACK before checkpoint capture", async () => {
    await expect(coordinator().capture(input({ source_run_id: "run:forged" }))).rejects.toThrow(
      "continuity_source_claim_mismatch",
    );
    expect(store.recent()).toHaveLength(0);

    const noAckSupervisor: ContinuitySupervisorPort = {
      pause: vi.fn(async () => ledger.get("run:source")!),
      startReserved,
    };
    await expect(coordinator(noAckSupervisor).capture(input())).rejects.toThrow(
      "continuity_source_pause_ack_required",
    );
    expect(store.recent()).toHaveLength(0);
  });

  it("derives distinct bounded summaries from authoritative task titles", async () => {
    const secondTaskId = "task:continuity:second";
    db.prepare(
      `INSERT INTO tasks (id, title, project_id, project_path, status)
       VALUES (?, 'Second continuity task', ?, ?, 'in_progress')`,
    ).run(secondTaskId, PROJECT_ID, PROJECT_PATH);
    reserveSource(secondTaskId, "run:source:second");

    const first = await coordinator().capture(input({ idempotency_key: "capture:summary:first" }));
    const second = await coordinator().capture(
      input({
        task_id: secondTaskId,
        source_run_id: "run:source:second",
        idempotency_key: "capture:summary:second",
      }),
    );
    if (first.status === "idempotency_conflict" || second.status === "idempotency_conflict") {
      throw new Error("unexpected capture conflict");
    }

    expect(first.checkpoint.objective).toContain("Atomic continuity (task:continuity:atomic)");
    expect(second.checkpoint.objective).toContain("Second continuity task (task:continuity:second)");
    expect(second.checkpoint.acceptance_criteria[0]).toContain("Second continuity task");
    expect(second.checkpoint.pending[0]).toContain("task:continuity:second");
    expect(first.checkpoint.objective).not.toBe(second.checkpoint.objective);
    expect(first.checkpoint.objective.length).toBeLessThanOrEqual(280);
    expect(second.checkpoint.objective.length).toBeLessThanOrEqual(280);
  });

  it("rejects sensitive authoritative titles, unknown target pools and unsafe idempotency keys before capture", async () => {
    const sensitiveTaskId = "task:continuity:sensitive-title";
    db.prepare(
      `INSERT INTO tasks (id, title, project_id, project_path, status)
       VALUES (?, 'oauth_token=opaque-db-title-secret', ?, ?, 'in_progress')`,
    ).run(sensitiveTaskId, PROJECT_ID, PROJECT_PATH);
    reserveSource(sensitiveTaskId, "run:source:sensitive-title");

    await expect(
      coordinator().capture(
        input({
          task_id: sensitiveTaskId,
          source_run_id: "run:source:sensitive-title",
          idempotency_key: "capture:sensitive-title",
        }),
      ),
    ).rejects.toThrow("continuity_task_title_sensitive");
    await expect(
      coordinator().capture(input({ target_account_pool_id: "missing-pool", idempotency_key: "capture:missing" })),
    ).rejects.toThrow("continuity_target_account_pool_not_found");
    await expect(
      coordinator().capture(
        input({ target_provider: "codex", target_account_pool_id: "claude-pool", idempotency_key: "capture:mismatch" }),
      ),
    ).rejects.toThrow("continuity_target_provider_mismatch");
    await expect(
      coordinator().capture(input({ idempotency_key: "RAW PROMPT oauth_token=opaque-idempotency-secret" })),
    ).rejects.toThrow("continuity_idempotency_key_invalid");
    for (const tokenShapedKey of ["sk-12345678", "ghp_12345678", "xoxb-12345678"]) {
      await expect(coordinator().capture(input({ idempotency_key: tokenShapedKey }))).rejects.toThrow(
        "continuity_idempotency_key_invalid",
      );
    }
    await expect(
      coordinator().capture(
        input({
          target_account_pool_id: "RAW PROMPT oauth_token=opaque-target-secret",
          idempotency_key: "capture:unsafe-target",
        }),
      ),
    ).rejects.toThrow("continuity_target_account_pool_id_invalid");

    expect(pause).not.toHaveBeenCalled();
    expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_checkpoints").get()).toEqual({ count: 0 });
  });

  it("lets one concurrent accept consume approval, reserve one target and request one start", async () => {
    const { flow, checkpoint, receipt } = await reachApproval();
    const request = {
      checkpoint_id: checkpoint.checkpoint_id,
      approval_ref: receipt.approval_id,
      idempotency_key: "accept:atomic",
    };
    const [first, second] = await Promise.all([flow.acceptAndStart(request), flow.acceptAndStart(request)]);
    const winner = first.status === "created" ? first : second;
    const replay = first.status === "replay" ? first : second;
    expect(winner.spawn_requested).toBe(true);
    expect(replay.spawn_requested).toBe(false);
    expect(winner.checkpoint.target_run_id).toBe(replay.checkpoint.target_run_id);
    expect(winner.checkpoint.dispatch_id).toBe(replay.checkpoint.dispatch_id);
    expect(startReserved).toHaveBeenCalledTimes(1);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM continuity_runs WHERE parent_run_id = ?").get("run:source"),
    ).toEqual({ count: 1 });
  });

  it("replays from durable IDs before supervisor, readiness or workspace gates", async () => {
    const { flow, checkpoint, receipt } = await reachApproval();
    const request = {
      checkpoint_id: checkpoint.checkpoint_id,
      approval_ref: receipt.approval_id,
      idempotency_key: "accept:fast-replay",
    };
    const winner = await flow.acceptAndStart(request);
    expect(winner.status).toBe("created");
    expect(startReserved).toHaveBeenCalledTimes(1);

    const replayPause = vi.fn(async () => {
      throw new Error("replay_pause_must_not_run");
    });
    const replayStart = vi.fn(async () => {
      throw new Error("replay_start_must_not_run");
    });
    const getReadiness = vi.fn(() => ({ ready: false, reason: "runner_supervisor_intentionally_unready" }));
    const replayCollector = vi.fn(() => {
      throw new Error("replay_collector_must_not_run");
    });
    const replayReadiness = vi.fn(() => {
      throw new Error("replay_provider_readiness_must_not_run");
    });
    const replayFlow = new ContinuityHandoffCoordinator({
      db,
      store,
      ledger,
      transfer,
      supervisor: { pause: replayPause, startReserved: replayStart, getReadiness },
      collectWorkspace: replayCollector,
      readiness: replayReadiness,
      now: () => NOW,
    });

    const replay = await replayFlow.acceptAndStart(request);
    expect(replay).toMatchObject({
      status: "replay",
      spawn_requested: false,
      checkpoint: {
        checkpoint_id: winner.checkpoint.checkpoint_id,
        target_run_id: winner.target_run.run_id,
        dispatch_id: winner.target_run.dispatch_id,
      },
      target_run: {
        run_id: winner.target_run.run_id,
        dispatch_id: winner.target_run.dispatch_id,
      },
    });
    expect(replayPause).not.toHaveBeenCalled();
    expect(replayStart).not.toHaveBeenCalled();
    expect(getReadiness).not.toHaveBeenCalled();
    expect(replayCollector).not.toHaveBeenCalled();
    expect(replayReadiness).not.toHaveBeenCalled();

    await expect(
      replayFlow.acceptAndStart({ ...request, idempotency_key: "accept:different-key" }),
    ).rejects.toThrow("runner_supervisor_intentionally_unready");
    expect(getReadiness).toHaveBeenCalledTimes(1);
    expect(replayCollector).not.toHaveBeenCalled();
    expect(replayReadiness).not.toHaveBeenCalled();
    expect(replayStart).not.toHaveBeenCalled();
    expect(startReserved).toHaveBeenCalledTimes(1);
  });

  it("fails a fast replay closed when the accepted checkpoint payload digest is corrupt", async () => {
    const { flow, checkpoint, receipt } = await reachApproval();
    const request = {
      checkpoint_id: checkpoint.checkpoint_id,
      approval_ref: receipt.approval_id,
      idempotency_key: "accept:replay-digest",
    };
    const winner = await flow.acceptAndStart(request);
    db.exec("DROP TRIGGER continuity_checkpoints_no_update");
    db.prepare("UPDATE continuity_checkpoints SET payload_json = ? WHERE checkpoint_id = ?").run(
      "{}",
      winner.checkpoint.checkpoint_id,
    );

    await expect(flow.acceptAndStart(request)).rejects.toThrow("continuity_checkpoint_digest_mismatch");
    expect(startReserved).toHaveBeenCalledTimes(1);
  });

  it("rejects a different idempotency key after the approval winner commits", async () => {
    const { flow, checkpoint, receipt } = await reachApproval();
    await flow.acceptAndStart({
      checkpoint_id: checkpoint.checkpoint_id,
      approval_ref: receipt.approval_id,
      idempotency_key: "accept:winner",
    });
    await expect(
      flow.acceptAndStart({
        checkpoint_id: checkpoint.checkpoint_id,
        approval_ref: receipt.approval_id,
        idempotency_key: "accept:loser",
      }),
    ).rejects.toThrow(/continuity_checkpoint_not_latest|continuity_accept_approval_reused/);
    expect(startReserved).toHaveBeenCalledTimes(1);
  });

  it.each([
    "after_approval_consume",
    "after_checkpoint_save",
    "after_target_reserve",
    "after_initial_event",
  ] as const)("rolls every durable acceptance effect back at %s", async (point) => {
    const { flow, checkpoint, receipt } = await reachApproval();
    failAt = point;
    await expect(
      flow.acceptAndStart({
        checkpoint_id: checkpoint.checkpoint_id,
        approval_ref: receipt.approval_id,
        idempotency_key: `accept:${point}`,
      }),
    ).rejects.toThrow(`failpoint:${point}`);
    expect(
      db.prepare("SELECT consumed_reservation_id FROM control_plane_approval_receipts WHERE approval_id = ?").get(
        receipt.approval_id,
      ),
    ).toEqual({ consumed_reservation_id: null });
    expect(db.prepare("SELECT COUNT(*) AS count FROM control_plane_idempotency_results").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM control_plane_execution_effects").get()).toEqual({ count: 0 });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM continuity_checkpoints WHERE status = 'accepted'").get(),
    ).toEqual({ count: 0 });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM continuity_runs WHERE parent_run_id = ?").get("run:source"),
    ).toEqual({ count: 0 });
    expect(startReserved).not.toHaveBeenCalled();
  });

  it("commits before start and leaves a boot-safe reservation when the process crashes at the boundary", async () => {
    const { flow, checkpoint, receipt } = await reachApproval();
    failAt = "after_commit_before_start";
    await expect(
      flow.acceptAndStart({
        checkpoint_id: checkpoint.checkpoint_id,
        approval_ref: receipt.approval_id,
        idempotency_key: "accept:crash-before-start",
      }),
    ).rejects.toThrow("failpoint:after_commit_before_start");
    const target = db
      .prepare("SELECT run_id, status FROM continuity_runs WHERE parent_run_id = ?")
      .get("run:source") as { run_id: string; status: string };
    expect(target.status).toBe("reserved");
    expect(startReserved).not.toHaveBeenCalled();
    // Boot reconciliation is state-only; this coordinator never restarts it.
    expect(coordinator().observeDispatch(ledger.get(target.run_id)!.dispatch_id).target_run.status).toBe("reserved");
    expect(startReserved).not.toHaveBeenCalled();
  });

  it("persists server-owned content and ID-only outcomes without caller free text in durable tables", async () => {
    const sentinel = "SENTINEL_RAW_PROMPT_SECRET oauth_token=opaque-coordinator-secret";
    const captureInput = input({
      source_account_label: sentinel,
      target_account_label: sentinel,
      objective: sentinel,
      acceptance_criteria: [sentinel],
      completed: [sentinel],
      pending: [sentinel],
      blockers: [sentinel],
      next_safe_action: sentinel,
      verification: [{ command: sentinel, status: "passed", summary: sentinel }],
      evidence_refs: [sentinel],
      approval_ref: sentinel,
      created_by: sentinel,
    });
    const { flow, checkpoint, receipt } = await reachApproval(coordinator(), captureInput);
    expect(checkpoint).toMatchObject({
      source_account_label: "codex-pool",
      target_account_label: "claude-authoritative",
      objective: "Continue authoritative task Atomic continuity (task:continuity:atomic) across providers",
      acceptance_criteria: ["Preserve authoritative ownership for Atomic continuity (task:continuity:atomic)"],
      completed: ["Source run pause acknowledgement verified"],
      pending: ["Resume Atomic continuity (task:continuity:atomic) on the target provider"],
      blockers: [],
      next_safe_action: "Validate target readiness for Atomic continuity (task:continuity:atomic)",
      verification: [],
      evidence_refs: [],
      approval_ref: null,
      created_by: "continuity-handoff-coordinator",
    });
    const accepted = await flow.acceptAndStart({
      checkpoint_id: checkpoint.checkpoint_id,
      approval_ref: receipt.approval_id,
      idempotency_key: "accept:sql-redaction",
    });
    const durableTables = [
      "continuity_checkpoints",
      "control_plane_idempotency_results",
      "control_plane_execution_effects",
      "control_plane_mutation_audit",
      "continuity_run_events",
    ] as const;
    for (const table of durableTables) {
      const serialized = JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all());
      expect(serialized, table).not.toContain(sentinel);
      expect(serialized, table).not.toContain("opaque-coordinator-secret");
    }

    const row = db
      .prepare("SELECT outcome_json FROM control_plane_idempotency_results WHERE idempotency_key = ?")
      .get("accept:sql-redaction") as { outcome_json: string };
    const outcome = JSON.parse(row.outcome_json) as { status: string; value: Record<string, unknown> };
    expect(outcome.status).toBe("succeeded");
    expect(Object.keys(outcome.value).sort()).toEqual([
      "checkpoint_id",
      "dispatch_id",
      "status",
      "target_run_id",
    ]);
    expect(outcome.value).toEqual({
      status: "created",
      checkpoint_id: accepted.checkpoint.checkpoint_id,
      target_run_id: accepted.target_run.run_id,
      dispatch_id: accepted.target_run.dispatch_id,
    });
    expect(row.outcome_json).not.toContain('"checkpoint":');
    expect(row.outcome_json).not.toContain('"objective":');
  });
});
