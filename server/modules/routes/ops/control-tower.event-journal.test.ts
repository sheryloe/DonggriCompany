import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Master95EventJournalControlTowerRuntime } from "../../master95/control-tower-event-journal.js";
import { registerMaster95ControlTowerRoutes } from "./control-tower.js";

type RouteHandler = (request: any, response: any) => unknown;

const temporaryDirectories: string[] = [];
const SOURCE_EPOCH = `sha256:${"a".repeat(64)}`;
const PROJECTION_EPOCH = `sha256:${"b".repeat(64)}`;

async function temporaryJournal() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "donggri-control-tower-route-v1-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "events.jsonl");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function fakeApp() {
  const routes = new Map<string, RouteHandler>();
  const app = {
    get(route: string, handler: RouteHandler) {
      routes.set(`GET ${route}`, handler);
      return this;
    },
    post(route: string, handler: RouteHandler) {
      routes.set(`POST ${route}`, handler);
      return this;
    },
  };
  return { app, routes };
}

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

function streamResponse() {
  return {
    statusCode: 200,
    headers: new Map<string, string>(),
    writes: [] as string[],
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name.toLowerCase(), value);
      return this;
    },
    flushHeaders() {
      return this;
    },
    write(chunk: string) {
      this.writes.push(chunk);
      return true;
    },
    json(body: unknown) {
      this.writes.push(JSON.stringify(body));
      return this;
    },
  };
}

describe("Control Tower EventJournal runtime routes", () => {
  it("returns source identity and resumes SSE from the actual journal cursor", async () => {
    const sourceEpoch = SOURCE_EPOCH;
    const runtime = await Master95EventJournalControlTowerRuntime.open({
      journal_path: await temporaryJournal(),
      candidate_id: "dongri-grigri-v1-alpha.0",
      source_epoch: sourceEpoch,
      projection_epoch: PROJECTION_EPOCH,
      writer_instance_id: "route-writer",
    });
    await runtime.runJourney({
      root_project_id: "project:BloggerGent",
      journey_id: "task-progress",
      attempt_id: "route-resume",
      occurred_at: "2026-07-25T04:30:00.000Z",
    });

    const { app, routes } = fakeApp();
    registerMaster95ControlTowerRoutes(app as any, {
      controlTower: runtime,
      sourceEpoch: () => sourceEpoch,
      projectionEpoch: () => PROJECTION_EPOCH,
      streamHeartbeatMs: 0,
      now: () => "2026-07-25T04:31:00.000Z",
    });

    const state = response();
    await routes.get("GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/state")?.(
      { params: { rootProjectId: "project:BloggerGent" } },
      state,
    );
    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({
      source_epoch: sourceEpoch,
      projection_epoch: PROJECTION_EPOCH,
      snapshot_version: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      event_count: 7,
    });

    const closeListeners: Array<() => void> = [];
    const stream = streamResponse();
    await routes.get("GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/events")?.(
      {
        params: { rootProjectId: "project:BloggerGent" },
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
        header(name: string) {
          return name.toLowerCase() === "last-event-id" ? "3" : undefined;
        },
        on(event: string, listener: () => void) {
          if (event === "close") closeListeners.push(listener);
        },
      },
      stream,
    );
    const body = stream.writes.join("");
    expect(body.match(/event: journal/g)).toHaveLength(5);
    expect(body).toContain("id: 4\nevent: journal");
    expect(body).toContain("id: 8\nevent: snapshot");
    expect(body).toContain(`"source_epoch":"${sourceEpoch}"`);
    expect(body).toContain(`"projection_epoch":"${PROJECTION_EPOCH}"`);
    closeListeners.forEach((listener) => listener());
    await runtime.close();
  });

  it("fails closed when the live source epoch drifts from the opened journal", async () => {
    const runtime = await Master95EventJournalControlTowerRuntime.open({
      journal_path: await temporaryJournal(),
      candidate_id: "dongri-grigri-v1-alpha.0",
      source_epoch: SOURCE_EPOCH,
      projection_epoch: PROJECTION_EPOCH,
    });
    const { app, routes } = fakeApp();
    registerMaster95ControlTowerRoutes(app as any, {
      controlTower: runtime,
      sourceEpoch: () => `sha256:${"c".repeat(64)}`,
      projectionEpoch: () => PROJECTION_EPOCH,
    });
    const state = response();
    await routes.get("GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/state")?.(
      { params: { rootProjectId: "project:BloggerGent" } },
      state,
    );
    expect(state.statusCode).toBe(503);
    expect(state.body).toMatchObject({ error: "master95_control_tower_request_failed" });
    await runtime.close();
  });
});
