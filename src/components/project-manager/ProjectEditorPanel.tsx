import type { Dispatch, SetStateAction } from "react";
import { isApiRequestError, pickProjectPathNative, type ProjectDetailResponse } from "../../api";
import { getAssignmentModeDisplayLabel } from "../../app/canonical-display";
import type { Agent, AssignmentMode, Department, Project } from "../../types";
import type {
  FormFeedback,
  ManualAssignmentWarning,
  MissingPathPrompt,
  ProjectI18nTranslate,
  ProjectManualSelectionStats,
} from "./types";
import ManualAssignmentSelector from "./ManualAssignmentSelector";

interface ProjectEditorPanelProps {
  t: ProjectI18nTranslate;
  language: string;
  isCreating: boolean;
  editingProjectId: string | null;
  selectedProject: Project | null;
  detail: ProjectDetailResponse | null;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  githubAutoCreateAvailable: boolean;
  githubAutoCreateEnabled: boolean;
  setGitHubAutoCreateEnabled: (enabled: boolean) => void;
  githubRepoName: string;
  setGitHubRepoName: (value: string) => void;
  githubRepoPrivate: boolean;
  setGitHubRepoPrivate: (value: boolean) => void;
  defaultProjectRoot: string;
  defaultProjectRootLoading: boolean;
  projectPath: string;
  setProjectPath: Dispatch<SetStateAction<string>>;
  projectPathCustomized: boolean;
  setProjectPathCustomized: (value: boolean) => void;
  onResetAutoProjectPath: () => void;
  coreGoal: string;
  setCoreGoal: Dispatch<SetStateAction<string>>;
  saving: boolean;
  canSave: boolean;
  pathToolsVisible: boolean;
  pathSuggestionsOpen: boolean;
  setPathSuggestionsOpen: Dispatch<SetStateAction<boolean>>;
  pathSuggestionsLoading: boolean;
  pathSuggestions: string[];
  missingPathPrompt: MissingPathPrompt | null;
  setMissingPathPrompt: Dispatch<SetStateAction<MissingPathPrompt | null>>;
  pathApiUnsupported: boolean;
  setPathApiUnsupported: Dispatch<SetStateAction<boolean>>;
  nativePathPicking: boolean;
  setNativePathPicking: Dispatch<SetStateAction<boolean>>;
  nativePickerUnsupported: boolean;
  setNativePickerUnsupported: Dispatch<SetStateAction<boolean>>;
  setManualPathPickerOpen: Dispatch<SetStateAction<boolean>>;
  loadManualPathEntries: (targetPath?: string) => Promise<void>;
  unsupportedPathApiMessage: string;
  resolvePathHelperErrorMessage: (err: unknown, fallback: { ko: string; en: string; ja: string; zh: string }) => string;
  formFeedback: FormFeedback | null;
  setFormFeedback: Dispatch<SetStateAction<FormFeedback | null>>;
  assignmentMode: AssignmentMode;
  setAssignmentMode: Dispatch<SetStateAction<AssignmentMode>>;
  setManualAssignmentWarning: Dispatch<SetStateAction<ManualAssignmentWarning | null>>;
  manualSelectionStats: ProjectManualSelectionStats;
  selectedAgentIds: Set<string>;
  setSelectedAgentIds: Dispatch<SetStateAction<Set<string>>>;
  agentFilterDept: string;
  setAgentFilterDept: Dispatch<SetStateAction<string>>;
  agents: Agent[];
  departments: Department[];
  spriteMap: Map<string, number>;
  onSave: () => void;
  onCancelEdit: () => void;
  onStartEditSelected: () => void;
  onDelete: () => void;
}

