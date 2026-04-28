import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerOAuthRoutes } from "./routes.ts";
import { createOAuthStatusBuilder } from "./status.ts";

function createContext() {
  const now = Date.now();
  const row = {
    id: "acct-1",
    label: "Primary",
    email: "user@example.com",
    source: "web-oauth",
    scope: "repo user:email",
    status: "active",
    priority: 1,
    expires_at: now + 3600_000,
    refresh_token_enc: "encrypted-refresh-token",
    model_override: "gpt-test",
    failure_count: 0,
    last_error: "previous_error",
    last_error_at: now - 1000,
    last_success_at: now,
    created_at: now - 10_000,
    updated_at: now,
  };

  return {
    db: {
      prepare: vi.fn(() => ({
        all: vi.fn(() => [row]),
      })),
    },
    ensureOAuthActiveAccount: vi.fn(),
    getActiveOAuthAccountIds: vi.fn(() => ["acct-1"]),
    setActiveOAuthAccount: vi.fn(),
    setOAuthActiveAccounts: vi.fn(),
    getOAuthAccounts: vi.fn(() => [
      {
        id: "acct-1",
        accessToken: "access-token",
        refreshToken: "refresh-token",
      },
    ]),
  };
}

describe("OAuth public status redaction", () => {
  it("keeps readiness while removing identity, scope, account and error details", async () => {
    const builder = createOAuthStatusBuilder(createContext() as any);

    const publicStatus = await builder.buildOAuthStatus();
    const debugStatus = await builder.buildOAuthDebugStatus();

    expect(publicStatus["github-copilot"]).toMatchObject({
      connected: true,
      detected: true,
      executionReady: true,
      email: null,
      scope: null,
      activeAccountId: null,
      activeAccountIds: [],
      accounts: [],
    });
    expect(publicStatus["github-copilot"]).not.toHaveProperty("lastError");

    expect(debugStatus["github-copilot"].email).toBe("user@example.com");
    expect(debugStatus["github-copilot"].scope).toBe("repo user:email");
    expect(debugStatus["github-copilot"].accounts?.[0]?.lastError).toBe("previous_error");
  });

  it("requires an explicit debug header for the debug status route", async () => {
    const app = express();
    registerOAuthRoutes({
      ...createContext(),
      app,
      nowMs: () => Date.now(),
      firstQueryValue: (value: unknown) => (Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "")),
      normalizeOAuthProvider: (provider: string) => provider,
      getPreferredOAuthAccounts: vi.fn(() => []),
      refreshGoogleToken: vi.fn(),
      getNextOAuthLabel: vi.fn(() => "Account"),
      setActiveOAuthAccount: vi.fn(),
      removeActiveOAuthAccount: vi.fn(),
    } as any);

    await request(app).get("/api/oauth/status/debug").expect(403).expect({
      error: "debug_header_required",
    });

    const response = await request(app)
      .get("/api/oauth/status/debug")
      .set("x-donggri-debug-action", "oauth-status-debug")
      .expect(200);

    expect(response.body.providers["github-copilot"].email).toBe("user@example.com");
  });
});
