import { request } from "./core";

export type DashboardProjectStatus = "clean" | "dirty" | "missing" | "not_git";

export type ControlPlaneDashboardProject = {
  key: string;
  path?: string;
  summary: string | null;
  lifecycle_status: string | null;
  enabled: boolean;
  exists: boolean;
  git: {
    status: DashboardProjectStatus;
    branch: string | null;
    ahead: number;
    behind: number;
    dirty_count: number;
  };
};

export type ControlPlaneDashboardState = {
  ok: true;
  generated_at: string;
  source_epoch: string;
  projection_epoch: string;
  degraded: boolean;
  parse_error_count: number;
  runtime: {
    data_mode: "isolated" | "local";
    refresh_interval_ms: number;
  };
  active_specs: Array<{
    id: string;
    phase: string;
    status: string;
    related_repo: string;
    related_repos: string[];
    next_recommended_action: string | null;
  }>;
  projects: ControlPlaneDashboardProject[];
  counts: {
    projects: number;
    clean: number;
    dirty: number;
    missing: number;
    active_specs: number;
  };
};

export function getControlPlaneDashboardState(signal?: AbortSignal): Promise<ControlPlaneDashboardState> {
  return request<ControlPlaneDashboardState>("/api/control-plane/dashboard", { signal });
}
