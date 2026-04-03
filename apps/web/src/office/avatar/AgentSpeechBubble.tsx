import type { AgentGuidanceMessage } from "./agent-copy";

type AgentSpeechBubbleProps = {
  message: AgentGuidanceMessage;
  toneClassName: string;
};

export function AgentSpeechBubble({ message, toneClassName }: AgentSpeechBubbleProps): JSX.Element {
  return (
    <article className={`agent-speech ${toneClassName}`} aria-live="polite">
      <strong>{message.title}</strong>
      <p>{message.body}</p>
      <p className="hint">{message.suggestion}</p>
    </article>
  );
}
