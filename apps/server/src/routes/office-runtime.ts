import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { setTimeout as wait } from "node:timers/promises";

import { OfficeRuntimeStoreService } from "@workspace/db";
import type {
  AddBossCommandMessageRequest,
  AddBossCommandMessageResponse,
  BossCommandThreadView,
  CreateBossCommandThreadRequest,
  CreateBossCommandThreadResponse,
  OfficeCommandRequest,
  OfficeCommandResponse,
  OfficeEventLogView,
  OfficeFacingDir,
  OfficeKpiView,
  OfficeLogsResponse,
  OfficeLoopEvent,
  OfficeLoopState,
  OfficeRealtimeEvent,
  OfficeRuntimeActorView,
  OfficeRuntimeStateResponse,
  OfficeRuntimeStateView,
  OfficeSimSpeed,
  OfficeThreadsResponse,
  UpdateBossCommandThreadStatusRequest,
  UpdateBossCommandThreadStatusResponse
} from "@workspace/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { badRequest } from "../errors.js";

const commandSchema = z.object({
  command: z.enum([
    "runProbe",
    "refreshHistory",
    "setSimSpeed",
    "pauseSim",
    "resumeSim",
    "resetSimulation",
    "probeError",
    "probeRecovered"
  ]),
  speed: z.enum(["1x", "2x", "4x"]).optional(),
  detail: z.string().optional(),
  phase: z.enum(["pending", "committed", "rejected"]).optional()
});

const createThreadSchema = z.object({
  recipient: z.enum(["pm", "router", "runtime", "probe", "history"]),
  summary: z.string().min(1),
  body: z.string().min(1)
});

const addMessageSchema = z.object({
  sender: z.enum(["pm", "router", "runtime", "probe", "history"]),
  body: z.string().min(1)
});

const patchStatusSchema = z.object({
  status: z.enum(["draft", "sent", "acknowledged", "feedback", "closed"])
});

const toActorInitialState = (): OfficeRuntimeActorView[] => [
  {
    id: "actor-main",
    role: "main-agent",
    fsmState: "idle",
    facing: "right",
    tile: { x: 15, y: 9 },
    path: [],
    taskId: null,
    eta: 0
  },
  {
    id: "actor-router",
    role: "router",
    fsmState: "idle",
    facing: "right",
    tile: { x: 12, y: 7 },
    path: [],
    taskId: null,
    eta: 0
  },
  {
    id: "actor-runtime",
    role: "runtime",
    fsmState: "idle",
    facing: "right",
    tile: { x: 12, y: 12 },
    path: [],
    taskId: null,
    eta: 0
  },
  {
    id: "actor-probe",
    role: "probe",
    fsmState: "idle",
    facing: "right",
    tile: { x: 15, y: 7 },
    path: [],
    taskId: null,
    eta: 0
  },
  {
    id: "actor-history",
    role: "history",
    fsmState: "idle",
    facing: "right",
    tile: { x: 17, y: 12 },
    path: [],
    taskId: null,
    eta: 0
  },
  {
    id: "actor-pm",
    role: "pm-liaison",
    fsmState: "idle",
    facing: "left",
    tile: { x: 18, y: 9 },
    path: [],
    taskId: null,
    eta: 0
  }
];

const mainPhaseDurations: Record<
  Exclude<OfficeLoopState, "idle" | "blocked">,
  number
> = {
  moving_to_task: 3,
  working: 5,
  moving_to_pm: 3,
  reporting: 3,
  waiting_review: 2
};

const speedToTickMs: Record<OfficeSimSpeed, number> = {
  "1x": 600,
  "2x": 360,
  "4x": 220
};

