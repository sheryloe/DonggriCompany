import type { FastifyInstance } from "fastify";
import { AgentService, DepartmentService, TaskService, StatsService } from "@workspace/db";
import type {
  AgentsListResponse,
  DepartmentsListResponse,
  TasksListResponse,
  StatsResponse,
  Task,
  TaskStatus,
} from "@workspace/shared";
import { broadcast } from "../ws/office-ws.js";
import { badRequest } from "../errors.js";
import { z } from "zod";

const agentService = new AgentService();
const deptService = new DepartmentService();
const taskService = new TaskService();
const statsService = new StatsService();

const agentStatusSchema = z.object({
  status: z.enum(["idle", "working", "break", "meeting"]),
});

export const registerAgentRoutes = (server: FastifyInstance): void => {
  // ── Departments ───────────────────────────────────────────
  server.get("/api/departments", async (): Promise<DepartmentsListResponse> => {
    return { ok: true, departments: deptService.list() };
  });

  // ── Agents ────────────────────────────────────────────────
  server.get("/api/agents", async (): Promise<AgentsListResponse> => {
    return { ok: true, agents: agentService.list() };
  });

  server.patch("/api/agents/:id/status", async (request): Promise<{ ok: true }> => {
    const params = request.params as { id?: string };
    if (!params.id) throw badRequest("id is required");
    const parsed = agentStatusSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Invalid status");
    const agent = agentService.updateStatus(params.id, parsed.data.status);
    broadcast({ type: "agent_status", agentId: agent.id, status: agent.status });
    broadcast({ type: "agents_updated", agents: agentService.list() });
    return { ok: true };
  });

  // ── Tasks ─────────────────────────────────────────────────
  server.get("/api/tasks", async (): Promise<TasksListResponse> => {
    return { ok: true, tasks: taskService.list() };
  });

  server.post("/api/tasks", async (request, reply) => {
    const body = request.body as { title?: string; description?: string; departmentId?: string };
    if (!body.title?.trim()) throw badRequest("title is required");
    const task = taskService.create({
      title: body.title.trim(),
      description: body.description,
      departmentId: body.departmentId,
    });
    reply.status(201);
    broadcast({ type: "tasks_updated", tasks: taskService.list() });
    return { ok: true, task };
  });

  server.patch("/api/tasks/:id/status", async (request) => {
    const params = request.params as { id?: string };
    if (!params.id) throw badRequest("id is required");
    const body = request.body as { status?: string };
    const validStatuses = ["inbox", "planned", "in_progress", "review", "done"];
    if (!body.status || !validStatuses.includes(body.status)) throw badRequest("Invalid status");
    const task = taskService.updateStatus(params.id, body.status as TaskStatus);
    broadcast({ type: "tasks_updated", tasks: taskService.list() });
    return { ok: true, task };
  });

  // ── Stats ─────────────────────────────────────────────────
  server.get("/api/stats", async (): Promise<StatsResponse> => {
    return { ok: true, stats: statsService.getStats() };
  });
};
