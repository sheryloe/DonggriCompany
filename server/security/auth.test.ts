import express, { type Request, type Response } from "express";
import type { IncomingMessage } from "node:http";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { SESSION_AUTH_TOKEN, SESSION_COOKIE_NAME } from "../config/runtime.ts";
import {
  bearerToken,
  buildTaskInterruptControlToken,
  cookieToken,
  csrfTokenFromRequest,
  getCsrfToken,
  hasValidCsrfToken,
  hasValidTaskInterruptControlToken,
  incomingMessageBearerToken,
  incomingMessageCookieToken,
  installSecurityMiddleware,
  isAuthenticated,
  isIncomingMessageAuthenticated,
  isIncomingMessageOriginTrusted,
  isLoopbackAddress,
  isLoopbackHostname,
  isLoopbackRequest,
  isPublicApiPath,
  isTrustedHostHeader,
  isTrustedOrigin,
  isTrustedSessionBootstrapRequest,
  issueSessionCookie,
  normalizeHostHeader,
  parseCookies,
  safeSecretEquals,
  shouldRequireCsrf,
  shouldUseSecureCookie,
} from "./auth.ts";

function mockRequest(headers: Record<string, string | undefined>): Request {
  return {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    secure: false,
    socket: {
      remoteAddress: "127.0.0.1",
    },
  } as unknown as Request;
}

