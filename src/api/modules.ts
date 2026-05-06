import { post, request } from "./core";

import type {
  AssetJob,
  ProjectComponentEvent,
  ProjectModuleApplyRun,
  ProjectModuleBinding,
  ProjectModuleManifest,
  ProjectModulePreview,
} from "../types";

export interface ProjectModulePreviewInput {
  module_key: string;
  module_version?: string;
  binding_name?: string;
  project_path?: string;
  config?: Record<string, unknown>;
  secret_refs?: Record<string, unknown>;
}

export interface ProjectModuleCatalogFilters {
  category?: string;
  departmentId?: string;
}

export interface ProjectComponentEventInput {
  department_id: string;
  component_key: string;
  component_kind: string;
  event_type: string;
  title: string;
  summary?: string;
  payload?: Record<string, unknown>;
  related_task_id?: string;
  created_by?: string;
}

export async function getModules(filters?: string | ProjectModuleCatalogFilters): Promise<ProjectModuleManifest[]> {
  const params = new URLSearchParams();
  if (typeof filters === "string") {
    if (filters) params.set("category", filters);
  } else if (filters) {
    if (filters.category) params.set("category", filters.category);
    if (filters.departmentId) params.set("department_id", filters.departmentId);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await request<{ ok: boolean; modules: ProjectModuleManifest[] }>(`/api/modules${suffix}`);
  return response.modules;
}

export async function getModuleDetail(moduleKey: string): Promise<{ module: ProjectModuleManifest; markdown: string }> {
  const response = await request<{ ok: boolean; module: ProjectModuleManifest; markdown: string }>(
    `/api/modules/${encodeURIComponent(moduleKey)}`,
  );
  return { module: response.module, markdown: response.markdown };
}

export async function previewProjectModule(
  projectId: string,
  input: ProjectModulePreviewInput,
): Promise<ProjectModulePreview> {
  const response = (await post(`/api/projects/${encodeURIComponent(projectId)}/modules/preview`, input)) as {
    ok: boolean;
    preview: ProjectModulePreview;
  };
  return response.preview;
}

export async function bindProjectModule(
  projectId: string,
  input: ProjectModulePreviewInput,
): Promise<ProjectModuleBinding> {
  const response = (await post(`/api/projects/${encodeURIComponent(projectId)}/modules`, input)) as {
    ok: boolean;
    binding: ProjectModuleBinding;
  };
  return response.binding;
}

export async function getProjectModules(projectId: string): Promise<{
  bindings: ProjectModuleBinding[];
  apply_runs: ProjectModuleApplyRun[];
}> {
  const response = await request<{
    ok: boolean;
    bindings: ProjectModuleBinding[];
    apply_runs: ProjectModuleApplyRun[];
  }>(`/api/projects/${encodeURIComponent(projectId)}/modules`);
  return { bindings: response.bindings, apply_runs: response.apply_runs };
}

export async function getProjectComponentEvents(
  projectId: string,
  filters?: { departmentId?: string; componentKey?: string },
): Promise<ProjectComponentEvent[]> {
  const params = new URLSearchParams();
  if (filters?.departmentId) params.set("department_id", filters.departmentId);
  if (filters?.componentKey) params.set("component_key", filters.componentKey);
  const query = params.toString();
  const response = await request<{ ok: boolean; events: ProjectComponentEvent[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/component-events${query ? `?${query}` : ""}`,
  );
  return response.events;
}

export async function createProjectComponentEvent(
  projectId: string,
  input: ProjectComponentEventInput,
): Promise<ProjectComponentEvent> {
  const response = (await post(`/api/projects/${encodeURIComponent(projectId)}/component-events`, input)) as {
    ok: boolean;
    event: ProjectComponentEvent;
  };
  return response.event;
}

export async function applyProjectModule(
  projectId: string,
  bindingId: string,
  idempotencyKey: string,
): Promise<{ apply_run: ProjectModuleApplyRun; idempotent: boolean }> {
  const response = await request<{
    ok: boolean;
    apply_run: ProjectModuleApplyRun;
    idempotent: boolean;
  }>(`/api/projects/${encodeURIComponent(projectId)}/modules/${encodeURIComponent(bindingId)}/apply`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({}),
  });
  return { apply_run: response.apply_run, idempotent: response.idempotent };
}

export async function getProjectAssetJobs(projectId: string): Promise<AssetJob[]> {
  const response = await request<{ ok: boolean; jobs: AssetJob[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/assets/jobs`,
  );
  return response.jobs;
}

export async function createProjectAssetJob(
  projectId: string,
  input: { module_key: string; asset_key?: string; asset_brief?: string; [key: string]: unknown },
): Promise<AssetJob> {
  const response = (await post(`/api/projects/${encodeURIComponent(projectId)}/assets/jobs`, input)) as {
    ok: boolean;
    job: AssetJob;
  };
  return response.job;
}
