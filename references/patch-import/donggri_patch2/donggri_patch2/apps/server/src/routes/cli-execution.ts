import type { FastifyInstance } from "fastify";
import { CliExecutionService, spawnCliAgent, stopCliAgent, type CliProvider } from "@workspace/db";
import { broadcast } from "../ws/office-ws.js";
import { badRequest } from "../errors.js";
import { z } from "zod";
import Database from "better-sqlite3";

const cliService = new CliExecutionService();

const runSchema = z.object({
  taskId: z.string().min(1),
  provider: z.enum(["claude", "codex", "gemini", "opencode", "kimi"]),
  prompt: z.string().min(1),
  projectPath: z.string().min(1),
  model: z.string().optional(),
});

export const registerCliExecutionRoutes = (server: FastifyInstance): void => {
  // ── CLI 실행 시작 ────────────────────────────────────────────────
  server.post("/api/cli/run", async (request, reply) => {
    const parsed = runSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");

    const { taskId, provider, prompt, projectPath, model } = parsed.data;

    // 이미 실행 중인지 확인
    const dbPath = process.env.WORKSPACE_DB_PATH ?? ".local/workspace.sqlite";
    const db = new Database(dbPath);
    const existing = db.prepare("SELECT task_id FROM active_cli_runs WHERE task_id = ?").get(taskId);
    if (existing) throw badRequest("이미 실행 중인 태스크입니다");

    // 태스크 상태를 in_progress로 변경
    const now = Date.now();
    db.prepare(
      "UPDATE tasks SET status = 'in_progress', cli_provider = ?, cli_model = ?, updated_at = ? WHERE id = ?"
    ).run(provider, model ?? null, now, taskId);
    broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId));

    // 비동기 실행
    spawnCliAgent(taskId, provider as CliProvider, prompt, projectPath, broadcast, model);

    reply.status(202);
    return { ok: true, taskId, provider, message: "CLI 에이전트 실행 시작됨" };
  });

  // ── CLI 중단 ────────────────────────────────────────────────────
  server.post("/api/cli/stop/:taskId", async (request) => {
    const { taskId } = request.params as { taskId: string };
    const stopped = stopCliAgent(taskId);
    return { ok: true, stopped };
  });

  // ── 실행 로그 조회 ───────────────────────────────────────────────
  server.get("/api/cli/logs/:taskId", async (request) => {
    const { taskId } = request.params as { taskId: string };
    const query = request.query as { limit?: string };
    const limit = Math.min(Number(query.limit ?? 100), 500);
    return { ok: true, logs: cliService.getLogs(taskId, limit) };
  });

  // ── Subtask 조회 ─────────────────────────────────────────────────
  server.get("/api/cli/subtasks/:taskId", async (request) => {
    const { taskId } = request.params as { taskId: string };
    return { ok: true, subtasks: cliService.getSubtasks(taskId) };
  });

  // ── 활성 실행 목록 ───────────────────────────────────────────────
  server.get("/api/cli/active", async () => {
    return { ok: true, runs: cliService.getActiveRuns() };
  });
};
