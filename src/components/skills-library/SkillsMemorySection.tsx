import type { Agent } from "../../types";
import SkillHistoryPanel from "../SkillHistoryPanel";
import type { TFunction } from "./model";
import { skillText } from "./skillLibraryText";

interface SkillsMemorySectionProps {
  t: TFunction;
  agents: Agent[];
  historyRefreshToken: number;
  onRefreshHistory: () => void;
}

export default function SkillsMemorySection({
  t,
  agents,
  historyRefreshToken,
  onRefreshHistory,
}: SkillsMemorySectionProps) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-100">
          {skillText(t, "memory.title")}
        </div>
        <div className="text-[11px] text-slate-500">{skillText(t, "memory.subtitle")}</div>
      </div>
      <SkillHistoryPanel
        agents={agents}
        refreshToken={historyRefreshToken}
        onLearningDataChanged={onRefreshHistory}
        className="h-[380px]"
      />
    </div>
  );
}
