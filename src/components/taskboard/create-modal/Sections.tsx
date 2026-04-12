import type { KeyboardEvent, RefObject } from "react";
import type { Agent, Department, Project } from "../../../types";
import AgentSelect from "../../AgentSelect";
import { priorityIcon, priorityLabel, type MissingPathPrompt, type TFunction } from "../constants";

interface PrioritySectionProps {
  priority: number;
  t: TFunction;
  onPriorityChange: (priority: number) => void;
}

export function PrioritySection({ priority, t, onPriorityChange }: PrioritySectionProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-300">
        {t({ ko: "우선순위", en: "Priority", ja: "Priority", zh: "Priority" })}: {priorityIcon(priority)}{" "}
        {priorityLabel(priority, t)} ({priority}/5)
      </label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onPriorityChange(star)}
            className={`flex-1 rounded-lg py-2 text-lg transition ${
              star <= priority ? "bg-amber-600 text-white shadow-md" : "bg-slate-800 text-slate-500 hover:bg-slate-700"
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

interface AssigneeSectionProps {
  agents: Agent[];
  departments: Department[];
  departmentId: string;
  assignAgentId: string;
  t: TFunction;
  onAssignAgentChange: (agentId: string) => void;
}

export function AssigneeSection({
  agents,
  departments,
  departmentId,
  assignAgentId,
  t,
  onAssignAgentChange,
}: AssigneeSectionProps) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-300">
        {t({ ko: "담당 에이전트", en: "Assignee", ja: "Assignee", zh: "Assignee" })}
      </label>
      <AgentSelect
        agents={agents}
        departments={departments}
        value={assignAgentId}
        onChange={(value) => onAssignAgentChange(value)}
        placeholder={t({
          ko: "-- 미할당 --",
          en: "-- Unassigned --",
          ja: "-- Unassigned --",
          zh: "-- Unassigned --",
        })}
        size="md"
      />
      {departmentId && agents.length === 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {t({
            ko: "이 부서에는 배정 가능한 에이전트가 없습니다.",
            en: "No agents are available in this department.",
            ja: "No agents are available in this department.",
            zh: "No agents are available in this department.",
          })}
        </p>
      )}
    </div>
  );
}

interface ProjectSectionProps {
  t: TFunction;
  projectPickerRef: RefObject<HTMLDivElement | null>;
  projectQuery: string;
  projectDropdownOpen: boolean;
  projectActiveIndex: number;
  projectsLoading: boolean;
  filteredProjects: Project[];
  selectedProject: Project | null;
  projects: Project[];
  createNewProjectMode: boolean;
  newProjectPath: string;
  pathApiUnsupported: boolean;
  pathSuggestionsOpen: boolean;
  pathSuggestionsLoading: boolean;
  pathSuggestions: string[];
  missingPathPrompt: MissingPathPrompt | null;
  nativePathPicking: boolean;
  nativePickerUnsupported: boolean;
  githubAutoCreateEnabled: boolean;
  githubRepoName: string;
  githubRepoPrivate: boolean;
  defaultProjectRoot: string;
  defaultProjectRootLoading: boolean;
  projectPathCustomized: boolean;
  onProjectQueryChange: (value: string) => void;
  onProjectInputFocus: () => void;
  onProjectInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onToggleProjectDropdown: () => void;
  onSelectProject: (project: Project | null) => void;
  onProjectHover: (projectId: string) => void;
  onEnableCreateNewProject: () => void;
  onGitHubAutoCreateEnabledChange: (enabled: boolean) => void;
  onGitHubRepoNameChange: (value: string) => void;
  onGitHubRepoPrivateChange: (isPrivate: boolean) => void;
  onEnableProjectPathCustomization: () => void;
  onResetAutoProjectPath: () => void;
  onNewProjectPathChange: (value: string) => void;
  onOpenManualPathBrowser: () => void;
  onTogglePathSuggestions: () => void;
  onPickNativePath: () => void;
  onSelectPathSuggestion: (path: string) => void;
}

export function ProjectSection({
  t,
  projectPickerRef,
  projectQuery,
  projectDropdownOpen,
  projectActiveIndex,
  projectsLoading,
  filteredProjects,
  selectedProject,
  projects,
  createNewProjectMode,
  newProjectPath,
  pathApiUnsupported,
  pathSuggestionsOpen,
  pathSuggestionsLoading,
  pathSuggestions,
  missingPathPrompt,
  nativePathPicking,
  nativePickerUnsupported,
  githubAutoCreateEnabled,
  githubRepoName,
  githubRepoPrivate,
  defaultProjectRoot,
  defaultProjectRootLoading,
  projectPathCustomized,
  onProjectQueryChange,
  onProjectInputFocus,
  onProjectInputKeyDown,
  onToggleProjectDropdown,
  onSelectProject,
  onProjectHover,
  onEnableCreateNewProject,
  onGitHubAutoCreateEnabledChange,
  onGitHubRepoNameChange,
  onGitHubRepoPrivateChange,
  onEnableProjectPathCustomization,
  onResetAutoProjectPath,
  onNewProjectPathChange,
  onOpenManualPathBrowser,
  onTogglePathSuggestions,
  onPickNativePath,
  onSelectPathSuggestion,
}: ProjectSectionProps) {
  const githubAutoPathLocked = githubAutoCreateEnabled && !projectPathCustomized;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-300">
        {t({ ko: "프로젝트명", en: "Project Name", ja: "Project Name", zh: "Project Name" })}
      </label>
      <div className="relative" ref={projectPickerRef}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={projectQuery}
            onChange={(event) => onProjectQueryChange(event.target.value)}
            onFocus={onProjectInputFocus}
            onKeyDown={onProjectInputKeyDown}
            placeholder={t({
              ko: "프로젝트 이름 또는 경로 입력",
              en: "Type project name or path",
              ja: "Type project name or path",
              zh: "Type project name or path",
            })}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={onToggleProjectDropdown}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs text-slate-300 transition hover:bg-slate-700 hover:text-white"
            title={t({
              ko: "프로젝트 목록 열기",
              en: "Toggle project list",
              ja: "Toggle project list",
              zh: "Toggle project list",
            })}
          >
            {projectDropdownOpen ? "▴" : "▾"}
          </button>
        </div>

        {projectDropdownOpen && (
          <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectProject(null);
              }}
              className="w-full border-b border-slate-800 px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800"
            >
              {t({ ko: "-- 프로젝트 없음 --", en: "-- No project --", ja: "-- No project --", zh: "-- No project --" })}
            </button>
            {projectsLoading ? (
              <div className="px-3 py-2 text-sm text-slate-400">
                {t({
                  ko: "프로젝트를 불러오는 중...",
                  en: "Loading projects...",
                  ja: "Loading projects...",
                  zh: "Loading projects...",
                })}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-slate-300">
                <p className="pr-2">
                  {t({
                    ko: "새 프로젝트로 생성할까요?",
                    en: "Create as a new project?",
                    ja: "Create as a new project?",
                    zh: "Create as a new project?",
                  })}
                </p>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onEnableCreateNewProject();
                  }}
                  className="ml-auto shrink-0 rounded-md border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                >
                  {t({ ko: "예", en: "Yes", ja: "Yes", zh: "Yes" })}
                </button>
              </div>
            ) : (
              filteredProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelectProject(project);
                  }}
                  onMouseEnter={() => onProjectHover(project.id)}
                  className={`w-full px-3 py-2 text-left transition hover:bg-slate-800 ${
                    projectActiveIndex >= 0 && filteredProjects[projectActiveIndex]?.id === project.id
                      ? "bg-slate-700/90"
                      : selectedProject?.id === project.id
                        ? "bg-slate-800/80"
                        : ""
                  }`}
                >
                  <div className="truncate text-sm text-slate-100">{project.name}</div>
                  <div className="truncate text-[11px] text-slate-400">{project.project_path}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedProject && <p className="mt-1 break-all text-xs text-slate-400">{selectedProject.project_path}</p>}

      {createNewProjectMode && !selectedProject && (
        <div className="mt-2 space-y-3">
          <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/70 p-3">
            <label className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200">
                  {t({
                    ko: "GitHub 레포 자동 생성",
                    en: "Auto-create GitHub repository",
                    ja: "Auto-create GitHub repository",
                    zh: "Auto-create GitHub repository",
                  })}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {t({
                    ko: "프로젝트를 만들면서 원격 레포를 생성하고 바로 클론합니다.",
                    en: "Create a remote repository and clone it while creating the project.",
                    ja: "Create a remote repository and clone it while creating the project.",
                    zh: "Create a remote repository and clone it while creating the project.",
                  })}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={githubAutoCreateEnabled}
                onClick={() => onGitHubAutoCreateEnabledChange(!githubAutoCreateEnabled)}
                className={`inline-flex h-6 w-11 items-center rounded-full border transition ${
                  githubAutoCreateEnabled ? "border-emerald-400 bg-emerald-500/90" : "border-slate-600 bg-slate-700"
                }`}
              >
                <span
                  className={`mx-0.5 inline-block h-4 w-4 rounded-full bg-white transition ${
                    githubAutoCreateEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            {githubAutoCreateEnabled && (
              <div className="space-y-3">
                <label className="block text-xs text-slate-400">
                  {t({ ko: "레포지토리 이름", en: "Repository Name", ja: "Repository Name", zh: "Repository Name" })}
                  <input
                    type="text"
                    value={githubRepoName}
                    onChange={(event) => onGitHubRepoNameChange(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </label>

                <div className="space-y-2">
                  <p className="text-xs text-slate-400">
                    {t({ ko: "공개 범위", en: "Visibility", ja: "Visibility", zh: "Visibility" })}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onGitHubRepoPrivateChange(true)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        githubRepoPrivate
                          ? "border-blue-500 bg-blue-500/15 text-blue-100"
                          : "border-slate-700 bg-slate-900 text-slate-300"
                      }`}
                    >
                      {t({ ko: "비공개", en: "Private", ja: "Private", zh: "Private" })}
                    </button>
                    <button
                      type="button"
                      onClick={() => onGitHubRepoPrivateChange(false)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        !githubRepoPrivate
                          ? "border-blue-500 bg-blue-500/15 text-blue-100"
                          : "border-slate-700 bg-slate-900 text-slate-300"
                      }`}
                    >
                      {t({ ko: "공개", en: "Public", ja: "Public", zh: "Public" })}
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                  <p className="text-[11px] text-slate-400">
                    {t({
                      ko: "기본 프로젝트 루트",
                      en: "Default project root",
                      ja: "Default project root",
                      zh: "Default project root",
                    })}
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-200">
                    {defaultProjectRootLoading
                      ? t({
                          ko: "기본 루트를 확인하는 중...",
                          en: "Resolving default root...",
                          ja: "Resolving default root...",
                          zh: "Resolving default root...",
                        })
                      : defaultProjectRoot || "~/Projects"}
                  </p>
                </div>
              </div>
            )}
          </div>

          <label className="block text-xs text-slate-400">
            {githubAutoPathLocked
              ? t({
                  ko: "새 프로젝트 경로 (자동)",
                  en: "New project path (Auto)",
                  ja: "New project path (Auto)",
                  zh: "New project path (Auto)",
                })
              : t({ ko: "새 프로젝트 경로", en: "New project path", ja: "New project path", zh: "New project path" })}
          </label>
          <input
            type="text"
            value={newProjectPath}
            onChange={(event) => onNewProjectPathChange(event.target.value)}
            placeholder="/absolute/path/to/project"
            readOnly={githubAutoPathLocked}
            className={`w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
              githubAutoPathLocked ? "bg-slate-950/80 text-slate-300" : "bg-slate-800"
            }`}
          />

          {githubAutoCreateEnabled && (
            <div className="flex justify-end gap-2">
              {projectPathCustomized ? (
                <button
                  type="button"
                  onClick={onResetAutoProjectPath}
                  className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                >
                  {t({ ko: "자동 경로로 되돌리기", en: "Use Auto Path", ja: "Use Auto Path", zh: "Use Auto Path" })}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onEnableProjectPathCustomization}
                  className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                >
                  {t({ ko: "경로 직접 수정", en: "Customize Path", ja: "Customize Path", zh: "Customize Path" })}
                </button>
              )}
            </div>
          )}

          {githubAutoPathLocked && (
            <p className="text-[11px] text-slate-400">
              {t({
                ko: "첫 번째 허용 루트와 레포지토리 이름으로 자동 채워집니다. 고급 사용자는 직접 수정할 수 있습니다.",
                en: "This path is generated from the first allowed root and the repository name. Advanced users can unlock it to customize.",
                ja: "This path is generated from the first allowed root and the repository name. Advanced users can unlock it to customize.",
                zh: "This path is generated from the first allowed root and the repository name. Advanced users can unlock it to customize.",
              })}
            </p>
          )}

          {!githubAutoPathLocked && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={pathApiUnsupported}
                onClick={onOpenManualPathBrowser}
                className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t({
                  ko: "앱 내 폴더 탐색",
                  en: "In-App Folder Browser",
                  ja: "In-App Folder Browser",
                  zh: "In-App Folder Browser",
                })}
              </button>
              <button
                type="button"
                disabled={pathApiUnsupported}
                onClick={onTogglePathSuggestions}
                className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pathSuggestionsOpen
                  ? t({
                      ko: "자동 경로 찾기 닫기",
                      en: "Close Auto Finder",
                      ja: "Close Auto Finder",
                      zh: "Close Auto Finder",
                    })
                  : t({ ko: "자동 경로 찾기", en: "Auto Path Finder", ja: "Auto Path Finder", zh: "Auto Path Finder" })}
              </button>
              <button
                type="button"
                disabled={nativePathPicking}
                onClick={onPickNativePath}
                className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {nativePathPicking
                  ? t({
                      ko: "수동 선택기 여는 중...",
                      en: "Opening Manual Picker...",
                      ja: "Opening Manual Picker...",
                      zh: "Opening Manual Picker...",
                    })
                  : nativePickerUnsupported
                    ? t({
                        ko: "수동 경로 선택기 (사용 불가)",
                        en: "Manual Path Finder (Unavailable)",
                        ja: "Manual Path Finder (Unavailable)",
                        zh: "Manual Path Finder (Unavailable)",
                      })
                    : t({
                        ko: "수동 경로 선택기",
                        en: "Manual Path Finder",
                        ja: "Manual Path Finder",
                        zh: "Manual Path Finder",
                      })}
              </button>
            </div>
          )}

          {!githubAutoPathLocked && pathSuggestionsOpen && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/70">
              {pathSuggestionsLoading ? (
                <p className="px-3 py-2 text-xs text-slate-400">
                  {t({
                    ko: "경로 후보를 불러오는 중...",
                    en: "Loading path suggestions...",
                    ja: "Loading path suggestions...",
                    zh: "Loading path suggestions...",
                  })}
                </p>
              ) : pathSuggestions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">
                  {t({
                    ko: "추천 경로가 없습니다. 직접 입력해 주세요.",
                    en: "No suggested path. Enter one manually.",
                    ja: "No suggested path. Enter one manually.",
                    zh: "No suggested path. Enter one manually.",
                  })}
                </p>
              ) : (
                pathSuggestions.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => onSelectPathSuggestion(candidate)}
                    className="w-full px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-slate-700/70"
                  >
                    {candidate}
                  </button>
                ))
              )}
            </div>
          )}

          {missingPathPrompt && (
            <p className="text-xs text-amber-300">
              {t({
                ko: "이 경로는 아직 존재하지 않습니다. 생성 전에 확인을 요청합니다.",
                en: "This path does not exist yet. Creation confirmation will be requested.",
                ja: "This path does not exist yet. Creation confirmation will be requested.",
                zh: "This path does not exist yet. Creation confirmation will be requested.",
              })}
            </p>
          )}
          <p className="text-xs text-slate-500">
            {t({
              ko: "설명은 새 프로젝트의 핵심 목표로 저장됩니다.",
              en: "Description will be saved as the new project core goal.",
              ja: "Description will be saved as the new project core goal.",
              zh: "Description will be saved as the new project core goal.",
            })}
          </p>
        </div>
      )}

      {!projectsLoading && projects.length === 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {t({
            ko: "등록된 프로젝트가 없습니다. 프로젝트 관리자에서 먼저 생성해 주세요.",
            en: "No registered project. Create one first in Project Manager.",
            ja: "No registered project. Create one first in Project Manager.",
            zh: "No registered project. Create one first in Project Manager.",
          })}
        </p>
      )}
    </div>
  );
}
