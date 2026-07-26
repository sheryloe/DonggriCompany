import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  Master95ImageArtifactSchema,
  Master95ImageHandoffSchema,
  Master95ImageHandoffReceiptSchema,
  Master95ImageWorkbench,
  type Master95ImageArtifact,
  type Master95ImageHandoff,
} from "./image-workbench.js";
import { createMaster95DefaultProjectRegistry, type Master95ProjectRegistry } from "./project-registry.js";

export const MASTER95_IMAGE_EVENT_TYPES = [
  "artifact.registered",
  "artifact.submitted",
  "artifact.decided",
  "artifact.partial_failure",
  "artifact.restored",
  "artifact.handoff",
  "artifact.handoff_accepted",
  "artifact.exported",
] as const;

const NonEmpty = z.string().trim().min(1);
const ProjectId = z.string().regex(/^project:[A-Za-z0-9._-]+$/);

export const Master95ImageEventSchema = z
  .object({
    event_id: NonEmpty,
    event_type: z.enum(MASTER95_IMAGE_EVENT_TYPES),
    project_id: ProjectId,
    sequence: z.number().int().positive(),
    idempotency_key: NonEmpty,
    occurred_at: z.iso.datetime({ offset: true }),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type Master95ImageEvent = z.infer<typeof Master95ImageEventSchema>;
export type Master95ImageEventType = (typeof MASTER95_IMAGE_EVENT_TYPES)[number];

export interface Master95ImageJournalAdapter {
  readAll(): Master95ImageEvent[];
  append(event: Master95ImageEvent): void;
}

export class Master95MemoryImageJournal implements Master95ImageJournalAdapter {
  readonly events: Master95ImageEvent[] = [];

  readAll() {
    return structuredClone(this.events);
  }

  append(event: Master95ImageEvent) {
    this.events.push(structuredClone(event));
  }
}

export class Master95JsonlImageJournal implements Master95ImageJournalAdapter {
  constructor(readonly filePath: string) {}

  readAll() {
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return [];
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return Master95ImageEventSchema.parse(JSON.parse(line));
        } catch (error) {
          throw new Error(`image_journal_corrupt_at_line_${index + 1}:${String(error)}`);
        }
      });
  }

  append(event: Master95ImageEvent) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, { encoding: "utf8", flush: true });
  }
}

type Mutation = {
  event_type: Master95ImageEventType;
  project_id: string;
  idempotency_key: string;
  occurred_at: string;
  payload: Record<string, unknown>;
};

export class Master95DurableImageWorkbench {
  readonly #events: Master95ImageEvent[];
  readonly #idempotency = new Map<string, Master95ImageEvent>();
  readonly #sequences = new Map<string, number>();
  #workbench: Master95ImageWorkbench;

