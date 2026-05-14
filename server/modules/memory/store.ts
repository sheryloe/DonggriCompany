import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { decryptSecret } from "../../oauth/helpers.ts";
import { normalizeApiProviderBaseUrl, validateApiProviderBaseUrl } from "../shared/api-provider-url-policy.ts";

export type NativeMemoryRow = {
  id: string;
  agent_id: string | null;
  project_id: string | null;
  memory_type: string;
  scope_type: string;
  title: string;
  body: string;
  display_summary_ko: string | null;
  tags_json: string;
  confidence: number;
  strength: number;
  source_type: string;
  source_id: string | null;
  external_ref: string | null;
  memory_layer: MemoryLayer;
  thread_id: string | null;
  promotion_status: MemoryPromotionStatus;
  retrieval_count: number;
  last_retrieved_at: number | null;
  episode_json: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
};

export type MemoryLayer = "core" | "archival" | "episodic" | "global";
export type MemoryPromotionStatus = "local" | "candidate" | "promoted" | "rejected";

export type MemorySearchRow = NativeMemoryRow & {
  source_table: "agent_memories" | "project_memories";
  rank: number;
};

type MemoryRankingMode = "default" | "semantic" | "vector" | "semantic_provider";

type MemoryEmbeddingRow = {
  source_table: "agent_memories" | "project_memories";
  memory_id: string;
  embedding_model: string;
  dims: number;
  vector_json: string;
  content_hash: string;
  provider_id: string | null;
  provider_type: string | null;
  embedding_status: "ready" | "failed" | "fallback";
  last_error: string | null;
  source_text_chars: number;
  indexed_at: number | null;
  created_at: number;
  updated_at: number;
};

const LOCAL_MEMORY_EMBEDDING_MODEL = "local-hash-v3";
const LOCAL_MEMORY_EMBEDDING_DIMS = 128;
const DEFAULT_EMBEDDING_OWNER_KEY = "local";
const PROVIDER_EMBEDDING_DIMS_FALLBACK = 1536;

type ApiProviderType = "openai" | "anthropic" | "google" | "ollama" | "openrouter" | "together" | "groq" | "cerebras" | "custom";

type ApiProviderRow = {
  id: string;
  name: string;
  type: ApiProviderType;
  base_url: string;
  api_key_enc: string | null;
  enabled: number;
  models_cache: string | null;
  models_cached_at: number | null;
};

type EmbeddingProviderContext = {
  providerId: string;
  providerType: ApiProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
};

type MemorySearchProfileKind = "saved" | "recent";

export type MemorySearchProfileRow = {
  id: string;
  kind: MemorySearchProfileKind;
  owner_key: string;
  project_id: string | null;
  label: string;
  query: string;
  filters_json: string;
  last_used_at: number | null;
  use_count: number;
  created_at: number;
  updated_at: number;
};

export type QualityMetricEventRow = {
  id: string;
  metric_key: string;
  metric_family: string;
  project_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  value: number;
  unit: string | null;
  status: string;
  dimensions_json: string;
  evidence_json: string;
  source_type: string;
  source_id: string;
  recorded_at: number;
  created_at: number;
};

export type QualityMetricSummaryRow = {
  metric_key: string;
  metric_family: string;
  bucket: string;
  count: number;
  sum_value: number;
  avg_value: number;
  latest_value: number;
  latest_status: string;
  latest_recorded_at: number;
};

export type SkillUsageSummaryRow = {
  skill_id: string;
  use_count: number;
  success_count: number;
  latest_at: number;
  proficiency: number;
};

export type AgentGrowthEventRow = {
  id: string;
  agent_id: string;
  project_id: string | null;
  task_id: string | null;
  event_type: string;
  title: string;
  body: string;
  episode_json: string | null;
  source_memory_id: string | null;
  xp_delta: number;
  created_at: number;
};

export type MemoryOutboxRow = {
  id: string;
  project_id: string;
  target: string;
  operation: string;
  payload_json: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  attempt_count: number;
  last_error: string | null;
  next_retry_at: number | null;
  external_ref: string | null;
  created_at: number;
  updated_at: number;
};

export type MemoryPromotionCandidateRow = {
  id: string;
  candidate_key: string;
  candidate_type: string;
  title: string;
  summary: string;
  tags_json: string;
  evidence_json: string;
  evidence_count: number;
  project_count: number;
  confidence: number;
  status: "candidate" | "approved" | "rejected";
  approved_at: number | null;
  created_at: number;
  updated_at: number;
};

export type MemoryQualityEventRow = {
  id: string;
  project_id: string | null;
  event_type: string;
  title: string;
  summary: string;
  evidence_json: string;
  status: string;
  created_at: number;
};

export type MemoryCreateInput = {
  agentId?: string | null;
  projectId?: string | null;
  memoryType: string;
  scopeType: "agent" | "project" | "cross_project";
  title: string;
  body: string;
  displaySummaryKo?: string | null;
  tags?: string[] | null;
  confidence?: number | null;
  strength?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  externalRef?: string | null;
  memoryLayer?: MemoryLayer | string | null;
  threadId?: string | null;
  promotionStatus?: MemoryPromotionStatus | string | null;
  episode?: Record<string, unknown> | string | null;
  status?: string | null;
  now?: number | null;
};

export type MemorySearchInput = {
  query?: string | null;
  projectId?: string | null;
  agentId?: string | null;
  threadId?: string | null;
  layer?: string | null;
  scope?: "local" | "global" | "all" | string | null;
  tags?: string[] | null;
  createdFrom?: number | null;
  createdTo?: number | null;
  updatedFrom?: number | null;
  updatedTo?: number | null;
  promotionStatus?: MemoryPromotionStatus | "all" | string | null;
  sourceType?: string | null;
  ranking?: MemoryRankingMode | string | null;
  providerId?: string | null;
  model?: string | null;
  limit?: number | null;
  now?: number | null;
};

