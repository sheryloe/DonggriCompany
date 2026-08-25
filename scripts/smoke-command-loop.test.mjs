import assert from "node:assert/strict";
import test from "node:test";
import { isLoopbackBaseUrl, runCommandLoopSmoke } from "./smoke-command-loop.mjs";

test("loopback guard rejects remote origins", () => {
  assert.equal(isLoopbackBaseUrl("http://127.0.0.1:8790"), true);
  assert.equal(isLoopbackBaseUrl("https://example.com"), false);
});

test("command loop proves routing, execution, and terminal result", async () => {
  let detailReads = 0;
  let createBody = null;
  const fetchImpl = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/api/auth/session") {
      return new Response(JSON.stringify({ csrf_token: "csrf" }), {
        status: 200,
        headers: { "set-cookie": "session=test; Path=/" },
      });
    }
    if (pathname === "/api/tasks" && init.method === "POST") {
      createBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "task-141" }), { status: 200 });
    }
    if (pathname === "/api/tasks/task-141/run") {
      assert.equal(new Headers(init.headers).get("x-csrf-token"), "csrf");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (pathname === "/api/tasks/task-141") {
      detailReads += 1;
      const terminal = detailReads > 1;
      return new Response(
        JSON.stringify({
          task: {
            id: "task-141",
            department_id: "quality",
            assigned_agent_id: "master-quality",
            status: terminal ? "done" : "planned",
            result: terminal ? "DONGRI_SMOKE_OK quality" : null,
          },
        }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  };

  const result = await runCommandLoopSmoke({
    baseUrl: "http://127.0.0.1:8790",
    timeoutMs: 1_000,
    pollMs: 20,
    departmentId: "quality",
    projectPath: "G:\\fixture",
    fetchImpl,
  });

  assert.equal(createBody.department_id, "quality");
  assert.equal(result.agentId, "master-quality");
  assert.equal(result.status, "done");
  assert.match(result.result, /DONGRI_SMOKE_OK/);
});
