import type { APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type E2ECleanupTargets = {
  apiProviderIds?: string[];
  subtaskIds?: string[];
  taskIds?: string[];
  agentIds?: string[];
  departmentIds?: string[];
  projectIds?: string[];
  requestHeaders?: Record<string, string>;
};

type DepartmentDetailResponse = {
  agents?: Array<{ id?: string | null }>;
};

type TaskListResponse = {
  tasks?: Array<{
    id?: string | null;
    department_id?: string | null;
    project_id?: string | null;
  }>;
};

const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);

function uniqueIds(ids: Array<string | null | undefined> | undefined): string[] {
  if (!ids) return [];
  return Array.from(new Set(ids.map((id) => String(id ?? "").trim()).filter((id) => id.length > 0)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function deleteById(
  request: APIRequestContext,
  routePrefix: string,
  ids: string[],
  errors: string[],
  requestHeaders?: Record<string, string>,
): Promise<void> {
  for (const id of ids) {
    try {
      let response = await request.delete(`${routePrefix}/${id}`, requestHeaders ? { headers: requestHeaders } : {});
      if (response.status() === 401 && !requestHeaders) {
        await request.get("/api/auth/session");
        response = await request.delete(`${routePrefix}/${id}`);
      }
      for (let attempt = 1; attempt <= 8 && TRANSIENT_HTTP_STATUSES.has(response.status()); attempt += 1) {
        await sleep(250 * attempt);
        response = await request.delete(`${routePrefix}/${id}`, requestHeaders ? { headers: requestHeaders } : {});
        if (response.status() === 401 && !requestHeaders) {
          await request.get("/api/auth/session");
          response = await request.delete(`${routePrefix}/${id}`);
        }
      }
      if (response.ok() || response.status() === 404) continue;
      const text = await response.text();
      errors.push(`${routePrefix}/${id} -> ${response.status()}: ${text.slice(0, 300)}`);
    } catch (error) {
      errors.push(`${routePrefix}/${id} -> ${String(error)}`);
    }
  }
}

async function waitForTaskDeletion(
  request: APIRequestContext,
  taskIds: string[],
  errors: string[],
  requestHeaders?: Record<string, string>,
): Promise<void> {
  for (const id of taskIds) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5_000) {
      try {
        const response = await request.get(`/api/tasks/${id}`, requestHeaders ? { headers: requestHeaders } : {});
        if (response.status() === 404) break;
      } catch {
        break;
      }
      await sleep(200);
    }

    try {
      const verify = await request.get(`/api/tasks/${id}`, requestHeaders ? { headers: requestHeaders } : {});
      if (verify.status() !== 404) {
        errors.push(`/api/tasks/${id} -> deletion not observed`);
      }
    } catch {
      // best-effort verification
    }
  }
}

async function runLocalE2EDbMutation(
  label: string,
  errors: string[],
  mutate: (db: DatabaseSync) => void,
): Promise<void> {
  const dbPath = path.resolve(process.cwd(), ".tmp", "e2e-runtime", "claw-empire.e2e.sqlite");
  if (!fs.existsSync(dbPath)) return;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(dbPath);
      db.exec("PRAGMA busy_timeout = 5000");
      mutate(db);
      return;
    } catch (error) {
      lastError = error;
      if (!String(error).toLowerCase().includes("database is locked")) {
        errors.push(`${label}(local-db) -> ${String(error)}`);
        return;
      }
      await sleep(250 * attempt);
    } finally {
      db?.close();
    }
  }

  errors.push(`${label}(local-db) -> ${String(lastError)}`);
}

async function deleteSubtasksFromLocalE2EDb(subtaskIds: string[], errors: string[]): Promise<void> {
  if (subtaskIds.length === 0) return;

  await runLocalE2EDbMutation("subtasks", errors, (db) => {
    const placeholders = subtaskIds.map(() => "?").join(", ");
    db.prepare(`DELETE FROM subtasks WHERE id IN (${placeholders})`).run(...subtaskIds);
  });
}

async function deleteMessagesForProjectsFromLocalE2EDb(projectIds: string[], errors: string[]): Promise<void> {
  if (projectIds.length === 0) return;

  await runLocalE2EDbMutation("messages", errors, (db) => {
    const placeholders = projectIds.map(() => "?").join(", ");
    db.prepare(`DELETE FROM messages WHERE project_id IN (${placeholders})`).run(...projectIds);
  });
}

async function markAgentsIdleForCleanup(
  request: APIRequestContext,
  agentIds: string[],
  errors: string[],
  requestHeaders?: Record<string, string>,
): Promise<void> {
  if (agentIds.length === 0) return;

  for (const id of agentIds) {
    try {
      let response = await request.patch(`/api/agents/${id}`, {
        ...(requestHeaders ? { headers: requestHeaders } : {}),
        data: { status: "offline" },
      });
      if (response.status() === 401 && !requestHeaders) {
        await request.get("/api/auth/session");
        response = await request.patch(`/api/agents/${id}`, { data: { status: "offline" } });
      }
      if (response.ok() || response.status() === 404) continue;
      for (let attempt = 1; attempt <= 5 && TRANSIENT_HTTP_STATUSES.has(response.status()); attempt += 1) {
        await sleep(200 * attempt);
        response = await request.patch(`/api/agents/${id}`, {
          ...(requestHeaders ? { headers: requestHeaders } : {}),
          data: { status: "offline" },
        });
        if (response.status() === 401 && !requestHeaders) {
          await request.get("/api/auth/session");
          response = await request.patch(`/api/agents/${id}`, { data: { status: "offline" } });
        }
      }
    } catch {
      // Local DB cleanup below is the final fallback for isolated E2E runtime only.
    }
  }

  await runLocalE2EDbMutation("agents(status=offline)", errors, (db) => {
    const placeholders = agentIds.map(() => "?").join(", ");
    db.prepare(`UPDATE agents SET status = 'offline' WHERE id IN (${placeholders})`).run(...agentIds);
  });
}

