import { DatabaseSync } from "node:sqlite";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { SESSION_AUTH_TOKEN } from "../../../config/runtime.ts";
import { getCsrfToken } from "../../../security/auth.ts";
import { applyControlPlaneMutationSchema } from "../../bootstrap/schema/control-plane-mutation-schema.ts";
import {
  CONTROL_PLANE_V2_READ_OPERATION_IDS,
  CONTROL_PLANE_V2_READ_OPERATION_PATHS,
} from "./control-plane-v2-read-operations.ts";
import { registerControlPlaneRoutes } from "./control-plane.ts";

vi.setConfig({ testTimeout: 20_000 });

function authenticatedRead(builder: request.Test): request.Test {
  return builder
    .set("authorization", `Bearer ${SESSION_AUTH_TOKEN}`)
    .set("x-csrf-token", getCsrfToken())
    .set("origin", "http://127.0.0.1:8800");
}

function databaseFingerprint(db: DatabaseSync) {
  const changes = db.prepare("SELECT total_changes() AS count").get() as { count: number };
  const schema = db
    .prepare(
      `SELECT type, name, tbl_name, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all();
  const mutationRows = (
    [
      "control_plane_mutation_previews",
      "control_plane_approval_receipts",
      "control_plane_idempotency_results",
      "control_plane_mutation_audit",
      "control_plane_image_artifacts",
    ] as const
  ).map((table) => ({
    table,
    count: Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count),
  }));
  return { changes: Number(changes.count), schema, mutationRows };
}

describe("Control Plane v2 production read-operation integration", () => {
  let app: express.Express;
  let db: DatabaseSync;
  let fetchMock: MockInstance<typeof fetch>;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyControlPlaneMutationSchema(db);
    app = express();
    app.use(express.json());
    registerControlPlaneRoutes({ app, db });
    fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "http://127.0.0.1:3111/agentmemory/smart-search") {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ results: [{ summary: "search-result" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "http://127.0.0.1:3111/agentmemory/context") {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ context: [{ summary: "context-result" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected_external_read:${url}`);
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
    db.close();
  });

  it("reuses all five v1 computations behind v2 envelopes with zero DB and external mutation effects", async () => {
    const before = databaseFingerprint(db);
    const cases = [
      [
        CONTROL_PLANE_V2_READ_OPERATION_PATHS.memorySearch,
        { query: "active spec", scope: "root" },
        CONTROL_PLANE_V2_READ_OPERATION_IDS.memorySearch,
      ],
      [
        CONTROL_PLANE_V2_READ_OPERATION_PATHS.memoryContext,
        { query: "handoff", scope: "project:DonggriCompany", project_key: "DonggriCompany" },
        CONTROL_PLANE_V2_READ_OPERATION_IDS.memoryContext,
      ],
      [
        CONTROL_PLANE_V2_READ_OPERATION_PATHS.controlPlaneSyncPreview,
        {},
        CONTROL_PLANE_V2_READ_OPERATION_IDS.controlPlaneSyncPreview,
      ],
      [
        CONTROL_PLANE_V2_READ_OPERATION_PATHS.engineRoutePreview,
        {
          objective: "Review the active V1 contract",
          provider: "codex_exec",
          scope_type: "project",
          scope_value: "DonggriCompany",
        },
        CONTROL_PLANE_V2_READ_OPERATION_IDS.engineRoutePreview,
      ],
      [
        CONTROL_PLANE_V2_READ_OPERATION_PATHS.harnessBlueprintPreview,
        {
          target_mode: "project",
          project_key: "DonggriCompany",
          objective: "Create a producer-reviewer preview",
          preferred_pattern: "producer-reviewer",
        },
        CONTROL_PLANE_V2_READ_OPERATION_IDS.harnessBlueprintPreview,
      ],
    ] as const;

    for (const [path, body, operation] of cases) {
      const response = await authenticatedRead(request(app).post(path)).send(body).expect(200);
      expect(response.body).toMatchObject({
        source_epoch: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        request_id: expect.any(String),
        data: {
          operation,
          source_epoch: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          projection_epoch: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          writes: false,
        },
      });
      expect(response.body.data.source_epoch).toBe(response.body.source_epoch);
      expect(response.body.data).not.toHaveProperty("approval_receipt");
      expect(response.body.data).not.toHaveProperty("receipt_sha256");
    }

    const after = databaseFingerprint(db);
    expect(after).toEqual(before);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const externalUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(externalUrls).toEqual([
      "http://127.0.0.1:3111/agentmemory/smart-search",
      "http://127.0.0.1:3111/agentmemory/context",
    ]);
    expect(externalUrls.every((url) => !/remember|observe|capture|forget|delete|import/i.test(url))).toBe(true);
  });
});
