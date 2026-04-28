import type { CustomSkillEntry, SkillLearnProvider } from "../../api";
import { providerLabel, type TFunction } from "./model";
import { skillText } from "./skillLibraryText";

interface CustomSkillSectionProps {
  t: TFunction;
  customSkills: CustomSkillEntry[];
  localeTag: string;
  search?: string;
  onDeleteSkill: (skillName: string) => void;
}

export default function CustomSkillSection({
  t,
  customSkills,
  localeTag,
  search = "",
  onDeleteSkill,
}: CustomSkillSectionProps) {
  const normalizedSearch = search.trim().toLowerCase();
  const visibleSkills = normalizedSearch
    ? customSkills.filter(
        (skill) =>
          skill.skillName.toLowerCase().includes(normalizedSearch) ||
          skill.providers.some((provider) => provider.toLowerCase().includes(normalizedSearch)),
      )
    : customSkills;

  if (customSkills.length === 0) return null;

  return (
    <div className="custom-skill-list rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-violet-200 flex items-center gap-2">
          <span>USR</span>
          {skillText(t, "custom.sectionTitle")}
          <span className="text-[11px] text-slate-500 font-normal">({visibleSkills.length})</span>
        </div>
      </div>

      {visibleSkills.length === 0 ? (
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-3 py-8 text-center text-xs text-slate-500">
          {skillText(t, "custom.noMatches")}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {visibleSkills.map((skill) => (
            <div
              key={skill.skillName}
              className="custom-skill-card flex items-center justify-between bg-slate-800/50 border border-slate-700/40 rounded-lg px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-white truncate">{skill.skillName}</div>
                <div className="text-[10px] text-slate-500">
                  {skill.providers.map((provider) => providerLabel(provider as SkillLearnProvider)).join(", ")}
                  {" · "}
                  {new Date(skill.createdAt).toLocaleDateString(localeTag)}
                </div>
              </div>
              <button
                onClick={() => onDeleteSkill(skill.skillName)}
                className="shrink-0 ml-2 text-[10px] px-2 py-0.5 rounded border border-rose-500/30 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-all"
              >
                {skillText(t, "action.delete")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
