import { post, request } from "./core";

import type {
  AgentMemoryResponse,
  BeadsStatus,
  MemoryOutboxItem,
  MemoryPromotionCandidate,
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

export async function searchMemory(input: {
  q?: string;
  project_id?: string | null;
  agent_id?: string | null;
  thread_id?: string | null;
  layer?: string | null;
  scope?: "local" | "global" | "all";
  tags?: string[] | string | null;
  created_from?: number | string | null;
  created_to?: number | string | null;
  updated_from?: number | string | null;
  updated_to?: number | string | null;
  promotion_status?: "local" | "candidate" | "promoted" | "rejected" | "all" | string | null;
  source_type?: "manual" | "task_run" | "beads" | "all" | string | null;
  limit?: number;
}): Promise<NativeMemory[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const payload = await request<{ ok: boolean; memories: NativeMemory[] }>(`/api/memory/search?${params.toString()}`);
  return payload.memories;
}

export async function scanMemoryPromotions(): Promise<MemoryPromotionCandidate[]> {
  const payload = await post<{ ok: boolean; candidates: MemoryPromotionCandidate[] }>(
    "/api/memory/promotions/scan",
    {},
  );
  return payload.candidates;
}

export async function getMemoryPromotions(status: "candidate" | "approved" | "rejected" | "all" = "candidate") {
  const payload = await request<{ ok: boolean; candidates: MemoryPromotionCandidate[] }>(
    `/api/memory/promotions?status=${encodeURIComponent(status)}`,
  );
  return payload.candidates;
}

export async function approveMemoryPromotion(candidateId: string): Promise<MemoryPromotionCandidate> {
  const payload = await post<{ ok: boolean; candidate: MemoryPromotionCandidate }>(
    `/api/memory/promotions/${encodeURIComponent(candidateId)}/approve`,
    {},
  );
  return payload.candidate;
}

export async function drainBeadsOutbox(projectId: string): Promise<{
  ok: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  items: MemoryOutboxItem[];
}> {
  return post("/api/memory/beads/outbox/drain", { project_id: projectId, limit: 20 });
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
