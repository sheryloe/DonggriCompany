import { randomUUID } from "node:crypto";

import type {
  AccountPoolView,
  CreateAccountPoolRequest,
  FatigueSnapshotView,
  UpdateAccountPoolRequest
} from "@workspace/shared";
import { z } from "zod";

import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { AccountPoolRepository } from "./account-pool-repository.js";
import { dbBadRequest, dbConflict, dbNotFound } from "./errors.js";
import { FatigueSnapshotRepository } from "./fatigue-snapshot-repository.js";
import { RuntimeProfileRepository } from "./runtime-profile-repository.js";

const providerSchema = z.enum(["claude", "codex", "gemini"]);
const fatigueModeSchema = z.enum(["official", "derived", "manual"]);

export const createAccountPoolSchema = z.object({
  key: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "key must use lower-case letters, numbers, and hyphen"),
  provider: providerSchema,
  label: z.string().min(1).max(120),
  planTier: z.string().max(64).nullable().optional(),
  fatigueMode: fatigueModeSchema.optional(),
  maxConcurrency: z.number().int().min(1).max(20).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isEnabled: z.boolean().optional()
});

export const updateAccountPoolSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  planTier: z.string().max(64).nullable().optional(),
  fatigueMode: fatigueModeSchema.optional(),
  maxConcurrency: z.number().int().min(1).max(20).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isEnabled: z.boolean().optional()
});

export class AccountPoolService {
  constructor(
    private readonly dbPath = getDbPath(),
    private readonly accountPoolRepository = new AccountPoolRepository(),
    private readonly runtimeProfileRepository = new RuntimeProfileRepository(),
    private readonly fatigueSnapshotRepository = new FatigueSnapshotRepository()
  ) {}

  list(): AccountPoolView[] {
    return withDatabase((db) => {
      const pools = this.accountPoolRepository.list(db);
      const poolIds = pools.map((pool) => pool.id);
      const runtimeProfiles = this.runtimeProfileRepository.listByPoolIds(db, poolIds);
      const latestFatigueByPoolId = this.accountPoolRepository.listLatestFatigueByPoolId(db);

      return pools.map((pool) => ({
        id: pool.id,
        key: pool.key,
        provider: pool.provider,
        label: pool.label,
        planTier: pool.planTier,
        fatigueMode: pool.fatigueMode,
        maxConcurrency: pool.maxConcurrency,
        isEnabled: pool.isEnabled,
        notes: pool.notes,
        createdAt: pool.createdAt,
        updatedAt: pool.updatedAt,
        latestFatigue: latestFatigueByPoolId.get(pool.id) ?? null,
        runtimeProfiles: runtimeProfiles.get(pool.id) ?? []
      }));
    }, this.dbPath);
  }

  getById(id: string): AccountPoolView {
    return withDatabase((db) => {
      const pool = this.accountPoolRepository.getById(db, id);
      if (!pool) {
        throw dbNotFound(`Account pool not found: ${id}`);
      }

      const runtimeProfiles = this.runtimeProfileRepository.listByPoolIds(db, [id]).get(id) ?? [];
      const latestFatigue = this.accountPoolRepository.listLatestFatigueByPoolId(db).get(id) ?? null;

      return {
        id: pool.id,
        key: pool.key,
        provider: pool.provider,
        label: pool.label,
        planTier: pool.planTier,
        fatigueMode: pool.fatigueMode,
        maxConcurrency: pool.maxConcurrency,
        isEnabled: pool.isEnabled,
        notes: pool.notes,
        createdAt: pool.createdAt,
        updatedAt: pool.updatedAt,
        latestFatigue,
        runtimeProfiles
      };
    }, this.dbPath);
  }

  create(payload: CreateAccountPoolRequest): AccountPoolView {
    const parsed = createAccountPoolSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid account pool payload");
    }

    return withDatabase((db) => {
      const existing = this.accountPoolRepository.getByKey(db, parsed.data.key);
      if (existing) {
        throw dbConflict(`Account pool key already exists: ${parsed.data.key}`);
      }

      const nowIso = new Date().toISOString();
      const created = this.accountPoolRepository.create(
        db,
        {
          id: randomUUID(),
          key: parsed.data.key,
          provider: parsed.data.provider,
          label: parsed.data.label,
          planTier: parsed.data.planTier ?? null,
          fatigueMode: parsed.data.fatigueMode ?? "derived",
          maxConcurrency: parsed.data.maxConcurrency ?? null,
          isEnabled: parsed.data.isEnabled ?? true,
          notes: parsed.data.notes ?? null
        },
        nowIso
      );

      return {
        id: created.id,
        key: created.key,
        provider: created.provider,
        label: created.label,
        planTier: created.planTier,
        fatigueMode: created.fatigueMode,
        maxConcurrency: created.maxConcurrency,
        isEnabled: created.isEnabled,
        notes: created.notes,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        latestFatigue: null,
        runtimeProfiles: []
      };
    }, this.dbPath);
  }

  update(id: string, payload: UpdateAccountPoolRequest): AccountPoolView {
    const parsed = updateAccountPoolSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid account pool update payload");
    }

    if (Object.keys(parsed.data).length === 0) {
      throw dbBadRequest("At least one field is required for update");
    }

    return withDatabase((db) => {
      const existing = this.accountPoolRepository.getById(db, id);
      if (!existing) {
        throw dbNotFound(`Account pool not found: ${id}`);
      }

      const updated = this.accountPoolRepository.update(
        db,
        id,
        {
          label: parsed.data.label,
          planTier: parsed.data.planTier,
          fatigueMode: parsed.data.fatigueMode,
          maxConcurrency: parsed.data.maxConcurrency,
          notes: parsed.data.notes,
          isEnabled: parsed.data.isEnabled
        },
        new Date().toISOString()
      );

      const runtimeProfiles = this.runtimeProfileRepository.listByPoolIds(db, [id]).get(id) ?? [];
      const latestFatigue = this.accountPoolRepository.listLatestFatigueByPoolId(db).get(id) ?? null;

      return {
        id: updated.id,
        key: updated.key,
        provider: updated.provider,
        label: updated.label,
        planTier: updated.planTier,
        fatigueMode: updated.fatigueMode,
        maxConcurrency: updated.maxConcurrency,
        isEnabled: updated.isEnabled,
        notes: updated.notes,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        latestFatigue,
        runtimeProfiles
      };
    }, this.dbPath);
  }

  listFatigueHistory(accountPoolId: string, limit = 100): FatigueSnapshotView[] {
    return withDatabase((db) => {
      const pool = this.accountPoolRepository.getById(db, accountPoolId);
      if (!pool) {
        throw dbNotFound(`Account pool not found: ${accountPoolId}`);
      }

      return this.fatigueSnapshotRepository.listByAccountPoolId(db, accountPoolId, limit);
    }, this.dbPath);
  }
}
