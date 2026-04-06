import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import type {
  FatiguePrecision,
  ProviderProbeRunView,
  ProviderUsageProbeHistoryQuery,
  ProviderUsageProbeRunRequest,
  ProviderUsageProbeRunResponse,
  ProviderUsageProbeProvider
} from "@workspace/shared";
import { z } from "zod";

import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { AccountPoolRepository } from "./account-pool-repository.js";
import { dbBadRequest, dbNotFound } from "./errors.js";
import { FatigueEngine } from "./fatigue-engine.js";
import { FatigueSnapshotRepository } from "./fatigue-snapshot-repository.js";
import { ProviderProbeRunRepository } from "./provider-probe-run-repository.js";
import { RuntimeProfileRepository } from "./runtime-profile-repository.js";
import { UsageNormalizer } from "./usage-normalizer.js";

type ProbeCommand = {
  binary: string;
  args: string[];
  precision: FatiguePrecision;
};

export type ProviderProbeAdapterResult = {
  provider: ProviderUsageProbeProvider;
  status: "success" | "failure" | "partial";
  commandText: string;
  stdoutText: string;
  stderrText: string;
  parsedPayload: Record<string, unknown>;
  usageValue: number | null;
  limitValue: number | null;
  unit: string | null;
  precision: FatiguePrecision;
  startedAt: string;
  finishedAt: string;
  degraded: boolean;
};

export type ProbeSpawnCommand = (
  binary: string,
  args: string[]
) => {
  status: number | null;
  stdoutText: string;
  stderrText: string;
};

export type ProviderUsageProbeServiceOptions = {
  probeSpawnCommand?: ProbeSpawnCommand;
};

const usageProbeRequestSchema = z.object({
  provider: z.enum(["claude", "codex", "gemini"]),
  accountPoolId: z.string().min(1),
  runtimeProfileId: z.string().min(1).optional(),
  persistSnapshot: z.boolean().optional()
});

const tryNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readField = (object: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = tryNumber(object[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
};

const parseUsagePayload = (
  text: string
): {
  parsedPayload: Record<string, unknown>;
  usageValue: number | null;
  limitValue: number | null;
  unit: string | null;
} => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { parsedPayload: {}, usageValue: null, limitValue: null, unit: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { parsedPayload: {}, usageValue: null, limitValue: null, unit: null };
    }

    const payload = parsed as Record<string, unknown>;
    const nestedUsage =
      payload.usage && typeof payload.usage === "object" && !Array.isArray(payload.usage)
        ? (payload.usage as Record<string, unknown>)
        : null;
    const nestedQuota =
      payload.quota && typeof payload.quota === "object" && !Array.isArray(payload.quota)
        ? (payload.quota as Record<string, unknown>)
        : null;

    const usageValue =
      readField(payload, ["used", "usage", "current", "currentUsage"]) ??
      (nestedUsage ? readField(nestedUsage, ["used", "current", "value"]) : null) ??
      (nestedQuota ? readField(nestedQuota, ["used", "value"]) : null);
    const limitValue =
      readField(payload, ["limit", "quota", "max", "total"]) ??
      (nestedUsage ? readField(nestedUsage, ["limit", "max", "total"]) : null) ??
      (nestedQuota ? readField(nestedQuota, ["limit", "max", "total"]) : null);
    const percentValue =
      readField(payload, ["percent", "usagePercent"]) ??
      (nestedUsage ? readField(nestedUsage, ["percent", "usagePercent"]) : null);
    const unit =
      typeof payload.unit === "string"
        ? payload.unit
        : nestedUsage && typeof nestedUsage.unit === "string"
          ? nestedUsage.unit
          : null;

    if (usageValue !== null && limitValue !== null && limitValue > 0) {
      return {
        parsedPayload: payload,
        usageValue,
        limitValue,
        unit
      };
    }

    if (percentValue !== null) {
      return {
        parsedPayload: payload,
        usageValue: percentValue,
        limitValue: 100,
        unit: "percent"
      };
    }

    return {
      parsedPayload: payload,
      usageValue,
      limitValue,
      unit
    };
  } catch {
    return { parsedPayload: {}, usageValue: null, limitValue: null, unit: null };
  }
};

const hasSufficientParsedUsage = (parsed: {
  usageValue: number | null;
  limitValue: number | null;
}): boolean => {
  return parsed.usageValue !== null && parsed.limitValue !== null && parsed.limitValue > 0;
};

const defaultProbeSpawnCommand: ProbeSpawnCommand = (binary, args) => {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    timeout: 5000
  });

  return {
    status: result.status,
    stdoutText: result.stdout ?? "",
    stderrText: result.stderr ?? ""
  };
};

