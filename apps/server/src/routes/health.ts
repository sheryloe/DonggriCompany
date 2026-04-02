import type { ApiHealthResponse } from "@workspace/shared";
import type { FastifyInstance } from "fastify";

export const registerHealthRoutes = (server: FastifyInstance): void => {
  server.get("/api/health", async (): Promise<ApiHealthResponse> => {
    return {
      ok: true,
      service: "server",
      timestamp: new Date().toISOString()
    };
  });
};