export default function ProjectEditorPanel({
  t,
  language,
  isCreating,
  editingProjectId,
  selectedProject,
  detail,
  name,
  setName,
  githubAutoCreateAvailable,
  githubAutoCreateEnabled,
  setGitHubAutoCreateEnabled,
  githubRepoName,
  setGitHubRepoName,
  githubRepoPrivate,
  setGitHubRepoPrivate,
  defaultProjectRoot,
  defaultProjectRootLoading,
  projectPath,
  setProjectPath,
  projectPathCustomized,
  setProjectPathCustomized,
  onResetAutoProjectPath,
  coreGoal,
  setCoreGoal,
  saving,
  canSave,
  pathToolsVisible,
  pathSuggestionsOpen,
  setPathSuggestionsOpen,
  pathSuggestionsLoading,
  pathSuggestions,
  missingPathPrompt,
  setMissingPathPrompt,
  pathApiUnsupported,
  setPathApiUnsupported,
  nativePathPicking,
  setNativePathPicking,
  nativePickerUnsupported,
  setNativePickerUnsupported,
  setManualPathPickerOpen,
  loadManualPathEntries,
  unsupportedPathApiMessage,
  resolvePathHelperErrorMessage,
  formFeedback,
  setFormFeedback,
  assignmentMode,
  setAssignmentMode,
  setManualAssignmentWarning,
  manualSelectionStats,
  selectedAgentIds,
  setSelectedAgentIds,
  agentFilterDept,
  setAgentFilterDept,
  agents,
  departments,
  spriteMap,
  onSave,
  onCancelEdit,
  onStartEditSelected,
  onDelete,
}: ProjectEditorPanelProps) {
  const githubAutoPathLocked = githubAutoCreateAvailable && githubAutoCreateEnabled && !projectPathCustomized;
  const showPathTools = pathToolsVisible && (!githubAutoCreateAvailable || !githubAutoCreateEnabled || projectPathCustomized);

  return (
    <div className="min-w-0 space-y-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <label className="block text-xs text-slate-400">
        {t({ ko: "프로젝트 이름", en: "Project Name", ja: "Project Name", zh: "Project Name" })}
        <input
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setFormFeedback(null);
          }}
          disabled={!isCreating && !editingProjectId}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />
      </label>

      {githubAutoCreateAvailable && (
        <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/70 p-3">
          <label className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200">
                {t({ ko: "GitHub 저장소 자동 생성", en: "Auto-create GitHub repository", ja: "Auto-create GitHub repository", zh: "Auto-create GitHub repository" })}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {t({
                  ko: "프로젝트 생성과 함께 원격 저장소를 만들고 로컬 경로까지 준비합니다.",
                  en: "Create a remote repository and prepare the local working path during project creation.",
                  ja: "Create a remote repository and prepare the local working path during project creation.",
                  zh: "Create a remote repository and prepare the local working path during project creation.",
                })}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={githubAutoCreateEnabled}
              onClick={() => {
                setGitHubAutoCreateEnabled(!githubAutoCreateEnabled);
                setFormFeedback(null);
              }}
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
                {t({ ko: "저장소 이름", en: "Repository Name", ja: "Repository Name", zh: "Repository Name" })}
                <input
                  type="text"
                  value={githubRepoName}
                  onChange={(event) => {
                    setGitHubRepoName(event.target.value);
                    setFormFeedback(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                />
              </label>

              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  {t({ ko: "공개 범위", en: "Visibility", ja: "Visibility", zh: "Visibility" })}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGitHubRepoPrivate(true);
                      setFormFeedback(null);
                    }}
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
                    onClick={() => {
                      setGitHubRepoPrivate(false);
                      setFormFeedback(null);
                    }}
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
                  {t({ ko: "기본 프로젝트 루트", en: "Default project root", ja: "Default project root", zh: "Default project root" })}
                </p>
                <p className="mt-1 break-all text-xs text-slate-200">
                  {defaultProjectRootLoading
                    ? t({ ko: "기본 루트를 확인하는 중...", en: "Resolving default root...", ja: "Resolving default root...", zh: "Resolving default root..." })
                    : defaultProjectRoot || "~/Projects"}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <label className="block text-xs text-slate-400">
        {githubAutoPathLocked
          ? t({ ko: "프로젝트 경로 (자동)", en: "Project Path (Auto)", ja: "Project Path (Auto)", zh: "Project Path (Auto)" })
          : t({ ko: "프로젝트 경로", en: "Project Path", ja: "Project Path", zh: "Project Path" })}
        <input
          type="text"
          value={projectPath}
          onChange={(event) => {
            if (githubAutoCreateAvailable && githubAutoCreateEnabled) {
              setProjectPathCustomized(true);
            }
            setProjectPath(event.target.value);
            setMissingPathPrompt(null);
            setFormFeedback(null);
          }}
          readOnly={githubAutoPathLocked}
          disabled={!isCreating && !editingProjectId}
          className={`mt-1 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 ${
            githubAutoPathLocked ? "bg-slate-950/80 text-slate-300" : "bg-slate-900"
          }`}
        />
      </label>

      {githubAutoCreateAvailable && githubAutoCreateEnabled && (
        <div className="flex justify-end gap-2">
          {projectPathCustomized ? (
            <button
              type="button"
              onClick={() => {
                setProjectPathCustomized(false);
                onResetAutoProjectPath();
                setMissingPathPrompt(null);
                setFormFeedback(null);
              }}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              {t({ ko: "자동 경로로 복원", en: "Use Auto Path", ja: "Use Auto Path", zh: "Use Auto Path" })}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setProjectPathCustomized(true);
                setFormFeedback(null);
              }}
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
            ko: "기본 루트와 저장소 이름으로 자동 생성된 경로입니다. 필요하면 직접 수정할 수 있습니다.",
            en: "This path is generated from the default root and repository name. You can unlock it to customize.",
            ja: "This path is generated from the default root and repository name. You can unlock it to customize.",
            zh: "This path is generated from the default root and repository name. You can unlock it to customize.",
          })}
        </p>
      )}

      {showPathTools && (
        <div className="space-y-2">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={pathApiUnsupported}
              onClick={() => {
                setFormFeedback(null);
                setManualPathPickerOpen(true);
                void loadManualPathEntries(projectPath.trim() || undefined);
              }}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t({ ko: "인앱 폴더 탐색", en: "In-App Folder Browser", ja: "In-App Folder Browser", zh: "In-App Folder Browser" })}
            </button>
            <button
              type="button"
              disabled={pathApiUnsupported}
              onClick={() => {
                setFormFeedback(null);
                setPathSuggestionsOpen((previous) => !previous);
              }}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pathSuggestionsOpen
                ? t({ ko: "자동 경로 찾기 닫기", en: "Close Auto Finder", ja: "Close Auto Finder", zh: "Close Auto Finder" })
                : t({ ko: "자동 경로 찾기", en: "Auto Path Finder", ja: "Auto Path Finder", zh: "Auto Path Finder" })}
            </button>
            <button
              type="button"
              disabled={nativePathPicking}
              onClick={async () => {
                setNativePickerUnsupported(false);
                setNativePathPicking(true);
                try {
                  const picked = await pickProjectPathNative();
                  if (picked.cancelled || !picked.path) return;
                  setProjectPathCustomized(true);
                  setProjectPath(picked.path);
                  setMissingPathPrompt(null);
                  setPathSuggestionsOpen(false);
                  setFormFeedback(null);
                } catch (err) {
                  console.error("Failed to open native path picker:", err);
                  if (isApiRequestError(err) && err.status === 404) {
                    setPathApiUnsupported(true);
                    setFormFeedback({ tone: "info", message: unsupportedPathApiMessage });
                  } else {
                    const message = resolvePathHelperErrorMessage(err, {
                      ko: "OS 폴더 선택기를 열지 못했습니다.",
                      en: "Failed to open OS folder picker.",
                      ja: "Failed to open OS folder picker.",
                      zh: "Failed to open OS folder picker.",
                    });
                    if (
                      isApiRequestError(err) &&
                      (err.code === "native_picker_unavailable" || err.code === "native_picker_failed")
                    ) {
                      setNativePickerUnsupported(true);
                      setManualPathPickerOpen(true);
                      await loadManualPathEntries(projectPath.trim() || undefined);
                      setFormFeedback({ tone: "info", message });
                    } else {
                      setFormFeedback({ tone: "error", message });
                    }
                  }
                } finally {
                  setNativePathPicking(false);
                }
              }}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {nativePathPicking
                ? t({ ko: "폴더 선택기 여는 중...", en: "Opening Manual Picker...", ja: "Opening Manual Picker...", zh: "Opening Manual Picker..." })
                : nativePickerUnsupported
                  ? t({ ko: "수동 경로 선택기 (사용 불가)", en: "Manual Path Finder (Unavailable)", ja: "Manual Path Finder (Unavailable)", zh: "Manual Path Finder (Unavailable)" })
                  : t({ ko: "수동 경로 선택기", en: "Manual Path Finder", ja: "Manual Path Finder", zh: "Manual Path Finder" })}
            </button>
          </div>

          {pathSuggestionsOpen && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/70">
              {pathSuggestionsLoading ? (
                <p className="px-3 py-2 text-xs text-slate-400">
                  {t({ ko: "경로 후보를 불러오는 중...", en: "Loading path suggestions...", ja: "Loading path suggestions...", zh: "Loading path suggestions..." })}
                </p>
              ) : pathSuggestions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">
                  {t({ ko: "추천 경로가 없습니다. 직접 입력하세요.", en: "No suggested path. Enter one manually.", ja: "No suggested path. Enter one manually.", zh: "No suggested path. Enter one manually." })}
                </p>
              ) : (
                pathSuggestions.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => {
                      setProjectPathCustomized(true);
                      setProjectPath(candidate);
                      setMissingPathPrompt(null);
                      setPathSuggestionsOpen(false);
                      setFormFeedback(null);
                    }}
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
              {t({ ko: "이 경로는 아직 없습니다. 저장 시 생성 여부를 다시 확인합니다.", en: "This path does not exist yet. Saving will ask whether to create it.", ja: "This path does not exist yet. Saving will ask whether to create it.", zh: "This path does not exist yet. Saving will ask whether to create it." })}
            </p>
          )}
        </div>
      )}

      {formFeedback && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            formFeedback.tone === "error"
              ? "border-rose-500/60 bg-rose-500/10 text-rose-800 dark:text-rose-200"
              : "border-cyan-500/50 bg-cyan-500/10 text-cyan-800 dark:text-cyan-100"
          }`}
        >
          {formFeedback.message}
        </div>
      )}

      <label className="block text-xs text-slate-400">
        {t({ ko: "핵심 목표", en: "Core Goal", ja: "Core Goal", zh: "Core Goal" })}
        <textarea
          rows={5}
          value={coreGoal}
          onChange={(event) => {
            setCoreGoal(event.target.value);
            setFormFeedback(null);
          }}
          disabled={!isCreating && !editingProjectId}
          className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />
      </label>

      <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-slate-200">
              {t({ ko: "배정 정책", en: "Assignment Policy", ja: "Assignment Policy", zh: "Assignment Policy" })}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              {t({
                ko: "저장은 canonical 영어 키로 유지되고, 화면에는 선택된 언어 기준으로만 표시됩니다.",
                en: "Stored values remain canonical English keys. Only the UI label is localized.",
                ja: "Stored values remain canonical English keys. Only the UI label is localized.",
                zh: "Stored values remain canonical English keys. Only the UI label is localized.",
              })}
            </p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
            {getAssignmentModeDisplayLabel(assignmentMode, language)}
          </span>
        </div>

        <ManualAssignmentSelector
          t={t}
          language={language}
          isCreating={isCreating}
          editingProjectId={editingProjectId}
          assignmentMode={assignmentMode}
          setAssignmentMode={setAssignmentMode}
          setManualAssignmentWarning={setManualAssignmentWarning}
          manualSelectionStats={manualSelectionStats}
          selectedAgentIds={selectedAgentIds}
          setSelectedAgentIds={setSelectedAgentIds}
          agentFilterDept={agentFilterDept}
          setAgentFilterDept={setAgentFilterDept}
          departments={departments}
          agents={agents}
          spriteMap={spriteMap}
          detail={detail}
          selectedProject={selectedProject}
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {(isCreating || !!editingProjectId) && (
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave || saving}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {editingProjectId
              ? t({ ko: "저장", en: "Save", ja: "Save", zh: "Save" })
              : t({ ko: "프로젝트 생성", en: "Create", ja: "Create", zh: "Create" })}
          </button>
        )}
        {(isCreating || !!editingProjectId) && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
          >
            {t({ ko: "취소", en: "Cancel", ja: "Cancel", zh: "Cancel" })}
          </button>
        )}
        <button
          type="button"
          onClick={onStartEditSelected}
          disabled={!selectedProject || isCreating || !!editingProjectId}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
        >
          {t({ ko: "선택 프로젝트 편집", en: "Edit Selected", ja: "Edit Selected", zh: "Edit Selected" })}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!selectedProject}
          className="rounded-lg border border-red-700/70 px-3 py-1.5 text-xs text-red-300 disabled:opacity-40"
        >
          {t({ ko: "삭제", en: "Delete", ja: "Delete", zh: "Delete" })}
        </button>
      </div>
    </div>
  );
}