export type TaskMemoryExtractionInput = {
  task: {
    id: string;
    title: string;
    description?: string | null;
    assigned_agent_id?: string | null;
    department_id?: string | null;
    project_id?: string | null;
    project_path?: string | null;
    task_type?: string | null;
    workflow_pack_key?: string | null;
    workflow_meta_json?: string | null;
  };
  result?: string | null;
  provider?: string | null;
  now?: number | null;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function encodeTags(tags: string[] | null | undefined): string {
  const normalized = Array.isArray(tags)
    ? [...new Set(tags.map((tag) => normalizeText(tag).toLowerCase()).filter(Boolean))].slice(0, 20)
    : [];
  return JSON.stringify(normalized);
}

function encodeJson(value: Record<string, unknown> | string | null | undefined): string | null {
  if (typeof value === "string") {
    const normalized = normalizeText(value);
    if (!normalized) return null;
    try {
      JSON.parse(normalized);
      return normalized;
    } catch {
      return JSON.stringify({ note: normalized });
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return JSON.stringify(value);
}

function normalizeMemoryLayer(value: unknown, fallback: MemoryLayer = "archival"): MemoryLayer {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "core" || normalized === "archival" || normalized === "episodic" || normalized === "global") {
    return normalized;
  }
  return fallback;
}

function normalizePromotionStatus(value: unknown, fallback: MemoryPromotionStatus = "local"): MemoryPromotionStatus {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "local" || normalized === "candidate" || normalized === "promoted" || normalized === "rejected") {
    return normalized;
  }
  return fallback;
}

function defaultMemoryLayer(memoryType: string, sourceType: string): MemoryLayer {
  if (memoryType === "core" || memoryType === "identity" || memoryType === "project_goal") return "core";
  if (memoryType.includes("experience") || memoryType.includes("task") || sourceType === "task_run") return "episodic";
  if (memoryType.includes("global")) return "global";
  return "archival";
}

function parseWorkflowMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function summarizeResult(result: string | null | undefined): string {
  const normalized = normalizeText(result);
  if (!normalized) return "No runtime result summary was captured.";
  const compact = normalized.replace(/\s+/g, " ");
  return compact.length > 700 ? `${compact.slice(0, 700)}...` : compact;
}

function getExistingMemoryId(
  db: DatabaseSync,
  tableName: "agent_memories" | "project_memories",
  sourceType: string,
  sourceId: string | null | undefined,
  memoryType: string,
  externalRef?: string | null,
): string | null {
  if (!sourceId && !externalRef) return null;
  const row = db
    .prepare(
      `
      SELECT id
      FROM ${tableName}
      WHERE source_type = ?
        AND memory_type = ?
        AND COALESCE(source_id, '') = COALESCE(?, '')
        AND COALESCE(external_ref, '') = COALESCE(?, '')
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    )
    .get(sourceType, memoryType, sourceId ?? null, externalRef ?? null) as { id?: string } | undefined;
  return row?.id ?? null;
}

function upsertProjectMemory(db: DatabaseSync, input: MemoryCreateInput): NativeMemoryRow {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const memoryType = normalizeText(input.memoryType) || "lesson";
  const sourceType = normalizeText(input.sourceType) || "manual";
  const memoryLayer = normalizeMemoryLayer(input.memoryLayer, defaultMemoryLayer(memoryType, sourceType));
  const id =
    getExistingMemoryId(db, "project_memories", sourceType, input.sourceId, memoryType, input.externalRef) ??
    randomUUID();
  const params: SQLInputValue[] = [
    id,
    input.projectId ?? null,
    input.agentId ?? null,
    memoryType,
    input.scopeType,
    normalizeText(input.title) || "Untitled memory",
    normalizeText(input.body) || "No memory body.",
    normalizeText(input.displaySummaryKo) || null,
    encodeTags(input.tags),
    clampNumber(input.confidence, 0.7, 0, 1),
    clampNumber(input.strength, 0.5, 0, 1),
    sourceType,
    normalizeText(input.sourceId) || null,
    normalizeText(input.externalRef) || null,
    memoryLayer,
    normalizeText(input.threadId) || null,
    normalizePromotionStatus(input.promotionStatus),
    encodeJson(input.episode),
    normalizeText(input.status) || "active",
    now,
    now,
  ];
  db.prepare(
    `
    INSERT INTO project_memories (
      id, project_id, agent_id, memory_type, scope_type, title, body, display_summary_ko,
      tags_json, confidence, strength, source_type, source_id, external_ref, memory_layer, thread_id,
      promotion_status, episode_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      agent_id = excluded.agent_id,
      memory_type = excluded.memory_type,
      scope_type = excluded.scope_type,
      title = excluded.title,
      body = excluded.body,
      display_summary_ko = excluded.display_summary_ko,
      tags_json = excluded.tags_json,
      confidence = excluded.confidence,
      strength = excluded.strength,
      memory_layer = excluded.memory_layer,
      thread_id = excluded.thread_id,
      promotion_status = excluded.promotion_status,
      episode_json = excluded.episode_json,
      status = excluded.status,
      updated_at = excluded.updated_at
  `,
  ).run(...params);
  return db.prepare("SELECT * FROM project_memories WHERE id = ?").get(id) as NativeMemoryRow;
}

function upsertAgentMemory(db: DatabaseSync, input: MemoryCreateInput): NativeMemoryRow {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const memoryType = normalizeText(input.memoryType) || "lesson";
  const sourceType = normalizeText(input.sourceType) || "manual";
  const memoryLayer = normalizeMemoryLayer(input.memoryLayer, defaultMemoryLayer(memoryType, sourceType));
  const id =
    getExistingMemoryId(db, "agent_memories", sourceType, input.sourceId, memoryType, input.externalRef) ??
    randomUUID();
  const params: SQLInputValue[] = [
    id,
    input.agentId ?? null,
    input.projectId ?? null,
    memoryType,
    input.scopeType,
    normalizeText(input.title) || "Untitled memory",
    normalizeText(input.body) || "No memory body.",
    normalizeText(input.displaySummaryKo) || null,
    encodeTags(input.tags),
    clampNumber(input.confidence, 0.7, 0, 1),
    clampNumber(input.strength, 0.5, 0, 1),
    sourceType,
    normalizeText(input.sourceId) || null,
    normalizeText(input.externalRef) || null,
    memoryLayer,
    normalizeText(input.threadId) || null,
    normalizePromotionStatus(input.promotionStatus),
    encodeJson(input.episode),
    normalizeText(input.status) || "active",
    now,
    now,
  ];
  db.prepare(
    `
    INSERT INTO agent_memories (
      id, agent_id, project_id, memory_type, scope_type, title, body, display_summary_ko,
      tags_json, confidence, strength, source_type, source_id, external_ref, memory_layer, thread_id,
      promotion_status, episode_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      agent_id = excluded.agent_id,
      project_id = excluded.project_id,
      memory_type = excluded.memory_type,
      scope_type = excluded.scope_type,
      title = excluded.title,
      body = excluded.body,
      display_summary_ko = excluded.display_summary_ko,
      tags_json = excluded.tags_json,
      confidence = excluded.confidence,
      strength = excluded.strength,
      memory_layer = excluded.memory_layer,
      thread_id = excluded.thread_id,
      promotion_status = excluded.promotion_status,
      episode_json = excluded.episode_json,
      status = excluded.status,
      updated_at = excluded.updated_at
  `,
  ).run(...params);
  return db.prepare("SELECT * FROM agent_memories WHERE id = ?").get(id) as NativeMemoryRow;
}

export function createAgentMemory(db: DatabaseSync, input: MemoryCreateInput): NativeMemoryRow {
  if (!input.agentId) throw new Error("agent_id_required");
  return upsertAgentMemory(db, { ...input, scopeType: input.scopeType || "agent" });
}

export function createProjectMemory(db: DatabaseSync, input: MemoryCreateInput): NativeMemoryRow {
  if (!input.projectId) throw new Error("project_id_required");
  return upsertProjectMemory(db, { ...input, scopeType: input.scopeType || "project" });
}

export function listAgentMemories(db: DatabaseSync, agentId: string, limit = 80): NativeMemoryRow[] {
  return db
    .prepare(
      `
      SELECT *
      FROM agent_memories
      WHERE agent_id = ?
        AND status = 'active'
      ORDER BY
        CASE memory_layer WHEN 'core' THEN 0 WHEN 'episodic' THEN 1 WHEN 'archival' THEN 2 ELSE 3 END,
        strength DESC,
        updated_at DESC
      LIMIT ?
    `,
    )
    .all(agentId, Math.max(1, Math.min(200, Math.trunc(limit)))) as NativeMemoryRow[];
}

export function listProjectMemories(db: DatabaseSync, projectId: string, limit = 120): NativeMemoryRow[] {
  return db
    .prepare(
      `
      SELECT *
      FROM project_memories
      WHERE project_id = ?
        AND status = 'active'
      ORDER BY
        CASE memory_layer WHEN 'core' THEN 0 WHEN 'episodic' THEN 1 WHEN 'archival' THEN 2 ELSE 3 END,
        strength DESC,
        updated_at DESC
      LIMIT ?
    `,
    )
    .all(projectId, Math.max(1, Math.min(300, Math.trunc(limit)))) as NativeMemoryRow[];
}

function escapeFtsQuery(query: string): string {
  return query
    .split(/\s+/g)
    .map((part) => part.replace(/["*]/g, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((part) => `"${part}"`)
    .join(" OR ");
}

function normalizeSearchTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((tag) => normalizeText(tag).toLowerCase().replace(/[%_"]/g, "")).filter(Boolean))].slice(
    0,
    12,
  );
}

function normalizeSearchTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function hasMemoryFts(db: DatabaseSync): boolean {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'memoryFtsAvailable'").get() as
      | { value?: string }
      | undefined;
    if (row?.value === "false") return false;
    db.prepare("SELECT 1 FROM project_memories_fts LIMIT 1").get();
    return true;
  } catch {
    return false;
  }
}

function updateRetrievalStats(db: DatabaseSync, rows: MemorySearchRow[], now: number): void {
  const byTable = rows.reduce(
    (acc, row) => {
      acc[row.source_table].push(row.id);
      return acc;
    },
    { agent_memories: [] as string[], project_memories: [] as string[] },
  );
  for (const [tableName, ids] of Object.entries(byTable) as Array<["agent_memories" | "project_memories", string[]]>) {
    for (const id of ids) {
      db.prepare(
        `UPDATE ${tableName}
         SET retrieval_count = retrieval_count + 1,
             last_retrieved_at = ?,
             last_used_at = ?,
             updated_at = updated_at
         WHERE id = ?`,
      ).run(now, now, id);
    }
  }
}

function layerPriority(layer: string | null | undefined): number {
  switch (layer) {
    case "core":
      return 4;
    case "episodic":
      return 3;
    case "archival":
      return 2;
    case "global":
      return 1;
    default:
      return 0;
  }
}

function memoryRecencyScore(row: NativeMemoryRow, now: number): number {
  const timestamp = Number(row.last_retrieved_at ?? row.last_used_at ?? row.updated_at ?? row.created_at ?? 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  const ageDays = Math.max(0, (now - timestamp) / 86_400_000);
  return Math.max(0, 40 - ageDays);
}

function tokenizeSemanticText(value: string | null | undefined): string[] {
  return [
    ...new Set(
      String(value ?? "")
        .toLowerCase()
        .match(/[a-z0-9가-힣_]{2,}/g) ?? [],
    ),
  ].slice(0, 48);
}

function tokenizeVectorText(value: string | null | undefined): string[] {
  return (
    String(value ?? "")
      .toLowerCase()
      .match(/[a-z0-9가-힣_]{2,}/g) ?? []
  ).slice(0, 256);
}

function stableHash(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function memoryEmbeddingText(row: Pick<NativeMemoryRow, "title" | "body" | "display_summary_ko" | "tags_json">): string {
  return [row.title, row.display_summary_ko ?? "", row.body, row.tags_json].filter(Boolean).join("\n");
}

function memoryEmbeddingHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function normalizeEmbeddingModel(value: unknown, fallback = LOCAL_MEMORY_EMBEDDING_MODEL): string {
  const normalized = normalizeText(value);
  return normalized || fallback;
}

function buildLocalMemoryEmbedding(text: string, dims = LOCAL_MEMORY_EMBEDDING_DIMS): number[] {
  const vector = Array.from({ length: dims }, () => 0);
  const tokens = tokenizeVectorText(text);
  for (const token of tokens) {
    const digest = stableHash(token);
    const index = digest.readUInt32BE(0) % dims;
    vector[index] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function embeddingBucketKeys(vector: number[], maxBuckets = 8): string[] {
  return vector
    .map((value, index) => ({ index, value, weight: Math.abs(value) }))
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .slice(0, maxBuckets)
    .map((item) => `${item.index}:${item.value >= 0 ? "p" : "n"}`);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

function ensureMemoryEmbeddingSchema(db: DatabaseSync): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS memory_embeddings (
  source_table TEXT NOT NULL CHECK(source_table IN ('agent_memories','project_memories')),
  memory_id TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  dims INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  provider_id TEXT,
  provider_type TEXT,
  embedding_status TEXT NOT NULL DEFAULT 'ready' CHECK(embedding_status IN ('ready','failed','fallback')),
  last_error TEXT,
  source_text_chars INTEGER NOT NULL DEFAULT 0,
  indexed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  PRIMARY KEY(source_table, memory_id, embedding_model)
);
CREATE TABLE IF NOT EXISTS memory_embedding_index (
  embedding_model TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  source_table TEXT NOT NULL CHECK(source_table IN ('agent_memories','project_memories')),
  memory_id TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch()*1000),
  PRIMARY KEY(embedding_model, bucket_key, source_table, memory_id)
);
CREATE TABLE IF NOT EXISTS memory_search_profiles (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('saved','recent')),
  owner_key TEXT NOT NULL DEFAULT 'local',
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  query TEXT NOT NULL DEFAULT '',
  filters_json TEXT NOT NULL DEFAULT '{}',
  last_used_at INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()*1000),
  updated_at INTEGER DEFAULT (unixepoch()*1000)
);
CREATE TABLE IF NOT EXISTS quality_metric_events (
  id TEXT PRIMARY KEY,
  metric_key TEXT NOT NULL,
  metric_family TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  subject_type TEXT,
  subject_id TEXT,
  value REAL NOT NULL DEFAULT 0,
  unit TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  dimensions_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT NOT NULL DEFAULT '',
  recorded_at INTEGER DEFAULT (unixepoch()*1000),
  created_at INTEGER DEFAULT (unixepoch()*1000),
  UNIQUE(metric_key, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_model
  ON memory_embeddings(embedding_model, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_status
  ON memory_embeddings(embedding_model, embedding_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_embedding_index_bucket
  ON memory_embedding_index(embedding_model, bucket_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_search_profiles_owner
  ON memory_search_profiles(owner_key, kind, project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_metric_events_key
  ON quality_metric_events(metric_key, project_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_metric_events_family
  ON quality_metric_events(metric_family, project_id, recorded_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_agent_memories_embeddings_delete AFTER DELETE ON agent_memories BEGIN
  DELETE FROM memory_embeddings WHERE source_table = 'agent_memories' AND memory_id = old.id;
  DELETE FROM memory_embedding_index WHERE source_table = 'agent_memories' AND memory_id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_project_memories_embeddings_delete AFTER DELETE ON project_memories BEGIN
  DELETE FROM memory_embeddings WHERE source_table = 'project_memories' AND memory_id = old.id;
  DELETE FROM memory_embedding_index WHERE source_table = 'project_memories' AND memory_id = old.id;
END;
`);
  for (const statement of [
    "ALTER TABLE memory_embeddings ADD COLUMN provider_id TEXT",
    "ALTER TABLE memory_embeddings ADD COLUMN provider_type TEXT",
    "ALTER TABLE memory_embeddings ADD COLUMN embedding_status TEXT NOT NULL DEFAULT 'ready'",
    "ALTER TABLE memory_embeddings ADD COLUMN last_error TEXT",
    "ALTER TABLE memory_embeddings ADD COLUMN source_text_chars INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE memory_embeddings ADD COLUMN indexed_at INTEGER",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // compatibility column already exists
    }
  }
}

function readVectorJson(value: string): number[] | null {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : null;
  } catch {
    return null;
  }
}

function upsertMemoryEmbeddingIndex(
  db: DatabaseSync,
  input: {
    sourceTable: "agent_memories" | "project_memories";
    memoryId: string;
    embeddingModel: string;
    vector: number[];
    now: number;
  },
): void {
  const bucketKeys = embeddingBucketKeys(input.vector);
  db.prepare("DELETE FROM memory_embedding_index WHERE source_table = ? AND memory_id = ? AND embedding_model = ?").run(
    input.sourceTable,
    input.memoryId,
    input.embeddingModel,
  );
  const stmt = db.prepare(
    `
    INSERT OR REPLACE INTO memory_embedding_index (
      embedding_model, bucket_key, source_table, memory_id, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `,
  );
  for (const bucketKey of bucketKeys) {
    stmt.run(input.embeddingModel, bucketKey, input.sourceTable, input.memoryId, input.now);
  }
}

function ensureMemoryEmbedding(db: DatabaseSync, row: MemorySearchRow, now: number): number[] {
  ensureMemoryEmbeddingSchema(db);
  const text = memoryEmbeddingText(row);
  const contentHash = memoryEmbeddingHash(text);
  const existing = db
    .prepare(
      `
      SELECT source_table, memory_id, embedding_model, dims, vector_json, content_hash, indexed_at, created_at, updated_at
      FROM memory_embeddings
      WHERE source_table = ? AND memory_id = ? AND embedding_model = ?
    `,
    )
    .get(row.source_table, row.id, LOCAL_MEMORY_EMBEDDING_MODEL) as MemoryEmbeddingRow | undefined;
  const existingVector =
    existing && existing.content_hash === contentHash && existing.dims === LOCAL_MEMORY_EMBEDDING_DIMS
      ? readVectorJson(existing.vector_json)
      : null;
  if (existingVector) {
    if (existing && !existing.indexed_at) {
      upsertMemoryEmbeddingIndex(db, {
        sourceTable: row.source_table,
        memoryId: row.id,
        embeddingModel: LOCAL_MEMORY_EMBEDDING_MODEL,
        vector: existingVector,
        now,
      });
      db.prepare(
        "UPDATE memory_embeddings SET indexed_at = ?, source_text_chars = ? WHERE source_table = ? AND memory_id = ? AND embedding_model = ?",
      ).run(now, text.length, row.source_table, row.id, LOCAL_MEMORY_EMBEDDING_MODEL);
    }
    return existingVector;
  }

  const vector = buildLocalMemoryEmbedding(text);
  db.prepare(
    `
    INSERT INTO memory_embeddings (
      source_table, memory_id, embedding_model, dims, vector_json, content_hash,
      provider_id, provider_type, embedding_status, last_error, source_text_chars, indexed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'ready', NULL, ?, ?, ?, ?)
    ON CONFLICT(source_table, memory_id, embedding_model) DO UPDATE SET
      dims = excluded.dims,
      vector_json = excluded.vector_json,
      content_hash = excluded.content_hash,
      provider_id = excluded.provider_id,
      provider_type = excluded.provider_type,
      embedding_status = excluded.embedding_status,
      last_error = excluded.last_error,
      source_text_chars = excluded.source_text_chars,
      indexed_at = excluded.indexed_at,
      updated_at = excluded.updated_at
  `,
  ).run(
    row.source_table,
    row.id,
    LOCAL_MEMORY_EMBEDDING_MODEL,
    LOCAL_MEMORY_EMBEDDING_DIMS,
    JSON.stringify(vector),
    contentHash,
    text.length,
    now,
    existing?.created_at ?? now,
    now,
  );
  upsertMemoryEmbeddingIndex(db, {
    sourceTable: row.source_table,
    memoryId: row.id,
    embeddingModel: LOCAL_MEMORY_EMBEDDING_MODEL,
    vector,
    now,
  });
  return vector;
}

function vectorQueryScore(db: DatabaseSync, row: MemorySearchRow, query: string, now: number): number {
  const queryVector = buildLocalMemoryEmbedding(query);
  const memoryVector = ensureMemoryEmbedding(db, row, now);
  const similarity = cosineSimilarity(queryVector, memoryVector);
  return Math.max(0, similarity) * 420;
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function defaultEmbeddingModelForProvider(type: ApiProviderType): string {
  if (type === "google") return "text-embedding-004";
  if (type === "ollama") return "nomic-embed-text";
  return "text-embedding-3-small";
}

function readEmbeddingProvider(
  db: DatabaseSync,
  input: { providerId?: string | null; model?: string | null },
): EmbeddingProviderContext | null {
  const providerId = normalizeText(input.providerId);
  const row = providerId
    ? (db.prepare("SELECT * FROM api_providers WHERE id = ? AND enabled = 1").get(providerId) as ApiProviderRow | undefined)
    : (db
        .prepare(
          `
          SELECT *
          FROM api_providers
          WHERE enabled = 1
            AND type IN ('openai','google','ollama','openrouter','together','groq','cerebras','custom')
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        `,
        )
        .get() as ApiProviderRow | undefined);
  if (!row) return null;
  if (validateApiProviderBaseUrl(row.type, row.base_url)) return null;
  let apiKey = "";
  if (row.api_key_enc) {
    try {
      apiKey = decryptSecret(row.api_key_enc);
    } catch {
      apiKey = "";
    }
  }
  const cachedModels = parseJsonArray(row.models_cache);
  const embeddingModel =
    normalizeText(input.model) ||
    cachedModels.find((model) => /embed|embedding/i.test(model)) ||
    defaultEmbeddingModelForProvider(row.type);
  return {
    providerId: row.id,
    providerType: row.type,
    baseUrl: normalizeApiProviderBaseUrl(row.base_url),
    apiKey,
    model: embeddingModel,
  };
}

function openAiCompatibleEmbeddingUrl(baseUrl: string): string {
  const normalized = baseUrl
    .replace(/\/+$/, "")
    .replace(/\/v1\/(chat\/completions|models|messages|embeddings)$/i, "/v1");
  return `${normalized}/embeddings`;
}

function googleEmbeddingUrl(provider: EmbeddingProviderContext): string {
  const base = provider.baseUrl.replace(/\/models\/.+$/i, "");
  const url = `${base}/models/${encodeURIComponent(provider.model)}:embedContent`;
  return provider.apiKey ? `${url}?key=${encodeURIComponent(provider.apiKey)}` : url;
}

function ollamaEmbeddingUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/v1(?:beta)?$/i, "").replace(/\/+$/, "")}/api/embeddings`;
}

function providerEmbeddingHeaders(provider: EmbeddingProviderContext): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", "content-type": "application/json" };
  if (!provider.apiKey || provider.providerType === "google" || provider.providerType === "ollama") return headers;
  headers.Authorization = `Bearer ${provider.apiKey}`;
  return headers;
}

function providerEmbeddingRequest(provider: EmbeddingProviderContext, text: string): { url: string; body: unknown } {
  if (provider.providerType === "google") {
    return {
      url: googleEmbeddingUrl(provider),
      body: { content: { parts: [{ text }] } },
    };
  }
  if (provider.providerType === "ollama") {
    return {
      url: ollamaEmbeddingUrl(provider.baseUrl),
      body: { model: provider.model, prompt: text },
    };
  }
  return {
    url: openAiCompatibleEmbeddingUrl(provider.baseUrl),
    body: { model: provider.model, input: text },
  };
}

function parseProviderEmbeddingVector(providerType: ApiProviderType, payload: unknown): number[] {
  const data = payload as {
    data?: Array<{ embedding?: unknown }>;
    embedding?: unknown;
    embeddings?: unknown;
  };
  const raw =
    providerType === "google"
      ? (data.embedding as { values?: unknown } | undefined)?.values
      : Array.isArray(data.data)
        ? data.data[0]?.embedding
        : (data.embedding ?? data.embeddings);
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

async function createProviderEmbedding(
  provider: EmbeddingProviderContext,
  text: string,
): Promise<{ ok: true; vector: number[] } | { ok: false; status: number; error: string; capacity429: boolean }> {
  try {
    const request = providerEmbeddingRequest(provider, text);
    const resp = await fetch(request.url, {
      method: "POST",
      headers: providerEmbeddingHeaders(provider),
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(12_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return {
        ok: false,
        status: resp.status,
        error: body.slice(0, 300) || `provider returned ${resp.status}`,
        capacity429: resp.status === 429 || /capacity|quota|rate.?limit|resource exhausted/i.test(body),
      };
    }
    const payload = await resp.json();
    const vector = parseProviderEmbeddingVector(provider.providerType, payload);
    if (vector.length === 0) return { ok: false, status: 502, error: "empty_embedding_vector", capacity429: false };
    return { ok: true, vector };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      capacity429: false,
    };
  }
}

function upsertProviderMemoryEmbedding(
  db: DatabaseSync,
  input: {
    row: MemorySearchRow;
    provider: EmbeddingProviderContext;
    vector: number[];
    status: "ready" | "failed" | "fallback";
    error?: string | null;
    now: number;
  },
): void {
  ensureMemoryEmbeddingSchema(db);
  const text = memoryEmbeddingText(input.row);
  const dims = input.vector.length || PROVIDER_EMBEDDING_DIMS_FALLBACK;
  const vectorJson = JSON.stringify(input.vector);
  db.prepare(
    `
    INSERT INTO memory_embeddings (
      source_table, memory_id, embedding_model, dims, vector_json, content_hash,
      provider_id, provider_type, embedding_status, last_error, source_text_chars, indexed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_table, memory_id, embedding_model) DO UPDATE SET
      dims = excluded.dims,
      vector_json = excluded.vector_json,
      content_hash = excluded.content_hash,
      provider_id = excluded.provider_id,
      provider_type = excluded.provider_type,
      embedding_status = excluded.embedding_status,
      last_error = excluded.last_error,
      source_text_chars = excluded.source_text_chars,
      indexed_at = excluded.indexed_at,
      updated_at = excluded.updated_at
  `,
  ).run(
    input.row.source_table,
    input.row.id,
    input.provider.model,
    dims,
    vectorJson,
    memoryEmbeddingHash(text),
    input.provider.providerId,
    input.provider.providerType,
    input.status,
    normalizeText(input.error) || null,
    text.length,
    input.status === "ready" ? input.now : null,
    input.now,
    input.now,
  );
  if (input.status === "ready" && input.vector.length > 0) {
    upsertMemoryEmbeddingIndex(db, {
      sourceTable: input.row.source_table,
      memoryId: input.row.id,
      embeddingModel: input.provider.model,
      vector: input.vector,
      now: input.now,
    });
  }
}

function semanticQueryScore(row: MemorySearchRow, query: string): number {
  const queryTokens = tokenizeSemanticText(query);
  if (queryTokens.length === 0) return 0;
  const titleTokens = new Set(tokenizeSemanticText(row.title));
  const bodyTokens = new Set(tokenizeSemanticText(row.body));
  const tagTokens = new Set(tokenizeSemanticText(row.tags_json));
  let score = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += 20;
    if (tagTokens.has(token)) score += 12;
    if (bodyTokens.has(token)) score += 6;
  }
  return Math.min(320, score * (1 + Math.min(0.5, queryTokens.length / 20)));
}

function memorySearchScore(
  db: DatabaseSync,
  row: MemorySearchRow,
  now: number,
  query: string,
  ranking: MemoryRankingMode,
): number {
  const ftsScore = Number.isFinite(Number(row.rank)) ? Math.max(0, 80 - Math.abs(Number(row.rank)) * 10) : 0;
  const usageScore = Math.min(30, Math.max(0, Number(row.retrieval_count ?? 0)) * 3);
  const semanticScore = ranking === "semantic" ? semanticQueryScore(row, query) : 0;
  const vectorScore = ranking === "vector" || ranking === "semantic_provider" ? vectorQueryScore(db, row, query, now) : 0;
  return (
    layerPriority(row.memory_layer) * 1000 +
    clampNumber(row.strength, 0.5, 0, 1) * 120 +
    clampNumber(row.confidence, 0.7, 0, 1) * 80 +
    memoryRecencyScore(row, now) +
    usageScore +
    ftsScore +
    semanticScore +
    vectorScore
  );
}

function rankMemoryRows(
  db: DatabaseSync,
  rows: MemorySearchRow[],
  limit: number,
  now: number,
  query: string,
  ranking: MemoryRankingMode,
): MemorySearchRow[] {
  const deduped = [...new Map(rows.map((row) => [`${row.source_table}:${row.id}`, row])).values()];
  return deduped
    .map((row) => ({ row, score: memorySearchScore(db, row, now, query, ranking) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(b.row.updated_at ?? 0) - Number(a.row.updated_at ?? 0);
    })
    .slice(0, limit)
    .map(({ row, score }) => ({ ...row, rank: score }));
}

export function searchMemories(
  db: DatabaseSync,
  input: MemorySearchInput,
): MemorySearchRow[] {
  const query = normalizeText(input.query);
  const limit = Math.max(1, Math.min(50, Math.trunc(Number(input.limit ?? 10))));
  const layer = normalizeText(input.layer);
  const scope = normalizeText(input.scope) || "local";
  const tags = normalizeSearchTags(input.tags);
  const createdFrom = normalizeSearchTimestamp(input.createdFrom);
  const createdTo = normalizeSearchTimestamp(input.createdTo);
  const updatedFrom = normalizeSearchTimestamp(input.updatedFrom);
  const updatedTo = normalizeSearchTimestamp(input.updatedTo);
  const promotionStatus = normalizeText(input.promotionStatus);
  const sourceType = normalizeText(input.sourceType);
  const rankingInput = normalizeText(input.ranking);
  const ranking: MemoryRankingMode =
    rankingInput === "vector" || rankingInput === "semantic_provider"
      ? rankingInput
      : rankingInput === "semantic"
        ? "semantic"
        : "default";
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const params: SQLInputValue[] = [];
  const clauses = ["m.status = 'active'"];
  const includeGlobal = scope === "global" || scope === "all";
  if (input.projectId && !includeGlobal) {
    clauses.push("m.project_id = ?");
    params.push(input.projectId);
  } else if (input.projectId && includeGlobal) {
    clauses.push("(m.project_id = ? OR m.promotion_status = 'promoted')");
    params.push(input.projectId);
  } else if (includeGlobal) {
    clauses.push("m.promotion_status = 'promoted'");
  }
  if (input.agentId) {
    clauses.push("(m.agent_id = ? OR m.agent_id IS NULL)");
    params.push(input.agentId);
  }
  if (input.threadId) {
    clauses.push("m.thread_id = ?");
    params.push(input.threadId);
  }
  if (layer && layer !== "all") {
    clauses.push("m.memory_layer = ?");
    params.push(normalizeMemoryLayer(layer));
  }
  if (promotionStatus && promotionStatus !== "all") {
    clauses.push("m.promotion_status = ?");
    params.push(promotionStatus);
  }
  if (sourceType && sourceType !== "all") {
    clauses.push("m.source_type = ?");
    params.push(sourceType);
  }
  for (const tag of tags) {
    clauses.push("LOWER(m.tags_json) LIKE ?");
    params.push(`%"${tag}"%`);
  }
  if (createdFrom !== null) {
    clauses.push("m.created_at >= ?");
    params.push(createdFrom);
  }
  if (createdTo !== null) {
    clauses.push("m.created_at <= ?");
    params.push(createdTo);
  }
  if (updatedFrom !== null) {
    clauses.push("m.updated_at >= ?");
    params.push(updatedFrom);
  }
  if (updatedTo !== null) {
    clauses.push("m.updated_at <= ?");
    params.push(updatedTo);
  }

  const searchAgentMemories = !input.projectId || input.agentId;
  const searchProjectMemories = !!input.projectId || includeGlobal;
  const rows: MemorySearchRow[] = [];
  if (hasMemoryFts(db) && query) {
    const ftsQuery = escapeFtsQuery(query);
    if (ftsQuery) {
      if (searchProjectMemories) {
        rows.push(
          ...((db
            .prepare(
              `
              SELECT m.*, 'project_memories' AS source_table, bm25(project_memories_fts) AS rank
              FROM project_memories_fts
              JOIN project_memories m ON m.id = project_memories_fts.memory_id
              WHERE project_memories_fts MATCH ?
                AND ${clauses.join(" AND ")}
              ORDER BY rank ASC, m.strength DESC, m.updated_at DESC
              LIMIT ?
            `,
            )
            .all(ftsQuery, ...params, limit) as MemorySearchRow[]) ?? []),
        );
      }
      if (searchAgentMemories) {
        rows.push(
          ...((db
            .prepare(
              `
              SELECT m.*, 'agent_memories' AS source_table, bm25(agent_memories_fts) AS rank
              FROM agent_memories_fts
              JOIN agent_memories m ON m.id = agent_memories_fts.memory_id
              WHERE agent_memories_fts MATCH ?
                AND ${clauses.join(" AND ")}
              ORDER BY rank ASC, m.strength DESC, m.updated_at DESC
              LIMIT ?
            `,
            )
            .all(ftsQuery, ...params, limit) as MemorySearchRow[]) ?? []),
        );
      }
    }
  }

  if (rows.length === 0) {
    const likeParams = query ? [`%${query}%`, `%${query}%`, `%${query}%`] : [];
    const likeClause = query ? "(m.title LIKE ? OR m.body LIKE ? OR m.tags_json LIKE ?)" : "1 = 1";
    if (searchProjectMemories) {
      rows.push(
        ...((db
          .prepare(
            `
            SELECT m.*, 'project_memories' AS source_table, 0 AS rank
            FROM project_memories m
            WHERE ${likeClause}
              AND ${clauses.join(" AND ")}
            ORDER BY m.strength DESC, m.updated_at DESC
            LIMIT ?
          `,
          )
          .all(...likeParams, ...params, limit) as MemorySearchRow[]) ?? []),
      );
    }
    if (searchAgentMemories) {
      rows.push(
        ...((db
          .prepare(
            `
            SELECT m.*, 'agent_memories' AS source_table, 0 AS rank
            FROM agent_memories m
            WHERE ${likeClause}
              AND ${clauses.join(" AND ")}
            ORDER BY m.strength DESC, m.updated_at DESC
            LIMIT ?
          `,
          )
          .all(...likeParams, ...params, limit) as MemorySearchRow[]) ?? []),
      );
    }
  }

  if ((ranking === "vector" || ranking === "semantic_provider") && query) {
    const candidateLimit = Math.max(100, limit * 10);
    if (searchProjectMemories) {
      rows.push(
        ...((db
          .prepare(
            `
            SELECT m.*, 'project_memories' AS source_table, 0 AS rank
            FROM project_memories m
            WHERE ${clauses.join(" AND ")}
            ORDER BY m.strength DESC, m.updated_at DESC
            LIMIT ?
          `,
          )
          .all(...params, candidateLimit) as MemorySearchRow[]) ?? []),
      );
    }
    if (searchAgentMemories) {
      rows.push(
        ...((db
          .prepare(
            `
            SELECT m.*, 'agent_memories' AS source_table, 0 AS rank
            FROM agent_memories m
            WHERE ${clauses.join(" AND ")}
            ORDER BY m.strength DESC, m.updated_at DESC
            LIMIT ?
          `,
          )
          .all(...params, candidateLimit) as MemorySearchRow[]) ?? []),
      );
    }
  }

  const ranked = rankMemoryRows(db, rows, limit, now, query, ranking);
  updateRetrievalStats(db, ranked, now);
  return ranked;
}

function loadMemorySearchRow(
  db: DatabaseSync,
  sourceTable: "agent_memories" | "project_memories",
  memoryId: string,
): MemorySearchRow | null {
  const row = db
    .prepare(`SELECT m.*, ? AS source_table, 0 AS rank FROM ${sourceTable} m WHERE m.id = ? AND m.status = 'active'`)
    .get(sourceTable, memoryId) as MemorySearchRow | undefined;
  return row ?? null;
}

function rowMatchesSearchInput(row: MemorySearchRow, input: MemorySearchInput): boolean {
  const projectId = normalizeText(input.projectId);
  const scope = normalizeText(input.scope) || "local";
  const includeGlobal = scope === "global" || scope === "all";
  if (projectId && !includeGlobal && row.project_id !== projectId) return false;
  if (projectId && includeGlobal && row.project_id !== projectId && row.promotion_status !== "promoted") return false;
  if (!projectId && includeGlobal && row.promotion_status !== "promoted") return false;
  const agentId = normalizeText(input.agentId);
  if (agentId && row.agent_id !== agentId && row.agent_id !== null) return false;
  const threadId = normalizeText(input.threadId);
  if (threadId && row.thread_id !== threadId) return false;
  const layer = normalizeText(input.layer);
  if (layer && layer !== "all" && row.memory_layer !== normalizeMemoryLayer(layer)) return false;
  const promotionStatus = normalizeText(input.promotionStatus);
  if (promotionStatus && promotionStatus !== "all" && row.promotion_status !== promotionStatus) return false;
  const sourceType = normalizeText(input.sourceType);
  if (sourceType && sourceType !== "all" && row.source_type !== sourceType) return false;
  for (const tag of normalizeSearchTags(input.tags)) {
    if (!row.tags_json.toLowerCase().includes(`"${tag}"`)) return false;
  }
  const createdFrom = normalizeSearchTimestamp(input.createdFrom);
  const createdTo = normalizeSearchTimestamp(input.createdTo);
  const updatedFrom = normalizeSearchTimestamp(input.updatedFrom);
  const updatedTo = normalizeSearchTimestamp(input.updatedTo);
  if (createdFrom !== null && Number(row.created_at) < createdFrom) return false;
  if (createdTo !== null && Number(row.created_at) > createdTo) return false;
  if (updatedFrom !== null && Number(row.updated_at) < updatedFrom) return false;
  if (updatedTo !== null && Number(row.updated_at) > updatedTo) return false;
  return true;
}

async function providerQueryVector(
  db: DatabaseSync,
  input: MemorySearchInput,
): Promise<{ provider: EmbeddingProviderContext; vector: number[] } | { error: string; capacity429: boolean }> {
  const provider = readEmbeddingProvider(db, { providerId: input.providerId, model: input.model });
  if (!provider) return { error: "embedding_provider_not_configured", capacity429: false };
  const result = await createProviderEmbedding(provider, normalizeText(input.query));
  if (!result.ok) return { error: result.error, capacity429: result.capacity429 };
  return { provider, vector: result.vector };
}

export async function searchMemoriesWithProviderRanking(
  db: DatabaseSync,
  input: MemorySearchInput,
): Promise<MemorySearchRow[]> {
  const rankingInput = normalizeText(input.ranking);
  if (rankingInput !== "semantic_provider") return searchMemories(db, input);
  const query = normalizeText(input.query);
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const limit = Math.max(1, Math.min(50, Math.trunc(Number(input.limit ?? 10))));
  if (!query) return searchMemories(db, { ...input, ranking: "vector" });

  ensureMemoryEmbeddingSchema(db);
  const queryEmbedding = await providerQueryVector(db, input);
  if ("error" in queryEmbedding) {
    recordQualityMetricEvent(db, {
      metricKey: "memory.search.provider_fallback",
      metricFamily: "memory",
      projectId: input.projectId,
      value: 1,
      unit: "count",
      status: queryEmbedding.capacity429 ? "capacity_limited" : "fallback",
      sourceType: "memory_search",
      sourceId: `${normalizeText(input.projectId) || "global"}:${memoryEmbeddingHash(query).slice(0, 16)}:${now}`,
      dimensions: { reason: queryEmbedding.error },
      now,
    });
    return searchMemories(db, { ...input, ranking: "vector", now });
  }

  const bucketKeys = embeddingBucketKeys(queryEmbedding.vector);
  const indexedRows =
    bucketKeys.length > 0
      ? (db
          .prepare(
            `
            SELECT DISTINCT source_table, memory_id
            FROM memory_embedding_index
            WHERE embedding_model = ?
              AND bucket_key IN (${bucketKeys.map(() => "?").join(",")})
            LIMIT 400
          `,
          )
          .all(queryEmbedding.provider.model, ...bucketKeys) as Array<{
          source_table: "agent_memories" | "project_memories";
          memory_id: string;
        }>)
      : [];
  const scored = indexedRows
    .map((candidate) => {
      const row = loadMemorySearchRow(db, candidate.source_table, candidate.memory_id);
      if (!row || !rowMatchesSearchInput(row, input)) return null;
      const embedding = db
        .prepare(
          `
          SELECT vector_json
          FROM memory_embeddings
          WHERE source_table = ? AND memory_id = ? AND embedding_model = ? AND embedding_status = 'ready'
        `,
        )
        .get(candidate.source_table, candidate.memory_id, queryEmbedding.provider.model) as
        | { vector_json: string }
        | undefined;
      const vector = embedding ? readVectorJson(embedding.vector_json) : null;
      if (!vector || vector.length === 0) return null;
      const score =
        Math.max(0, cosineSimilarity(queryEmbedding.vector, vector)) * 900 +
        semanticQueryScore(row, query) +
        layerPriority(row.memory_layer) * 50;
      return { row, score };
    })
    .filter((item): item is { row: MemorySearchRow; score: number } => Boolean(item));

  if (scored.length === 0) {
    recordQualityMetricEvent(db, {
      metricKey: "memory.search.provider_fallback",
      metricFamily: "memory",
      projectId: input.projectId,
      value: 1,
      unit: "count",
      status: "fallback",
      sourceType: "memory_search",
      sourceId: `${normalizeText(input.projectId) || "global"}:${memoryEmbeddingHash(query).slice(0, 16)}:${now}`,
      dimensions: { reason: "ann_candidate_miss", model: queryEmbedding.provider.model },
      now,
    });
    return searchMemories(db, { ...input, ranking: "vector", now });
  }

  const ranked = scored
    .sort((a, b) => b.score - a.score || Number(b.row.updated_at ?? 0) - Number(a.row.updated_at ?? 0))
    .slice(0, limit)
    .map(({ row, score }) => ({ ...row, rank: score }));
  updateRetrievalStats(db, ranked, now);
  return ranked;
}

export async function backfillMemoryEmbeddings(
  db: DatabaseSync,
  input: {
    projectId?: string | null;
    agentId?: string | null;
    providerId?: string | null;
    model?: string | null;
    limit?: number | null;
    force?: boolean | null;
    now?: number | null;
  },
): Promise<{ ok: true; processed: number; embedded: number; indexed: number; skipped: number; failed: number; fallback_used: boolean }> {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const provider = readEmbeddingProvider(db, { providerId: input.providerId, model: input.model });
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(input.limit ?? 50))));
  const projectId = normalizeText(input.projectId);
  const agentId = normalizeText(input.agentId);
  const clauses = ["m.status = 'active'"];
  const params: SQLInputValue[] = [];
  if (projectId) {
    clauses.push("m.project_id = ?");
    params.push(projectId);
  }
  if (agentId) {
    clauses.push("(m.agent_id = ? OR m.agent_id IS NULL)");
    params.push(agentId);
  }
  const sourceRows: MemorySearchRow[] = [];
  sourceRows.push(
    ...(db
      .prepare(
        `
        SELECT m.*, 'project_memories' AS source_table, 0 AS rank
        FROM project_memories m
        WHERE ${clauses.join(" AND ")}
        ORDER BY m.updated_at DESC
        LIMIT ?
      `,
      )
      .all(...params, limit) as MemorySearchRow[]),
  );
  sourceRows.push(
    ...(db
      .prepare(
        `
        SELECT m.*, 'agent_memories' AS source_table, 0 AS rank
        FROM agent_memories m
        WHERE ${clauses.join(" AND ")}
        ORDER BY m.updated_at DESC
        LIMIT ?
      `,
      )
      .all(...params, limit) as MemorySearchRow[]),
  );

  let embedded = 0;
  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  let fallbackUsed = false;
  const rows = [...new Map(sourceRows.slice(0, limit).map((row) => [`${row.source_table}:${row.id}`, row])).values()];
  for (const row of rows) {
    if (!provider) {
      ensureMemoryEmbedding(db, row, now);
      fallbackUsed = true;
      skipped += 1;
      continue;
    }
    if (!input.force) {
      const existing = db
        .prepare(
          `
          SELECT memory_id
          FROM memory_embeddings
          WHERE source_table = ? AND memory_id = ? AND embedding_model = ? AND embedding_status = 'ready'
        `,
        )
        .get(row.source_table, row.id, provider.model);
      if (existing) {
        skipped += 1;
        continue;
      }
    }
    const result = await createProviderEmbedding(provider, memoryEmbeddingText(row));
    if (result.ok) {
      upsertProviderMemoryEmbedding(db, { row, provider, vector: result.vector, status: "ready", now });
      embedded += 1;
      indexed += embeddingBucketKeys(result.vector).length > 0 ? 1 : 0;
    } else {
      upsertProviderMemoryEmbedding(db, { row, provider, vector: [], status: "failed", error: result.error, now });
      ensureMemoryEmbedding(db, row, now);
      fallbackUsed = true;
      failed += 1;
      recordQualityMetricEvent(db, {
        metricKey: result.capacity429 ? "provider.capacity_429" : "memory.embedding.backfill_failed",
        metricFamily: result.capacity429 ? "provider" : "memory",
        projectId: row.project_id,
        value: 1,
        unit: "count",
        status: result.capacity429 ? "capacity_limited" : "failed",
        sourceType: "memory_embedding",
        sourceId: `${row.source_table}:${row.id}:${provider.model}`,
        dimensions: { provider_id: provider.providerId, provider_type: provider.providerType, model: provider.model },
        evidence: { error: result.error },
        now,
      });
    }
  }
  const total = Math.max(1, rows.length);
  recordQualityMetricEvent(db, {
    metricKey: "memory.embedding.coverage",
    metricFamily: "memory",
    projectId: projectId || null,
    value: embedded / total,
    unit: "ratio",
    status: failed > 0 ? "partial" : "recorded",
    sourceType: "memory_embedding_backfill",
    sourceId: `${projectId || "all"}:${agentId || "all"}:${now}`,
    dimensions: { embedded, failed, skipped, model: provider?.model ?? LOCAL_MEMORY_EMBEDDING_MODEL },
    now,
  });
  return { ok: true, processed: rows.length, embedded, indexed, skipped, failed, fallback_used: fallbackUsed };
}

export function getMemoryEmbeddingStatus(
  db: DatabaseSync,
  input: { projectId?: string | null } = {},
): {
  ok: true;
  total_memories: number;
  ready_embeddings: number;
  failed_embeddings: number;
  indexed_embeddings: number;
  coverage_ratio: number;
  active_model: string | null;
  active_provider_id: string | null;
} {
  ensureMemoryEmbeddingSchema(db);
  const projectId = normalizeText(input.projectId);
  const projectClause = projectId ? "WHERE project_id = ?" : "";
  const params: SQLInputValue[] = projectId ? [projectId] : [];
  const projectCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM project_memories ${projectClause}`).get(...params) as { cnt: number }).cnt;
  const agentCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM agent_memories ${projectClause}`).get(...params) as { cnt: number }).cnt;
  const total = projectCount + agentCount;
  const ready = (db.prepare("SELECT COUNT(*) AS cnt FROM memory_embeddings WHERE embedding_status = 'ready'").get() as { cnt: number }).cnt;
  const failed = (db.prepare("SELECT COUNT(*) AS cnt FROM memory_embeddings WHERE embedding_status = 'failed'").get() as { cnt: number }).cnt;
  const indexed = (db.prepare("SELECT COUNT(DISTINCT source_table || ':' || memory_id || ':' || embedding_model) AS cnt FROM memory_embedding_index").get() as { cnt: number }).cnt;
  const latest = db
    .prepare("SELECT embedding_model, provider_id FROM memory_embeddings WHERE provider_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1")
    .get() as { embedding_model: string; provider_id: string | null } | undefined;
  return {
    ok: true,
    total_memories: total,
    ready_embeddings: ready,
    failed_embeddings: failed,
    indexed_embeddings: indexed,
    coverage_ratio: total > 0 ? Math.min(1, ready / total) : 0,
    active_model: latest?.embedding_model ?? null,
    active_provider_id: latest?.provider_id ?? null,
  };
}

export function buildSearchArchivalMemoryToolBlock(input: {
  projectId?: string | null;
  agentId?: string | null;
  threadId?: string | null;
}): string {
  return [
    "[HTTP Tool: search_archival_memory]",
    "name=search_archival_memory",
    "method=GET",
    "endpoint=/api/memory/search",
    "Purpose: retrieve additional project-scoped archival, episodic, or core memory only when the provided context is insufficient.",
    "Query params:",
    "- q: required search text from the active task question or failure symptom.",
    "- project_id: active project id; keep this set for project isolation.",
    "- agent_id: optional active agent id for agent-local experience.",
    "- thread_id: optional task/session id when looking for continuation memory.",
    "- layer: core, episodic, archival, global, or all. Use all only when you need mixed local layers.",
    "- scope: local by default. Use global only for approved promoted summaries, not raw cross-project memories.",
    "- tags: optional comma-separated canonical tags; all provided tags must match.",
    "- created_from/created_to: optional epoch-millisecond created_at range.",
    "- updated_from/updated_to: optional epoch-millisecond updated_at range.",
    "- promotion_status: optional local, candidate, promoted, rejected, or all.",
    "- source_type: optional manual, task_run, beads, or all.",
    "- ranking: optional default, semantic, vector, or semantic_provider. Use semantic_provider when provider-backed embeddings are indexed; it falls back to vector when unavailable.",
    "- limit: 1-20 for prompt use.",
    input.projectId ? `Default project_id=${input.projectId}` : "",
    input.agentId ? `Default agent_id=${input.agentId}` : "",
    input.threadId ? `Default thread_id=${input.threadId}` : "",
    "Safety: never import raw memory from another project. Cross-project knowledge is allowed only when it appears as an approved global lesson summary.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function listMemoryOutbox(db: DatabaseSync, projectId: string, limit = 20): MemoryOutboxRow[] {
  return db
    .prepare(
      `
      SELECT *
      FROM memory_outbox
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    )
    .all(projectId, Math.max(1, Math.min(100, Math.trunc(limit)))) as MemoryOutboxRow[];
}

