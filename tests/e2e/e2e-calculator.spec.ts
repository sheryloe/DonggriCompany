import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import http from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { cleanupE2EResources } from "./cleanup";

type ApiAuthHeaders = {
  read: Record<string, string>;
  write: Record<string, string>;
};

type AgentResponse = {
  ok: boolean;
  agent: {
    id: string;
    department_id: string | null;
    role: string;
  };
};

type ProjectResponse = {
  ok: boolean;
  project: {
    id: string;
    assignment_mode: string;
    assigned_agent_ids: string[];
  };
};

type ApiProviderResponse = {
  ok: boolean;
  id: string;
};

type TaskSummary = {
  id: string;
  title: string;
  project_id: string | null;
  department_id: string | null;
  assigned_agent_id: string | null;
  status: string;
};

type TaskDetail = {
  task: {
    id: string;
    title: string;
    status: string;
    project_id: string | null;
    workflow_meta_json?: string | null;
  };
  logs: Array<{ message: string }>;
};

type MessageRow = {
  id: string;
  content: string;
  message_type: string;
  task_id?: string | null;
  project_id?: string | null;
};

type SettingsResponse = {
  settings: Record<string, unknown>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function bindAgentApiProviderInLocalE2EDb(agentId: string, providerId: string, model: string): void {
  const dbPath = path.resolve(process.cwd(), ".tmp", "e2e-runtime", "claw-empire.e2e.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.prepare("UPDATE agents SET api_provider_id = ?, api_model = ? WHERE id = ?").run(providerId, model, agentId);
  } finally {
    db.close();
  }
}

function normalizeToken(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

async function expectOkJson<T>(response: APIResponse, label: string): Promise<T> {
  const text = await response.text();
  let parsed: unknown = {};
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${label}: JSON parse failed (status=${response.status()}): ${text.slice(0, 500)}`);
    }
  }
  if (!response.ok()) {
    throw new Error(`${label}: request failed (status=${response.status()}): ${text.slice(0, 1000)}`);
  }
  return parsed as T;
}

async function establishApiSession(request: APIRequestContext): Promise<ApiAuthHeaders> {
  const runtimeAuthToken =
    normalizeToken(process.env.API_AUTH_TOKEN) || normalizeToken(process.env.SESSION_AUTH_TOKEN);
  if (runtimeAuthToken && runtimeAuthToken !== "__CHANGE_ME__") {
    const authorization = `Bearer ${runtimeAuthToken}`;
    return {
      read: { authorization },
      write: { authorization },
    };
  }

  const timeoutMs = 30_000;
  const startedAt = Date.now();
  let lastStatus = 0;
  let lastText = "";

  while (Date.now() - startedAt < timeoutMs) {
    const response = await request.get("/api/auth/session");
    const text = await response.text();
    if (response.ok()) {
      let csrfToken = "";
      try {
        const parsed = JSON.parse(text) as { csrf_token?: string };
        csrfToken = String(parsed.csrf_token ?? "").trim();
      } catch {
        csrfToken = "";
      }
      const headers = response.headers();
      const setCookie = headers["set-cookie"] ?? "";
      const cookieMatch = setCookie.match(/claw_session=([^;,\s]+)/);
      const sessionToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : "";
      if (!sessionToken || !csrfToken) {
        throw new Error(
          `GET /api/auth/session missing auth bootstrap values (cookie=${Boolean(sessionToken)}, csrf=${Boolean(csrfToken)})`,
        );
      }
      const authorization = `Bearer ${sessionToken}`;
      return {
        read: { authorization },
        write: { authorization },
      };
    }
    lastStatus = response.status();
    lastText = text;
    if (lastStatus === 502 || lastStatus === 503 || lastStatus === 404) {
      await sleep(500);
      continue;
    }
    throw new Error(`GET /api/auth/session failed (status=${lastStatus}): ${lastText.slice(0, 1000)}`);
  }

  throw new Error(`GET /api/auth/session timed out (status=${lastStatus}): ${lastText.slice(0, 1000)}`);
}

async function startMockOpenAiServer(label: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const chunk = {
        choices: [{ delta: { content: `E2E run completed for ${label}.` } }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ data: [{ id: "e2e-mock-model" }] }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("mock server address unavailable");
  }
  const port = addr.port;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function fetchProjectTasks(
  request: APIRequestContext,
  projectId: string,
  readHeaders: Record<string, string>,
): Promise<TaskSummary[]> {
  const response = await request.get("/api/tasks", { headers: readHeaders });
  const json = await expectOkJson<{ tasks: TaskSummary[] }>(response, "GET /api/tasks(project scan)");
  return (Array.isArray(json.tasks) ? json.tasks : []).filter((task) => task.project_id === projectId);
}

async function waitForTaskAssignment(params: {
  request: APIRequestContext;
  projectId: string;
  titleToken: string;
  readHeaders: Record<string, string>;
  timeoutMs: number;
}): Promise<TaskSummary> {
  const { request, projectId, titleToken, readHeaders, timeoutMs } = params;
  const startedAt = Date.now();
  let lastTasks: TaskSummary[] = [];

  while (Date.now() - startedAt < timeoutMs) {
    const tasks = await fetchProjectTasks(request, projectId, readHeaders);
    lastTasks = tasks;
    const matched = tasks.find((task) => String(task.title ?? "").includes(titleToken) && !!task.assigned_agent_id);
    if (matched) {
      return matched;
    }
    await sleep(500);
  }

  const debugSummary = lastTasks
    .map(
      (task) =>
        `${task.id}:${task.title}:${task.department_id ?? "null"}:${task.assigned_agent_id ?? "null"}:${task.status}`,
    )
    .join(" | ");
  throw new Error(
    `task assignment timed out (project=${projectId}, titleToken=${titleToken}, tasks=${debugSummary})`,
  );
}

async function settleSiblingDirectiveTasks(params: {
  request: APIRequestContext;
  projectId: string;
  keepTaskId: string;
  readHeaders: Record<string, string>;
  writeHeaders: Record<string, string>;
}): Promise<void> {
  const { request, projectId, keepTaskId, readHeaders, writeHeaders } = params;
  const tasks = await fetchProjectTasks(request, projectId, readHeaders);
  const siblings = tasks.filter((task) => {
    if (task.id === keepTaskId) return false;
    return task.status !== "done" && task.status !== "failed";
  });
  for (const sibling of siblings) {
    await expectOkJson(
      await request.patch(`/api/tasks/${sibling.id}`, {
        headers: writeHeaders,
        data: {
          status: "done",
        },
      }),
      `PATCH /api/tasks/:id(settle sibling ${sibling.id})`,
    );
  }
}

async function waitForTaskDetail(
  request: APIRequestContext,
  taskId: string,
  readHeaders: Record<string, string>,
): Promise<TaskDetail> {
  const response = await request.get(`/api/tasks/${taskId}`, { headers: readHeaders });
  return expectOkJson<TaskDetail>(response, "GET /api/tasks/:id");
}

async function waitForTaskRunOutcome(params: {
  request: APIRequestContext;
  taskId: string;
  readHeaders: Record<string, string>;
  timeoutMs: number;
}): Promise<{ outcome: "done" | "failed"; detail: TaskDetail; seenStatuses: Set<string> }> {
  const { request, taskId, readHeaders, timeoutMs } = params;
  const startedAt = Date.now();
  const seenStatuses = new Set<string>();
  let lastDetail: TaskDetail | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const detail = await waitForTaskDetail(request, taskId, readHeaders);
    lastDetail = detail;
    seenStatuses.add(detail.task.status);
    const logMessages = (detail.logs ?? []).map((entry) => String(entry.message ?? ""));
    if (detail.task.status === "done") {
      return { outcome: "done", detail, seenStatuses };
    }
    if (
      detail.task.status === "inbox" &&
      (seenStatuses.has("in_progress") || logMessages.some((line) => line.includes("RUN failed")))
    ) {
      return { outcome: "failed", detail, seenStatuses };
    }
    if (
      detail.task.status === "review" &&
      logMessages.some((line) => line.includes("Review gate: waiting for project-level decision"))
    ) {
      return { outcome: "failed", detail, seenStatuses };
    }
    await sleep(200);
  }

  const logHead = (lastDetail?.logs ?? [])
    .slice(0, 12)
    .map((entry) => String(entry.message ?? ""))
    .join(" | ");
  const logTail = (lastDetail?.logs ?? [])
    .slice(-8)
    .map((entry) => String(entry.message ?? ""))
    .join(" | ");
  throw new Error(
    `task did not reach done in time (task=${taskId}, seen=[${[...seenStatuses].join(", ")}], last=${lastDetail?.task.status ?? "unknown"}, head=${logHead}, tail=${logTail})`,
  );
}

async function waitForTaskLogEvidence(params: {
  request: APIRequestContext;
  taskId: string;
  readHeaders: Record<string, string>;
  timeoutMs: number;
  predicate: (messages: string[]) => boolean;
  label: string;
}): Promise<string[]> {
  const { request, taskId, readHeaders, timeoutMs, predicate, label } = params;
  const startedAt = Date.now();
  let lastMessages: string[] = [];

  while (Date.now() - startedAt < timeoutMs) {
    const detail = await waitForTaskDetail(request, taskId, readHeaders);
    lastMessages = Array.isArray(detail.logs) ? detail.logs.map((log) => String(log.message ?? "")) : [];
    if (predicate(lastMessages)) {
      return lastMessages;
    }
    await sleep(700);
  }

  throw new Error(`${label}: log evidence not found for task=${taskId}`);
}

async function waitForReportMessage(params: {
  request: APIRequestContext;
  projectId?: string | null;
  taskId: string;
  token: string;
  readHeaders: Record<string, string>;
  timeoutMs: number;
}): Promise<MessageRow> {
  const { request, projectId, taskId, token, readHeaders, timeoutMs } = params;
  const startedAt = Date.now();
  let lastCount = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const query = projectId
      ? `/api/messages?project_id=${encodeURIComponent(projectId)}&limit=300`
      : "/api/messages?limit=400";
    const response = await request.get(query, {
      headers: readHeaders,
    });
    const json = await expectOkJson<{ messages: MessageRow[] }>(response, "GET /api/messages(project)");
    const messages = Array.isArray(json.messages) ? json.messages : [];
    lastCount = messages.length;
    const matched = messages.find(
      (message) =>
        message.message_type === "report" &&
        message.task_id === taskId &&
        String(message.content ?? "").includes(token),
    );
    if (matched) {
      return matched;
    }
    await sleep(700);
  }

  throw new Error(
    `report message not found (project=${projectId ?? "null"}, task=${taskId}, token=${token}, count=${lastCount})`,
  );
}

async function createDirectiveExecutionFixture(params: {
  request: APIRequestContext;
  apiAuth: ApiAuthHeaders;
  seed: string;
  telegramSource: string;
  telegramChat: string;
}): Promise<{
  cleanup: {
    apiProviderIds: string[];
    taskIds: string[];
    agentIds: string[];
    departmentIds: string[];
    projectIds: string[];
    requestHeaders: Record<string, string>;
  };
  closeMockProvider: () => Promise<void>;
  projectId: string;
  directiveToken: string;
  departmentId: string;
  memberAgentId: string;
}> {
  const { request, apiAuth, seed, telegramSource, telegramChat } = params;
  const departmentId = "planning-architecture";
  const cleanup = {
    apiProviderIds: [] as string[],
    taskIds: [] as string[],
    agentIds: [] as string[],
    departmentIds: [] as string[],
    projectIds: [] as string[],
    requestHeaders: apiAuth.write,
  };

  const mock = await startMockOpenAiServer(`pm-${seed}`);
  try {
    const provider = await expectOkJson<ApiProviderResponse>(
      await request.post("/api/api-providers", {
        headers: apiAuth.write,
        data: {
          name: `e2e-provider-${seed}`,
          type: "openai",
          base_url: mock.baseUrl,
          api_key: "e2e-local-key",
          enabled: true,
          models_cache: JSON.stringify(["e2e-mock-model"]),
        },
      }),
      "POST /api/api-providers",
    );
    cleanup.apiProviderIds.push(provider.id);

    const leader = await expectOkJson<AgentResponse>(
      await request.post("/api/agents", {
        headers: apiAuth.write,
        data: {
          name: `e2e-pm-lead-${seed}`,
          department_id: departmentId,
          role: "team_leader",
          cli_provider: "api",
          api_provider_id: provider.id,
          api_model: "e2e-mock-model",
          avatar_emoji: "P",
        },
      }),
      "POST /api/agents(leader)",
    );
    cleanup.agentIds.push(leader.agent.id);
    bindAgentApiProviderInLocalE2EDb(leader.agent.id, provider.id, "e2e-mock-model");

    const member = await expectOkJson<AgentResponse>(
      await request.post("/api/agents", {
        headers: apiAuth.write,
        data: {
          name: `e2e-pm-member-${seed}`,
          department_id: departmentId,
          role: "senior",
          cli_provider: "api",
          api_provider_id: provider.id,
          api_model: "e2e-mock-model",
          avatar_emoji: "P",
        },
      }),
      "POST /api/agents(member)",
    );
    cleanup.agentIds.push(member.agent.id);
    bindAgentApiProviderInLocalE2EDb(member.agent.id, provider.id, "e2e-mock-model");

    const gateOrchestrator = await expectOkJson<AgentResponse>(
      await request.post("/api/agents", {
        headers: apiAuth.write,
        data: {
          name: `e2e-gate-orchestrator-${seed}`,
          department_id: departmentId,
          cli_provider: "api",
          family: "orchestrator",
          career_stage: "team-lead",
          authority_level: 7,
          workflow_profile: {
            role: "reviewer",
            review_lenses: ["general_quality"],
            two_pass_required: true,
            max_review_rounds: 2,
          },
          avatar_emoji: "O",
        },
      }),
      "POST /api/agents(gate orchestrator)",
    );
    cleanup.agentIds.push(gateOrchestrator.agent.id);
    bindAgentApiProviderInLocalE2EDb(gateOrchestrator.agent.id, provider.id, "e2e-mock-model");

    const gateReviewer = await expectOkJson<AgentResponse>(
      await request.post("/api/agents", {
        headers: apiAuth.write,
        data: {
          name: `e2e-gate-reviewer-${seed}`,
          department_id: departmentId,
          cli_provider: "api",
          family: "reviewer",
          career_stage: "team-lead",
          authority_level: 6,
          workflow_profile: {
            role: "reviewer",
            review_lenses: ["general_quality"],
            two_pass_required: true,
            max_review_rounds: 2,
          },
          avatar_emoji: "R",
        },
      }),
      "POST /api/agents(gate reviewer)",
    );
    cleanup.agentIds.push(gateReviewer.agent.id);
    bindAgentApiProviderInLocalE2EDb(gateReviewer.agent.id, provider.id, "e2e-mock-model");

    const gateArchitect = await expectOkJson<AgentResponse>(
      await request.post("/api/agents", {
        headers: apiAuth.write,
        data: {
          name: `e2e-gate-architect-${seed}`,
          department_id: departmentId,
          cli_provider: "api",
          family: "architect",
          career_stage: "senior",
          authority_level: 5,
          avatar_emoji: "A",
        },
      }),
      "POST /api/agents(gate architect)",
    );
    cleanup.agentIds.push(gateArchitect.agent.id);
    bindAgentApiProviderInLocalE2EDb(gateArchitect.agent.id, provider.id, "e2e-mock-model");

    const project = await expectOkJson<ProjectResponse>(
      await request.post("/api/projects", {
        headers: apiAuth.write,
        data: {
          name: `e2e-pm-project-${seed}`,
          project_path: path.resolve("test-results", "e2e", "pm-orchestration", seed),
          core_goal: "Validate PM orchestration E2E delegation run review relay",
          assignment_mode: "manual",
          agent_ids: [
            leader.agent.id,
            member.agent.id,
            gateOrchestrator.agent.id,
            gateReviewer.agent.id,
            gateArchitect.agent.id,
          ],
        },
      }),
      "POST /api/projects",
    );
    cleanup.projectIds.push(project.project.id);

    const directiveToken = `pm-e2e-${seed}`;
    await expectOkJson(
      await request.post("/api/directives", {
        headers: apiAuth.write,
        data: {
          content: `${directiveToken} implement orchestration smoke flow @${departmentId}`,
          skipPlannedMeeting: true,
          project_id: project.project.id,
          source: telegramSource,
          chat: telegramChat,
        },
      }),
      "POST /api/directives",
    );

    return {
      cleanup,
      closeMockProvider: mock.close,
      projectId: project.project.id,
      directiveToken,
      departmentId,
      memberAgentId: member.agent.id,
    };
  } catch (error) {
    await mock.close();
    throw error;
  }
}

test.describe("E2E PM orchestration (simulation + conditional live telegram)", () => {
  test.setTimeout(240_000);

  test("simulation: PM directive -> delegated execution -> review/done -> report relay evidence", async ({
    request,
  }) => {
    const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const apiAuth = await establishApiSession(request);
    const settingsBefore = await expectOkJson<SettingsResponse>(
      await request.get("/api/settings", { headers: apiAuth.read }),
      "GET /api/settings(before simulation)",
    );
    const originalYoloMode = settingsBefore.settings.yoloMode ?? null;
    await expectOkJson(
      await request.put("/api/settings", {
        headers: apiAuth.write,
        data: {
          yoloMode: true,
        },
      }),
      "PUT /api/settings(yolo on)",
    );
    const fixture = await createDirectiveExecutionFixture({
      request,
      apiAuth,
      seed,
      telegramSource: "telegram",
      telegramChat: `e2e-chat-${seed}`,
    });

    try {
      const task = await waitForTaskAssignment({
        request,
        projectId: fixture.projectId,
        titleToken: fixture.directiveToken,
        readHeaders: apiAuth.read,
        timeoutMs: 90_000,
      });
      fixture.cleanup.taskIds.push(task.id);
      await settleSiblingDirectiveTasks({
        request,
        projectId: fixture.projectId,
        keepTaskId: task.id,
        readHeaders: apiAuth.read,
        writeHeaders: apiAuth.write,
      });
      await sleep(8_000);

      let lifecycle:
        | { outcome: "done" | "failed"; detail: TaskDetail; seenStatuses: Set<string> }
        | null = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await expectOkJson(
          await request.patch(`/api/tasks/${task.id}`, {
            headers: apiAuth.write,
            data: {
              assigned_agent_id: fixture.memberAgentId,
              department_id: fixture.departmentId,
              project_id: attempt === 1 ? fixture.projectId : null,
              status: "planned",
            },
          }),
          `PATCH /api/tasks/:id(assign member, attempt=${attempt})`,
        );
        await expectOkJson(
          await request.post(`/api/tasks/${task.id}/run`, {
            headers: apiAuth.write,
          }),
          `POST /api/tasks/:id/run(attempt=${attempt})`,
        );

        lifecycle = await waitForTaskRunOutcome({
          request,
          taskId: task.id,
          readHeaders: apiAuth.read,
          timeoutMs: 120_000,
        });
        if (lifecycle.outcome === "done") break;
      }
      if (
        lifecycle &&
        lifecycle.outcome !== "done" &&
        (lifecycle.detail.logs ?? []).some((entry) =>
          String(entry.message ?? "").includes("Review gate: waiting for project-level decision"),
        )
      ) {
        await expectOkJson(
          await request.patch(`/api/tasks/${task.id}`, {
            headers: apiAuth.write,
            data: {
              status: "done",
            },
          }),
          "PATCH /api/tasks/:id(force done after project gate hold)",
        );
        lifecycle = await waitForTaskRunOutcome({
          request,
          taskId: task.id,
          readHeaders: apiAuth.read,
          timeoutMs: 20_000,
        });
      }
      if (!lifecycle || lifecycle.outcome !== "done") {
        const logs = (lifecycle?.detail.logs ?? []).slice(0, 16).map((entry) => entry.message).join(" | ");
        const terminal = await expectOkJson<{ text?: string }>(
          await request.get(`/api/tasks/${task.id}/terminal?lines=120&log_limit=40`, {
            headers: apiAuth.read,
          }),
          "GET /api/tasks/:id/terminal(failure debug)",
        );
        const terminalTail = String(terminal.text ?? "").slice(-700);
        throw new Error(
          `task execution did not reach done after retries (task=${task.id}, outcome=${lifecycle?.outcome ?? "unknown"}, seen=${[
            ...(lifecycle?.seenStatuses ?? new Set<string>()),
          ].join(",")}, logs=${logs}, terminal=${terminalTail})`,
        );
      }
      const lifecycleLogMessages = (lifecycle.detail.logs ?? []).map((entry) => String(entry.message ?? ""));
      expect(
        lifecycle.seenStatuses.has("review") || lifecycleLogMessages.some((line) => line.includes("Status -> review")),
      ).toBe(true);
      expect(lifecycle.seenStatuses.has("done")).toBe(true);

      const report = await waitForReportMessage({
        request,
        projectId: fixture.projectId,
        taskId: task.id,
        token: fixture.directiveToken,
        readHeaders: apiAuth.read,
        timeoutMs: 60_000,
      });
      expect(report.message_type).toBe("report");
      expect(report.task_id).toBe(task.id);

      const relayLogs = await waitForTaskLogEvidence({
        request,
        taskId: task.id,
        readHeaders: apiAuth.read,
        timeoutMs: 45_000,
        label: "relay simulation evidence",
        predicate: (messages) =>
          messages.some((line) => line.includes("messenger_relay_attempt") && line.includes("message_type=report")) &&
          messages.some((line) => line.includes("messenger_relay_failed") && line.includes("message_type=report")),
      });
      expect(relayLogs.some((line) => line.includes("task_id=" + task.id))).toBe(true);
      expect(relayLogs.some((line) => line.includes("channel=telegram"))).toBe(true);
    } finally {
      await request.put("/api/settings", {
        headers: apiAuth.write,
        data: {
          yoloMode: originalYoloMode,
        },
      });
      await fixture.closeMockProvider();
      await cleanupE2EResources(request, fixture.cleanup);
    }
  });

  test("live telegram smoke (conditional): relay success + receiver health", async ({ request }) => {
    test.skip(process.env.LIVE_TELEGRAM_E2E !== "1", "LIVE_TELEGRAM_E2E=1 required");

    const liveToken = normalizeToken(process.env.LIVE_TELEGRAM_BOT_TOKEN);
    const liveChatId = normalizeToken(process.env.LIVE_TELEGRAM_CHAT_ID);
    test.skip(!liveToken || !liveChatId, "LIVE_TELEGRAM_BOT_TOKEN and LIVE_TELEGRAM_CHAT_ID required");

    const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const apiAuth = await establishApiSession(request);
    const settingsBefore = await expectOkJson<SettingsResponse>(
      await request.get("/api/settings", { headers: apiAuth.read }),
      "GET /api/settings(before live)",
    );
    const originalMessengerChannels = settingsBefore.settings.messengerChannels ?? null;
    const originalYoloMode = settingsBefore.settings.yoloMode ?? null;

    const fixture = await createDirectiveExecutionFixture({
      request,
      apiAuth,
      seed,
      telegramSource: "telegram",
      telegramChat: liveChatId,
    });

    try {
      await expectOkJson(
        await request.put("/api/settings", {
          headers: apiAuth.write,
          data: {
            messengerChannels: {
              telegram: {
                token: liveToken,
                receiveEnabled: false,
                sessions: [
                  {
                    id: `live-e2e-${seed}`,
                    name: `Live E2E ${seed}`,
                    targetId: liveChatId,
                    enabled: true,
                  },
                ],
              },
            },
            yoloMode: true,
          },
        }),
        "PUT /api/settings(messenger live setup)",
      );

      const task = await waitForTaskAssignment({
        request,
        projectId: fixture.projectId,
        titleToken: fixture.directiveToken,
        readHeaders: apiAuth.read,
        timeoutMs: 90_000,
      });
      fixture.cleanup.taskIds.push(task.id);
      await settleSiblingDirectiveTasks({
        request,
        projectId: fixture.projectId,
        keepTaskId: task.id,
        readHeaders: apiAuth.read,
        writeHeaders: apiAuth.write,
      });
      await sleep(8_000);
      await expectOkJson(
        await request.patch(`/api/tasks/${task.id}`, {
          headers: apiAuth.write,
          data: {
            assigned_agent_id: fixture.memberAgentId,
            department_id: fixture.departmentId,
            status: "planned",
          },
        }),
        "PATCH /api/tasks/:id(assign member live)",
      );
      await expectOkJson(
        await request.post(`/api/tasks/${task.id}/run`, {
          headers: apiAuth.write,
        }),
        "POST /api/tasks/:id/run(live)",
      );
      const lifecycle = await waitForTaskRunOutcome({
        request,
        taskId: task.id,
        readHeaders: apiAuth.read,
        timeoutMs: 120_000,
      });
      if (
        lifecycle.outcome !== "done" &&
        (lifecycle.detail.logs ?? []).some((entry) =>
          String(entry.message ?? "").includes("Review gate: waiting for project-level decision"),
        )
      ) {
        await expectOkJson(
          await request.patch(`/api/tasks/${task.id}`, {
            headers: apiAuth.write,
            data: {
              status: "done",
            },
          }),
          "PATCH /api/tasks/:id(force done live after project gate hold)",
        );
      } else if (lifecycle.outcome !== "done") {
        throw new Error(`live task did not reach done (task=${task.id})`);
      }

      await waitForReportMessage({
        request,
        projectId: fixture.projectId,
        taskId: task.id,
        token: fixture.directiveToken,
        readHeaders: apiAuth.read,
        timeoutMs: 60_000,
      });

      const relayLogs = await waitForTaskLogEvidence({
        request,
        taskId: task.id,
        readHeaders: apiAuth.read,
        timeoutMs: 45_000,
        label: "relay live evidence",
        predicate: (messages) =>
          messages.some((line) => line.includes("messenger_relay_attempt") && line.includes("message_type=report")) &&
          messages.some((line) => line.includes("messenger_relay_success") && line.includes("message_type=report")),
      });
      expect(relayLogs.some((line) => line.includes("channel=telegram"))).toBe(true);

      const receiver = await expectOkJson<{ ok: boolean; status: { lastError?: string | null } }>(
        await request.get("/api/messenger/receiver/telegram", { headers: apiAuth.read }),
        "GET /api/messenger/receiver/telegram",
      );
      expect(receiver.ok).toBe(true);
      const lastError = String(receiver.status?.lastError ?? "").toLowerCase();
      expect(lastError.includes("conflict")).toBe(false);
    } finally {
      await request.put("/api/settings", {
        headers: apiAuth.write,
        data: {
          messengerChannels: originalMessengerChannels,
          yoloMode: originalYoloMode,
        },
      });
      await fixture.closeMockProvider();
      await cleanupE2EResources(request, fixture.cleanup);
    }
  });
});
