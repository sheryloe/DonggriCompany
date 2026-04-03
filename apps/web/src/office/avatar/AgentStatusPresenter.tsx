import { mapProbeStateToPresentation } from "../lib/probe-presentation";
import type { ProbeUiState } from "../lib/probe-ui-state";

type AgentStatusPresenterProps = {
  probeState: ProbeUiState;
};

export function AgentStatusPresenter({ probeState }: AgentStatusPresenterProps): JSX.Element {
  const presentation = mapProbeStateToPresentation(probeState);

  return (
    <div className={`agent-status mood-${presentation.avatarMood}`}>
      <div className="agent-avatar" role="img" aria-label={`avatar mood ${presentation.avatarMood}`}>
        <span className="agent-avatar-face" />
      </div>
      <div className={`board-signal board-signal-${presentation.boardSignal}`}>
        signal: {presentation.boardSignal}
      </div>
    </div>
  );
}
