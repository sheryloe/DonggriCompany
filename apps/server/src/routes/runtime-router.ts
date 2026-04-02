import { RuntimeRouter } from "@workspace/db";
import type {
  RuntimeRouterResolveResponse,
  RuntimeRouterRequest,
  RuntimeRouterSimulateResponse
} from "@workspace/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { badRequest } from "../errors.js";

const runtimeRouter = new RuntimeRouter();

const runtimeRouterRequestSchema = z.object({
  taskType: z.string().min(1).max(100).optional(),
  roleKey: z.string().min(1).max(100).optional(),
  preferredRuntimeProfileIds: z.array(z.string().min(1)).optional(),
  requiredCapabilities: z.array(z.string().min(1)).optional(),
  workspaceMode: z.string().min(1).max(100).optional()
});

const parseRouterRequest = (payload: unknown): RuntimeRouterRequest => {
  const parsed = runtimeRouterRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid router payload");
  }

  if (!parsed.data.taskType && !parsed.data.roleKey && !parsed.data.requiredCapabilities?.length) {
    throw badRequest("taskType, roleKey, or requiredCapabilities is required");
  }

  return {
    taskType: parsed.data.taskType,
    roleKey: parsed.data.roleKey,
    preferredRuntimeProfileIds: parsed.data.preferredRuntimeProfileIds,
    requiredCapabilities: parsed.data.requiredCapabilities,
    workspaceMode: parsed.data.workspaceMode
  };
};

export const registerRuntimeRouterRoutes = (server: FastifyInstance): void => {
  server.post(
    "/api/runtime-router/simulate",
    async (request): Promise<RuntimeRouterSimulateResponse> => {
      const input = parseRouterRequest(request.body);
      return {
        ok: true,
        decision: runtimeRouter.simulate(input)
      };
    }
  );

  server.post(
    "/api/runtime-router/resolve",
    async (request): Promise<RuntimeRouterResolveResponse> => {
      const input = parseRouterRequest(request.body);
      return {
        ok: true,
        decision: runtimeRouter.resolve(input)
      };
    }
  );
};
