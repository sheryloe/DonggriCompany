import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { RuntimeContext } from "../../types/runtime-context.ts";
import {
  GmailSendBlockedError,
  getGmailSendStatus,
  normalizeEmailRecipients,
  sendGmailMessage,
  type GmailSendStatus,
} from "../../messenger/gmail-client.ts";

export const STRATEGIC_MAINTENANCE_DEPARTMENT_ID = "strategic_maintenance";
export const STRATEGIC_MAINTENANCE_SETTINGS_KEY = "strategicMaintenance";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SCHEDULER_KEY = Symbol.for("donggri.strategicMaintenance.scheduler");

type DbLike = Pick<DatabaseSync, "prepare">;

export type StrategicMaintenanceSettings = {
  enabled: boolean;
  cadence: "weekly";
  dayOfWeek: number;
  hour: number;
  timezone: "Asia/Seoul";
  createTasks: boolean;
  maxTasksPerRun: number;
  emailEnabled: boolean;
  emailTo: string[];
  emailCc: string[];
};

export type StrategicMaintenanceRunRow = {
  id: string;
  status: "running" | "completed" | "failed";
  trigger: "manual" | "scheduler" | "test";
  started_at: number;
  completed_at: number | null;
  report_path: string | null;
  report_json: string | null;
  email_status: "skipped" | "sent" | "blocked" | "failed";
  email_error: string | null;
  email_recipient_count: number;
  created_task_ids_json: string;
  error: string | null;
  created_at: number;
  updated_at: number;
};

export type StrategicMaintenanceStatus = {
  settings: StrategicMaintenanceSettings;
  latestRun: StrategicMaintenanceRunRow | null;
  nextRunAt: number | null;
  inFlight: boolean;
  gmail: GmailSendStatus;
};

type StrategicMaintenanceFinding = {
  id: string;
  severity: "P1" | "P2" | "P3";
  title: string;
  summary: string;
  taskType: "analysis" | "development" | "documentation";
  priority: number;
  evidence: string[];
};

type StrategicMaintenanceReport = {
  report_id: string;
  generated_at: string;
  period_key: string;
  summary: string;
  snapshot: {
    tasks_by_status: Record<string, number>;
    stale_in_progress_count: number;
    recent_error_log_count: number;
    recent_quality_metric_count: number;
    open_project_count: number;
  };
  findings: StrategicMaintenanceFinding[];
  created_task_ids: string[];
};

type RunOptions = {
  trigger: "manual" | "scheduler";
  fetchImpl?: typeof fetch;
};

type SchedulerHandle = {
  stop: () => void;
};

let inFlightRun: Promise<StrategicMaintenanceRunRow> | null = null;

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function defaultStrategicMaintenanceSettings(): StrategicMaintenanceSettings {
  return {
    enabled: false,
    cadence: "weekly",
    dayOfWeek: 1,
    hour: 9,
    timezone: "Asia/Seoul",
    createTasks: true,
    maxTasksPerRun: 5,
    emailEnabled: false,
    emailTo: [],
    emailCc: [],
  };
}

export function normalizeStrategicMaintenanceSettings(raw: unknown): StrategicMaintenanceSettings {
  const source = typeof raw === "string" ? safeJsonParse(raw) : raw;
  const record = normalizeRecord(source);
  const defaults = defaultStrategicMaintenanceSettings();
  return {
    enabled: normalizeBoolean(record.enabled, defaults.enabled),
    cadence: "weekly",
    dayOfWeek: clampInt(record.dayOfWeek, defaults.dayOfWeek, 0, 6),
    hour: clampInt(record.hour, defaults.hour, 0, 23),
    timezone: "Asia/Seoul",
    createTasks: normalizeBoolean(record.createTasks, defaults.createTasks),
    maxTasksPerRun: clampInt(record.maxTasksPerRun, defaults.maxTasksPerRun, 0, 20),
    emailEnabled: normalizeBoolean(record.emailEnabled, defaults.emailEnabled),
    emailTo: normalizeEmailRecipients(record.emailTo),
    emailCc: normalizeEmailRecipients(record.emailCc),
  };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readSettings(db: DbLike): StrategicMaintenanceSettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(STRATEGIC_MAINTENANCE_SETTINGS_KEY) as
    | { value?: string }
    | undefined;
  return normalizeStrategicMaintenanceSettings(row?.value ?? {});
}

