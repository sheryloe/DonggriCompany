import type { JSX } from "react";
import type { Project } from "../../types";
import type { FormFeedback, ManualPathEntry, MissingPathPrompt } from "../taskboard/constants";

type Tr = (ko: string, en: string, ja?: string, zh?: string) => string;

interface ProjectFlowDialogProps {
  open: boolean;
  pendingMode: "apply" | "send";
  isDirectivePending: boolean;
  isPrnPending: boolean;
  pendingContent: string;
  projectQuery: string;
  projectsLoading: boolean;
  filteredProjects: Project[];
  selectedProject: Project | null;
  createNewProjectMode: boolean;
  newProjectPath: string;
  newProjectGoal: string;
  formFeedback: FormFeedback | null;
  pathSuggestionsOpen: boolean;
  pathSuggestionsLoading: boolean;
  pathSuggestions: string[];
  missingPathPrompt: MissingPathPrompt | null;
  manualPathPickerOpen: boolean;
  manualPathLoading: boolean;
  manualPathCurrent: string;
  manualPathParent: string | null;
  manualPathEntries: ManualPathEntry[];
  manualPathTruncated: boolean;
  manualPathError: string | null;
  nativePathPicking: boolean;
  canCreateProject: boolean;
  skipPlannedMeeting: boolean;
  tr: Tr;
  onClose: () => void;
  onProjectQueryChange: (value: string) => void;
  onSelectProject: (project: Project | null) => void;
  onEnableCreateNewProject: () => void;
  onCancelCreateNewProject: () => void;
  onNewProjectNameChange: (value: string) => void;
  onNewProjectPathChange: (value: string) => void;
  onNewProjectGoalChange: (value: string) => void;
  onTogglePathSuggestions: () => void;
  onSelectPathSuggestion: (path: string) => void;
  onOpenManualPathBrowser: () => void;
  onCloseManualPathBrowser: () => void;
  onOpenManualPathParent: () => void;
  onOpenManualPathEntry: (path: string) => void;
  onPickNativePath: () => void;
  onCreateProject: () => void;
  onConfirm: () => void;
  onToggleSkipPlannedMeeting: () => void;
}

function renderProjectSummary(project: Project, tr: Tr, pendingContent: string): JSX.Element {
  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3">
      <p className="text-sm font-semibold text-white">{project.name}</p>
      <p className="mt-1 break-all text-[11px] text-slate-400">{project.project_path}</p>
      <p className="mt-2 text-xs text-slate-200">{project.core_goal}</p>
      <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 p-2 text-[11px] text-slate-300">
        <p className="font-semibold text-blue-200">
          {tr("현재 전송 예정", "Pending Send", "Pending Send", "Pending Send")}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words">{pendingContent}</p>
      </div>
    </div>
  );
}

