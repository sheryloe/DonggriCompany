import { randomUUID } from "node:crypto";

import type {
  AccountPoolLatestFatigueView,
  AccountPoolView,
  RuntimeRouterCandidateScoreView,
  RuntimeRouterDecisionView,
  RuntimeRouterRequest
} from "@workspace/shared";

import type { DatabaseHandle } from "../database.js";
import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { AccountPoolRepository } from "./account-pool-repository.js";
import { RoutingRuleRepository } from "./routing-rule-repository.js";
import { RuntimeProfileRepository } from "./runtime-profile-repository.js";

type CandidateContext = {
  ruleKey: string;
  ruleTaskType: string | null;
  ruleRoleKey: string | null;
  rulePriority: number;
  targetOrder: number;
  minConfidence: number;
  maxFatiguePercent: number | null;
  fallbackOnly: boolean;
  profile: AccountPoolView["runtimeProfiles"][number];
  pool: AccountPoolView;
  latestFatigue: AccountPoolLatestFatigueView | null;
};

type EvaluatedCandidate = RuntimeRouterCandidateScoreView & {
  sortScore: number;
};

const normalizeValue = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const matchesRule = (
  request: RuntimeRouterRequest,
  rule: { taskType: string | null; roleKey: string | null; workspaceMode: string | null }
): boolean => {
  const taskType = normalizeValue(request.taskType);
  const roleKey = normalizeValue(request.roleKey);
  const workspaceMode = normalizeValue(request.workspaceMode);

  const ruleTaskType = normalizeValue(rule.taskType ?? undefined);
  const ruleRoleKey = normalizeValue(rule.roleKey ?? undefined);
  const ruleWorkspaceMode = normalizeValue(rule.workspaceMode ?? undefined);

  if (ruleTaskType && taskType !== ruleTaskType) {
    return false;
  }
  if (ruleRoleKey && roleKey !== ruleRoleKey) {
    return false;
  }
  if (ruleWorkspaceMode && workspaceMode !== ruleWorkspaceMode) {
    return false;
  }
  return true;
};

const getRuleSpecificityBonus = (
  request: RuntimeRouterRequest,
  rule: { taskType: string | null; roleKey: string | null }
): number => {
  const taskType = normalizeValue(request.taskType);
  const roleKey = normalizeValue(request.roleKey);
  const ruleTaskType = normalizeValue(rule.taskType ?? undefined);
  const ruleRoleKey = normalizeValue(rule.roleKey ?? undefined);

  const taskMatched = Boolean(ruleTaskType && taskType && taskType === ruleTaskType);
  const roleMatched = Boolean(ruleRoleKey && roleKey && roleKey === ruleRoleKey);

  if (taskMatched && roleMatched) {
    return 40;
  }
  if (taskMatched || roleMatched) {
    return 30;
  }
  if (!ruleTaskType && !ruleRoleKey) {
    return 10;
  }
  return 0;
};

