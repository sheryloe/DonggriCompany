import { z } from "zod";
import type { Master95ProjectRegistry } from "./project-registry.js";

export const MASTER95_MEMORY_LAYERS = [
  "working",
  "session",
  "episodic",
  "semantic",
  "decision",
  "user",
  "skill",
] as const;

const NonEmpty = z.string().trim().min(1);
const ProjectId = z.string().regex(/^project:[A-Za-z0-9._-]+$/);

export const Master95MemoryRecordSchema = z
  .object({
    schema_version: z.literal("1.0.0"),
    memory_id: NonEmpty,
    project_id: ProjectId,
    namespace: NonEmpty,
    layer: z.enum(MASTER95_MEMORY_LAYERS),
    content_kind: z.enum(["fact", "decision", "preference", "procedure", "observation"]),
    content: NonEmpty,
    keywords: z.array(NonEmpty).min(1),
    source_refs: z.array(NonEmpty).min(1),
    confidence: z.number().min(0).max(1),
    created_at: z.string().datetime(),
    expires_at: z.string().datetime().nullable(),
    supersedes_memory_id: NonEmpty.nullable(),
    tombstoned_at: z.string().datetime().nullable(),
    sensitive: z.literal(false),
    capture_mode: z.enum(["synthetic-evaluation", "approved-curated"]),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.namespace !== `${record.project_id}:memory`) {
      context.addIssue({ code: "custom", path: ["namespace"], message: "project_memory_namespace_mismatch" });
    }
    if (record.expires_at && Date.parse(record.expires_at) <= Date.parse(record.created_at)) {
      context.addIssue({ code: "custom", path: ["expires_at"], message: "expiry_must_follow_creation" });
    }
    if (containsForbiddenMaterial(record.content)) {
      context.addIssue({ code: "custom", path: ["content"], message: "secret_or_raw_transcript_forbidden" });
    }
  });

export type Master95MemoryRecord = z.infer<typeof Master95MemoryRecordSchema>;
export type Master95MemoryQuery = {
  requester_project_id: string;
  resource_project_id: string;
  query: string;
  limit?: number;
  now?: string;
};

export type Master95MemoryRetrieval = {
  decision: "allow" | "block";
  reason_code: string;
  results: Master95MemoryRecord[];
};

export interface Master95AgentMemoryReadOnlyAdapter {
  readonly mode: "read-only";
  retrieve(request: Master95MemoryQuery): Promise<Master95MemoryRetrieval>;
}

export class Master95MemoryStore implements Master95AgentMemoryReadOnlyAdapter {
  readonly mode = "read-only" as const;
  readonly #records = new Map<string, Readonly<Master95MemoryRecord>>();

  constructor(readonly projects: Master95ProjectRegistry) {}

  add(input: unknown) {
    const record = Master95MemoryRecordSchema.parse(input);
    const project = this.projects.require(record.project_id);
    if (record.namespace !== project.namespaces.memory) throw new Error("project_memory_namespace_mismatch");
    if (this.#records.has(record.memory_id)) throw new Error("memory_id_already_registered");
    if (record.supersedes_memory_id) {
      const previous = this.#records.get(record.supersedes_memory_id);
      if (!previous) throw new Error("superseded_memory_not_found");
      if (previous.project_id !== record.project_id) throw new Error("cross_project_supersede_denied");
      if (previous.tombstoned_at) throw new Error("tombstoned_memory_cannot_be_superseded");
    }
    const frozen = deepFreeze(structuredClone(record));
    this.#records.set(record.memory_id, frozen);
    return frozen;
  }

  correct(input: { previous_memory_id: string; replacement: unknown }) {
    const replacement = Master95MemoryRecordSchema.parse(input.replacement);
    if (replacement.supersedes_memory_id !== input.previous_memory_id) {
      throw new Error("correction_lineage_required");
    }
    return this.add(replacement);
  }

  tombstone(input: { memory_id: string; project_id: string; tombstoned_at: string }) {
    const previous = this.#records.get(input.memory_id);
    if (!previous) throw new Error("memory_not_found");
    if (previous.project_id !== input.project_id) throw new Error("cross_project_delete_denied");
    const updated = Master95MemoryRecordSchema.parse({ ...previous, tombstoned_at: input.tombstoned_at });
    const frozen = deepFreeze(structuredClone(updated));
    this.#records.set(input.memory_id, frozen);
    return frozen;
  }

  async retrieve(request: Master95MemoryQuery): Promise<Master95MemoryRetrieval> {
    const project = this.projects.get(request.resource_project_id);
    const access = this.projects.authorizeAccess({
      requester_project_id: request.requester_project_id,
      resource_project_id: request.resource_project_id,
      namespace_kind: "memory",
      namespace_value: project?.namespaces.memory ?? `${request.resource_project_id}:memory`,
    });
    if (access.decision === "block") return { decision: "block", reason_code: access.reason_code, results: [] };
    const now = Date.parse(request.now ?? new Date().toISOString());
    const superseded = new Set(
      [...this.#records.values()]
        .filter((record) => record.project_id === request.resource_project_id && record.supersedes_memory_id)
        .map((record) => record.supersedes_memory_id!),
    );
    const queryTokens = tokenize(request.query);
    const results = [...this.#records.values()]
      .filter(
        (record) =>
          record.project_id === request.resource_project_id &&
          !record.tombstoned_at &&
          !superseded.has(record.memory_id) &&
          (!record.expires_at || Date.parse(record.expires_at) > now),
      )
      .map((record) => ({ record, score: score(record, queryTokens) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.record.confidence - left.record.confidence)
      .slice(0, Math.min(Math.max(request.limit ?? 5, 1), 5))
      .map((item) => structuredClone(item.record));
    return { decision: "allow", reason_code: "project_memory_retrieval_authorized", results };
  }

  lineage(memoryId: string) {
    const record = this.#records.get(memoryId);
    if (!record) return [];
    const chain: Master95MemoryRecord[] = [structuredClone(record)];
    let cursor = record.supersedes_memory_id;
    while (cursor) {
      const previous = this.#records.get(cursor);
      if (!previous || previous.project_id !== record.project_id) break;
      chain.push(structuredClone(previous));
      cursor = previous.supersedes_memory_id;
    }
    return chain;
  }

  snapshot() {
    return [...this.#records.values()].map((record) => structuredClone(record));
  }
}

function score(record: Master95MemoryRecord, queryTokens: Set<string>) {
  const searchable = tokenize(`${record.content} ${record.keywords.join(" ")}`);
  let overlap = 0;
  for (const token of queryTokens) if (searchable.has(token)) overlap += 1;
  return overlap * 10 + (queryTokens.size > 0 && overlap === queryTokens.size ? 5 : 0) + record.confidence;
}

function tokenize(value: string) {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}._-]+/u)
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function containsForbiddenMaterial(value: string) {
  return /(?:api[_-]?key|access[_-]?token|password|authorization:\s*bearer|raw transcript|전체 대화 원문)/i.test(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
