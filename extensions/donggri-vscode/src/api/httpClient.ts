import type { DonggriServerConfig } from "../types";

export class DonggriHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DonggriHttpError";
  }
}

function isMutation(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function readSetCookies(headers: Headers): string[] {
  const extended = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const list = extended.getSetCookie?.();
  if (Array.isArray(list) && list.length > 0) {
    return list;
  }

  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

export class DonggriHttpClient {
  private csrfToken = "";
  private cookieHeader = "";
  private resolvedBaseUrl = "";

  constructor(private readonly getConfig: () => DonggriServerConfig) {}

  private get baseUrl(): string {
    return this.resolvedBaseUrl || this.normalizeBaseUrl(this.getConfig().serverUrl);
  }

  getEffectiveBaseUrl(): string {
    return this.baseUrl;
  }

  private normalizeBaseUrl(value: string): string {
    return value.replace(/\/+$/u, "");
  }

  private buildCandidateBaseUrls(): string[] {
    const configured = this.normalizeBaseUrl(this.getConfig().serverUrl);
    const candidates = [this.resolvedBaseUrl, configured, this.swapLocalPort(configured)].filter(
      (entry): entry is string => Boolean(entry),
    );
    return [...new Set(candidates)];
  }

  private swapLocalPort(baseUrl: string): string | null {
    try {
      const url = new URL(baseUrl);
      if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
        return null;
      }

      if (url.port === "8790") {
        url.port = "7777";
        return url.toString().replace(/\/$/u, "");
      }

      if (url.port === "7777") {
        url.port = "8790";
        return url.toString().replace(/\/$/u, "");
      }
    } catch {
      return null;
    }

    return null;
  }

  private async fetchWithFallback(path: string, init: RequestInit): Promise<Response> {
    const candidates = this.buildCandidateBaseUrls();
    let lastResponse: Response | undefined;
    let lastError: unknown;

    for (const candidate of candidates) {
      try {
        const response = await fetch(`${candidate}${path}`, init);
        this.captureSession(response);

        if (
          !response.ok &&
          [404, 405, 502, 503].includes(response.status) &&
          candidate !== candidates[candidates.length - 1]
        ) {
          lastResponse = response;
          continue;
        }

        this.resolvedBaseUrl = candidate;
        return response;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastResponse) {
      return lastResponse;
    }

    throw lastError instanceof Error ? lastError : new Error("Donggri server is unreachable.");
  }

  private captureSession(response: Response): void {
    const cookies = readSetCookies(response.headers)
      .map((entry) => entry.split(";")[0]?.trim())
      .filter((entry): entry is string => Boolean(entry));

    if (cookies.length > 0) {
      this.cookieHeader = cookies.join("; ");
    }
  }

  private buildHeaders(method: string, extraHeaders?: HeadersInit): Headers {
    const headers = new Headers(extraHeaders);
    const config = this.getConfig();

    if (config.apiToken) {
      headers.set("authorization", `Bearer ${config.apiToken}`);
    } else if (this.cookieHeader && !headers.has("cookie")) {
      headers.set("cookie", this.cookieHeader);
    }

    if (isMutation(method) && this.csrfToken && !headers.has("x-csrf-token")) {
      headers.set("x-csrf-token", this.csrfToken);
    }

    return headers;
  }

  async bootstrapSession(force = false): Promise<boolean> {
    if (!force && (this.csrfToken || this.getConfig().apiToken)) {
      return true;
    }

    for (const candidate of this.buildCandidateBaseUrls()) {
      try {
        const response = await fetch(`${candidate}/api/auth/session`, {
          method: "GET",
          headers: this.buildHeaders("GET"),
        });

        this.captureSession(response);
        if (!response.ok) {
          continue;
        }

        const payload = (await response.json().catch(() => null)) as { csrf_token?: unknown } | null;
        this.csrfToken = typeof payload?.csrf_token === "string" ? payload.csrf_token : "";
        this.resolvedBaseUrl = candidate;
        return true;
      } catch {
        continue;
      }
    }

    return false;
  }

  async request<T>(
    path: string,
    init?: RequestInit & {
      retryAuth?: boolean;
    },
  ): Promise<T> {
    const method = (init?.method ?? "GET").toUpperCase();
    const retryAuth = init?.retryAuth ?? true;

    if (isMutation(method) && !this.getConfig().apiToken && !this.csrfToken) {
      await this.bootstrapSession();
    }

    const response = await this.fetchWithFallback(path, {
      ...init,
      method,
      headers: this.buildHeaders(method, init?.headers),
    });

    if (response.status === 401 && retryAuth) {
      const bootstrapped = await this.bootstrapSession(true);
      if (bootstrapped) {
        return this.request<T>(path, {
          ...init,
          retryAuth: false,
        });
      }
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
      const code = typeof body?.error === "string" ? body.error : undefined;
      const message =
        typeof body?.message === "string" ? body.message : (code ?? `Donggri request failed (${response.status})`);
      throw new DonggriHttpError(message, response.status, code, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  createWebSocketHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const config = this.getConfig();

    if (config.apiToken) {
      headers.authorization = `Bearer ${config.apiToken}`;
    } else if (this.cookieHeader) {
      headers.cookie = this.cookieHeader;
    }

    return headers;
  }
}