const evaluateCandidate = (
  context: CandidateContext,
  request: RuntimeRouterRequest
): EvaluatedCandidate => {
  const profile = context.profile;
  const pool = context.pool;
  const fatigue = context.latestFatigue;
  const requiredCapabilities = request.requiredCapabilities ?? [];
  const preferredIds = request.preferredRuntimeProfileIds ?? [];

  let rejected = false;
  let rejectReason: string | null = null;

  if (!pool.isEnabled) {
    rejected = true;
    rejectReason = "POOL_DISABLED";
  } else if (!profile.isEnabled) {
    rejected = true;
    rejectReason = "PROFILE_DISABLED";
  }

  if (!rejected && requiredCapabilities.length > 0) {
    const capabilityMap = new Map(profile.capabilities.map((capability) => [capability.key, capability]));
    const missing = requiredCapabilities.filter((capability) => !capabilityMap.has(capability));
    if (missing.length > 0) {
      rejected = true;
      rejectReason = `MISSING_CAPABILITY:${missing.join(",")}`;
    }
  }

  if (!rejected && fatigue && fatigue.confidenceScore < context.minConfidence) {
    rejected = true;
    rejectReason = "LOW_CONFIDENCE";
  }

  if (
    !rejected &&
    fatigue &&
    context.maxFatiguePercent !== null &&
    fatigue.normalizedPercent > context.maxFatiguePercent
  ) {
    rejected = true;
    rejectReason = "FATIGUE_LIMIT_EXCEEDED";
  }

  const capabilityScore =
    requiredCapabilities.length === 0
      ? profile.capabilities.reduce((total, capability) => total + capability.strength, 0) /
        Math.max(profile.capabilities.length, 1)
      : requiredCapabilities.reduce((total, capabilityKey) => {
          const capability = profile.capabilities.find((item) => item.key === capabilityKey);
          return total + (capability?.strength ?? 0);
        }, 0) / requiredCapabilities.length;

  const specificityBonus = getRuleSpecificityBonus(request, {
    taskType: context.ruleTaskType,
    roleKey: context.ruleRoleKey
  });

  const priorityScore = Math.max(0, 120 - context.rulePriority);
  const targetOrderScore = Math.max(0, 40 - (context.targetOrder - 1) * 10);
  const preferenceBonus = preferredIds.includes(profile.id) ? 15 : 0;
  const fallbackPenalty = context.fallbackOnly ? 8 : 0;
  const fatiguePenalty = fatigue ? fatigue.normalizedPercent * 0.45 : 12;

  const score = Number(
    (
      priorityScore +
      targetOrderScore +
      capabilityScore +
      specificityBonus +
      preferenceBonus -
      fallbackPenalty -
      fatiguePenalty
    ).toFixed(2)
  );

  return {
    runtimeProfileId: profile.id,
    runtimeProfileKey: profile.key,
    accountPoolId: pool.id,
    ruleKey: context.ruleKey,
    isFallback: context.fallbackOnly,
    score,
    rejected,
    rejectReason,
    sortScore: rejected ? Number.NEGATIVE_INFINITY : score
  };
};

const buildNoRouteReason = (candidates: RuntimeRouterCandidateScoreView[]): string => {
  const reasons = candidates
    .map((candidate) => candidate.rejectReason)
    .filter((reason): reason is string => typeof reason === "string");
  const uniqueReasons = [...new Set(reasons)];

  if (uniqueReasons.length === 0) {
    return "NO_ROUTE: no candidates matched current policy";
  }

  return `NO_ROUTE: ${uniqueReasons.join("; ")}`;
};

const toRouterInputJson = (request: RuntimeRouterRequest): string => {
  return JSON.stringify({
    taskType: request.taskType ?? null,
    roleKey: request.roleKey ?? null,
    preferredRuntimeProfileIds: request.preferredRuntimeProfileIds ?? [],
    requiredCapabilities: request.requiredCapabilities ?? [],
    workspaceMode: request.workspaceMode ?? null
  });
};

const toCandidateScoreJson = (candidates: RuntimeRouterCandidateScoreView[]): string => {
  return JSON.stringify(candidates);
};

export class RuntimeRouter {
  constructor(
    private readonly dbPath = getDbPath(),
    private readonly accountPoolRepository = new AccountPoolRepository(),
    private readonly runtimeProfileRepository = new RuntimeProfileRepository(),
    private readonly routingRuleRepository = new RoutingRuleRepository()
  ) {}

  simulate(request: RuntimeRouterRequest): RuntimeRouterDecisionView {
    return withDatabase((db) => this.evaluateDecision(db, request, false), this.dbPath);
  }

  resolve(request: RuntimeRouterRequest): RuntimeRouterDecisionView {
    return withDatabase((db) => this.evaluateDecision(db, request, true), this.dbPath);
  }

