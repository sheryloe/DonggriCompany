import { CATEGORIES, CATEGORY_ICONS, categoryLabel, type TFunction } from "./model";

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
  const allCount = categoryCounts.All || 0;
  const isAllCategory = selectedCategory === "All";
  const hasSearch = search.trim().length > 0;

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
            {CATEGORY_ICONS[category]} {categoryLabel(category, t)}
            <span className="ml-1 text-slate-500">{categoryCounts[category] || 0}</span>
          </button>
        ))}
      </div>

      <div className="text-xs text-slate-500 px-1">
        {isAllCategory && !hasSearch
          ? t({
              ko: `총 ${allCount}개 집계중 (카탈로그 ${filteredLength} + 커스텀 ${customSkillsCount})`,
              en: `Total ${allCount} aggregated (catalog ${filteredLength} + custom ${customSkillsCount})`,
              ja: `合計 ${allCount} 件を集計中 (catalog ${filteredLength} + custom ${customSkillsCount})`,
              zh: `当前汇总 ${allCount} 个（catalog ${filteredLength} + custom ${customSkillsCount}）`,
            })
          : isAllCategory && hasSearch
            ? t({
                ko: `카탈로그 검색 결과 ${filteredLength}개 · 전체 집계 ${allCount}개`,
                en: `Catalog search results ${filteredLength} · total aggregated ${allCount}`,
                ja: `カタログ検索結果 ${filteredLength} 件 · 全体集計 ${allCount} 件`,
                zh: `目录搜索结果 ${filteredLength} 个 · 总汇总 ${allCount} 个`,
              })
            : t({
                ko: `${filteredLength}개 스킬 표시중${hasSearch ? ` · "${search}" 검색 결과` : ""}`,
                en: `${filteredLength} skills shown${hasSearch ? ` · "${search}" search results` : ""}`,
                ja: `${filteredLength}件のスキルを表示中${hasSearch ? ` · 「${search}」検索結果` : ""}`,
                zh: `已显示 ${filteredLength} 个技能${hasSearch ? ` · “${search}” 搜索结果` : ""}`,
              })}
      </div>
    </>
  );
}
