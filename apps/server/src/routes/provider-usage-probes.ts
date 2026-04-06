import { ProviderUsageProbeService } from "@workspace/db";
import type {
  ProviderUsageProbeHistoryQuery,
  ProviderUsageProbeHistoryResponse,
  ProviderUsageProbeRunRequest,
  ProviderUsageProbeRunResponse
} from "@workspace/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { badRequest } from "../errors.js";
import { getOfficeRuntimeService } from "./office-runtime.js";
import { OfficeRunnerOrchestrator } from "../services/office-runner-orchestrator.js";
import { OAuthGateService } from "../services/oauth-gate.js";

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
    }),
  provider: z.enum(["claude", "codex", "gemini"]).optional(),
  accountPoolId: z.string().min(1).optional(),
  runtimeProfileId: z.string().min(1).optional()
});

const probeRequestSchema = z.object({
  provider: z.enum(["claude", "codex", "gemini"]),
  accountPoolId: z.string().min(1),
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

export const registerProviderUsageProbeRoutes = (server: FastifyInstance): void => {
  const providerUsageProbeService = new ProviderUsageProbeService();
  const runtimeService = getOfficeRuntimeService();
  const oauthGateService = new OAuthGateService();
  const runnerOrchestrator = new OfficeRunnerOrchestrator();

  server.post(
    "/api/provider-probes/run",
    async (request): Promise<ProviderUsageProbeRunResponse> => {
      assertWriteToken(request);
      const payload = parseProbeRequest(request.body);
      await oauthGateService.ensureProviderPoolConnected(payload.provider, payload.accountPoolId);

      const runner = runnerOrchestrator.activate(
        payload.provider,
        payload.accountPoolId,
        JSON.stringify({
          route: "/api/provider-probes/run",
          runtimeProfileId: payload.runtimeProfileId ?? null
        })
      );
      runtimeService.publishRunner(runner.runner);
      if (runner.queueItem) {
        runtimeService.publishRunnerQueue(runner.queueItem);
      }
      if (runner.queued) {
        throw badRequest(
          `Runner capacity exceeded; probe queued for ${payload.provider}/${payload.accountPoolId}`
        );
      }
      if (runner.runner.status !== "active") {
        throw badRequest(
          `Runner activation failed for ${payload.provider}/${payload.accountPoolId}`
        );
      }
      try {
        const response = providerUsageProbeService.run(payload);
        const touched = runnerOrchestrator.touchRunner(payload.provider, payload.accountPoolId);
        if (touched) {
          runtimeService.publishRunner(touched);
        }
        return response;
      } catch (error) {
        const failed = runnerOrchestrator.deactivate(
          payload.provider,
          payload.accountPoolId,
          "probe-run-failed"
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
    }
  );

  server.get("/api/provider-probes/history", async (request): Promise<ProviderUsageProbeHistoryResponse> => {
    const parsed = historyQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw badRequest("Invalid provider probe history query");
    }

    const historyQuery: ProviderUsageProbeHistoryQuery = {
      limit: parsed.data.limit,
      provider: parsed.data.provider,
      accountPoolId: parsed.data.accountPoolId,
      runtimeProfileId: parsed.data.runtimeProfileId
    };

    return {
      ok: true,
      runs: providerUsageProbeService.listHistory(historyQuery)
    };
  });
};