describe("auth helpers", () => {
  it("detects loopback hosts and addresses", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("example.com")).toBe(false);

    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("10.0.0.2")).toBe(false);

    expect(isLoopbackRequest({ socket: { remoteAddress: "127.0.0.1" } })).toBe(true);
    expect(isLoopbackRequest({ socket: { remoteAddress: "10.1.2.3" } })).toBe(false);
  });

  it("parses bearer tokens, cookies, and authentication", () => {
    const reqWithBearer = mockRequest({
      authorization: `Bearer ${SESSION_AUTH_TOKEN}`,
    });
    expect(bearerToken(reqWithBearer)).toBe(SESSION_AUTH_TOKEN);
    expect(isAuthenticated(reqWithBearer)).toBe(true);

    const reqWithCookie = mockRequest({
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(SESSION_AUTH_TOKEN)}; foo=bar`,
    });
    expect(cookieToken(reqWithCookie)).toBe(SESSION_AUTH_TOKEN);
    expect(isAuthenticated(reqWithCookie)).toBe(true);

    const parsed = parseCookies("a=1; b=hello%20world; c=%E3%81%82");
    expect(parsed).toMatchObject({
      a: "1",
      b: "hello world",
      c: "あ",
    });
  });

  it("handles trusted origins, public paths, and secure cookie rules", () => {
    expect(isTrustedOrigin("http://localhost:8800")).toBe(true);
    expect(isTrustedOrigin("https://dev.ts.net")).toBe(true);
    expect(isTrustedOrigin("file://tmp/test")).toBe(false);
    expect(isTrustedOrigin("not-a-url")).toBe(false);
    expect(normalizeHostHeader("localhost:8790")).toBe("localhost");
    expect(normalizeHostHeader("127.0.0.1:8790, proxy.local")).toBe("127.0.0.1");
    expect(isTrustedHostHeader("localhost:8790")).toBe(true);
    expect(isTrustedHostHeader("evil.example")).toBe(false);

    expect(isPublicApiPath("/api/health")).toBe(true);
    expect(isPublicApiPath("/api/auth/session")).toBe(true);
    expect(isPublicApiPath("/api/openapi.json")).toBe(true);
    expect(isPublicApiPath("/api/docs")).toBe(true);
    expect(isPublicApiPath("/api/docs/")).toBe(true);
    expect(isPublicApiPath("/api/tasks")).toBe(false);

    const insecureReq = mockRequest({
      "x-forwarded-proto": "http",
    });
    expect(shouldUseSecureCookie(insecureReq)).toBe(false);

    const secureReq = {
      ...insecureReq,
      secure: true,
    } as Request;
    expect(shouldUseSecureCookie(secureReq)).toBe(true);

    const loopbackBootstrapReq = {
      ...mockRequest({
        host: "evil.example:8790",
      }),
      socket: { remoteAddress: "127.0.0.1" },
      hostname: "evil.example",
    } as unknown as Request;
    expect(isTrustedSessionBootstrapRequest(loopbackBootstrapReq)).toBe(true);

    const spoofedBootstrapReq = {
      ...mockRequest({
        host: "localhost:8790",
        origin: "https://dev.ts.net",
        referer: "https://dev.ts.net/app",
        "x-forwarded-host": "localhost:8790",
      }),
      socket: { remoteAddress: "172.20.0.10" },
      hostname: "localhost",
    } as unknown as Request;
    expect(isTrustedSessionBootstrapRequest(spoofedBootstrapReq)).toBe(false);

    const untrustedBootstrapReq = {
      ...mockRequest({
        host: "evil.example:8790",
      }),
      socket: { remoteAddress: "172.20.0.10" },
      hostname: "evil.example",
    } as unknown as Request;
    expect(isTrustedSessionBootstrapRequest(untrustedBootstrapReq)).toBe(false);
  });

  it("issues a session cookie only once", () => {
    const append = vi.fn();
    const res = { append } as unknown as Response;

    const reqNoCookie = mockRequest({
      cookie: undefined,
    });
    issueSessionCookie(reqNoCookie, res);
    expect(append).toHaveBeenCalledTimes(1);
    const firstCookie = String(append.mock.calls[0]?.[1] ?? "");
    expect(firstCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(firstCookie).toContain("HttpOnly");

    append.mockClear();
    const reqWithCookie = mockRequest({
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(SESSION_AUTH_TOKEN)}`,
    });
    issueSessionCookie(reqWithCookie, res);
    expect(append).not.toHaveBeenCalled();
  });

  it("handles IncomingMessage auth and trusted origins", () => {
    const incoming = {
      headers: {
        authorization: `Bearer ${SESSION_AUTH_TOKEN}`,
        cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(SESSION_AUTH_TOKEN)}`,
        origin: "http://localhost:8800",
      },
    } as unknown as IncomingMessage;

    expect(incomingMessageBearerToken(incoming)).toBe(SESSION_AUTH_TOKEN);
    expect(incomingMessageCookieToken(incoming)).toBe(SESSION_AUTH_TOKEN);
    expect(isIncomingMessageAuthenticated(incoming)).toBe(true);
    expect(isIncomingMessageOriginTrusted(incoming)).toBe(true);
  });

  it("compares secrets safely", () => {
    expect(safeSecretEquals("abc123", "abc123")).toBe(true);
    expect(safeSecretEquals("abc123", "abc124")).toBe(false);
    expect(safeSecretEquals("short", "much-longer")).toBe(false);
  });

  it("validates csrf and task interrupt tokens", () => {
    const csrf = getCsrfToken();
    const req = {
      ...mockRequest({
        "x-csrf-token": csrf,
      }),
      method: "POST",
    } as Request;
    expect(csrfTokenFromRequest(req)).toBe(csrf);
    expect(shouldRequireCsrf(req)).toBe(true);
    expect(hasValidCsrfToken(req)).toBe(true);

    const bearerReq = {
      ...mockRequest({
        authorization: `Bearer ${SESSION_AUTH_TOKEN}`,
      }),
      method: "POST",
    } as Request;
    expect(shouldRequireCsrf(bearerReq)).toBe(false);

    const token = buildTaskInterruptControlToken("task-1", "session-1");
    expect(hasValidTaskInterruptControlToken("task-1", "session-1", token)).toBe(true);
    expect(hasValidTaskInterruptControlToken("task-1", "session-1", `${token}x`)).toBe(false);
  });
});

describe("installSecurityMiddleware", () => {
  it("issues a session cookie and protects non-public APIs", async () => {
    const app = express();
    installSecurityMiddleware(app);
    app.get("/api/protected", (_req, res) => {
      res.json({ ok: true });
    });

    await request(app).get("/api/protected").expect(401);

    const sessionRes = await request(app).get("/api/auth/session").expect(200);
    const cookieHeader = sessionRes.headers["set-cookie"]?.[0];
    expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(sessionRes.body?.csrf_token).toBeTypeOf("string");

    await request(app).get("/api/protected").set("Cookie", String(cookieHeader)).expect(200, { ok: true });
  });

  it("protects /api/agents and /api/subagents/catalog until a session is established", async () => {
    const app = express();
    installSecurityMiddleware(app);
    app.get("/api/agents", (_req, res) => {
      res.json({ ok: true, scope: "agents" });
    });
    app.get("/api/subagents/catalog", (_req, res) => {
      res.json({ ok: true, scope: "subagents" });
    });

    await request(app).get("/api/agents").expect(401);
    await request(app).get("/api/subagents/catalog").expect(401);

    const sessionRes = await request(app).get("/api/auth/session").expect(200);
    const cookieHeader = sessionRes.headers["set-cookie"]?.[0];
    expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);

    await request(app)
      .get("/api/agents")
      .set("Cookie", String(cookieHeader))
      .expect(200, { ok: true, scope: "agents" });
    await request(app)
      .get("/api/subagents/catalog")
      .set("Cookie", String(cookieHeader))
      .expect(200, { ok: true, scope: "subagents" });
  });
});
