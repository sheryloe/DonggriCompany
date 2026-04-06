import {
  CliExecutionService,
  KanbanTaskService,
  MeetingService,
  completeOfficeMeetingSchema,
  createOfficeKanbanTaskSchema,
  createOfficeMeetingSchema,
  officeCliRunSchema,
  updateOfficeKanbanTaskSchema
} from "@workspace/db";
import type {
  CreateOfficeKanbanTaskResponse,
  CreateOfficeMeetingResponse,
  DeleteOfficeMeetingResponse,
  OfficeCliActiveRunsResponse,
  OfficeCliLogsResponse,
  OfficeCliRunResponse,
  OfficeCliStopResponse,
  OfficeCliSubtasksResponse,
  OfficeKanbanTasksResponse,
  OfficeMeetingResponse,
  OfficeMeetingsResponse,
  UpdateOfficeKanbanTaskResponse
} from "@workspace/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { badRequest } from "../errors.js";
import { getOfficeRuntimeService } from "./office-runtime.js";
import { OAuthGateService } from "../services/oauth-gate.js";
import { OfficeRunnerOrchestrator } from "../services/office-runner-orchestrator.js";

const limitQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return 120;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 500) : 120;
    })
});

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

export const registerOfficeCollabRoutes = (server: FastifyInstance): void => {
  const kanbanService = new KanbanTaskService();
  const meetingService = new MeetingService();
  const cliService = new CliExecutionService();
  const runtimeService = getOfficeRuntimeService();
  const oauthGateService = new OAuthGateService();
  const runnerOrchestrator = new OfficeRunnerOrchestrator();

  server.get(
    "/api/office/kanban/tasks",
    async (): Promise<OfficeKanbanTasksResponse> => {
      return kanbanService.list();
    }
  );

  server.post(
    "/api/office/kanban/tasks",
    async (request, reply): Promise<CreateOfficeKanbanTaskResponse> => {
      assertWriteToken(request);
      const parsed = createOfficeKanbanTaskSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid kanban create payload");
      }

      const task = kanbanService.create(parsed.data);
      runtimeService.publishKanbanTask(task, "created");
      reply.status(201);
      return {
        ok: true,
        task
      };
    }
  );

  server.patch(
    "/api/office/kanban/tasks/:id",
    async (request): Promise<UpdateOfficeKanbanTaskResponse> => {
      assertWriteToken(request);
      const params = request.params as { id?: string };
      if (!params.id) {
        throw badRequest("Task id is required");
      }

      const parsed = updateOfficeKanbanTaskSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid kanban update payload");
      }

      const task = kanbanService.update(params.id, parsed.data);
      runtimeService.publishKanbanTask(task, "updated");
      return {
        ok: true,
        task
      };
    }
  );

  server.get("/api/office/meetings", async (): Promise<OfficeMeetingsResponse> => {
    return meetingService.list();
  });

  server.post(
    "/api/office/meetings",
    async (request, reply): Promise<CreateOfficeMeetingResponse> => {
      assertWriteToken(request);
      const parsed = createOfficeMeetingSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid meeting create payload");
      }

      const created = meetingService.create(parsed.data);
      runtimeService.publishMeeting(created.meeting, "created");
      reply.status(201);
      return created;
    }
  );

  server.post(
    "/api/office/meetings/:id/start",
    async (request): Promise<OfficeMeetingResponse> => {
      assertWriteToken(request);
      const params = request.params as { id?: string };
      if (!params.id) {
        throw badRequest("Meeting id is required");
      }
      const started = meetingService.start(params.id);
      runtimeService.publishMeeting(started.meeting, "updated");
      return started;
    }
  );

  server.post(
    "/api/office/meetings/:id/complete",
    async (request): Promise<OfficeMeetingResponse> => {
      assertWriteToken(request);
      const params = request.params as { id?: string };
      if (!params.id) {
        throw badRequest("Meeting id is required");
      }

      const parsed = completeOfficeMeetingSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid meeting completion payload");
      }

      const completed = meetingService.complete(params.id, parsed.data);
      runtimeService.publishMeeting(completed.meeting, "updated");
      return completed;
    }
  );

  server.delete(
    "/api/office/meetings/:id",
    async (request): Promise<DeleteOfficeMeetingResponse> => {
      assertWriteToken(request);
      const params = request.params as { id?: string };
      if (!params.id) {
        throw badRequest("Meeting id is required");
      }

      const removed = meetingService.remove(params.id);
      runtimeService.publishMeeting(removed.meeting, "deleted");
      return {
        ok: true,
        id: removed.id,
        deleted: true
      };
    }
  );

  server.post("/api/office/cli/run", async (request): Promise<OfficeCliRunResponse> => {
    assertWriteToken(request);
    const parsed = officeCliRunSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? "Invalid CLI run payload");
    }
    await oauthGateService.ensureProviderPoolConnected(
      parsed.data.provider,
      parsed.data.accountPoolId
    );

    const runner = runnerOrchestrator.activate(
      parsed.data.provider,
      parsed.data.accountPoolId,
      JSON.stringify({
        route: "/api/office/cli/run",
        taskId: parsed.data.taskId
      })
    );
    runtimeService.publishRunner(runner.runner);
    if (runner.queueItem) {
      runtimeService.publishRunnerQueue(runner.queueItem);
    }
    if (runner.queued) {
      throw badRequest(
        `Runner capacity exceeded; CLI run queued for ${parsed.data.provider}/${parsed.data.accountPoolId}`
      );
    }
    if (runner.runner.status !== "active") {
      throw badRequest(
        `Runner activation failed for ${parsed.data.provider}/${parsed.data.accountPoolId}`
      );
    }

    try {
      const runResponse = cliService.run(parsed.data);
      runtimeService.publishCliRun(runResponse.run);
      const touched = runnerOrchestrator.touchRunner(
        parsed.data.provider,
        parsed.data.accountPoolId
      );
      if (touched) {
        runtimeService.publishRunner(touched);
      }

      const latestLogs = cliService.listLogs(runResponse.run.taskId, 1);
      const latestLog = latestLogs.logs[0];
      if (latestLog) {
        runtimeService.publishCliLog(latestLog);
      }

      return runResponse;
    } catch (error) {
      const failed = runnerOrchestrator.deactivate(
        parsed.data.provider,
        parsed.data.accountPoolId,
        "cli-run-failed"
      );
      runtimeService.publishRunner(failed.runner);
      if (failed.promotedRunner) {
        runtimeService.publishRunner(failed.promotedRunner);
      }
      if (failed.promotedQueueItem) {
        runtimeService.publishRunnerQueue(failed.promotedQueueItem);
      }
      throw error;
    }
  });

  server.post(
    "/api/office/cli/stop/:taskId",
    async (request): Promise<OfficeCliStopResponse> => {
      assertWriteToken(request);
      const params = request.params as { taskId?: string };
      if (!params.taskId) {
        throw badRequest("taskId is required");
      }

      const stopResponse = cliService.stop(params.taskId);
      const run = cliService.getRun(params.taskId);
      runtimeService.publishCliRun(run);

      const latestLogs = cliService.listLogs(params.taskId, 1);
      const latestLog = latestLogs.logs[0];
      if (latestLog) {
        runtimeService.publishCliLog(latestLog);
      }

      return stopResponse;
    }
  );

  server.get(
    "/api/office/cli/logs/:taskId",
    async (request): Promise<OfficeCliLogsResponse> => {
      const params = request.params as { taskId?: string };
      if (!params.taskId) {
        throw badRequest("taskId is required");
      }
      const parsed = limitQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        throw badRequest("Invalid logs query");
      }
      return cliService.listLogs(params.taskId, parsed.data.limit);
    }
  );

  server.get(
    "/api/office/cli/subtasks/:taskId",
    async (request): Promise<OfficeCliSubtasksResponse> => {
      const params = request.params as { taskId?: string };
      if (!params.taskId) {
        throw badRequest("taskId is required");
      }
      return cliService.listSubtasks(params.taskId);
    }
  );

  server.get(
    "/api/office/cli/active",
    async (): Promise<OfficeCliActiveRunsResponse> => {
      return cliService.listActiveRuns();
    }
  );
};
