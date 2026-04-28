import type { TFunction } from "./model";
import { skillText, skillTextVars } from "./skillLibraryText";

interface SkillsHeaderProps {
  t: TFunction;
  totalSkillsCount: number;
  catalogSkillsCount: number;
  customSkillsCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: "rank" | "name" | "installs";
  onSortByChange: (value: "rank" | "name" | "installs") => void;
  refreshing: boolean;
  onRefreshCatalog: () => void;
  onOpenCustomSkillModal: () => void;
}

export default function SkillsHeader({
  t,
  totalSkillsCount,
  catalogSkillsCount,
  customSkillsCount,
  search,
  onSearchChange,
  sortBy,
  onSortByChange,
  refreshing,
  onRefreshCatalog,
  onOpenCustomSkillModal,
}: SkillsHeaderProps) {
  return (
    <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="rounded-md border border-slate-600/60 px-1.5 py-0.5 text-[10px] text-slate-300">
              SKILL
            </span>
            {skillText(t, "header.title")}
          </h2>
          <p className="text-sm text-slate-400 mt-1">{skillText(t, "header.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onRefreshCatalog}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 disabled:cursor-not-allowed disabled:opacity-60 transition-all"
            title={skillText(t, "header.refreshTitle")}
          >
            {refreshing ? skillText(t, "action.refreshing") : skillText(t, "action.refresh")}
          </button>
          <button
            onClick={onOpenCustomSkillModal}
            className="custom-skill-add-btn flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-violet-600/20 text-violet-300 border border-violet-500/30 rounded-lg hover:bg-violet-600/30 transition-all"
            title={skillText(t, "header.addCustomTitle")}
          >
            {skillText(t, "header.addCustom")}
          </button>
          <div className="text-right">
            <div className="text-2xl font-bold text-empire-gold">{totalSkillsCount}</div>
            <div className="text-xs text-slate-500">{skillText(t, "header.registeredSkills")}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {skillTextVars(t, "header.countSummary", {
                total: totalSkillsCount,
                catalog: catalogSkillsCount,
                custom: customSkillsCount,
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={skillText(t, "header.searchPlaceholder")}
            className="w-full bg-slate-900/60 border border-slate-600/50 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              &times;
            </button>
          )}
        </div>

        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value as "rank" | "name" | "installs")}
          className="bg-slate-900/60 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50"
        >
          <option value="rank">{skillText(t, "sort.rank")}</option>
          <option value="installs">{skillText(t, "sort.installs")}</option>
          <option value="name">{skillText(t, "sort.name")}</option>
        </select>
      </div>
    </div>
  );
}
