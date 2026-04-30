import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyProjectModule,
  bindProjectModule,
  createProjectAssetJob,
  getModules,
  getProjectAssetJobs,
  getProjectModules,
  getProjects,
  isApiRequestError,
  makeIdempotencyKey,
  previewProjectModule,
} from "../api";
import type {
  AssetJob,
  Project,
  ProjectModuleApplyRun,
  ProjectModuleBinding,
  ProjectModuleCategoryKey,
  ProjectModuleManifest,
  ProjectModulePreview,
  ProjectModuleRiskLevel,
} from "../types";

type CategoryFilter = "all" | ProjectModuleCategoryKey;

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "전체",
  "auth-provider": "OAuth / 인증",
  "image-generation": "이미지 생성",
  "game-asset": "게임 자산",
  "project-template": "프로젝트 템플릿",
  operations: "운영 자동화",
};

const MODULE_LABELS: Record<string, { title: string; summary: string }> = {
  "google-oauth": {
    title: "Google OAuth",
    summary: "Google 로그인과 실행 계정 연결을 프로젝트에 재사용 가능한 계약으로 적용합니다.",
  },
  "naver-oauth": {
    title: "Naver OAuth",
    summary: "Naver OAuth 2.0 로그인 흐름을 secret 원문 없이 프로젝트 메타데이터로 연결합니다.",
  },
  "landscape-image": {
    title: "풍경 이미지",
    summary: "배경/풍경 이미지 생성을 위한 prompt pack과 검수 기준을 제공합니다.",
  },
  "character-image": {
    title: "캐릭터 이미지",
    summary: "캐릭터 정체성, 포즈, 의상 일관성을 유지하는 이미지 생성 모듈입니다.",
  },
  "sprite-4dir": {
    title: "4방향 스프라이트",
    summary: "front, left, back, right 기준 게임 캐릭터 스프라이트 생성 계약입니다.",
  },
};

const RISK_LABELS: Record<ProjectModuleRiskLevel, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

const APPLY_STATUS_LABELS: Record<string, string> = {
  previewed: "미리보기",
  bound: "바인딩됨",
  applied: "적용됨",
  failed: "실패",
  disabled: "비활성",
};

const IMAGE_MODULE_KEYS = new Set(["landscape-image", "character-image", "sprite-4dir"]);

function moduleTitle(module: ProjectModuleManifest): string {
  return MODULE_LABELS[module.module_key]?.title ?? module.name;
}

function moduleSummary(module: ProjectModuleManifest): string {
  return MODULE_LABELS[module.module_key]?.summary ?? module.summary;
}

function formatTime(value: number | null | undefined): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

