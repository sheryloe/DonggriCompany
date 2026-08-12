import fs from "node:fs";
import { z } from "zod";

// The Control Plane only reads this collector output; it never mutates runtime evidence.
export const MASTER95_LIVE_PILOT_JSONL =
  "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\master95\\live-pilot\\pilot-runs.jsonl";
export const MASTER95_LIVE_PILOT_EVENTS_JSONL =
  "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\master95\\live-pilot\\pilot-events.jsonl";

const livePilotRecordSchema = z
  .object({
    project_id: z.string().nullable().optional(),
    task_id: z.string().nullable().optional(),
    run_id: z.string().min(1),
    trace_id: z.string().nullable().optional(),
    status: z.string().min(1),
    critical: z.boolean().optional(),
    work_type: z.string().nullable().optional(),
    scenario_type: z.string().nullable().optional(),
    concurrency_group_id: z.string().nullable().optional(),
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    agent_version: z.string().nullable().optional(),
    skill_version: z.string().nullable().optional(),
    memory_version: z.string().nullable().optional(),
    trace_span_count: z.number().int().nonnegative().optional(),
    artifact_refs: z.array(z.string()).optional(),
    evidence_refs: z.array(z.string()).optional(),
  })
  .passthrough();

const livePilotEventSchema = z
  .object({
    event_id: z.string().min(1),
    event_type: z.string().min(1),
    task_id: z.string().nullable().optional(),
    run_id: z.string().min(1),
    sequence: z.number().int().nonnegative(),
    occurred_at: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type Master95RunEvent = {
  event_id: string;
  event_type: string;
  sequence: number;
  occurred_at: string;
  department: string | null;
  routing: string[];
  reason: string | null;
  reason_code: string | null;
  escalation_department: string | null;
  decision: string | null;
};

export type Master95RunSummary = {
  project_id: string | null;
  task_id: string | null;
  run_id: string;
  trace_id: string | null;
  artifact_id: string | null;
  artifact_refs: string[];
  status: string;
  critical: boolean;
  work_type: string | null;
  scenario_type: string | null;
  concurrency_group_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  agent_version: string | null;
  skill_version: string | null;
  memory_version: string | null;
  trace_span_count: number;
  owner_department: "OPS";
  handoff_departments: string[];
  events: Master95RunEvent[];
  evidence_refs: string[];
};

export type Master95LivePilotProjection = {
  source_path: string;
  event_source_path: string;
  mode: "read-only";
  available: boolean;
  parse_error_count: number;
  event_parse_error_count: number;
  message: string;
  run_summaries: Master95RunSummary[];
};

function optionalPayloadString(payload: Record<string, unknown>, key: string): string | null {
  return typeof payload[key] === "string" ? payload[key] : null;
}

export function parseLivePilotRunEvents(raw: string): {
  events_by_run: Map<string, Master95RunEvent[]>;
  parse_error_count: number;
  task_by_run: Map<string, string>;
} {
  const eventsByRun = new Map<string, Master95RunEvent[]>();
  const taskByRun = new Map<string, string>();
  let parseErrorCount = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = livePilotEventSchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        parseErrorCount += 1;
        continue;
      }
      const record = parsed.data;
      const payload = record.payload ?? {};
      const routing = Array.isArray(payload.routing)
        ? payload.routing.filter((value): value is string => typeof value === "string")
        : [];
      const event: Master95RunEvent = {
        event_id: record.event_id,
        event_type: record.event_type,
        sequence: record.sequence,
        occurred_at: record.occurred_at,
        department: optionalPayloadString(payload, "department"),
        routing,
        reason: optionalPayloadString(payload, "reason"),
        reason_code: optionalPayloadString(payload, "reason_code"),
        escalation_department: optionalPayloadString(payload, "escalation_department"),
        decision: optionalPayloadString(payload, "decision"),
      };
      const events = eventsByRun.get(record.run_id) ?? [];
      events.push(event);
      eventsByRun.set(record.run_id, events);
      if (record.task_id) taskByRun.set(record.run_id, record.task_id);
    } catch {
      parseErrorCount += 1;
    }
  }

  for (const events of eventsByRun.values()) events.sort((left, right) => left.sequence - right.sequence);
  return { events_by_run: eventsByRun, parse_error_count: parseErrorCount, task_by_run: taskByRun };
}

