import type {
  OAuthSessionStatus,
  OAuthSessionStatusView,
  ProviderUsageProbeProvider
} from "@workspace/shared";

import type { DatabaseHandle } from "../database.js";

type OAuthPkceStateRow = {
  id: string;
  provider: ProviderUsageProbeProvider;
  account_pool_id: string;
  state_token: string;
  code_verifier: string;
  redirect_uri: string;
  client_origin: string | null;
  expires_at: string;
  created_at: string;
};

type OAuthSessionRow = {
  id: string;
  provider: ProviderUsageProbeProvider;
  account_pool_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
  status: OAuthSessionStatus;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type OAuthPkceStateInput = {
  id: string;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  stateToken: string;
  codeVerifier: string;
  redirectUri: string;
  clientOrigin: string | null;
  expiresAt: string;
};

export type OAuthPkceStateRecord = {
  id: string;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  stateToken: string;
  codeVerifier: string;
  redirectUri: string;
  clientOrigin: string | null;
  expiresAt: string;
  createdAt: string;
};

export type OAuthSessionUpsertInput = {
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresAt: string | null;
  status: OAuthSessionStatus;
  lastError: string | null;
};

export type OAuthSessionInternalRecord = OAuthSessionStatusView & {
  id: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenType: string | null;
  scope: string | null;
  createdAt: string;
};

const mapPkceStateRow = (row: OAuthPkceStateRow): OAuthPkceStateRecord => {
  return {
    id: row.id,
    provider: row.provider,
    accountPoolId: row.account_pool_id,
    stateToken: row.state_token,
    codeVerifier: row.code_verifier,
    redirectUri: row.redirect_uri,
    clientOrigin: row.client_origin,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
};

const mapSessionRow = (row: OAuthSessionRow): OAuthSessionInternalRecord => {
  return {
    id: row.id,
    provider: row.provider,
    accountPoolId: row.account_pool_id,
    status: row.status,
    connected: row.status === "connected",
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    tokenType: row.token_type,
    scope: row.scope,
    createdAt: row.created_at
  };
};

export class OAuthSessionRepository {
  cleanupExpiredPkceStates(db: DatabaseHandle, nowIso: string): void {
    db.prepare("DELETE FROM oauth_pkce_states WHERE expires_at < ?").run(nowIso);
  }

  createPkceState(db: DatabaseHandle, input: OAuthPkceStateInput, nowIso: string): OAuthPkceStateRecord {
    db.prepare(
      `
      INSERT INTO oauth_pkce_states (
        id,
        provider,
        account_pool_id,
        state_token,
        code_verifier,
        redirect_uri,
        client_origin,
        expires_at,
        created_at
      )
      VALUES (
        @id,
        @provider,
        @account_pool_id,
        @state_token,
        @code_verifier,
        @redirect_uri,
        @client_origin,
        @expires_at,
        @created_at
      )
      `
    ).run({
      id: input.id,
      provider: input.provider,
      account_pool_id: input.accountPoolId,
      state_token: input.stateToken,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      client_origin: input.clientOrigin,
      expires_at: input.expiresAt,
      created_at: nowIso
    });

    const row = db
      .prepare(
        `
        SELECT
          id,
          provider,
          account_pool_id,
          state_token,
          code_verifier,
          redirect_uri,
          client_origin,
          expires_at,
          created_at
        FROM oauth_pkce_states
        WHERE state_token = ?
        LIMIT 1
        `
      )
      .get(input.stateToken) as OAuthPkceStateRow | undefined;

    if (!row) {
      throw new Error("Failed to create oauth pkce state");
    }
    return mapPkceStateRow(row);
  }

  getPkceState(db: DatabaseHandle, provider: ProviderUsageProbeProvider, stateToken: string): OAuthPkceStateRecord | null {
    const row = db
      .prepare(
        `
        SELECT
          id,
          provider,
          account_pool_id,
          state_token,
          code_verifier,
          redirect_uri,
          client_origin,
          expires_at,
          created_at
        FROM oauth_pkce_states
        WHERE provider = ? AND state_token = ?
        LIMIT 1
        `
      )
      .get(provider, stateToken) as OAuthPkceStateRow | undefined;
    return row ? mapPkceStateRow(row) : null;
  }

  deletePkceState(db: DatabaseHandle, id: string): void {
    db.prepare("DELETE FROM oauth_pkce_states WHERE id = ?").run(id);
  }

  upsertSession(
    db: DatabaseHandle,
    input: OAuthSessionUpsertInput,
    nowIso: string
  ): OAuthSessionInternalRecord {
    const stableId = `oauth:${input.provider}:${input.accountPoolId}`;
    db.prepare(
      `
      INSERT INTO oauth_sessions (
        id,
        provider,
        account_pool_id,
        access_token_encrypted,
        refresh_token_encrypted,
        token_type,
        scope,
        expires_at,
        status,
        last_error,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @provider,
        @account_pool_id,
        @access_token_encrypted,
        @refresh_token_encrypted,
        @token_type,
        @scope,
        @expires_at,
        @status,
        @last_error,
        @created_at,
        @updated_at
      )
      ON CONFLICT(provider, account_pool_id) DO UPDATE SET
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        token_type = excluded.token_type,
        scope = excluded.scope,
        expires_at = excluded.expires_at,
        status = excluded.status,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
      `
    ).run({
      id: stableId,
      provider: input.provider,
      account_pool_id: input.accountPoolId,
      access_token_encrypted: input.accessTokenEncrypted,
      refresh_token_encrypted: input.refreshTokenEncrypted,
      token_type: input.tokenType,
      scope: input.scope,
      expires_at: input.expiresAt,
      status: input.status,
      last_error: input.lastError,
      created_at: nowIso,
      updated_at: nowIso
    });

    const row = db
      .prepare(
        `
        SELECT
          id,
          provider,
          account_pool_id,
          access_token_encrypted,
          refresh_token_encrypted,
          token_type,
          scope,
          expires_at,
          status,
          last_error,
          created_at,
          updated_at
        FROM oauth_sessions
        WHERE provider = ? AND account_pool_id = ?
        LIMIT 1
        `
      )
      .get(input.provider, input.accountPoolId) as OAuthSessionRow | undefined;

    if (!row) {
      throw new Error("Failed to upsert oauth session");
    }
    return mapSessionRow(row);
  }

  getSession(
    db: DatabaseHandle,
    provider: ProviderUsageProbeProvider,
    accountPoolId: string
  ): OAuthSessionInternalRecord | null {
    const row = db
      .prepare(
        `
        SELECT
          id,
          provider,
          account_pool_id,
          access_token_encrypted,
          refresh_token_encrypted,
          token_type,
          scope,
          expires_at,
          status,
          last_error,
          created_at,
          updated_at
        FROM oauth_sessions
        WHERE provider = ? AND account_pool_id = ?
        LIMIT 1
        `
      )
      .get(provider, accountPoolId) as OAuthSessionRow | undefined;
    return row ? mapSessionRow(row) : null;
  }

  listSessionsByProvider(
    db: DatabaseHandle,
    provider: ProviderUsageProbeProvider
  ): OAuthSessionInternalRecord[] {
    const rows = db
      .prepare(
        `
        SELECT
          id,
          provider,
          account_pool_id,
          access_token_encrypted,
          refresh_token_encrypted,
          token_type,
          scope,
          expires_at,
          status,
          last_error,
          created_at,
          updated_at
        FROM oauth_sessions
        WHERE provider = ?
        ORDER BY updated_at DESC
        `
      )
      .all(provider) as OAuthSessionRow[];
    return rows.map(mapSessionRow);
  }
}
