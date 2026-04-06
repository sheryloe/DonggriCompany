import { randomUUID } from "node:crypto";

import type {
  OAuthProvider,
  OAuthSessionStatusView,
} from "@workspace/shared";
import { z } from "zod";

import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { AccountPoolRepository } from "./account-pool-repository.js";
import { dbBadRequest, dbNotFound } from "./errors.js";
import { OAuthSessionRepository, type OAuthPkceStateRecord } from "./oauth-session-repository.js";
import type { OAuthSessionInternalRecord } from "./oauth-session-repository.js";

const providerSchema = z.enum(["claude", "codex", "gemini", "github", "google"]);

const createPkceStateSchema = z.object({
  provider: providerSchema,
  accountPoolId: z.string().min(1),
  stateToken: z.string().min(16),
  codeVerifier: z.string().min(32),
  redirectUri: z.string().url(),
  clientOrigin: z.string().min(1).nullable(),
  expiresAt: z.string().datetime()
});

type CreatePkceStateInput = z.infer<typeof createPkceStateSchema>;

type UpsertConnectedSessionInput = {
  provider: OAuthProvider;
  accountPoolId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresAt: string | null;
  refreshTokenExpiresAt?: string | null;
  lastRefreshedAt?: string | null;
  refreshFailCount?: number;
};

export class OAuthSessionService {
  constructor(
    private readonly dbPath = getDbPath(),
    private readonly sessionRepository = new OAuthSessionRepository(),
    private readonly accountPoolRepository = new AccountPoolRepository()
  ) {}

  createPkceState(payload: CreatePkceStateInput): OAuthPkceStateRecord {
    const parsed = createPkceStateSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid oauth start payload");
    }

