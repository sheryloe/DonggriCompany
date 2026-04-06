import type { FastifyInstance } from "fastify";
import { OAuthService, decryptSecret } from "@workspace/db";
import { badRequest } from "../errors.js";

const oauthService = new OAuthService();

const OAUTH_BASE_URL = process.env.OAUTH_BASE_URL ?? "http://localhost:4315";

export const registerOAuthRoutes = (server: FastifyInstance): void => {
  // ── 상태 조회 ────────────────────────────────────────────────────
  server.get("/api/oauth/status", async () => oauthService.getStatus());

  // ── GitHub OAuth 시작 ────────────────────────────────────────────
  server.get("/api/oauth/start/github", async (request, reply) => {
    const query = request.query as { redirect_to?: string };
    const { authorizeUrl } = oauthService.startGitHub(query.redirect_to);
    return reply.redirect(302, authorizeUrl);
  });

  // ── Google OAuth 시작 ────────────────────────────────────────────
  server.get("/api/oauth/start/google", async (request, reply) => {
    const query = request.query as { redirect_to?: string };
    const { authorizeUrl } = oauthService.startGoogle(query.redirect_to);
    return reply.redirect(302, authorizeUrl);
  });

  // ── GitHub Callback ──────────────────────────────────────────────
  server.get("/api/oauth/callback/github", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    if (query.error || !query.code || !query.state) {
      return reply.redirect(302, `${OAUTH_BASE_URL.replace(/:4315/, ":7777")}/?oauth_error=${query.error ?? "missing_code"}`);
    }

    const state = oauthService.consumeState(query.state, "github");
    if (!state) {
      return reply.redirect(302, `${OAUTH_BASE_URL.replace(/:4315/, ":7777")}/?oauth_error=invalid_state`);
    }

    try {
      const clientId = process.env.OAUTH_GITHUB_CLIENT_ID;
      const clientSecret = process.env.OAUTH_GITHUB_CLIENT_SECRET;
      if (!clientId) throw new Error("OAUTH_GITHUB_CLIENT_ID not configured");

      const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: query.code,
          redirect_uri: `${OAUTH_BASE_URL}/api/oauth/callback/github`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const tokenData = (await tokenResp.json()) as { access_token?: string; error?: string; scope?: string };
      if (!tokenData.access_token) throw new Error(tokenData.error ?? "No access token");

      let email: string | null = null;
      try {
        const emailsResp = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "DonggriCompany", Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(5_000),
        });
        if (emailsResp.ok) {
          const emails = (await emailsResp.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
          email = emails.find((e) => e.primary && e.verified)?.email ?? null;
        }
      } catch { /* best-effort */ }

      oauthService.upsertAccount({
        provider: "github", source: "web-oauth", email,
        scope: tokenData.scope ?? null, accessToken: tokenData.access_token,
        refreshToken: null, expiresAt: null,
      });

      return reply.redirect(302, `${OAUTH_BASE_URL.replace(/:4315/, ":7777")}/?oauth_success=github`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.redirect(302, `${OAUTH_BASE_URL.replace(/:4315/, ":7777")}/?oauth_error=${encodeURIComponent(msg)}`);
    }
  });

  // ── Google Callback ──────────────────────────────────────────────
  server.get("/api/oauth/callback/google", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    if (query.error || !query.code || !query.state) {
      return reply.redirect(302, `${OAUTH_BASE_URL.replace(/:4315/, ":7777")}/?oauth_error=${query.error ?? "missing_code"}`);
    }

    const state = oauthService.consumeState(query.state, "google");
    if (!state) {
      return reply.redirect(302, `${OAUTH_BASE_URL.replace(/:4315/, ":7777")}/?oauth_error=invalid_state`);
    }

    try {
      const clientId = process.env.OAUTH_GOOGLE_CLIENT_ID;
      const clientSecret = process.env.OAUTH_GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error("Google OAuth not configured");

      const verifier = decryptSecret(state.verifierEnc);
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId, client_secret: clientSecret, code: query.code,
          redirect_uri: `${OAUTH_BASE_URL}/api/oauth/callback/google`,
          grant_type: "authorization_code", code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const tokenData = (await tokenResp.json()) as {
        access_token?: string; refresh_token?: string; expires_in?: number; error?: string; scope?: string;
      };
      if (!tokenData.access_token) throw new Error(tokenData.error ?? "No access token");

      let email: string | null = null;
      try {
        const uResp = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }, signal: AbortSignal.timeout(5_000),
        });
        if (uResp.ok) email = ((await uResp.json()) as { email?: string }).email ?? null;
      } catch { /* best-effort */ }

      oauthService.upsertAccount({
        provider: "google", source: "web-oauth", email,
        scope: tokenData.scope ?? null, accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
      });

      return reply.redirect(302, `${OAUTH_BASE_URL.replace(/:4315/, ":7777")}/?oauth_success=google`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.redirect(302, `${OAUTH_BASE_URL.replace(/:4315/, ":7777")}/?oauth_error=${encodeURIComponent(msg)}`);
    }
  });

  // ── 연결 해제 ────────────────────────────────────────────────────
  server.post("/api/oauth/disconnect", async (request) => {
    const body = request.body as { provider?: string; accountId?: string };
    if (!body.provider) throw badRequest("provider is required");
    oauthService.disconnect(body.provider, body.accountId);
    return { ok: true };
  });
};
