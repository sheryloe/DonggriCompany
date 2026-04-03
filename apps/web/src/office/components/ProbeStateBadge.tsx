import type { ProbeUiState } from "../hooks/useProviderProbe";

type ProbeStateBadgeProps = {
  state: ProbeUiState;
};

const labels: Record<ProbeUiState, string> = {
  success: "success",
  partial: "partial",
  stale: "stale",
  "no-signal": "no-signal",
  error: "error"
};

export function ProbeStateBadge({ state }: ProbeStateBadgeProps): JSX.Element {
  return <span className={`probe-state probe-state-${state}`}>{labels[state]}</span>;
}