const lcgNext = (seed: number): number => {
  return (seed * 1103515245 + 12345) % 2147483647;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const getKpiFromState = (state: OfficeRuntimeStateView): OfficeKpiView => {
  const values = Object.values(state.agentLoadById);
  const avg =
    values.length === 0
      ? 0
      : values.reduce((sum, current) => sum + current, 0) / values.length;

  const slaRisk =
    state.loopState === "blocked" || state.jobQueue > 14
      ? "high"
      : state.jobQueue > 8
        ? "medium"
        : "low";

  return {
    throughput: clamp(
      Math.floor(state.completedJobs / Math.max(1, state.tick / 16)),
      0,
      999
    ),
    queueDepth: state.jobQueue,
    slaRisk,
    probeConfidence: state.loopState === "blocked" ? "low" : "high",
    avgAgentLoad: Number(avg.toFixed(1))
  };
};

const createInitialRuntimeState = (
  simSpeed: OfficeSimSpeed = "1x"
): OfficeRuntimeStateView => {
  const base: OfficeRuntimeStateView = {
    tick: 0,
    seed: 271_828,
    simSpeed,
    isPaused: false,
    loopState: "idle",
    phaseTicks: 0,
    jobQueue: 4,
    completedJobs: 0,
    pmReports: 0,
    lastLoopEvent: null,
    agentLoadById: {
      "actor-main": 0,
      "actor-router": 0,
      "actor-runtime": 0,
      "actor-probe": 0,
      "actor-history": 0,
      "actor-pm": 0
    },
    actors: toActorInitialState(),
    kpi: {
      throughput: 0,
      queueDepth: 4,
      slaRisk: "low",
      probeConfidence: "none",
      avgAgentLoad: 0
    },
    updatedAt: new Date().toISOString()
  };
  return {
    ...base,
    kpi: getKpiFromState(base)
  };
};

const getNextFacing = (
  fromX: number,
  toX: number,
  current: OfficeFacingDir
): OfficeFacingDir => {
  if (toX > fromX) {
    return "right";
  }
  if (toX < fromX) {
    return "left";
  }
  return current;
};

const routeByRole: Record<
  string,
  Array<{ x: number; y: number }>
> = {
  router: [
    { x: 12, y: 6 },
    { x: 12, y: 8 },
    { x: 10, y: 8 },
    { x: 10, y: 6 }
  ],
  runtime: [
    { x: 12, y: 12 },
    { x: 10, y: 12 }
  ],
  probe: [
    { x: 14, y: 6 },
    { x: 16, y: 6 },
    { x: 16, y: 8 },
    { x: 14, y: 8 }
  ],
  history: [{ x: 17, y: 12 }],
  "pm-liaison": [
    { x: 18, y: 9 },
    { x: 20, y: 9 }
  ]
};

const resolveNpcState = (
  role: string,
  loopState: OfficeLoopState,
  tick: number
): OfficeLoopState => {
  if (loopState === "blocked") {
    return "blocked";
  }
  if (role === "pm-liaison") {
    if (loopState === "reporting") {
      return "reporting";
    }
    if (loopState === "waiting_review") {
      return "waiting_review";
    }
    return "idle";
  }
  if (role === "runtime" || role === "history") {
    if (loopState === "working") {
      return "working";
    }
    if (loopState === "reporting" || loopState === "waiting_review") {
      return "waiting_review";
    }
    return "idle";
  }
  const phase = tick % 6;
  if (phase <= 1) {
    return "moving_to_task";
  }
  if (phase <= 3) {
    return "working";
  }
  if (phase === 4) {
    return "moving_to_pm";
  }
  return "reporting";
};

const updateActors = (
  previousActors: OfficeRuntimeActorView[],
  loopState: OfficeLoopState,
  phaseTicks: number,
  tick: number
): OfficeRuntimeActorView[] => {
  return previousActors.map((actor, index) => {
    if (actor.role === "main-agent") {
      return {
        ...actor,
        fsmState: loopState,
        taskId: loopState === "working" ? `job-${Math.floor(tick / 4)}-main` : null,
        eta:
          loopState === "working"
            ? Math.max(1, mainPhaseDurations.working - phaseTicks)
            : 0
      };
    }

    const route = routeByRole[actor.role] ?? [actor.tile];
    const nextTile = route[Math.floor((tick + index * 2) / 3) % route.length] ?? actor.tile;
    const nextState = resolveNpcState(actor.role, loopState, tick + index * 2);
    return {
      ...actor,
      fsmState: nextState,
      facing: getNextFacing(actor.tile.x, nextTile.x, actor.facing),
      tile: { x: nextTile.x, y: nextTile.y },
      taskId:
        nextState === "working" ? `job-${Math.floor(tick / 5)}-${actor.role}` : null,
      eta: nextState === "working" ? 2 : 0
    };
  });
};

const advanceMainLoop = (
  loopState: OfficeLoopState,
  phaseTicks: number
): { loopState: OfficeLoopState; phaseTicks: number; transitioned: boolean } => {
  if (loopState === "idle" || loopState === "blocked") {
    return { loopState, phaseTicks: 0, transitioned: false };
  }

  const nextTicks = phaseTicks + 1;
  const threshold = mainPhaseDurations[loopState];
  if (nextTicks < threshold) {
    return { loopState, phaseTicks: nextTicks, transitioned: false };
  }
  if (loopState === "moving_to_task") {
    return { loopState: "working", phaseTicks: 0, transitioned: true };
  }
  if (loopState === "working") {
    return { loopState: "moving_to_pm", phaseTicks: 0, transitioned: true };
  }
  if (loopState === "moving_to_pm") {
    return { loopState: "reporting", phaseTicks: 0, transitioned: true };
  }
  if (loopState === "reporting") {
    return { loopState: "waiting_review", phaseTicks: 0, transitioned: true };
  }
  return { loopState: "idle", phaseTicks: 0, transitioned: true };
};

class OfficeRealtimeHub {
  private readonly clients = new Set<ServerResponse>();
  private readonly batched = new Map<
    OfficeRealtimeEvent["type"],
    { queue: unknown[]; timer: NodeJS.Timeout }
  >();
  private sequence = 0;
  private readonly batchIntervalMs: Partial<Record<OfficeRealtimeEvent["type"], number>> = {
    "runtime.state": 240
  };
  private readonly maxBatchQueue = 60;

  addClient(response: ServerResponse): () => void {
    this.clients.add(response);
    return () => {
      this.clients.delete(response);
    };
  }

  closeAll(): void {
    for (const entry of this.batched.values()) {
      clearTimeout(entry.timer);
    }
    this.batched.clear();
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // no-op
      }
    }
    this.clients.clear();
  }

  broadcast(type: OfficeRealtimeEvent["type"], payload: unknown): void {
    const interval = this.batchIntervalMs[type];
    if (!interval) {
      this.send(type, payload);
      return;
    }

    const existing = this.batched.get(type);
    if (existing) {
      if (existing.queue.length >= this.maxBatchQueue) {
        existing.queue.shift();
      }
      existing.queue.push(payload);
      return;
    }

    this.send(type, payload);
    const entry = {
      queue: [] as unknown[],
      timer: setTimeout(() => {
        const pending = entry.queue.splice(0);
        this.batched.delete(type);
        for (const item of pending) {
          this.send(type, item);
        }
      }, interval)
    };
    this.batched.set(type, entry);
  }

  private send(type: OfficeRealtimeEvent["type"], payload: unknown): void {
    const event = {
      id: `evt-${++this.sequence}`,
      type,
      ts: Date.now(),
      payload
    } as OfficeRealtimeEvent;

    const serialized = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(serialized);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}