function errorMessage(error: unknown): string {
  if (isApiRequestError(error)) {
    const labels: Record<string, string> = {
      project_not_found: "프로젝트를 찾을 수 없습니다.",
      module_not_found: "모듈을 찾을 수 없습니다.",
      project_path_mismatch: "선택한 프로젝트 경로와 요청 경로가 다릅니다.",
      module_binding_exists: "이미 같은 모듈 바인딩이 있습니다.",
      project_path_unavailable: "프로젝트 경로가 없거나 접근할 수 없습니다.",
      idempotency_key_required: "적용 idempotency key가 필요합니다.",
      image_module_required: "이미지 생성 계열 모듈만 asset job을 만들 수 있습니다.",
    };
    return labels[error.code ?? ""] ?? `요청 실패: ${error.status}`;
  }
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

export default function ModulesLibrary() {
  const [modules, setModules] = useState<ProjectModuleManifest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedModule, setSelectedModule] = useState<ProjectModuleManifest | null>(null);
  const [preview, setPreview] = useState<ProjectModulePreview | null>(null);
  const [createdBinding, setCreatedBinding] = useState<ProjectModuleBinding | null>(null);
  const [projectBindings, setProjectBindings] = useState<ProjectModuleBinding[]>([]);
  const [applyRuns, setApplyRuns] = useState<ProjectModuleApplyRun[]>([]);
  const [assetJobs, setAssetJobs] = useState<AssetJob[]>([]);
  const [assetBrief, setAssetBrief] = useState("프로젝트에 사용할 원본 캐릭터 또는 배경 이미지를 생성합니다.");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const filteredModules = useMemo(() => {
    return modules.filter((module) => category === "all" || module.category_key === category);
  }, [category, modules]);

  const selectedBinding = useMemo(() => {
    if (createdBinding) return createdBinding;
    if (!selectedModule) return null;
    return (
      projectBindings.find(
        (binding) => binding.module_key === selectedModule.module_key && binding.status !== "disabled",
      ) ?? null
    );
  }, [createdBinding, projectBindings, selectedModule]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalog, projectResult] = await Promise.all([getModules(), getProjects({ page: 1, page_size: 50 })]);
      setModules(catalog);
      setProjects(projectResult.projects);
      setSelectedProjectId((current) => current || projectResult.projects[0]?.id || "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjectState = useCallback(async (projectId: string) => {
    if (!projectId) {
      setProjectBindings([]);
      setApplyRuns([]);
      setAssetJobs([]);
      return;
    }
    try {
      const [moduleState, jobs] = await Promise.all([getProjectModules(projectId), getProjectAssetJobs(projectId)]);
      setProjectBindings(moduleState.bindings);
      setApplyRuns(moduleState.apply_runs);
      setAssetJobs(jobs);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setPreview(null);
    setCreatedBinding(null);
    void loadProjectState(selectedProjectId);
  }, [loadProjectState, selectedProjectId]);

  const handlePreview = async (module: ProjectModuleManifest) => {
    if (!selectedProject) {
      setError("먼저 프로젝트를 선택하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setSelectedModule(module);
    setCreatedBinding(null);
    try {
      const nextPreview = await previewProjectModule(selectedProject.id, {
        module_key: module.module_key,
        module_version: module.version,
        binding_name: module.module_key,
        project_path: selectedProject.project_path,
      });
      setPreview(nextPreview);
      setNotice("미리보기를 생성했습니다. 파일은 아직 쓰지 않았습니다.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleBind = async () => {
    if (!selectedProject || !selectedModule || !preview) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const binding = await bindProjectModule(selectedProject.id, {
        module_key: selectedModule.module_key,
        module_version: selectedModule.version,
        binding_name: preview.binding_name,
        project_path: selectedProject.project_path,
      });
      setCreatedBinding(binding);
      await loadProjectState(selectedProject.id);
      setNotice("프로젝트 모듈 바인딩을 저장했습니다.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!selectedProject || !selectedBinding) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await applyProjectModule(selectedProject.id, selectedBinding.id, makeIdempotencyKey("module-apply"));
      await loadProjectState(selectedProject.id);
      setNotice("미리보기 기준 산출물을 프로젝트에 적용했습니다.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAssetJob = async () => {
    if (!selectedProject || !selectedModule || !IMAGE_MODULE_KEYS.has(selectedModule.module_key)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createProjectAssetJob(selectedProject.id, {
        module_key: selectedModule.module_key,
        asset_key: `${selectedModule.module_key}-${Date.now()}`,
        asset_brief: assetBrief,
      });
      await loadProjectState(selectedProject.id);
      setNotice("이미지 생성 job 초안을 만들었습니다. Codex 실행자가 imagegen 경로로 생성해야 합니다.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 text-slate-100">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5 shadow-xl shadow-slate-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Project Module Registry</p>
            <h2 className="mt-2 text-2xl font-bold text-white">프로젝트 모듈</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Skill은 에이전트가 쓰는 기법이고, 모듈은 프로젝트에 적용 가능한 기능 패키지입니다. 모든 적용은 미리보기
              생성 후 승인된 변경만 프로젝트에 씁니다.
            </p>
          </div>
          <div className="min-w-[260px]">
            <label className="text-xs font-semibold text-slate-400">적용 대상 프로젝트</label>
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
            >
              {projects.length === 0 ? (
                <option value="">프로젝트 없음</option>
              ) : (
                projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              category === key
                ? "border-blue-400 bg-blue-500/20 text-blue-100"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
            }`}
          >
            {CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      {notice ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
          모듈 카탈로그를 불러오는 중입니다.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-4 md:grid-cols-2">
            {filteredModules.map((module) => {
              const applied = projectBindings.find((binding) => binding.module_key === module.module_key);
              return (
                <article
                  key={`${module.module_key}@${module.version}`}
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-slate-950/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-blue-300">{CATEGORY_LABELS[module.category_key]}</p>
                      <h3 className="mt-1 text-lg font-bold text-white">{moduleTitle(module)}</h3>
                    </div>
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-300">
                      위험 {RISK_LABELS[module.risk_level]}
                    </span>
                  </div>
                  <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-300">{moduleSummary(module)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {module.capabilities.slice(0, 4).map((capability) => (
                      <span key={capability} className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                        {capability}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">
                      {applied ? `상태: ${APPLY_STATUS_LABELS[applied.status] ?? applied.status}` : "아직 미적용"}
                    </div>
                    <button
                      type="button"
                      disabled={busy || !selectedProject}
                      onClick={() => void handlePreview(module)}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
                    >
                      미리보기
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <h3 className="text-sm font-semibold text-white">미리보기 / 적용</h3>
              {!selectedModule || !preview ? (
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  왼쪽에서 모듈을 선택하면 파일 변경 없이 artifact delta를 먼저 확인합니다.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{moduleTitle(selectedModule)}</p>
                    <p className="mt-1 text-xs text-slate-400">{preview.binding_name}</p>
                  </div>
                  <div className="space-y-2">
                    {preview.artifact_delta.map((entry) => (
                      <div key={entry.path} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-200">{entry.path}</span>
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                            {entry.action}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{entry.content_preview}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <p className="text-xs font-semibold text-slate-300">Secret 상태</p>
                    {Object.keys(preview.secret_status).length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">필요한 secret이 없습니다.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(preview.secret_status).map(([key, value]) => (
                          <span
                            key={key}
                            className={`rounded-full px-2 py-1 text-[11px] ${
                              value === "configured"
                                ? "bg-emerald-500/15 text-emerald-200"
                                : "bg-amber-500/15 text-amber-200"
                            }`}
                          >
                            {key}: {value === "configured" ? "설정됨" : "누락"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleBind()}
                      className="flex-1 rounded-lg border border-blue-400/60 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                    >
                      바인딩 저장
                    </button>
                    <button
                      type="button"
                      disabled={busy || !selectedBinding}
                      onClick={() => void handleApply()}
                      className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
                    >
                      적용
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <h3 className="text-sm font-semibold text-white">이미지 생성 job</h3>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                서버는 prompt pack과 산출물 manifest를 관리하고, 실제 이미지는 Codex 실행자가 imagegen 경로로
                생성합니다.
              </p>
              <textarea
                value={assetBrief}
                onChange={(event) => setAssetBrief(event.target.value)}
                className="mt-3 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
              />
              <button
                type="button"
                disabled={
                  busy || !selectedProject || !selectedModule || !IMAGE_MODULE_KEYS.has(selectedModule.module_key)
                }
                onClick={() => void handleCreateAssetJob()}
                className="mt-2 w-full rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                이미지 job 초안 만들기
              </button>
              <div className="mt-3 space-y-2">
                {assetJobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{job.asset_key}</span>
                      <span>{job.status}</span>
                    </div>
                    <p className="mt-1 text-slate-500">{MODULE_LABELS[job.module_key]?.title ?? job.module_key}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <h3 className="text-sm font-semibold text-white">최근 적용 이력</h3>
              <div className="mt-3 space-y-2">
                {applyRuns.length === 0 ? (
                  <p className="text-xs text-slate-500">아직 적용 이력이 없습니다.</p>
                ) : (
                  applyRuns.slice(0, 5).map((run) => (
                    <div key={run.id} className="rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                      <div className="flex items-center justify-between gap-2">
                        <span>{run.status}</span>
                        <span>{formatTime(run.created_at)}</span>
                      </div>
                      <p className="mt-1 text-slate-500">{run.message ?? "-"}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
