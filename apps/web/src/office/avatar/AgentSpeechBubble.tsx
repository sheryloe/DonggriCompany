import type { AgentGuidanceMessage } from "./agent-copy";

type AgentSpeechBubbleProps = {
  message: AgentGuidanceMessage;
  toneClassName: string;
  guidanceKicker?: string;
  riskLabel?: string;
  nextMoveLabel?: string;
};

export function AgentSpeechBubble({
  message,
  toneClassName,
  guidanceKicker = "Primary Guidance",
  riskLabel = "risk",
  nextMoveLabel = "Next Move"
}: AgentSpeechBubbleProps): JSX.Element {
  return (
    <article className={`agent-speech ${toneClassName}`}>
      <p className="agent-speech-live" aria-live="polite">
        {message.headline}
      </p>
      <p className="agent-speech-kicker">{guidanceKicker}</p>
      <strong className="agent-speech-headline">{message.headline}</strong>
      <p className="agent-speech-body">{message.body}</p>
      <p className={`agent-risk-chip risk-${message.riskLevel}`}>{riskLabel}: {message.riskLevel}</p>
      <div className="agent-action-block">
        <span className="agent-action-label">{nextMoveLabel}</span>
        <p className="agent-primary-action">{message.primaryAction}</p>
      </div>
      <p className="agent-supporting-hint">{message.supportingHint}</p>
    </article>
  );
}