async function collectDepartmentAgentIds(
  request: APIRequestContext,
  departmentIds: string[],
  errors: string[],
  requestHeaders?: Record<string, string>,
): Promise<string[]> {
  const collected: string[] = [];
  for (const id of departmentIds) {
    try {
      let response = await request.get(
        `/api/departments/${id}?include_seed=1`,
        requestHeaders ? { headers: requestHeaders } : {},
      );
      if (response.status() === 401 && !requestHeaders) {
        await request.get("/api/auth/session");
        response = await request.get(`/api/departments/${id}?include_seed=1`);
      }
      for (let attempt = 1; attempt <= 8 && TRANSIENT_HTTP_STATUSES.has(response.status()); attempt += 1) {
        await sleep(250 * attempt);
        response = await request.get(
          `/api/departments/${id}?include_seed=1`,
          requestHeaders ? { headers: requestHeaders } : {},
        );
        if (response.status() === 401 && !requestHeaders) {
          await request.get("/api/auth/session");
          response = await request.get(`/api/departments/${id}?include_seed=1`);
        }
      }
      if (response.status() === 404) continue;
      const text = await response.text();
      if (!response.ok()) {
        errors.push(`/api/departments/${id} -> ${response.status()}: ${text.slice(0, 300)}`);
        continue;
      }
      const parsed = JSON.parse(text) as DepartmentDetailResponse;
      collected.push(...uniqueIds((parsed.agents ?? []).map((agent) => agent.id)));
    } catch (error) {
      errors.push(`/api/departments/${id} -> ${String(error)}`);
    }
  }
  return uniqueIds(collected);
}

async function collectRelatedTaskIds(
  request: APIRequestContext,
  projectIds: string[],
  departmentIds: string[],
  errors: string[],
  requestHeaders?: Record<string, string>,
): Promise<string[]> {
  if (projectIds.length === 0 && departmentIds.length === 0) return [];
  try {
    let response = await request.get("/api/tasks", requestHeaders ? { headers: requestHeaders } : {});
    if (response.status() === 401 && !requestHeaders) {
      await request.get("/api/auth/session");
      response = await request.get("/api/tasks");
    }
    for (let attempt = 1; attempt <= 8 && TRANSIENT_HTTP_STATUSES.has(response.status()); attempt += 1) {
      await sleep(250 * attempt);
      response = await request.get("/api/tasks", requestHeaders ? { headers: requestHeaders } : {});
      if (response.status() === 401 && !requestHeaders) {
        await request.get("/api/auth/session");
        response = await request.get("/api/tasks");
      }
    }
    const text = await response.text();
    if (!response.ok()) {
      errors.push(`/api/tasks -> ${response.status()}: ${text.slice(0, 300)}`);
      return [];
    }
    const parsed = JSON.parse(text) as TaskListResponse;
    const projectSet = new Set(projectIds);
    const departmentSet = new Set(departmentIds);
    return uniqueIds(
      (parsed.tasks ?? [])
        .filter(
          (task) =>
            projectSet.has(String(task.project_id ?? "")) || departmentSet.has(String(task.department_id ?? "")),
        )
        .map((task) => task.id),
    );
  } catch (error) {
    errors.push(`/api/tasks -> ${String(error)}`);
    return [];
  }
}

export async function cleanupE2EResources(request: APIRequestContext, targets: E2ECleanupTargets): Promise<void> {
  const errors: string[] = [];
  const apiProviderIds = uniqueIds(targets.apiProviderIds);
  const subtaskIds = uniqueIds(targets.subtaskIds);
  const projectIds = uniqueIds(targets.projectIds);
  const departmentIds = uniqueIds(targets.departmentIds);
  const requestHeaders = targets.requestHeaders;
  if (!requestHeaders) {
    await request.get("/api/auth/session").catch(() => undefined);
  }
  const relatedTaskIds = await collectRelatedTaskIds(request, projectIds, departmentIds, errors, requestHeaders);
  const taskIds = uniqueIds([...(targets.taskIds ?? []), ...relatedTaskIds]);

  await deleteById(request, "/api/tasks", taskIds, errors, requestHeaders);
  await waitForTaskDeletion(request, taskIds, errors, requestHeaders);
  await sleep(300);
  await deleteSubtasksFromLocalE2EDb(subtaskIds, errors);
  await deleteMessagesForProjectsFromLocalE2EDb(projectIds, errors);
  const departmentAgentIds = await collectDepartmentAgentIds(request, departmentIds, errors, requestHeaders);
  const agentIds = uniqueIds([...(targets.agentIds ?? []), ...departmentAgentIds]);
  await markAgentsIdleForCleanup(request, agentIds, errors, requestHeaders);
  await deleteById(request, "/api/agents", agentIds, errors, requestHeaders);
  await deleteById(request, "/api/api-providers", apiProviderIds, errors, requestHeaders);
  const leftoverTaskIds = await collectRelatedTaskIds(request, projectIds, departmentIds, errors, requestHeaders);
  await deleteById(request, "/api/tasks", leftoverTaskIds, errors, requestHeaders);
  await waitForTaskDeletion(request, leftoverTaskIds, errors, requestHeaders);
  await deleteById(request, "/api/projects", projectIds, errors, requestHeaders);
  await deleteById(request, "/api/departments", departmentIds, errors, requestHeaders);

  if (errors.length > 0) {
    throw new Error(`E2E cleanup failed:\n${errors.join("\n")}`);
  }
}
