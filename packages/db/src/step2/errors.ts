import type { ApiErrorCode } from "@workspace/shared";

export class DbServiceError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(statusCode: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "DbServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const dbBadRequest = (message: string): DbServiceError => {
  return new DbServiceError(400, "BAD_REQUEST", message);
};

export const dbNotFound = (message: string): DbServiceError => {
  return new DbServiceError(404, "NOT_FOUND", message);
};

export const dbConflict = (message: string): DbServiceError => {
  return new DbServiceError(409, "CONFLICT", message);
};
