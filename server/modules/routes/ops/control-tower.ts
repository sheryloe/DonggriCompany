import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { SseConnectionLimiter, type JournalEvent } from "../../control-plane/event-journal-writer.js";
import {
  CONTROL_TOWER_PROJECTION_BOUNDARY_EVENT_TYPE,
  Master95EventJournalControlTowerRuntime,
  createMaster95EventJournalControlTowerRuntime,
} from "../../master95/control-tower-event-journal.js";
import {
  MASTER95_CONTROL_TOWER_ACTIONS,
  MASTER95_CONTROL_TOWER_JOURNEYS,
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

export type Master95ControlTowerRuntime = Master95DurableControlTower | Master95EventJournalControlTowerRuntime;
export type Master95ControlTowerRuntimeLoader = () => Promise<Master95ControlTowerRuntime>;

type Dependencies = {
  controlTower: Master95ControlTowerRuntime;
  loadControlTower: Master95ControlTowerRuntimeLoader;
  now: () => string;
  streamHeartbeatMs: number;
  sourceEpoch: () => string;
  projectionEpoch: () => string;
  streamLimiter: SseConnectionLimiter;
};

type ControlTowerRuntime = Master95ControlTowerRuntime;

type StreamReason = "connected" | "journey" | "action" | "projection";

type StreamClient = {
  rootProjectId: string;
  response: Response;
};

export function createMaster95ControlTowerRuntimeLoader(
  sourceEpoch: () => string,
  projectionEpoch: () => string,
): Master95ControlTowerRuntimeLoader {
  let runtimePromise: Promise<Master95ControlTowerRuntime> | null = null;
  let processExitHookRegistered = false;
  return async () => {
    runtimePromise ??= createMaster95EventJournalControlTowerRuntime({
      source_epoch: sourceEpoch(),
      projection_epoch: projectionEpoch(),
    });
    const runtime = await runtimePromise;
    if (!processExitHookRegistered && runtime instanceof Master95EventJournalControlTowerRuntime) {
      processExitHookRegistered = true;
      process.once("exit", () => runtime.releaseLeaseOnProcessExit());
    }
    const currentSourceEpoch = sourceEpoch();
    if (runtime instanceof Master95EventJournalControlTowerRuntime && runtime.source_epoch !== currentSourceEpoch) {
      throw new Error(`control_tower_source_epoch_drift:${runtime.source_epoch}:${currentSourceEpoch}`);
    }
    if (runtime instanceof Master95EventJournalControlTowerRuntime) {
      await runtime.ensureProjectionEpoch(projectionEpoch());
    }
    return runtime;
  };
}

export function registerMaster95ControlTowerRoutes(app: Express, dependencies?: Partial<Dependencies>) {
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const streamHeartbeatMs = dependencies?.streamHeartbeatMs ?? 15_000;
  const sourceEpoch = dependencies?.sourceEpoch ?? (() => "source-epoch-unavailable");
  const projectionEpoch = dependencies?.projectionEpoch ?? (() => "projection-epoch-unavailable");
  const streamLimiter = dependencies?.streamLimiter ?? new SseConnectionLimiter(2, 50, streamHeartbeatMs);
  const streamClients = new Set<StreamClient>();
  const defaultLoader = createMaster95ControlTowerRuntimeLoader(sourceEpoch, projectionEpoch);
  const runtimeLoader: Master95ControlTowerRuntimeLoader = dependencies?.loadControlTower
    ? dependencies.loadControlTower
    : dependencies?.controlTower
      ? async () => dependencies.controlTower!
      : defaultLoader;

  const loadControlTower = async () => {
    const controlTower = await runtimeLoader();
    const currentSourceEpoch = sourceEpoch();
    const currentProjectionEpoch = projectionEpoch();
    if (
      controlTower instanceof Master95EventJournalControlTowerRuntime &&
      controlTower.source_epoch !== currentSourceEpoch
    ) {
      throw new Error(`control_tower_source_epoch_drift:${controlTower.source_epoch}:${currentSourceEpoch}`);
    }
    let projectionChanged = false;
    if (controlTower instanceof Master95EventJournalControlTowerRuntime) {
      projectionChanged = (await controlTower.ensureProjectionEpoch(currentProjectionEpoch)).changed;
    }
    return {
      controlTower,
      sourceEpoch: currentSourceEpoch,
      projectionEpoch: currentProjectionEpoch,
      projectionChanged,
    };
  };

  const publishSnapshot = (
    rootProjectId: string,
    reason: StreamReason,
    snapshot: ReturnType<Master95DurableControlTower["snapshot"]>,
    cursor: string,
    currentSourceEpoch: string,
    currentProjectionEpoch: string,
  ) => {
    const payload = formatSnapshotEvent(reason, snapshot, now(), currentSourceEpoch, currentProjectionEpoch, cursor);
    for (const client of streamClients) {
      if (client.rootProjectId !== rootProjectId) continue;
      try {
        client.response.write(payload);
      } catch {
        streamClients.delete(client);
      }
    }
  };

  app.get(`${BASE}/projects/:rootProjectId/state`, async (req, res) => {
    await respondAsync(res, async () => {
      const loaded = await loadControlTower();
      const snapshot = await loaded.controlTower.snapshot(param(req, "rootProjectId"));
      return {
        ok: true,
        external_effect: false,
        source_epoch: loaded.sourceEpoch,
        projection_epoch: loaded.projectionEpoch,
        snapshot_version: snapshotVersion(snapshot),
        ...snapshot,
      };
    });
  });

  app.get(`${BASE}/projects/:rootProjectId/events`, async (req, res) => {
    const rootProjectId = param(req, "rootProjectId");
    let releaseStream: (() => void) | null = null;
    let snapshot: ReturnType<Master95DurableControlTower["snapshot"]>;
    let controlTower: ControlTowerRuntime;
    let currentSourceEpoch: string;
    let currentProjectionEpoch: string;
    let cursor: string;
    let journalEvents: JournalEvent[] | null = null;
    let eventJournalRuntime: Master95EventJournalControlTowerRuntime | null = null;
    try {
      const loaded = await loadControlTower();
      controlTower = loaded.controlTower;
      currentSourceEpoch = loaded.sourceEpoch;
      currentProjectionEpoch = loaded.projectionEpoch;
      snapshot = await controlTower.snapshot(rootProjectId);
      if (controlTower instanceof Master95EventJournalControlTowerRuntime) {
        eventJournalRuntime = controlTower;
        journalEvents = await controlTower.journalEvents();
        cursor = await controlTower.journalCursor();
      } else {
        cursor = String(snapshot.event_count);
      }
      releaseStream = streamLimiter.acquire(streamSessionId(req));
    } catch (error) {
      if (error instanceof Error && /sse_(session|process)_connection_limit/.test(error.message)) {
        res.status(429).json({
          ok: false,
          error: "sse_connection_limit",
          message: error.message,
          retry_after_seconds: 15,
        });
        return;
      }
      await respondAsync(res, async () => {
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
    const emittedAt = now();
    const lastEventId = header(req, "last-event-id");
    const version = snapshotVersion(snapshot);
    if (journalEvents && eventJournalRuntime) {
      const resume = await eventJournalRuntime.resolveResume(lastEventId, version);
      if (resume.kind === "reset") {
        res.write(
          formatResetEvent(
            snapshot,
            emittedAt,
            currentSourceEpoch,
            currentProjectionEpoch,
            resume.event.reason,
            resume.event.cursor,
          ),
        );
      } else if (lastEventId) {
        for (const event of resume.events) {
          if (event.type === CONTROL_TOWER_PROJECTION_BOUNDARY_EVENT_TYPE) {
            res.write(
              formatProjectionBoundaryResetEvent(
                event,
                snapshot,
                emittedAt,
                currentSourceEpoch,
                currentProjectionEpoch,
              ),
            );
            continue;
          }
          if (controlTowerRootProjectId(event) !== rootProjectId) continue;
          res.write(formatJournalEvent(event, currentSourceEpoch, currentProjectionEpoch, version));
        }
      }
    } else if (lastEventId && (!/^(0|[1-9]\d*)$/.test(lastEventId) || Number(lastEventId) !== Number(cursor))) {
      const reason = !/^(0|[1-9]\d*)$/.test(lastEventId)
        ? "cursor_invalid"
        : Number(lastEventId) > Number(cursor)
          ? "cursor_ahead"
          : "cursor_expired";
      res.write(formatResetEvent(snapshot, emittedAt, currentSourceEpoch, currentProjectionEpoch, reason, cursor));
    }
    res.write(
      formatSnapshotEvent("connected", snapshot, emittedAt, currentSourceEpoch, currentProjectionEpoch, cursor),
    );

    const heartbeat =
      streamHeartbeatMs > 0
        ? setInterval(() => {
            void (async () => {
              try {
                const latestSourceEpoch = sourceEpoch();
                if (latestSourceEpoch !== currentSourceEpoch) {
                  throw new Error(`control_tower_source_epoch_drift:${currentSourceEpoch}:${latestSourceEpoch}`);
                }
                const latestProjectionEpoch = projectionEpoch();
                if (latestProjectionEpoch !== currentProjectionEpoch) {
                  if (eventJournalRuntime) {
                    await eventJournalRuntime.ensureProjectionEpoch(latestProjectionEpoch);
                  }
                  currentProjectionEpoch = latestProjectionEpoch;
                  snapshot = await controlTower.snapshot(rootProjectId);
                  cursor = await controlTowerCursor(controlTower, snapshot);
                  res.write(
                    formatResetEvent(
                      snapshot,
                      now(),
                      currentSourceEpoch,
                      currentProjectionEpoch,
                      "projection_changed",
                      cursor,
                    ),
                  );
                  res.write(
                    formatSnapshotEvent(
                      "projection",
                      snapshot,
                      now(),
                      currentSourceEpoch,
                      currentProjectionEpoch,
                      cursor,
                    ),
                  );
                }
                res.write(`: heartbeat ${now()}\n\n`);
              } catch {
                streamClients.delete(client);
                releaseStream?.();
                releaseStream = null;
              }
            })();
          }, streamHeartbeatMs)
        : null;
    heartbeat?.unref();

    req.on("close", () => {
      if (heartbeat) clearInterval(heartbeat);
      streamClients.delete(client);
      releaseStream?.();
      releaseStream = null;
    });
  });

  app.get(`${BASE}/projects/:rootProjectId/runs/:runId`, async (req, res) => {
    await respondAsync(res, async () => {
      const loaded = await loadControlTower();
      return {
        ok: true,
        external_effect: false,
        ...(await loaded.controlTower.getRun(param(req, "rootProjectId"), param(req, "runId"))),
      };
    });
  });

  app.get(`${BASE}/projects/:rootProjectId/artifacts/:artifactId`, async (req, res) => {
    await respondAsync(res, async () => {
      const loaded = await loadControlTower();
      return {
        ok: true,
        external_effect: false,
        artifact: await loaded.controlTower.getArtifact(param(req, "rootProjectId"), param(req, "artifactId")),
      };
    });
  });

  app.post(`${BASE}/journeys`, async (req, res) => {
    await respondAsync(
      res,
      async () => {
        const body = JourneySchema.parse(req.body);
        const loaded = await loadControlTower();
        const result = await loaded.controlTower.runJourney({
          root_project_id: body.root_project_id,
          journey_id: body.journey_id,
          attempt_id: body.attempt_id,
          occurred_at: body.occurred_at ?? now(),
        });
        const cursor = await controlTowerCursor(loaded.controlTower, result.snapshot);
        publishSnapshot(
          body.root_project_id,
          "journey",
          result.snapshot,
          cursor,
          loaded.sourceEpoch,
          loaded.projectionEpoch,
        );
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

  app.post(`${BASE}/actions`, async (req, res) => {
    await respondAsync(
      res,
      async () => {
        const body = ActionSchema.parse(req.body);
        const loaded = await loadControlTower();
        const result = await loaded.controlTower.performAction({
          root_project_id: body.root_project_id,
          action_id: body.action_id,
          attempt_id: body.attempt_id,
          target_id: body.target_id,
          value: body.value,
          occurred_at: body.occurred_at ?? now(),
        });
        const cursor = await controlTowerCursor(loaded.controlTower, result.snapshot);
        publishSnapshot(
          body.root_project_id,
          "action",
          result.snapshot,
          cursor,
          loaded.sourceEpoch,
          loaded.projectionEpoch,
        );
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
  sourceEpoch: string,
  projectionEpoch: string,
  cursor = String(snapshot.event_count),
) {
  return `id: ${cursor}\nevent: snapshot\ndata: ${JSON.stringify({
    reason,
    emitted_at: emittedAt,
    cursor,
    snapshot_version: snapshotVersion(snapshot),
    source_epoch: sourceEpoch,
    projection_epoch: projectionEpoch,
    snapshot,
  })}\n\n`;
}

function formatResetEvent(
  snapshot: ReturnType<Master95DurableControlTower["snapshot"]>,
  emittedAt: string,
  sourceEpoch: string,
  projectionEpoch: string,
  reason: "cursor_invalid" | "cursor_expired" | "cursor_ahead" | "projection_changed",
  cursor = String(snapshot.event_count),
) {
  return `id: ${cursor}\nevent: reset\ndata: ${JSON.stringify({
    reason,
    emitted_at: emittedAt,
    cursor,
    snapshot_version: snapshotVersion(snapshot),
    source_epoch: sourceEpoch,
    projection_epoch: projectionEpoch,
  })}\n\n`;
}

function formatProjectionBoundaryResetEvent(
  event: JournalEvent,
  snapshot: ReturnType<Master95DurableControlTower["snapshot"]>,
  emittedAt: string,
  sourceEpoch: string,
  currentProjectionEpoch: string,
) {
  const projectionEpoch = event.projection_epoch ?? currentProjectionEpoch;
  return formatResetEvent(snapshot, emittedAt, sourceEpoch, projectionEpoch, "projection_changed", event.cursor);
}

function formatJournalEvent(
  event: JournalEvent,
  sourceEpoch: string,
  currentProjectionEpoch: string,
  snapshotVersionValue: string,
) {
  return `id: ${event.cursor}\nevent: journal\ndata: ${JSON.stringify({
    cursor: event.cursor,
    sequence: event.sequence,
    event_version: event.event_version,
    candidate_id: event.candidate_id,
    source_epoch: sourceEpoch,
    projection_epoch: event.projection_epoch ?? currentProjectionEpoch,
    previous_hash: event.previous_hash,
    event_hash: event.event_hash,
    writer_instance_id: event.writer_instance_id,
    occurred_at: event.occurred_at,
    snapshot_version: snapshotVersionValue,
    event: event.payload,
  })}\n\n`;
}

function snapshotVersion(snapshot: ReturnType<Master95DurableControlTower["snapshot"]>) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")}`;
}

function controlTowerRootProjectId(event: JournalEvent): string | null {
  if (!event.payload || typeof event.payload !== "object") return null;
  const rootProjectId = (event.payload as Record<string, unknown>).root_project_id;
  return typeof rootProjectId === "string" ? rootProjectId : null;
}

async function controlTowerCursor(
  controlTower: ControlTowerRuntime,
  snapshot: ReturnType<Master95DurableControlTower["snapshot"]>,
) {
  return controlTower instanceof Master95EventJournalControlTowerRuntime
    ? controlTower.journalCursor()
    : String(snapshot.event_count);
}

function header(req: Request, name: string): string | undefined {
  const value = typeof req.header === "function" ? req.header(name) : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function streamSessionId(req: Request) {
  const proof =
    header(req, "authorization") ?? header(req, "cookie") ?? req.ip ?? req.socket?.remoteAddress ?? "local-session";
  return crypto.createHash("sha256").update(proof).digest("hex");
}

function param(req: Request, name: string) {
  const value = req.params[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name}_required`);
  return value;
}

async function respondAsync(res: Response, action: () => Promise<unknown>, successStatus = 200) {
  try {
    res.status(successStatus).json(await action());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const denied = /approval|confirm|cross_project|scope_denied|not_registered|forbidden|denied/.test(message);
    const notFound = /not_found/.test(message);
    const conflict = /conflict|exists|already/.test(message);
    const unavailable = /journal|source_epoch_drift|runtime_closed|lease/.test(message);
    res.status(notFound ? 404 : denied ? 403 : conflict ? 409 : unavailable ? 503 : 400).json({
      ok: false,
      error: "master95_control_tower_request_failed",
      message,
      next_action: denied
        ? "승인 ID, 확인 문구, Project 범위를 확인하세요."
        : "입력과 현재 durable state를 확인한 뒤 다시 시도하세요.",
    });
  }
}
