import {
  RuntimeProfileService,
  createRuntimeProfileSchema,
  updateRuntimeProfileSchema
} from "@workspace/db";
import type {
  RuntimeProfileCreateResponse,
  RuntimeProfileDeleteResponse,
  RuntimeProfilesListResponse,
  RuntimeProfileUpdateResponse
} from "@workspace/shared";
import type { FastifyInstance } from "fastify";

import { badRequest } from "../errors.js";

const runtimeProfileService = new RuntimeProfileService();

export const registerRuntimeProfileRoutes = (server: FastifyInstance): void => {
  server.get("/api/runtime-profiles", async (): Promise<RuntimeProfilesListResponse> => {
    return {
      ok: true,
      profiles: runtimeProfileService.list()
    };
  });

  server.post("/api/runtime-profiles", async (request, reply): Promise<RuntimeProfileCreateResponse> => {
    const parsed = createRuntimeProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? "Invalid runtime profile payload");
    }

    const profile = runtimeProfileService.create(parsed.data);
    reply.status(201);
    return {
      ok: true,
      profile
    };
  });

  server.patch(
    "/api/runtime-profiles/:id",
    async (request): Promise<RuntimeProfileUpdateResponse> => {
      const params = request.params as { id?: string };
      if (!params.id) {
        throw badRequest("id is required");
      }

      const parsed = updateRuntimeProfileSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid runtime profile payload");
      }

      const profile = runtimeProfileService.update(params.id, parsed.data);
      return {
        ok: true,
        profile
      };
    }
  );

  server.delete(
    "/api/runtime-profiles/:id",
    async (request): Promise<RuntimeProfileDeleteResponse> => {
      const params = request.params as { id?: string };
      if (!params.id) {
        throw badRequest("id is required");
      }

      const result = runtimeProfileService.remove(params.id);
      return {
        ok: true,
        id: result.id
      };
    }
  );
};