const executeProbe = (
  provider: ProviderUsageProbeProvider,
  commands: ProbeCommand[],
  probeSpawnCommand: ProbeSpawnCommand
): ProviderProbeAdapterResult => {
  const startedAt = new Date().toISOString();
  const partialCandidates: ProviderProbeAdapterResult[] = [];

  for (const command of commands) {
    const result = probeSpawnCommand(command.binary, command.args);

    const stdoutText = result.stdoutText;
    const stderrText = result.stderrText;
    const finishedAt = new Date().toISOString();
    const commandText = `${command.binary} ${command.args.join(" ")}`.trim();
    const parsed = parseUsagePayload(stdoutText);

    if (result.status === 0 && hasSufficientParsedUsage(parsed)) {
      return {
        provider,
        status: "success",
        commandText,
        stdoutText,
        stderrText,
        parsedPayload: parsed.parsedPayload,
        usageValue: parsed.usageValue,
        limitValue: parsed.limitValue,
        unit: parsed.unit,
        precision: command.precision,
        startedAt,
        finishedAt,
        degraded: false
      };
    }

    if (result.status === 0) {
      partialCandidates.push({
        provider,
        status: "partial",
        commandText,
        stdoutText,
        stderrText,
        parsedPayload: parsed.parsedPayload,
        usageValue: parsed.usageValue,
        limitValue: parsed.limitValue,
        unit: parsed.unit,
        precision: command.precision,
        startedAt,
        finishedAt,
        degraded: true
      });
    }
  }

  if (partialCandidates.length > 0) {
    return partialCandidates[partialCandidates.length - 1] as ProviderProbeAdapterResult;
  }

  const finishedAt = new Date().toISOString();
  const commandText = commands.map((command) => `${command.binary} ${command.args.join(" ")}`.trim()).join(" | ");

  return {
    provider,
    status: "failure",
    commandText,
    stdoutText: "",
    stderrText: "Probe command failed or command not found",
    parsedPayload: {},
    usageValue: null,
    limitValue: null,
    unit: null,
    precision: "manual",
    startedAt,
    finishedAt,
    degraded: true
  };
};

const runProviderAdapter = (
  provider: ProviderUsageProbeProvider,
  probeSpawnCommand: ProbeSpawnCommand = defaultProbeSpawnCommand
): ProviderProbeAdapterResult => {
  if (provider === "claude") {
    return executeProbe(provider, [
      { binary: "claude", args: ["usage", "--json"], precision: "official" },
      { binary: "claude", args: ["usage"], precision: "derived" },
      { binary: "claude", args: ["--version"], precision: "manual" }
    ], probeSpawnCommand);
  }
  if (provider === "codex") {
    return executeProbe(provider, [
      { binary: "codex", args: ["usage", "--json"], precision: "official" },
      { binary: "codex", args: ["usage"], precision: "derived" },
      { binary: "codex", args: ["--version"], precision: "manual" }
    ], probeSpawnCommand);
  }
  return executeProbe(provider, [
    { binary: "gemini", args: ["usage", "--json"], precision: "official" },
    { binary: "gemini", args: ["usage"], precision: "derived" },
    { binary: "gemini", args: ["--version"], precision: "manual" }
  ], probeSpawnCommand);
};

export const runProviderAdapterWithSpawn = (
  provider: ProviderUsageProbeProvider,
  probeSpawnCommand: ProbeSpawnCommand
): ProviderProbeAdapterResult => {
  return runProviderAdapter(provider, probeSpawnCommand);
};

export class ProviderUsageProbeService {
  private readonly accountPoolRepository: AccountPoolRepository;
  private readonly runtimeProfileRepository: RuntimeProfileRepository;
  private readonly probeRunRepository: ProviderProbeRunRepository;
  private readonly fatigueEngine: FatigueEngine;
  private readonly fatigueSnapshotRepository: FatigueSnapshotRepository;
  private readonly usageNormalizer: UsageNormalizer;
  private readonly probeSpawnCommand: ProbeSpawnCommand;

  constructor(
    private readonly dbPath = getDbPath(),
    options: ProviderUsageProbeServiceOptions = {}
  ) {
    this.accountPoolRepository = new AccountPoolRepository();
    this.runtimeProfileRepository = new RuntimeProfileRepository();
    this.probeRunRepository = new ProviderProbeRunRepository();
    this.fatigueSnapshotRepository = new FatigueSnapshotRepository();
    this.usageNormalizer = new UsageNormalizer();
    this.fatigueEngine = new FatigueEngine(this.fatigueSnapshotRepository, this.usageNormalizer);
    this.probeSpawnCommand = options.probeSpawnCommand ?? defaultProbeSpawnCommand;
  }

