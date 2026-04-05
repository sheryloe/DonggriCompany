import {
  OAuthSessionService
} from "@workspace/db";
import type {
  OAuthDisconnectResponse,
  OAuthStartResponse,
  OAuthStatusResponse,
  ProviderUsageProbeProvider
} from "@workspace/shared";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { badRequest } from "../errors.js";

type OAuthProviderConfig = {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  scope: string | null;
};

const providerSchema = z.enum(["claude", "codex", "gemini"]);

const oauthStartSchema = z.object({
  accountPoolId: z.string().min(1),
  clientOrigin: z.string().url().optional()
});

const oauthDisconnectSchema = z.object({
  accountPoolId: z.string().min(1)
});

const oauthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

const toBase64Url = (input: Buffer): string => {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const createCodeVerifier = (): string => toBase64Url(randomBytes(48));

const createCodeChallenge = (verifier: string): string => {
  return toBase64Url(createHash("sha256").update(verifier, "utf8").digest());
};

const resolveProviderConfig = (
  provider: ProviderUsageProbeProvider
): OAuthProviderConfig => {
  const prefix = `OFFICE_OAUTH_${provider.toUpperCase()}`;
  const authorizationUrl = process.env[`${prefix}_AUTH_URL`] ?? "";
  const tokenUrl = process.env[`${prefix}_TOKEN_URL`] ?? "";
  const clientId = process.env[`${prefix}_CLIENT_ID`] ?? "";
  const redirectUri = process.env[`${prefix}_REDIRECT_URI`] ?? "";
  const scope = process.env[`${prefix}_SCOPE`] ?? null;
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`] ?? null;

  if (!authorizationUrl || !tokenUrl || !clientId || !redirectUri) {
    throw badRequest(`OAuth provider '${provider}' is not configured`);
  }

  return {
    authorizationUrl,
    tokenUrl,
    clientId,
    clientSecret,
    redirectUri,
    scope
  };
};

const getEncryptionKey = (): Buffer => {
  const rawKey = process.env.OFFICE_OAUTH_ENCRYPTION_KEY ?? "";
  if (!rawKey) {
    throw badRequest("OFFICE_OAUTH_ENCRYPTION_KEY is required");
  }
  return createHash("sha256").update(rawKey, "utf8").digest();
};

const encryptSecret = (plainText: string): string => {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const cipherText = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${toBase64Url(iv)}.${toBase64Url(authTag)}.${toBase64Url(cipherText)}`;
};

const createPopupResultHtml = (
  payload: {
    provider: ProviderUsageProbeProvider;
    accountPoolId: string;
    status: "connected" | "error";
    message: string;
  },
  clientOrigin: string | null
): string => {
  const safeOrigin = clientOrigin ?? "";
  const safePayload = JSON.stringify({
    type: "donggri-oauth-result",
    ...payload
  });
  const targetOrigin = safeOrigin ? JSON.stringify(safeOrigin) : "window.location.origin";
  const safeMessage = payload.message.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>OAuth Result</title></head>
<body>
  <p>${safeMessage}</p>
  <script>
    (function() {
      var payload = ${safePayload};
      var targetOrigin = ${targetOrigin};
      if (window.opener && typeof window.opener.postMessage === "function") {
        try {
          window.opener.postMessage(payload, targetOrigin);
        } catch (error) {
          console.error(error);
        }
      }
      setTimeout(function () {
        window.close();
      }, 120);
    })();
  </script>
</body>
</html>`;
};

const exchangeAuthorizationCode = async (
  config: OAuthProviderConfig,
  code: string,
  codeVerifier: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresAt: string | null;
}> => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier
  });
  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${responseText.slice(0, 400)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) {
    throw new Error("Token response missing access_token");
  }

  const refreshToken =
    typeof payload.refresh_token === "string" ? payload.refresh_token : null;
  const tokenType = typeof payload.token_type === "string" ? payload.token_type : null;
  const scope = typeof payload.scope === "string" ? payload.scope : config.scope;
  const expiresIn =
    typeof payload.expires_in === "number"
      ? payload.expires_in
      : typeof payload.expires_in === "string"
        ? Number(payload.expires_in)
        : Number.NaN;
  const expiresAt = Number.isFinite(expiresIn)
    ? new Date(Date.now() + Math.max(0, expiresIn) * 1000).toISOString()
    : null;

  return {
    accessToken,
    refreshToken,
    tokenType,
    scope,
    expiresAt
  };
};

export const registerOAuthRoutes = (server: FastifyInstance): void => {
  const oauthService = new OAuthSessionService();

  server.post(
    "/api/oauth/:provider/start",
    async (request): Promise<OAuthStartResponse> => {
      const params = request.params as { provider?: string };
      const provider = providerSchema.parse(params.provider) as ProviderUsageProbeProvider;
      const parsedBody = oauthStartSchema.safeParse(request.body);
      if (!parsedBody.success) {
        throw badRequest(parsedBody.error.issues[0]?.message ?? "Invalid oauth start payload");
      }

      const config = resolveProviderConfig(provider);
      const state = toBase64Url(randomBytes(24));
      const codeVerifier = createCodeVerifier();
      const codeChallenge = createCodeChallenge(codeVerifier);
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

      oauthService.createPkceState({
        provider,
        accountPoolId: parsedBody.data.accountPoolId,
        stateToken: state,
        codeVerifier,
        redirectUri: config.redirectUri,
        clientOrigin: parsedBody.data.clientOrigin ?? null,
        expiresAt
      });

      const authorizeUrl = new URL(config.authorizationUrl);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("client_id", config.clientId);
      authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("code_challenge", codeChallenge);
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
      if (config.scope) {
        authorizeUrl.searchParams.set("scope", config.scope);
      }

      return {
        ok: true,
        provider,
        accountPoolId: parsedBody.data.accountPoolId,
        authorizeUrl: authorizeUrl.toString(),
        state,
        expiresAt
      };
    }
  );

  server.get(
    "/api/oauth/:provider/callback",
    async (request, reply): Promise<string> => {
      const params = request.params as { provider?: string };
      const provider = providerSchema.parse(params.provider) as ProviderUsageProbeProvider;
      const parsedQuery = oauthCallbackQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        throw badRequest("Invalid oauth callback query");
      }
      if (!parsedQuery.data.state) {
        throw badRequest("OAuth callback state is required");
      }

      const stateRecord = oauthService.consumePkceState(provider, parsedQuery.data.state);
      const config = resolveProviderConfig(provider);

      if (parsedQuery.data.error) {
        const message = `${parsedQuery.data.error}${parsedQuery.data.error_description ? `: ${parsedQuery.data.error_description}` : ""}`;
        oauthService.markSessionError(provider, stateRecord.accountPoolId, message);
        reply.type("text/html; charset=utf-8");
        return createPopupResultHtml(
          {
            provider,
            accountPoolId: stateRecord.accountPoolId,
            status: "error",
            message: `OAuth failed (${message})`
          },
          stateRecord.clientOrigin
        );
      }

      if (!parsedQuery.data.code) {
        throw badRequest("OAuth callback code is required");
      }

      try {
        const token = await exchangeAuthorizationCode(
          config,
          parsedQuery.data.code,
          stateRecord.codeVerifier
        );

        oauthService.upsertConnectedSession({
          provider,
          accountPoolId: stateRecord.accountPoolId,
          accessTokenEncrypted: encryptSecret(token.accessToken),
          refreshTokenEncrypted: token.refreshToken ? encryptSecret(token.refreshToken) : null,
          tokenType: token.tokenType,
          scope: token.scope,
          expiresAt: token.expiresAt
        });

        reply.type("text/html; charset=utf-8");
        return createPopupResultHtml(
          {
            provider,
            accountPoolId: stateRecord.accountPoolId,
            status: "connected",
            message: "OAuth connected successfully"
          },
          stateRecord.clientOrigin
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "OAuth token exchange failed";
        oauthService.markSessionError(provider, stateRecord.accountPoolId, message);
        reply.type("text/html; charset=utf-8");
        return createPopupResultHtml(
          {
            provider,
            accountPoolId: stateRecord.accountPoolId,
            status: "error",
            message
          },
          stateRecord.clientOrigin
        );
      }
    }
  );

  server.get(
    "/api/oauth/:provider/status",
    async (request): Promise<OAuthStatusResponse> => {
      const params = request.params as { provider?: string };
      const provider = providerSchema.parse(params.provider) as ProviderUsageProbeProvider;
      const query = request.query as { accountPoolId?: string } | undefined;
      const sessions = oauthService.listStatus(provider, query?.accountPoolId);
      return {
        ok: true,
        provider,
        sessions
      };
    }
  );

  server.post(
    "/api/oauth/:provider/disconnect",
    async (request): Promise<OAuthDisconnectResponse> => {
      const params = request.params as { provider?: string };
      const provider = providerSchema.parse(params.provider) as ProviderUsageProbeProvider;
      const parsedBody = oauthDisconnectSchema.safeParse(request.body);
      if (!parsedBody.success) {
        throw badRequest(parsedBody.error.issues[0]?.message ?? "Invalid oauth disconnect payload");
      }

      oauthService.disconnect(provider, parsedBody.data.accountPoolId);
      return {
        ok: true,
        provider,
        accountPoolId: parsedBody.data.accountPoolId,
        disconnected: true
      };
    }
  );
};
