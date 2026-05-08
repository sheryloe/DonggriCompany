import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { applyMemorySchema } from "../../bootstrap/schema/memory-schema.ts";
import {
  enqueueMemoryOutbox,
  listDueMemoryOutbox,
  markMemoryOutboxFailed,
  markMemoryOutboxRunning,
  markMemoryOutboxSucceeded,
} from "../../memory/store.ts";
import { registerMemoryRoutes } from "./memory.ts";

type RouteHandler = (req: any, res: any) => any;

function createFakeResponse() {
  return {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

function createHarness() {
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  const routes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, handler: RouteHandler) {
      routes.set(`GET ${path}`, handler);
      return this;
    },
    post(path: string, handler: RouteHandler) {
      routes.set(`POST ${path}`, handler);
      return this;
    },
    patch(path: string, handler: RouteHandler) {
      routes.set(`PATCH ${path}`, handler);
      return this;
    },
    delete(path: string, handler: RouteHandler) {
      routes.set(`DELETE ${path}`, handler);
      return this;
    },
  };
  registerMemoryRoutes({
    app: app as any,
    db,
    nowMs: () => 1_700_000_000_000,
    normalizeTextField: (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null),
  });
  return { db, routes };
}

function seedProject(db: DatabaseSync, id: string, name = id) {
  db.prepare(
    `
    INSERT INTO projects (id, name, project_path, core_goal, last_used_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, 1)
  `,
  ).run(id, name, process.cwd(), `Goal for ${name}`);
}

function seedProjectAndAgent(db: DatabaseSync) {
  db.prepare(
    `
    INSERT INTO agents (id, name, name_ko, department_id, role, cli_provider, status, stats_tasks_done, stats_xp)
    VALUES ('agent-1', 'Memory Agent', '메모리 에이전트', NULL, 'junior', 'codex', 'idle', 0, 0)
  `,
  ).run();
  seedProject(db, "project-1", "Memory Project");
  seedProject(db, "project-2", "Other Project");
  seedProject(db, "project-3", "Third Project");
}

