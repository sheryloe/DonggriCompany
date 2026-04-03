import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runMigrations } from "@workspace/db";

import { createServer } from "../app.js";

test("GET /api/office/bootstrap aliases /api/bootstrap/state", async () => {
  const dbPath = path.join(tmpdir(), `donggri-server-step4-${randomUUID()}.sqlite`);
  runMigrations(dbPath);

  const previousDbPath = process.env.WORKSPACE_DB_PATH;
  process.env.WORKSPACE_DB_PATH = dbPath;

  const server = createServer();

  try {
    const legacyResponse = await server.inject({
      method: "GET",
      url: "/api/bootstrap/state"
    });
    const aliasResponse = await server.inject({
      method: "GET",
      url: "/api/office/bootstrap"
    });

    assert.equal(legacyResponse.statusCode, 200);
    assert.equal(aliasResponse.statusCode, 200);
    assert.deepEqual(JSON.parse(aliasResponse.body), JSON.parse(legacyResponse.body));
  } finally {
    await server.close();
    if (previousDbPath === undefined) {
      delete process.env.WORKSPACE_DB_PATH;
    } else {
      process.env.WORKSPACE_DB_PATH = previousDbPath;
    }
    rmSync(dbPath, { force: true });
  }
});