class OfficeRuntimeService {
  private readonly store = new OfficeRuntimeStoreService();
  private readonly hub = new OfficeRealtimeHub();
  private runtimeState: OfficeRuntimeStateView = createInitialRuntimeState();
  private tickTimer: NodeJS.Timeout | null = null;
  private hydrationReady = false;

  async initialize(): Promise<void> {
    if (this.hydrationReady) {
      return;
    }
    const loadedState = this.store.loadRuntimeState();
    if (loadedState) {
      this.runtimeState = {
        ...loadedState,
        kpi: getKpiFromState(loadedState)
      };
    } else {
      this.persistRuntimeState();
    }
    this.hydrationReady = true;
    this.scheduleTick();
  }

  shutdown(): void {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    this.hub.closeAll();
  }

  getState(): OfficeRuntimeStateView {
    return this.runtimeState;
  }

  listLogs(limit: number): OfficeEventLogView[] {
    return this.store.listLogs(limit);
  }

  listThreads(): BossCommandThreadView[] {
    return this.store.listThreads();
  }

  createThread(input: CreateBossCommandThreadRequest): BossCommandThreadView {
    const thread = this.store.createThread(input);
    this.hub.broadcast("thread.upserted", thread);
    this.appendSystemLog(
      `boss thread created for ${thread.recipient}: ${thread.summary}`,
      "boss"
    );
    return thread;
  }

  appendThreadMessage(
    threadId: string,
    input: AddBossCommandMessageRequest
  ): BossCommandThreadView {
    const thread = this.store.appendThreadMessage(threadId, input);
    this.hub.broadcast("thread.upserted", thread);
    this.appendSystemLog(
      `${input.sender} feedback appended`,
      `actor-${input.sender}`
    );
    return thread;
  }

