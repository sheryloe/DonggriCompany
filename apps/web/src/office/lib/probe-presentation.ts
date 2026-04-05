import type { ProbeUiState } from "./probe-ui-state";

export type AvatarMood = "calm" | "cautious" | "sleepy" | "disconnected" | "alert";
export type BoardSignal = "stable" | "mixed" | "dim" | "muted" | "warning";
export type CopyTone = "normal" | "caution" | "nudge" | "critical";
export type MotionPreset = "steady" | "scan" | "drift" | "glitch" | "alarm";
export type StateEmphasis = "positive" | "caution" | "muted" | "critical";
export type BoardEmphasisTarget = "account-pool" | "runtime-profile" | "probe-monitor" | "history-board" | "none";
export type CtaTone = "push" | "verify" | "refresh" | "recover" | "hold";
export type ConfidenceHint = "high" | "medium" | "low" | "none";

export type ProbePresentation = {
  stateKey: ProbeUiState;
  emote: string;
  avatarMood: AvatarMood;
  boardSignal: BoardSignal;
  boardSignalLabel: string;
  copyTone: CopyTone;
  motionPreset: MotionPreset;
  stateEmphasis: StateEmphasis;
  emphasisTarget: BoardEmphasisTarget;
  ctaTone: CtaTone;
  confidenceHint: ConfidenceHint;
  stateLabel: string;
  hudLabel: string;
  stateSummary: string;
};

const presentationByState: Record<ProbeUiState, ProbePresentation> = {
  success: {
    stateKey: "success",
    emote: "OK",
    avatarMood: "calm",
    boardSignal: "stable",
    boardSignalLabel: "Board Stable",
    copyTone: "normal",
    motionPreset: "steady",
    stateEmphasis: "positive",
    emphasisTarget: "history-board",
    ctaTone: "hold",
    confidenceHint: "high",
    stateLabel: "STABLE",
    hudLabel: "Command surface aligned",
    stateSummary: "Latest probe and room state are aligned. It is safe to make normal operating decisions."
  },
  partial: {
    stateKey: "partial",
    emote: "CHK",
    avatarMood: "cautious",
    boardSignal: "mixed",
    boardSignalLabel: "Board Verify",
    copyTone: "caution",
    motionPreset: "scan",
    stateEmphasis: "caution",
    emphasisTarget: "probe-monitor",
    ctaTone: "verify",
    confidenceHint: "medium",
    stateLabel: "VERIFY",
    hudLabel: "Signal confidence reduced",
    stateSummary: "Probe returned partial quality. Use data for direction only and verify before committing."
  },
  stale: {
    stateKey: "stale",
    emote: "RFR",
    avatarMood: "sleepy",
    boardSignal: "dim",
    boardSignalLabel: "Board Refresh",
    copyTone: "nudge",
    motionPreset: "drift",
    stateEmphasis: "muted",
    emphasisTarget: "probe-monitor",
    ctaTone: "refresh",
    confidenceHint: "low",
    stateLabel: "STALE",
    hudLabel: "Fresh scan required",
    stateSummary: "Probe snapshot is stale. Refresh before using this signal as an execution baseline."
  },
  "no-signal": {
    stateKey: "no-signal",
    emote: "NS",
    avatarMood: "disconnected",
    boardSignal: "muted",
    boardSignalLabel: "Board Searching",
    copyTone: "caution",
    motionPreset: "glitch",
    stateEmphasis: "muted",
    emphasisTarget: "account-pool",
    ctaTone: "push",
    confidenceHint: "none",
    stateLabel: "NO SIGNAL",
    hudLabel: "Telemetry unavailable",
    stateSummary: "No probe signal exists for the current provider/pool/profile context."
  },
  error: {
    stateKey: "error",
    emote: "ERR",
    avatarMood: "alert",
    boardSignal: "warning",
    boardSignalLabel: "Board Warning",
    copyTone: "critical",
    motionPreset: "alarm",
    stateEmphasis: "critical",
    emphasisTarget: "probe-monitor",
    ctaTone: "recover",
    confidenceHint: "low",
    stateLabel: "ERROR",
    hudLabel: "Recovery path required",
    stateSummary: "Probe execution failed. Use explicit recovery and retry flow before normal operation."
  }
};

export const mapProbeStateToPresentation = (state: ProbeUiState): ProbePresentation => {
  return presentationByState[state];
};
