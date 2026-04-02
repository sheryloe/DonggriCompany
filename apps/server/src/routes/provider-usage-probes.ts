import { ProviderUsageProbeService } from "@workspace/db";
import type {
  ProviderUsageProbeHistoryResponse,
  ProviderUsageProbeRunRequest,
  ProviderUsageProbeRunResponse
} from "@workspace/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { badRequest } from "../errors.js";

const providerUsageProbeService = new ProviderUsageProbeService();

const historyQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return 50;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 200) : 50;
    })
});

const probeRequestSchema = z.object({
  provider: z.enum(["claude", "codex", "gemini"]),
  accountPoolId: z.string().min(1).optional(),
  runtimeProfileId: z.string().min(1).optional(),
  persistSnapshot: z.boolean().optional()
});

const parseProbeRequest = (payload: unknown): ProviderUsageProbeRunRequest => {
  const parsed = probeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid provider probe payload");
  }
  return parsed.data;
};

export const registerProviderUsageProbeRoutes = (server: FastifyInstance): void => {
  server.post(
    "/api/provider-probes/run",
    async (request): Promise<ProviderUsageProbeRunResponse> => {
      return providerUsageProbeService.run(parseProbeRequest(request.body));
    }
  );

  server.get("/api/provider-probes/history", async (request): Promise<ProviderUsageProbeHistoryResponse> => {
    const parsed = historyQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw badRequest("Invalid provider probe history query");
    }

    return {
      ok: true,
      runs: providerUsageProbeService.listHistory(parsed.data.limit)
    };
  });
};
