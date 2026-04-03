import type {
  FatiguePrecision,
  FatigueState,
  NormalizedUsageInput,
  ProbeRunStatus,
  ProviderUsageProbeProvider,
  UsageProbeStatus
} from "@workspace/shared";

import type { LatestSnapshotByPoolWithRaw } from "./fatigue-snapshot-repository.js";

export type UsageNormalizerInput = {
  provider: ProviderUsageProbeProvider;
  precision: FatiguePrecision;
  status: ProbeRunStatus;
  usageValue: number | null;
  limitValue: number | null;
  unit: string | null;
  observedAt: string;
  fallbackSnapshot: LatestSnapshotByPoolWithRaw | null;
};

export type UsageNormalizationResult = {
  usage: NormalizedUsageInput;
  sourceType: FatiguePrecision;
  fatigueState: FatigueState;
  confidenceScore: number;
  rawUsageValue: number | null;
  rawLimitValue: number | null;
  rawUnit: string | null;
  fallbackUsed: boolean;
};

const STALE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const clampPercent = (value: number): number => {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
};

export const mapFatigueState = (
  normalizedPercent: number,
  hasUsableSignal: boolean
): FatigueState => {
  if (!hasUsableSignal) {
    return "unknown";
  }
  if (normalizedPercent <= 39) {
    return "fresh";
  }
  if (normalizedPercent <= 64) {
    return "warm";
  }
  if (normalizedPercent <= 84) {
    return "hot";
  }
  return "critical";
};

export const scoreConfidence = (
  precision: FatiguePrecision,
  status: UsageProbeStatus
): number => {
  const base =
    precision === "official" ? 0.95 : precision === "derived" ? 0.75 : 0.55;
  const adjusted = status === "degraded" ? base - 0.2 : base;
  if (adjusted < 0.1) {
    return 0.1;
  }
  if (adjusted > 1) {
    return 1;
  }
  return adjusted;
};

const isFallbackSnapshotStale = (
  fallbackObservedAt: string,
  inputObservedAt: string
): boolean => {
  const fallbackTimestamp = Date.parse(fallbackObservedAt);
  const inputTimestamp = Date.parse(inputObservedAt);

  if (!Number.isFinite(fallbackTimestamp) || !Number.isFinite(inputTimestamp)) {
    return false;
  }

  return inputTimestamp - fallbackTimestamp > STALE_SNAPSHOT_MAX_AGE_MS;
};

export class UsageNormalizer {
  normalize(input: UsageNormalizerInput): UsageNormalizationResult {
    const hasDirectUsage =
      typeof input.usageValue === "number" &&
      Number.isFinite(input.usageValue) &&
      typeof input.limitValue === "number" &&
      Number.isFinite(input.limitValue) &&
      input.limitValue > 0;
    const fallback = input.fallbackSnapshot;

    let normalizedPercent = 0;
    let status: UsageProbeStatus = "degraded";
    let precision: FatiguePrecision = input.precision;
    let rawUsageValue = input.usageValue;
    let rawLimitValue = input.limitValue;
    let rawUnit = input.unit;
    let fallbackUsed = false;
    const fallbackEligible =
      fallback !== null &&
      !isFallbackSnapshotStale(fallback.observedAt, input.observedAt);

    if (hasDirectUsage) {
      normalizedPercent = clampPercent((input.usageValue as number / (input.limitValue as number)) * 100);
      status = input.status === "failure" ? "degraded" : "ok";
    } else if (fallbackEligible && fallback) {
      normalizedPercent = clampPercent(fallback.normalizedPercent);
      status = "degraded";
      precision = fallback.precision;
      rawUsageValue = fallback.rawUsageValue;
      rawLimitValue = fallback.rawLimitValue;
      rawUnit = fallback.rawUnit;
      fallbackUsed = true;
    }

    const hasUsableSignal = hasDirectUsage || fallbackUsed;
    const fatigueState = mapFatigueState(normalizedPercent, hasUsableSignal);
    const confidenceScore = scoreConfidence(precision, status);

    return {
      usage: {
        provider: input.provider,
        usageValue: rawUsageValue,
        limitValue: rawLimitValue,
        unit: rawUnit,
        normalizedPercent,
        precision,
        status,
        observedAt: input.observedAt
      },
      sourceType: precision,
      fatigueState,
      confidenceScore,
      rawUsageValue,
      rawLimitValue,
      rawUnit,
      fallbackUsed
    };
  }
}