export function listMemoryQualityEvents(db: DatabaseSync, projectId: string, limit = 20): MemoryQualityEventRow[] {
  return db
    .prepare(
      `
      SELECT *
      FROM memory_quality_events
      WHERE project_id = ? OR project_id IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `,
    )
    .all(projectId, Math.max(1, Math.min(100, Math.trunc(limit)))) as MemoryQualityEventRow[];
}

export function recordMemoryQualityEvent(
  db: DatabaseSync,
  input: {
    projectId?: string | null;
    eventType: string;
    title: string;
    summary: string;
    evidence?: Record<string, unknown> | null;
    status?: string | null;
    now?: number | null;
  },
): MemoryQualityEventRow {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO memory_quality_events (
      id, project_id, event_type, title, summary, evidence_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    normalizeText(input.projectId) || null,
    normalizeText(input.eventType) || "memory_event",
    normalizeText(input.title) || "Memory quality event",
    normalizeText(input.summary) || "Memory quality evidence recorded.",
    JSON.stringify(input.evidence ?? {}),
    normalizeText(input.status) || "recorded",
    now,
  );
  return db.prepare("SELECT * FROM memory_quality_events WHERE id = ?").get(id) as MemoryQualityEventRow;
}

function encodePlainJson(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

export function listMemorySearchProfiles(
  db: DatabaseSync,
  input: {
    kind?: MemorySearchProfileKind | "all" | string | null;
    ownerKey?: string | null;
    projectId?: string | null;
    limit?: number | null;
  } = {},
): MemorySearchProfileRow[] {
  ensureMemoryEmbeddingSchema(db);
  const kind = normalizeText(input.kind);
  const ownerKey = normalizeText(input.ownerKey) || DEFAULT_EMBEDDING_OWNER_KEY;
  const projectId = normalizeText(input.projectId);
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(input.limit ?? 20))));
  const clauses = ["owner_key = ?"];
  const params: SQLInputValue[] = [ownerKey];
  if (kind === "saved" || kind === "recent") {
    clauses.push("kind = ?");
    params.push(kind);
  }
  if (projectId) {
    clauses.push("(project_id = ? OR project_id IS NULL)");
    params.push(projectId);
  }
  params.push(limit);
  return db
    .prepare(
      `
      SELECT *
      FROM memory_search_profiles
      WHERE ${clauses.join(" AND ")}
      ORDER BY last_used_at DESC, updated_at DESC
      LIMIT ?
    `,
    )
    .all(...params) as MemorySearchProfileRow[];
}

