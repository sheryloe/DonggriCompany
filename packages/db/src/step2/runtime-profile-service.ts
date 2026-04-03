import { randomUUID } from "node:crypto";

import type {
  CreateRuntimeProfileRequest,
  RuntimeProfileView,
  UpdateRuntimeProfileRequest
} from "@workspace/shared";
import { z } from "zod";

import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { AccountPoolRepository } from "./account-pool-repository.js";
import { dbBadRequest, dbConflict, dbNotFound } from "./errors.js";
import { RuntimeProfileRepository } from "./runtime-profile-repository.js";

const providerSchema = z.enum(["claude", "codex", "gemini"]);
const profileKeySchema = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9-]+$/, "key must use lower-case letters, numbers, and hyphen");
const profileStatusSchema = z.string().min(1).max(64);

export const createRuntimeProfileSchema = z.object({
  key: profileKeySchema,
  provider: providerSchema,
  accountPoolId: z.string().min(1),
  profilePath: z.string().max(1000).nullable().optional(),
  status: profileStatusSchema.optional()
});

export const updateRuntimeProfileSchema = z.object({
  key: profileKeySchema.optional(),
  accountPoolId: z.string().min(1).nullable().optional(),
  profilePath: z.string().max(1000).nullable().optional(),
  status: profileStatusSchema.optional()
});

export class RuntimeProfileService {
  constructor(
    private readonly dbPath = getDbPath(),
    private readonly runtimeProfileRepository = new RuntimeProfileRepository(),
    private readonly accountPoolRepository = new AccountPoolRepository()
  ) {}

  list(): RuntimeProfileView[] {
    return withDatabase((db) => this.runtimeProfileRepository.listAll(db), this.dbPath);
  }

  create(payload: CreateRuntimeProfileRequest): RuntimeProfileView {
    const parsed = createRuntimeProfileSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid runtime profile payload");
    }

    return withDatabase((db) => {
      const existing = this.runtimeProfileRepository.getByKey(db, parsed.data.key);
      if (existing) {
        throw dbConflict(`Runtime profile key already exists: ${parsed.data.key}`);
      }

      const accountPool = this.accountPoolRepository.getById(db, parsed.data.accountPoolId);
      if (!accountPool) {
        throw dbNotFound(`Account pool not found: ${parsed.data.accountPoolId}`);
      }
      if (accountPool.provider !== parsed.data.provider) {
        throw dbBadRequest(
          `Runtime profile provider mismatch: expected ${parsed.data.provider}, got ${accountPool.provider}`
        );
      }

      return this.runtimeProfileRepository.create(
        db,
        {
          id: randomUUID(),
          provider: parsed.data.provider,
          accountPoolId: parsed.data.accountPoolId,
          key: parsed.data.key,
          profilePath: parsed.data.profilePath ?? null,
          status: parsed.data.status ?? "active"
        },
        new Date().toISOString()
      );
    }, this.dbPath);
  }

  update(id: string, payload: UpdateRuntimeProfileRequest): RuntimeProfileView {
    const parsed = updateRuntimeProfileSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid runtime profile update payload");
    }

    if (Object.keys(parsed.data).length === 0) {
      throw dbBadRequest("At least one field is required for update");
    }

    return withDatabase((db) => {
      const existing = this.runtimeProfileRepository.getById(db, id);
      if (!existing) {
        throw dbNotFound(`Runtime profile not found: ${id}`);
      }

      if (parsed.data.key && parsed.data.key !== existing.key) {
        const duplicate = this.runtimeProfileRepository.getByKey(db, parsed.data.key);
        if (duplicate && duplicate.id !== id) {
          throw dbConflict(`Runtime profile key already exists: ${parsed.data.key}`);
        }
      }

      const targetAccountPoolId =
        parsed.data.accountPoolId === undefined ? existing.accountPoolId : parsed.data.accountPoolId;
      if (targetAccountPoolId) {
        const accountPool = this.accountPoolRepository.getById(db, targetAccountPoolId);
        if (!accountPool) {
          throw dbNotFound(`Account pool not found: ${targetAccountPoolId}`);
        }
        if (accountPool.provider !== existing.provider) {
          throw dbBadRequest(
            `Runtime profile provider mismatch: expected ${existing.provider}, got ${accountPool.provider}`
          );
        }
      }

      return this.runtimeProfileRepository.update(
        db,
        id,
        {
          key: parsed.data.key,
          accountPoolId: parsed.data.accountPoolId,
          profilePath: parsed.data.profilePath,
          status: parsed.data.status
        },
        new Date().toISOString()
      );
    }, this.dbPath);
  }

  remove(id: string): { id: string } {
    return withDatabase((db) => {
      const existing = this.runtimeProfileRepository.getById(db, id);
      if (!existing) {
        throw dbNotFound(`Runtime profile not found: ${id}`);
      }

      this.runtimeProfileRepository.deleteById(db, id);
      return { id };
    }, this.dbPath);
  }
}
