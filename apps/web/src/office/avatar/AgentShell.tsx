import type { ReactNode } from "react";

import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";
import { mapProbeStateToPresentation } from "../lib/probe-presentation";
import type { ProbeUiState } from "../lib/probe-ui-state";
import { AgentSpeechBubble } from "./AgentSpeechBubble";
import { getAgentGuidanceMessage, getAgentToneClassName } from "./agent-copy";
import type { AgentGuidanceEvent } from "./agent-types";
import { AgentStatusPresenter } from "./AgentStatusPresenter";

type AgentShellProps = {
  probeState: ProbeUiState;
  event: AgentGuidanceEvent;
  headerNote?: ReactNode;
  variant?: "full" | "speech-only";
  t?: OfficeTranslator;
};

export function AgentShell({
  probeState,
  event,
  headerNote,
  variant = "full",
  t = createOfficeTranslator("en")
}: AgentShellProps): JSX.Element {
  const message = getAgentGuidanceMessage(event, probeState);
  const toneClassName = getAgentToneClassName(probeState);
  const presentation = mapProbeStateToPresentation(probeState);

  if (variant === "speech-only") {
    return (
      <section className="card avatar-shell avatar-shell-speech-only" aria-labelledby="office-agent-shell-title">
        <header className="avatar-shell-header">
          <div>
            <p className="avatar-shell-kicker">{t("agent.kicker")}</p>
            <h2 id="office-agent-shell-title">{t("agent.title")}</h2>
          </div>
          <div className="avatar-shell-readout">
            <span className={`agent-status-chip emphasis-${presentation.stateEmphasis}`}>{presentation.stateLabel}</span>
            {headerNote ?? <span className="avatar-shell-context-copy">{presentation.hudLabel}</span>}
          </div>
        </header>
        <AgentSpeechBubble
          message={message}
          toneClassName={toneClassName}
          guidanceKicker={t("agent.guidanceKicker")}
          riskLabel={t("agent.riskLabel")}
          nextMoveLabel={t("agent.nextMove")}
        />
      </section>
    );
  }

  return (
    <section className="card avatar-shell" aria-labelledby="office-agent-shell-title">
      <header className="avatar-shell-header">
        <div>
          <p className="avatar-shell-kicker">{t("agent.kicker")}</p>
          <h2 id="office-agent-shell-title">{t("agent.title")}</h2>
        </div>
        <div className="avatar-shell-readout">
          <span className={`agent-status-chip emphasis-${presentation.stateEmphasis}`}>{presentation.stateLabel}</span>
          {headerNote ?? <span className="avatar-shell-context-copy">{presentation.hudLabel}</span>}
        </div>
      </header>
      <div className="avatar-shell-grid">
        <AgentStatusPresenter probeState={probeState} />
        <AgentSpeechBubble
          message={message}
          toneClassName={toneClassName}
          guidanceKicker={t("agent.guidanceKicker")}
          riskLabel={t("agent.riskLabel")}
          nextMoveLabel={t("agent.nextMove")}
        />
      </div>
    </section>
  );
}