export function upsertMemorySearchProfile(
  db: DatabaseSync,
  input: {
    id?: string | null;
    kind: MemorySearchProfileKind | string;
    ownerKey?: string | null;
    projectId?: string | null;
    label?: string | null;
    query?: string | null;
    filters?: Record<string, unknown> | null;
    now?: number | null;
  },
): MemorySearchProfileRow {
  ensureMemoryEmbeddingSchema(db);
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const kind = normalizeText(input.kind) === "recent" ? "recent" : "saved";
  const ownerKey = normalizeText(input.ownerKey) || DEFAULT_EMBEDDING_OWNER_KEY;
  const projectId = normalizeText(input.projectId) || null;
  const query = normalizeText(input.query);
  const filtersJson = encodePlainJson(input.filters ?? {});
  const label = normalizeText(input.label) || (query ? query.slice(0, 80) : kind === "recent" ? "Recent search" : "Saved search");
  const existing =
    normalizeText(input.id)
      ? (db
          .prepare("SELECT * FROM memory_search_profiles WHERE id = ? AND owner_key = ?")
          .get(normalizeText(input.id), ownerKey) as MemorySearchProfileRow | undefined)
      : kind === "recent"
        ? (db
            .prepare(
              `
              SELECT *
              FROM memory_search_profiles
              WHERE kind = 'recent'
                AND owner_key = ?
                AND COALESCE(project_id, '') = COALESCE(?, '')
                AND query = ?
                AND filters_json = ?
              ORDER BY updated_at DESC
              LIMIT 1
            `,
            )
            .get(ownerKey, projectId, query, filtersJson) as MemorySearchProfileRow | undefined)
        : undefined;
  const requestedId = normalizeText(input.id);
  const id = existing?.id ?? (requestedId || randomUUID());
  const useCount = kind === "recent" ? Number(existing?.use_count ?? 0) + 1 : Number(existing?.use_count ?? 0);
  db.prepare(
    `
    INSERT INTO memory_search_profiles (
      id, kind, owner_key, project_id, label, query, filters_json,
      last_used_at, use_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      owner_key = excluded.owner_key,
      project_id = excluded.project_id,
      label = excluded.label,
      query = excluded.query,
      filters_json = excluded.filters_json,
      last_used_at = excluded.last_used_at,
      use_count = excluded.use_count,
      updated_at = excluded.updated_at
  `,
  ).run(
    id,
    kind,
    ownerKey,
    projectId,
    label,
    query,
    filtersJson,
    now,
    useCount,
    existing?.created_at ?? now,
    now,
  );
  return db.prepare("SELECT * FROM memory_search_profiles WHERE id = ?").get(id) as MemorySearchProfileRow;
}

