import { randomUUID } from "node:crypto";

import type {
  FatigueSnapshotView,
  NormalizedUsageInput,
  ProbeRunStatus,
  ProviderUsageProbeProvider
} from "@workspace/shared";

import type { DatabaseHandle } from "../database.js";
import { FatigueSnapshotRepository } from "./fatigue-snapshot-repository.js";
import { UsageNormalizer } from "./usage-normalizer.js";

export type FatigueEngineInput = {
  accountPoolId: string;
  provider: ProviderUsageProbeProvider;
  precision: "official" | "derived" | "manual";
  status: ProbeRunStatus;
  usageValue: number | null;
  limitValue: number | null;
  unit: string | null;
  observedAt: string;
  rawPayload: Record<string, unknown>;
};

export type FatigueEngineResult = {
  usage: NormalizedUsageInput;
  snapshot: FatigueSnapshotView;
};

export class FatigueEngine {
  constructor(
    private readonly snapshotRepository: FatigueSnapshotRepository,
    private readonly usageNormalizer: UsageNormalizer
  ) {}

  recordSnapshot(db: DatabaseHandle, input: FatigueEngineInput): FatigueEngineResult {
    const fallbackSnapshot = this.snapshotRepository.getLatestByAccountPoolId(db, input.accountPoolId);
    const normalized = this.usageNormalizer.normalize({
      provider: input.provider,
      precision: input.precision,
      status: input.status,
      usageValue: input.usageValue,
      limitValue: input.limitValue,
      unit: input.unit,
      observedAt: input.observedAt,
      fallbackSnapshot
    });

    const snapshot = this.snapshotRepository.insert(db, {
      id: randomUUID(),
      accountPoolId: input.accountPoolId,
      sourceType: normalized.sourceType,
      rawPayloadJson: input.rawPayload,
      rawUsageValue: normalized.rawUsageValue,
      rawLimitValue: normalized.rawLimitValue,
      rawUnit: normalized.rawUnit,
      normalizedPercent: normalized.usage.normalizedPercent,
      fatigueState: normalized.fatigueState,
      confidenceScore: normalized.confidenceScore,
      observedAt: input.observedAt
    });

    return {
      usage: normalized.usage,
      snapshot
    };
  }
}
