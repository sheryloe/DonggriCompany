import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { Meeting, MeetingStatus, MeetingType } from "@workspace/shared";

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db || !_db.open) {
    const dbPath = process.env.WORKSPACE_DB_PATH ?? ".local/workspace.sqlite";
    _db = new Database(dbPath);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA busy_timeout = 5000");
    _db.exec("PRAGMA foreign_keys = ON");
  }
  return _db;
}

function mapMeeting(row: Record<string, unknown>): Meeting {
  return {
    id: row.id as string,
    taskId: (row.task_id as string | null) ?? null,
    title: row.title as string,
    status: row.status as MeetingStatus,
    meetingType: row.meeting_type as MeetingType,
    departmentId: (row.department_id as string | null) ?? null,
    agenda: (row.agenda as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    scheduledAt: (row.scheduled_at as number | null) ?? null,
    startedAt: (row.started_at as number | null) ?? null,
    endedAt: (row.ended_at as number | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export class MeetingService {
  list(taskId?: string): Meeting[] {
    const db = getDb();
    const rows = taskId
      ? (db.prepare("SELECT * FROM meetings WHERE task_id = ? ORDER BY created_at DESC").all(taskId) as Record<string, unknown>[])
      : (db.prepare("SELECT * FROM meetings ORDER BY created_at DESC").all() as Record<string, unknown>[]);
    return rows.map(mapMeeting);
  }

  create(data: {
    title: string;
    taskId?: string;
    meetingType?: MeetingType;
    departmentId?: string;
    agenda?: string;
    scheduledAt?: number;
  }): Meeting {
    const db = getDb();
    const id = randomUUID();
    const now = Date.now();
    db.prepare(`
      INSERT INTO meetings (id, task_id, title, status, meeting_type, department_id, agenda, scheduled_at, created_at, updated_at)
      VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.taskId ?? null,
      data.title,
      data.meetingType ?? "planned",
      data.departmentId ?? null,
      data.agenda ?? null,
      data.scheduledAt ?? null,
      now, now
    );
    return mapMeeting(db.prepare("SELECT * FROM meetings WHERE id = ?").get(id) as Record<string, unknown>);
  }

  start(id: string): Meeting {
    const db = getDb();
    const now = Date.now();
    db.prepare("UPDATE meetings SET status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
    return mapMeeting(db.prepare("SELECT * FROM meetings WHERE id = ?").get(id) as Record<string, unknown>);
  }

  complete(id: string, summary?: string): Meeting {
    const db = getDb();
    const now = Date.now();
    db.prepare(
      "UPDATE meetings SET status = 'completed', ended_at = ?, summary = ?, updated_at = ? WHERE id = ?"
    ).run(now, summary ?? null, now, id);
    return mapMeeting(db.prepare("SELECT * FROM meetings WHERE id = ?").get(id) as Record<string, unknown>);
  }

  delete(id: string): void {
    getDb().prepare("DELETE FROM meetings WHERE id = ?").run(id);
  }
}
