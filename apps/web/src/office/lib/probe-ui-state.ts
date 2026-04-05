import type { ProviderProbeRunView } from "@workspace/shared";

export type ProbeUiState = "success" | "partial" | "stale" | "no-signal" | "error";

export const PROBE_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PROBE_UI_PRIORITY: readonly ProbeUiState[] = ["error", "no-signal", "stale", "partial", "success"] as const;

const getProbeTimestamp = (run: ProviderProbeRunView): number | null => {
  const candidate = run.finishedAt ?? run.startedAt;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const classifyProbeRunState = (
  run: ProviderProbeRunView | null,
  nowTimestamp: number
): ProbeUiState => {
  if (!run) {
    return "no-signal";
  }
  if (run.status === "failure") {
    return "error";
  }
  const probeTimestamp = getProbeTimestamp(run);
  if (probeTimestamp === null) {
    return "no-signal";
  }
  if (nowTimestamp - probeTimestamp > PROBE_STALE_WINDOW_MS) {
    return "stale";
  }
  if (run.status === "partial") {
    return "partial";
  }
  const isDegradedSignal = run.degraded || (run.precision !== null && run.precision !== "official");
  if (isDegradedSignal) {
    return "partial";
  }
  if (run.status === "success") {
    return "success";
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
  const referenceNow = typeof input.nowTimestamp === "number" ? input.nowTimestamp : new Date().getTime();
  return classifyProbeRunState(input.run, referenceNow);
};
