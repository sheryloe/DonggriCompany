import type { ReactNode } from "react";

import type { ProbeUiState } from "../lib/probe-ui-state";
import { AgentSpeechBubble } from "./AgentSpeechBubble";
import { getAgentGuidanceMessage, getAgentToneClassName } from "./agent-copy";
import type { AgentGuidanceEvent } from "./agent-types";
import { AgentStatusPresenter } from "./AgentStatusPresenter";

type AgentShellProps = {
  probeState: ProbeUiState;
  event: AgentGuidanceEvent;
  headerNote?: ReactNode;
};

export function AgentShell({ probeState, event, headerNote }: AgentShellProps): JSX.Element {
  const message = getAgentGuidanceMessage(event, probeState);
  const toneClassName = getAgentToneClassName(probeState);

  return (
    <section className="card avatar-shell" aria-label="Avatar Agent Shell">
      <header>
        <h2>Office Agent</h2>
        {headerNote ?? <span className="hint">Primary interaction surface</span>}
      </header>
      <div className="avatar-shell-grid">
        <AgentStatusPresenter probeState={probeState} />
        <AgentSpeechBubble message={message} toneClassName={toneClassName} />
      </div>
    </section>
  );
}
