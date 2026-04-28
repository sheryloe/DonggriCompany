import { CATEGORIES, CATEGORY_BADGES, categoryLabel, type TFunction } from "./model";
import { skillTextVars } from "./skillLibraryText";

interface SkillsCategoryBarProps {
  t: TFunction;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryCounts: Record<string, number>;
  filteredLength: number;
  search: string;
  customSkillsCount: number;
}

export default function SkillsCategoryBar({
  t,
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  filteredLength,
  search,
  customSkillsCount,
}: SkillsCategoryBarProps) {
  const allCount = categoryCounts.all || 0;
  const isAllCategory = selectedCategory === "all";
  const hasSearch = search.trim().length > 0;
  const searchSuffix = hasSearch ? skillTextVars(t, "category.searchSuffix", { search }) : "";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => onSelectCategory(category)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              selectedCategory === category
                ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                : "bg-slate-800/40 text-slate-400 border-slate-700/50 hover:bg-slate-700/40 hover:text-slate-300"
            }`}
          >
            <span className="mr-1 text-[10px] text-slate-500">{CATEGORY_BADGES[category]}</span>
            {categoryLabel(category, t)}
            <span className="ml-1 text-slate-500">{categoryCounts[category] || 0}</span>
          </button>
        ))}
      </div>

      <div className="text-xs text-slate-500 px-1">
        {isAllCategory && !hasSearch
          ? skillTextVars(t, "category.summaryAll", {
              all: allCount,
              catalog: filteredLength,
              custom: customSkillsCount,
            })
          : isAllCategory && hasSearch
            ? skillTextVars(t, "category.summarySearchAll", {
                filtered: filteredLength,
                all: allCount,
              })
            : skillTextVars(t, "category.summaryFiltered", {
                filtered: filteredLength,
                suffix: searchSuffix,
              })}
      </div>
    </>
  );
}