    return withDatabase((db) => {
      const accountPool = this.accountPoolRepository.getById(db, parsed.data.accountPoolId);
      if (!accountPool) {
        throw dbNotFound(`Account pool not found: ${parsed.data.accountPoolId}`);
      }
      const nowIso = new Date().toISOString();
      this.sessionRepository.cleanupExpiredPkceStates(db, nowIso);
      return this.sessionRepository.createPkceState(
        db,
        {
          id: randomUUID(),
          provider: parsed.data.provider,
          accountPoolId: parsed.data.accountPoolId,
          stateToken: parsed.data.stateToken,
          codeVerifier: parsed.data.codeVerifier,
          redirectUri: parsed.data.redirectUri,
          clientOrigin: parsed.data.clientOrigin,
          expiresAt: parsed.data.expiresAt
        },
        nowIso
      );
    }, this.dbPath);
  }

  consumePkceState(provider: OAuthProvider, stateToken: string): OAuthPkceStateRecord {
    const parsedProvider = providerSchema.safeParse(provider);
    if (!parsedProvider.success) {
      throw dbBadRequest("Invalid provider");
    }
    if (!stateToken || stateToken.length < 16) {
      throw dbBadRequest("Invalid oauth state token");
    }

    return withDatabase((db) => {
      const nowIso = new Date().toISOString();
      this.sessionRepository.cleanupExpiredPkceStates(db, nowIso);
      const existing = this.sessionRepository.getPkceState(db, parsedProvider.data, stateToken);
      if (!existing) {
        throw dbNotFound("OAuth state not found or expired");
      }
      if (existing.expiresAt < nowIso) {
        this.sessionRepository.deletePkceState(db, existing.id);
        throw dbBadRequest("OAuth state expired");
      }

      this.sessionRepository.deletePkceState(db, existing.id);
      return existing;
    }, this.dbPath);
  }

  upsertConnectedSession(payload: UpsertConnectedSessionInput): OAuthSessionStatusView {
    const providerParsed = providerSchema.safeParse(payload.provider);
    if (!providerParsed.success) {
      throw dbBadRequest("Invalid provider");
    }
    if (!payload.accountPoolId) {
      throw dbBadRequest("accountPoolId is required");
    }
    if (!payload.accessTokenEncrypted) {
      throw dbBadRequest("accessTokenEncrypted is required");
    }

    return withDatabase((db) => {
      const accountPool = this.accountPoolRepository.getById(db, payload.accountPoolId);
      if (!accountPool) {
        throw dbNotFound(`Account pool not found: ${payload.accountPoolId}`);
      }
      const upserted = this.sessionRepository.upsertSession(
        db,
        {
          provider: providerParsed.data,
          accountPoolId: payload.accountPoolId,
          accessTokenEncrypted: payload.accessTokenEncrypted,
          refreshTokenEncrypted: payload.refreshTokenEncrypted,
          tokenType: payload.tokenType,
          scope: payload.scope,
          expiresAt: payload.expiresAt,
          refreshTokenExpiresAt: payload.refreshTokenExpiresAt ?? null,
          lastRefreshedAt: payload.lastRefreshedAt ?? new Date().toISOString(),
          refreshFailCount: payload.refreshFailCount ?? 0,
          status: "connected",
          lastError: null
        },
        new Date().toISOString()
      );

      return {
        provider: upserted.provider,
        accountPoolId: upserted.accountPoolId,
        status: upserted.status,
        connected: upserted.connected,
        expiresAt: upserted.expiresAt,
        refreshTokenExpiresAt: upserted.refreshTokenExpiresAt,
        lastRefreshedAt: upserted.lastRefreshedAt,
        refreshFailCount: upserted.refreshFailCount,
        updatedAt: upserted.updatedAt,
        lastError: upserted.lastError
      };
    }, this.dbPath);
  }

  markSessionError(
    provider: OAuthProvider,
    accountPoolId: string,
    message: string
  ): OAuthSessionStatusView {
    const providerParsed = providerSchema.safeParse(provider);
    if (!providerParsed.success) {
      throw dbBadRequest("Invalid provider");
    }
    if (!accountPoolId) {
      throw dbBadRequest("accountPoolId is required");
    }

    return withDatabase((db) => {
      const accountPool = this.accountPoolRepository.getById(db, accountPoolId);
      if (!accountPool) {
        throw dbNotFound(`Account pool not found: ${accountPoolId}`);
      }
      const upserted = this.sessionRepository.upsertSession(
        db,
        {
          provider: providerParsed.data,
          accountPoolId,
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
          tokenType: null,
          scope: null,
          expiresAt: null,
          refreshTokenExpiresAt: null,
          lastRefreshedAt: null,
          refreshFailCount: 0,
          status: "error",
          lastError: message
        },
        new Date().toISOString()
      );

      return {
        provider: upserted.provider,
        accountPoolId: upserted.accountPoolId,
        status: upserted.status,
        connected: upserted.connected,
        expiresAt: upserted.expiresAt,
        refreshTokenExpiresAt: upserted.refreshTokenExpiresAt,
        lastRefreshedAt: upserted.lastRefreshedAt,
        refreshFailCount: upserted.refreshFailCount,
        updatedAt: upserted.updatedAt,
        lastError: upserted.lastError
      };
    }, this.dbPath);
  }

  recordRefreshFailure(
    provider: OAuthProvider,
    accountPoolId: string,
    message: string
  ): OAuthSessionStatusView {
    const providerParsed = providerSchema.safeParse(provider);
    if (!providerParsed.success) {
      throw dbBadRequest("Invalid provider");
    }
    if (!accountPoolId) {
      throw dbBadRequest("accountPoolId is required");
    }

    return withDatabase((db) => {
      const accountPool = this.accountPoolRepository.getById(db, accountPoolId);
      if (!accountPool) {
        throw dbNotFound(`Account pool not found: ${accountPoolId}`);
      }
      const existing = this.sessionRepository.getSession(db, providerParsed.data, accountPoolId);
      const nextFailCount = (existing?.refreshFailCount ?? 0) + 1;
      const upserted = this.sessionRepository.upsertSession(
        db,
        {
          provider: providerParsed.data,
          accountPoolId,
          accessTokenEncrypted: existing?.accessTokenEncrypted ?? null,
          refreshTokenEncrypted: existing?.refreshTokenEncrypted ?? null,
          tokenType: existing?.tokenType ?? null,
          scope: existing?.scope ?? null,
          expiresAt: existing?.expiresAt ?? null,
          refreshTokenExpiresAt: existing?.refreshTokenExpiresAt ?? null,
          lastRefreshedAt: existing?.lastRefreshedAt ?? null,
          refreshFailCount: nextFailCount,
          status: "error",
          lastError: message
        },
        new Date().toISOString()
      );

      return {
        provider: upserted.provider,
        accountPoolId: upserted.accountPoolId,
        status: upserted.status,
        connected: upserted.connected,
        expiresAt: upserted.expiresAt,
        refreshTokenExpiresAt: upserted.refreshTokenExpiresAt,
        lastRefreshedAt: upserted.lastRefreshedAt,
        refreshFailCount: upserted.refreshFailCount,
        updatedAt: upserted.updatedAt,
        lastError: upserted.lastError
      };
    }, this.dbPath);
  }

  disconnect(
    provider: OAuthProvider,
    accountPoolId: string
  ): OAuthSessionStatusView {
    const providerParsed = providerSchema.safeParse(provider);
    if (!providerParsed.success) {
      throw dbBadRequest("Invalid provider");
    }
    if (!accountPoolId) {
      throw dbBadRequest("accountPoolId is required");
    }

    return withDatabase((db) => {
      const accountPool = this.accountPoolRepository.getById(db, accountPoolId);
      if (!accountPool) {
        throw dbNotFound(`Account pool not found: ${accountPoolId}`);
      }
      const upserted = this.sessionRepository.upsertSession(
        db,
        {
          provider: providerParsed.data,
          accountPoolId,
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
          tokenType: null,
          scope: null,
          expiresAt: null,
          refreshTokenExpiresAt: null,
          lastRefreshedAt: null,
          refreshFailCount: 0,
          status: "disconnected",
          lastError: null
        },
        new Date().toISOString()
      );

      return {
        provider: upserted.provider,
        accountPoolId: upserted.accountPoolId,
        status: upserted.status,
        connected: upserted.connected,
        expiresAt: upserted.expiresAt,
        refreshTokenExpiresAt: upserted.refreshTokenExpiresAt,
        lastRefreshedAt: upserted.lastRefreshedAt,
        refreshFailCount: upserted.refreshFailCount,
        updatedAt: upserted.updatedAt,
        lastError: upserted.lastError
      };
    }, this.dbPath);
  }

  listStatus(
    provider: OAuthProvider,
    accountPoolId?: string
  ): OAuthSessionStatusView[] {
    const providerParsed = providerSchema.safeParse(provider);
    if (!providerParsed.success) {
      throw dbBadRequest("Invalid provider");
    }

    return withDatabase((db) => {
      const sessions = this.sessionRepository.listSessionsByProvider(db, providerParsed.data);
      const pools = this.accountPoolRepository.list(db);
      const sessionByPoolId = new Map(sessions.map((session) => [session.accountPoolId, session]));

      const filteredPools = accountPoolId
        ? pools.filter((pool) => pool.id === accountPoolId)
        : pools;

      if (accountPoolId && filteredPools.length === 0) {
        throw dbNotFound(`Account pool not found: ${accountPoolId}`);
      }

      return filteredPools.map((pool) => {
        const session = sessionByPoolId.get(pool.id);
        if (session) {
          return {
            provider: session.provider,
            accountPoolId: session.accountPoolId,
            status: session.status,
            connected: session.connected,
            expiresAt: session.expiresAt,
            refreshTokenExpiresAt: session.refreshTokenExpiresAt,
            lastRefreshedAt: session.lastRefreshedAt,
            refreshFailCount: session.refreshFailCount,
            updatedAt: session.updatedAt,
            lastError: session.lastError
          };
        }

        return {
          provider: providerParsed.data,
          accountPoolId: pool.id,
          status: "disconnected",
          connected: false,
          expiresAt: null,
          refreshTokenExpiresAt: null,
          lastRefreshedAt: null,
          refreshFailCount: 0,
          updatedAt: pool.updatedAt,
          lastError: null
        };
      });
    }, this.dbPath);
  }

  getInternalSession(
    provider: OAuthProvider,
    accountPoolId: string
  ): OAuthSessionInternalRecord | null {
    const providerParsed = providerSchema.safeParse(provider);
    if (!providerParsed.success) {
      throw dbBadRequest("Invalid provider");
    }
    if (!accountPoolId) {
      throw dbBadRequest("accountPoolId is required");
    }

    return withDatabase((db) => {
      return this.sessionRepository.getSession(db, providerParsed.data, accountPoolId);
    }, this.dbPath);
  }
}