describe("memory routes", () => {
  let db: DatabaseSync | null = null;
  let routes: Map<string, RouteHandler>;

  beforeEach(() => {
    const harness = createHarness();
    db = harness.db;
    routes = harness.routes;
    seedProjectAndAgent(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db?.close();
    db = null;
  });

  it("creates and lists agent memory with Korean display summary and canonical layer", () => {
    const postHandler = routes.get("POST /api/agents/:id/memory");
    const getHandler = routes.get("GET /api/agents/:id/memory");
    expect(postHandler).toBeTypeOf("function");
    expect(getHandler).toBeTypeOf("function");

    const postRes = createFakeResponse();
    postHandler?.(
      {
        params: { id: "agent-1" },
        body: {
          title: "OAuth reconnect lesson",
          body: "Check execution account readiness before assigning provider-specific work.",
          memory_type: "lesson",
          memory_layer: "core",
          display_summary_ko: "실행 계정 준비 상태를 먼저 확인한다.",
          tags: ["oauth", "provider"],
        },
      },
      postRes,
    );

    expect(postRes.statusCode).toBe(201);
    expect(postRes.payload).toMatchObject({
      ok: true,
      memory: {
        agent_id: "agent-1",
        memory_type: "lesson",
        memory_layer: "core",
        promotion_status: "local",
        display_summary_ko: "실행 계정 준비 상태를 먼저 확인한다.",
      },
    });

    const getRes = createFakeResponse();
    getHandler?.({ params: { id: "agent-1" } }, getRes);
    expect(getRes.statusCode).toBe(200);
    expect((getRes.payload as { memories: unknown[] }).memories).toHaveLength(1);
  });

  it("reconciles completed tasks into episodic memory, growth events, and skill usage", () => {
    db!
      .prepare(
        `
      INSERT INTO tasks (
        id, title, description, assigned_agent_id, project_id, status, task_type,
        workflow_pack_key, workflow_meta_json, project_path, result, created_at, updated_at, completed_at
      ) VALUES (
        'task-1', 'Build login flow', 'Implement auth UI', 'agent-1', 'project-1', 'done',
        'development', 'development', ?, ?, 'Implemented and tested login flow.', 1, 2, 3
      )
    `,
      )
      .run(JSON.stringify({ goal_command: "feature" }), process.cwd());

    const handler = routes.get("POST /api/projects/:id/memory/reconcile");
    const res = createFakeResponse();
    handler?.({ params: { id: "project-1" }, body: { include_beads: false } }, res);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as {
      reconciled_tasks: number;
      memories: Array<{ title: string; memory_layer: string; episode_json: string | null }>;
      beads_import: null;
      quality_events: Array<{ event_type: string; title: string; evidence_json: string }>;
    };
    expect(payload.reconciled_tasks).toBe(1);
    expect(payload.beads_import).toBeNull();
    expect(payload.quality_events[0]).toMatchObject({
      event_type: "memory_reconcile",
      title: "Project memory reconcile",
    });
    expect(payload.quality_events[0]?.evidence_json).toContain('"reconciled_tasks":1');
    expect(payload.memories.some((memory) => memory.title.includes("Build login flow"))).toBe(true);
    expect(payload.memories.every((memory) => memory.memory_layer === "episodic")).toBe(true);
    expect(payload.memories[0]?.episode_json).toContain("task-1");

    const skillRows = db!
      .prepare("SELECT skill_id FROM skill_usage_events WHERE task_id = ? ORDER BY skill_id")
      .all("task-1") as Array<{ skill_id: string }>;
    expect(skillRows.map((row) => row.skill_id)).toEqual(["development", "feature"]);

    const growthRows = db!
      .prepare("SELECT event_type, episode_json FROM agent_growth_events WHERE task_id = ?")
      .all("task-1") as Array<{ event_type: string; episode_json: string | null }>;
    expect(growthRows).toHaveLength(1);
    expect(growthRows[0]?.event_type).toBe("task_completed");
    expect(growthRows[0]?.episode_json).toContain("Build login flow");
  });

  it("searches memories with project isolation by default", () => {
    const createProjectMemoryHandler = routes.get("POST /api/projects/:id/memory");
    createProjectMemoryHandler?.(
      {
        params: { id: "project-1" },
        body: {
          title: "React router fix",
          body: "Use stable route ids for dashboard navigation.",
          memory_type: "lesson",
          memory_layer: "archival",
          tags: ["react", "router"],
        },
      },
      createFakeResponse(),
    );
    createProjectMemoryHandler?.(
      {
        params: { id: "project-2" },
        body: {
          title: "React router unrelated",
          body: "This other project memory must not bleed into project-1.",
          memory_type: "lesson",
          memory_layer: "archival",
          tags: ["react", "router"],
        },
      },
      createFakeResponse(),
    );

    const searchHandler = routes.get("GET /api/memory/search");
    const res = createFakeResponse();
    searchHandler?.(
      {
        query: {
          q: "React router",
          project_id: "project-1",
          scope: "local",
        },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    const payload = res.payload as { memories: Array<{ project_id: string; title: string }> };
    expect(payload.memories.length).toBeGreaterThan(0);
    expect(payload.memories.every((memory) => memory.project_id === "project-1")).toBe(true);
  });

  it("filters memory search by tags and created date range", () => {
    for (const memory of [
      {
        id: "memory-old-design",
        title: "Old design decision",
        tags: ["design", "approved"],
        created_at: 1_000,
      },
      {
        id: "memory-target-design",
        title: "In-range design decision",
        tags: ["design", "approved"],
        created_at: 2_000,
      },
      {
        id: "memory-target-dev",
        title: "In-range dev decision",
        tags: ["dev", "approved"],
        created_at: 2_000,
      },
    ]) {
      db!
        .prepare(
          `
        INSERT INTO project_memories (
          id, project_id, agent_id, memory_type, scope_type, title, body,
          tags_json, source_type, memory_layer, status, created_at, updated_at
        ) VALUES (?, 'project-1', 'agent-1', 'lesson', 'project', ?, 'Range filter body.',
          ?, 'manual', 'archival', 'active', ?, ?
        )
      `,
        )
        .run(memory.id, memory.title, JSON.stringify(memory.tags), memory.created_at, memory.created_at);
    }

    const searchHandler = routes.get("GET /api/memory/search");
    const res = createFakeResponse();
    searchHandler?.(
      {
        query: {
          project_id: "project-1",
          tags: "design,approved",
          created_from: "1500",
          created_to: "2500",
        },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    const payload = res.payload as { memories: Array<{ id: string; title: string }> };
    expect(payload.memories.map((memory) => memory.id)).toEqual(["memory-target-design"]);
  });

  it("filters memory search by promotion status and source type", () => {
    for (const memory of [
      {
        id: "memory-local-manual",
        title: "Local manual decision",
        source_type: "manual",
        promotion_status: "local",
      },
      {
        id: "memory-promoted-manual",
        title: "Promoted manual decision",
        source_type: "manual",
        promotion_status: "promoted",
      },
      {
        id: "memory-local-task-run",
        title: "Local task run decision",
        source_type: "task_run",
        promotion_status: "local",
      },
    ]) {
      db!
        .prepare(
          `
        INSERT INTO project_memories (
          id, project_id, agent_id, memory_type, scope_type, title, body,
          tags_json, source_type, memory_layer, promotion_status, status, created_at, updated_at
        ) VALUES (?, 'project-1', 'agent-1', 'lesson', 'project', ?, 'Advanced filter body.',
          '[]', ?, 'archival', ?, 'active', 3000, 3000
        )
      `,
        )
        .run(memory.id, memory.title, memory.source_type, memory.promotion_status);
    }

    const searchHandler = routes.get("GET /api/memory/search");
    const promotedRes = createFakeResponse();
    searchHandler?.(
      {
        query: {
          project_id: "project-1",
          promotion_status: "promoted",
        },
      },
      promotedRes,
    );

    expect(promotedRes.statusCode).toBe(200);
    const promotedPayload = promotedRes.payload as { memories: Array<{ id: string }> };
    expect(promotedPayload.memories.map((memory) => memory.id)).toEqual(["memory-promoted-manual"]);

    const sourceRes = createFakeResponse();
    searchHandler?.(
      {
        query: {
          project_id: "project-1",
          source_type: "task_run",
        },
      },
      sourceRes,
    );

    expect(sourceRes.statusCode).toBe(200);
    const sourcePayload = sourceRes.payload as { memories: Array<{ id: string }> };
    expect(sourcePayload.memories.map((memory) => memory.id)).toEqual(["memory-local-task-run"]);
  });

  it("ranks core and episodic memories before archival matches", () => {
    const createProjectMemoryHandler = routes.get("POST /api/projects/:id/memory");
    for (const memory of [
      {
        title: "Routing archival note",
        body: "Routing fallback detail.",
        memory_type: "lesson",
        memory_layer: "archival",
        strength: 1,
      },
      {
        title: "Routing core rule",
        body: "Routing project invariant.",
        memory_type: "constraint",
        memory_layer: "core",
        strength: 0.2,
      },
      {
        title: "Routing episodic fix",
        body: "Routing issue was fixed after a failed deploy.",
        memory_type: "episode",
        memory_layer: "episodic",
        strength: 0.8,
      },
    ]) {
      createProjectMemoryHandler?.({ params: { id: "project-1" }, body: memory }, createFakeResponse());
    }

    const searchHandler = routes.get("GET /api/memory/search");
    const res = createFakeResponse();
    searchHandler?.({ query: { q: "Routing", project_id: "project-1", scope: "local" } }, res);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as { memories: Array<{ memory_layer: string; title: string }> };
    expect(payload.memories.map((memory) => memory.memory_layer).slice(0, 3)).toEqual(["core", "episodic", "archival"]);
  });

  it("supports semantic ranking mode for query-token relevance", () => {
    const createProjectMemoryHandler = routes.get("POST /api/projects/:id/memory");
    createProjectMemoryHandler?.(
      {
        params: { id: "project-1" },
        body: {
          title: "Capacity fallback retry runbook",
          body: "When LLM capacity returns 429, retry later and use fallback models.",
          memory_type: "lesson",
          memory_layer: "archival",
          tags: ["capacity", "fallback", "retry"],
          strength: 0.3,
        },
      },
      createFakeResponse(),
    );
    createProjectMemoryHandler?.(
      {
        params: { id: "project-1" },
        body: {
          title: "Capacity note",
          body: "Capacity note with less operational detail.",
          memory_type: "lesson",
          memory_layer: "archival",
          tags: ["capacity"],
          strength: 1,
        },
      },
      createFakeResponse(),
    );

    const searchHandler = routes.get("GET /api/memory/search");
    const res = createFakeResponse();
    searchHandler?.(
      { query: { q: "capacity fallback retry", project_id: "project-1", scope: "local", ranking: "semantic" } },
      res,
    );

    expect(res.statusCode).toBe(200);
    const payload = res.payload as { memories: Array<{ title: string; rank: number }> };
    expect(payload.memories[0].title).toBe("Capacity fallback retry runbook");
    expect(payload.memories[0].rank).toBeGreaterThan(payload.memories[1].rank);
  });

  it("persists vector embeddings and uses cosine ranking when ranking=vector", () => {
    const createProjectMemoryHandler = routes.get("POST /api/projects/:id/memory");
    createProjectMemoryHandler?.(
      {
        params: { id: "project-1" },
        body: {
          title: "Provider fallback retry runbook",
          body: "When provider capacity is unavailable, retry with the fallback pool and record the capacity event.",
          memory_type: "lesson",
          memory_layer: "archival",
          tags: ["provider", "fallback", "retry", "capacity"],
          strength: 0.2,
        },
      },
      createFakeResponse(),
    );
    createProjectMemoryHandler?.(
      {
        params: { id: "project-1" },
        body: {
          title: "Provider note",
          body: "Provider note without fallback operation detail.",
          memory_type: "lesson",
          memory_layer: "archival",
          tags: ["provider"],
          strength: 1,
        },
      },
      createFakeResponse(),
    );

    const searchHandler = routes.get("GET /api/memory/search");
    const res = createFakeResponse();
    searchHandler?.(
      { query: { q: "provider capacity fallback retry", project_id: "project-1", scope: "local", ranking: "vector" } },
      res,
    );

    expect(res.statusCode).toBe(200);
    const payload = res.payload as { memories: Array<{ title: string; rank: number }> };
    expect(payload.memories[0].title).toBe("Provider fallback retry runbook");
    expect(payload.memories[0].rank).toBeGreaterThan(payload.memories[1].rank);
    const embeddingCount = db!.prepare("SELECT COUNT(*) AS cnt FROM memory_embeddings").get() as { cnt: number };
    expect(embeddingCount.cnt).toBeGreaterThanOrEqual(2);
  });

  it("backfills provider embeddings, writes ANN buckets, and uses semantic_provider ranking", async () => {
    db!.prepare(
      `
      INSERT INTO api_providers (id, name, type, base_url, enabled, models_cache, models_cached_at, created_at, updated_at)
      VALUES ('provider-1', 'Embedding Provider', 'openai', 'https://example.test/v1', 1, ?, 1, 1, 1)
    `,
    ).run(JSON.stringify(["text-embedding-3-small"]));
    for (const memory of [
      {
        id: "provider-memory-1",
        title: "Provider fallback retry runbook",
        body: "Use provider fallback when capacity returns 429.",
      },
      {
        id: "provider-memory-2",
        title: "General provider note",
        body: "Record provider configuration changes.",
      },
    ]) {
      db!.prepare(
        `
        INSERT INTO project_memories (
          id, project_id, agent_id, memory_type, scope_type, title, body,
          tags_json, source_type, memory_layer, status, created_at, updated_at
        ) VALUES (?, 'project-1', 'agent-1', 'lesson', 'project', ?, ?,
          '[]', 'manual', 'archival', 'active', 3000, 3000
        )
      `,
      ).run(memory.id, memory.title, memory.body);
    }
    const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { input?: string; prompt?: string };
      const text = String(body.input ?? body.prompt ?? "");
      const vector = /fallback|capacity/i.test(text) ? [1, 0, 0] : [0, 1, 0];
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ embedding: vector }] }),
        text: async () => "",
        headers: { get: () => null },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const backfillHandler = routes.get("POST /api/memory/embeddings/backfill");
    const backfillRes = createFakeResponse();
    await backfillHandler?.(
      {
        body: {
          project_id: "project-1",
          provider_id: "provider-1",
          model: "text-embedding-3-small",
          force: true,
        },
      },
      backfillRes,
    );

    expect(backfillRes.statusCode).toBe(200);
    expect(backfillRes.payload).toMatchObject({ ok: true, processed: 2, embedded: 2, indexed: 2, failed: 0 });
    const indexCount = db!.prepare("SELECT COUNT(*) AS cnt FROM memory_embedding_index").get() as { cnt: number };
    expect(indexCount.cnt).toBeGreaterThan(0);

    const searchHandler = routes.get("GET /api/memory/search");
    const searchRes = createFakeResponse();
    await searchHandler?.(
      {
        query: {
          q: "capacity fallback",
          project_id: "project-1",
          ranking: "semantic_provider",
          provider_id: "provider-1",
          model: "text-embedding-3-small",
        },
      },
      searchRes,
    );

    expect(searchRes.statusCode).toBe(200);
    const payload = searchRes.payload as { memories: Array<{ id: string; title: string }> };
    expect(payload.memories[0]?.id).toBe("provider-memory-1");
  });

  it("falls back to local hash embeddings and records quality metrics when provider returns 429", async () => {
    db!.prepare(
      `
      INSERT INTO api_providers (id, name, type, base_url, enabled, models_cache, models_cached_at, created_at, updated_at)
      VALUES ('provider-429', 'Capacity Provider', 'openai', 'https://example.test/v1', 1, ?, 1, 1, 1)
    `,
    ).run(JSON.stringify(["text-embedding-3-small"]));
    db!.prepare(
      `
      INSERT INTO project_memories (
        id, project_id, agent_id, memory_type, scope_type, title, body,
        tags_json, source_type, memory_layer, status, created_at, updated_at
      ) VALUES ('provider-failed-memory', 'project-1', 'agent-1', 'lesson', 'project',
        'Capacity fallback failed', 'Provider returned capacity 429.',
        '[]', 'manual', 'archival', 'active', 3000, 3000
      )
    `,
    ).run();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({}),
        text: async () => "rate limit capacity",
        headers: { get: () => null },
      })),
    );

    const backfillHandler = routes.get("POST /api/memory/embeddings/backfill");
    const res = createFakeResponse();
    await backfillHandler?.(
      {
        body: {
          project_id: "project-1",
          provider_id: "provider-429",
          model: "text-embedding-3-small",
          force: true,
        },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: true, processed: 1, embedded: 0, failed: 1, fallback_used: true });
    const failed = db!
      .prepare("SELECT embedding_status, last_error FROM memory_embeddings WHERE embedding_model = ?")
      .get("text-embedding-3-small") as { embedding_status: string; last_error: string };
    expect(failed.embedding_status).toBe("failed");
    expect(failed.last_error).toContain("capacity");
    const localFallback = db!
      .prepare("SELECT COUNT(*) AS cnt FROM memory_embeddings WHERE embedding_model = 'local-hash-v3'")
      .get() as { cnt: number };
    expect(localFallback.cnt).toBe(1);
    const metric = db!
      .prepare("SELECT metric_key, status FROM quality_metric_events WHERE metric_key = 'provider.capacity_429'")
      .get() as { metric_key: string; status: string };
    expect(metric).toMatchObject({ metric_key: "provider.capacity_429", status: "capacity_limited" });
  });

  it("supports server-side saved and recent memory search profiles", () => {
    const postHandler = routes.get("POST /api/memory/searches");
    const getHandler = routes.get("GET /api/memory/searches");
    const patchHandler = routes.get("PATCH /api/memory/searches/:id");
    const deleteHandler = routes.get("DELETE /api/memory/searches/:id");

    const savedRes = createFakeResponse();
    postHandler?.(
      {
        body: {
          kind: "saved",
          project_id: "project-1",
          label: "fallback runbook",
          query: "fallback",
          filters: { rankingMode: "semantic_provider", layer: "archival" },
        },
      },
      savedRes,
    );
    expect(savedRes.statusCode).toBe(201);
    const saved = (savedRes.payload as { search: { id: string; label: string } }).search;
    expect(saved.label).toBe("fallback runbook");

    const recentRes1 = createFakeResponse();
    postHandler?.(
      {
        body: {
          kind: "recent",
          project_id: "project-1",
          label: "fallback",
          query: "fallback",
          filters: { rankingMode: "vector" },
        },
      },
      recentRes1,
    );
    const recentRes2 = createFakeResponse();
    postHandler?.(
      {
        body: {
          kind: "recent",
          project_id: "project-1",
          label: "fallback",
          query: "fallback",
          filters: { rankingMode: "vector" },
        },
      },
      recentRes2,
    );
    const recent = (recentRes2.payload as { search: { id: string; use_count: number } }).search;
    expect(recent.use_count).toBe(2);

    const listRes = createFakeResponse();
    getHandler?.({ query: { kind: "saved", project_id: "project-1" } }, listRes);
    const listPayload = listRes.payload as { searches: Array<{ id: string; label: string }> };
    expect(listPayload.searches.map((item) => item.label)).toContain("fallback runbook");

    const patchRes = createFakeResponse();
    patchHandler?.(
      { params: { id: saved.id }, body: { kind: "saved", project_id: "project-1", label: "renamed", query: "fallback" } },
      patchRes,
    );
    expect((patchRes.payload as { search: { label: string } }).search.label).toBe("renamed");

    const deleteRes = createFakeResponse();
    deleteHandler?.({ params: { id: saved.id } }, deleteRes);
    expect(deleteRes.statusCode).toBe(200);
  });

  it("creates and approves global skill promotion candidates from cross-project success evidence", () => {
    const now = 1_700_000_000_000;
    for (const [index, projectId] of ["project-1", "project-2", "project-3"].entries()) {
      const taskId = `task-skill-${index}`;
      db!
        .prepare(
          `
        INSERT INTO tasks (
          id, title, description, assigned_agent_id, project_id, status, task_type,
          workflow_pack_key, result, created_at, updated_at, completed_at
        ) VALUES (?, ?, 'Skill promotion evidence task', 'agent-1', ?, 'done', 'development',
          'development', ?, ?, ?, ?
        )
      `,
        )
        .run(
          taskId,
          `Reusable routing task ${index}`,
          projectId,
          `Reusable routing result ${index} with verified project memory.`,
          now + index,
          now + index,
          now + index,
        );
      db!
        .prepare(
          `
        INSERT INTO project_memories (
          id, project_id, agent_id, memory_type, scope_type, title, body, source_type,
          source_id, memory_layer, status, created_at, updated_at
        ) VALUES (?, ?, 'agent-1', 'task_lesson', 'project', ?, ?, 'task_run',
          ?, 'episodic', 'active', ?, ?
        )
      `,
        )
        .run(
          `memory-skill-${index}`,
          projectId,
          `Memory evidence ${index}`,
          `Project memory evidence for reusable routing ${index}.`,
          taskId,
          now + index,
          now + index,
        );
      db!
        .prepare(
          `
        INSERT INTO skill_usage_events (
          id, agent_id, project_id, task_id, skill_id, provider, outcome, confidence, notes, created_at
        ) VALUES (?, 'agent-1', ?, ?, 'react-router-repair', 'codex', 'success', 0.9, 'test evidence', ?)
      `,
        )
        .run(`skill-${index}`, projectId, taskId, now + index);
    }

    const scanHandler = routes.get("POST /api/memory/promotions/scan");
    const scanRes = createFakeResponse();
    scanHandler?.({ body: {} }, scanRes);
    expect(scanRes.statusCode).toBe(200);
    const candidates = (scanRes.payload as { candidates: Array<{ id: string; candidate_key: string }> }).candidates;
    expect(candidates.some((candidate) => candidate.candidate_key === "skill:react-router-repair")).toBe(true);
    const scannedCandidate = candidates.find((candidate) => candidate.candidate_key === "skill:react-router-repair")!;
    const candidateRow = db!
      .prepare("SELECT summary, evidence_json FROM memory_promotion_evidence WHERE id = ?")
      .get(scannedCandidate.id) as { summary: string; evidence_json: string };
    const evidence = JSON.parse(candidateRow.evidence_json) as {
      skill_usage: Array<{ task_id: string | null }>;
      task_results: Array<{ task_id: string; result_summary: string }>;
      memory_refs: Array<{ source_table: string; source_id: string | null }>;
    };
    expect(candidateRow.summary).toContain("linked task or memory evidence");
    expect(evidence.skill_usage.every((row) => row.task_id?.startsWith("task-skill-"))).toBe(true);
    expect(evidence.task_results.map((row) => row.result_summary).join("\n")).toContain("Reusable routing result");
    expect(evidence.memory_refs.some((row) => row.source_table === "project_memories")).toBe(true);

    const approveHandler = routes.get("POST /api/memory/promotions/:id/approve");
    const approveRes = createFakeResponse();
    approveHandler?.({ params: { id: scannedCandidate.id } }, approveRes);
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.payload).toMatchObject({ candidate: { status: "approved" } });

    const qualityRows = db!
      .prepare("SELECT event_type, evidence_json FROM memory_quality_events ORDER BY created_at DESC")
      .all() as Array<{ event_type: string; evidence_json: string }>;
    expect(qualityRows.some((row) => row.event_type === "global_memory_promotion_approved")).toBe(true);
    expect(qualityRows[0]?.evidence_json).toContain("react-router-repair");
  });

  it("renders approved global lessons and the archival memory HTTP tool without leaking raw cross-project memory", () => {
    db!
      .prepare(
        `
        INSERT INTO memory_promotion_evidence (
          id, candidate_key, candidate_type, title, summary, tags_json, evidence_json,
          evidence_count, project_count, confidence, status, approved_at, created_at, updated_at
        ) VALUES
          ('approved-global-1', 'skill:approved-routing', 'skill', 'Approved routing', 'Approved global routing summary.', '[]', '{}', 4, 3, 0.9, 'approved', 10, 10, 10),
          ('candidate-global-1', 'skill:candidate-routing', 'skill', 'Candidate routing', 'Candidate summary must not be injected.', '[]', '{}', 4, 3, 0.9, 'candidate', NULL, 10, 10)
      `,
      )
      .run();
    db!
      .prepare(
        `
        INSERT INTO project_memories (
          id, project_id, agent_id, memory_type, scope_type, title, body, source_type,
          source_id, memory_layer, promotion_status, status, created_at, updated_at
        ) VALUES (
          'other-project-memory', 'project-2', 'agent-1', 'lesson', 'project',
          'Other project raw lesson', 'Raw cross-project memory body must stay out.',
          'manual', NULL, 'archival', 'promoted', 'active', 20, 20
        )
      `,
      )
      .run();

    const projectHandler = routes.get("GET /api/projects/:id/memory");
    const res = createFakeResponse();
    projectHandler?.({ params: { id: "project-1" } }, res);

    expect(res.statusCode).toBe(200);
    const preview = (res.payload as { memory_context_preview: string }).memory_context_preview;
    expect(preview).toContain("[HTTP Tool: search_archival_memory]");
    expect(preview).toContain("endpoint=/api/memory/search");
    expect(preview).toContain("Approved global routing summary.");
    expect(preview).not.toContain("Candidate summary must not be injected.");
    expect(preview).not.toContain("Raw cross-project memory body must stay out.");
  });

  it("keeps Beads write bridge disabled by default and exposes outbox state", () => {
    const handler = routes.get("POST /api/memory/beads/export");
    const res = createFakeResponse();
    handler?.(
      {
        body: {
          project_id: "project-1",
          title: "Follow-up issue",
          body: "Persist only when beadsWriteEnabled is true.",
        },
      },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.payload).toMatchObject({ error: "beads_write_disabled" });

    enqueueMemoryOutbox(db!, {
      projectId: "project-1",
      target: "beads",
      operation: "create_issue",
      payload: { title: "Queued issue" },
      now: 1_700_000_000_000,
    });
    const projectHandler = routes.get("GET /api/projects/:id/memory");
    const projectRes = createFakeResponse();
    projectHandler?.({ params: { id: "project-1" } }, projectRes);
    expect((projectRes.payload as { memory_outbox: unknown[] }).memory_outbox).toHaveLength(1);
  });

  it("claims, retries, and completes memory outbox items deterministically", () => {
    const queued = enqueueMemoryOutbox(db!, {
      projectId: "project-1",
      target: "beads",
      operation: "create_issue",
      payload: { title: "Queued issue" },
      now: 1_700_000_000_000,
    });

    expect(listDueMemoryOutbox(db!, { target: "beads", now: 1_700_000_000_000 })).toHaveLength(1);
    const running = markMemoryOutboxRunning(db!, { id: queued.id, now: 1_700_000_000_100 });
    expect(running).toMatchObject({ status: "running", attempt_count: 1 });

    const failed = markMemoryOutboxFailed(db!, {
      id: queued.id,
      error: "bd unavailable",
      nextRetryAt: 1_700_000_010_000,
      now: 1_700_000_000_200,
    });
    expect(failed).toMatchObject({ status: "failed", last_error: "bd unavailable" });
    expect(listDueMemoryOutbox(db!, { target: "beads", now: 1_700_000_005_000 })).toHaveLength(0);
    expect(listDueMemoryOutbox(db!, { target: "beads", now: 1_700_000_010_000 })).toHaveLength(1);

    const rerun = markMemoryOutboxRunning(db!, { id: queued.id, now: 1_700_000_010_100 });
    expect(rerun).toMatchObject({ status: "running", attempt_count: 2 });
    const succeeded = markMemoryOutboxSucceeded(db!, {
      id: queued.id,
      externalRef: "bd-123",
      now: 1_700_000_010_200,
    });
    expect(succeeded).toMatchObject({ status: "succeeded", external_ref: "bd-123", next_retry_at: null });
    expect(listDueMemoryOutbox(db!, { target: "beads", now: 1_700_000_020_000 })).toHaveLength(0);
  });
});

