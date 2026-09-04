import type { DatabaseSync } from "node:sqlite";
import type { Express, Request, Response } from "express";

import {
  ContinuityHandoffCoordinator,
  type ContinuityHandoffCoordinatorOptions,
  type ContinuitySupervisorPort,
} from "../../workflow/continuity/continuity-handoff-coordinator.js";
import { SqliteContinuityCheckpointStore } from "../../workflow/continuity/checkpoint-store.js";
import { readProviderReadiness } from "../../workflow/continuity/provider-readiness.js";
import {
  ContinuityRealtimeProjectionService,
  type ContinuityTransitProjectionView,
} from "../../workflow/continuity/realtime-projection.js";
import { SqliteContinuityRunLedger } from "../../workflow/continuity/run-ledger.js";
import { ContinuityTransferService } from "../../workflow/continuity/transfer-service.js";
import { collectContinuityWorkspace } from "../../workflow/continuity/workspace-identity.js";

export interface ContinuityRouteOptions {
  app: Express;
  db: DatabaseSync;
  broadcast: (type: string, payload: unknown) => void;
  supervisor?: ContinuitySupervisorPort | null;
  collectWorkspace?: typeof collectContinuityWorkspace;
  now?: () => string;
  failpoint?: ContinuityHandoffCoordinatorOptions["failpoint"];
  /** Legacy test-only option. Dispatch is never called by production routes. */
  dispatch?: ConstructorParameters<typeof ContinuityTransferService>[3];
  /** Legacy test-only option. Reconciliation is observation-only in V2. */
  reconcile?: ConstructorParameters<typeof ContinuityTransferService>[6];
}

function errorResponse(error: unknown, response: Response): void {
  const message = error instanceof Error ? error.message : "continuity_request_failed";
  const status = message.includes("not_found")
    ? 404
    : message.includes("runner_supervisor_") || message.includes("provider_unavailable")
      ? 503
      : message.includes("state_invalid") ||
          message.includes("not_latest") ||
          message.includes("mismatch") ||
          message.includes("conflict") ||
          message.includes("reused") ||
          message.includes("in_flight") ||
          message.includes("pause_ack")
        ? 409
        : 400;
  response.status(status).json({ error: message });
}

function checkpointId(request: Request): string {
  return String(request.params.checkpointId ?? "").trim();
}

