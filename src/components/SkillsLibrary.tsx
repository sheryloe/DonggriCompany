import { useI18n } from "../i18n";
import type { Agent } from "../types";
import ClassroomOverlay from "./skills-library/ClassroomOverlay";
import CustomSkillModal from "./skills-library/CustomSkillModal";
import CustomSkillSection from "./skills-library/CustomSkillSection";
import LearningModal from "./skills-library/LearningModal";
import SkillsCategoryBar from "./skills-library/SkillsCategoryBar";
import SkillsGrid from "./skills-library/SkillsGrid";
import SkillsHeader from "./skills-library/SkillsHeader";
import SkillsMemorySection from "./skills-library/SkillsMemorySection";
import { skillText } from "./skills-library/skillLibraryText";
import { useSkillsLibraryState } from "./skills-library/useSkillsLibraryState";

interface SkillsLibraryProps {
  agents: Agent[];
}

export default function SkillsLibrary({ agents }: SkillsLibraryProps) {
  const { t, locale: localeTag } = useI18n();
  const vm = useSkillsLibraryState({ agents, localeTag, t });

  if (vm.loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <div className="text-slate-400 text-sm">{skillText(t, "loading.catalog")}</div>
        </div>
      </div>
    );
  }

  if (vm.error && vm.skills.length === 0 && vm.customSkillsCount === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="text-xs font-semibold text-rose-300 mb-3">LOAD FAILED</div>
          <div className="text-slate-400 text-sm">{skillText(t, "loading.failed")}</div>
          <div className="text-slate-500 text-xs mt-1">{vm.error}</div>
          <button
            onClick={vm.loadSkills}
            className="mt-4 px-4 py-2 text-sm bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition-all"
          >
            {skillText(t, "action.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SkillsHeader
        t={t}
        totalSkillsCount={vm.totalSkillsCount}
        catalogSkillsCount={vm.catalogSkillsCount}
        customSkillsCount={vm.customSkillsCount}
        search={vm.search}
        onSearchChange={vm.setSearch}
        sortBy={vm.sortBy}
        onSortByChange={vm.setSortBy}
        refreshing={vm.refreshingSkills}
        onRefreshCatalog={() => {
          void vm.handleRefreshSkills();
        }}
        onOpenCustomSkillModal={vm.openCustomSkillModal}
      />

      <SkillsCategoryBar
        t={t}
        selectedCategory={vm.selectedCategory}
        onSelectCategory={vm.setSelectedCategory}
        categoryCounts={vm.categoryCounts}
        filteredLength={
          vm.selectedCategory === "custom"
            ? vm.filteredCustomSkillsCount
            : vm.selectedCategory === "all" && vm.search.trim()
              ? vm.filtered.length + vm.filteredCustomSkillsCount
              : vm.filtered.length
        }
        search={vm.search}
        customSkillsCount={vm.customSkillsCount}
      />

      <SkillsMemorySection
        t={t}
        agents={agents}
        historyRefreshToken={vm.historyRefreshToken}
        onRefreshHistory={() => vm.setHistoryRefreshToken((prev) => prev + 1)}
      />

      {vm.selectedCategory !== "custom" && (
        <SkillsGrid
          t={t}
          localeTag={localeTag}
          agents={agents}
          filtered={vm.filtered}
          learnedProvidersBySkill={vm.learnedProvidersBySkill}
          learnedRepresentatives={vm.learnedRepresentatives}
          hoveredSkill={vm.hoveredSkill}
          setHoveredSkill={vm.setHoveredSkill}
          detailCache={vm.detailCache}
          tooltipRef={vm.tooltipRef}
          hoverTimerRef={vm.hoverTimerRef}
          copiedSkill={vm.copiedSkill}
          installingCodexSkill={vm.installingCodexSkill}
          codexInstallError={vm.codexInstallError}
          oauthStatus={vm.oauthStatus}
          onHoverEnter={vm.handleCardMouseEnter}
          onHoverLeave={vm.handleCardMouseLeave}
          onOpenLearningModal={vm.openLearningModal}
          onCopy={vm.handleCopy}
          onInstallToCodex={(skill) => {
            void vm.handleInstallToCodex(skill);
          }}
        />
      )}

      <LearningModal
        t={t}
        localeTag={localeTag}
        agents={agents}
        learningSkill={vm.learningSkill}
        learnInProgress={vm.learnInProgress}
        selectedProviders={vm.selectedProviders}
        representatives={vm.representatives}
        preferKoreanName={vm.preferKoreanName}
        modalLearnedProviders={vm.modalLearnedProviders}
        unlearningProviders={vm.unlearningProviders}
        unlearnEffects={vm.unlearnEffects}
        learnJob={vm.learnJob}
        learnError={vm.learnError}
        unlearnError={vm.unlearnError}
        learnSubmitting={vm.learnSubmitting}
        defaultSelectedProviders={vm.defaultSelectedProviders}
        onClose={vm.closeLearningModal}
        onToggleProvider={vm.toggleProvider}
        onUnlearnProvider={(provider) => {
          void vm.handleUnlearnProvider(provider);
        }}
        onStartLearning={() => {
          void vm.handleStartLearning();
        }}
      />

      {(vm.selectedCategory === "all" || vm.selectedCategory === "custom") && (
        <CustomSkillSection
          t={t}
          customSkills={vm.customSkills}
          localeTag={localeTag}
          search={vm.search}
          onDeleteSkill={(skillName) => {
            void vm.handleDeleteCustomSkill(skillName);
          }}
        />
      )}

      <ClassroomOverlay
        t={t}
        show={vm.showClassroomAnimation}
        skillName={vm.classroomAnimSkillName}
        providers={vm.classroomAnimProviders}
        agents={agents}
      />

      <CustomSkillModal
        t={t}
        show={vm.showCustomModal}
        agents={agents}
        representatives={vm.representatives}
        preferKoreanName={vm.preferKoreanName}
        customSkillName={vm.customSkillName}
        setCustomSkillName={vm.setCustomSkillName}
        customSkillContent={vm.customSkillContent}
        customSkillFileName={vm.customSkillFileName}
        customSkillProviders={vm.customSkillProviders}
        customSkillSubmitting={vm.customSkillSubmitting}
        customSkillError={vm.customSkillError}
        customFileInputRef={vm.customFileInputRef}
        onClose={vm.closeCustomSkillModal}
        onFileSelect={vm.handleCustomFileSelect}
        onToggleProvider={vm.toggleCustomProvider}
        onSubmit={() => {
          void vm.handleCustomSkillSubmit();
        }}
      />

      <div className="text-center text-xs text-slate-600 py-4">
        {skillText(t, "footer.sources")}
      </div>
    </div>
  );
}
