import { describe, expect, it } from "vitest";
import {
  MASTER95_CONTROL_TOWER_JOURNEYS,
  Master95DurableControlTower,
  Master95MemoryControlTowerJournal,
} from "../../master95/durable-control-tower.js";
import {
  MASTER95_CONTROL_TOWER_APPROVAL_ID,
  MASTER95_CONTROL_TOWER_CONFIRMATION,
  registerMaster95ControlTowerRoutes,
} from "./control-tower.js";

type RouteHandler = (req: any, res: any) => unknown;

function createFakeApp() {
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

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as any,
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

function createStreamResponse() {
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

function setup(controlTower = new Master95DurableControlTower(new Master95MemoryControlTowerJournal())) {
  const { app, routes } = createFakeApp();
  registerMaster95ControlTowerRoutes(app as any, {
    controlTower,
    now: () => "2026-07-15T04:30:00.000Z",
    streamHeartbeatMs: 0,
  });
  return { routes, controlTower };
}

function journeyBody(journeyId: (typeof MASTER95_CONTROL_TOWER_JOURNEYS)[number], attemptId: string) {
  return {
    approval_id: MASTER95_CONTROL_TOWER_APPROVAL_ID,
    confirm: MASTER95_CONTROL_TOWER_CONFIRMATION,
    root_project_id: "project:BloggerGent",
    journey_id: journeyId,
    attempt_id: attemptId,
  };
}

describe("Master95 durable Control Tower routes", () => {
  it("denies a mutation without the exact bounded approval guard", () => {
    const { routes } = setup();
    const response = createResponse();
    routes.get("POST /api/control-plane/v1/master-95/control-tower/journeys")?.(
      { body: { root_project_id: "project:BloggerGent", journey_id: "task-progress", attempt_id: "denied" } },
      response,
    );

    expect(response.statusCode).toBe(403);
    expect(response.body).toMatchObject({ ok: false, error: "master95_control_tower_request_failed" });
  });

  it("runs all five guarded journeys and returns durable state", () => {
    const { routes } = setup();
    const mutation = routes.get("POST /api/control-plane/v1/master-95/control-tower/journeys")!;
    for (const [index, journeyId] of MASTER95_CONTROL_TOWER_JOURNEYS.entries()) {
      const response = createResponse();
      mutation({ body: journeyBody(journeyId, `route-${index + 1}`) }, response);
      expect(response.statusCode).toBe(201);
      expect(response.body).toMatchObject({
        ok: true,
        duplicate: false,
        external_effect: false,
        process_started: false,
        published: false,
        db_written: false,
      });
    }

    const state = createResponse();
    routes.get("GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/state")?.(
      { params: { rootProjectId: "project:BloggerGent" } },
      state,
    );
    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ ok: true, event_count: 32, external_effect: false });
    expect(state.body.journeys).toHaveLength(5);
    expect(state.body.runs).toHaveLength(5);
  });

  it("streams an isolated initial snapshot and publishes guarded journey updates in real time", () => {
    const { routes } = setup();
    const closeListeners: Array<() => void> = [];
    const response = createStreamResponse();
    routes.get("GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/events")?.(
      {
        params: { rootProjectId: "project:BloggerGent" },
        on(event: string, listener: () => void) {
          if (event === "close") closeListeners.push(listener);
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.writes.join("")).toContain("event: snapshot");
    expect(response.writes.join("")).toContain('"reason":"connected"');
    expect(response.writes.join("")).toContain('"root_project_id":"project:BloggerGent"');

    routes.get("POST /api/control-plane/v1/master-95/control-tower/journeys")?.(
      { body: journeyBody("task-progress", "stream-route-1") },
      createResponse(),
    );
    expect(response.writes.join("")).toContain('"reason":"journey"');
    expect(response.writes.join("")).toContain('"event_count":7');

    closeListeners.forEach((listener) => listener());
  });

  it("returns the original result without appending on an idempotent retry", () => {
    const { routes } = setup();
    const mutation = routes.get("POST /api/control-plane/v1/master-95/control-tower/journeys")!;
    const first = createResponse();
    const second = createResponse();
    const body = journeyBody("approval", "same-route-attempt");
    mutation({ body }, first);
    mutation({ body }, second);

    expect(first.body.duplicate).toBe(false);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.result).toEqual(first.body.result);
    expect(second.body.snapshot.event_count).toBe(7);
  });

  it("denies cross-Project Run and Artifact detail reads", () => {
    const { routes } = setup();
    const mutation = routes.get("POST /api/control-plane/v1/master-95/control-tower/journeys")!;
    const retry = createResponse();
    const artifact = createResponse();
    mutation({ body: journeyBody("failure-retry", "cross-run") }, retry);
    mutation({ body: journeyBody("artifact-close", "cross-artifact") }, artifact);

    const runResponse = createResponse();
    routes.get("GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/runs/:runId")?.(
      {
        params: {
          rootProjectId: "project:CardNewsAgent",
          runId: retry.body.result.run_id,
        },
      },
      runResponse,
    );
    expect(runResponse.statusCode).toBe(403);

    const artifactResponse = createResponse();
    routes.get("GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/artifacts/:artifactId")?.(
      {
        params: {
          rootProjectId: "project:CardNewsAgent",
          artifactId: artifact.body.snapshot.artifacts[0].artifact_id,
        },
      },
      artifactResponse,
    );
    expect(artifactResponse.statusCode).toBe(403);
  });

  it("serves the same state after a journal-backed restart", () => {
    const journal = new Master95MemoryControlTowerJournal();
    const firstStore = new Master95DurableControlTower(journal);
    const first = setup(firstStore);
    for (const [index, journeyId] of MASTER95_CONTROL_TOWER_JOURNEYS.entries()) {
      first.routes.get("POST /api/control-plane/v1/master-95/control-tower/journeys")?.(
        { body: journeyBody(journeyId, `restart-route-${index + 1}`) },
        createResponse(),
      );
    }
    const expected = firstStore.snapshot("project:BloggerGent");

    const restarted = setup(new Master95DurableControlTower(journal));
    const response = createResponse();
    restarted.routes.get("GET /api/control-plane/v1/master-95/control-tower/projects/:rootProjectId/state")?.(
      { params: { rootProjectId: "project:BloggerGent" } },
      response,
    );
    const { ok: _ok, external_effect: _externalEffect, ...actual } = response.body;
    expect(actual).toEqual(expected);
  });

  it("guards and applies the full explicit operator action surface", () => {
    const { routes, controlTower } = setup();
    const journey = routes.get("POST /api/control-plane/v1/master-95/control-tower/journeys")!;
    for (const [index, journeyId] of MASTER95_CONTROL_TOWER_JOURNEYS.entries()) {
      journey({ body: journeyBody(journeyId, `action-route-${index + 1}`) }, createResponse());
    }
    const snapshot = controlTower.snapshot("project:BloggerGent");
    const task = snapshot.tasks.find((item) => item.title.includes("진행 확인"))!;
    const run = snapshot.runs.find((item) => item.task_id === task.task_id)!;
    const failed = snapshot.runs.find((item) => item.status === "failed")!;
    const pending = snapshot.approvals.filter((approval) => approval.status === "pending");
    const deployment = snapshot.deployments[0];
    const action = routes.get("POST /api/control-plane/v1/master-95/control-tower/actions")!;
    const actionInputs = [
      ["agent-recommend", task.task_id, "ops-db-quality"],
      ["owner-change", task.task_id, "REVIEW"],
      ["run-pause", run.run_id],
      ["run-resume", run.run_id],
      ["run-cancel", run.run_id],
      ["approval-approve", pending[0].approval_id],
      ["approval-reject", pending[1].approval_id],
      ["run-retry", failed.run_id],
      ["run-escalate", failed.run_id],
      ["agent-rollback", deployment.deployment_id, "0.9.0"],
      ["agent-revoke", deployment.deployment_id],
    ] as const;

    for (const [index, [actionId, targetId, value]] of actionInputs.entries()) {
      const response = createResponse();
      action(
        {
          body: {
            approval_id: MASTER95_CONTROL_TOWER_APPROVAL_ID,
            confirm: MASTER95_CONTROL_TOWER_CONFIRMATION,
            root_project_id: "project:BloggerGent",
            action_id: actionId,
            attempt_id: `action-${index + 1}`,
            target_id: targetId,
            ...(value ? { value } : {}),
          },
        },
        response,
      );
      expect(response.statusCode).toBe(201);
      expect(response.body).toMatchObject({ ok: true, external_effect: false, process_started: false });
    }
    expect(controlTower.snapshot("project:BloggerGent").event_count).toBe(54);

    const denied = createResponse();
    action(
      {
        body: {
          root_project_id: "project:BloggerGent",
          action_id: "run-pause",
          attempt_id: "denied-action",
          target_id: run.run_id,
        },
      },
      denied,
    );
    expect(denied.statusCode).toBe(403);
  });
});
