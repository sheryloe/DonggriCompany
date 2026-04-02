import { DbServiceError } from "@workspace/db";
import type { ApiErrorCode, ApiErrorResponse } from "@workspace/shared";
import type { FastifyInstance } from "fastify";

export class ApiHttpError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;

  constructor(statusCode: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message: string): ApiHttpError => {
  return new ApiHttpError(400, "BAD_REQUEST", message);
};

export const notFound = (message: string): ApiHttpError => {
  return new ApiHttpError(404, "NOT_FOUND", message);
};

export const conflict = (message: string): ApiHttpError => {
  return new ApiHttpError(409, "CONFLICT", message);
};

export const registerErrorHandler = (server: FastifyInstance): void => {
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof DbServiceError) {
      const response: ApiErrorResponse = {
        ok: false,
        error: {
          code: error.code,
          message: error.message
        }
      };
      reply.status(error.statusCode).send(response);
      return;
    }

    if (error instanceof ApiHttpError) {
      const response: ApiErrorResponse = {
        ok: false,
        error: {
          code: error.code,
          message: error.message
        }
      };
      reply.status(error.statusCode).send(response);
      return;
    }

    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? ((error as { statusCode: number }).statusCode as number)
        : null;

    if (statusCode === 400 || statusCode === 404 || statusCode === 409) {
      const code: ApiErrorCode =
        statusCode === 404 ? "NOT_FOUND" : statusCode === 409 ? "CONFLICT" : "BAD_REQUEST";
      const response: ApiErrorResponse = {
        ok: false,
        error: {
          code,
          message: "Invalid request"
        }
      };
      reply.status(statusCode).send(response);
      return;
    }

    request.log.error({ err: error }, "Unhandled API error");
    const response: ApiErrorResponse = {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error"
      }
    };
    reply.status(500).send(response);
  });
};
