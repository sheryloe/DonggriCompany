import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  MASTER95_CONTROL_TOWER_ACTIONS,
  MASTER95_CONTROL_TOWER_JOURNEYS,
  createMaster95DurableControlTower,
  type Master95DurableControlTower,
} from "../../master95/durable-control-tower.js";

export const MASTER95_CONTROL_TOWER_APPROVAL_ID = "APR-M95-CONTROL-TOWER-DURABLE-001";
export const MASTER95_CONTROL_TOWER_CONFIRMATION = "CONFIRM_LOCAL_CONTROL_TOWER_WRITE";
const BASE = "/api/control-plane/v1/master-95/control-tower";

const NonEmpty = z.string().trim().min(1);
const JourneySchema = z
  .object({
    approval_id: z.literal(MASTER95_CONTROL_TOWER_APPROVAL_ID),
    confirm: z.literal(MASTER95_CONTROL_TOWER_CONFIRMATION),
    root_project_id: NonEmpty,
    journey_id: z.enum(MASTER95_CONTROL_TOWER_JOURNEYS),
    attempt_id: NonEmpty,
    occurred_at: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

const ActionSchema = z
  .object({
    approval_id: z.literal(MASTER95_CONTROL_TOWER_APPROVAL_ID),
    confirm: z.literal(MASTER95_CONTROL_TOWER_CONFIRMATION),
    root_project_id: NonEmpty,
    action_id: z.enum(MASTER95_CONTROL_TOWER_ACTIONS),
    attempt_id: NonEmpty,
    target_id: NonEmpty,
    value: NonEmpty.optional(),
    occurred_at: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

type Dependencies = {
  controlTower: Master95DurableControlTower;
  now: () => string;
  streamHeartbeatMs: number;
};

type StreamReason = "connected" | "journey" | "action";

type StreamClient = {
  rootProjectId: string;
  response: Response;
};

export function registerMaster95ControlTowerRoutes(app: Express, dependencies?: Partial<Dependencies>) {
  const controlTower = dependencies?.controlTower ?? createMaster95DurableControlTower();
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const streamHeartbeatMs = dependencies?.streamHeartbeatMs ?? 15_000;
  const streamClients = new Set<StreamClient>();

  const publishSnapshot = (
    rootProjectId: string,
    reason: StreamReason,
    snapshot = controlTower.snapshot(rootProjectId),
  ) => {
    const payload = formatSnapshotEvent(reason, snapshot, now());
    for (const client of streamClients) {
      if (client.rootProjectId !== rootProjectId) continue;
      try {
        client.response.write(payload);
      } catch {
        streamClients.delete(client);
      }
    }
  };

  app.get(`${BASE}/projects/:rootProjectId/state`, (req, res) => {
    respond(res, () => ({ ok: true, external_effect: false, ...controlTower.snapshot(param(req, "rootProjectId")) }));
  });

  app.get(`${BASE}/projects/:rootProjectId/events`, (req, res) => {
    const rootProjectId = param(req, "rootProjectId");
    let snapshot;
    try {
      snapshot = controlTower.snapshot(rootProjectId);
    } catch (error) {
      respond(res, () => {
        throw error;
      });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const client: StreamClient = { rootProjectId, response: res };
    streamClients.add(client);
    res.write("retry: 2000\n\n");
    res.write(formatSnapshotEvent("connected", snapshot, now()));

    const heartbeat =
      streamHeartbeatMs > 0
        ? setInterval(() => {
            try {
              res.write(`: heartbeat ${now()}\n\n`);
            } catch {
              streamClients.delete(client);
            }
          }, streamHeartbeatMs)
        : null;
    heartbeat?.unref();

    req.on("close", () => {
      if (heartbeat) clearInterval(heartbeat);
      streamClients.delete(client);
    });
  });

  app.get(`${BASE}/projects/:rootProjectId/runs/:runId`, (req, res) => {
    respond(res, () => ({
      ok: true,
      external_effect: false,
      ...controlTower.getRun(param(req, "rootProjectId"), param(req, "runId")),
    }));
  });

  app.get(`${BASE}/projects/:rootProjectId/artifacts/:artifactId`, (req, res) => {
    respond(res, () => ({
      ok: true,
      external_effect: false,
      artifact: controlTower.getArtifact(param(req, "rootProjectId"), param(req, "artifactId")),
    }));
  });

  app.post(`${BASE}/journeys`, (req, res) => {
    respond(
      res,
      () => {
        const body = JourneySchema.parse(req.body);
        const result = controlTower.runJourney({
          root_project_id: body.root_project_id,
          journey_id: body.journey_id,
          attempt_id: body.attempt_id,
          occurred_at: body.occurred_at ?? now(),
        });
        publishSnapshot(body.root_project_id, "journey", result.snapshot);
        return {
          ok: true,
          duplicate: result.duplicate,
          external_effect: false,
          process_started: false,
          published: false,
          db_written: false,
          result: result.result,
          snapshot: result.snapshot,
        };
      },
      201,
    );
  });

  app.post(`${BASE}/actions`, (req, res) => {
    respond(
      res,
      () => {
        const body = ActionSchema.parse(req.body);
        const result = controlTower.performAction({
          root_project_id: body.root_project_id,
          action_id: body.action_id,
          attempt_id: body.attempt_id,
          target_id: body.target_id,
          value: body.value,
          occurred_at: body.occurred_at ?? now(),
        });
        publishSnapshot(body.root_project_id, "action", result.snapshot);
        return {
          ok: true,
          duplicate: result.duplicate,
          external_effect: false,
          process_started: false,
          published: false,
          db_written: false,
          result: result.result,
          snapshot: result.snapshot,
        };
      },
      201,
    );
  });
}

function formatSnapshotEvent(
  reason: StreamReason,
  snapshot: ReturnType<Master95DurableControlTower["snapshot"]>,
  emittedAt: string,
) {
  return `id: ${snapshot.event_count}\nevent: snapshot\ndata: ${JSON.stringify({ reason, emitted_at: emittedAt, snapshot })}\n\n`;
}

function param(req: Request, name: string) {
  const value = req.params[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name}_required`);
  return value;
}

function respond(res: Response, action: () => unknown, successStatus = 200) {
  try {
    res.status(successStatus).json(action());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const denied = /approval|confirm|cross_project|scope_denied|not_registered|forbidden|denied/.test(message);
    const notFound = /not_found/.test(message);
    const conflict = /conflict|exists|already/.test(message);
    res.status(notFound ? 404 : denied ? 403 : conflict ? 409 : 400).json({
      ok: false,
      error: "master95_control_tower_request_failed",
      message,
      next_action: denied
        ? "승인 ID, 확인 문구, Project 범위를 확인하세요."
        : "입력과 현재 durable state를 확인한 뒤 다시 시도하세요.",
    });
  }
}
