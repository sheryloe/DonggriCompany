import type {
  ActivateOfficeRunnerRequest,
  ActivateOfficeRunnerResponse,
  DeactivateOfficeRunnerRequest,
  DeactivateOfficeRunnerResponse,
  OfficeRunnerListResponse,
  OfficeRunnerQueueResponse
} from "@workspace/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { badRequest } from "../errors.js";
import { getOfficeRuntimeService } from "./office-runtime.js";
import { OfficeRunnerOrchestrator } from "../services/office-runner-orchestrator.js";
import { OAuthGateService } from "../services/oauth-gate.js";

const providerSchema = z.enum(["claude", "codex", "gemini"]);

const activateRunnerSchema = z.object({
  provider: providerSchema,
  accountPoolId: z.string().min(1),
  reason: z.string().max(240).optional()
});

const deactivateRunnerSchema = z.object({
  provider: providerSchema,
  accountPoolId: z.string().min(1),
  reason: z.string().max(240).optional()
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

export const registerOfficeRunnerRoutes = (server: FastifyInstance): void => {
  const orchestrator = new OfficeRunnerOrchestrator();
  const runtimeService = getOfficeRuntimeService();
  const oauthGateService = new OAuthGateService();

  server.get(
    "/api/office/runners",
    async (): Promise<OfficeRunnerListResponse> => {
      return {
        ok: true,
        runners: orchestrator.listRunners()
      };
    }
  );

  server.get(
    "/api/office/runners/queue",
    async (): Promise<OfficeRunnerQueueResponse> => {
      return {
        ok: true,
        queue: orchestrator.listQueue(200)
      };
    }
  );

  server.post(
    "/api/office/runners/activate",
    async (request, reply): Promise<ActivateOfficeRunnerResponse> => {
      assertWriteToken(request);
      const parsed = activateRunnerSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid runner activate payload");
      }

      const payload = parsed.data as ActivateOfficeRunnerRequest;
      await oauthGateService.ensureProviderPoolConnected(
        payload.provider,
        payload.accountPoolId
      );
      const result = orchestrator.activate(
        payload.provider,
        payload.accountPoolId,
        JSON.stringify({
          route: "/api/office/runners/activate",
          reason: payload.reason ?? ""
        })
      );

      runtimeService.publishRunner(result.runner);
      if (result.queueItem) {
        runtimeService.publishRunnerQueue(result.queueItem);
      }
      if (result.queued) {
        reply.status(202);
      }

      return {
        ok: true,
        runner: result.runner,
        queued: result.queued,
        queueItem: result.queueItem
      };
    }
  );

  server.post(
    "/api/office/runners/deactivate",
    async (request): Promise<DeactivateOfficeRunnerResponse> => {
      assertWriteToken(request);
      const parsed = deactivateRunnerSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(parsed.error.issues[0]?.message ?? "Invalid runner deactivate payload");
      }

      const payload = parsed.data as DeactivateOfficeRunnerRequest;
      const result = orchestrator.deactivate(
        payload.provider,
        payload.accountPoolId,
        payload.reason ?? "manual"
      );

      runtimeService.publishRunner(result.runner);
      if (result.promotedRunner) {
        runtimeService.publishRunner(result.promotedRunner);
      }
      if (result.promotedQueueItem) {
        runtimeService.publishRunnerQueue(result.promotedQueueItem);
      }

      return {
        ok: true,
        runner: result.runner,
        promotedQueueItem: result.promotedQueueItem
      };
    }
  );
};
