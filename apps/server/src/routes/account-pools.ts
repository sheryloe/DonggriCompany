import { AccountPoolService, createAccountPoolSchema, updateAccountPoolSchema } from "@workspace/db";
import type {
  AccountPoolCreateResponse,
  AccountPoolFatigueHistoryResponse,
  AccountPoolsListResponse,
  AccountPoolUpdateResponse
} from "@workspace/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { badRequest } from "../errors.js";

const accountPoolService = new AccountPoolService();

const fatigueHistoryQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return 100;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 500) : 100;
    })
});

export const registerAccountPoolRoutes = (server: FastifyInstance): void => {
  server.get("/api/account-pools", async (): Promise<AccountPoolsListResponse> => {
    return {
      ok: true,
      pools: accountPoolService.list()
    };
  });

  server.post("/api/account-pools", async (request, reply): Promise<AccountPoolCreateResponse> => {
    const parsed = createAccountPoolSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? "Invalid account pool payload");
    }

    const pool = accountPoolService.create(parsed.data);
    reply.status(201);
    return {
      ok: true,
      pool
    };
  });

  server.patch(
    "/api/account-pools/:id",
    async (request): Promise<AccountPoolUpdateResponse> => {
      const params = request.params as { id?: string };
      if (!params.id) {
        throw badRequest("id is required");
      }

      const parsed = updateAccountPoolSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid account pool payload");
      }

      const pool = accountPoolService.update(params.id, parsed.data);
      return {
        ok: true,
        pool
      };
    }
  );

  server.get(
    "/api/account-pools/:id/fatigue",
    async (request): Promise<AccountPoolFatigueHistoryResponse> => {
      const params = request.params as { id?: string };
      if (!params.id) {
        throw badRequest("id is required");
      }

      const queryParse = fatigueHistoryQuerySchema.safeParse(request.query ?? {});
      if (!queryParse.success) {
        throw badRequest("Invalid fatigue history query");
      }

      const snapshots = accountPoolService.listFatigueHistory(params.id, queryParse.data.limit);
      return {
        ok: true,
        accountPoolId: params.id,
        snapshots
      };
    }
  );
};
