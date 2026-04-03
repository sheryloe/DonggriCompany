import type { ApiErrorResponse } from "@workspace/shared";

const API_BASE = "/api";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

const normalizeApiPath = (path: string): string => {
  if (path.startsWith("/api/")) {
    return path.slice(4);
  }
  return path.startsWith("/") ? path : `/${path}`;
};

const parseError = async (response: Response): Promise<ApiClientError> => {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    if (payload && payload.ok === false && payload.error) {
      return new ApiClientError(payload.error.code, payload.error.message, response.status);
    }
  } catch {
    // Fall through to generic error.
  }

  return new ApiClientError("INTERNAL_ERROR", "Request failed", response.status);
};

export const withQuery = (
  path: string,
  query: Record<string, string | number | null | undefined>
): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    params.set(key, String(value));
  }

  const search = params.toString();
  return search.length > 0 ? `${path}?${search}` : path;
};

export const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${normalizeApiPath(path)}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as T;
};