function repoRootFromDbPath(dbPath: string): string {
  const dbDir = path.dirname(path.resolve(dbPath));
  if (path.basename(dbDir).toLowerCase() === "data") return path.dirname(dbDir);
  return dbDir;
}

function reportDirFromDbPath(dbPath: string): string {
  return path.join(repoRootFromDbPath(dbPath), "data", "reports", "strategic-maintenance");
}

function kstPeriodKey(now: number): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function buildRunId(now: number): string {
  return `SM-${kstPeriodKey(now).replace(/-/g, "")}-${randomUUID().slice(0, 8)}`;
}

function computeNextWeeklyRunAt(settings: StrategicMaintenanceSettings, now: number): number {
  const local = new Date(now + KST_OFFSET_MS);
  const daysUntil = (settings.dayOfWeek - local.getUTCDay() + 7) % 7;
  const candidateLocalUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + daysUntil,
    settings.hour,
    0,
    0,
    0,
  );
  let candidate = candidateLocalUtc - KST_OFFSET_MS;
  if (candidate <= now) candidate += 7 * 24 * 60 * 60 * 1000;
  return candidate;
}

function listRuns(db: DbLike, limit: number): StrategicMaintenanceRunRow[] {
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  return db
    .prepare(
      `
      SELECT *
      FROM strategic_maintenance_runs
      ORDER BY created_at DESC
      LIMIT ?
    `,
    )
    .all(normalizedLimit) as StrategicMaintenanceRunRow[];
}

export function listStrategicMaintenanceRuns(db: DbLike, limit = 20): StrategicMaintenanceRunRow[] {
  return listRuns(db, limit);
}

function latestRun(db: DbLike): StrategicMaintenanceRunRow | null {
  return (
    (db.prepare("SELECT * FROM strategic_maintenance_runs ORDER BY created_at DESC LIMIT 1").get() as
      | StrategicMaintenanceRunRow
      | undefined) ?? null
  );
}

export function getStrategicMaintenanceStatus(ctx: Pick<RuntimeContext, "db" | "nowMs">): StrategicMaintenanceStatus {
  const settings = readSettings(ctx.db);
  return {
    settings,
    latestRun: latestRun(ctx.db),
    nextRunAt: settings.enabled ? computeNextWeeklyRunAt(settings, ctx.nowMs()) : null,
    inFlight: Boolean(inFlightRun),
    gmail: getGmailSendStatus(ctx.db),
  };
}

function readTaskStatusCounts(db: DbLike): Record<string, number> {
  const rows = db.prepare("SELECT status, COUNT(*) AS cnt FROM tasks GROUP BY status").all() as Array<{
    status?: string;
    cnt?: number;
  }>;
  return Object.fromEntries(rows.map((row) => [String(row.status ?? "unknown"), Number(row.cnt ?? 0)]));
}

function countRows(db: DbLike, sql: string, ...params: SQLInputValue[]): number {
  const row = db.prepare(sql).get(...params) as { cnt?: number } | undefined;
  return Number(row?.cnt ?? 0);
}

function latestProject(db: DbLike): { id: string | null; project_path: string | null } {
  const row = db
    .prepare(
      `
      SELECT id, project_path
      FROM projects
      ORDER BY
        CASE WHEN project_path LIKE '%DonggriCompany%' THEN 0 ELSE 1 END,
        COALESCE(last_used_at, updated_at, created_at, 0) DESC
      LIMIT 1
    `,
    )
    .get() as { id?: string | null; project_path?: string | null } | undefined;
  return {
    id: row?.id ?? null,
    project_path: row?.project_path ?? null,
  };
}

function findStrategicMaintenanceLead(db: DbLike): string | null {
  const row = db
    .prepare(
      `
      SELECT id
      FROM agents
      WHERE department_id = ?
        AND role = 'team_leader'
      ORDER BY authority_level DESC, name ASC
      LIMIT 1
    `,
    )
    .get(STRATEGIC_MAINTENANCE_DEPARTMENT_ID) as { id?: string } | undefined;
  return row?.id ?? null;
}