function numericQuery(value: unknown, fallback: number): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function registerContinuityRoutes(options: ContinuityRouteOptions): void {
  const store = new SqliteContinuityCheckpointStore(options.db);
  const ledger = new SqliteContinuityRunLedger(options.db);
  const now = options.now ?? (() => new Date().toISOString());
  const projections = new ContinuityRealtimeProjectionService(options.db, { now });
  const collectWorkspace = options.collectWorkspace ?? collectContinuityWorkspace;
  const readiness = (provider: "codex" | "claude", accountPoolId: string) =>
    readProviderReadiness(options.db, provider, accountPoolId, Date.parse(now()));
  const broadcastCheckpointSignal = (checkpoint: {
    checkpoint_id: string;
    sequence: number;
    task_id: string;
  }): ContinuityTransitProjectionView | null => {
    const signal = {
      task_id: checkpoint.task_id,
      checkpoint_id: checkpoint.checkpoint_id,
      checkpoint_sequence: checkpoint.sequence,
    };
    // Compatibility listeners receive only an invalidation signal. Never send
    // the raw checkpoint: it contains objectives, paths and account metadata.
    options.broadcast("continuity_event", signal);
    try {
      const projection = projections.forTask(checkpoint.task_id);
      if (projection) options.broadcast("continuity_run_event", projection);
      return projection;
    } catch {
      options.broadcast("continuity_event", { ...signal, projection_unavailable: true });
      return null;
    }
  };
  const requireProjection = (taskId: string): ContinuityTransitProjectionView => {
    const projection = projections.forTask(taskId);
    if (!projection) throw new Error("continuity_projection_not_found");
    return projection;
  };
  const service = new ContinuityTransferService(
    store,
    collectWorkspace,
    readiness,
    // Kept only for the old constructor shape. resume() no longer dispatches.
    options.dispatch ??
      (async (checkpoint) => ({
        ok: false,
        dispatch_id: checkpoint.dispatch_id ?? "dispatch:unreserved",
        reason: "continuity_dispatch_owned_by_supervisor",
      })),
    now,
    (checkpoint) => void broadcastCheckpointSignal(checkpoint),
    options.reconcile,
  );
  const coordinator = new ContinuityHandoffCoordinator({
    db: options.db,
    store,
    ledger,
    transfer: service,
    supervisor: options.supervisor ?? null,
    collectWorkspace,
    readiness,
    now,
    emit: (checkpoint) => void broadcastCheckpointSignal(checkpoint),
    failpoint: options.failpoint,
  });

  options.app.get("/api/continuity/projections/recent", (request, response) => {
    response.json({ projections: projections.recent(numericQuery(request.query.limit, 50)) });
  });

  options.app.get("/api/continuity/tasks/:taskId/projection", (request, response) => {
    const projection = projections.forTask(String(request.params.taskId ?? ""));
    if (!projection) {
      response.status(404).json({ error: "continuity_projection_not_found" });
      return;
    }
    response.json({ projection });
  });

  options.app.get("/api/continuity/runs/:runId/events", (request, response) => {
    const events = projections.runEvents(
      String(request.params.runId ?? ""),
      numericQuery(request.query.after_sequence, 0),
      numericQuery(request.query.limit, 200),
    );
    if (!events) {
      response.status(404).json({ error: "continuity_run_not_found" });
      return;
    }
    response.json(events);
  });

  // Safe compatibility aliases. Historical raw checkpoint payloads are no
  // longer returned from public read endpoints.
  options.app.get("/api/continuity/checkpoints/recent", (request, response) => {
    const projected = projections.recent(numericQuery(request.query.limit, 50));
    response.json({ checkpoints: projected, projections: projected, deprecated: true });
  });

  options.app.get("/api/continuity/tasks/:taskId/checkpoints", (request, response) => {
    const projection = projections.forTask(String(request.params.taskId ?? ""));
    const projected = projection ? [projection] : [];
    response.json({ checkpoints: projected, projections: projected, deprecated: true });
  });

  options.app.get("/api/continuity/tasks/:taskId/source-run", (request, response) => {
    const projectId = String(request.query.project_id ?? "").trim();
    const taskId = String(request.params.taskId ?? "").trim();
    try {
      const run = ledger.getLatestForTask(projectId, taskId, ["running", "pause_requested", "paused"]);
      if (!run) throw new Error("continuity_source_run_not_found");
      response.json({
        run: {
          run_id: run.run_id,
          project_id: run.project_id,
          task_id: run.task_id,
          provider: run.provider,
          status: run.status,
          state_version: run.state_version,
          event_sequence: run.last_event_sequence,
          heartbeat_at: run.heartbeat_at,
          updated_at: run.updated_at,
        },
      });
    } catch (error) {
      errorResponse(error, response);
    }
  });

  options.app.post("/api/continuity/checkpoints", async (request, response) => {
    try {
      const result = await coordinator.capture(request.body);
      if (result.status === "idempotency_conflict") {
        response.status(409).json({ status: result.status });
        return;
      }
      response
        .status(result.status === "created" ? 201 : 200)
        .json({ status: result.status, projection: requireProjection(result.checkpoint.task_id) });
    } catch (error) {
      errorResponse(error, response);
    }
  });

  options.app.post("/api/continuity/checkpoints/:checkpointId/validate", (request, response) => {
    try {
      const result = service.validate(
        checkpointId(request),
        String(request.body?.project_path ?? ""),
        String(request.body?.idempotency_key ?? ""),
      );
      if (result.status === "idempotency_conflict") {
        response.status(409).json({ status: result.status });
        return;
      }
      response.status(200).json({ status: result.status, projection: requireProjection(result.checkpoint.task_id) });
    } catch (error) {
      errorResponse(error, response);
    }
  });

  options.app.post("/api/continuity/checkpoints/:checkpointId/accept", async (request, response) => {
    try {
      const result = await coordinator.acceptAndStart({
        checkpoint_id: checkpointId(request),
        approval_ref: String(request.body?.approval_ref ?? ""),
        idempotency_key: String(request.body?.idempotency_key ?? ""),
      });
      const projection = requireProjection(result.checkpoint.task_id);
      response.status(200).json({
        status: result.status,
        projection,
        spawn_requested: result.spawn_requested,
      });
    } catch (error) {
      errorResponse(error, response);
    }
  });

  options.app.post("/api/continuity/checkpoints/:checkpointId/resume", async (request, response) => {
    try {
      const current = store.get(checkpointId(request));
      if (!current) throw new Error("continuity_checkpoint_not_found");
      const result = await service.resume(current.checkpoint_id, String(request.body?.idempotency_key ?? ""));
      if (result.status === "idempotency_conflict") {
        response.status(409).json({ status: result.status });
        return;
      }
      const dispatchId = result.checkpoint.dispatch_id;
      if (!dispatchId) throw new Error("continuity_dispatch_reservation_missing");
      const observed = coordinator.observeDispatch(dispatchId);
      const projection = requireProjection(observed.checkpoint.task_id);
      options.broadcast("continuity_run_event", projection);
      response.status(200).json({ status: result.status, projection, spawn_requested: false });
    } catch (error) {
      errorResponse(error, response);
    }
  });

  options.app.post("/api/continuity/dispatches/:dispatchId/reconcile", (request, response) => {
    try {
      const observed = coordinator.observeDispatch(String(request.params.dispatchId ?? ""));
      const projection = requireProjection(observed.checkpoint.task_id);
      options.broadcast("continuity_run_event", projection);
      response.status(200).json({
        status: "observed",
        projection,
        spawn_requested: false,
      });
    } catch (error) {
      errorResponse(error, response);
    }
  });
}
