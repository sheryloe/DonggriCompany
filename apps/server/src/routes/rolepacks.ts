import { discoverRolePacks } from "@workspace/rolepack";
import type { RolePacksResponse } from "@workspace/shared";
import type { FastifyInstance } from "fastify";

export const registerRolePackRoutes = (server: FastifyInstance): void => {
  server.get("/api/rolepacks", async (): Promise<RolePacksResponse> => {
    return {
      ok: true,
      rolePacks: discoverRolePacks()
    };
  });
};