function buildFindings(snapshot: StrategicMaintenanceReport["snapshot"]): StrategicMaintenanceFinding[] {
  const findings: StrategicMaintenanceFinding[] = [];
  const openBacklog =
    (snapshot.tasks_by_status.inbox ?? 0) +
    (snapshot.tasks_by_status.planned ?? 0) +
    (snapshot.tasks_by_status.review ?? 0);

  if (snapshot.stale_in_progress_count > 0) {
    findings.push({
      id: "stale-in-progress",
      severity: "P1",
      title: "오래 열린 in_progress 작업 복구 점검",
      summary: `${snapshot.stale_in_progress_count}개 작업이 4시간 이상 in_progress 상태입니다.`,
      taskType: "analysis",
      priority: 2,
      evidence: [`stale_in_progress_count=${snapshot.stale_in_progress_count}`],
    });
  }
  if (snapshot.recent_error_log_count > 0) {
    findings.push({
      id: "recent-runtime-errors",
      severity: "P2",
      title: "최근 시스템 오류 로그 원인 분석",
      summary: `최근 7일 task_logs에서 실패/오류 신호 ${snapshot.recent_error_log_count}건이 감지되었습니다.`,
      taskType: "analysis",
      priority: 1,
      evidence: [`recent_error_log_count=${snapshot.recent_error_log_count}`],
    });
  }
  if (openBacklog >= 20) {
    findings.push({
      id: "backlog-triage",
      severity: "P2",
      title: "오픈 태스크 백로그 우선순위 재정리",
      summary: `inbox/planned/review 합산 ${openBacklog}개 작업이 열려 있습니다.`,
      taskType: "documentation",
      priority: 1,
      evidence: [`open_backlog=${openBacklog}`],
    });
  }
  if (snapshot.recent_quality_metric_count === 0) {
    findings.push({
      id: "quality-metric-gap",
      severity: "P2",
      title: "품질 지표 기록 누락 점검",
      summary: "최근 7일 quality_metric_events 기록이 없어 운영 품질 추세 확인이 제한됩니다.",
      taskType: "development",
      priority: 1,
      evidence: ["recent_quality_metric_count=0"],
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: "weekly-system-review",
      severity: "P3",
      title: "주간 시스템 안정성 유지 점검",
      summary: "중대 경보는 없으나 정기적으로 문서, 설정, 태스크 흐름을 확인합니다.",
      taskType: "analysis",
      priority: 0,
      evidence: ["no_critical_findings=true"],
    });
  }

  return findings;
}

function buildReport(ctx: Pick<RuntimeContext, "db" | "nowMs">, runId: string): StrategicMaintenanceReport {
  const now = ctx.nowMs();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const staleCutoff = now - 4 * 60 * 60 * 1000;
  const tasksByStatus = readTaskStatusCounts(ctx.db);
  const snapshot = {
    tasks_by_status: tasksByStatus,
    stale_in_progress_count: countRows(
      ctx.db,
      "SELECT COUNT(*) AS cnt FROM tasks WHERE status = 'in_progress' AND COALESCE(updated_at, started_at, created_at, 0) < ?",
      staleCutoff,
    ),
    recent_error_log_count: countRows(
      ctx.db,
      "SELECT COUNT(*) AS cnt FROM task_logs WHERE created_at >= ? AND (lower(message) LIKE '%error%' OR lower(message) LIKE '%failed%' OR message LIKE '%실패%')",
      sevenDaysAgo,
    ),
    recent_quality_metric_count: countRows(
      ctx.db,
      "SELECT COUNT(*) AS cnt FROM quality_metric_events WHERE recorded_at >= ?",
      sevenDaysAgo,
    ),
    open_project_count: countRows(ctx.db, "SELECT COUNT(*) AS cnt FROM projects"),
  };
  const findings = buildFindings(snapshot);
  const p1Count = findings.filter((finding) => finding.severity === "P1").length;
  const p2Count = findings.filter((finding) => finding.severity === "P2").length;
  return {
    report_id: runId,
    generated_at: new Date(now).toISOString(),
    period_key: kstPeriodKey(now),
    summary: `전략보수 정기 점검 결과 P1 ${p1Count}건, P2 ${p2Count}건, 전체 개선 후보 ${findings.length}건을 기록했습니다.`,
    snapshot,
    findings,
    created_task_ids: [],
  };
}

