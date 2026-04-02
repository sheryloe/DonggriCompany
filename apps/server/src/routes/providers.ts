import { listProvidersWithLatestProbe, runProviderProbeAndPersist } from "@workspace/db";
import type { ProviderProbeRequest, ProviderProbeResponse, ProviderKey, ProvidersListResponse } from "@workspace/shared";
import type { FastifyInstance } from "fastify";

import { badRequest } from "../errors.js";

const PROVIDERS: ProviderKey[] = ["claude", "codex", "gemini", "jules"];

const isProvider = (value: unknown): value is ProviderKey => {
  return typeof value === "string" && PROVIDERS.includes(value as ProviderKey);
};

const parseProbeRequest = (payload: unknown): ProviderProbeRequest => {
  if (!payload || typeof payload !== "object") {
    throw badRequest("Request body must be an object");
  }

  const body = payload as Record<string, unknown>;
  if (!isProvider(body.provider)) {
    throw badRequest("provider must be one of: claude, codex, gemini, jules");
  }

  return {
    provider: body.provider
  };
};

export const registerProviderRoutes = (server: FastifyInstance): void => {
  server.get("/api/providers", async (): Promise<ProvidersListResponse> => {
    return {
      ok: true,
      providers: listProvidersWithLatestProbe()
    };
  });

  server.post("/api/providers/probe", async (request): Promise<ProviderProbeResponse> => {
    const body = parseProbeRequest(request.body);
    return {
      ok: true,
      probe: runProviderProbeAndPersist(body.provider)
    };
  });
};
