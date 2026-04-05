import type {
  AgentId,
  AgentModelAssignmentView,
  UpsertAgentModelAssignmentRequest
} from "@workspace/shared";
import { z } from "zod";

import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { AccountPoolRepository } from "./account-pool-repository.js";
import { AgentModelAssignmentRepository } from "./agent-model-assignment-repository.js";
import { dbBadRequest, dbNotFound } from "./errors.js";
import { RuntimeProfileRepository } from "./runtime-profile-repository.js";

const providerSchema = z.enum(["claude", "codex", "gemini"]);
const agentIdSchema = z.enum([
  "main",
  "router",
  "runtime",
  "probe",
  "history",
  "pm"
]);

export const upsertAgentModelAssignmentSchema = z.object({
  provider: providerSchema,
  accountPoolId: z.string().min(1),
  runtimeProfileId: z.string().min(1)
});

export class AgentModelAssignmentService {
  constructor(
    private readonly dbPath = getDbPath(),
    private readonly assignmentRepository = new AgentModelAssignmentRepository(),
    private readonly accountPoolRepository = new AccountPoolRepository(),
    private readonly runtimeProfileRepository = new RuntimeProfileRepository()
  ) {}

  list(): AgentModelAssignmentView[] {
    return withDatabase((db) => this.assignmentRepository.listAll(db), this.dbPath);
  }

  upsert(
    agentId: AgentId,
    payload: UpsertAgentModelAssignmentRequest
  ): AgentModelAssignmentView {
    const agentParse = agentIdSchema.safeParse(agentId);
    if (!agentParse.success) {
      throw dbBadRequest("Invalid agent id");
    }

    const parsed = upsertAgentModelAssignmentSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid agent model assignment payload");
    }

    return withDatabase((db) => {
      const accountPool = this.accountPoolRepository.getById(db, parsed.data.accountPoolId);
      if (!accountPool) {
        throw dbNotFound(`Account pool not found: ${parsed.data.accountPoolId}`);
      }

      const runtimeProfile = this.runtimeProfileRepository.getById(db, parsed.data.runtimeProfileId);
      if (!runtimeProfile) {
        throw dbNotFound(`Runtime profile not found: ${parsed.data.runtimeProfileId}`);
      }

      if (accountPool.provider !== parsed.data.provider) {
        throw dbBadRequest(
          `Account pool provider mismatch: expected ${parsed.data.provider}, got ${accountPool.provider}`
        );
      }

      if (runtimeProfile.provider !== parsed.data.provider) {
        throw dbBadRequest(
          `Runtime profile provider mismatch: expected ${parsed.data.provider}, got ${runtimeProfile.provider}`
        );
      }

      if (runtimeProfile.accountPoolId !== parsed.data.accountPoolId) {
        throw dbBadRequest(
          `Runtime profile/account pool mismatch: profile ${parsed.data.runtimeProfileId} is not in pool ${parsed.data.accountPoolId}`
        );
      }

      return this.assignmentRepository.upsert(
        db,
        {
          agentId: agentParse.data,
          provider: parsed.data.provider,
          accountPoolId: parsed.data.accountPoolId,
          runtimeProfileId: parsed.data.runtimeProfileId
        },
        new Date().toISOString()
      );
    }, this.dbPath);
  }
}
