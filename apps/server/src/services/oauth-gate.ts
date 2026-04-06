import { OAuthSessionService } from "@workspace/db";
import type { ProviderUsageProbeProvider } from "@workspace/shared";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { badRequest } from "../errors.js";
import { resolveOAuthProviderConfig } from "./oauth-provider-config.js";

const fromBase64Url = (input: string): Buffer => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  return Buffer.from(normalized + "=".repeat(padding), "base64");
};

const getEncryptionKey = (): Buffer => {
  const rawKey = process.env.OFFICE_OAUTH_ENCRYPTION_KEY ?? "";
  if (!rawKey) {
    throw badRequest("OFFICE_OAUTH_ENCRYPTION_KEY is required");
  }
  return createHash("sha256").update(rawKey, "utf8").digest();
};

const decryptSecret = (payload: string): string => {
  const [ivBase64, authTagBase64, cipherBase64] = payload.split(".");
  if (!ivBase64 || !authTagBase64 || !cipherBase64) {
    throw badRequest("Invalid encrypted oauth payload");
  }

  const key = getEncryptionKey();
  const iv = fromBase64Url(ivBase64);
  const authTag = fromBase64Url(authTagBase64);
  const cipherText = fromBase64Url(cipherBase64);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plainText = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return plainText.toString("utf8");
};

const toBase64Url = (input: Buffer): string => {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const encryptSecret = (plainText: string): string => {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const cipherText = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${toBase64Url(iv)}.${toBase64Url(authTag)}.${toBase64Url(cipherText)}`;
};

const parseRefreshWindowMs = (): number => {
  const parsed = Number(process.env.OFFICE_OAUTH_REFRESH_WINDOW_MS ?? 300_000);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 300_000;
  }
  return Math.floor(parsed);
};

const exchangeRefreshToken = async (
  provider: ProviderUsageProbeProvider,
  refreshToken: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresAt: string | null;
}> => {
  const config = resolveOAuthProviderConfig(provider);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId
  });
  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }
  if (config.scope) {
    body.set("scope", config.scope);
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`OAuth refresh failed (${response.status}): ${bodyText.slice(0, 240)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) {
    throw new Error("OAuth refresh response missing access_token");
  }

  const nextRefreshToken =
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
    refreshToken: nextRefreshToken,
    tokenType,
    scope,
    expiresAt
  };
};

export class OAuthGateService {
  constructor(private readonly oauthSessionService = new OAuthSessionService()) {}

  async ensureProviderPoolConnected(
    provider: ProviderUsageProbeProvider,
    accountPoolId: string
  ): Promise<void> {
    const session = this.oauthSessionService.getInternalSession(provider, accountPoolId);
    if (!session || session.status !== "connected" || !session.accessTokenEncrypted) {
      throw badRequest(
        `OAuth session is not connected for ${provider}/${accountPoolId}`
      );
    }

    if (!session.expiresAt) {
      return;
    }

    const expiresAtMs = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      return;
    }

    const refreshWindowMs = parseRefreshWindowMs();
    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs > refreshWindowMs) {
      return;
    }

    if (!session.refreshTokenEncrypted) {
      this.oauthSessionService.recordRefreshFailure(
        provider,
        accountPoolId,
        "OAuth refresh token missing"
      );
      throw badRequest(
        `OAuth session refresh failed for ${provider}/${accountPoolId}: missing refresh token`
      );
    }

    try {
      const refreshToken = decryptSecret(session.refreshTokenEncrypted);
      const refreshed = await exchangeRefreshToken(provider, refreshToken);
      const nextRefreshTokenEncrypted = refreshed.refreshToken
        ? encryptSecret(refreshed.refreshToken)
        : session.refreshTokenEncrypted;

      this.oauthSessionService.upsertConnectedSession({
        provider,
        accountPoolId,
        accessTokenEncrypted: encryptSecret(refreshed.accessToken),
        refreshTokenEncrypted: nextRefreshTokenEncrypted,
        tokenType: refreshed.tokenType,
        scope: refreshed.scope,
        expiresAt: refreshed.expiresAt,
        refreshTokenExpiresAt: session.refreshTokenExpiresAt,
        lastRefreshedAt: new Date().toISOString(),
        refreshFailCount: 0
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth refresh failed";
      this.oauthSessionService.recordRefreshFailure(provider, accountPoolId, message);
      throw badRequest(
        `OAuth session refresh failed for ${provider}/${accountPoolId}: ${message}`
      );
    }
  }
}