  updateThreadStatus(
    threadId: string,
    input: UpdateBossCommandThreadStatusRequest
  ): BossCommandThreadView {
    const thread = this.store.updateThreadStatus(threadId, input);
    this.hub.broadcast("thread.upserted", thread);
    this.appendSystemLog(`thread status changed: ${thread.status}`, "boss");
    return thread;
  }

  dispatchCommand(payload: OfficeCommandRequest): OfficeCommandResponse {
    const parsed = commandSchema.safeParse(payload);
    if (!parsed.success) {
      throw badRequest(
        parsed.error.issues[0]?.message ?? "Invalid office runtime command payload"
      );
    }

    const nextEvent: OfficeLoopEvent = {
      type: parsed.data.command,
      atTick: this.runtimeState.tick,
      source: "hud",
      phase: parsed.data.phase ?? "committed",
      detail: parsed.data.detail
    };

    this.runtimeState = this.applyCommand(this.runtimeState, nextEvent, parsed.data.speed);
    this.persistRuntimeState();
    this.hub.broadcast("runtime.state", this.runtimeState);

    const logCategory =
      nextEvent.phase === "rejected"
        ? "error"
        : nextEvent.type === "runProbe" || nextEvent.type === "refreshHistory"
          ? "system"
          : "validation";
    const log = this.store.appendLog({
      tick: this.runtimeState.tick,
      category: logCategory,
      message: `HUD ${nextEvent.phase}: ${nextEvent.type}${nextEvent.detail ? ` ${nextEvent.detail}` : ""}`,
      actorId: "boss",
      speaker: "Boss"
    });
    this.hub.broadcast("log.appended", log);

    if (
      nextEvent.type === "setSimSpeed" ||
      nextEvent.type === "pauseSim" ||
      nextEvent.type === "resumeSim"
    ) {
      this.scheduleTick();
    }

    return {
      ok: true,
      state: this.runtimeState,
      event: nextEvent
    };
  }

  attachSseClient(reply: FastifyReply): void {
    const raw = reply.raw;
    raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    raw.setHeader("Cache-Control", "no-cache, no-transform");
    raw.setHeader("Connection", "keep-alive");
    raw.flushHeaders?.();
    raw.write("retry: 2000\n\n");

    const detach = this.hub.addClient(raw);
    const heartbeatTimer = setInterval(() => {
      try {
        raw.write(`data: ${JSON.stringify({ id: randomUUID(), type: "heartbeat", ts: Date.now(), payload: { tick: this.runtimeState.tick } })}\n\n`);
      } catch {
        // ignore
      }
    }, 12000);

    const cleanup = (): void => {
      clearInterval(heartbeatTimer);
      detach();
    };
    raw.on("close", cleanup);
    raw.on("error", cleanup);
    this.hub.broadcast("runtime.state", this.runtimeState);
  }

  private scheduleTick(): void {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }

    const delayMs = speedToTickMs[this.runtimeState.simSpeed];
    this.tickTimer = setTimeout(async () => {
      this.tickTimer = null;
      if (!this.runtimeState.isPaused) {
        this.runTick();
      }
      await wait(0);
      this.scheduleTick();
    }, delayMs);
  }

  private runTick(): void {
    const previous = this.runtimeState;
    const tick = previous.tick + 1;
    const seed = lcgNext(previous.seed);
    const nextLoop = advanceMainLoop(previous.loopState, previous.phaseTicks);
    const didComplete =
      previous.loopState === "reporting" && nextLoop.loopState === "waiting_review";
    const queueNoise = (seed % 5) - 2;
    const queueBias =
      nextLoop.loopState === "blocked"
        ? 2
        : nextLoop.loopState === "moving_to_task"
          ? 1
          : nextLoop.loopState === "working"
            ? -1
            : nextLoop.loopState === "reporting" ||
                nextLoop.loopState === "waiting_review"
              ? -1
              : 0;
    const jobQueue = clamp(previous.jobQueue + queueNoise + queueBias, 0, 30);
    const completedJobs = previous.completedJobs + (didComplete ? 1 : 0);
    const pmReports = previous.pmReports + (didComplete ? 1 : 0);
    const agentLoadById = Object.fromEntries(
      Object.entries(previous.agentLoadById).map(([key, value], index) => {
        const drift = ((seed >> index) & 3) - 1;
        const loopBias =
          nextLoop.loopState === "working"
            ? 1
            : nextLoop.loopState === "blocked"
              ? 2
              : 0;
        return [key, clamp(value + drift + loopBias, 0, 100)];
      })
    ) as Record<string, number>;
    const lastLoopEvent: OfficeLoopEvent = {
      type: "tick",
      atTick: tick,
      source: "system",
      phase: "committed",
      detail: nextLoop.transitioned
        ? `${previous.loopState}->${nextLoop.loopState}`
        : nextLoop.loopState
    };

    const nextState: OfficeRuntimeStateView = {
      ...previous,
      tick,
      seed,
      loopState: nextLoop.loopState,
      phaseTicks: nextLoop.phaseTicks,
      jobQueue,
      completedJobs,
      pmReports,
      lastLoopEvent,
      agentLoadById,
      actors: updateActors(previous.actors, nextLoop.loopState, nextLoop.phaseTicks, tick),
      updatedAt: new Date().toISOString(),
      kpi: previous.kpi
    };

    this.runtimeState = {
      ...nextState,
      kpi: getKpiFromState(nextState)
    };
    this.persistRuntimeState();
    this.hub.broadcast("runtime.state", this.runtimeState);

    if (tick % 3 === 0 || nextLoop.transitioned) {
      const log = this.store.appendLog({
        tick,
        category:
          nextLoop.loopState === "blocked"
            ? "error"
            : nextLoop.transitioned
              ? "validation"
              : "agent",
        message: `[office] loop=${nextLoop.loopState} queue=${jobQueue} reports=${pmReports}`,
        actorId: "actor-main",
        speaker: "Office Runtime"
      });
      this.hub.broadcast("log.appended", log);
    }
  }

  private appendSystemLog(message: string, actorId: string): void {
    const log = this.store.appendLog({
      tick: this.runtimeState.tick,
      category: "system",
      message,
      actorId,
      speaker: "Office Runtime"
    });
    this.hub.broadcast("log.appended", log);
  }

  private applyCommand(
    state: OfficeRuntimeStateView,
    event: OfficeLoopEvent,
    speed?: OfficeSimSpeed
  ): OfficeRuntimeStateView {
    if (event.phase !== "committed") {
      return {
        ...state,
        lastLoopEvent: event,
        updatedAt: new Date().toISOString()
      };
    }

    if (event.type === "pauseSim") {
      return {
        ...state,
        isPaused: true,
        lastLoopEvent: event,
        updatedAt: new Date().toISOString()
      };
    }
    if (event.type === "resumeSim") {
      return {
        ...state,
        isPaused: false,
        lastLoopEvent: event,
        updatedAt: new Date().toISOString()
      };
    }
    if (event.type === "setSimSpeed" && speed) {
      return {
        ...state,
        simSpeed: speed,
        lastLoopEvent: event,
        updatedAt: new Date().toISOString()
      };
    }
    if (event.type === "runProbe") {
      const blocked = event.detail?.includes("blocked");
      const loopState: OfficeLoopState = blocked ? "blocked" : "moving_to_task";
      const nextState: OfficeRuntimeStateView = {
        ...state,
        loopState,
        phaseTicks: 0,
        lastLoopEvent: event,
        updatedAt: new Date().toISOString(),
        actors: updateActors(state.actors, loopState, 0, state.tick),
        kpi: state.kpi
      };
      return {
        ...nextState,
        kpi: getKpiFromState(nextState)
      };
    }
    if (event.type === "refreshHistory") {
      const shouldReset =
        state.loopState === "reporting" || state.loopState === "waiting_review";
      const loopState = shouldReset ? "idle" : state.loopState;
      const phaseTicks = shouldReset ? 0 : state.phaseTicks;
      const nextState: OfficeRuntimeStateView = {
        ...state,
        loopState,
        phaseTicks,
        lastLoopEvent: event,
        updatedAt: new Date().toISOString(),
        actors: updateActors(state.actors, loopState, phaseTicks, state.tick),
        kpi: state.kpi
      };
      return {
        ...nextState,
        kpi: getKpiFromState(nextState)
      };
    }
    if (event.type === "resetSimulation") {
      const base = createInitialRuntimeState(state.simSpeed);
      return {
        ...base,
        lastLoopEvent: event
      };
    }
    if (event.type === "probeError") {
      const nextState: OfficeRuntimeStateView = {
        ...state,
        loopState: "blocked",
        phaseTicks: 0,
        lastLoopEvent: event,
        updatedAt: new Date().toISOString(),
        actors: updateActors(state.actors, "blocked", 0, state.tick),
        kpi: state.kpi
      };
      return {
        ...nextState,
        kpi: getKpiFromState(nextState)
      };
    }
    if (event.type === "probeRecovered") {
      const nextState: OfficeRuntimeStateView = {
        ...state,
        loopState: "idle",
        phaseTicks: 0,
        lastLoopEvent: event,
        updatedAt: new Date().toISOString(),
        actors: updateActors(state.actors, "idle", 0, state.tick),
        kpi: state.kpi
      };
      return {
        ...nextState,
        kpi: getKpiFromState(nextState)
      };
    }

    return {
      ...state,
      lastLoopEvent: event,
      updatedAt: new Date().toISOString()
    };
  }

  private persistRuntimeState(): void {
    this.runtimeState = this.store.saveRuntimeState({
      ...this.runtimeState,
      updatedAt: new Date().toISOString(),
      kpi: getKpiFromState(this.runtimeState)
    });
  }
}