export function deleteMemorySearchProfile(
  db: DatabaseSync,
  input: { id: string; ownerKey?: string | null },
): boolean {
  ensureMemoryEmbeddingSchema(db);
  const ownerKey = normalizeText(input.ownerKey) || DEFAULT_EMBEDDING_OWNER_KEY;
  const result = db
    .prepare("DELETE FROM memory_search_profiles WHERE id = ? AND owner_key = ?")
    .run(normalizeText(input.id), ownerKey);
  return result.changes > 0;
}

export function recordQualityMetricEvent(
  db: DatabaseSync,
  input: {
    metricKey: string;
    metricFamily: string;
    projectId?: string | null;
    subjectType?: string | null;
    subjectId?: string | null;
    value?: number | null;
    unit?: string | null;
    status?: string | null;
    dimensions?: Record<string, unknown> | null;
    evidence?: Record<string, unknown> | null;
    sourceType?: string | null;
    sourceId?: string | null;
    recordedAt?: number | null;
    now?: number | null;
  },
): QualityMetricEventRow {
  ensureMemoryEmbeddingSchema(db);
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const recordedAt = Number.isFinite(Number(input.recordedAt)) ? Number(input.recordedAt) : now;
  const metricKey = normalizeText(input.metricKey) || "quality.metric";
  const sourceType = normalizeText(input.sourceType) || "manual";
  const sourceId = normalizeText(input.sourceId) || randomUUID();
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO quality_metric_events (
      id, metric_key, metric_family, project_id, subject_type, subject_id,
      value, unit, status, dimensions_json, evidence_json, source_type,
      source_id, recorded_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metric_key, source_type, source_id) DO UPDATE SET
      metric_family = excluded.metric_family,
      project_id = excluded.project_id,
      subject_type = excluded.subject_type,
      subject_id = excluded.subject_id,
      value = excluded.value,
      unit = excluded.unit,
      status = excluded.status,
      dimensions_json = excluded.dimensions_json,
      evidence_json = excluded.evidence_json,
      recorded_at = excluded.recorded_at
  `,
  ).run(
    id,
    metricKey,
    normalizeText(input.metricFamily) || "general",
    normalizeText(input.projectId) || null,
    normalizeText(input.subjectType) || null,
    normalizeText(input.subjectId) || null,
    clampNumber(input.value, 0, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
    normalizeText(input.unit) || null,
    normalizeText(input.status) || "recorded",
    encodePlainJson(input.dimensions),
    encodePlainJson(input.evidence),
    sourceType,
    sourceId,
    recordedAt,
    now,
  );
  return db
    .prepare("SELECT * FROM quality_metric_events WHERE metric_key = ? AND source_type = ? AND source_id = ?")
    .get(metricKey, sourceType, sourceId) as QualityMetricEventRow;
}

export function listQualityMetricEvents(
  db: DatabaseSync,
  input: {
    metricKey?: string | null;
    metricFamily?: string | null;
    projectId?: string | null;
    from?: number | null;
    to?: number | null;
    limit?: number | null;
  } = {},
): QualityMetricEventRow[] {
  ensureMemoryEmbeddingSchema(db);
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  const metricKey = normalizeText(input.metricKey);
  const metricFamily = normalizeText(input.metricFamily);
  const projectId = normalizeText(input.projectId);
  const from = normalizeSearchTimestamp(input.from);
  const to = normalizeSearchTimestamp(input.to);
  if (metricKey) {
    clauses.push("metric_key = ?");
    params.push(metricKey);
  }
  if (metricFamily) {
    clauses.push("metric_family = ?");
    params.push(metricFamily);
  }
  if (projectId) {
    clauses.push("project_id = ?");
    params.push(projectId);
  }
  if (from !== null) {
    clauses.push("recorded_at >= ?");
    params.push(from);
  }
  if (to !== null) {
    clauses.push("recorded_at <= ?");
    params.push(to);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(input.limit ?? 100))));
  return db
    .prepare(
      `
      SELECT *
      FROM quality_metric_events
      ${where}
      ORDER BY recorded_at DESC, created_at DESC
      LIMIT ?
    `,
    )
    .all(...params, limit) as QualityMetricEventRow[];
}

export function summarizeQualityMetricEvents(
  db: DatabaseSync,
  input: {
    metricFamily?: string | null;
    projectId?: string | null;
    from?: number | null;
    to?: number | null;
    bucket?: "day" | "hour" | "total" | string | null;
    limit?: number | null;
  } = {},
): QualityMetricSummaryRow[] {
  const bucketMode = normalizeText(input.bucket) || "day";
  const rows = listQualityMetricEvents(db, { ...input, limit: input.limit ?? 500 });
  const groups = new Map<string, QualityMetricSummaryRow>();
  for (const row of rows) {
    const date = new Date(Number(row.recorded_at ?? 0));
    const bucket =
      bucketMode === "hour"
        ? date.toISOString().slice(0, 13)
        : bucketMode === "total"
          ? "total"
          : date.toISOString().slice(0, 10);
    const key = `${row.metric_key}:${bucket}`;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        metric_key: row.metric_key,
        metric_family: row.metric_family,
        bucket,
        count: 1,
        sum_value: Number(row.value ?? 0),
        avg_value: Number(row.value ?? 0),
        latest_value: Number(row.value ?? 0),
        latest_status: row.status,
        latest_recorded_at: row.recorded_at,
      });
      continue;
    }
    current.count += 1;
    current.sum_value += Number(row.value ?? 0);
    current.avg_value = current.sum_value / current.count;
    if (Number(row.recorded_at) > current.latest_recorded_at) {
      current.latest_value = Number(row.value ?? 0);
      current.latest_status = row.status;
      current.latest_recorded_at = row.recorded_at;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.latest_recorded_at - a.latest_recorded_at || a.metric_key.localeCompare(b.metric_key))
    .slice(0, Math.max(1, Math.min(200, Math.trunc(Number(input.limit ?? 100)))));
}

export function listDueMemoryOutbox(
  db: DatabaseSync,
  input: { projectId?: string | null; target?: string | null; limit?: number | null; now?: number | null } = {},
): MemoryOutboxRow[] {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(input.limit ?? 20))));
  const clauses = ["status IN ('pending', 'failed')", "(next_retry_at IS NULL OR next_retry_at <= ?)"];
  const params: SQLInputValue[] = [now];
  const target = normalizeText(input.target);
  const projectId = normalizeText(input.projectId);
  if (target) {
    clauses.push("target = ?");
    params.push(target);
  }
  if (projectId) {
    clauses.push("project_id = ?");
    params.push(projectId);
  }
  params.push(limit);
  return db
    .prepare(
      `
      SELECT *
      FROM memory_outbox
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at ASC
      LIMIT ?
    `,
    )
    .all(...params) as MemoryOutboxRow[];
}

export function enqueueMemoryOutbox(
  db: DatabaseSync,
  input: {
    projectId: string;
    target: string;
    operation: string;
    payload: Record<string, unknown>;
    externalRef?: string | null;
    now?: number | null;
  },
): MemoryOutboxRow {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO memory_outbox (
      id, project_id, target, operation, payload_json, status, attempt_count, external_ref, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
  `,
  ).run(
    id,
    input.projectId,
    normalizeText(input.target) || "beads",
    normalizeText(input.operation) || "create",
    JSON.stringify(input.payload ?? {}),
    normalizeText(input.externalRef) || null,
    now,
    now,
  );
  return db.prepare("SELECT * FROM memory_outbox WHERE id = ?").get(id) as MemoryOutboxRow;
}

