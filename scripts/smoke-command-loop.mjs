#!/usr/bin/env node
/* global fetch, Headers, process, console, setTimeout */

import { pathToFileURL } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function isLoopbackBaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

function parseCookie(raw) {
  return typeof raw === "string" ? (raw.split(";", 1)[0]?.trim() ?? "") : "";
}

export async function runCommandLoopSmoke(options = {}) {
  const baseUrl = String(options.baseUrl ?? "http://127.0.0.1:8790").replace(/\/$/, "");
  const timeoutMs = Number(options.timeoutMs ?? 300_000);
  const pollMs = Number(options.pollMs ?? 1_000);
  const departmentId = String(options.departmentId ?? "quality");
  const projectPath = String(options.projectPath ?? "").trim();
  const fetchImpl = options.fetchImpl ?? fetch;

  assert(isLoopbackBaseUrl(baseUrl), "command_loop_smoke_requires_loopback_http");
  assert(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 900_000, "invalid_smoke_timeout");
  assert(Number.isFinite(pollMs) && pollMs >= 20, "invalid_smoke_poll_interval");
  assert(projectPath, "SMOKE_PROJECT_PATH is required");

  const jar = { cookie: "", csrfToken: "" };
  const request = async (pathname, init = {}) => {
    const headers = new Headers(init.headers ?? {});
    if (jar.cookie) headers.set("cookie", jar.cookie);
    if (init.withCsrf && jar.csrfToken) headers.set("x-csrf-token", jar.csrfToken);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetchImpl(`${baseUrl}${pathname}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const cookie = parseCookie(response.headers.get("set-cookie"));
    if (cookie) jar.cookie = cookie;
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text };
  };

  const session = await request("/api/auth/session");
  assert(session.status === 200, `session bootstrap failed (${session.status})`);
  assert(session.json?.csrf_token, "csrf_token missing from session bootstrap");
  jar.csrfToken = session.json.csrf_token;

  const create = await request("/api/tasks", {
    method: "POST",
    withCsrf: true,
    body: {
      title: "Dongri-grigri V1 command lifecycle smoke",
      description:
        "Read-only smoke. Do not create, modify, move, or delete files. Return exactly DONGRI_SMOKE_OK and a one-line role summary.",
      department_id: departmentId,
      project_path: projectPath,
      task_type: "general",
      priority: 1,
    },
  });
  assert(create.status === 200, `task create failed (${create.status})`);
  const taskId = create.json?.id;
  assert(taskId, "task id missing from create response");

  const detailPath = `/api/tasks/${encodeURIComponent(taskId)}`;
  const routed = await request(detailPath);
  assert(routed.status === 200, `task routing read failed (${routed.status})`);
  assert(routed.json?.task?.department_id === departmentId, "task department routing mismatch");
  assert(routed.json?.task?.assigned_agent_id, "task did not resolve an assigned master agent");

  const run = await request(`${detailPath}/run`, { method: "POST", withCsrf: true, body: {} });
  assert(run.status === 200, `task run failed (${run.status})`);

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const detail = await request(detailPath);
    assert(detail.status === 200, `task status read failed (${detail.status})`);
    const task = detail.json?.task;
    assert(task, "task payload missing during polling");
    if (task.status === "cancelled") throw new Error("task execution was cancelled");
    if (task.status === "done" || task.status === "review") {
      assert(typeof task.result === "string" && task.result.trim(), "terminal task result is empty");
      return {
        ok: true,
        taskId,
        departmentId: task.department_id,
        agentId: task.assigned_agent_id,
        status: task.status,
        result: task.result,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`command loop did not reach a terminal result within ${timeoutMs}ms`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCommandLoopSmoke({
    baseUrl: process.env.SMOKE_BASE_URL,
    timeoutMs: process.env.SMOKE_TIMEOUT_MS,
    pollMs: process.env.SMOKE_POLL_MS,
    departmentId: process.env.SMOKE_DEPARTMENT_ID,
    projectPath: process.env.SMOKE_PROJECT_PATH,
  })
    .then((result) => {
      console.log(
        `[command-loop-smoke] ok task=${result.taskId} department=${result.departmentId} agent=${result.agentId} status=${result.status}`,
      );
    })
    .catch((error) => {
      console.error(`[command-loop-smoke] failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
