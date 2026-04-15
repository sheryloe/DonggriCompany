import type { Project } from "../../types";
import type { ProjectI18nTranslate } from "./types";

interface ProjectSidebarProps {
  headerTitle: string;
  t: ProjectI18nTranslate;
  onClose: () => void;
  search: string;
  setSearch: (value: string) => void;
  loadProjects: (targetPage: number, keyword: string) => Promise<void>;
  startCreate: () => void;
  onOpenGitHubImport: () => void;
  loadingList: boolean;
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  page: number;
  totalPages: number;
}

export default function ProjectSidebar({
  headerTitle,
  t,
  onClose,
  search,
  setSearch,
  loadProjects,
  startCreate,
  onOpenGitHubImport,
  loadingList,
  projects,
  selectedProjectId,
  onSelectProject,
  page,
  totalPages,
}: ProjectSidebarProps) {
  return (
    <aside className="flex w-full flex-col border-r border-slate-700 bg-slate-900/70 md:w-[330px]">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{headerTitle}</h2>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white">
          ×
        </button>
      </div>

      <div className="border-b border-slate-700 px-4 py-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void loadProjects(1, search);
            }
          }}
          placeholder={t({ ko: "프로젝트 검색", en: "Search projects", ja: "Search projects", zh: "Search projects" })}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => void loadProjects(1, search)} className="rounded-md bg-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-600">
            {t({ ko: "검색", en: "Search", ja: "Search", zh: "Search" })}
          </button>
          <button type="button" onClick={startCreate} className="rounded-md bg-blue-700 px-2.5 py-1 text-xs text-white hover:bg-blue-600">
            {t({ ko: "새 프로젝트", en: "New", ja: "New", zh: "New" })}
          </button>
          <button type="button" onClick={onOpenGitHubImport} className="rounded-md bg-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-600">
            {t({ ko: "GitHub 가져오기", en: "GitHub Import", ja: "GitHub Import", zh: "GitHub Import" })}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadingList ? (
          <div className="px-4 py-6 text-xs text-slate-400">{t({ ko: "불러오는 중...", en: "Loading...", ja: "Loading...", zh: "Loading..." })}</div>
        ) : projects.length === 0 ? (
          <div className="px-4 py-6 text-xs text-slate-500">{t({ ko: "등록된 프로젝트가 없습니다", en: "No projects", ja: "No projects", zh: "No projects" })}</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectProject(project.id)}
                className={`w-full px-4 py-3 text-left transition ${selectedProjectId === project.id ? "bg-blue-900/30" : "hover:bg-slate-800/70"}`}
              >
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">{project.name}</p>
                <p className="truncate text-[11px] text-slate-400">{project.project_path}</p>
                <p className="mt-1 truncate text-[11px] text-slate-500">{project.core_goal}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-700 px-4 py-2">
        <button type="button" disabled={page <= 1} onClick={() => void loadProjects(page - 1, search)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-40">
          {t({ ko: "이전", en: "Prev", ja: "Prev", zh: "Prev" })}
        </button>
        <span className="text-xs text-slate-500">{page} / {totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => void loadProjects(page + 1, search)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-40">
          {t({ ko: "다음", en: "Next", ja: "Next", zh: "Next" })}
        </button>
      </div>
    </aside>
  );
}