export function markMemoryOutboxRunning(
  db: DatabaseSync,
  input: { id: string; now?: number | null },
): MemoryOutboxRow | null {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  db.prepare(
    `
    UPDATE memory_outbox
    SET status = 'running',
        attempt_count = attempt_count + 1,
        last_error = NULL,
        updated_at = ?
    WHERE id = ?
      AND status IN ('pending', 'failed')
      AND (next_retry_at IS NULL OR next_retry_at <= ?)
  `,
  ).run(now, input.id, now);
  return (db.prepare("SELECT * FROM memory_outbox WHERE id = ?").get(input.id) as MemoryOutboxRow | undefined) ?? null;
}

export function markMemoryOutboxSucceeded(
  db: DatabaseSync,
  input: { id: string; externalRef?: string | null; now?: number | null },
): MemoryOutboxRow | null {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  db.prepare(
    `
    UPDATE memory_outbox
    SET status = 'succeeded',
        last_error = NULL,
        next_retry_at = NULL,
        external_ref = COALESCE(?, external_ref),
        updated_at = ?
    WHERE id = ?
  `,
  ).run(normalizeText(input.externalRef) || null, now, input.id);
  return (db.prepare("SELECT * FROM memory_outbox WHERE id = ?").get(input.id) as MemoryOutboxRow | undefined) ?? null;
}

