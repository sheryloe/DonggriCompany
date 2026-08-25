import type { ControlPlaneSourceSnapshot } from "../../control-plane/source-adapter.ts";

export type DashboardRegistryProject = {
  key: string;
  summary: string | null;
  status: string | null;
  enabled?: boolean | null;
  exists: boolean;
  git: {
    status: "clean" | "dirty" | "missing" | "not_git";
    branch: string | null;
    ahead: number;
    behind: number;
    dirty_count: number;
  };
};

export type DashboardRuntimeSummary = {
  data_mode: "isolated" | "local";
  refresh_interval_ms: number;
};

export function buildControlPlaneDashboardState(
  source: ControlPlaneSourceSnapshot,
  projects: DashboardRegistryProject[],
  runtime: DashboardRuntimeSummary = { data_mode: "local", refresh_interval_ms: 15_000 },
) {
  const visibleProjects = projects.filter((project) => project.enabled !== false);
  return {
    ok: true as const,
    generated_at: source.generated_at,
    source_epoch: source.source_epoch,
    projection_epoch: source.projection_epoch,
    degraded: source.degraded,
    parse_error_count: source.parse_errors.length,
    runtime,
    active_specs: source.active_specs.map((spec) => ({
      id: spec.id,
      phase: spec.phase,
      status: spec.status,
      related_repo: spec.related_repo,
      related_repos: spec.related_repos,
      next_recommended_action: spec.next_recommended_action,
    })),
    projects: visibleProjects.map((project) => ({
      key: project.key,
      summary: project.summary,
      lifecycle_status: project.status,
      enabled: project.enabled !== false,
      exists: project.exists,
      git: {
        status: project.git.status,
        branch: project.git.branch,
        ahead: project.git.ahead,
        behind: project.git.behind,
        dirty_count: project.git.dirty_count,
      },
    })),
    counts: {
      projects: visibleProjects.length,
      clean: visibleProjects.filter((project) => project.git.status === "clean").length,
      dirty: visibleProjects.filter((project) => project.git.status === "dirty").length,
      missing: visibleProjects.filter((project) => project.git.status === "missing").length,
      active_specs: source.active_specs.length,
    },
  };
}