function renderMarkdown(report: StrategicMaintenanceReport): string {
  const statusRows = Object.entries(report.snapshot.tasks_by_status)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `| ${status} | ${count} |`)
    .join("\n");
  const findingRows = report.findings
    .map((finding) => `| ${finding.severity} | ${finding.title} | ${finding.summary} |`)
    .join("\n");
  return [
    "# DonggriCompany 전략보수 정기 점검 보고서",
    "",
    `- Report ID: ${report.report_id}`,
    `- Generated at: ${report.generated_at}`,
    `- Period: ${report.period_key}`,
    `- Summary: ${report.summary}`,
    "",
    "## 시스템 스냅샷",
    "",
    "| 항목 | 값 |",
    "| --- | ---: |",
    `| 오래 열린 in_progress | ${report.snapshot.stale_in_progress_count} |`,
    `| 최근 오류 로그 | ${report.snapshot.recent_error_log_count} |`,
    `| 최근 품질 지표 | ${report.snapshot.recent_quality_metric_count} |`,
    `| 등록 프로젝트 | ${report.snapshot.open_project_count} |`,
    "",
    "## 태스크 상태",
    "",
    "| 상태 | 개수 |",
    "| --- | ---: |",
    statusRows || "| - | 0 |",
    "",
    "## 개선 후보",
    "",
    "| 우선순위 | 제목 | 요약 |",
    "| --- | --- | --- |",
    findingRows || "| - | - | - |",
    "",
    "## 생성 태스크",
    "",
    ...(report.created_task_ids.length > 0 ? report.created_task_ids.map((id) => `- ${id}`) : ["- 생성된 태스크 없음"]),
    "",
  ].join("\n");
}

