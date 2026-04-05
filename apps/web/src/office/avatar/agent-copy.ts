import { mapProbeStateToPresentation } from "../lib/probe-presentation";
import type { ProbeUiState } from "../lib/probe-ui-state";
import type { AgentGuidanceEvent } from "./agent-types";

export type AgentGuidanceMessage = {
  headline: string;
  body: string;
  primaryAction: string;
  supportingHint: string;
  riskLevel: "low" | "medium" | "high";
};

const probeStateMessage = (state: ProbeUiState): AgentGuidanceMessage => {
  const presentation = mapProbeStateToPresentation(state);

  switch (state) {
    case "success":
      return {
        headline: presentation.hudLabel,
        body: "Latest probe result and board signal are aligned. Normal operation is available.",
        primaryAction: "Confirm only the latest delta in History Board, then proceed with the next command.",
        supportingHint: "Top avatar is for judgment context. Lower panels are direct execution controls.",
        riskLevel: "low"
      };
    case "partial":
      return {
        headline: presentation.hudLabel,
        body: "Probe signal is partially degraded. Use this as directional input, not final truth.",
        primaryAction: "Run Probe once more. If it repeats, inspect provider CLI output before policy changes.",
        supportingHint: "Changing settings without retry can cause false-positive operations.",
        riskLevel: "medium"
      };
    case "stale":
      return {
        headline: presentation.hudLabel,
        body: "Current signal is stale and may not represent the active runtime context.",
        primaryAction: "Run Probe first, then make runtime/history decisions from fresh data.",
        supportingHint: "Avatar intentionally shifts to conservative mode on stale data.",
        riskLevel: "medium"
      };
    case "no-signal":
      return {
        headline: presentation.hudLabel,
        body: "No usable probe signal exists for the current filter combination.",
        primaryAction: "Widen filters or run Probe to create an initial signal baseline.",
        supportingHint: "Board visuals alone are not enough when telemetry is missing.",
        riskLevel: "medium"
      };
    case "error":
      return {
        headline: presentation.hudLabel,
        body: "Probe execution or history fetch failed. Recovery flow is required before auto-judgment.",
        primaryAction: "Retry. If the same error repeats, follow runbook and inspect provider CLI state.",
        supportingHint: "Fallback controls remain available for direct manual checks.",
        riskLevel: "high"
      };
  }
};

export const getAgentGuidanceMessage = (
  event: AgentGuidanceEvent,
  latestProbeState: ProbeUiState
): AgentGuidanceMessage => {
  switch (event.type) {
    case "bootstrap-loading":
      return {
        headline: "Command deck booting",
        body: "Loading account pools, runtime profiles, and provider readiness.",
        primaryAction: "When loading ends, set pool/profile first, then run the baseline probe.",
        supportingHint: "After boot, avatar guidance switches to actionable state prompts.",
        riskLevel: "low"
      };
    case "bootstrap-ready":
      return {
        headline: "Command deck online",
        body: `provider=${event.provider}, pools=${event.poolCount}, profiles=${event.profileCount} are ready.`,
        primaryAction: "Lock pool/profile context and run probe to establish current signal.",
        supportingHint: "Top surface is judgment context, lower widgets are execution stack.",
        riskLevel: "low"
      };
    case "bootstrap-error":
      return {
        headline: "Deck sync failed",
        body: event.message,
        primaryAction: "Retry loading. If it keeps failing, recover backend health first.",
        supportingHint: "During bootstrap failure, recovery has priority over guidance.",
        riskLevel: "high"
      };
    case "runtime-delete-intent":
      return {
        headline: "Destructive action locked",
        body: `runtime profile '${event.key}' deletion is requested.`,
        primaryAction: "Confirm only if the target is correct. Otherwise cancel immediately.",
        supportingHint: "Delete can break history continuity and baseline comparisons.",
        riskLevel: "medium"
      };
    case "runtime-create-success":
      return {
        headline: "Runtime profile created",
        body: `'${event.key}' profile has been created.`,
        primaryAction: "Run probe with the new profile and validate result stability.",
        supportingHint: "A new profile has no trusted baseline until first probe.",
        riskLevel: "low"
      };
    case "runtime-update-success":
      return {
        headline: "Runtime profile updated",
        body: `'${event.key}' profile has been updated.`,
        primaryAction: "Re-check probe/history after update to validate behavior consistency.",
        supportingHint: "Profile updates can directly shift board interpretation.",
        riskLevel: "medium"
      };
    case "runtime-delete-success":
      return {
        headline: "Runtime profile removed",
        body: `'${event.key}' profile has been removed.`,
        primaryAction: "Select or create a replacement profile to refill execution context.",
        supportingHint: "An empty profile context weakens comparison confidence.",
        riskLevel: "medium"
      };
    case "runtime-error":
      return {
        headline: "Runtime profile action failed",
        body: event.message,
        primaryAction: "Check provider/pool/key consistency and retry with corrected input.",
        supportingHint: "Fix input/contract mismatch before interpreting guidance.",
        riskLevel: "high"
      };
    case "probe-run-start":
      return {
        headline: "Probe scan in progress",
        body: `${event.provider} provider probe is running.`,
        primaryAction: "Wait for completion; top state and history board will update together.",
        supportingHint: "Do not lock decisions to stale history while probe is running.",
        riskLevel: "low"
      };
    case "probe-run-finish":
      return probeStateMessage(event.state);
    case "pm-report":
      return {
        headline: "PM handoff in progress",
        body: `${event.agentName} is delivering a report to the PM desk.`,
        primaryAction: "Validate that History Board and Probe status are consistent before next action.",
        supportingHint: "Fallback execution controls remain available during handoff.",
        riskLevel: "low"
      };
    case "probe-error":
      return {
        headline: "Probe action failed",
        body: event.message,
        primaryAction: "Retry first. If repeated, escalate to runbook and provider CLI validation.",
        supportingHint: "Persistent errors require conservative decision posture.",
        riskLevel: "high"
      };
    case "history-filter-changed":
      return {
        headline: "Filter context updated",
        body: `provider=${event.provider}, pool=${event.accountPoolId || "-"}, profile=${event.runtimeProfileId || "-"}, limit=${event.limit} applied.`,
        primaryAction: "If empty results continue, widen filters or run probe immediately.",
        supportingHint: "All history rows now follow this exact context lock.",
        riskLevel: "low"
      };
    case "history-empty":
      return {
        headline: "History board empty",
        body: `No probe records match the active filter (limit=${event.limit}).`,
        primaryAction: "Expand filter scope or run probe to generate baseline records.",
        supportingHint: "Empty is not failure; it means no confirmed data yet.",
        riskLevel: "medium"
      };
    case "history-loaded":
      return {
        headline: "History synced",
        body: `${event.count} records loaded under limit=${event.limit}.`,
        primaryAction: "Review in order: VERIFY, STALE, ERROR, then proceed with run decisions.",
        supportingHint: "This history is the same dataset used by timeline replay.",
        riskLevel: "low"
      };
    case "idle":
      return probeStateMessage(latestProbeState);
  }
};

export const getAgentToneClassName = (state: ProbeUiState): string => {
  const presentation = mapProbeStateToPresentation(state);
  return `agent-tone-${presentation.copyTone}`;
};
