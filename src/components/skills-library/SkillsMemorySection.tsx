import { useEffect, useState } from "react";
import { getSkillUsageSummary } from "../../api";
import type { Agent, SkillUsageSummary } from "../../types";
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
  const [usageSummary, setUsageSummary] = useState<SkillUsageSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    getSkillUsageSummary()
      .then((rows) => {
        if (!cancelled) setUsageSummary(rows);
      })
      .catch(() => {
        if (!cancelled) setUsageSummary([]);
      });
    return () => {
      cancelled = true;
    };
  }, [historyRefreshToken]);

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-100">{skillText(t, "memory.title")}</div>
        <div className="text-[11px] text-slate-500">{skillText(t, "memory.subtitle")}</div>
      </div>
      {usageSummary.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {usageSummary.slice(0, 8).map((skill) => (
            <span
              key={skill.skill_id}
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100"
            >
              {skill.skill_id} · 사용 {skill.use_count}회 · 숙련도 {Math.round(skill.proficiency * 100)}%
            </span>
          ))}
        </div>
      ) : null}
      <SkillHistoryPanel
        agents={agents}
        refreshToken={historyRefreshToken}
        onLearningDataChanged={onRefreshHistory}
        className="h-[380px]"
      />
    </div>
  );
}