  private evaluateDecision(
    db: DatabaseHandle,
    request: RuntimeRouterRequest,
    persistDecision: boolean
  ): RuntimeRouterDecisionView {
    const accountPoolRecords = this.accountPoolRepository.list(db);
    const poolIds = accountPoolRecords.map((pool) => pool.id);
    const runtimeProfilesByPoolId = this.runtimeProfileRepository.listByPoolIds(db, poolIds);
    const latestFatigueByPoolId = this.accountPoolRepository.listLatestFatigueByPoolId(db);
    const routingRules = this.routingRuleRepository.listEnabled(db).filter((rule) => matchesRule(request, rule));

    const accountPools: AccountPoolView[] = accountPoolRecords.map((pool) => ({
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
      runtimeProfiles: runtimeProfilesByPoolId.get(pool.id) ?? []
    }));

    const profileById = new Map(
      accountPools.flatMap((pool) => pool.runtimeProfiles.map((profile) => [profile.id, { profile, pool }] as const))
    );

    const candidates: EvaluatedCandidate[] = [];
    for (const rule of routingRules) {
      for (const target of rule.targets) {
        const profileContext = profileById.get(target.runtimeProfileId);
        if (!profileContext) {
          candidates.push({
            runtimeProfileId: target.runtimeProfileId,
            runtimeProfileKey: target.runtimeProfileKey,
            accountPoolId: null,
            ruleKey: rule.key,
            isFallback: target.fallbackOnly,
            score: -9999,
            rejected: true,
            rejectReason: "RUNTIME_PROFILE_NOT_FOUND",
            sortScore: Number.NEGATIVE_INFINITY
          });
          continue;
        }

        candidates.push(
          evaluateCandidate(
            {
              ruleKey: rule.key,
              ruleTaskType: rule.taskType,
              ruleRoleKey: rule.roleKey,
              rulePriority: rule.priority,
              targetOrder: target.targetOrder,
              minConfidence: target.minConfidence,
              maxFatiguePercent: target.maxFatiguePercent,
              fallbackOnly: target.fallbackOnly,
              profile: profileContext.profile,
              pool: profileContext.pool,
              latestFatigue: profileContext.pool.latestFatigue
            },
            request
          )
        );
      }
    }

    const primaryCandidates = candidates
      .filter((candidate) => !candidate.rejected && !candidate.isFallback)
      .sort((a, b) => b.sortScore - a.sortScore);
    const fallbackCandidates = candidates
      .filter((candidate) => !candidate.rejected && candidate.isFallback)
      .sort((a, b) => b.sortScore - a.sortScore);

    const selectedCandidate = primaryCandidates[0] ?? fallbackCandidates[0] ?? null;
    const fallbackChain = fallbackCandidates.map((candidate) => candidate.runtimeProfileKey);
    const scoreBreakdown = candidates.map((candidate) => ({
      runtimeProfileId: candidate.runtimeProfileId,
      runtimeProfileKey: candidate.runtimeProfileKey,
      accountPoolId: candidate.accountPoolId,
      ruleKey: candidate.ruleKey,
      isFallback: candidate.isFallback,
      score: candidate.score,
      rejected: candidate.rejected,
      rejectReason: candidate.rejectReason
    }));

    const decisionState = selectedCandidate
      ? selectedCandidate.isFallback
        ? "fallback"
        : "resolved"
      : "no_route";
    const reasonText = selectedCandidate
      ? `Selected ${selectedCandidate.runtimeProfileKey} from rule ${selectedCandidate.ruleKey}`
      : buildNoRouteReason(scoreBreakdown);

    let decisionId: string | null = null;
    if (persistDecision) {
      decisionId = randomUUID();
      db.prepare(
        `
        INSERT INTO routing_decisions (
          id,
          task_request_json,
          selected_runtime_profile_id,
          selected_account_pool_id,
          decision_state,
          reason_text,
          score_json,
          created_at
        )
        VALUES (
          @id,
          @task_request_json,
          @selected_runtime_profile_id,
          @selected_account_pool_id,
          @decision_state,
          @reason_text,
          @score_json,
          @created_at
        )
        `
      ).run({
        id: decisionId,
        task_request_json: toRouterInputJson(request),
        selected_runtime_profile_id: selectedCandidate?.runtimeProfileId ?? null,
        selected_account_pool_id: selectedCandidate?.accountPoolId ?? null,
        decision_state: decisionState,
        reason_text: reasonText,
        score_json: toCandidateScoreJson(scoreBreakdown),
        created_at: new Date().toISOString()
      });
    }

    return {
      decisionId,
      decisionState,
      selectedRuntimeProfileId: selectedCandidate?.runtimeProfileId ?? null,
      selectedRuntimeProfileKey: selectedCandidate?.runtimeProfileKey ?? null,
      selectedAccountPoolId: selectedCandidate?.accountPoolId ?? null,
      reasonText,
      fallbackChain,
      scoreBreakdown
    };
  }
}
