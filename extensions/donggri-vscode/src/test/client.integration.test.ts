import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { DonggriClient } from "../api/donggriClient";
import { DonggriHttpClient } from "../api/httpClient";

describe("donggri client integration", () => {
  let server: http.Server;
  let client: DonggriClient;
  const tasks = new Map<string, any>();

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
        const cookie = req.headers.cookie || "";
        const authorized = req.headers.authorization === "Bearer test-token" || cookie.includes("donggri_session=test");

        if (req.method === "GET" && url.pathname === "/api/auth/session") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("set-cookie", "donggri_session=test; Path=/; HttpOnly");
          res.end(JSON.stringify({ ok: true, csrf_token: "csrf-test" }));
          return;
        }

        if (!authorized) {
          res.statusCode = 401;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/projects") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              projects: [
                {
                  id: "project-1",
                  name: "Repo",
                  project_path: "D:/repo",
                  core_goal: "Ship repo",
                },
              ],
              page: 1,
              page_size: 50,
              total: 1,
              total_pages: 1,
            }),
          );
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/tasks") {
          const task = {
            id: "task-1",
            title: body.title,
            description: body.description,
            project_path: body.project_path,
            status: "inbox",
            updated_at: 1,
          };
          tasks.set(task.id, task);
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ id: task.id, task }));
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/tasks") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ tasks: [...tasks.values()] }));
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/tasks/task-1/run") {
          const task = tasks.get("task-1");
          task.status = "in_progress";
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/tasks/task-1/stop") {
          const task = tasks.get("task-1");
          task.status = "pending";
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/tasks/task-1/resume") {
          const task = tasks.get("task-1");
          task.status = "planned";
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/tasks/task-1/terminal") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              exists: true,
              text: "done",
              task_logs: [],
              progress_hints: { hints: ["healthy"] },
            }),
          );
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/decision-inbox") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              items: [
                {
                  id: "decision-1",
                  kind: "task_timeout_resume",
                  created_at: 1,
                  summary: "Resume task?",
                  task_id: "task-1",
                  task_title: "Fix bug",
                  project_id: "project-1",
                  project_name: "Repo",
                  project_path: "D:/repo",
                  options: [{ number: 1, action: "resume", label: "Resume" }],
                },
              ],
            }),
          );
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/decision-inbox/decision-1/reply") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.statusCode = 404;
        res.end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    client = new DonggriClient(
      new DonggriHttpClient(() => ({
        serverUrl: `http://127.0.0.1:${port}`,
        apiToken: "",
        autoConnect: true,
        defaultProjectBindingMode: "match-or-create",
      })),
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it("bootstraps session and exercises task lifecycle endpoints", async () => {
    const projects = await client.listAllProjects();
    expect(projects[0]?.id).toBe("project-1");

    const task = await client.createTask({
      title: "Fix bug",
      prompt: "Fix it",
      binding: {
        workspaceFolderName: "repo",
        workspaceFolderPath: "D:/repo",
        projectId: "project-1",
        projectName: "Repo",
        projectPath: "D:/repo",
        projectContext: "Ship repo",
        bindingSource: "matched",
        updatedAt: 1,
      },
      context: {},
    });
    expect(task.id).toBe("task-1");

    await client.runTask(task.id);
    await client.pauseTask(task.id);
    await client.resumeTask(task.id);

    const terminal = await client.getTaskTerminal(task.id, 40);
    expect(terminal.text).toBe("done");

    const decisions = await client.getDecisionInbox();
    expect(decisions).toHaveLength(1);
    await client.replyDecision(decisions[0]!.id, 1);
  });
});
