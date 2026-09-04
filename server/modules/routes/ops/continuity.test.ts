import { DatabaseSync } from "node:sqlite";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { applyOAuthRunnerIsolationSchema } from "../../bootstrap/schema/oauth-runner-isolation.ts";
import { MutationAuthorizer } from "../../control-plane/mutation-authorizer.ts";
import { SqliteMutationAuthorizerPersistence } from "../../control-plane/mutation-authorizer-sqlite.ts";
import type { ContinuitySupervisorPort } from "../../workflow/continuity/continuity-handoff-coordinator.ts";
import type { ContinuityCheckpoint } from "../../workflow/continuity/checkpoint-contract.ts";
import { continuityCheckpointFixture } from "../../workflow/continuity/checkpoint-fixture.ts";
import { SqliteContinuityCheckpointStore } from "../../workflow/continuity/checkpoint-store.ts";
import { SqliteContinuityRunLedger } from "../../workflow/continuity/run-ledger.ts";
import { registerContinuityRoutes } from "./continuity.ts";

const NOW = "2026-08-28T09:00:00+09:00";
const PROJECT_ID = "project:DonggriCompany";
const TASK_ID = "task:api:atomic";
const PROJECT_PATH = "C:\\fixture";

describe("continuity routes", () => {
  let db: DatabaseSync;
  let app: express.Express;
  let ledger: SqliteContinuityRunLedger;
  let pause: ReturnType<typeof vi.fn>;
  let startReserved: ReturnType<typeof vi.fn>;
  let broadcast: ReturnType<typeof vi.fn>;
  let supervisor: ContinuitySupervisorPort;
  const workspace = continuityCheckpointFixture().workspace;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyBaseSchema(db);
    applyOAuthRunnerIsolationSchema(db);
    db.prepare("INSERT INTO projects (id, name, project_path, core_goal) VALUES (?, 'Dongri', ?, 'continuity')").run(
      PROJECT_ID,
      PROJECT_PATH,
    );
    db.prepare(
      "INSERT INTO tasks (id, title, project_id, project_path, status) VALUES (?, 'Atomic', ?, ?, 'in_progress')",
    ).run(TASK_ID, PROJECT_ID, PROJECT_PATH);
    db.prepare(
      `INSERT INTO cli_account_pools (
        id, provider, account_pool_id, label, profile_home, status, last_verified_at, updated_at
      ) VALUES ('pool:claude', 'claude', 'claude-pool', 'Claude authoritative', 'profile:fixture', 'connected', ?, ?)`,
    ).run(Date.parse(NOW), Date.parse(NOW));
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
      event_type: "runner.child_started",
      payload: { source: true },
      occurred_at: NOW,
    });
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
        event_type: "runner.child_started",
        payload: { dispatch_id: dispatchId },
        occurred_at: NOW,
      }).run;
    });
    broadcast = vi.fn();
    supervisor = { pause, startReserved };
    app = express();
    app.use(express.json());
  });

  function body(overrides: Record<string, unknown> = {}) {
    return {
      project_id: PROJECT_ID,
      project_path: PROJECT_PATH,
      task_id: TASK_ID,
      source_run_id: "run:source",
      source_provider: "codex",
      source_account_pool_id: "codex-pool",
      source_account_label: "client label",
      target_provider: "claude",
      target_account_pool_id: "claude-pool",
      target_account_label: "client target label",
      objective: "Continue without raw prompt events",
      acceptance_criteria: ["one target"],
      completed: ["paused"],
      pending: ["start"],
      next_safe_action: "accept",
      idempotency_key: "capture:route",
      created_by: "IMPLEMENT",
      ...overrides,
    };
  }

  function register(boundSupervisor: ContinuitySupervisorPort | null = supervisor) {
    registerContinuityRoutes({
      app,
      db,
      broadcast,
      supervisor: boundSupervisor,
      collectWorkspace: () => workspace,
      now: () => NOW,
    });
  }

  async function issueApproval(checkpoint: ContinuityCheckpoint) {
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
      resolved_target: checkpoint.checkpoint_id,
      scope: {
        checkpoint_id: checkpoint.checkpoint_id,
        task_id: TASK_ID,
        source_run_id: "run:source",
        target_provider: "claude",
        target_account_pool_id: "claude-pool",
      },
      command: { executable_id: "continuity", args: ["accept", checkpoint.checkpoint_id], cwd_ref: PROJECT_ID },
      source_epoch: workspace.workspace_digest,
      projection_epoch: "projection:route",
      requester: "IMPLEMENT",
    });
    return authorizer.issueApproval(preview.preview_id, "user");
  }

  async function reachApprovalRequired() {
    const created = await request(app).post("/api/continuity/checkpoints").send(body());
    expect(created.status).toBe(201);
    const validated = await request(app)
      .post(`/api/continuity/checkpoints/${created.body.projection.checkpoint_id}/validate`)
      .send({ project_path: PROJECT_PATH, idempotency_key: "validate:route" });
    expect(validated.status).toBe(200);
    expect(validated.body.projection.checkpoint_status).toBe("approval_required");
    const persisted = new SqliteContinuityCheckpointStore(db).get(validated.body.projection.checkpoint_id);
    expect(persisted).not.toBeNull();
    const receipt = await issueApproval(persisted!);
    return { checkpoint: persisted!, receipt };
  }

  it("uses server-owned source identity and dispatches exactly once at atomic accept", async () => {
    register();
    const { checkpoint, receipt } = await reachApprovalRequired();
    const acceptPath = `/api/continuity/checkpoints/${checkpoint.checkpoint_id}/accept`;
    const broadcastsBeforeAccept = broadcast.mock.calls.filter(([type]) => type === "continuity_run_event").length;
    const first = await request(app)
      .post(acceptPath)
      .send({ approval_ref: receipt.approval_id, idempotency_key: "accept:route" });
    const broadcastsAfterAccept = broadcast.mock.calls.filter(([type]) => type === "continuity_run_event").length;
    const replay = await request(app)
      .post(acceptPath)
      .send({ approval_ref: receipt.approval_id, idempotency_key: "accept:route" });
    const broadcastsAfterReplay = broadcast.mock.calls.filter(([type]) => type === "continuity_run_event").length;
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: "created", spawn_requested: true });
    expect(replay.body).toMatchObject({ status: "replay", spawn_requested: false });
    expect(replay.body.projection.target_run_id).toBe(first.body.projection.target_run_id);
    expect(broadcastsAfterAccept - broadcastsBeforeAccept).toBe(1);
    expect(broadcastsAfterReplay - broadcastsAfterAccept).toBe(0);
    expect(startReserved).toHaveBeenCalledTimes(1);

    const resume = await request(app)
      .post(`/api/continuity/checkpoints/${first.body.projection.checkpoint_id}/resume`)
      .send({ idempotency_key: "resume:observe" });
    expect(resume.body).toMatchObject({ status: "replay", spawn_requested: false });
    expect(startReserved).toHaveBeenCalledTimes(1);
  });

  it("returns explicit 409 responses for validate and legacy resume idempotency conflicts", async () => {
    register();
    const created = await request(app).post("/api/continuity/checkpoints").send(body());
    expect(created.status).toBe(201);
    const validateConflict = await request(app)
      .post(`/api/continuity/checkpoints/${created.body.projection.checkpoint_id}/validate`)
      .send({ project_path: PROJECT_PATH, idempotency_key: "capture:route" });
    expect(validateConflict.status).toBe(409);
    expect(validateConflict.body).toEqual({ status: "idempotency_conflict" });

    const legacyTaskId = "task:api:legacy-resume";
    db.prepare(
      "INSERT INTO tasks (id, title, project_id, project_path, status) VALUES (?, 'Legacy resume', ?, ?, 'in_progress')",
    ).run(legacyTaskId, PROJECT_ID, PROJECT_PATH);
    const store = new SqliteContinuityCheckpointStore(db);
    const parent = continuityCheckpointFixture({
      checkpoint_id: "checkpoint:legacy-resume:parent",
      task_id: legacyTaskId,
      source_run_id: "run:legacy-source",
      source_account_pool_id: "codex-pool",
      source_account_label: "codex-pool",
      target_account_pool_id: "claude-pool",
      target_account_label: "claude-pool",
      status: "approval_required",
      approval_ref: null,
      idempotency_key: "resume:conflict:resuming",
    });
    const accepted = continuityCheckpointFixture({
      ...parent,
      checkpoint_id: "checkpoint:legacy-resume:accepted",
      previous_checkpoint_id: parent.checkpoint_id,
      sequence: 2,
      status: "accepted",
      approval_ref: "APR-LEGACY",
      idempotency_key: "accept:legacy-resume",
    });
    expect(store.save(parent).status).toBe("created");
    expect(store.save(accepted).status).toBe("created");

    const resumeConflict = await request(app)
      .post(`/api/continuity/checkpoints/${accepted.checkpoint_id}/resume`)
      .send({ idempotency_key: "resume:conflict" });
    expect(resumeConflict.status, JSON.stringify(resumeConflict.body)).toBe(409);
    expect(resumeConflict.body).toEqual({ status: "idempotency_conflict" });
  });

  it("rejects forged source/provider/account claims before any checkpoint", async () => {
    register();
    const forged = await request(app)
      .post("/api/continuity/checkpoints")
      .send(body({ source_account_pool_id: "attacker-pool" }));
    expect(forged.status).toBe(409);
    expect(forged.body.error).toBe("continuity_source_claim_mismatch");
    expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_checkpoints").get()).toEqual({ count: 0 });
    expect(pause).not.toHaveBeenCalled();
  });

  it("fails closed when a running source has no bound Supervisor", async () => {
    register(null);
    const response = await request(app).post("/api/continuity/checkpoints").send(body());
    expect(response.status).toBe(503);
    expect(response.body.error).toBe("runner_supervisor_unbound");
    expect(db.prepare("SELECT COUNT(*) AS count FROM continuity_checkpoints").get()).toEqual({ count: 0 });
  });

  it("never invokes the legacy dispatch adapter during resume or reconcile", async () => {
    const legacyDispatch = vi.fn(async () => {
      throw new Error("must_not_run");
    });
    registerContinuityRoutes({
      app,
      db,
      broadcast,
      supervisor,
      collectWorkspace: () => workspace,
      now: () => NOW,
      dispatch: legacyDispatch,
    });
    const { checkpoint, receipt } = await reachApprovalRequired();
    const accepted = await request(app)
      .post(`/api/continuity/checkpoints/${checkpoint.checkpoint_id}/accept`)
      .send({ approval_ref: receipt.approval_id, idempotency_key: "accept:no-double-dispatch" });
    await request(app)
      .post(`/api/continuity/checkpoints/${accepted.body.projection.checkpoint_id}/resume`)
      .send({ idempotency_key: "resume:no-double-dispatch" });
    await request(app)
      .post(
        `/api/continuity/dispatches/${encodeURIComponent(ledger.get(accepted.body.projection.target_run_id)!.dispatch_id)}/reconcile`,
      )
      .send({ idempotency_key: "reconcile:no-double-dispatch" });
    expect(legacyDispatch).not.toHaveBeenCalled();
    expect(startReserved).toHaveBeenCalledTimes(1);
  });

  it("exposes only whitelist projections through REST and WebSocket broadcasts", async () => {
    register();
    const created = await request(app).post("/api/continuity/checkpoints").send(body());
    expect(created.status).toBe(201);
    expect(created.body.projection).toMatchObject({
      task_id: TASK_ID,
      checkpoint_status: "ready_for_transfer",
      source_run_id: "run:source",
      source_provider: "codex",
      target_provider: "claude",
    });

    const recent = await request(app).get("/api/continuity/projections/recent");
    const taskProjection = await request(app).get(`/api/continuity/tasks/${encodeURIComponent(TASK_ID)}/projection`);
    const legacy = await request(app).get("/api/continuity/checkpoints/recent");
    const events = await request(app).get("/api/continuity/runs/run%3Asource/events?after_sequence=0");
    const sourceRun = await request(app).get(
      `/api/continuity/tasks/${encodeURIComponent(TASK_ID)}/source-run?project_id=${encodeURIComponent(PROJECT_ID)}`,
    );

    expect(recent.body.projections).toHaveLength(1);
    expect(taskProjection.body.projection.checkpoint_id).toBe(created.body.projection.checkpoint_id);
    expect(legacy.body).toMatchObject({ deprecated: true, checkpoints: [created.body.projection] });
    expect(events.body.events).toEqual([
      {
        run_id: "run:source",
        sequence: 1,
        event_type: "runner.child_started",
        occurred_at: NOW,
      },
      {
        run_id: "run:source",
        sequence: 2,
        event_type: "runner.pause_requested",
        occurred_at: NOW,
      },
      {
        run_id: "run:source",
        sequence: 3,
        event_type: "runner.pause_acknowledged",
        occurred_at: NOW,
      },
    ]);
    expect(sourceRun.body.run).toEqual(
      expect.objectContaining({ run_id: "run:source", provider: "codex", status: "paused", event_sequence: 3 }),
    );
    expect(sourceRun.body.run).not.toHaveProperty("account_pool_id");
    expect(sourceRun.body.run).not.toHaveProperty("pid");
    expect(sourceRun.body.run).not.toHaveProperty("process_fingerprint");
    expect(broadcast).toHaveBeenCalledWith(
      "continuity_event",
      expect.objectContaining({ task_id: TASK_ID, checkpoint_sequence: 1 }),
    );
    expect(broadcast).toHaveBeenCalledWith(
      "continuity_run_event",
      expect.objectContaining({ task_id: TASK_ID, checkpoint_status: "ready_for_transfer" }),
    );

    const publicSurface = JSON.stringify({ body: created.body, broadcasts: broadcast.mock.calls });
    expect(publicSurface).not.toContain(PROJECT_PATH);
    expect(publicSurface).not.toContain("Continue without raw prompt events");
    expect(publicSurface).not.toContain("client label");
    expect(publicSurface).not.toContain("client target label");
    expect(publicSurface).not.toContain("codex-pool");
    expect(publicSurface).not.toContain("claude-pool");
    expect(publicSurface).not.toContain("process_fingerprint");
    expect(publicSurface).not.toContain("payload");
  });

  it("selects only an active source run even when a newer terminal run exists", async () => {
    register();
    ledger.reserve({
      run_id: "run:newer-terminal",
      project_id: PROJECT_ID,
      task_id: TASK_ID,
      checkpoint_id: null,
      provider: "claude",
      account_pool_id: "claude-pool",
      dispatch_id: "dispatch:newer-terminal",
      status: "completed",
      created_at: "2026-08-29T09:00:00+09:00",
    });

    const sourceRun = await request(app).get(
      `/api/continuity/tasks/${encodeURIComponent(TASK_ID)}/source-run?project_id=${encodeURIComponent(PROJECT_ID)}`,
    );
    expect(sourceRun.status).toBe(200);
    expect(sourceRun.body.run).toMatchObject({ run_id: "run:source", status: "running", provider: "codex" });
  });

  it("returns explicit not-found responses for missing projection cursors", async () => {
    register();
    expect((await request(app).get("/api/continuity/tasks/task%3Amissing/projection")).status).toBe(404);
    expect((await request(app).get("/api/continuity/runs/run%3Amissing/events")).status).toBe(404);
  });
});
