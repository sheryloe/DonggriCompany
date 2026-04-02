import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import type {
  FatiguePrecision,
  ProviderProbeRunView,
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

type AdapterResult = {
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

const usageProbeRequestSchema = z.object({
  provider: z.enum(["claude", "codex", "gemini"]),
  accountPoolId: z.string().min(1).optional(),
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

const executeProbe = (provider: ProviderUsageProbeProvider, commands: ProbeCommand[]): AdapterResult => {
  const startedAt = new Date().toISOString();

  for (const command of commands) {
    const result = spawnSync(command.binary, command.args, {
      encoding: "utf8",
      timeout: 5000
    });

    const stdoutText = result.stdout ?? "";
    const stderrText = result.stderr ?? "";
    const finishedAt = new Date().toISOString();
    const commandText = `${command.binary} ${command.args.join(" ")}`.trim();
    const parsed = parseUsagePayload(stdoutText);

    if (result.status === 0 && parsed.usageValue !== null && parsed.limitValue !== null) {
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
      return {
        provider,
        status: "partial",
        commandText,
        stdoutText,
        stderrText,
        parsedPayload: parsed.parsedPayload,
        usageValue: parsed.usageValue,
        limitValue: parsed.limitValue,
        unit: parsed.unit,
        precision: "derived",
        startedAt,
        finishedAt,
        degraded: true
      };
    }
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

const runProviderAdapter = (provider: ProviderUsageProbeProvider): AdapterResult => {
  if (provider === "claude") {
    return executeProbe(provider, [
      { binary: "claude", args: ["usage", "--json"], precision: "official" },
      { binary: "claude", args: ["usage"], precision: "derived" },
      { binary: "claude", args: ["--version"], precision: "manual" }
    ]);
  }
  if (provider === "codex") {
    return executeProbe(provider, [
      { binary: "codex", args: ["usage", "--json"], precision: "official" },
      { binary: "codex", args: ["usage"], precision: "derived" },
      { binary: "codex", args: ["--version"], precision: "manual" }
    ]);
  }
  return executeProbe(provider, [
    { binary: "gemini", args: ["usage", "--json"], precision: "official" },
    { binary: "gemini", args: ["usage"], precision: "derived" },
    { binary: "gemini", args: ["--version"], precision: "manual" }
  ]);
};

export class ProviderUsageProbeService {
  private readonly accountPoolRepository: AccountPoolRepository;
  private readonly runtimeProfileRepository: RuntimeProfileRepository;
  private readonly probeRunRepository: ProviderProbeRunRepository;
  private readonly fatigueEngine: FatigueEngine;
  private readonly fatigueSnapshotRepository: FatigueSnapshotRepository;
  private readonly usageNormalizer: UsageNormalizer;

  constructor(private readonly dbPath = getDbPath()) {
    this.accountPoolRepository = new AccountPoolRepository();
    this.runtimeProfileRepository = new RuntimeProfileRepository();
    this.probeRunRepository = new ProviderProbeRunRepository();
    this.fatigueSnapshotRepository = new FatigueSnapshotRepository();
    this.usageNormalizer = new UsageNormalizer();
    this.fatigueEngine = new FatigueEngine(this.fatigueSnapshotRepository, this.usageNormalizer);
  }

  listHistory(limit = 50): ProviderProbeRunView[] {
    return withDatabase((db) => this.probeRunRepository.listPublic(db, limit), this.dbPath);
  }

  run(input: ProviderUsageProbeRunRequest): ProviderUsageProbeRunResponse {
    const parsed = usageProbeRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid provider probe request");
    }

    return withDatabase((db) => {
      let accountPoolId = parsed.data.accountPoolId ?? null;
      if (parsed.data.runtimeProfileId) {
        const runtimeProfile = this.runtimeProfileRepository.getById(db, parsed.data.runtimeProfileId);
        if (!runtimeProfile) {
          throw dbNotFound(`Runtime profile not found: ${parsed.data.runtimeProfileId}`);
        }
        if (!accountPoolId) {
          accountPoolId = runtimeProfile.accountPoolId;
        }
      }

      if (accountPoolId) {
        const accountPool = this.accountPoolRepository.getById(db, accountPoolId);
        if (!accountPool) {
          throw dbNotFound(`Account pool not found: ${accountPoolId}`);
        }
      }

      const adapterResult = runProviderAdapter(parsed.data.provider);
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
