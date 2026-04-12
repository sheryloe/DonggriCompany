#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const baseUrl = String(process.env.QA_API_BASE_URL ?? "http://127.0.0.1:8790").replace(/\/+$/, "");
const qaApiAuthToken = String(process.env.QA_API_AUTH_TOKEN ?? process.env.API_AUTH_TOKEN ?? "").trim();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const summary = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  run_id: runId,
  using_auth_token: Boolean(qaApiAuthToken),
  checks: {},
  artifacts: {},
};

function endpoint(routePath) {
  return `${baseUrl}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
}

async function requestJson(method, routePath, body) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (qaApiAuthToken) headers.authorization = `Bearer ${qaApiAuthToken}`;

  const response = await fetch(endpoint(routePath), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json().catch(() => null);
  if (response.status === 401 && !qaApiAuthToken && routePath !== "/api/health") {
    throw new Error("401 unauthorized. Set QA_API_AUTH_TOKEN (or API_AUTH_TOKEN) and retry.");
  }

  return { status: response.status, ok: response.ok, json };
}

function assertOrThrow(condition, message) {
  if (!condition) throw new Error(message);
}

async function findCreatablePath(seedPath) {
  const queue = [seedPath];
  const seen = new Set();
  const allowedRoots = new Set();

  while (queue.length > 0) {
    const root = queue.shift();
    if (!root || seen.has(root)) continue;
    seen.add(root);

    const candidate = path.join(root, `claw-prn-smoke-${runId}`);
    const check = await requestJson("GET", `/api/projects/path-check?path=${encodeURIComponent(candidate)}`);

    if (check.status === 403 && check.json && Array.isArray(check.json.allowed_roots)) {
      for (const allowedRoot of check.json.allowed_roots) {
        if (typeof allowedRoot === "string" && allowedRoot.trim()) {
          allowedRoots.add(allowedRoot);
        }
      }
      for (const allowedRoot of allowedRoots) {
        if (!seen.has(allowedRoot)) queue.push(allowedRoot);
      }
      continue;
    }

    if (!check.ok || !check.json || check.json.error) continue;
    if (check.json.can_create || check.json.exists) {
      return {
        path:
          typeof check.json.normalized_path === "string" && check.json.normalized_path
            ? check.json.normalized_path
            : candidate,
        allowedRoots: [...allowedRoots],
      };
    }
  }

  throw new Error("No creatable project path found for PRN smoke test.");
}

function runVitestSuite() {
  const testFiles = [
    "server/modules/routes/ops/messages/prn-draft.test.ts",
    "server/modules/routes/ops/messages/decision-inbox/review-round-items.test.ts",
    "server/modules/routes/ops/messages/decision-inbox/review-round-reply.test.ts",
    "server/modules/workflow/subtasks/title-normalizer.test.ts",
    "server/modules/routes/core/tasks/crud.workflow-pack-filter.test.ts",
  ];

  const vitestBin = path.resolve(process.cwd(), "node_modules", "vitest", "vitest.mjs");
  const run = fs.existsSync(vitestBin)
    ? spawnSync(process.execPath, [vitestBin, "--config", "server/vitest.config.ts", "run", ...testFiles], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawnSync("corepack", ["pnpm", "exec", "vitest", "--config", "server/vitest.config.ts", "run", ...testFiles], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

  summary.artifacts.vitest = {
    status: run.status ?? -1,
    signal: run.signal ?? null,
    error: run.error ? String(run.error.message ?? run.error) : null,
    stdout_tail: String(run.stdout ?? "")
      .trim()
      .split(/\r?\n/)
      .slice(-20),
    stderr_tail: String(run.stderr ?? "")
      .trim()
      .split(/\r?\n/)
      .slice(-20),
  };

  assertOrThrow(run.status === 0, "Vitest smoke suite failed.");
}

async function run() {
  const health = await requestJson("GET", "/api/health");
  assertOrThrow(health.ok, `health check failed (${health.status})`);
  summary.checks.health = "ok";

  const browse = await requestJson("GET", "/api/projects/path-browse");
  assertOrThrow(browse.ok && browse.json?.ok === true, `path-browse failed (${browse.status})`);
  summary.checks.path_browse = "ok";

  const preferredRoots = [process.env.QA_PROJECT_ROOT, browse.json.current_path, os.tmpdir()].filter(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  let picked = null;
  for (const root of preferredRoots) {
    try {
      picked = await findCreatablePath(root);
      if (picked?.path) break;
    } catch {
      // try next root
    }
  }

  assertOrThrow(Boolean(picked?.path), "failed to resolve a creatable project path");
  summary.artifacts.project_path = picked.path;

  const projectCreate = await requestJson("POST", "/api/projects", {
    name: `PRN Smoke ${runId}`,
    project_path: picked.path,
    core_goal: "PRN smoke pipeline validation",
    create_path_if_missing: true,
  });
  assertOrThrow(projectCreate.ok && projectCreate.json?.project?.id, `project create failed (${projectCreate.status})`);

  const project = projectCreate.json.project;
  summary.artifacts.project_id = project.id;
  summary.checks.project_create = "ok";

  try {
    const prnDraft = await requestJson("POST", "/api/directives/prn-draft", {
      prompt: "인스타그램 카드뉴스 로컬 제작 기능 요구사항 PRN 초안을 만들어줘",
      project_id: project.id,
      project_path: project.project_path,
      project_context: project.core_goal,
      language: "ko",
    });
    assertOrThrow(prnDraft.ok && prnDraft.json?.ok === true, `prn-draft failed (${prnDraft.status})`);

    const draft = prnDraft.json?.draft ?? {};
    assertOrThrow(
      typeof draft.directive_text === "string" && draft.directive_text.trim().length > 0,
      "directive_text missing",
    );
    assertOrThrow(
      typeof draft.generation_meta?.pass1 === "string" && draft.generation_meta.pass1.trim(),
      "pass1 missing",
    );
    assertOrThrow(
      typeof draft.generation_meta?.pass2 === "string" && draft.generation_meta.pass2.trim(),
      "pass2 missing",
    );

    summary.checks.prn_draft = "ok";
    summary.artifacts.prn_confidence = Number(draft.confidence ?? 0);
    summary.artifacts.prn_fallback_used = Boolean(draft.generation_meta?.fallback_used);

    const directive = await requestJson("POST", "/api/directives", {
      content: draft.directive_text,
      project_id: project.id,
      project_path: project.project_path,
      project_context: project.core_goal,
      source: "prn_ui",
    });
    assertOrThrow(directive.ok && directive.json?.ok === true, `directive send failed (${directive.status})`);

    summary.checks.directive_send = "ok";
    summary.artifacts.directive_message_id = directive.json?.message?.id ?? directive.json?.id ?? null;

    runVitestSuite();
    summary.checks.vitest_smoke = "ok";
  } finally {
    const cleanup = await requestJson("DELETE", `/api/projects/${project.id}`);
    summary.checks.cleanup = cleanup.ok ? "ok" : `failed:${cleanup.status}`;
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

run().catch(async (err) => {
  summary.error = err instanceof Error ? err.message : String(err);
  if (summary.artifacts.project_id) {
    try {
      await requestJson("DELETE", `/api/projects/${summary.artifacts.project_id}`);
      summary.checks.cleanup = "best-effort-ok";
    } catch {
      summary.checks.cleanup = "best-effort-failed";
    }
  }

  process.stderr.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = 1;
});