describe("memory schema migration", () => {
  it("adds compatibility columns before indexes and FTS are created for legacy databases", () => {
    const legacyDb = new DatabaseSync(":memory:");
    try {
      legacyDb.exec(`
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE agent_memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  project_id TEXT,
  memory_type TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'agent',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  display_summary_ko TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.7,
  strength REAL NOT NULL DEFAULT 0.5,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  external_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER DEFAULT 1,
  updated_at INTEGER DEFAULT 1,
  last_used_at INTEGER
);
CREATE TABLE project_memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_id TEXT,
  memory_type TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'project',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  display_summary_ko TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.7,
  strength REAL NOT NULL DEFAULT 0.5,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  external_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER DEFAULT 1,
  updated_at INTEGER DEFAULT 1,
  last_used_at INTEGER
);
CREATE TABLE agent_growth_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  xp_delta INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT 1
);
`);

      expect(() => applyMemorySchema(legacyDb)).not.toThrow();
      const columns = legacyDb.prepare("PRAGMA table_info(agent_memories)").all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).toContain("memory_layer");
      expect(columns.map((column) => column.name)).toContain("promotion_status");
      const embeddingColumns = legacyDb.prepare("PRAGMA table_info(memory_embeddings)").all() as Array<{
        name: string;
      }>;
      expect(embeddingColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["source_table", "memory_id", "embedding_model", "dims", "vector_json", "content_hash"]),
      );
      const ftsSetting = legacyDb.prepare("SELECT value FROM settings WHERE key = 'memoryFtsAvailable'").get() as
        | { value: string }
        | undefined;
      expect(ftsSetting?.value).toBe("true");
    } finally {
      legacyDb.close();
    }
  });
});
