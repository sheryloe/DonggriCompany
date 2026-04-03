import type { ReactNode } from "react";

import { BoardZone } from "./BoardZone";

type OfficeBoardSceneProps = {
  accountPoolZone: ReactNode;
  runtimeProfileZone: ReactNode;
  probeMonitorZone: ReactNode;
  historyBoardZone: ReactNode;
};

export function OfficeBoardScene({
  accountPoolZone,
  runtimeProfileZone,
  probeMonitorZone,
  historyBoardZone
}: OfficeBoardSceneProps): JSX.Element {
  return (
    <section className="office-board-scene">
      <div className="office-board-chrome">
        <span className="office-lamp">status lamp</span>
        <span className="office-memo">memo board</span>
      </div>

      <div className="office-board-grid">
        <BoardZone title="Account Pool Zone" subtitle="Provider resource tanks and fatigue">
          {accountPoolZone}
        </BoardZone>
        <BoardZone title="Runtime Profile Cabinet" subtitle="Profile lifecycle and safe delete">
          {runtimeProfileZone}
        </BoardZone>
        <BoardZone title="Probe Monitor Panel" subtitle="Run probe and inspect latest classification">
          {probeMonitorZone}
        </BoardZone>
        <BoardZone title="History Board" subtitle="Filtered records with retry and empty guidance">
          {historyBoardZone}
        </BoardZone>
      </div>
    </section>
  );
}