export function parseLivePilotRunSummaries(raw: string, limit = 20): Master95LivePilotProjection {
  const summaries: Master95RunSummary[] = [];
  let parseErrorCount = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = livePilotRecordSchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        parseErrorCount += 1;
        continue;
      }
      const record = parsed.data;
      const artifactRefs = record.artifact_refs ?? [];
      summaries.push({
        project_id: record.project_id ?? null,
        task_id: record.task_id ?? null,
        run_id: record.run_id,
        trace_id: record.trace_id ?? null,
        artifact_id: artifactRefs[0] ?? null,
        artifact_refs: artifactRefs,
        status: record.status,
        critical: record.critical ?? false,
        work_type: record.work_type ?? null,
        scenario_type: record.scenario_type ?? null,
        concurrency_group_id: record.concurrency_group_id ?? null,
        started_at: record.started_at ?? null,
        completed_at: record.completed_at ?? null,
        agent_version: record.agent_version ?? null,
        skill_version: record.skill_version ?? null,
        memory_version: record.memory_version ?? null,
        trace_span_count: record.trace_span_count ?? 0,
        owner_department: "OPS",
        handoff_departments: [],
        events: [],
        evidence_refs: record.evidence_refs ?? [],
      });
    } catch {
      parseErrorCount += 1;
    }
  }

  summaries.sort((left, right) => {
    const leftTime = Date.parse(left.completed_at ?? left.started_at ?? "") || 0;
    const rightTime = Date.parse(right.completed_at ?? right.started_at ?? "") || 0;
    return rightTime - leftTime;
  });

  return {
    source_path: MASTER95_LIVE_PILOT_JSONL,
    event_source_path: MASTER95_LIVE_PILOT_EVENTS_JSONL,
    mode: "read-only",
    available: true,
    parse_error_count: parseErrorCount,
    event_parse_error_count: 0,
    message: parseErrorCount > 0 ? `${parseErrorCount}개 손상 레코드를 제외했습니다.` : "정상적으로 읽었습니다.",
    run_summaries: summaries.slice(0, Math.max(0, limit)),
  };
}

export function readLivePilotProjection(
  sourcePath = MASTER95_LIVE_PILOT_JSONL,
  limit = 20,
  eventSourcePath = MASTER95_LIVE_PILOT_EVENTS_JSONL,
): Master95LivePilotProjection {
  try {
    const projection = parseLivePilotRunSummaries(fs.readFileSync(sourcePath, "utf8"), limit);
    let eventParseErrorCount = 0;
    try {
      const parsedEvents = parseLivePilotRunEvents(fs.readFileSync(eventSourcePath, "utf8"));
      eventParseErrorCount = parsedEvents.parse_error_count;
      for (const run of projection.run_summaries) {
        run.events = parsedEvents.events_by_run.get(run.run_id) ?? [];
        run.task_id = run.task_id ?? parsedEvents.task_by_run.get(run.run_id) ?? null;
        run.handoff_departments = [
          ...new Set(
            run.events.flatMap((event) => [
              ...event.routing,
              ...(event.department ? [event.department] : []),
              ...(event.escalation_department ? [event.escalation_department] : []),
            ]),
          ),
        ];
      }
    } catch {
      eventParseErrorCount = 1;
    }
    return {
      ...projection,
      source_path: sourcePath,
      event_source_path: eventSourcePath,
      event_parse_error_count: eventParseErrorCount,
      message:
        projection.parse_error_count + eventParseErrorCount > 0
          ? `${projection.parse_error_count + eventParseErrorCount}개 손상 또는 누락 레코드를 제외했습니다.`
          : "정상적으로 읽었습니다.",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      source_path: sourcePath,
      event_source_path: eventSourcePath,
      mode: "read-only",
      available: false,
      parse_error_count: 0,
      event_parse_error_count: 0,
      message: `live-pilot 원본을 읽지 못했습니다. 원인: ${reason}. 다음 조치: collector 경로와 실행 상태를 확인하세요.`,
      run_summaries: [],
    };
  }
}