export function markMemoryOutboxFailed(
  db: DatabaseSync,
  input: { id: string; error: string; nextRetryAt?: number | null; now?: number | null },
): MemoryOutboxRow | null {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const nextRetryAt = Number.isFinite(Number(input.nextRetryAt)) ? Number(input.nextRetryAt) : null;
  db.prepare(
    `
    UPDATE memory_outbox
    SET status = 'failed',
        last_error = ?,
        next_retry_at = ?,
        updated_at = ?
    WHERE id = ?
  `,
  ).run(normalizeText(input.error).slice(0, 1000) || "unknown_error", nextRetryAt, now, input.id);
  return (db.prepare("SELECT * FROM memory_outbox WHERE id = ?").get(input.id) as MemoryOutboxRow | undefined) ?? null;
}

type SkillPromotionUsageEvidence = {
  project_id: string | null;
  agent_id: string | null;
  task_id: string | null;
  confidence: number;
  notes: string | null;
  created_at: number;
};

type SkillPromotionTaskEvidence = {
  task_id: string;
  project_id: string | null;
  title: string;
  status: string;
  result_summary: string;
};

type SkillPromotionMemoryRefEvidence = {
  source_table: "agent_memories" | "project_memories";
  id: string;
  project_id: string | null;
  agent_id: string | null;
  memory_type: string;
  memory_layer: string;
  title: string;
  source_id: string | null;
};

function collectSkillPromotionEvidence(
  db: DatabaseSync,
  skillId: string,
): {
  skill_usage: SkillPromotionUsageEvidence[];
  task_results: SkillPromotionTaskEvidence[];
  memory_refs: SkillPromotionMemoryRefEvidence[];
} {
  const usageRows = db
    .prepare(
      `
      SELECT project_id, agent_id, task_id, confidence, notes, created_at
      FROM skill_usage_events
      WHERE skill_id = ?
        AND outcome = 'success'
        AND project_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 12
    `,
    )
    .all(skillId) as Array<{
    project_id: string | null;
    agent_id: string | null;
    task_id: string | null;
    confidence: number;
    notes: string | null;
    created_at: number;
  }>;
  const taskIds = [...new Set(usageRows.map((row) => normalizeText(row.task_id)).filter(Boolean))].slice(0, 12);
  const taskResults: SkillPromotionTaskEvidence[] = [];
  const memoryRefs: SkillPromotionMemoryRefEvidence[] = [];

  for (const taskId of taskIds) {
    const taskRow = db
      .prepare(
        `
        SELECT id, project_id, title, status, result
        FROM tasks
        WHERE id = ?
        LIMIT 1
      `,
      )
      .get(taskId) as
      | { id: string; project_id: string | null; title: string; status: string; result: string | null }
      | undefined;
    if (taskRow) {
      taskResults.push({
        task_id: taskRow.id,
        project_id: taskRow.project_id,
        title: taskRow.title,
        status: taskRow.status,
        result_summary: summarizeResult(taskRow.result).slice(0, 360),
      });
    }
    for (const tableName of ["project_memories", "agent_memories"] as const) {
      const rows = db
        .prepare(
          `
          SELECT id, project_id, agent_id, memory_type, memory_layer, title, source_id
          FROM ${tableName}
          WHERE source_type = 'task_run'
            AND source_id = ?
          ORDER BY strength DESC, updated_at DESC
          LIMIT 4
        `,
        )
        .all(taskId) as Array<{
        id: string;
        project_id: string | null;
        agent_id: string | null;
        memory_type: string;
        memory_layer: string;
        title: string;
        source_id: string | null;
      }>;
      memoryRefs.push(...rows.map((row) => ({ ...row, source_table: tableName })));
    }
  }

  return {
    skill_usage: usageRows.map((row) => ({
      project_id: row.project_id,
      agent_id: row.agent_id,
      task_id: row.task_id,
      confidence: clampNumber(row.confidence, 0.7, 0, 1),
      notes: row.notes,
      created_at: row.created_at,
    })),
    task_results: taskResults.slice(0, 8),
    memory_refs: memoryRefs.slice(0, 12),
  };
}

