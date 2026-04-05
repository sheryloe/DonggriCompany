import {
  AgentModelAssignmentService,
  upsertAgentModelAssignmentSchema
} from "@workspace/db";
import type {
  AgentId,
  AgentModelAssignmentsListResponse,
  UpsertAgentModelAssignmentResponse
} from "@workspace/shared";
import type { FastifyInstance } from "fastify";

import { badRequest } from "../errors.js";

export const registerAgentModelRoutes = (server: FastifyInstance): void => {
  const assignmentService = new AgentModelAssignmentService();

  server.get("/api/agent-models", async (): Promise<AgentModelAssignmentsListResponse> => {
    return {
      ok: true,
      assignments: assignmentService.list()
    };
  });

  server.put(
    "/api/agent-models/:agentId",
    async (request): Promise<UpsertAgentModelAssignmentResponse> => {
      const params = request.params as { agentId?: string };
      if (!params.agentId) {
        throw badRequest("agentId is required");
      }

      const parsed = upsertAgentModelAssignmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid agent model assignment payload");
      }

      const assignment = assignmentService.upsert(params.agentId as AgentId, parsed.data);
      return {
        ok: true,
        assignment
      };
    }
  );
};
