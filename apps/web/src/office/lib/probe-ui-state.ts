import type { ProviderProbeRunView } from "@workspace/shared";

export type ProbeUiState = "success" | "partial" | "stale" | "no-signal" | "error";

export const PROBE_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

const getProbeTimestamp = (run: ProviderProbeRunView): number => {
  const candidate = run.finishedAt ?? run.startedAt;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
};

const classifyProbeRunState = (
  run: ProviderProbeRunView | null,
  nowTimestamp: number
): ProbeUiState => {
  if (!run) {
    return "no-signal";
  }
  if (run.status === "success") {
    return "success";
  }
  if (run.status === "partial") {
    return "partial";
  }
  if (nowTimestamp - getProbeTimestamp(run) > PROBE_STALE_WINDOW_MS) {
    return "stale";
  }
  return "no-signal";
};

export const classifyProbeUiState = (
  input: {
    run: ProviderProbeRunView | null;
    errorMessage?: string | null;
    nowTimestamp?: number;
  }
): ProbeUiState => {
  if (input.errorMessage) {
    return "error";
  }

  return classifyProbeRunState(input.run, input.nowTimestamp ?? Date.now());
};