export function scanMemoryPromotionCandidates(db: DatabaseSync, now = Date.now()): MemoryPromotionCandidateRow[] {
  const rows = db
    .prepare(
      `
      SELECT
        skill_id,
        COUNT(*) AS evidence_count,
        COUNT(DISTINCT project_id) AS project_count,
        GROUP_CONCAT(DISTINCT project_id) AS projects,
        MAX(created_at) AS latest_at
      FROM skill_usage_events
      WHERE outcome = 'success'
        AND project_id IS NOT NULL
      GROUP BY skill_id
      HAVING COUNT(DISTINCT project_id) >= 3
      ORDER BY project_count DESC, evidence_count DESC
      LIMIT 50
    `,
    )
    .all() as Array<{
    skill_id: string;
    evidence_count: number;
    project_count: number;
    projects: string | null;
    latest_at: number | null;
  }>;

  for (const row of rows) {
    const candidateKey = `skill:${row.skill_id}`;
    const projects = String(row.projects ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const detailedEvidence = collectSkillPromotionEvidence(db, row.skill_id);
    const evidence = {
      skill_id: row.skill_id,
      projects,
      latest_at: row.latest_at,
      rule: "success_in_three_or_more_projects",
      ...detailedEvidence,
    };
    const evidenceDetailCount = detailedEvidence.task_results.length + detailedEvidence.memory_refs.length;
    db.prepare(
      `
      INSERT INTO memory_promotion_evidence (
        id, candidate_key, candidate_type, title, summary, tags_json, evidence_json,
        evidence_count, project_count, confidence, status, created_at, updated_at
      ) VALUES (?, ?, 'skill', ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?)
      ON CONFLICT(candidate_key, candidate_type) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        tags_json = excluded.tags_json,
        evidence_json = excluded.evidence_json,
        evidence_count = excluded.evidence_count,
        project_count = excluded.project_count,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at
      WHERE memory_promotion_evidence.status = 'candidate'
    `,
    ).run(
      randomUUID(),
      candidateKey,
      `Global skill candidate: ${row.skill_id}`,
      `Skill '${row.skill_id}' succeeded across ${row.project_count} projects with ${evidenceDetailCount} linked task or memory evidence items.`,
      JSON.stringify([row.skill_id, "global_skill_candidate"]),
      JSON.stringify(evidence),
      row.evidence_count,
      row.project_count,
      clampNumber(0.55 + Number(row.project_count) * 0.08, 0.75, 0, 0.95),
      now,
      now,
    );
  }

  return listMemoryPromotionCandidates(db);
}

export function listMemoryPromotionCandidates(
  db: DatabaseSync,
  status: "candidate" | "approved" | "rejected" | "all" = "candidate",
): MemoryPromotionCandidateRow[] {
  const where = status === "all" ? "" : "WHERE status = ?";
  const params = status === "all" ? [] : [status];
  return db
    .prepare(
      `
      SELECT *
      FROM memory_promotion_evidence
      ${where}
      ORDER BY project_count DESC, evidence_count DESC, updated_at DESC
      LIMIT 100
    `,
    )
    .all(...params) as MemoryPromotionCandidateRow[];
}

export function approveMemoryPromotionCandidate(
  db: DatabaseSync,
  input: { id: string; now?: number | null },
): MemoryPromotionCandidateRow | null {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  db.prepare(
    `
    UPDATE memory_promotion_evidence
    SET status = 'approved',
        approved_at = COALESCE(approved_at, ?),
        updated_at = ?
    WHERE id = ?
  `,
  ).run(now, now, input.id);
  const row = db.prepare("SELECT * FROM memory_promotion_evidence WHERE id = ?").get(input.id) as
    | MemoryPromotionCandidateRow
    | undefined;
  return row ?? null;
}

export function listAgentGrowthEvents(db: DatabaseSync, agentId: string, limit = 30): AgentGrowthEventRow[] {
  return db
    .prepare(
      `
      SELECT *
      FROM agent_growth_events
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    )
    .all(agentId, Math.max(1, Math.min(100, Math.trunc(limit)))) as AgentGrowthEventRow[];
}

export function listSkillUsageSummary(
  db: DatabaseSync,
  filters: { agentId?: string | null; projectId?: string | null },
) {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters.agentId) {
    clauses.push("agent_id = ?");
    params.push(filters.agentId);
  }
  if (filters.projectId) {
    clauses.push("project_id = ?");
    params.push(filters.projectId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `
      SELECT
        skill_id,
        COUNT(*) AS use_count,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS success_count,
        MAX(created_at) AS latest_at,
        MIN(1.0, 0.2 + COUNT(*) * 0.08 + SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) * 0.04) AS proficiency
      FROM skill_usage_events
      ${where}
      GROUP BY skill_id
      ORDER BY proficiency DESC, use_count DESC, latest_at DESC
      LIMIT 100
    `,
    )
    .all(...params) as SkillUsageSummaryRow[];
}

export function recordSkillUsageEvent(
  db: DatabaseSync,
  input: {
    agentId?: string | null;
    projectId?: string | null;
    taskId?: string | null;
    skillId: string;
    provider?: string | null;
    outcome?: string | null;
    confidence?: number | null;
    notes?: string | null;
    now?: number | null;
  },
): void {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  db.prepare(
    `
    INSERT INTO skill_usage_events (
      id, agent_id, project_id, task_id, skill_id, provider, outcome, confidence, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    randomUUID(),
    input.agentId ?? null,
    input.projectId ?? null,
    input.taskId ?? null,
    normalizeText(input.skillId) || "general",
    normalizeText(input.provider) || null,
    normalizeText(input.outcome) || "observed",
    clampNumber(input.confidence, 0.7, 0, 1),
    normalizeText(input.notes) || null,
    now,
  );
}

export function recordAgentGrowthEvent(
  db: DatabaseSync,
  input: {
    agentId: string;
    projectId?: string | null;
    taskId?: string | null;
    eventType: string;
    title: string;
    body: string;
    episode?: Record<string, unknown> | string | null;
    sourceMemoryId?: string | null;
    xpDelta?: number | null;
    now?: number | null;
  },
): void {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  db.prepare(
    `
    INSERT INTO agent_growth_events (
      id, agent_id, project_id, task_id, event_type, title, body, episode_json, source_memory_id, xp_delta, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    randomUUID(),
    input.agentId,
    input.projectId ?? null,
    input.taskId ?? null,
    normalizeText(input.eventType) || "task_completed",
    normalizeText(input.title) || "Growth event",
    normalizeText(input.body) || "No event body.",
    encodeJson(input.episode),
    normalizeText(input.sourceMemoryId) || null,
    Math.trunc(Number(input.xpDelta ?? 0)) || 0,
    now,
  );
}

export function extractAndStoreTaskMemory(db: DatabaseSync, input: TaskMemoryExtractionInput): void {
  const task = input.task;
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const meta = parseWorkflowMeta(task.workflow_meta_json);
  const goalCommand = normalizeText(meta.goal_command);
  const workflowPack = normalizeText(task.workflow_pack_key) || "development";
  const taskType = normalizeText(task.task_type) || "general";
  const body = [
    `Task ID: ${task.id}`,
    `Task title: ${task.title}`,
    `Workflow pack: ${workflowPack}`,
    `Task type: ${taskType}`,
    goalCommand ? `Goal command: ${goalCommand}` : "",
    `Result summary: ${summarizeResult(input.result)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const tags = [...new Set([workflowPack, taskType, goalCommand].filter(Boolean))];
  const episode = {
    task_id: task.id,
    task_title: task.title,
    workflow_pack: workflowPack,
    task_type: taskType,
    goal_command: goalCommand || null,
    project_id: task.project_id ?? null,
    agent_id: task.assigned_agent_id ?? null,
    result_summary: summarizeResult(input.result),
  };
  let projectMemoryId: string | null = null;

  if (task.project_id) {
    const projectMemory = createProjectMemory(db, {
      projectId: task.project_id,
      agentId: task.assigned_agent_id,
      memoryType: "task_lesson",
      scopeType: "project",
      title: `Completed task: ${task.title}`,
      body,
      displaySummaryKo: `완료 경험: ${task.title}`,
      tags,
      confidence: 0.78,
      strength: 0.65,
      sourceType: "task_run",
      sourceId: task.id,
      memoryLayer: "episodic",
      threadId: task.id,
      episode,
      now,
    });
    projectMemoryId = projectMemory.id;
  }

  if (task.assigned_agent_id) {
    createAgentMemory(db, {
      agentId: task.assigned_agent_id,
      projectId: task.project_id,
      memoryType: "project_experience",
      scopeType: "agent",
      title: `Project experience: ${task.title}`,
      body,
      displaySummaryKo: `작업 경험: ${task.title}`,
      tags,
      confidence: 0.78,
      strength: 0.6,
      sourceType: "task_run",
      sourceId: task.id,
      memoryLayer: "episodic",
      threadId: task.id,
      episode,
      now,
    });
    recordAgentGrowthEvent(db, {
      agentId: task.assigned_agent_id,
      projectId: task.project_id,
      taskId: task.id,
      eventType: "task_completed",
      title: `Completed ${task.title}`,
      body: `The agent completed a ${taskType} task in workflow pack ${workflowPack}.`,
      episode,
      sourceMemoryId: projectMemoryId,
      xpDelta: 10,
      now,
    });
  }

  for (const skillId of tags.length > 0 ? tags : ["general"]) {
    recordSkillUsageEvent(db, {
      agentId: task.assigned_agent_id,
      projectId: task.project_id,
      taskId: task.id,
      skillId,
      provider: input.provider,
      outcome: "success",
      confidence: 0.75,
      notes: `Observed from completed task ${task.id}.`,
      now,
    });
  }
}

export function buildMemoryContextBlock(
  db: DatabaseSync,
  input: {
    agentId?: string | null;
    projectId?: string | null;
    query?: string | null;
    threadId?: string | null;
    limit?: number | null;
  },
): string {
  const limit = Math.max(1, Math.min(20, Math.trunc(Number(input.limit ?? 8))));
  const parts: string[] = ["[Memory Context]", "source=donggri_native_memory"];
  parts.push(
    buildSearchArchivalMemoryToolBlock({
      projectId: input.projectId,
      agentId: input.agentId,
      threadId: input.threadId,
    }),
  );
  if (input.projectId) {
    const coreMemories = searchMemories(db, {
      projectId: input.projectId,
      layer: "core",
      scope: "local",
      limit: Math.min(4, limit),
    });
    if (coreMemories.length > 0) {
      parts.push("Core project memories (always scoped to this project):");
      for (const memory of coreMemories) {
        parts.push(`- (${memory.memory_type}) ${memory.title}: ${memory.body.slice(0, 240)}`);
      }
    }

    const archivalMemories = searchMemories(db, {
      query: input.query,
      projectId: input.projectId,
      threadId: input.threadId,
      layer: input.query ? "all" : "episodic",
      scope: "local",
      limit: Math.max(2, limit - coreMemories.length),
    }).filter((memory) => memory.memory_layer !== "core");
    if (archivalMemories.length > 0) {
      parts.push("Retrieved archival and episodic project memories:");
      for (const memory of archivalMemories.slice(0, limit)) {
        parts.push(`- (${memory.memory_layer}/${memory.memory_type}) ${memory.title}: ${memory.body.slice(0, 220)}`);
      }
    }
  }
  if (input.agentId) {
    const memories = searchMemories(db, {
      query: input.query,
      agentId: input.agentId,
      projectId: input.projectId,
      scope: "local",
      limit,
    });
    if (memories.length > 0) {
      parts.push("Agent memories for this assignment:");
      for (const memory of memories.slice(0, limit)) {
        parts.push(`- (${memory.memory_layer}/${memory.memory_type}) ${memory.title}: ${memory.body.slice(0, 220)}`);
      }
    }
    const skills = listSkillUsageSummary(db, { agentId: input.agentId }).slice(0, 8);
    if (skills.length > 0) {
      parts.push("Recommended skills from usage history:");
      for (const skill of skills) {
        parts.push(`- ${skill.skill_id}: use_count=${skill.use_count}, proficiency=${skill.proficiency.toFixed(2)}`);
      }
    }
  }
  const approvedGlobal = listMemoryPromotionCandidates(db, "approved").slice(0, 5);
  if (approvedGlobal.length > 0) {
    parts.push("Approved global lessons (summaries only; no raw cross-project memory):");
    for (const candidate of approvedGlobal) {
      parts.push(`- ${candidate.candidate_key}: ${candidate.summary}`);
    }
  }
  parts.push(
    "Memory usage rule: use only project-scoped memories by default. Use search_archival_memory when more context is needed. Do not import raw memories from other projects unless they are listed as approved global lessons.",
  );
  return parts.length > 2 ? parts.join("\n") : "";
}

export function buildAgentGuideMemorySnapshot(
  db: DatabaseSync,
  agentId: string,
): {
  memorySnapshot: string[];
  skillGrowthSnapshot: string[];
  recentLessons: string[];
  projectExperience: string[];
} {
  const memories = listAgentMemories(db, agentId, 12);
  const skills = listSkillUsageSummary(db, { agentId }).slice(0, 12);
  return {
    memorySnapshot: memories
      .slice(0, 6)
      .map((memory) => `${memory.memory_layer}/${memory.memory_type}: ${memory.title}`),
    skillGrowthSnapshot: skills.map(
      (skill) =>
        `${skill.skill_id}: use_count=${skill.use_count}, success=${skill.success_count}, proficiency=${skill.proficiency.toFixed(2)}`,
    ),
    recentLessons: memories
      .filter((memory) => memory.memory_type.includes("lesson"))
      .slice(0, 6)
      .map((memory) => `${memory.title}: ${memory.body.slice(0, 180)}`),
    projectExperience: memories
      .filter((memory) => memory.memory_type.includes("experience"))
      .slice(0, 6)
      .map((memory) => `${memory.title}: ${memory.body.slice(0, 180)}`),
  };
}
