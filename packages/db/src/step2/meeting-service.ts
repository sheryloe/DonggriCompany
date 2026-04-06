import { randomUUID } from "node:crypto";

import type {
  CompleteOfficeMeetingRequest,
  CreateOfficeMeetingRequest,
  OfficeMeetingResponse,
  OfficeMeetingView,
  OfficeMeetingsResponse
} from "@workspace/shared";
import { z } from "zod";

import type { DatabaseHandle } from "../database.js";
import { withDatabase } from "../database.js";
import { getDbPath } from "../paths.js";
import { dbBadRequest, dbNotFound } from "./errors.js";

const meetingTypeSchema = z.enum(["planned", "ad_hoc", "review"]);

export const createOfficeMeetingSchema = z.object({
  title: z.string().trim().min(1).max(240),
  meetingType: meetingTypeSchema.optional(),
  taskId: z.string().min(1).nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  agenda: z.string().max(4000).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  participants: z.array(z.string().trim().min(1).max(120)).max(20).optional()
});

export const completeOfficeMeetingSchema = z.object({
  summary: z.string().max(4000).nullable().optional()
});

type MeetingRow = {
  id: string;
  title: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  meeting_type: "planned" | "ad_hoc" | "review";
  task_id: string | null;
  department_id: string | null;
  agenda: string | null;
  summary: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ParticipantRow = {
  meeting_id: string;
  participant: string;
};

const ensureDepartmentExists = (
  db: DatabaseHandle,
  departmentId: string | null | undefined
): void => {
  if (!departmentId) {
    return;
  }
  const row = db
    .prepare("SELECT id FROM office_departments WHERE id = ?")
    .get(departmentId) as { id: string } | undefined;
  if (!row) {
    throw dbBadRequest(`Department not found: ${departmentId}`);
  }
};

const ensureTaskExists = (db: DatabaseHandle, taskId: string | null | undefined): void => {
  if (!taskId) {
    return;
  }
  const row = db
    .prepare("SELECT id FROM office_kanban_tasks WHERE id = ?")
    .get(taskId) as { id: string } | undefined;
  if (!row) {
    throw dbBadRequest(`Task not found: ${taskId}`);
  }
};

const toMeetingView = (
  row: MeetingRow,
  participants: string[]
): OfficeMeetingView => ({
  id: row.id,
  title: row.title,
  status: row.status,
  meetingType: row.meeting_type,
  taskId: row.task_id,
  departmentId: row.department_id,
  agenda: row.agenda,
  summary: row.summary,
  scheduledAt: row.scheduled_at,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  participants,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const loadMeetingsWithParticipants = (db: DatabaseHandle, whereClause = "", args: unknown[] = []): OfficeMeetingView[] => {
  const meetings = db
    .prepare(
      `
      SELECT
        id,
        title,
        status,
        meeting_type,
        task_id,
        department_id,
        agenda,
        summary,
        scheduled_at,
        started_at,
        completed_at,
        created_at,
        updated_at
      FROM office_meetings
      ${whereClause}
      ORDER BY
        CASE status
          WHEN 'in_progress' THEN 1
          WHEN 'scheduled' THEN 2
          WHEN 'completed' THEN 3
          WHEN 'cancelled' THEN 4
          ELSE 99
        END,
        updated_at DESC
      `
    )
    .all(...args) as MeetingRow[];

  if (meetings.length === 0) {
    return [];
  }

  const participantRows = db
    .prepare(
      `
      SELECT meeting_id, participant
      FROM office_meeting_participants
      WHERE meeting_id IN (${meetings.map(() => "?").join(",")})
      ORDER BY participant ASC
      `
    )
    .all(...meetings.map((meeting) => meeting.id)) as ParticipantRow[];

  const participantsByMeeting = participantRows.reduce((map, row) => {
    const list = map.get(row.meeting_id) ?? [];
    list.push(row.participant);
    map.set(row.meeting_id, list);
    return map;
  }, new Map<string, string[]>());

  return meetings.map((meeting) => toMeetingView(meeting, participantsByMeeting.get(meeting.id) ?? []));
};

export class MeetingService {
  constructor(private readonly dbPath = getDbPath()) {}

  list(): OfficeMeetingsResponse {
    return withDatabase((db) => {
      return {
        ok: true,
        meetings: loadMeetingsWithParticipants(db)
      };
    }, this.dbPath);
  }

  create(payload: CreateOfficeMeetingRequest): OfficeMeetingResponse {
    const parsed = createOfficeMeetingSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid meeting payload");
    }

    return withDatabase((db) => {
      ensureDepartmentExists(db, parsed.data.departmentId);
      ensureTaskExists(db, parsed.data.taskId);

      const id = randomUUID();
      const nowIso = new Date().toISOString();
      const participants = Array.from(new Set((parsed.data.participants ?? []).map((item) => item.trim()).filter(Boolean)));

      const transaction = db.transaction(() => {
        db.prepare(
          `
          INSERT INTO office_meetings (
            id,
            title,
            status,
            meeting_type,
            task_id,
            department_id,
            agenda,
            summary,
            scheduled_at,
            started_at,
            completed_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, 'scheduled', ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?)
          `
        ).run(
          id,
          parsed.data.title,
          parsed.data.meetingType ?? "planned",
          parsed.data.taskId ?? null,
          parsed.data.departmentId ?? null,
          parsed.data.agenda ?? null,
          parsed.data.scheduledAt ?? null,
          nowIso,
          nowIso
        );

        if (participants.length > 0) {
          const insertParticipant = db.prepare(
            `
            INSERT INTO office_meeting_participants (id, meeting_id, participant, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(meeting_id, participant) DO NOTHING
            `
          );
          for (const participant of participants) {
            insertParticipant.run(randomUUID(), id, participant, nowIso);
          }
        }
      });

      transaction();

      const meeting = loadMeetingsWithParticipants(db, "WHERE id = ?", [id])[0];
      if (!meeting) {
        throw dbNotFound(`Meeting not found after create: ${id}`);
      }

      return {
        ok: true,
        meeting
      };
    }, this.dbPath);
  }

  start(id: string): OfficeMeetingResponse {
    return withDatabase((db) => {
      const row = db
        .prepare("SELECT status FROM office_meetings WHERE id = ?")
        .get(id) as { status: string } | undefined;
      if (!row) {
        throw dbNotFound(`Meeting not found: ${id}`);
      }
      if (row.status === "completed" || row.status === "cancelled") {
        throw dbBadRequest(`Meeting cannot be started from status: ${row.status}`);
      }

      const nowIso = new Date().toISOString();

      db.prepare(
        `
        UPDATE office_meetings
        SET status = ?, started_at = ?, updated_at = ?
        WHERE id = ?
        `
      ).run("in_progress", nowIso, nowIso, id);

      const meeting = loadMeetingsWithParticipants(db, "WHERE id = ?", [id])[0];
      if (!meeting) {
        throw dbNotFound(`Meeting not found after start: ${id}`);
      }

      return {
        ok: true,
        meeting
      };
    }, this.dbPath);
  }

  complete(id: string, payload: CompleteOfficeMeetingRequest): OfficeMeetingResponse {
    const parsed = completeOfficeMeetingSchema.safeParse(payload);
    if (!parsed.success) {
      throw dbBadRequest(parsed.error.issues[0]?.message ?? "Invalid meeting completion payload");
    }

    return withDatabase((db) => {
      const exists = db
        .prepare("SELECT id FROM office_meetings WHERE id = ?")
        .get(id) as { id: string } | undefined;
      if (!exists) {
        throw dbNotFound(`Meeting not found: ${id}`);
      }

      const nowIso = new Date().toISOString();
      db.prepare(
        `
        UPDATE office_meetings
        SET status = 'completed', summary = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
        `
      ).run(parsed.data.summary ?? null, nowIso, nowIso, id);

      const meeting = loadMeetingsWithParticipants(db, "WHERE id = ?", [id])[0];
      if (!meeting) {
        throw dbNotFound(`Meeting not found after complete: ${id}`);
      }

      return {
        ok: true,
        meeting
      };
    }, this.dbPath);
  }

  remove(id: string): { ok: true; id: string; deleted: true; meeting: OfficeMeetingView } {
    return withDatabase((db) => {
      const meeting = loadMeetingsWithParticipants(db, "WHERE id = ?", [id])[0];
      if (!meeting) {
        throw dbNotFound(`Meeting not found: ${id}`);
      }
      db.prepare("DELETE FROM office_meetings WHERE id = ?").run(id);
      return {
        ok: true,
        id,
        deleted: true,
        meeting
      };
    }, this.dbPath);
  }
}