  constructor(
    readonly adapter: Master95ImageJournalAdapter,
    readonly projects: Master95ProjectRegistry = createMaster95DefaultProjectRegistry(),
  ) {
    this.#events = adapter.readAll();
    this.#workbench = new Master95ImageWorkbench();
    for (const event of this.#events) {
      this.#indexEvent(event, true);
      applyEvent(this.#workbench, event);
    }
  }

  register(input: { artifact: unknown; idempotency_key: string; occurred_at: string }) {
    const artifact = Master95ImageArtifactSchema.parse(input.artifact);
    return this.#mutate({
      event_type: "artifact.registered",
      project_id: artifact.project_id,
      idempotency_key: input.idempotency_key,
      occurred_at: input.occurred_at,
      payload: { artifact },
    });
  }

  submit(input: {
    project_id: string;
    artifact_id: string;
    modified_at: string;
    idempotency_key: string;
    occurred_at: string;
  }) {
    return this.#mutate({
      event_type: "artifact.submitted",
      project_id: input.project_id,
      idempotency_key: input.idempotency_key,
      occurred_at: input.occurred_at,
      payload: { artifact_id: input.artifact_id, modified_at: input.modified_at },
    });
  }

  decide(input: {
    project_id: string;
    artifact_id: string;
    actor: "CONTROL" | "REVIEW" | "IMPLEMENT";
    decision: "approved" | "rejected" | "discarded";
    modified_at: string;
    idempotency_key: string;
    occurred_at: string;
  }) {
    return this.#mutate({
      event_type: "artifact.decided",
      project_id: input.project_id,
      idempotency_key: input.idempotency_key,
      occurred_at: input.occurred_at,
      payload: {
        artifact_id: input.artifact_id,
        actor: input.actor,
        decision: input.decision,
        modified_at: input.modified_at,
      },
    });
  }

  recordPartialFailure(input: {
    project_id: string;
    artifact_id: string;
    failure_reason: string;
    modified_at: string;
    idempotency_key: string;
    occurred_at: string;
  }) {
    return this.#mutate({
      event_type: "artifact.partial_failure",
      project_id: input.project_id,
      idempotency_key: input.idempotency_key,
      occurred_at: input.occurred_at,
      payload: {
        artifact_id: input.artifact_id,
        failure_reason: input.failure_reason,
        modified_at: input.modified_at,
      },
    });
  }

  restore(input: {
    project_id: string;
    artifact_id: string;
    parent_artifact_id?: string;
    new_artifact_id: string;
    task_id: string;
    run_id: string;
    trace_id: string;
    actor_agent_id: string;
    created_at: string;
    idempotency_key: string;
    occurred_at: string;
  }) {
    const { project_id: projectId, idempotency_key: idempotencyKey, occurred_at: occurredAt, ...command } = input;
    return this.#mutate({
      event_type: "artifact.restored",
      project_id: projectId,
      idempotency_key: idempotencyKey,
      occurred_at: occurredAt,
      payload: command,
    });
  }

  handoff(input: { handoff: unknown; idempotency_key: string; occurred_at: string }) {
    const handoff = Master95ImageHandoffSchema.parse(input.handoff);
    return this.#mutate({
      event_type: "artifact.handoff",
      project_id: handoff.project_id,
      idempotency_key: input.idempotency_key,
      occurred_at: input.occurred_at,
      payload: { handoff },
    });
  }

  acceptHandoff(input: { receipt: unknown; idempotency_key: string; occurred_at: string }) {
    const receipt = Master95ImageHandoffReceiptSchema.parse(input.receipt);
    return this.#mutate({
      event_type: "artifact.handoff_accepted",
      project_id: receipt.project_id,
      idempotency_key: input.idempotency_key,
      occurred_at: input.occurred_at,
      payload: { receipt },
    });
  }

  export(input: {
    project_id: string;
    artifact_id: string;
    exported_at: string;
    idempotency_key: string;
    occurred_at: string;
  }) {
    return this.#mutate({
      event_type: "artifact.exported",
      project_id: input.project_id,
      idempotency_key: input.idempotency_key,
      occurred_at: input.occurred_at,
      payload: { artifact_id: input.artifact_id, exported_at: input.exported_at },
    });
  }

  get(projectId: string, artifactId: string) {
    this.projects.require(projectId);
    const artifact = this.#workbench.snapshot().find((item) => item.artifact_id === artifactId);
    if (!artifact) throw new Error("artifact_not_found");
    if (artifact.project_id !== projectId) throw new Error("cross_project_artifact_access_denied");
    return artifact;
  }

  list(projectId: string) {
    this.projects.require(projectId);
    return this.#workbench.snapshot().filter((artifact) => artifact.project_id === projectId);
  }

  lineage(projectId: string, artifactId: string) {
    this.get(projectId, artifactId);
    return this.#workbench.lineage(artifactId);
  }

  handoffs(projectId: string) {
    this.projects.require(projectId);
    return this.#workbench.handoffSnapshot().filter((handoff) => handoff.project_id === projectId);
  }

  handoffReceipts(projectId: string) {
    this.projects.require(projectId);
    return this.#workbench.handoffReceiptSnapshot().filter((receipt) => receipt.project_id === projectId);
  }

  events(projectId: string) {
    this.projects.require(projectId);
    return this.#events.filter((event) => event.project_id === projectId).map((event) => structuredClone(event));
  }

  #mutate(input: Mutation) {
    this.projects.require(input.project_id);
    const key = `${input.project_id}:${required(input.idempotency_key, "idempotency_key")}`;
    const existing = this.#idempotency.get(key);
    if (existing) {
      if (
        existing.event_type !== input.event_type ||
        JSON.stringify(existing.payload) !== JSON.stringify(input.payload)
      ) {
        throw new Error("idempotency_key_conflict");
      }
      return { event: structuredClone(existing), duplicate: true, result: eventResult(this.#workbench, existing) };
    }

    const candidate = replay(this.#events);
    const sequence = (this.#sequences.get(input.project_id) ?? 0) + 1;
    const event = Master95ImageEventSchema.parse({
      ...input,
      event_id: `event:image:${input.project_id.slice("project:".length)}:${sequence}`,
      sequence,
    });
    applyEvent(candidate, event);
    this.adapter.append(event);
    this.#events.push(event);
    this.#indexEvent(event, false);
    this.#workbench = candidate;
    return { event: structuredClone(event), duplicate: false, result: eventResult(candidate, event) };
  }

  #indexEvent(event: Master95ImageEvent, replaying: boolean) {
    Master95ImageEventSchema.parse(event);
    this.projects.require(event.project_id);
    const expected = (this.#sequences.get(event.project_id) ?? 0) + 1;
    if (event.sequence !== expected) throw new Error(`image_event_sequence_gap:${expected}:${event.sequence}`);
    const key = `${event.project_id}:${event.idempotency_key}`;
    if (this.#idempotency.has(key)) throw new Error(`duplicate_image_idempotency_key:${key}`);
    if (replaying && event.event_id !== `event:image:${event.project_id.slice("project:".length)}:${event.sequence}`) {
      throw new Error("image_event_id_sequence_mismatch");
    }
    this.#sequences.set(event.project_id, event.sequence);
    this.#idempotency.set(key, event);
  }
}

function replay(events: Master95ImageEvent[]) {
  const workbench = new Master95ImageWorkbench();
  for (const event of events) applyEvent(workbench, event);
  return workbench;
}

function applyEvent(workbench: Master95ImageWorkbench, event: Master95ImageEvent) {
  const payload = event.payload;
  switch (event.event_type) {
    case "artifact.registered":
      return workbench.register(payload.artifact);
    case "artifact.submitted":
      return workbench.submit(String(payload.artifact_id), String(payload.modified_at));
    case "artifact.decided":
      return workbench.decide({
        artifact_id: String(payload.artifact_id),
        actor: String(payload.actor) as "CONTROL" | "REVIEW" | "IMPLEMENT",
        decision: String(payload.decision) as "approved" | "rejected" | "discarded",
        modified_at: String(payload.modified_at),
      });
    case "artifact.partial_failure":
      return workbench.recordPartialFailure({
        artifact_id: String(payload.artifact_id),
        failure_reason: String(payload.failure_reason),
        modified_at: String(payload.modified_at),
      });
    case "artifact.restored":
      return workbench.restore(payload as Parameters<Master95ImageWorkbench["restore"]>[0]);
    case "artifact.handoff":
      return workbench.handoff(payload.handoff);
    case "artifact.handoff_accepted":
      return workbench.acceptHandoff(payload.receipt);
    case "artifact.exported":
      return workbench.export({ artifact_id: String(payload.artifact_id), exported_at: String(payload.exported_at) });
  }
}

function eventResult(workbench: Master95ImageWorkbench, event: Master95ImageEvent) {
  if (event.event_type === "artifact.handoff") {
    const handoff = Master95ImageHandoffSchema.parse(event.payload.handoff);
    return workbench.handoffSnapshot().find((item) => item.handoff_id === handoff.handoff_id) ?? null;
  }
  if (event.event_type === "artifact.handoff_accepted") {
    const receipt = Master95ImageHandoffReceiptSchema.parse(event.payload.receipt);
    return workbench.handoffReceiptSnapshot().find((item) => item.handoff_id === receipt.handoff_id) ?? null;
  }
  const artifactId =
    event.event_type === "artifact.registered"
      ? Master95ImageArtifactSchema.parse(event.payload.artifact).artifact_id
      : event.event_type === "artifact.restored"
        ? String(event.payload.new_artifact_id)
        : String(event.payload.artifact_id);
  return workbench.snapshot().find((item) => item.artifact_id === artifactId) ?? null;
}

export type Master95StoredImageAsset = {
  project_id: string;
  sha256: string;
  mime_type: Master95ImageArtifact["mime_type"];
  size_bytes: number;
  storage_uri: string;
};

export interface Master95ImageAssetStore {
  put(input: {
    project_id: string;
    sha256: string;
    mime_type: Master95ImageArtifact["mime_type"];
    bytes: Buffer;
  }): Master95StoredImageAsset & { duplicate: boolean };
  read(storageUri: string): Buffer;
}

export class Master95MemoryImageAssetStore implements Master95ImageAssetStore {
  readonly assets = new Map<string, Buffer>();

  put(input: Parameters<Master95ImageAssetStore["put"]>[0]) {
    const validated = validateAsset(input);
    const storage_uri = assetUri(validated.project_id, validated.sha256, validated.mime_type);
    const duplicate = this.assets.has(storage_uri);
    this.assets.set(storage_uri, Buffer.from(validated.bytes));
    return { ...validated, size_bytes: validated.bytes.length, storage_uri, duplicate };
  }

  read(storageUri: string) {
    const value = this.assets.get(storageUri);
    if (!value) throw new Error("image_asset_not_found");
    return Buffer.from(value);
  }
}

export class Master95FileImageAssetStore implements Master95ImageAssetStore {
  constructor(readonly rootPath: string) {}

  put(input: Parameters<Master95ImageAssetStore["put"]>[0]) {
    const validated = validateAsset(input);
    const storage_uri = assetUri(validated.project_id, validated.sha256, validated.mime_type);
    const target = this.#resolve(storage_uri);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      const existing = fs.readFileSync(target);
      if (sha256(existing) !== validated.sha256) throw new Error("immutable_image_asset_conflict");
      return { ...validated, size_bytes: existing.length, storage_uri, duplicate: true };
    }
    try {
      fs.writeFileSync(target, validated.bytes, { flag: "wx", flush: true });
      return { ...validated, size_bytes: validated.bytes.length, storage_uri, duplicate: false };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const raced = fs.readFileSync(target);
      if (sha256(raced) !== validated.sha256) throw new Error("immutable_image_asset_conflict");
      return { ...validated, size_bytes: raced.length, storage_uri, duplicate: true };
    }
  }

  read(storageUri: string) {
    const target = this.#resolve(storageUri);
    if (!fs.existsSync(target)) throw new Error("image_asset_not_found");
    return fs.readFileSync(target);
  }

  #resolve(storageUri: string) {
    const root = path.resolve(this.rootPath);
    const target = path.resolve(root, ...storageUri.split("/"));
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("image_asset_path_escape_denied");
    return target;
  }
}

function validateAsset(input: Parameters<Master95ImageAssetStore["put"]>[0]) {
  const project_id = ProjectId.parse(input.project_id);
  const sha = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(input.sha256);
  const mime_type = z.enum(["image/png", "image/jpeg", "image/webp"]).parse(input.mime_type);
  if (input.bytes.length === 0) throw new Error("image_asset_empty");
  if (input.bytes.length > 10 * 1024 * 1024) throw new Error("image_asset_too_large");
  if (sha256(input.bytes) !== sha) throw new Error("image_asset_sha256_mismatch");
  return { project_id, sha256: sha, mime_type, bytes: input.bytes };
}

function assetUri(projectId: string, hash: string, mimeType: Master95ImageArtifact["mime_type"]) {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
  return `${projectId.slice("project:".length)}/${hash}.${extension}`;
}

function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function required(value: string, field: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}

export const MASTER95_IMAGE_RUNTIME_ROOT =
  process.env.MASTER95_IMAGE_WORKBENCH_ROOT ??
  "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\master95\\image-workbench";

export function createMaster95DurableImageWorkbench() {
  return new Master95DurableImageWorkbench(
    new Master95JsonlImageJournal(path.join(MASTER95_IMAGE_RUNTIME_ROOT, "events.jsonl")),
  );
}

export function createMaster95ImageAssetStore() {
  return new Master95FileImageAssetStore(path.join(MASTER95_IMAGE_RUNTIME_ROOT, "assets"));
}

export type { Master95ImageHandoff };
