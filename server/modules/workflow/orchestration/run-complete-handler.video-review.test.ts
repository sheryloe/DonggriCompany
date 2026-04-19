import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createRunCompleteHandler } from "./run-complete-handler.ts";

function createDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      task_type TEXT,
      workflow_pack_key TEXT,
      workflow_meta_json TEXT,
      project_id TEXT,
      project_path TEXT,
      source_task_id TEXT,
      assigned_agent_id TEXT,
      department_id TEXT,
      result TEXT,
      updated_at INTEGER DEFAULT 0
    );

    CREATE TABLE subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL,
      target_department_id TEXT,
      delegated_task_id TEXT,
      cli_tool_use_id TEXT,
      completed_at INTEGER,
      blocked_reason TEXT
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT,
      name_ko TEXT,
      role TEXT NOT NULL DEFAULT 'junior',
      status TEXT,
      current_task_id TEXT,
      department_id TEXT,
      workflow_profile TEXT,
      agent_profile_json TEXT,
      stats_tasks_done INTEGER DEFAULT 0,
      stats_xp INTEGER DEFAULT 0
    );
  `);
  return db;
}

function createDeps(db: DatabaseSync, logsDir = "/tmp") {
  return {
    activeProcesses: new Map<string, unknown>(),
    stopProgressTimer: vi.fn(),
    db,
    stopRequestedTasks: new Set<string>(),
    stopRequestModeByTask: new Map<string, "pause" | "cancel">(),
    appendTaskLog: vi.fn(),
    clearTaskWorkflowState: vi.fn(),
    codexThreadToSubtask: new Map<string, string>(),
    nowMs: () => 1700000000000,
    logsDir,
    broadcast: vi.fn(),
    processSubtaskDelegations: vi.fn(),
    taskWorktrees: new Map<string, { worktreePath?: string; projectPath?: string; branchName?: string }>(),
    cleanupWorktree: vi.fn(),
    findTeamLeader: vi.fn(() => null),
    getAgentDisplayName: vi.fn(() => "Team Lead"),
    pickL: (pool: any) => {
      if (Array.isArray(pool?.ko)) return pool.ko[0];
      if (Array.isArray(pool?.en)) return pool.en[0];
      if (Array.isArray(pool)) return pool[0];
      return "";
    },
    l: (ko: string[], en: string[], ja?: string[], zh?: string[]) => ({ ko, en, ja: ja ?? en, zh: zh ?? en }),
    notifyCeo: vi.fn(),
    sendAgentMessage: vi.fn(),
    resolveLang: vi.fn(() => "ko"),
    formatTaskSubtaskProgressSummary: vi.fn(() => ""),
    crossDeptNextCallbacks: new Map<string, () => void>(),
    recoverCrossDeptQueueAfterMissingCallback: vi.fn(),
    subtaskDelegationCallbacks: new Map<string, () => void>(),
    finishReview: vi.fn(),
    reconcileDelegatedSubtasksAfterRun: vi.fn(),
    completeTaskWithoutReview: vi.fn(),
    isReportDesignCheckpointTask: vi.fn(() => false),
    extractReportDesignParentTaskId: vi.fn(() => null),
    resumeReportAfterDesignCheckpoint: vi.fn(),
    isPresentationReportTask: vi.fn(() => false),
    readReportFlowValue: vi.fn(() => null),
    startReportDesignCheckpoint: vi.fn(() => false),
    upsertReportFlowValue: vi.fn((desc: string | null) => desc ?? ""),
    isReportRequestTask: vi.fn(() => false),
    notifyTaskStatus: vi.fn(),
    prettyStreamJson: vi.fn((raw: string) => raw),
    getWorktreeDiffSummary: vi.fn(() => ""),
    hasVisibleDiffSummary: vi.fn(() => false),
  } as any;
}

describe("run complete handler - video preprod review transition", () => {

  it("overwrites stale review_consensus hard-block state when entering review", () => {
    const db = createDb();
    try {
      const taskId = "task-restart-review-meta";
      db.prepare(
        `
          INSERT INTO tasks (
            id, title, description, status, workflow_pack_key, source_task_id, assigned_agent_id, department_id, project_id, project_path, workflow_meta_json, updated_at
          )
          VALUES (?, ?, ?, 'in_progress', 'general', NULL, ?, 'planning', 'project-1', ?, ?, 1)
        `,
      ).run(
        taskId,
        "Recover stale review state",
        "Run-complete should clear stale review_consent block",
        null,
        "/tmp/project",
        JSON.stringify({
          review_consent: {
            stage: "review_consensus",
            blocked: true,
            blocked_at: 100,
            blocked_by: ["authority_missing"],
            trigger: "hard_block",
            state: "blocked",
          },
        }),
      );

      const deps = createDeps(db);
      const { handleTaskRunComplete } = createRunCompleteHandler(deps);

      handleTaskRunComplete(taskId, 0);

      const updated = db.prepare("SELECT status, workflow_meta_json FROM tasks WHERE id = ?").get(taskId) as {
        status: string;
        workflow_meta_json: string | null;
      };
      expect(updated.status).toBe("review");
      const meta = updated.workflow_meta_json ? JSON.parse(updated.workflow_meta_json) : {};
      expect(meta.review_consent).toMatchObject({
        started_by: "run_complete",
        stage: "awaiting_review",
        blocked: false,
        state: "awaiting_review",
      });
      expect(meta.review_consent.blocked_by).toEqual([]);
      expect(typeof meta.review_consent.entered_review_at).toBe("number");
    } finally {
      db.close();
    }
  });
  it("root video_preprod task enters review", () => {
    const db = createDb();
    try {
      const taskId = "task-root-video";
      db.prepare(
        `
          INSERT INTO tasks (
            id, title, description, status, workflow_pack_key, source_task_id, assigned_agent_id, department_id, project_id, project_path, updated_at
          )
          VALUES (?, ?, ?, 'in_progress', 'video_preprod', NULL, ?, 'planning', 'project-1', ?, 1)
        `,
      ).run(taskId, "Review task root", "Root review summary", "video-preprod-seed-1", "/tmp/project");
      db.prepare(
        `
          INSERT INTO subtasks (id, task_id, status, target_department_id, delegated_task_id, cli_tool_use_id)
          VALUES ('sub-1', ?, 'pending', 'dev', NULL, NULL)
        `,
          ).run(taskId);
      db.prepare(
        `
          INSERT INTO agents (id, name, name_ko, status, current_task_id, department_id, stats_tasks_done, stats_xp)
          VALUES ('video-preprod-seed-1', 'Haru', '하루', 'working', ?, 'planning', 0, 0)
        `,
      ).run(taskId);

      const deps = createDeps(db);
      deps.activeProcesses.set(taskId, { pid: 101 });
      const { handleTaskRunComplete } = createRunCompleteHandler(deps);

      handleTaskRunComplete(taskId, 0);

      const updated = db.prepare("SELECT status, workflow_meta_json FROM tasks WHERE id = ?").get(taskId) as {
        status: string;
        workflow_meta_json: string | null;
      };
      expect(updated.status).toBe("review");
      const meta = updated.workflow_meta_json ? JSON.parse(updated.workflow_meta_json) : {};
      expect(meta.review_consent).toMatchObject({
        started_by: "run_complete",
        stage: "awaiting_review",
        blocked: false,
        state: "awaiting_review",
      });
      expect((meta.review_consent.blocked_by as string[])).toEqual([]);
      expect(typeof meta.review_consent.entered_review_at).toBe("number");
      expect(deps.appendTaskLog).toHaveBeenCalledWith(
        taskId,
        "system",
        expect.stringContaining("Video sequencing notice: documentation/collaboration still in progress"),
      );
      expect(deps.notifyTaskStatus).toHaveBeenCalledWith(taskId, "Review task root", "review", "ko");
      expect(deps.notifyTaskStatus.mock.calls.some((call: any[]) => call[0] === taskId && call[2] === "pending")).toBe(
        false,
      );
    } finally {
      db.close();
    }
  });

  it("child video_preprod task enters review", () => {
    const db = createDb();
    try {
      const taskId = "task-child-video";
      db.prepare(
        `
          INSERT INTO tasks (
            id, title, description, status, workflow_pack_key, source_task_id, assigned_agent_id, department_id, project_id, project_path, updated_at
          )
          VALUES (?, ?, ?, 'in_progress', 'video_preprod', 'parent-task', ?, 'dev', 'project-1', ?, 1)
        `,
      ).run(taskId, "Review task child", "Child review details", "video-preprod-seed-2", "/tmp/project");
      db.prepare(
        `
          INSERT INTO agents (id, name, name_ko, status, current_task_id, department_id, stats_tasks_done, stats_xp)
          VALUES ('video-preprod-seed-2', 'Liam', '리암', 'working', ?, 'dev', 0, 0)
        `,
      ).run(taskId);

      const deps = createDeps(db);
      deps.activeProcesses.set(taskId, { pid: 102 });
      const { handleTaskRunComplete } = createRunCompleteHandler(deps);

      handleTaskRunComplete(taskId, 0);

      const updated = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: string };
      expect(updated.status).toBe("review");
      expect(deps.reconcileDelegatedSubtasksAfterRun).toHaveBeenCalledWith(taskId, 0);

      const loggedMessages = deps.appendTaskLog.mock.calls.map((call: any[]) => String(call[2] ?? ""));
      expect(loggedMessages.some((message: string) => message.includes("Video artifact"))).toBe(false);
      expect(loggedMessages.some((message: string) => message.includes("Video sequencing notice"))).toBe(false);
    } finally {
      db.close();
    }
  });

  it("[VIDEO_FINAL_RENDER] missing remotion engine should route to inbox with failure", () => {
    const db = createDb();
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-run-complete-"));
    try {
      const taskId = "task-final-render";
      db.prepare(
        `
          INSERT INTO tasks (
            id, title, description, status, workflow_pack_key, source_task_id, assigned_agent_id, department_id, project_id, project_path, updated_at
          )
          VALUES (?, ?, ?, 'in_progress', 'video_preprod', 'parent-task', ?, 'dev', 'project-1', ?, 1)
        `,
      ).run(taskId, "[VIDEO_FINAL_RENDER] final render validation", "Should fail when remotion engine not allowed", "video-preprod-seed-2", "/tmp/project");
      db.prepare(
        `
          INSERT INTO agents (id, name, name_ko, status, current_task_id, department_id, stats_tasks_done, stats_xp)
          VALUES ('video-preprod-seed-2', 'Liam', '리암', 'working', ?, 'dev', 0, 0)
        `,
      ).run(taskId);
      fs.writeFileSync(path.join(logsDir, `${taskId}.log`), "moviepy 2.1.2 is available", "utf8");

      const deps = createDeps(db, logsDir);
      deps.activeProcesses.set(taskId, { pid: 103 });
      const { handleTaskRunComplete } = createRunCompleteHandler(deps);

      handleTaskRunComplete(taskId, 0);

      const updated = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: string };
      expect(updated.status).toBe("inbox");
      expect(deps.appendTaskLog).toHaveBeenCalledWith(
        taskId,
        "system",
        expect.stringContaining("Video render engine gate failed"),
      );
      expect(
        deps.appendTaskLog.mock.calls.some((call: any[]) =>
          String(call[2] ?? "").includes("RUN failed (exit code: 86)"),
        ),
      ).toBe(true);
    } finally {
      try {
        fs.rmSync(logsDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      db.close();
    }
  });

  it("[VIDEO_FINAL_RENDER] thinking stream indicates remotion, render succeeds and review continues", () => {
    const db = createDb();
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-run-complete-"));
    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-wt-"));
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-project-"));
    try {
      const taskId = "task-final-render-thinking-ok";
      db.prepare(
        `
          INSERT INTO tasks (
            id, title, description, status, workflow_pack_key, source_task_id, assigned_agent_id, department_id, project_id, project_path, updated_at
          )
          VALUES (?, ?, ?, 'in_progress', 'video_preprod', 'parent-task', ?, 'dev', 'project-1', ?, 1)
        `,
      ).run(taskId, "[VIDEO_FINAL_RENDER] final render validation", "Should recover with thinking stream", "video-preprod-seed-2", projectPath);
      db.prepare(
        `
          INSERT INTO agents (id, name, name_ko, status, current_task_id, department_id, stats_tasks_done, stats_xp)
          VALUES ('video-preprod-seed-2', 'Liam', '由ъ븫', 'working', ?, 'dev', 0, 0)
        `,
      ).run(taskId);
      fs.writeFileSync(
        path.join(logsDir, `${taskId}.log`),
        [
          '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Use Remotion only (no Python/moviepy/Pillow, no ffmpeg standalone)"}}}',
          "pnpm exec remotion render src/index.ts Intro video_output/final.mp4 --log=verbose",
        ].join("\n"),
        "utf8",
      );
      fs.mkdirSync(path.join(worktreeDir, "video_output"), { recursive: true });
      fs.writeFileSync(path.join(worktreeDir, "video_output", "final.mp4"), "rendered-video", "utf8");

      const deps = createDeps(db, logsDir);
      deps.taskWorktrees.set(taskId, { worktreePath: worktreeDir, projectPath, branchName: "climpire/test" });
      deps.activeProcesses.set(taskId, { pid: 105 });
      const { handleTaskRunComplete } = createRunCompleteHandler(deps);

      handleTaskRunComplete(taskId, 0);

      const updated = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: string };
      expect(updated.status).toBe("review");
      expect(deps.cleanupWorktree).not.toHaveBeenCalled();
      expect(
        deps.appendTaskLog.mock.calls.some((call: any[]) =>
          String(call[2] ?? "").includes("Video render engine gate failed"),
        ),
      ).toBe(false);
    } finally {
      try {
        fs.rmSync(logsDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      try {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      try {
        fs.rmSync(projectPath, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      db.close();
    }
  });

  it("[VIDEO_FINAL_RENDER] negated remotion mention does not satisfy engine gate", () => {
    const db = createDb();
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-run-complete-"));
    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-wt-"));
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-project-"));
    try {
      const taskId = "task-final-render-negated-remotion";
      db.prepare(
        `
          INSERT INTO tasks (
            id, title, description, status, workflow_pack_key, source_task_id, assigned_agent_id, department_id, project_id, project_path, updated_at
          )
          VALUES (?, ?, ?, 'in_progress', 'video_preprod', 'parent-task', ?, 'dev', 'project-1', ?, 1)
        `,
      ).run(taskId, "[VIDEO_FINAL_RENDER] final render validation", "Negated remotion mention must fail", "video-preprod-seed-2", projectPath);
      db.prepare(
        `
          INSERT INTO agents (id, name, name_ko, status, current_task_id, department_id, stats_tasks_done, stats_xp)
          VALUES ('video-preprod-seed-2', 'Liam', '리암', 'working', ?, 'dev', 0, 0)
        `,
      ).run(taskId);
      fs.writeFileSync(
        path.join(logsDir, `${taskId}.log`),
        "policy: do not use remotion for this context",
        "utf8",
      );
      fs.mkdirSync(path.join(worktreeDir, "video_output"), { recursive: true });
      fs.writeFileSync(path.join(worktreeDir, "video_output", "final.mp4"), "rendered-video", "utf8");

      const deps = createDeps(db, logsDir);
      deps.taskWorktrees.set(taskId, { worktreePath: worktreeDir, projectPath, branchName: "climpire/test" });
      deps.activeProcesses.set(taskId, { pid: 106 });
      const { handleTaskRunComplete } = createRunCompleteHandler(deps);

      handleTaskRunComplete(taskId, 0);

      const updated = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: string };
      expect(updated.status).toBe("inbox");
      expect(
        deps.appendTaskLog.mock.calls.some((call: any[]) =>
          String(call[2] ?? "").includes("Video render engine gate failed"),
        ),
      ).toBe(true);
      expect(
        deps.appendTaskLog.mock.calls.some((call: any[]) =>
          String(call[2] ?? "").includes("RUN failed (exit code: 86)"),
        ),
      ).toBe(true);
    } finally {
      try {
        fs.rmSync(logsDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      try {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      try {
        fs.rmSync(projectPath, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      db.close();
    }
  });

  it("[VIDEO_FINAL_RENDER] final render recovery should continue when output exists", () => {
    const db = createDb();
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-run-complete-"));
    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), "climpire-wt-"));
    try {
      const taskId = "task-final-render-recover";
      const projectPath = "/tmp/project";
      db.prepare(
        `
          INSERT INTO tasks (
            id, title, description, status, workflow_pack_key, source_task_id, assigned_agent_id, department_id, project_id, project_path, updated_at
          )
          VALUES (?, ?, ?, 'in_progress', 'video_preprod', 'parent-task', ?, 'dev', 'project-1', ?, 1)
        `,
      ).run(taskId, "[VIDEO_FINAL_RENDER] final render recovery", "Recoverable final render", "video-preprod-seed-2", projectPath);
      db.prepare(
        `
          INSERT INTO agents (id, name, name_ko, status, current_task_id, department_id, stats_tasks_done, stats_xp)
          VALUES ('video-preprod-seed-2', 'Liam', '由ъ븫', 'working', ?, 'dev', 0, 0)
        `,
      ).run(taskId);
      fs.writeFileSync(
        path.join(logsDir, `${taskId}.log`),
        "pnpm exec remotion render src/index.ts Intro video_output/final.mp4 --log=verbose",
        "utf8",
      );
      fs.mkdirSync(path.join(worktreeDir, "video_output"), { recursive: true });
      fs.writeFileSync(path.join(worktreeDir, "video_output", "final.mp4"), "rendered-video", "utf8");
      fs.mkdirSync(path.join(projectPath, "video_output"), { recursive: true });

      const deps = createDeps(db, logsDir);
      deps.taskWorktrees.set(taskId, { worktreePath: worktreeDir, projectPath, branchName: "climpire/test" });
      deps.activeProcesses.set(taskId, { pid: 104 });
      const { handleTaskRunComplete } = createRunCompleteHandler(deps);

      handleTaskRunComplete(taskId, 1);

      const updated = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: string };
      expect(updated.status).toBe("review");
      expect(
        deps.appendTaskLog.mock.calls.some((call: any[]) =>
          String(call[2] ?? "").includes("Final render recovery: detected valid Remotion output"),
        ),
      ).toBe(true);
      expect(
        deps.appendTaskLog.mock.calls.some((call: any[]) =>
          String(call[2] ?? "").includes("RUN completed (exit code: 0)"),
        ),
      ).toBe(true);
    } finally {
      try {
        fs.rmSync(logsDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      try {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      db.close();
    }
  });
});
