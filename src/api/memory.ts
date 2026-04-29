import { post, request } from "./core";

import type {
  AgentMemoryResponse,
  BeadsStatus,
  NativeMemory,
  ProjectMemoryResponse,
  SkillUsageSummary,
} from "../types";

export async function getAgentMemory(agentId: string): Promise<AgentMemoryResponse> {
  return request<AgentMemoryResponse>(`/api/agents/${encodeURIComponent(agentId)}/memory`);
}

export async function createAgentMemory(
  agentId: string,
  input: {
    title: string;
    body: string;
    memory_type?: string;
    project_id?: string | null;
    display_summary_ko?: string | null;
    tags?: string[];
    confidence?: number;
    strength?: number;
  },
): Promise<NativeMemory> {
  const payload = await post<{ ok: boolean; memory: NativeMemory }>(
    `/api/agents/${encodeURIComponent(agentId)}/memory`,
    input,
  );
  return payload.memory;
}

export async function getProjectMemory(projectId: string): Promise<ProjectMemoryResponse> {
  return request<ProjectMemoryResponse>(`/api/projects/${encodeURIComponent(projectId)}/memory`);
}

export async function createProjectMemory(
  projectId: string,
  input: {
    title: string;
    body: string;
    memory_type?: string;
    agent_id?: string | null;
    display_summary_ko?: string | null;
    tags?: string[];
    confidence?: number;
    strength?: number;
  },
): Promise<NativeMemory> {
  const payload = await post<{ ok: boolean; memory: NativeMemory }>(
    `/api/projects/${encodeURIComponent(projectId)}/memory`,
    input,
  );
  return payload.memory;
}

export async function reconcileProjectMemory(projectId: string, includeBeads = true): Promise<ProjectMemoryResponse> {
  return post<ProjectMemoryResponse>(`/api/projects/${encodeURIComponent(projectId)}/memory/reconcile`, {
    include_beads: includeBeads,
  });
}

export async function getBeadsMemoryStatus(projectId: string): Promise<BeadsStatus> {
  const payload = await request<{ ok: boolean; status: BeadsStatus }>(
    `/api/memory/beads/status?project_id=${encodeURIComponent(projectId)}`,
  );
  return payload.status;
}

export async function importBeadsMemory(projectId: string): Promise<{
  ok: boolean;
  imported: number;
  skipped: number;
  status: BeadsStatus;
}> {
  return post("/api/memory/beads/import", { project_id: projectId });
}

export async function getSkillUsageSummary(): Promise<SkillUsageSummary[]> {
  const payload = await request<{ ok: boolean; skill_usage: SkillUsageSummary[] }>("/api/skills/usage-summary");
  return payload.skill_usage;
}
