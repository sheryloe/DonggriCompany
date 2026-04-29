import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "../../../bootstrap/schema/base-schema.ts";
import { applyTaskSchemaMigrations } from "../../../bootstrap/schema/task-schema-migrations.ts";
import { createCrossDeptCooperationTools } from "./cross-dept-cooperation.ts";

type ProviderCase = {
  provider: "api" | "copilot" | "antigravity";
  launchKind: "api" | "http";
};

type SeededAgents = {
  teamLeader: any;
  crossLeader: any;
  execAgent: any;
};

function pickVariant(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

function seedCollaborationFixture(
  db: DatabaseSync,
  provider: ProviderCase["provider"],
  projectPath: string,
): SeededAgents {
  const safeProjectPath = projectPath.replace(/'/g, "''");
  db.exec(`
    INSERT INTO departments (id, name, name_ko, icon, color, sort_order)
    VALUES
      ('planning', 'Planning', '기획', 'P', '#111827', 1),
      ('dev', 'Development', '개발', 'D', '#1d4ed8', 2);

    INSERT INTO projects (id, name, project_path, core_goal, default_pack_key, created_at, updated_at)
    VALUES ('project-1', 'Demo', '${safeProjectPath}', 'Ship it', 'development', 1, 1);

    INSERT INTO agents (
      id, name, name_ko, department_id, workflow_pack_key, role, cli_provider,
      oauth_account_id, api_provider_id, api_model, avatar_emoji, status, created_at
    ) VALUES
      ('planning-leader', 'Planner', '기획팀장', 'planning', 'development', 'team_leader', 'claude', NULL, NULL, NULL, ':P', 'idle', 1),
      ('dev-leader', 'Dev Lead', '개발팀장', 'dev', 'development', 'team_leader', 'claude', NULL, NULL, NULL, ':D', 'idle', 1),
      ('dev-worker', 'Dev Worker', '개발담당', 'dev', 'development', 'senior', '${provider}', 'oauth-1', 'api-provider-1', 'model-1', ':W', 'idle', 1);

    INSERT INTO tasks (
      id, title, description, department_id, assigned_agent_id, project_id,
      status, priority, task_type, workflow_pack_key, project_path, created_at, updated_at
    ) VALUES (
      'task-parent',
      'Parent task',
      'Need development support',
      'planning',
      'planning-leader',
      'project-1',
      'collaborating',
      1,
      'general',
      'development',
      '${safeProjectPath}',
      1,
      1
    );
  `);

  return {
    teamLeader: db.prepare("SELECT * FROM agents WHERE id = ?").get("planning-leader") as any,
    crossLeader: db.prepare("SELECT * FROM agents WHERE id = ?").get("dev-leader") as any,
    execAgent: db.prepare("SELECT * FROM agents WHERE id = ?").get("dev-worker") as any,
  };
}

describe("createCrossDeptCooperationTools", () => {
  const previousAllowedRoots = process.env.PROJECT_PATH_ALLOWED_ROOTS;
  let db: DatabaseSync | null = null;
  let tempProjectPath: string | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    tempProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), "cross-dept-project-"));
    execFileSync("git", ["init"], { cwd: tempProjectPath, stdio: "ignore" });
    process.env.PROJECT_PATH_ALLOWED_ROOTS = tempProjectPath;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    db?.close();
    db = null;
    if (tempProjectPath) {
      fs.rmSync(tempProjectPath, { recursive: true, force: true });
      tempProjectPath = null;
    }
    if (previousAllowedRoots === undefined) {
      delete process.env.PROJECT_PATH_ALLOWED_ROOTS;
    } else {
      process.env.PROJECT_PATH_ALLOWED_ROOTS = previousAllowedRoots;
    }
  });

  it.each<ProviderCase>([
    { provider: "api", launchKind: "api" },
    { provider: "copilot", launchKind: "http" },
    { provider: "antigravity", launchKind: "http" },
  ])("routes $provider collaboration tasks through the $launchKind launcher", ({ provider, launchKind }) => {
    db = new DatabaseSync(":memory:");
    applyBaseSchema(db);
    applyTaskSchemaMigrations(db);

    const projectPath = tempProjectPath ?? "";
    const { teamLeader, crossLeader, execAgent } = seedCollaborationFixture(db, provider, projectPath);

    const launchApiProviderAgent = vi.fn();
    const launchHttpAgent = vi.fn();
    const spawnCliAgent = vi.fn();
    const appendTaskLog = vi.fn();

    const { startCrossDeptCooperation } = createCrossDeptCooperationTools({
      db,
      nowMs: () => 1_717_171_717_000,
      appendTaskLog,
      broadcast: vi.fn(),
      recordTaskCreationAudit: vi.fn(),
      delegatedTaskToSubtask: new Map(),
      crossDeptNextCallbacks: new Map(),
      findTeamLeader: (deptId: string) => (deptId === "dev" ? crossLeader : null),
      findBestSubordinate: (deptId: string) => (deptId === "dev" ? execAgent : null),
      resolveLang: () => "en",
      getDeptName: (deptId: string) => (deptId === "dev" ? "Development" : "Planning"),
      getAgentDisplayName: (agent: { name?: string }) => agent.name ?? "",
      sendAgentMessage: vi.fn(),
      notifyCeo: vi.fn(),
      l: (ko: unknown, en: unknown, ja: unknown, zh: unknown) => ({ ko, en, ja, zh }),
      pickL: (messages: Record<string, unknown>, lang: string) =>
        pickVariant(messages[lang] ?? messages.en ?? messages.ko),
      startTaskExecutionForAgent: vi.fn(),
      linkCrossDeptTaskToParentSubtask: vi.fn(() => null),
      detectProjectPath: vi.fn(() => projectPath),
      resolveProjectPath: vi.fn((task: { project_path?: string | null }) => task.project_path ?? projectPath),
      logsDir: "/tmp",
      getDeptRoleConstraint: vi.fn(() => ""),
      getRecentConversationContext: vi.fn(() => ""),
      buildAvailableSkillsPromptBlock: vi.fn(() => ""),
      buildTaskExecutionPrompt: vi.fn((parts: unknown[]) =>
        parts
          .map((part) => String(part ?? "").trim())
          .filter(Boolean)
          .join("\n"),
      ),
      hasExplicitWarningFixRequest: vi.fn(() => false),
      ensureTaskExecutionSession: vi.fn((taskId: string, agentId: string, currentProvider: string) => ({
        sessionId: `session-${taskId}`,
        agentId,
        provider: currentProvider,
      })),
      getProviderModelConfig: vi.fn(() => ({})),
      spawnCliAgent,
      launchApiProviderAgent,
      launchHttpAgent,
      getNextHttpAgentPid: vi.fn(() => 4242),
      handleSubtaskDelegationComplete: vi.fn(),
      handleTaskRunComplete: vi.fn(),
      startProgressTimer: vi.fn(),
    });

    startCrossDeptCooperation(["dev"], 0, {
      teamLeader,
      taskTitle: "Parent task",
      ceoMessage: "Need development support",
      leaderDeptId: "planning",
      leaderDeptName: "Planning",
      leaderName: "Planner",
      lang: "en",
      taskId: "task-parent",
      projectId: "project-1",
    });

    vi.runAllTimers();

    const crossTask = db
      .prepare("SELECT status, assigned_agent_id, source_task_id FROM tasks WHERE source_task_id = ?")
      .get("task-parent") as
      | {
          status: string;
          assigned_agent_id: string | null;
          source_task_id: string | null;
        }
      | undefined;

    expect(crossTask).toMatchObject({
      status: "in_progress",
      assigned_agent_id: "dev-worker",
      source_task_id: "task-parent",
    });
    const decisionLog = appendTaskLog.mock.calls.find(
      (call) => call[0] === "task-parent" && String(call[2]).includes("Cross-dept delegation decision"),
    );
    expect(decisionLog).toBeTruthy();
    expect(String(decisionLog?.[2] ?? "")).toContain("family=");
    expect(String(decisionLog?.[2] ?? "")).toContain("specialization=");
    expect(String(decisionLog?.[2] ?? "")).toContain("fallback_reason=");
    expect(String(decisionLog?.[2] ?? "")).toContain("authority_reason=");
    expect(String(decisionLog?.[2] ?? "")).toContain("blocking_reason=");
    expect(spawnCliAgent).not.toHaveBeenCalled();

    if (launchKind === "api") {
      expect(launchApiProviderAgent).toHaveBeenCalledTimes(1);
      expect(launchHttpAgent).not.toHaveBeenCalled();
    } else {
      expect(launchHttpAgent).toHaveBeenCalledTimes(1);
      expect(launchApiProviderAgent).not.toHaveBeenCalled();
    }
  });

  it.each<ProviderCase>([
    { provider: "api", launchKind: "api" },
    { provider: "copilot", launchKind: "http" },
    { provider: "antigravity", launchKind: "http" },
  ])("finalizes linked subtasks for $provider collaboration runs", ({ provider }) => {
    db = new DatabaseSync(":memory:");
    applyBaseSchema(db);
    applyTaskSchemaMigrations(db);

    const projectPath = tempProjectPath ?? "";
    const { teamLeader, crossLeader, execAgent } = seedCollaborationFixture(db, provider, projectPath);

    const handleSubtaskDelegationComplete = vi.fn();
    const handleTaskRunComplete = vi.fn();
    const appendTaskLog = vi.fn();
    const launchApiProviderAgent = vi.fn((...args: any[]) => {
      const onComplete = args[8] as ((exitCode: number) => void) | undefined;
      onComplete?.(0);
    });
    const launchHttpAgent = vi.fn((...args: any[]) => {
      const onComplete = args[8] as ((exitCode: number) => void) | undefined;
      onComplete?.(0);
    });

    const { startCrossDeptCooperation } = createCrossDeptCooperationTools({
      db,
      nowMs: () => 1_717_171_717_000,
      appendTaskLog,
      broadcast: vi.fn(),
      recordTaskCreationAudit: vi.fn(),
      delegatedTaskToSubtask: new Map(),
      crossDeptNextCallbacks: new Map(),
      findTeamLeader: (deptId: string) => (deptId === "dev" ? crossLeader : null),
      findBestSubordinate: (deptId: string) => (deptId === "dev" ? execAgent : null),
      resolveLang: () => "en",
      getDeptName: (deptId: string) => (deptId === "dev" ? "Development" : "Planning"),
      getAgentDisplayName: (agent: { name?: string }) => agent.name ?? "",
      sendAgentMessage: vi.fn(),
      notifyCeo: vi.fn(),
      l: (ko: unknown, en: unknown, ja: unknown, zh: unknown) => ({ ko, en, ja, zh }),
      pickL: (messages: Record<string, unknown>, lang: string) =>
        pickVariant(messages[lang] ?? messages.en ?? messages.ko),
      startTaskExecutionForAgent: vi.fn(),
      linkCrossDeptTaskToParentSubtask: vi.fn(() => "subtask-linked"),
      detectProjectPath: vi.fn(() => projectPath),
      resolveProjectPath: vi.fn((task: { project_path?: string | null }) => task.project_path ?? projectPath),
      logsDir: "/tmp",
      getDeptRoleConstraint: vi.fn(() => ""),
      getRecentConversationContext: vi.fn(() => ""),
      buildAvailableSkillsPromptBlock: vi.fn(() => ""),
      buildTaskExecutionPrompt: vi.fn((parts: unknown[]) =>
        parts
          .map((part) => String(part ?? "").trim())
          .filter(Boolean)
          .join("\n"),
      ),
      hasExplicitWarningFixRequest: vi.fn(() => false),
      ensureTaskExecutionSession: vi.fn((taskId: string, agentId: string, currentProvider: string) => ({
        sessionId: `session-${taskId}`,
        agentId,
        provider: currentProvider,
      })),
      getProviderModelConfig: vi.fn(() => ({})),
      spawnCliAgent: vi.fn(),
      launchApiProviderAgent,
      launchHttpAgent,
      getNextHttpAgentPid: vi.fn(() => 4242),
      handleSubtaskDelegationComplete,
      handleTaskRunComplete,
      startProgressTimer: vi.fn(),
    });

    startCrossDeptCooperation(["dev"], 0, {
      teamLeader,
      taskTitle: "Parent task",
      ceoMessage: "Need development support",
      leaderDeptId: "planning",
      leaderDeptName: "Planning",
      leaderName: "Planner",
      lang: "en",
      taskId: "task-parent",
      projectId: "project-1",
    });

    vi.runAllTimers();

    const crossTask = db.prepare("SELECT id FROM tasks WHERE source_task_id = ?").get("task-parent") as
      | { id: string }
      | undefined;

    expect(crossTask?.id).toBeTruthy();
    expect(handleSubtaskDelegationComplete).toHaveBeenCalledWith(crossTask?.id, "subtask-linked", 0);
    expect(handleTaskRunComplete).not.toHaveBeenCalled();
    const decisionLog = appendTaskLog.mock.calls.find(
      (call) => call[0] === "task-parent" && String(call[2]).includes("Cross-dept delegation decision"),
    );
    expect(decisionLog).toBeTruthy();
    expect(String(decisionLog?.[2] ?? "")).toContain("authority_reason=");
    expect(String(decisionLog?.[2] ?? "")).toContain("blocking_reason=");
  });

  it("logs full delegation tracking schema when cross-dept leader is missing", () => {
    db = new DatabaseSync(":memory:");
    applyBaseSchema(db);
    applyTaskSchemaMigrations(db);

    const projectPath = tempProjectPath ?? "";
    const { teamLeader } = seedCollaborationFixture(db, "api", projectPath);

    const appendTaskLog = vi.fn();
    const notifyCeo = vi.fn();

    const { startCrossDeptCooperation } = createCrossDeptCooperationTools({
      db,
      nowMs: () => 1_717_171_717_000,
      appendTaskLog,
      broadcast: vi.fn(),
      recordTaskCreationAudit: vi.fn(),
      delegatedTaskToSubtask: new Map(),
      crossDeptNextCallbacks: new Map(),
      findTeamLeader: vi.fn(() => null),
      findBestSubordinate: vi.fn(() => null),
      resolveLang: () => "en",
      getDeptName: (deptId: string) => (deptId === "dev" ? "Development" : "Planning"),
      getAgentDisplayName: (agent: { name?: string }) => agent.name ?? "",
      sendAgentMessage: vi.fn(),
      notifyCeo,
      l: (ko: unknown, en: unknown, ja: unknown, zh: unknown) => ({ ko, en, ja, zh }),
      pickL: (messages: Record<string, unknown>, lang: string) =>
        pickVariant(messages[lang] ?? messages.en ?? messages.ko),
      startTaskExecutionForAgent: vi.fn(),
      linkCrossDeptTaskToParentSubtask: vi.fn(() => null),
      detectProjectPath: vi.fn(() => projectPath),
      resolveProjectPath: vi.fn((task: { project_path?: string | null }) => task.project_path ?? projectPath),
      logsDir: "/tmp",
      getDeptRoleConstraint: vi.fn(() => ""),
      getRecentConversationContext: vi.fn(() => ""),
      buildAvailableSkillsPromptBlock: vi.fn(() => ""),
      buildTaskExecutionPrompt: vi.fn((parts: unknown[]) =>
        parts
          .map((part) => String(part ?? "").trim())
          .filter(Boolean)
          .join("\n"),
      ),
      hasExplicitWarningFixRequest: vi.fn(() => false),
      ensureTaskExecutionSession: vi.fn((taskId: string, agentId: string, currentProvider: string) => ({
        sessionId: `session-${taskId}`,
        agentId,
        provider: currentProvider,
      })),
      getProviderModelConfig: vi.fn(() => ({})),
      spawnCliAgent: vi.fn(),
      launchApiProviderAgent: vi.fn(),
      launchHttpAgent: vi.fn(),
      getNextHttpAgentPid: vi.fn(() => 4242),
      handleSubtaskDelegationComplete: vi.fn(),
      handleTaskRunComplete: vi.fn(),
      startProgressTimer: vi.fn(),
    });

    startCrossDeptCooperation(["dev"], 0, {
      teamLeader,
      taskTitle: "Parent task",
      ceoMessage: "Need development support",
      leaderDeptId: "planning",
      leaderDeptName: "Planning",
      leaderName: "Planner",
      lang: "en",
      taskId: "task-parent",
      projectId: "project-1",
    });

    vi.runAllTimers();

    const blockedLog = appendTaskLog.mock.calls.find(
      (call) => call[0] === "task-parent" && String(call[2]).includes("Cross-dept delegation blocked"),
    );
    expect(blockedLog).toBeTruthy();
    expect(String(blockedLog?.[2] ?? "")).toContain("family=");
    expect(String(blockedLog?.[2] ?? "")).toContain("specialization=");
    expect(String(blockedLog?.[2] ?? "")).toContain("fallback_reason=");
    expect(String(blockedLog?.[2] ?? "")).toContain("authority_reason=missing_team_leader");
    expect(String(blockedLog?.[2] ?? "")).toContain("blocking_reason=no_cross_dept_leader");
    expect(notifyCeo).toHaveBeenCalled();

    const crossTask = db.prepare("SELECT id FROM tasks WHERE source_task_id = ?").get("task-parent");
    expect(crossTask).toBeUndefined();
  });
});
