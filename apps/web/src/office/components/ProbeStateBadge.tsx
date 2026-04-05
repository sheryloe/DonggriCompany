import { mapProbeStateToPresentation } from "../lib/probe-presentation";
import type { ProbeUiState } from "../lib/probe-ui-state";

type ProbeStateBadgeProps = {
  state: ProbeUiState;
};

export function ProbeStateBadge({ state }: ProbeStateBadgeProps): JSX.Element {
  const presentation = mapProbeStateToPresentation(state);

  return (
    <span
      className={`probe-state probe-state-${presentation.stateKey} emphasis-${presentation.stateEmphasis}`}
      title={`confidence ${presentation.confidenceHint}`}
    >
      <span className="probe-state-dot" aria-hidden="true" />
      {presentation.stateLabel}
    </span>
  );
}