function writeReportFiles(ctx: Pick<RuntimeContext, "dbPath">, report: StrategicMaintenanceReport): string {
  const dir = reportDirFromDbPath(ctx.dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const markdown = renderMarkdown(report);
  const json = JSON.stringify(report, null, 2);
  const mdPath = path.join(dir, `${report.report_id}.md`);
  fs.writeFileSync(mdPath, markdown, "utf8");
  fs.writeFileSync(path.join(dir, `${report.report_id}.json`), json, "utf8");
  fs.writeFileSync(path.join(dir, "latest.md"), markdown, "utf8");
  fs.writeFileSync(path.join(dir, "latest.json"), json, "utf8");
  return mdPath;
}

function sourceIdForFinding(periodKey: string, findingId: string): string {
  return `strategic-maintenance:${periodKey}:${findingId}`;
}

function existingTaskForSource(db: DbLike, sourceId: string): string | null {
  const escaped = sourceId.replace(/[%_]/g, "\\$&");
  const row = db
    .prepare("SELECT id FROM tasks WHERE workflow_meta_json LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 1")
    .get(`%"source_id":"${escaped}"%`) as { id?: string } | undefined;
  return row?.id ?? null;
}

function createTasksForFindings(
  ctx: Pick<RuntimeContext, "db" | "nowMs" | "broadcast" | "recordTaskCreationAudit">,
  report: StrategicMaintenanceReport,
  settings: StrategicMaintenanceSettings,
): string[] {
  if (!settings.createTasks || settings.maxTasksPerRun <= 0) return [];
  const project = latestProject(ctx.db);
  const assignedAgentId = findStrategicMaintenanceLead(ctx.db);
  const createdTaskIds: string[] = [];
  const findings = report.findings.slice(0, settings.maxTasksPerRun);
  const insert = ctx.db.prepare(
    `
    INSERT INTO tasks (
      id, title, description, department_id, assigned_agent_id, project_id, status, priority,
      task_type, workflow_pack_key, workflow_meta_json, project_path, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'inbox', ?, ?, 'development', ?, ?, ?, ?)
  `,
  );
  const insertLog = ctx.db.prepare("INSERT INTO task_logs (task_id, kind, message, created_at) VALUES (?, ?, ?, ?)");
  for (const finding of findings) {
    const sourceId = sourceIdForFinding(report.period_key, finding.id);
    const existingTaskId = existingTaskForSource(ctx.db, sourceId);
    if (existingTaskId) {
      createdTaskIds.push(existingTaskId);
      continue;
    }
    const now = ctx.nowMs();
    const id = randomUUID();
    const description = [
      finding.summary,
      "",
      "전략보수팀 정기 점검에서 생성된 개선 태스크입니다.",
      "",
      "Evidence:",
      ...finding.evidence.map((item) => `- ${item}`),
    ].join("\n");
    const workflowMeta = JSON.stringify({
      source: "strategic_maintenance",
      source_id: sourceId,
      report_id: report.report_id,
      finding_id: finding.id,
      severity: finding.severity,
      auto_execute: false,
    });
    insert.run(
      id,
      `[전략보수] ${finding.title}`,
      description,
      STRATEGIC_MAINTENANCE_DEPARTMENT_ID,
      assignedAgentId,
      project.id,
      finding.priority,
      finding.taskType,
      workflowMeta,
      project.project_path,
      now,
      now,
    );
    insertLog.run(id, "system", `Strategic maintenance task created from ${report.report_id}`, now);
    ctx.recordTaskCreationAudit?.({
      taskId: id,
      taskTitle: `[전략보수] ${finding.title}`,
      taskStatus: "inbox",
      departmentId: STRATEGIC_MAINTENANCE_DEPARTMENT_ID,
      assignedAgentId,
      taskType: finding.taskType,
      projectPath: project.project_path,
      trigger: "strategic_maintenance",
      triggerDetail: report.report_id,
      actorType: "system",
      actorId: STRATEGIC_MAINTENANCE_DEPARTMENT_ID,
      actorName: "Strategic Maintenance",
      body: { source_id: sourceId, severity: finding.severity },
    });
    const taskRow = ctx.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    ctx.broadcast?.("task_update", taskRow);
    createdTaskIds.push(id);
  }
  return createdTaskIds;
}

function insertQualityMetric(ctx: Pick<RuntimeContext, "db" | "nowMs">, report: StrategicMaintenanceReport): void {
  try {
    const now = ctx.nowMs();
    ctx.db
      .prepare(
        `
      INSERT INTO quality_metric_events (
        id, metric_key, metric_family, value, unit, status, dimensions_json, evidence_json,
        source_type, source_id, recorded_at, created_at
      )
      VALUES (?, 'strategic_maintenance.findings', 'operations', ?, 'count', 'recorded', ?, ?, 'strategic_maintenance', ?, ?, ?)
      ON CONFLICT(metric_key, source_type, source_id) DO UPDATE SET
        value = excluded.value,
        dimensions_json = excluded.dimensions_json,
        evidence_json = excluded.evidence_json,
        recorded_at = excluded.recorded_at
    `,
      )
      .run(
        randomUUID(),
        report.findings.length,
        JSON.stringify({ period_key: report.period_key }),
        JSON.stringify({ report_id: report.report_id, created_task_ids: report.created_task_ids }),
        report.report_id,
        now,
        now,
      );
  } catch {
    // Quality metrics are best-effort; the run record remains the source of truth.
  }
}

function insertRun(db: DbLike, runId: string, trigger: RunOptions["trigger"], now: number): void {
  db.prepare(
    `
    INSERT INTO strategic_maintenance_runs (
      id, status, trigger, started_at, created_at, updated_at
    )
    VALUES (?, 'running', ?, ?, ?, ?)
  `,
  ).run(runId, trigger, now, now, now);
}

function updateRunComplete(
  db: DbLike,
  runId: string,
  patch: {
    status: "completed" | "failed";
    completedAt: number;
    reportPath?: string | null;
    reportJson?: string | null;
    emailStatus?: StrategicMaintenanceRunRow["email_status"];
    emailError?: string | null;
    emailRecipientCount?: number;
    createdTaskIds?: string[];
    error?: string | null;
  },
): StrategicMaintenanceRunRow {
  db.prepare(
    `
    UPDATE strategic_maintenance_runs
    SET status = ?,
        completed_at = ?,
        report_path = ?,
        report_json = ?,
        email_status = ?,
        email_error = ?,
        email_recipient_count = ?,
        created_task_ids_json = ?,
        error = ?,
        updated_at = ?
    WHERE id = ?
  `,
  ).run(
    patch.status,
    patch.completedAt,
    patch.reportPath ?? null,
    patch.reportJson ?? null,
    patch.emailStatus ?? "skipped",
    patch.emailError ?? null,
    patch.emailRecipientCount ?? 0,
    JSON.stringify(patch.createdTaskIds ?? []),
    patch.error ?? null,
    patch.completedAt,
    runId,
  );
  const row = db.prepare("SELECT * FROM strategic_maintenance_runs WHERE id = ?").get(runId) as
    | StrategicMaintenanceRunRow
    | undefined;
  if (!row) throw new Error("strategic_maintenance_run_missing_after_update");
  return row;
}

async function executeRun(ctx: RuntimeContext, options: RunOptions): Promise<StrategicMaintenanceRunRow> {
  const settings = readSettings(ctx.db);
  const now = ctx.nowMs();
  const runId = buildRunId(now);
  insertRun(ctx.db, runId, options.trigger, now);
  try {
    const report = buildReport(ctx, runId);
    report.created_task_ids = createTasksForFindings(ctx, report, settings);
    const reportPath = writeReportFiles(ctx, report);
    insertQualityMetric(ctx, report);

    let emailStatus: StrategicMaintenanceRunRow["email_status"] = "skipped";
    let emailError: string | null = null;
    let emailRecipientCount = 0;
    if (settings.emailEnabled) {
      emailRecipientCount = settings.emailTo.length;
      try {
        await sendGmailMessage({
          db: ctx.db,
          to: settings.emailTo,
          cc: settings.emailCc,
          subject: `[DonggriCompany] 전략보수 정기 점검 ${report.period_key}`,
          text: renderMarkdown(report),
          fetchImpl: options.fetchImpl,
        });
        emailStatus = "sent";
      } catch (error) {
        if (error instanceof GmailSendBlockedError) {
          emailStatus = "blocked";
          emailError = error.code;
        } else {
          emailStatus = "failed";
          emailError = error instanceof Error ? error.message : String(error);
        }
      }
    }

    return updateRunComplete(ctx.db, runId, {
      status: "completed",
      completedAt: ctx.nowMs(),
      reportPath,
      reportJson: JSON.stringify(report),
      emailStatus,
      emailError,
      emailRecipientCount,
      createdTaskIds: report.created_task_ids,
    });
  } catch (error) {
    return updateRunComplete(ctx.db, runId, {
      status: "failed",
      completedAt: ctx.nowMs(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runStrategicMaintenanceOnce(
  ctx: RuntimeContext,
  options: RunOptions,
): Promise<StrategicMaintenanceRunRow> {
  if (inFlightRun) throw new Error("strategic_maintenance_run_in_progress");
  inFlightRun = executeRun(ctx, options);
  try {
    return await inFlightRun;
  } finally {
    inFlightRun = null;
  }
}

export async function sendStrategicMaintenanceTestEmail(
  ctx: Pick<RuntimeContext, "db" | "nowMs">,
  fetchImpl?: typeof fetch,
): Promise<{ ok: true; recipientCount: number }> {
  const settings = readSettings(ctx.db);
  const to = settings.emailTo;
  if (to.length === 0) throw new GmailSendBlockedError("gmail_recipients_missing");
  await sendGmailMessage({
    db: ctx.db,
    to,
    cc: settings.emailCc,
    subject: "[DonggriCompany] 전략보수 테스트 메일",
    text: [
      "DonggriCompany 전략보수팀 Gmail 발송 테스트입니다.",
      "",
      `sent_at: ${new Date(ctx.nowMs()).toISOString()}`,
      "이 메일이 도착했다면 전략보수 정기 보고서 발송 경로가 준비된 상태입니다.",
    ].join("\n"),
    fetchImpl,
  });
  return { ok: true, recipientCount: to.length };
}

export function startStrategicMaintenanceScheduler(ctx: RuntimeContext): SchedulerHandle {
  const globalState = globalThis as typeof globalThis & { [SCHEDULER_KEY]?: SchedulerHandle };
  if (globalState[SCHEDULER_KEY]) return globalState[SCHEDULER_KEY];
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    const noop = { stop() {} };
    globalState[SCHEDULER_KEY] = noop;
    return noop;
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (stopped) return;
    const settings = readSettings(ctx.db);
    const now = ctx.nowMs();
    const nextAt = settings.enabled ? computeNextWeeklyRunAt(settings, now) : now + 5 * 60 * 1000;
    const delayMs = Math.max(30_000, Math.min(nextAt - now, 24 * 60 * 60 * 1000));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void tick(), delayMs);
    timer.unref?.();
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const settings = readSettings(ctx.db);
      if (settings.enabled && !inFlightRun) {
        await runStrategicMaintenanceOnce(ctx, { trigger: "scheduler" });
      }
    } catch (error) {
      console.warn("[strategic-maintenance] scheduled run failed:", error instanceof Error ? error.message : error);
    } finally {
      schedule();
    }
  };

  schedule();
  const handle = {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      delete globalState[SCHEDULER_KEY];
    },
  };
  globalState[SCHEDULER_KEY] = handle;
  return handle;
}