export default function ProjectFlowDialog({
  open,
  pendingMode,
  isDirectivePending,
  isPrnPending,
  pendingContent,
  projectQuery,
  projectsLoading,
  filteredProjects,
  selectedProject,
  createNewProjectMode,
  newProjectPath,
  newProjectGoal,
  formFeedback,
  pathSuggestionsOpen,
  pathSuggestionsLoading,
  pathSuggestions,
  missingPathPrompt,
  manualPathPickerOpen,
  manualPathLoading,
  manualPathCurrent,
  manualPathParent,
  manualPathEntries,
  manualPathTruncated,
  manualPathError,
  nativePathPicking,
  canCreateProject,
  skipPlannedMeeting,
  tr,
  onClose,
  onProjectQueryChange,
  onSelectProject,
  onEnableCreateNewProject,
  onCancelCreateNewProject,
  onNewProjectNameChange,
  onNewProjectPathChange,
  onNewProjectGoalChange,
  onTogglePathSuggestions,
  onSelectPathSuggestion,
  onOpenManualPathBrowser,
  onCloseManualPathBrowser,
  onOpenManualPathParent,
  onOpenManualPathEntry,
  onPickNativePath,
  onCreateProject,
  onConfirm,
  onToggleSkipPlannedMeeting,
}: ProjectFlowDialogProps) {
  if (!open) return null;

  const confirmLabel =
    pendingMode === "send"
      ? tr("선택 후 전송", "Select & Send", "Select & Send", "Select & Send")
      : tr("프로젝트 적용", "Apply Project", "Apply Project", "Apply Project");

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">
              {tr("프로젝트 선택", "Project Picker", "Project Picker", "Project Picker")}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {tr(
                "최근 프로젝트, 검색, 신규 생성, 선택 요약을 한 화면에서 처리합니다.",
                "Recent projects, search, creation, and selection summary in one view.",
                "Recent projects, search, creation, and selection summary in one view.",
                "Recent projects, search, creation, and selection summary in one view.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            {tr("닫기", "Close", "Close", "Close")}
          </button>
        </div>

        <div className="grid flex-1 gap-0 overflow-hidden lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4 overflow-y-auto border-b border-slate-800 p-5 lg:border-b-0 lg:border-r">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={projectQuery}
                  onChange={(event) =>
                    createNewProjectMode
                      ? onNewProjectNameChange(event.target.value)
                      : onProjectQueryChange(event.target.value)
                  }
                  placeholder={
                    createNewProjectMode
                      ? tr("신규 프로젝트 이름", "New project name", "New project name", "New project name")
                      : tr("프로젝트 검색", "Search projects", "Search projects", "Search projects")
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={createNewProjectMode ? onCancelCreateNewProject : onEnableCreateNewProject}
                  className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                    createNewProjectMode
                      ? "border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                      : "bg-emerald-600 text-white hover:bg-emerald-500"
                  }`}
                >
                  {createNewProjectMode
                    ? tr("기존 찾기", "Use Existing", "Use Existing", "Use Existing")
                    : tr("새 프로젝트", "New Project", "New Project", "New Project")}
                </button>
              </div>
              {!createNewProjectMode && (
                <p className="text-[11px] text-slate-500">
                  {tr(
                    "검색어가 없으면 최근 프로젝트를 보여줍니다.",
                    "Shows recent projects when the search box is empty.",
                    "Shows recent projects when the search box is empty.",
                    "Shows recent projects when the search box is empty.",
                  )}
                </p>
              )}
            </div>

            {!createNewProjectMode && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {projectQuery.trim()
                      ? tr("검색 결과", "Search Results", "Search Results", "Search Results")
                      : tr("최근 프로젝트", "Recent Projects", "Recent Projects", "Recent Projects")}
                  </p>
                  {projectsLoading && (
                    <span className="text-[11px] text-slate-500">
                      {tr("불러오는 중", "Loading", "Loading", "Loading")}
                    </span>
                  )}
                </div>
                <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {filteredProjects.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-6 text-center text-sm text-slate-400">
                      {tr(
                        "검색된 프로젝트가 없습니다. 바로 새 프로젝트를 만들어도 됩니다.",
                        "No matching project found. Create a new project instead.",
                        "No matching project found. Create a new project instead.",
                        "No matching project found. Create a new project instead.",
                      )}
                    </div>
                  ) : (
                    filteredProjects.map((project) => {
                      const isSelected = selectedProject?.id === project.id;
                      return (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => onSelectProject(project)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            isSelected
                              ? "border-blue-500 bg-blue-950/30"
                              : "border-slate-700 bg-slate-950/60 hover:border-slate-500 hover:bg-slate-900"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-100">{project.name}</p>
                              <p className="mt-1 truncate text-[11px] text-slate-400">{project.project_path}</p>
                            </div>
                            {isSelected && (
                              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-200">
                                {tr("선택됨", "Selected", "Selected", "Selected")}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-300">
                            {project.core_goal}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {createNewProjectMode && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {tr("새 프로젝트 생성", "Create New Project", "Create New Project", "Create New Project")}
                  </p>
                  <div className="mt-3 space-y-3">
                    <label className="block text-xs text-slate-400">
                      {tr("프로젝트 경로", "Project Path", "Project Path", "Project Path")}
                      <input
                        type="text"
                        value={newProjectPath}
                        onChange={(event) => onNewProjectPathChange(event.target.value)}
                        placeholder={tr(
                          "절대 경로 입력",
                          "Enter absolute path",
                          "Enter absolute path",
                          "Enter absolute path",
                        )}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={onTogglePathSuggestions}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white"
                      >
                        {tr("경로 추천", "Suggestions", "Suggestions", "Suggestions")}
                      </button>
                      <button
                        type="button"
                        onClick={onOpenManualPathBrowser}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white"
                      >
                        {tr("폴더 탐색", "Browse", "Browse", "Browse")}
                      </button>
                      <button
                        type="button"
                        onClick={onPickNativePath}
                        disabled={nativePathPicking}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
                      >
                        {nativePathPicking
                          ? tr("OS 선택 중", "Picking...", "Picking...", "Picking...")
                          : tr("OS 폴더 선택", "OS Folder", "OS Folder", "OS Folder")}
                      </button>
                    </div>

                    {pathSuggestionsOpen && (
                      <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-2">
                        <p className="mb-2 text-[11px] text-slate-500">
                          {pathSuggestionsLoading
                            ? tr(
                                "추천 경로를 불러오는 중입니다.",
                                "Loading suggestions...",
                                "Loading suggestions...",
                                "Loading suggestions...",
                              )
                            : tr("추천 경로", "Suggested paths", "Suggested paths", "Suggested paths")}
                        </p>
                        <div className="max-h-40 space-y-1 overflow-y-auto">
                          {pathSuggestions.length === 0 ? (
                            <p className="px-2 py-1 text-[11px] text-slate-500">
                              {tr(
                                "표시할 추천 경로가 없습니다.",
                                "No suggested paths.",
                                "No suggested paths.",
                                "No suggested paths.",
                              )}
                            </p>
                          ) : (
                            pathSuggestions.map((candidate) => (
                              <button
                                key={candidate}
                                type="button"
                                onClick={() => onSelectPathSuggestion(candidate)}
                                className="w-full rounded-md px-2 py-1.5 text-left text-[11px] text-slate-300 transition hover:bg-slate-800 hover:text-white"
                              >
                                {candidate}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {missingPathPrompt && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-[11px] text-amber-100">
                        <p className="font-semibold">
                          {tr(
                            "경로 확인 필요",
                            "Path confirmation needed",
                            "Path confirmation needed",
                            "Path confirmation needed",
                          )}
                        </p>
                        <p className="mt-1 break-all">{missingPathPrompt.normalizedPath}</p>
                        {missingPathPrompt.nearestExistingParent && (
                          <p className="mt-1 break-all text-amber-200/80">
                            {tr(
                              "가장 가까운 기존 폴더",
                              "Nearest existing parent",
                              "Nearest existing parent",
                              "Nearest existing parent",
                            )}
                            : {missingPathPrompt.nearestExistingParent}
                          </p>
                        )}
                      </div>
                    )}

                    <label className="block text-xs text-slate-400">
                      {tr("핵심 목표", "Core Goal", "Core Goal", "Core Goal")}
                      <textarea
                        rows={4}
                        value={newProjectGoal}
                        onChange={(event) => onNewProjectGoalChange(event.target.value)}
                        readOnly={isDirectivePending}
                        className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                      />
                    </label>

                    {(isDirectivePending || isPrnPending) && (
                      <p className="text-[11px] text-slate-500">
                        {isDirectivePending
                          ? tr(
                              "$ 지시문 내용이 기본 핵심 목표로 들어갑니다.",
                              "The directive text is used as the default core goal.",
                              "The directive text is used as the default core goal.",
                              "The directive text is used as the default core goal.",
                            )
                          : tr(
                              "PRN 프롬프트를 기반으로 핵심 목표를 미리 채웠습니다.",
                              "The PRN prompt prefilled the core goal.",
                              "The PRN prompt prefilled the core goal.",
                              "The PRN prompt prefilled the core goal.",
                            )}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={onCreateProject}
                      disabled={!canCreateProject}
                      className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                    >
                      {tr("프로젝트 생성 후 선택", "Create & Select", "Create & Select", "Create & Select")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {formFeedback && (
              <div
                className={`rounded-xl border px-3 py-2 text-xs ${
                  formFeedback.tone === "error"
                    ? "border-rose-500/40 bg-rose-950/30 text-rose-200"
                    : "border-blue-500/30 bg-blue-950/20 text-blue-100"
                }`}
              >
                {formFeedback.message}
              </div>
            )}

            {manualPathPickerOpen && (
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {tr("폴더 브라우저", "Folder Browser", "Folder Browser", "Folder Browser")}
                    </p>
                    <p className="mt-1 break-all text-[11px] text-slate-500">{manualPathCurrent}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseManualPathBrowser}
                    className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-slate-800"
                  >
                    {tr("닫기", "Close", "Close", "Close")}
                  </button>
                </div>

                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    onClick={onOpenManualPathParent}
                    disabled={!manualPathParent || manualPathLoading}
                    className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    {tr("상위 폴더", "Parent", "Parent", "Parent")}
                  </button>
                </div>

                {manualPathError ? (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-[11px] text-rose-200">
                    {manualPathError}
                  </div>
                ) : manualPathLoading ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-400">
                    {tr(
                      "폴더 목록을 불러오는 중입니다.",
                      "Loading folders...",
                      "Loading folders...",
                      "Loading folders...",
                    )}
                  </div>
                ) : (
                  <div className="max-h-52 space-y-1 overflow-y-auto">
                    {manualPathEntries.map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() => onOpenManualPathEntry(entry.path)}
                        className="w-full rounded-lg border border-slate-800 px-3 py-2 text-left text-[11px] text-slate-300 transition hover:bg-slate-800 hover:text-white"
                      >
                        <div className="font-medium text-slate-200">{entry.name}</div>
                        <div className="mt-1 break-all text-slate-500">{entry.path}</div>
                      </button>
                    ))}
                    {manualPathEntries.length === 0 && (
                      <p className="px-2 py-1 text-[11px] text-slate-500">
                        {tr("표시할 폴더가 없습니다.", "No folders found.", "No folders found.", "No folders found.")}
                      </p>
                    )}
                  </div>
                )}
                {manualPathTruncated && (
                  <p className="mt-2 text-[11px] text-amber-300">
                    {tr(
                      "항목이 많아 일부만 표시했습니다.",
                      "Only part of the folder list is shown.",
                      "Only part of the folder list is shown.",
                      "Only part of the folder list is shown.",
                    )}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 overflow-y-auto p-5">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {tr("선택 요약", "Selection Summary", "Selection Summary", "Selection Summary")}
              </p>
              <div className="mt-3 space-y-3">
                {selectedProject ? (
                  renderProjectSummary(selectedProject, tr, pendingContent)
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
                    {tr(
                      "아직 선택된 프로젝트가 없습니다.",
                      "No project selected yet.",
                      "No project selected yet.",
                      "No project selected yet.",
                    )}
                  </div>
                )}

                {(isDirectivePending || isPrnPending) && (
                  <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-200">
                          {tr("회의 모드", "Meeting Mode", "Meeting Mode", "Meeting Mode")}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {skipPlannedMeeting
                            ? tr(
                                "회의 없이 바로 실행합니다.",
                                "Executes without planned meeting.",
                                "Executes without planned meeting.",
                                "Executes without planned meeting.",
                              )
                            : tr(
                                "기본 정책대로 회의 여부를 판단합니다.",
                                "Keeps the default meeting policy.",
                                "Keeps the default meeting policy.",
                                "Keeps the default meeting policy.",
                              )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onToggleSkipPlannedMeeting}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          skipPlannedMeeting
                            ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                            : "border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                        }`}
                      >
                        {skipPlannedMeeting
                          ? tr("회의 생략", "No Meeting", "No Meeting", "No Meeting")
                          : tr("기본 회의", "Default Policy", "Default Policy", "Default Policy")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                {tr("취소", "Cancel", "Cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!selectedProject}
                className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
