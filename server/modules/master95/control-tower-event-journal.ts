import path from "node:path";
import {
  EventJournalWriter,
  resolveJournalResume,
  type EventJournalWriterOptions,
  type JournalEvent,
  type JournalResumeResult,
} from "../control-plane/event-journal-writer.js";
import { resolveReleaseIdentity } from "../release/release-identity.js";
import {
  Master95ControlTowerEventSchema,
  Master95DurableControlTower,
  Master95MemoryControlTowerJournal,
  type Master95ControlTowerEvent,
} from "./durable-control-tower.js";
import { createMaster95DefaultProjectRegistry, type Master95ProjectRegistry } from "./project-registry.js";

export const MASTER95_V1_CONTROL_TOWER_RUNTIME_ROOT = "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\v1";

const CONTROL_TOWER_JOURNAL_EVENT_TYPE = "master95.control-tower.event/v1";
export const CONTROL_TOWER_PROJECTION_BOUNDARY_EVENT_TYPE = "control-plane.projection-boundary/v1";

type JourneyInput = Parameters<Master95DurableControlTower["runJourney"]>[0];
type JourneyResult = ReturnType<Master95DurableControlTower["runJourney"]>;
type ActionInput = Parameters<Master95DurableControlTower["performAction"]>[0];
type ActionResult = ReturnType<Master95DurableControlTower["performAction"]>;

export type Master95EventJournalControlTowerOptions = {
  candidate_id: string;
  source_epoch: string;
  projection_epoch: string;
  journal_path?: string;
  runtime_root?: string;
  writer_instance_id?: string;
  now?: () => Date;
  project_registry?: Master95ProjectRegistry;
};

function safeCandidateSegment(candidateId: string): string {
  const value = candidateId.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("control_tower_candidate_id_invalid");
  return value;
}

function epochPathSegment(epoch: string, field: "source_epoch" | "projection_epoch"): string {
  const match = epoch.trim().match(/^sha256:([0-9a-f]{64})$/);
  if (!match) throw new Error(`control_tower_${field}_invalid`);
  return match[1];
}

export function resolveMaster95V1ControlTowerJournalPath(
  candidateId: string,
  sourceEpoch: string,
  runtimeRoot = MASTER95_V1_CONTROL_TOWER_RUNTIME_ROOT,
): string {
  return path.join(
    path.resolve(runtimeRoot),
    safeCandidateSegment(candidateId),
    epochPathSegment(sourceEpoch, "source_epoch"),
    "control-tower",
    "events.jsonl",
  );
}

type ProjectionBoundary = {
  candidate_id: string;
  source_epoch: string;
  previous_projection_epoch: string | null;
  projection_epoch: string;
  reason: "root-control-plane-projection-changed";
};

function parseProjectionBoundary(event: JournalEvent): ProjectionBoundary | null {
  if (event.type !== CONTROL_TOWER_PROJECTION_BOUNDARY_EVENT_TYPE) return null;
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new Error(`control_tower_projection_boundary_invalid:${event.sequence}`);
  }
  const payload = event.payload as Record<string, unknown>;
  const previousProjectionEpoch = payload.previous_projection_epoch;
  if (
    payload.candidate_id !== event.candidate_id ||
    payload.source_epoch !== event.source_epoch ||
    (previousProjectionEpoch !== null &&
      (typeof previousProjectionEpoch !== "string" || !/^sha256:[0-9a-f]{64}$/.test(previousProjectionEpoch))) ||
    typeof payload.projection_epoch !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(payload.projection_epoch) ||
    payload.reason !== "root-control-plane-projection-changed"
  ) {
    throw new Error(`control_tower_projection_boundary_invalid:${event.sequence}`);
  }
  return {
    candidate_id: event.candidate_id,
    source_epoch: event.source_epoch,
    previous_projection_epoch: previousProjectionEpoch,
    projection_epoch: payload.projection_epoch,
    reason: "root-control-plane-projection-changed",
  };
}

function parseControlTowerEnvelope(event: JournalEvent): Master95ControlTowerEvent | null {
  if (event.type === CONTROL_TOWER_PROJECTION_BOUNDARY_EVENT_TYPE) {
    parseProjectionBoundary(event);
    return null;
  }
  if (event.type !== CONTROL_TOWER_JOURNAL_EVENT_TYPE) {
    throw new Error(`control_tower_journal_event_type_mismatch:${event.sequence}:${event.type}`);
  }
  return Master95ControlTowerEventSchema.parse(event.payload);
}

