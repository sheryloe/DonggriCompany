import { getBootstrapState, initializeBootstrapState } from "@workspace/db";
import type {
  BootstrapInitRequest,
  BootstrapInitResponse,
  BootstrapStateResponse
} from "@workspace/shared";
import type { FastifyInstance } from "fastify";

import { badRequest } from "../errors.js";

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

const parseBootstrapInitRequest = (payload: unknown): BootstrapInitRequest => {
  if (!payload || typeof payload !== "object") {
    throw badRequest("Request body must be an object");
  }

  const body = payload as Record<string, unknown>;
  const { workspaceName, rootPath, selectedProviders, selectedRolePackIds, officeTheme } = body;

  if (typeof workspaceName !== "string" || workspaceName.trim().length === 0) {
    throw badRequest("workspaceName is required");
  }
  if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
    throw badRequest("rootPath is required");
  }
  if (!isStringArray(selectedProviders)) {
    throw badRequest("selectedProviders must be an array of strings");
  }
  if (!isStringArray(selectedRolePackIds)) {
    throw badRequest("selectedRolePackIds must be an array of strings");
  }
  if (officeTheme !== undefined && typeof officeTheme !== "string") {
    throw badRequest("officeTheme must be a string");
  }

  return {
    workspaceName: workspaceName.trim(),
    rootPath: rootPath.trim(),
    selectedProviders,
    selectedRolePackIds,
    officeTheme
  };
};

export const registerBootstrapRoutes = (server: FastifyInstance): void => {
  server.get("/api/bootstrap/state", async (): Promise<BootstrapStateResponse> => {
    return {
      ok: true,
      state: getBootstrapState()
    };
  });

  server.post("/api/bootstrap/init", async (request): Promise<BootstrapInitResponse> => {
    const input = parseBootstrapInitRequest(request.body);
    const state = initializeBootstrapState(input);
    return {
      ok: true,
      state
    };
  });
};
