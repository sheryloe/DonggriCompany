import type { FastifyInstance } from "fastify";
import { MeetingService } from "@workspace/db";
import type { MeetingsListResponse, MeetingCreateResponse } from "@workspace/shared";
import { badRequest } from "../errors.js";

const meetingService = new MeetingService();

export const registerMeetingRoutes = (server: FastifyInstance): void => {
  server.get("/api/meetings", async (request): Promise<MeetingsListResponse> => {
    const query = request.query as { task_id?: string };
    return { ok: true, meetings: meetingService.list(query.task_id) };
  });

  server.post("/api/meetings", async (request, reply): Promise<MeetingCreateResponse> => {
    const body = request.body as {
      title?: string; taskId?: string; meetingType?: string;
      departmentId?: string; agenda?: string; scheduledAt?: number;
    };
    if (!body.title?.trim()) throw badRequest("title is required");
    const meeting = meetingService.create({
      title: body.title.trim(), taskId: body.taskId,
      meetingType: (body.meetingType as any) ?? "planned",
      departmentId: body.departmentId, agenda: body.agenda,
      scheduledAt: body.scheduledAt,
    });
    reply.status(201);
    return { ok: true, meeting };
  });

  server.post("/api/meetings/:id/start", async (request) => {
    const { id } = request.params as { id: string };
    return { ok: true, meeting: meetingService.start(id) };
  });

  server.post("/api/meetings/:id/complete", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { summary?: string };
    return { ok: true, meeting: meetingService.complete(id, body.summary) };
  });

  server.delete("/api/meetings/:id", async (request) => {
    const { id } = request.params as { id: string };
    meetingService.delete(id);
    return { ok: true };
  });
};