const getWriteToken = (): string => {
  const token = (process.env.OFFICE_WRITE_TOKEN ?? "").trim();
  if (!token) {
    throw badRequest("OFFICE_WRITE_TOKEN is required");
  }
  return token;
};

const assertWriteToken = (request: FastifyRequest): void => {
  const expected = getWriteToken();
  const header = request.headers["x-office-write-token"];
  const received = Array.isArray(header) ? header[0] : header;
  if (!received || received !== expected) {
    throw badRequest("Invalid office write token");
  }
};

export const registerOfficeRuntimeRoutes = (server: FastifyInstance): void => {
  const runtimeService = new OfficeRuntimeService();
  void runtimeService.initialize();
  server.addHook("onClose", async () => {
    runtimeService.shutdown();
  });

  server.get(
    "/api/events/stream",
    async (_request, reply): Promise<void> => {
      runtimeService.attachSseClient(reply);
      return new Promise<void>(() => {
        // keep connection open
      });
    }
  );

  server.get("/api/office/runtime/state", async (): Promise<OfficeRuntimeStateResponse> => {
    return {
      ok: true,
      state: runtimeService.getState()
    };
  });

  server.post(
    "/api/office/runtime/command",
    async (request): Promise<OfficeCommandResponse> => {
      assertWriteToken(request);
      const parsed = commandSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid command payload");
      }
      return runtimeService.dispatchCommand(parsed.data);
    }
  );

  server.get("/api/office/logs", async (request): Promise<OfficeLogsResponse> => {
    const query = request.query as { limit?: string | number } | undefined;
    const rawLimit =
      typeof query?.limit === "number"
        ? query.limit
        : typeof query?.limit === "string"
          ? Number(query.limit)
          : 120;
    const limit = Number.isFinite(rawLimit) ? Number(rawLimit) : 120;
    return {
      ok: true,
      logs: runtimeService.listLogs(limit)
    };
  });

  server.get("/api/office/threads", async (): Promise<OfficeThreadsResponse> => {
    return {
      ok: true,
      threads: runtimeService.listThreads()
    };
  });

  server.post(
    "/api/office/threads",
    async (request): Promise<CreateBossCommandThreadResponse> => {
      assertWriteToken(request);
      const parsed = createThreadSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid thread payload");
      }
      const payload: CreateBossCommandThreadRequest = parsed.data;
      return {
        ok: true,
        thread: runtimeService.createThread(payload)
      };
    }
  );

  server.post(
    "/api/office/threads/:id/messages",
    async (request): Promise<AddBossCommandMessageResponse> => {
      assertWriteToken(request);
      const params = request.params as { id?: string };
      if (!params.id) {
        throw badRequest("Thread id is required");
      }
      const parsed = addMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid thread message payload");
      }
      const payload: AddBossCommandMessageRequest = parsed.data;
      return {
        ok: true,
        thread: runtimeService.appendThreadMessage(params.id, payload)
      };
    }
  );

  server.patch(
    "/api/office/threads/:id/status",
    async (request): Promise<UpdateBossCommandThreadStatusResponse> => {
      assertWriteToken(request);
      const params = request.params as { id?: string };
      if (!params.id) {
        throw badRequest("Thread id is required");
      }
      const parsed = patchStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid thread status payload");
      }
      const payload: UpdateBossCommandThreadStatusRequest = parsed.data;
      return {
        ok: true,
        thread: runtimeService.updateThreadStatus(params.id, payload)
      };
    }
  );
};
