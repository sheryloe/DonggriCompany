import { post, request } from "./core";

import type {
  AssetJob,
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

export async function getModules(category?: string): Promise<ProjectModuleManifest[]> {
  const suffix = category ? `?category=${encodeURIComponent(category)}` : "";
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
