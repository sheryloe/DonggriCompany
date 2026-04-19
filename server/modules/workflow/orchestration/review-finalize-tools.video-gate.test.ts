import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createReviewFinalizeTools } from "./review-finalize-tools.ts";

function createDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      department_id TEXT,
      source_task_id TEXT,
      project_id TEXT,
      workflow_pack_key TEXT,
      workflow_meta_json TEXT,
      project_path TEXT,
      created_at INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT 0
    );

    CREATE TABLE subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL,
      delegated_task_id TEXT,
      blocked_reason TEXT,
      completed_at INTEGER
    );
  `);
  return db;
}

describe("review finalize video gate", () => {
  it("records review_consensus hard-block metadata in workflow_meta_json", () => {
    const db = createDb();
    try {
      const taskId = "task-review-block-meta";
      db.prepare(
        `
          INSERT INTO tasks (id, title, status, department_id, source_task_id, project_id, workflow_pack_key, workflow_meta_json, project_path, created_at, updated_at)
          VALUES (?, ?, 'review', 'planning', NULL, 'project-1', 'general', ?, ?, 1, 1)
        `,
      ).run(taskId, "Review block meta test", JSON.stringify({}), "/tmp/non-existing-video-root");

      const appendTaskLog = vi.fn();
      const notifyCeo = vi.fn();
      const startReviewConsensusMeeting = vi.fn(
        (
          _taskId: string,
          _taskTitle: string,
          _departmentId: string | null,
          _onApproved: () => void,
          onBlocked?: (reasons: string[]) => void,
        ) => {
          onBlocked?.(["approval_gate=human-approval-general", "missing_orchestrator_team_lead", "quorum_not_met:1/2"]);
        },
      );
      const mergeWorktree = vi.fn(() => ({ success: true, message: "merged" }));

      const tools = createReviewFinalizeTools({
        db,
        nowMs: () => 1700000000000,
        broadcast: vi.fn(),
        appendTaskLog,
        getPreferredLanguage: () => "en",
        pickL: (pool: any) => (Array.isArray(pool?.en) ? pool.en[0] : ""),
        l: (ko: string[], en: string[], ja: string[], zh: string[]) => ({ ko, en, ja, zh }),
        resolveLang: () => "en",
        getProjectReviewGateSnapshot: () => ({ activeReview: 1, activeTotal: 1, ready: true }),
        projectReviewGateNotifiedAt: new Map<string, number>(),
        notifyCeo,
        taskWorktrees: new Map<string, { worktreePath: string; projectPath: string; branchName: string }>(),
        mergeToDevAndCreatePR: vi.fn(() => ({ success: true, message: "pr created" })),
        mergeWorktree,
        cleanupWorktree: vi.fn(),
        findTeamLeader: vi.fn(() => null),
        getAgentDisplayName: vi.fn(() => "Leader"),
        setTaskCreationAuditCompletion: vi.fn(),
        endTaskExecutionSession: vi.fn(),
        notifyTaskStatus: vi.fn(),
        refreshCliUsageData: vi.fn(async () => ({})),
        shouldDeferTaskReportUntilPlanningArchive: vi.fn(() => false),
        emitTaskReportEvent: vi.fn(),
        formatTaskSubtaskProgressSummary: vi.fn(() => ""),
        reviewRoundState: new Map<string, number>(),
        reviewInFlight: new Set<string>(),
        archivePlanningConsolidatedReport: vi.fn(async () => undefined),
        crossDeptNextCallbacks: new Map<string, () => void>(),
        recoverCrossDeptQueueAfterMissingCallback: vi.fn(),
        subtaskDelegationCallbacks: new Map<string, () => void>(),
        startReviewConsensusMeeting,
        processSubtaskDelegations: vi.fn(),
      } as any);

      tools.finishReview(taskId, "Review block meta test", {
        bypassProjectDecisionGate: true,
        trigger: "test",
      });

      const updated = db
        .prepare("SELECT workflow_meta_json FROM tasks WHERE id = ?")
        .get(taskId) as { workflow_meta_json: string | null };
      const meta = updated.workflow_meta_json ? JSON.parse(updated.workflow_meta_json) : {};
      expect(meta.review_consent).toMatchObject({
        stage: "review_consensus",
        blocked: true,
        trigger: "hard_block",
        state: "blocked",
      });
      expect(meta.review_consent.blocked_at).toBe(1700000000000);
      expect((meta.review_consent as { blocked_by: string[] }).blocked_by).toEqual(
        expect.arrayContaining(["approval_gate_blocked", "authority_missing", "quorum_not_met"]),
      );
      expect(appendTaskLog).toHaveBeenCalledWith(
        taskId,
        "system",
        expect.stringContaining("Review consensus hard-blocked before approval"),
      );
      expect(startReviewConsensusMeeting).toHaveBeenCalledTimes(1);
      expect(mergeWorktree).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
  it("video_preprod task는 final.mp4 확인 전 승인/머지를 진행하지 않는다", () => {
    const db = createDb();
    try {
      const taskId = "task-video-1";
      db.prepare(
        `
          INSERT INTO tasks (id, title, status, department_id, source_task_id, project_id, workflow_pack_key, project_path, created_at, updated_at)
          VALUES (?, ?, 'review', 'planning', NULL, 'project-1', 'video_preprod', ?, 1, 1)
        `,
      ).run(taskId, "Video intro", "/tmp/non-existing-video-root");

      const appendTaskLog = vi.fn();
      const notifyCeo = vi.fn();
      const startReviewConsensusMeeting = vi.fn();
      const mergeWorktree = vi.fn(() => ({ success: true, message: "merged" }));

      const tools = createReviewFinalizeTools({
        db,
        nowMs: () => 1700000000000,
        broadcast: vi.fn(),
        appendTaskLog,
        getPreferredLanguage: () => "ko",
        pickL: (pool: any) => (Array.isArray(pool?.ko) ? pool.ko[0] : ""),
        l: (ko: string[], en: string[], ja: string[], zh: string[]) => ({ ko, en, ja, zh }),
        resolveLang: () => "ko",
        getProjectReviewGateSnapshot: () => ({ activeReview: 1, activeTotal: 1, ready: true }),
        projectReviewGateNotifiedAt: new Map<string, number>(),
        notifyCeo,
        taskWorktrees: new Map<string, { worktreePath: string; projectPath: string; branchName: string }>(),
        mergeToDevAndCreatePR: vi.fn(() => ({ success: true, message: "pr created" })),
        mergeWorktree,
        cleanupWorktree: vi.fn(),
        findTeamLeader: vi.fn(() => null),
        getAgentDisplayName: vi.fn(() => "팀장"),
        setTaskCreationAuditCompletion: vi.fn(),
        endTaskExecutionSession: vi.fn(),
        notifyTaskStatus: vi.fn(),
        refreshCliUsageData: vi.fn(async () => ({})),
        shouldDeferTaskReportUntilPlanningArchive: vi.fn(() => false),
        emitTaskReportEvent: vi.fn(),
        formatTaskSubtaskProgressSummary: vi.fn(() => ""),
        reviewRoundState: new Map<string, number>(),
        reviewInFlight: new Set<string>(),
        archivePlanningConsolidatedReport: vi.fn(async () => undefined),
        crossDeptNextCallbacks: new Map<string, () => void>(),
        recoverCrossDeptQueueAfterMissingCallback: vi.fn(),
        subtaskDelegationCallbacks: new Map<string, () => void>(),
        startReviewConsensusMeeting,
      } as any);

      tools.finishReview(taskId, "Video intro", {
        bypassProjectDecisionGate: true,
        trigger: "test",
      });

      const updated = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: string };
      expect(updated.status).toBe("review");
      expect(startReviewConsensusMeeting).not.toHaveBeenCalled();
      expect(mergeWorktree).not.toHaveBeenCalled();
      expect(appendTaskLog).toHaveBeenCalledWith(
        taskId,
        "system",
        expect.stringContaining("Review hold: video artifact gate blocked approval"),
      );
      expect(notifyCeo).toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it("video artifact가 있어도 Remotion 증빙이 없으면 승인/머지를 차단한다", () => {
    const db = createDb();
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-review-gate-"));
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-review-logs-"));
    try {
      const taskId = "task-video-remotion-missing";
      const outputDir = path.join(projectRoot, "video_output");
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(path.join(outputDir, "final.mp4"), "dummy-video", "utf8");

      db.prepare(
        `
          INSERT INTO tasks (id, title, status, department_id, source_task_id, project_id, workflow_pack_key, project_path, created_at, updated_at)
          VALUES (?, ?, 'review', 'planning', NULL, 'project-1', 'video_preprod', ?, 1, 1)
        `,
      ).run(taskId, "Video intro", projectRoot);

      const appendTaskLog = vi.fn();
      const notifyCeo = vi.fn();
      const startReviewConsensusMeeting = vi.fn();
      const mergeWorktree = vi.fn(() => ({ success: true, message: "merged" }));

      const tools = createReviewFinalizeTools({
        db,
        nowMs: () => 1700000000000,
        logsDir,
        broadcast: vi.fn(),
        appendTaskLog,
        getPreferredLanguage: () => "ko",
        pickL: (pool: any) => (Array.isArray(pool?.ko) ? pool.ko[0] : ""),
        l: (ko: string[], en: string[], ja: string[], zh: string[]) => ({ ko, en, ja, zh }),
        resolveLang: () => "ko",
        getProjectReviewGateSnapshot: () => ({ activeReview: 1, activeTotal: 1, ready: true }),
        projectReviewGateNotifiedAt: new Map<string, number>(),
        notifyCeo,
        taskWorktrees: new Map<string, { worktreePath: string; projectPath: string; branchName: string }>(),
        mergeToDevAndCreatePR: vi.fn(() => ({ success: true, message: "pr created" })),
        mergeWorktree,
        cleanupWorktree: vi.fn(),
        findTeamLeader: vi.fn(() => null),
        getAgentDisplayName: vi.fn(() => "팀장"),
        setTaskCreationAuditCompletion: vi.fn(),
        endTaskExecutionSession: vi.fn(),
        notifyTaskStatus: vi.fn(),
        refreshCliUsageData: vi.fn(async () => ({})),
        shouldDeferTaskReportUntilPlanningArchive: vi.fn(() => false),
        emitTaskReportEvent: vi.fn(),
        formatTaskSubtaskProgressSummary: vi.fn(() => ""),
        reviewRoundState: new Map<string, number>(),
        reviewInFlight: new Set<string>(),
        archivePlanningConsolidatedReport: vi.fn(async () => undefined),
        crossDeptNextCallbacks: new Map<string, () => void>(),
        recoverCrossDeptQueueAfterMissingCallback: vi.fn(),
        subtaskDelegationCallbacks: new Map<string, () => void>(),
        startReviewConsensusMeeting,
      } as any);

      tools.finishReview(taskId, "Video intro", {
        bypassProjectDecisionGate: true,
        trigger: "test",
      });

      const updated = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: string };
      expect(updated.status).toBe("review");
      expect(startReviewConsensusMeeting).not.toHaveBeenCalled();
      expect(mergeWorktree).not.toHaveBeenCalled();
      expect(appendTaskLog).toHaveBeenCalledWith(
        taskId,
        "system",
        expect.stringContaining("remotion evidence missing/invalid"),
      );
      expect(notifyCeo).toHaveBeenCalled();
    } finally {
      try {
        fs.rmSync(projectRoot, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      try {
        fs.rmSync(logsDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      db.close();
    }
  });

  it("clears review_consensus hard-block metadata after approval callback", () => {
    const db = createDb();
    try {
      const taskId = "task-review-clear-meta";
      db.prepare(
        `
          INSERT INTO tasks (
            id, title, status, department_id, source_task_id, project_id, workflow_pack_key, workflow_meta_json, project_path, created_at, updated_at
          )
          VALUES (?, ?, 'review', 'planning', NULL, NULL, 'general', ?, '/tmp/project', 1, 1)
        `,
      ).run(
        taskId,
        "Review clear meta",
        JSON.stringify({ review_consent: { stage: "review_consensus", blocked: true, blocked_by: ["authority_missing"], state: "blocked" } }),
      );

      const appendTaskLog = vi.fn();
      const notifyCeo = vi.fn();
      const startReviewConsensusMeeting = vi.fn(
        (
          _taskId: string,
          _taskTitle: string,
          _departmentId: string | null,
          onApproved: () => void,
        ) => {
          onApproved();
        },
      );

      const tools = createReviewFinalizeTools({
        db,
        nowMs: () => 1700000000000,
        broadcast: vi.fn(),
        appendTaskLog,
        getPreferredLanguage: () => "en",
        pickL: (pool: any) => (Array.isArray(pool?.en) ? pool.en[0] : ""),
        l: (ko: string[], en: string[], ja: string[], zh: string[]) => ({ ko, en, ja, zh }),
        resolveLang: () => "en",
        getProjectReviewGateSnapshot: () => ({ activeReview: 1, activeTotal: 1, ready: true }),
        projectReviewGateNotifiedAt: new Map<string, number>(),
        notifyCeo,
        taskWorktrees: new Map<string, { worktreePath: string; projectPath: string; branchName: string }>(),
        mergeToDevAndCreatePR: vi.fn(() => ({ success: true, message: "pr created" })),
        mergeWorktree: vi.fn(() => ({ success: true, message: "merged" })),
        cleanupWorktree: vi.fn(),
        findTeamLeader: vi.fn(() => null),
        getAgentDisplayName: vi.fn(() => "Leader"),
        setTaskCreationAuditCompletion: vi.fn(),
        endTaskExecutionSession: vi.fn(),
        notifyTaskStatus: vi.fn(),
        refreshCliUsageData: vi.fn(async () => ({ tasks: 0 })),
        shouldDeferTaskReportUntilPlanningArchive: vi.fn(() => false),
        emitTaskReportEvent: vi.fn(),
        formatTaskSubtaskProgressSummary: vi.fn(() => ""),
        reviewRoundState: new Map<string, number>(),
        reviewInFlight: new Set<string>(),
        archivePlanningConsolidatedReport: vi.fn(async () => undefined),
        crossDeptNextCallbacks: new Map<string, () => void>(),
        recoverCrossDeptQueueAfterMissingCallback: vi.fn(),
        subtaskDelegationCallbacks: new Map<string, () => void>(),
        startReviewConsensusMeeting,
        processSubtaskDelegations: vi.fn(),
      } as any);

      tools.finishReview(taskId, "Review clear meta", {
        bypassProjectDecisionGate: true,
        trigger: "test-clear",
      });

      const updated = db
        .prepare("SELECT status, workflow_meta_json FROM tasks WHERE id = ?")
        .get(taskId) as { status: string; workflow_meta_json: string | null };
      const meta = updated.workflow_meta_json ? JSON.parse(updated.workflow_meta_json) : {};
      expect(updated.status).toBe("done");
      expect(meta.review_consent.blocked).toBe(false);
      expect(meta.review_consent.state).toBe("approved");
      expect((meta.review_consent as { blocked_by: string[] }).blocked_by).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("proceeds to review consensus when video artifact and remotion evidence are valid", () => {
    const db = createDb();
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-review-gate-pass-"));
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-review-logs-pass-"));
    try {
      const taskId = "task-video-remotion-pass";
      const outputDir = path.join(projectRoot, "video_output");
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(path.join(outputDir, "final.mp4"), "dummy-video", "utf8");
      fs.writeFileSync(
        path.join(logsDir, `${taskId}.log`),
        "pnpm exec remotion render src/index.ts Intro video_output/final.mp4 --log=verbose",
        "utf8",
      );

      db.prepare(
        `
          INSERT INTO tasks (id, title, status, department_id, source_task_id, project_id, workflow_pack_key, project_path, created_at, updated_at)
          VALUES (?, ?, 'review', 'planning', NULL, 'project-1', 'video_preprod', ?, 1, 1)
        `,
      ).run(taskId, "Video intro pass", projectRoot);

      const startReviewConsensusMeeting = vi.fn(
        (
          _taskId: string,
          _taskTitle: string,
          _departmentId: string | null,
          onApproved: () => void,
        ) => {
          onApproved();
        },
      );

      const tools = createReviewFinalizeTools({
        db,
        nowMs: () => 1700000000000,
        logsDir,
        broadcast: vi.fn(),
        appendTaskLog: vi.fn(),
        getPreferredLanguage: () => "en",
        pickL: (pool: any) => (Array.isArray(pool?.en) ? pool.en[0] : ""),
        l: (ko: string[], en: string[], ja: string[], zh: string[]) => ({ ko, en, ja, zh }),
        resolveLang: () => "en",
        getProjectReviewGateSnapshot: () => ({ activeReview: 1, activeTotal: 1, ready: true }),
        projectReviewGateNotifiedAt: new Map<string, number>(),
        notifyCeo: vi.fn(),
        taskWorktrees: new Map<string, { worktreePath: string; projectPath: string; branchName: string }>(),
        mergeToDevAndCreatePR: vi.fn(() => ({ success: true, message: "pr created" })),
        mergeWorktree: vi.fn(() => ({ success: true, message: "merged" })),
        cleanupWorktree: vi.fn(),
        findTeamLeader: vi.fn(() => null),
        getAgentDisplayName: vi.fn(() => "Leader"),
        setTaskCreationAuditCompletion: vi.fn(),
        endTaskExecutionSession: vi.fn(),
        notifyTaskStatus: vi.fn(),
        refreshCliUsageData: vi.fn(async () => ({ tasks: 0 })),
        shouldDeferTaskReportUntilPlanningArchive: vi.fn(() => false),
        emitTaskReportEvent: vi.fn(),
        formatTaskSubtaskProgressSummary: vi.fn(() => ""),
        reviewRoundState: new Map<string, number>(),
        reviewInFlight: new Set<string>(),
        archivePlanningConsolidatedReport: vi.fn(async () => undefined),
        crossDeptNextCallbacks: new Map<string, () => void>(),
        recoverCrossDeptQueueAfterMissingCallback: vi.fn(),
        subtaskDelegationCallbacks: new Map<string, () => void>(),
        startReviewConsensusMeeting,
        processSubtaskDelegations: vi.fn(),
      } as any);

      tools.finishReview(taskId, "Video intro pass", {
        bypassProjectDecisionGate: true,
        trigger: "test-pass",
      });

      const updated = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: string };
      expect(updated.status).toBe("done");
      expect(startReviewConsensusMeeting).toHaveBeenCalledTimes(1);
    } finally {
      try {
        fs.rmSync(projectRoot, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      try {
        fs.rmSync(logsDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      db.close();
    }
  });
});