function controlTowerEvents(events: readonly JournalEvent[]): Master95ControlTowerEvent[] {
  return events.flatMap((event) => {
    const parsed = parseControlTowerEnvelope(event);
    return parsed ? [parsed] : [];
  });
}

function currentProjectionEpoch(events: readonly JournalEvent[]): string | null {
  let current: string | null = null;
  for (const event of events) {
    const boundary = parseProjectionBoundary(event);
    if (boundary) current = boundary.projection_epoch;
  }
  return current;
}

function memoryJournal(events: readonly Master95ControlTowerEvent[]): Master95MemoryControlTowerJournal {
  const journal = new Master95MemoryControlTowerJournal();
  for (const event of events) journal.append(event);
  return journal;
}

/**
 * Candidate-scoped Control Tower runtime backed by EventJournalWriter.
 *
 * A mutation is first evaluated against an isolated replay ("shadow") and only
 * the resulting validated Control Tower events are appended to the hash-linked
 * journal. The live projection is promoted after every append and checkpoint
 * succeeds. If persistence fails after a partial append, live state is rebuilt
 * from the writer's verified committed prefix before the error is returned.
 */
export class Master95EventJournalControlTowerRuntime {
  readonly candidate_id: string;
  readonly source_epoch: string;
  readonly journal_path: string;

  private readonly writer: EventJournalWriter;
  private readonly projectRegistry: Master95ProjectRegistry;
  private controlEvents: Master95ControlTowerEvent[];
  private controlTower: Master95DurableControlTower;
  private currentProjectionEpoch: string | null;
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor(
    writer: EventJournalWriter,
    projectRegistry: Master95ProjectRegistry,
    controlEvents: Master95ControlTowerEvent[],
  ) {
    this.writer = writer;
    this.projectRegistry = projectRegistry;
    this.candidate_id = writer.candidate_id;
    this.source_epoch = writer.source_epoch;
    this.journal_path = writer.journal_path;
    this.controlEvents = structuredClone(controlEvents);
    this.controlTower = new Master95DurableControlTower(memoryJournal(this.controlEvents), this.projectRegistry);
    this.currentProjectionEpoch = currentProjectionEpoch(writer.readEvents());
  }

  get projection_epoch(): string | null {
    return this.currentProjectionEpoch;
  }

