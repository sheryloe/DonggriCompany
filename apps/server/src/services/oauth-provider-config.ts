import type { OAuthProvider } from "@workspace/shared";

import { badRequest } from "../errors.js";

export type OAuthProviderConfig = {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  scope: string | null;
};

export const resolveOAuthProviderConfig = (
  provider: OAuthProvider
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

export const isOAuthProviderConfigured = (provider: OAuthProvider): boolean => {
  try {
    resolveOAuthProviderConfig(provider);
    return true;
  } catch {
    return false;
  }
};