  listHistory(query: ProviderUsageProbeHistoryQuery = {}): ProviderProbeRunView[] {
    const limitCandidate = query.limit;
    const limit =
      typeof limitCandidate === "number" && Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.min(Math.floor(limitCandidate), 200)
        : 50;

    return withDatabase(
      (db) =>
        this.probeRunRepository.listPublic(db, {
          limit,
          provider: query.provider,
          accountPoolId: query.accountPoolId,
          runtimeProfileId: query.runtimeProfileId
        }),
      this.dbPath
    );
  }

  run(input: ProviderUsageProbeRunRequest): ProviderUsageProbeRunResponse {
    const parsed = usageProbeRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid provider probe request");
    }

    return withDatabase((db) => {
      const accountPoolId = parsed.data.accountPoolId;
      const runtimeProfile = parsed.data.runtimeProfileId
        ? this.runtimeProfileRepository.getById(db, parsed.data.runtimeProfileId)
        : null;

      if (parsed.data.runtimeProfileId) {
        if (!runtimeProfile) {
          throw dbNotFound(`Runtime profile not found: ${parsed.data.runtimeProfileId}`);
        }
        if (runtimeProfile.provider !== parsed.data.provider) {
          throw dbBadRequest(
            `Runtime profile provider mismatch: expected ${parsed.data.provider}, got ${runtimeProfile.provider}`
          );
        }
      }

      const accountPool = this.accountPoolRepository.getById(db, accountPoolId);
      if (!accountPool) {
        throw dbNotFound(`Account pool not found: ${accountPoolId}`);
      }
      if (accountPool.provider !== parsed.data.provider) {
        throw dbBadRequest(
          `Account pool provider mismatch: expected ${parsed.data.provider}, got ${accountPool.provider}`
        );
      }

      if (runtimeProfile && accountPoolId && runtimeProfile.accountPoolId !== accountPoolId) {
        throw dbBadRequest(
          `Runtime profile ${runtimeProfile.id} does not belong to account pool ${accountPoolId}`
        );
      }

      const adapterResult = runProviderAdapter(parsed.data.provider, this.probeSpawnCommand);
      const runRecord = this.probeRunRepository.create(db, {
        id: randomUUID(),
        provider: adapterResult.provider,
        accountPoolId,
        runtimeProfileId: parsed.data.runtimeProfileId ?? null,
        probeKind: "usage_snapshot",
        status: adapterResult.status,
        commandText: adapterResult.commandText,
        stdoutText: adapterResult.stdoutText,
        stderrText: adapterResult.stderrText,
        parsedPayloadJson: adapterResult.parsedPayload,
        startedAt: adapterResult.startedAt,
        finishedAt: adapterResult.finishedAt,
        precision: adapterResult.precision,
        degraded: adapterResult.degraded
      });

      const shouldPersist = parsed.data.persistSnapshot ?? true;
      let usage = null;
      let fatigueSnapshot = null;

      if (accountPoolId && shouldPersist) {
        const fatigue = this.fatigueEngine.recordSnapshot(db, {
          accountPoolId,
          provider: parsed.data.provider,
          precision: adapterResult.precision,
          status: adapterResult.status,
          usageValue: adapterResult.usageValue,
          limitValue: adapterResult.limitValue,
          unit: adapterResult.unit,
          observedAt: adapterResult.finishedAt,
          rawPayload: {
            commandText: adapterResult.commandText,
            parsedPayload: adapterResult.parsedPayload
          }
        });
        usage = fatigue.usage;
        fatigueSnapshot = fatigue.snapshot;
      } else {
        const latestSnapshot = accountPoolId
          ? this.fatigueSnapshotRepository.getLatestByAccountPoolId(db, accountPoolId)
          : null;
        const normalized = this.usageNormalizer.normalize({
          provider: parsed.data.provider,
          precision: adapterResult.precision,
          status: adapterResult.status,
          usageValue: adapterResult.usageValue,
          limitValue: adapterResult.limitValue,
          unit: adapterResult.unit,
          observedAt: adapterResult.finishedAt,
          fallbackSnapshot: latestSnapshot
        });
        usage = normalized.usage;
      }

      return {
        ok: true,
        run: {
          id: runRecord.id,
          provider: runRecord.provider,
          accountPoolId: runRecord.accountPoolId,
          runtimeProfileId: runRecord.runtimeProfileId,
          probeKind: runRecord.probeKind,
          status: runRecord.status,
          precision: runRecord.precision,
          degraded: runRecord.degraded,
          startedAt: runRecord.startedAt,
          finishedAt: runRecord.finishedAt
        },
        usage,
        fatigueSnapshot
      };
    }, this.dbPath);
  }
}
