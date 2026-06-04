import { useState } from "react";
import { getOpenSourceSkillCandidates, type ControlPlaneOpenSourceCandidateResult } from "../api/control-plane";
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
  const [candidateQuery, setCandidateQuery] = useState("agent framework");
  const [candidateResult, setCandidateResult] = useState<ControlPlaneOpenSourceCandidateResult | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);

  if (vm.loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <div className="text-sm text-slate-400">{skillText(t, "loading.catalog")}</div>
        </div>
      </div>
    );
  }

  if (vm.error && vm.skills.length === 0 && vm.customSkillsCount === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="mb-3 text-xs font-semibold text-rose-300">불러오기 실패</div>
          <div className="text-sm text-slate-400">{skillText(t, "loading.failed")}</div>
          <div className="mt-1 text-xs text-slate-500">{vm.error}</div>
          <button
            onClick={vm.loadSkills}
            className="mt-4 rounded-lg border border-blue-500/30 bg-blue-600/20 px-4 py-2 text-sm text-blue-400 transition-all hover:bg-blue-600/30"
          >
            {skillText(t, "action.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="command-panel p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">Skill Library</div>
        <h1 className="mt-1 text-xl font-bold tracking-normal" style={{ color: "var(--th-text-primary)" }}>
          Skill 선택과 부서 메모리
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-text-secondary)" }}>
          Skill은 마스터 에이전트가 사용할 수 있는 작업 지침입니다. 검색, 카테고리, 학습 상태를 먼저 확인하고 필요한
          Skill만 연결합니다.
        </p>
      </section>

      <section className="command-panel p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600">External Instructor</div>
        <div className="mt-2 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] xl:items-start">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold" style={{ color: "var(--th-text-primary)" }}>
              외부강사 마스터 · 오픈소스 Skill 후보
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--th-text-secondary)" }}>
              GitHub high-star 후보를 읽기 전용으로 가져와 Skill 후보를 제안합니다. 설치, hooks, MCP 연결은 OPS 승인
              뒤에만 합니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["읽기 전용", "고스타 후보", "OPS 승인 후 설치"].map((item) => (
                <span
                  key={item}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-secondary)",
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div
            className="rounded-2xl border p-3"
            style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
          >
            <label className="mb-2 block text-xs font-semibold" style={{ color: "var(--th-text-secondary)" }}>
              후보 검색
            </label>
            <div className="grid w-full gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={candidateQuery}
                onChange={(event) => setCandidateQuery(event.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                style={{
                  borderColor: "var(--th-border)",
                  background: "var(--th-bg-elevated)",
                  color: "var(--th-text-primary)",
                }}
                placeholder="예: agent memory, ai coding assistant, testing"
              />
              <button
                type="button"
                disabled={candidateLoading}
                onClick={() => {
                  setCandidateLoading(true);
                  getOpenSourceSkillCandidates(candidateQuery, 6)
                    .then(setCandidateResult)
                    .finally(() => setCandidateLoading(false));
                }}
                className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-800 disabled:opacity-50 dark:text-cyan-100"
              >
                {candidateLoading ? "가져오는 중" : "후보 가져오기"}
              </button>
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--th-text-muted)" }}>
              검색 결과는 Skill 후보로만 표시하며, 설치나 실행은 별도 승인 뒤에 진행합니다.
            </p>
          </div>
        </div>
        {candidateResult && (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {candidateResult.candidates.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--th-text-muted)" }}>
                후보를 가져오지 못했습니다. {candidateResult.error ?? "검색 결과 없음"}
              </div>
            ) : (
              candidateResult.candidates.map((candidate) => (
                <a
                  key={candidate.name}
                  href={candidate.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border p-3 transition hover:border-cyan-400/50"
                  style={{
                    borderColor: "var(--th-border)",
                    background: "var(--th-bg-surface)",
                    color: "var(--th-text-primary)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 font-semibold">{candidate.name}</div>
                    <div className="shrink-0 text-xs" style={{ color: "var(--th-text-muted)" }}>
                      ★ {candidate.stars.toLocaleString()}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs" style={{ color: "var(--th-text-secondary)" }}>
                    {candidate.description}
                  </p>
                  <div className="mt-2 text-[11px]" style={{ color: "var(--th-text-muted)" }}>
                    {candidate.language ?? "unknown"} ·{" "}
                    {candidate.updated_at ? new Date(candidate.updated_at).toLocaleDateString("ko-KR") : "-"}
                  </div>
                </a>
              ))
            )}
          </div>
        )}
      </section>

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

      <div className="py-4 text-center text-xs text-slate-600">{skillText(t, "footer.sources")}</div>
    </div>
  );
}
