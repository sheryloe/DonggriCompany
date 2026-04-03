import type { ProbeUiState } from "./probe-ui-state";

export type AvatarMood = "calm" | "cautious" | "sleepy" | "disconnected" | "alert";
export type BoardSignal = "stable" | "mixed" | "dim" | "muted" | "warning";
export type CopyTone = "normal" | "caution" | "nudge" | "critical";

export type ProbePresentation = {
  avatarMood: AvatarMood;
  boardSignal: BoardSignal;
  copyTone: CopyTone;
};

const presentationByState: Record<ProbeUiState, ProbePresentation> = {
  success: {
    avatarMood: "calm",
    boardSignal: "stable",
    copyTone: "normal"
  },
  partial: {
    avatarMood: "cautious",
    boardSignal: "mixed",
    copyTone: "caution"
  },
  stale: {
    avatarMood: "sleepy",
    boardSignal: "dim",
    copyTone: "nudge"
  },
  "no-signal": {
    avatarMood: "disconnected",
    boardSignal: "muted",
    copyTone: "caution"
  },
  error: {
    avatarMood: "alert",
    boardSignal: "warning",
    copyTone: "critical"
  }
};

export const mapProbeStateToPresentation = (state: ProbeUiState): ProbePresentation => {
  return presentationByState[state];
};