  static async open(options: Master95EventJournalControlTowerOptions) {
    epochPathSegment(options.source_epoch, "source_epoch");
    const journalPath =
      options.journal_path ??
      resolveMaster95V1ControlTowerJournalPath(options.candidate_id, options.source_epoch, options.runtime_root);
    epochPathSegment(options.projection_epoch, "projection_epoch");
    const writerOptions: EventJournalWriterOptions = {
      journal_path: journalPath,
      candidate_id: options.candidate_id,
      source_epoch: options.source_epoch,
      writer_instance_id: options.writer_instance_id,
      now: options.now,
    };
    const writer = await EventJournalWriter.open(writerOptions);
    try {
      const runtime = new Master95EventJournalControlTowerRuntime(
        writer,
        options.project_registry ?? createMaster95DefaultProjectRegistry(),
        controlTowerEvents(writer.readEvents()),
      );
      await runtime.ensureProjectionEpoch(options.projection_epoch);
      return runtime;
    } catch (error) {
      await writer.close().catch(() => undefined);
      throw error;
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private assertOpen() {
    if (this.closed) throw new Error("control_tower_runtime_closed");
  }

  private rebuildFromCommittedJournal(): void {
    const events = this.writer.readEvents();
    this.controlEvents = controlTowerEvents(events);
    this.controlTower = new Master95DurableControlTower(memoryJournal(this.controlEvents), this.projectRegistry);
    this.currentProjectionEpoch = currentProjectionEpoch(events);
  }

  /**
   * Record a mutable Control Plane projection boundary without changing the
   * immutable candidate/source journal identity. A restart replays and accepts
   * every prior projection boundary in the same hash chain.
   */
  ensureProjectionEpoch(projectionEpoch: string): Promise<{ changed: boolean; cursor: string }> {
    return this.enqueue(async () => {
      this.assertOpen();
      epochPathSegment(projectionEpoch, "projection_epoch");
      if (this.currentProjectionEpoch === projectionEpoch) {
        return { changed: false, cursor: this.writer.currentCursor() };
      }
      const previousProjectionEpoch = this.currentProjectionEpoch;
      try {
        const event = await this.writer.append({
          type: CONTROL_TOWER_PROJECTION_BOUNDARY_EVENT_TYPE,
          projection_epoch: projectionEpoch,
          payload: {
            candidate_id: this.candidate_id,
            source_epoch: this.source_epoch,
            previous_projection_epoch: previousProjectionEpoch,
            projection_epoch: projectionEpoch,
            reason: "root-control-plane-projection-changed",
          } satisfies ProjectionBoundary,
        });
        await this.writer.checkpoint();
        this.currentProjectionEpoch = projectionEpoch;
        return { changed: true, cursor: event.cursor };
      } catch (error) {
        this.rebuildFromCommittedJournal();
        throw error;
      }
    });
  }

  private mutate<T>(operation: (controlTower: Master95DurableControlTower) => T): Promise<T> {
    return this.enqueue(async () => {
      this.assertOpen();
      const journal = memoryJournal(this.controlEvents);
      const shadow = new Master95DurableControlTower(journal, this.projectRegistry);
      const previousCount = journal.events.length;
      const result = operation(shadow);
      const pendingEvents = journal.events.slice(previousCount);
      if (pendingEvents.length === 0) return result;
      if (!this.currentProjectionEpoch) throw new Error("control_tower_projection_epoch_unavailable");

      try {
        for (const event of pendingEvents) {
          await this.writer.append({
            type: CONTROL_TOWER_JOURNAL_EVENT_TYPE,
            projection_epoch: this.currentProjectionEpoch,
            occurred_at: event.occurred_at,
            payload: event,
          });
        }
        await this.writer.checkpoint();
        this.controlEvents = structuredClone(journal.events);
        this.controlTower = shadow;
        return result;
      } catch (error) {
        this.rebuildFromCommittedJournal();
        throw error;
      }
    });
  }

  runJourney(input: JourneyInput): Promise<JourneyResult> {
    return this.mutate((controlTower) => controlTower.runJourney(input));
  }

  performAction(input: ActionInput): Promise<ActionResult> {
    return this.mutate((controlTower) => controlTower.performAction(input));
  }

  async snapshot(rootProjectId: string) {
    await this.tail;
    this.assertOpen();
    return this.controlTower.snapshot(rootProjectId);
  }

  async getRun(rootProjectId: string, runId: string) {
    await this.tail;
    this.assertOpen();
    return this.controlTower.getRun(rootProjectId, runId);
  }

  async getArtifact(rootProjectId: string, artifactId: string) {
    await this.tail;
    this.assertOpen();
    return this.controlTower.getArtifact(rootProjectId, artifactId);
  }

  async journalEvents(): Promise<JournalEvent[]> {
    await this.tail;
    this.assertOpen();
    return this.writer.readEvents();
  }

  async journalCursor(): Promise<string> {
    await this.tail;
    this.assertOpen();
    return this.writer.currentCursor();
  }

  async resolveResume(lastEventId: string | undefined, snapshotVersion: string): Promise<JournalResumeResult> {
    return resolveJournalResume(await this.journalEvents(), lastEventId, snapshotVersion);
  }

  async checkpoint() {
    await this.tail;
    this.assertOpen();
    return this.writer.checkpoint();
  }

  async close(): Promise<void> {
    await this.tail;
    if (this.closed) return;
    this.closed = true;
    await this.writer.close();
  }

  releaseLeaseOnProcessExit(): void {
    this.writer.releaseLeaseOnProcessExit();
    this.closed = true;
  }
}

export async function createMaster95EventJournalControlTowerRuntime(
  options: Partial<
    Omit<Master95EventJournalControlTowerOptions, "candidate_id" | "source_epoch" | "projection_epoch">
  > & {
    candidate_id?: string;
    source_epoch?: string;
    projection_epoch: string;
  },
) {
  const identity = resolveReleaseIdentity();
  return Master95EventJournalControlTowerRuntime.open({
    ...options,
    candidate_id: options.candidate_id ?? identity.candidate_id,
    source_epoch: options.source_epoch ?? identity.source_epoch,
  });
}
