import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";

const REPORT_DOC_TEXT_LIMIT = 120_000;
const REPORT_PREVIEW_LIMIT = 260;
const TEXT_DOC_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".yml",
  ".yaml",
  ".csv",
  ".log",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".html",
  ".xml",
  ".sql",
]);
const BINARY_DOC_EXTENSIONS = new Set([".pdf", ".ppt", ".pptx", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp"]);
const BLOCKED_REPORT_DOC_EXTENSIONS = new Set([
  ".env",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".crt",
  ".cer",
  ".der",
  ".log",
]);
const BLOCKED_REPORT_DOC_SEGMENTS = new Set([
  ".git",
  ".ssh",
  ".gnupg",
  "node_modules",
  ".pnpm-store",
  ".cache",
  "auth",
  "tokens",
  "credentials",
  "secrets",
]);
const BLOCKED_REPORT_DOC_BASENAME = /(?:^\.env(?:\.|$)|secret|token|credential|password|private[-_]?key|api[-_]?key)/i;

type HelperDeps = {
  db: RuntimeContext["db"];
  nowMs: RuntimeContext["nowMs"];
};

function normalizePathForCompare(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" || process.platform === "darwin" ? normalized.toLowerCase() : normalized;
}

function isPathInsideRoot(candidatePath: string, rootPath: string): boolean {
  const rel = path.relative(normalizePathForCompare(rootPath), normalizePathForCompare(candidatePath));
  if (!rel) return true;
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function isSafeReportDocumentPath(absPath: string): boolean {
  const ext = path.extname(absPath).toLowerCase();
  if (BLOCKED_REPORT_DOC_EXTENSIONS.has(ext)) return false;

  const parts = path
    .normalize(absPath)
    .split(path.sep)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (parts.some((part) => BLOCKED_REPORT_DOC_SEGMENTS.has(part))) return false;
  return !BLOCKED_REPORT_DOC_BASENAME.test(path.basename(absPath));
}

export function resolveReportDocumentPath(candidate: string, projectPath: string | null): string | null {
  const raw = typeof candidate === "string" ? candidate.trim() : "";
  if (!raw) return null;
  const root = path.resolve(projectPath || process.cwd());
  const absPath = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw);
  if (!isPathInsideRoot(absPath, root)) return null;
  if (!isSafeReportDocumentPath(absPath)) return null;
  return absPath;
}

export function createTaskReportHelpers(deps: HelperDeps) {
  const { db } = deps;

  function normalizeTaskText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  function buildTextPreview(content: string, maxChars = REPORT_PREVIEW_LIMIT): string {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars).trimEnd()}...`;
  }

  function normalizeProjectName(projectPath: unknown, fallbackTitle = "General"): string {
    const p = normalizeTaskText(projectPath);
    if (!p) return fallbackTitle;
    try {
      const normalized = p.replace(/[\\/]+$/, "");
      const name = path.basename(normalized);
      return name || fallbackTitle;
    } catch {
      return fallbackTitle;
    }
  }

  function extractTargetFilePath(description: unknown): string | null {
    const desc = normalizeTaskText(description);
    if (!desc) return null;
    const m = desc.match(/target file path:\s*(.+)/i);
    if (!m?.[1]) return null;
    return m[1].trim().replace(/^['"`]|['"`]$/g, "");
  }

  function extractDocumentPathCandidates(texts: string[]): string[] {
    const out = new Set<string>();
    const pattern =
      /(?:[A-Za-z]:\\|\/)?[^\s"'`<>|]+?\.(?:md|markdown|txt|json|ya?ml|csv|log|html?|pdf|pptx?|docx?|png|jpe?g|webp)/gi;
    for (const rawText of texts) {
      if (!rawText) continue;
      const matches = rawText.match(pattern) ?? [];
      for (const m of matches) {
        const cleaned = m.replace(/[),.;:]+$/g, "").trim();
        if (cleaned.length > 1) out.add(cleaned);
      }
    }
    return [...out];
  }

  function readReportDocument(pathCandidate: string, projectPath: string | null): Record<string, unknown> | null {
    try {
      const absPath = resolveReportDocumentPath(pathCandidate, projectPath);
      if (!absPath) return null;
      if (!fs.existsSync(absPath)) return null;
      const stat = fs.statSync(absPath);
      if (!stat.isFile()) return null;

      const ext = path.extname(absPath).toLowerCase();
      const rel = path.relative(process.cwd(), absPath).replace(/\\/g, "/");
      const docId = `file:${rel}`;

      if (BINARY_DOC_EXTENSIONS.has(ext)) {
        return {
          id: docId,
          title: path.basename(absPath),
          source: "file",
          path: rel,
          mime:
            ext === ".pdf"
              ? "application/pdf"
              : ext === ".png"
                ? "image/png"
                : ext === ".jpg" || ext === ".jpeg"
                  ? "image/jpeg"
                  : ext === ".webp"
                    ? "image/webp"
                    : ext === ".ppt" || ext === ".pptx"
                      ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                      : "application/octet-stream",
          size_bytes: stat.size,
          updated_at: stat.mtimeMs,
          truncated: false,
          text_preview: `Binary document generated: ${rel}`,
          content: `Binary document generated at ${rel} (${Math.round(stat.size / 1024)} KB).`,
        };
      }

      if (!TEXT_DOC_EXTENSIONS.has(ext) && stat.size > 512_000) {
        return null;
      }

      const raw = fs.readFileSync(absPath, "utf8");
      const truncated = raw.length > REPORT_DOC_TEXT_LIMIT;
      const content = truncated ? `${raw.slice(0, REPORT_DOC_TEXT_LIMIT)}\n\n...[truncated]` : raw;
      return {
        id: docId,
        title: path.basename(absPath),
        source: "file",
        path: rel,
        mime: "text/plain",
        size_bytes: stat.size,
        updated_at: stat.mtimeMs,
        truncated,
        text_preview: buildTextPreview(content),
        content,
      };
    } catch {
      return null;
    }
  }

  function documentPriority(doc: Record<string, unknown>): number {
    const joined = `${normalizeTaskText(doc.path)} ${normalizeTaskText(doc.title)}`.toLowerCase();
    if (/\.(md|markdown)\b/.test(joined)) return 0;
    const source = normalizeTaskText(doc.source);
    if (source === "file") return 1;
    if (source === "report_message") return 2;
    if (source === "task_result") return 3;
    return 4;
  }

  function sortReportDocuments(docs: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return [...docs].sort((a, b) => {
      const pa = documentPriority(a);
      const pb = documentPriority(b);
      if (pa !== pb) return pa - pb;
      const ua = Number(a.updated_at ?? 0) || 0;
      const ub = Number(b.updated_at ?? 0) || 0;
      if (ua !== ub) return ub - ua;
      return normalizeTaskText(a.title).localeCompare(normalizeTaskText(b.title));
    });
  }

  function extractFirstMatch(texts: string[], pattern: RegExp): string | null {
    for (const text of texts) {
      if (!text) continue;
      const match = text.match(pattern);
      const value = match?.[1]?.trim();
      if (value) return value.replace(/[),.;]+$/g, "");
    }
    return null;
  }

  function extractCommitHash(texts: string[]): string | null {
    return (
      extractFirstMatch(texts, /(?:commit|sha|revision|rev)[\s:#=-]*([a-f0-9]{7,40})/i) ??
      extractFirstMatch(texts, /\/commit\/([a-f0-9]{7,40})/i) ??
      null
    );
  }

  function extractCiUrl(texts: string[]): string | null {
    return extractFirstMatch(texts, /(https?:\/\/[^\s"'`<>]+(?:actions\/runs|pipelines|ci|build)[^\s"'`<>]*)/i);
  }

  function extractSmokeScreenshotPath(documents: Array<Record<string, unknown>>): string | null {
    for (const doc of documents) {
      const joined = `${normalizeTaskText(doc.path)} ${normalizeTaskText(doc.title)} ${normalizeTaskText(doc.mime)}`;
      if (/\.(png|jpe?g|webp)\b/i.test(joined) || /^image\//i.test(normalizeTaskText(doc.mime))) {
        return normalizeTaskText(doc.path) || normalizeTaskText(doc.title) || null;
      }
    }
    return null;
  }

  function buildQualityEvidence(input: {
    taskRow: Record<string, unknown>;
    logs?: Array<{ kind?: string; message?: string; created_at?: number } | Record<string, unknown>>;
    meetingMinutes?: Array<Record<string, unknown>>;
    documents?: Array<Record<string, unknown>>;
    reportMessages?: Array<Record<string, unknown>>;
  }): Record<string, unknown> {
    const logs = input.logs ?? [];
    const meetingMinutes = input.meetingMinutes ?? [];
    const documents = input.documents ?? [];
    const reportMessages = input.reportMessages ?? [];
    const taskResult = normalizeTaskText(input.taskRow.result);
    const logTexts = logs.map((log) => normalizeTaskText((log as Record<string, unknown>).message));
    const reportTexts = reportMessages.map((message) => normalizeTaskText(message.content));
    const documentTexts = documents.flatMap((doc) => [
      normalizeTaskText(doc.title),
      normalizeTaskText(doc.path),
      normalizeTaskText(doc.text_preview),
      normalizeTaskText(doc.content).slice(0, 2_000),
    ]);
    const allTexts = [
      normalizeTaskText(input.taskRow.title),
      normalizeTaskText(input.taskRow.description),
      taskResult,
      ...logTexts,
      ...reportTexts,
      ...documentTexts,
    ].filter(Boolean);
    const verificationText =
      logTexts.find((text) => /test|build|검증|테스트|passed|success|screenshot|smoke/i.test(text)) ??
      documentTexts.find((text) => /test|build|검증|테스트|passed|success|screenshot|smoke/i.test(text)) ??
      null;
    const traceabilityNotes = [
      reportMessages.length > 0 ? `${reportMessages.length} report message(s)` : "",
      documents.length > 0 ? `${documents.length} report document(s)` : "",
      meetingMinutes.length > 0 ? `${meetingMinutes.length} meeting minute(s)` : "",
      logs.length > 0 ? `${logs.length} task log line(s)` : "",
    ].filter(Boolean);

    return {
      change_request: normalizeTaskText(input.taskRow.description) || normalizeTaskText(input.taskRow.title) || null,
      implementation_result: taskResult || reportTexts[0] || null,
      verification_result: verificationText,
      approval_record:
        normalizeTaskText(input.taskRow.status) === "done"
          ? `Task status done at ${Number(input.taskRow.completed_at ?? 0) || "-"}`
          : null,
      traceability_notes: traceabilityNotes,
      smoke_screenshot_path: extractSmokeScreenshotPath(documents),
      commit_hash: extractCommitHash(allTexts),
      ci_url: extractCiUrl(allTexts),
    };
  }

  function mergeQualityEvidence(
    rootTask: Record<string, unknown>,
    sections: Array<Record<string, unknown>>,
  ): Record<string, unknown> {
    const evidences = sections
      .map((section) => section.quality_evidence as Record<string, unknown> | undefined)
      .filter((evidence): evidence is Record<string, unknown> => Boolean(evidence));
    const first = (key: string): string | null => {
      for (const evidence of evidences) {
        const value = normalizeTaskText(evidence[key]);
        if (value) return value;
      }
      return null;
    };
    const notes = [
      ...new Set(evidences.flatMap((evidence) => ((evidence.traceability_notes as string[] | undefined) ?? []))),
    ].slice(0, 12);

    return {
      change_request: normalizeTaskText(rootTask.description) || normalizeTaskText(rootTask.title) || null,
      implementation_result: first("implementation_result"),
      verification_result: first("verification_result"),
      approval_record:
        normalizeTaskText(rootTask.status) === "done"
          ? `Root task status done at ${Number(rootTask.completed_at ?? 0) || "-"}`
          : first("approval_record"),
      traceability_notes: notes,
      smoke_screenshot_path: first("smoke_screenshot_path"),
      commit_hash: first("commit_hash"),
      ci_url: first("ci_url"),
    };
  }

  function fetchMeetingMinutesForTask(taskId: string): Array<Record<string, unknown>> {
    return db
      .prepare(
        `
    SELECT
      mm.meeting_type,
      mm.round AS round_number,
      COALESCE((
        SELECT group_concat(entry_line, '\n')
        FROM (
          SELECT printf('[%s] %s', COALESCE(e.speaker_name, 'Unknown'), e.content) AS entry_line
          FROM meeting_minute_entries e
          WHERE e.meeting_id = mm.id
          ORDER BY e.seq ASC, e.id ASC
        )
      ), '') AS entries,
      mm.created_at
    FROM meeting_minutes mm
    WHERE mm.task_id = ?
    ORDER BY mm.created_at ASC
  `,
      )
      .all(taskId) as Array<Record<string, unknown>>;
  }

  function fetchReportMessages(taskId: string): Array<Record<string, unknown>> {
    return db
      .prepare(
        `
    SELECT m.id, m.content, m.created_at, m.sender_id,
           COALESCE(a.name, '') AS sender_name,
           COALESCE(a.name_ko, '') AS sender_name_ko,
           COALESCE(a.department_id, '') AS sender_department_id,
           COALESCE(d.name, '') AS sender_department_name,
           COALESCE(d.name_ko, '') AS sender_department_name_ko
    FROM messages m
    LEFT JOIN agents a ON a.id = m.sender_id
    LEFT JOIN departments d ON d.id = a.department_id
    WHERE m.task_id = ? AND m.message_type = 'report'
    ORDER BY m.created_at DESC
  `,
      )
      .all(taskId) as Array<Record<string, unknown>>;
  }

  function buildTaskSection(
    taskRow: Record<string, unknown>,
    linkedSubtasks: Array<Record<string, unknown>>,
  ): Record<string, unknown> {
    const taskId = String(taskRow.id ?? "");
    const taskLogs = db
      .prepare("SELECT kind, message, created_at FROM task_logs WHERE task_id = ? ORDER BY created_at ASC")
      .all(taskId) as Array<{ kind: string; message: string; created_at: number }>;
    const taskMinutes = fetchMeetingMinutesForTask(taskId);
    const reportMessages = fetchReportMessages(taskId);
    const taskResult = normalizeTaskText(taskRow.result);
    const docs: Array<Record<string, unknown>> = [];

    const addTextDocument = (
      id: string,
      title: string,
      source: string,
      contentRaw: string,
      createdAt: number | null,
    ) => {
      const content = contentRaw.trim();
      if (!content) return;
      const truncated = content.length > REPORT_DOC_TEXT_LIMIT;
      const trimmed = truncated ? `${content.slice(0, REPORT_DOC_TEXT_LIMIT)}\n\n...[truncated]` : content;
      docs.push({
        id,
        title,
        source,
        path: null,
        mime: "text/plain",
        size_bytes: null,
        updated_at: createdAt,
        truncated,
        text_preview: buildTextPreview(trimmed),
        content: trimmed,
      });
    };

    if (taskResult) {
      addTextDocument(
        `result:${taskId}`,
        "Execution Result",
        "task_result",
        taskResult,
        Number(taskRow.completed_at ?? 0) || null,
      );
    }

    for (const msg of reportMessages.slice(0, 6)) {
      const content = normalizeTaskText(msg.content);
      if (!content) continue;
      const msgId = String(msg.id ?? randomUUID());
      const senderName = normalizeTaskText(msg.sender_name) || "Agent";
      addTextDocument(
        `report-msg:${msgId}`,
        `Report by ${senderName}`,
        "report_message",
        content,
        Number(msg.created_at ?? 0) || null,
      );
    }

    const targetFile = extractTargetFilePath(taskRow.description);
    const pathCandidates = new Set<string>();
    if (targetFile) pathCandidates.add(targetFile);
    for (const c of extractDocumentPathCandidates([
      normalizeTaskText(taskRow.description),
      taskResult,
      ...reportMessages.slice(0, 6).map((m) => normalizeTaskText(m.content)),
      ...taskLogs.slice(-8).map((l) => normalizeTaskText(l.message)),
    ])) {
      pathCandidates.add(c);
    }
    for (const candidate of pathCandidates) {
      const doc = readReportDocument(candidate, normalizeTaskText(taskRow.project_path) || null);
      if (doc) docs.push(doc);
    }

    const latestReportContent = normalizeTaskText(reportMessages[0]?.content);
    const fallbackSummary =
      latestReportContent ||
      buildTextPreview(taskResult, 400) ||
      buildTextPreview(normalizeTaskText(taskLogs[taskLogs.length - 1]?.message), 400);

    return {
      id: taskId,
      task_id: taskId,
      source_task_id: taskRow.source_task_id ?? null,
      title: taskRow.title ?? "",
      status: taskRow.status ?? "",
      department_id: taskRow.department_id ?? null,
      department_name: taskRow.dept_name ?? "",
      department_name_ko: taskRow.dept_name_ko ?? "",
      agent_id: taskRow.assigned_agent_id ?? null,
      agent_name: taskRow.agent_name ?? "",
      agent_name_ko: taskRow.agent_name_ko ?? "",
      agent_role: taskRow.agent_role ?? "",
      created_at: Number(taskRow.created_at ?? 0) || 0,
      started_at: Number(taskRow.started_at ?? 0) || null,
      completed_at: Number(taskRow.completed_at ?? 0) || null,
      summary: fallbackSummary,
      report_messages: reportMessages,
      logs: taskLogs,
      meeting_minutes: taskMinutes,
      documents: sortReportDocuments(docs),
      linked_subtasks: linkedSubtasks,
      quality_evidence: buildQualityEvidence({
        taskRow,
        logs: taskLogs,
        meetingMinutes: taskMinutes,
        documents: sortReportDocuments(docs),
        reportMessages,
      }),
    };
  }

  return {
    normalizeTaskText,
    buildTextPreview,
    normalizeProjectName,
    sortReportDocuments,
    fetchMeetingMinutesForTask,
    buildTaskSection,
    buildQualityEvidence,
    mergeQualityEvidence,
  };
}
