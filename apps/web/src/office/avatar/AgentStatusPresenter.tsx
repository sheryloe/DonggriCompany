import type { CSSProperties } from "react";

import {
  getCharacterSpritePath,
  getLeadSpriteId,
  getSpriteAnimStateFromProbeState
} from "../board/pixel-atlas";
import { mapProbeStateToPresentation } from "../lib/probe-presentation";
import type { ProbeUiState } from "../lib/probe-ui-state";
import type { SpriteCharacterId } from "../board/scene-types";

const squadSprites = [
  "char_5",
  "char_2",
  "char_1",
  "char_4"
] as const;

type AgentStatusPresenterProps = {
  probeState: ProbeUiState;
};

const spriteStyle = (spriteId: SpriteCharacterId): CSSProperties => ({
  backgroundImage: `url(${getCharacterSpritePath(spriteId)})`
});

export function AgentStatusPresenter({ probeState }: AgentStatusPresenterProps): JSX.Element {
  const presentation = mapProbeStateToPresentation(probeState);
  const leadAnimState = getSpriteAnimStateFromProbeState(presentation.stateKey);
  const leadSpriteId = getLeadSpriteId(presentation.stateKey);

  return (
    <div className={`agent-status mood-${presentation.avatarMood} motion-${presentation.motionPreset}`}>
      <div className="agent-status-frame">
        <div className={`agent-pixel-stage emphasis-${presentation.stateEmphasis}`} role="img" aria-label={`avatar mood ${presentation.avatarMood}`}>
          <div className="agent-pixel-grid" aria-hidden="true" />
          <div className={`agent-pixel-avatar agent-lead state-${leadAnimState}`} style={spriteStyle(leadSpriteId)} />
          <div className={`agent-pixel-bubble tone-${presentation.copyTone}`}>{presentation.emote} {presentation.stateLabel}</div>

          <div className="agent-pixel-squad" aria-hidden="true">
            {squadSprites.map((sprite, index) => (
              <div
                key={`${sprite}-${index}`}
                className={`agent-pixel-avatar agent-squad slot-${index + 1} state-idle`}
                style={spriteStyle(sprite)}
              />
            ))}
          </div>
          <div className="agent-pixel-floor" aria-hidden="true" />
        </div>

        <div className="agent-telemetry-panel">
          <span className={`agent-status-chip emphasis-${presentation.stateEmphasis}`}>{presentation.stateLabel}</span>
          <strong>{presentation.hudLabel}</strong>
          <p>{presentation.stateSummary}</p>
          <p className="agent-confidence-hint">confidence: {presentation.confidenceHint}</p>
        </div>
      </div>
      <div className={`board-signal board-signal-${presentation.boardSignal}`}>{presentation.boardSignalLabel}</div>
    </div>
  );
}
