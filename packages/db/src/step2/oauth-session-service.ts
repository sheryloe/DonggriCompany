import { randomUUID } from "node:crypto";

import type {
  OAuthSessionStatusView,
  ProviderUsageProbeProvider
} from "@workspace/shared";
import { z } from "zod";

import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { AccountPoolRepository } from "./account-pool-repository.js";
import { dbBadRequest, dbNotFound } from "./errors.js";
import { OAuthSessionRepository, type OAuthPkceStateRecord } from "./oauth-session-repository.js";

const providerSchema = z.enum(["claude", "codex", "gemini"]);

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
  provider: ProviderUsageProbeProvider;
  accountPoolId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresAt: string | null;
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
      if (accountPool.provider !== parsed.data.provider) {
        throw dbBadRequest(
          `Account pool provider mismatch: expected ${parsed.data.provider}, got ${accountPool.provider}`
        );
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

  consumePkceState(provider: ProviderUsageProbeProvider, stateToken: string): OAuthPkceStateRecord {
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
      if (accountPool.provider !== providerParsed.data) {
        throw dbBadRequest(
          `Account pool provider mismatch: expected ${providerParsed.data}, got ${accountPool.provider}`
        );
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
        updatedAt: upserted.updatedAt,
        lastError: upserted.lastError
      };
    }, this.dbPath);
  }

  markSessionError(
    provider: ProviderUsageProbeProvider,
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
      if (accountPool.provider !== providerParsed.data) {
        throw dbBadRequest(
          `Account pool provider mismatch: expected ${providerParsed.data}, got ${accountPool.provider}`
        );
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
        updatedAt: upserted.updatedAt,
        lastError: upserted.lastError
      };
    }, this.dbPath);
  }

  disconnect(
    provider: ProviderUsageProbeProvider,
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
      if (accountPool.provider !== providerParsed.data) {
        throw dbBadRequest(
          `Account pool provider mismatch: expected ${providerParsed.data}, got ${accountPool.provider}`
        );
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
        updatedAt: upserted.updatedAt,
        lastError: upserted.lastError
      };
    }, this.dbPath);
  }

  listStatus(
    provider: ProviderUsageProbeProvider,
    accountPoolId?: string
  ): OAuthSessionStatusView[] {
    const providerParsed = providerSchema.safeParse(provider);
    if (!providerParsed.success) {
      throw dbBadRequest("Invalid provider");
    }

    return withDatabase((db) => {
      const sessions = this.sessionRepository.listSessionsByProvider(db, providerParsed.data);
      const pools = this.accountPoolRepository
        .list(db)
        .filter((pool) => pool.provider === providerParsed.data);
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
          updatedAt: pool.updatedAt,
          lastError: null
        };
      });
    }, this.dbPath);
  }
}
