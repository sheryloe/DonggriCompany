import { describe, expect, it } from "vitest";
import { createMaster95DefaultProjectRegistry } from "./project-registry.js";
import { MASTER95_MEMORY_LAYERS, Master95MemoryRecordSchema, Master95MemoryStore } from "./memory-governance.js";

const now = "2026-07-14T00:00:00.000Z";

function memory(id: string, project = "project:BloggerGent", overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0.0",
    memory_id: id,
    project_id: project,
    namespace: `${project}:memory`,
    layer: "semantic",
    content_kind: "fact",
    content: `curated fact ${id} bloggergent travel workflow`,
    keywords: [id, "bloggergent", "travel"],
    source_refs: [`EV-${id}`],
    confidence: 0.95,
    created_at: now,
    expires_at: null,
    supersedes_memory_id: null,
    tombstoned_at: null,
    sensitive: false,
    capture_mode: "synthetic-evaluation",
    ...overrides,
  };
}

describe("Master95MemoryStore", () => {
  it("accepts all seven layers with source, confidence, and retention metadata", () => {
    const store = new Master95MemoryStore(createMaster95DefaultProjectRegistry());
    for (const [index, layer] of MASTER95_MEMORY_LAYERS.entries()) {
      store.add(memory(`layer-${index}`, "project:BloggerGent", { layer }));
    }
    expect(store.snapshot().map((item) => item.layer)).toEqual(MASTER95_MEMORY_LAYERS);
  });

  it("returns at most five source-linked records from the same project", async () => {
    const store = new Master95MemoryStore(createMaster95DefaultProjectRegistry());
    for (let index = 0; index < 8; index += 1) store.add(memory(`travel-${index}`));
    store.add(memory("foreign", "project:DonggriCompany"));
    const result = await store.retrieve({
      requester_project_id: "project:BloggerGent",
      resource_project_id: "project:BloggerGent",
      query: "bloggergent travel",
      now,
    });
    expect(result.results).toHaveLength(5);
    expect(result.results.every((item) => item.project_id === "project:BloggerGent")).toBe(true);
    expect(result.results.every((item) => item.source_refs.length > 0)).toBe(true);
  });

  it("blocks every cross-project retrieval before returning records", async () => {
    const store = new Master95MemoryStore(createMaster95DefaultProjectRegistry());
    store.add(memory("foreign", "project:DonggriCompany"));
    const result = await store.retrieve({
      requester_project_id: "project:BloggerGent",
      resource_project_id: "project:DonggriCompany",
      query: "foreign",
      now,
    });
    expect(result).toEqual({ decision: "block", reason_code: "cross_project_access_denied", results: [] });
  });

  it("excludes expired, corrected, and tombstoned records", async () => {
    const store = new Master95MemoryStore(createMaster95DefaultProjectRegistry());
    store.add(memory("expired", "project:BloggerGent", { expires_at: "2026-07-14T00:01:00.000Z" }));
    store.add(memory("old"));
    store.correct({
      previous_memory_id: "old",
      replacement: memory("new", "project:BloggerGent", {
        content: "corrected current bloggergent travel workflow",
        supersedes_memory_id: "old",
      }),
    });
    store.add(memory("deleted"));
    store.tombstone({
      memory_id: "deleted",
      project_id: "project:BloggerGent",
      tombstoned_at: "2026-07-14T00:02:00.000Z",
    });
    const result = await store.retrieve({
      requester_project_id: "project:BloggerGent",
      resource_project_id: "project:BloggerGent",
      query: "bloggergent travel",
      now: "2026-07-14T01:00:00.000Z",
    });
    expect(result.results.map((item) => item.memory_id)).toEqual(["new"]);
    expect(store.lineage("new").map((item) => item.memory_id)).toEqual(["new", "old"]);
  });

  it("denies cross-project correction and deletion", () => {
    const store = new Master95MemoryStore(createMaster95DefaultProjectRegistry());
    store.add(memory("old"));
    expect(() =>
      store.correct({
        previous_memory_id: "old",
        replacement: memory("foreign-new", "project:DonggriCompany", { supersedes_memory_id: "old" }),
      }),
    ).toThrow("cross_project_supersede_denied");
    expect(() =>
      store.tombstone({ memory_id: "old", project_id: "project:DonggriCompany", tombstoned_at: now }),
    ).toThrow("cross_project_delete_denied");
  });

  it("rejects secrets, raw transcripts, missing sources, and namespace drift", () => {
    expect(() =>
      Master95MemoryRecordSchema.parse(memory("secret", "project:BloggerGent", { content: "api_key=abc" })),
    ).toThrow();
    expect(() =>
      Master95MemoryRecordSchema.parse(memory("transcript", "project:BloggerGent", { content: "raw transcript text" })),
    ).toThrow();
    expect(() =>
      Master95MemoryRecordSchema.parse(memory("source", "project:BloggerGent", { source_refs: [] })),
    ).toThrow();
    expect(() =>
      Master95MemoryRecordSchema.parse(
        memory("namespace", "project:BloggerGent", { namespace: "project:DonggriCompany:memory" }),
      ),
    ).toThrow();
  });
});
