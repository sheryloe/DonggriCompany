import type {
  DonggriDecisionItem,
  DonggriMessage,
  DonggriProject,
  DonggriTaskAction,
  DonggriTaskRef,
  DonggriTerminalResponse,
  PromoteToTaskInput,
} from "../types";
import { DonggriHttpClient } from "./httpClient";

type ProjectsResponse = {
  projects: DonggriProject[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

type TasksResponse = {
  tasks: DonggriTaskRef[];
};

export class DonggriClient {
  constructor(readonly http: DonggriHttpClient) {}

  async bootstrapSession(force = false): Promise<boolean> {
    return this.http.bootstrapSession(force);
  }

  async getProjects(page = 1, pageSize = 50, search?: string): Promise<ProjectsResponse> {
    const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
    return this.http.request<ProjectsResponse>(`/api/projects?page=${page}&page_size=${pageSize}${searchParam}`);
  }

  async listAllProjects(): Promise<DonggriProject[]> {
    const projects: DonggriProject[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await this.getProjects(page, 50);
      projects.push(...response.projects);
      totalPages = response.total_pages;
      page += 1;
    } while (page <= totalPages);

    return projects;
  }

  async createProject(input: {
    name: string;
    project_path: string;
    core_goal: string;
  }): Promise<DonggriProject> {
    const response = await this.http.request<{ ok: boolean; project: DonggriProject }>("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });

    return response.project;
  }

  async getTasks(projectId?: string): Promise<DonggriTaskRef[]> {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
    const response = await this.http.request<TasksResponse>(`/api/tasks${query}`);
    return response.tasks;
  }

  async createTask(input: PromoteToTaskInput): Promise<DonggriTaskRef> {
    const response = await this.http.request<{ id: string; task: DonggriTaskRef }>("/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        description: input.prompt,
        task_type: "development",
        priority: 0,
        project_id: input.binding.projectId,
        project_path: input.binding.projectPath,
      }),
    });

    if (input.runAfterCreate) {
      await this.runTask(response.task.id);
    }

    return response.task;
  }

  async runTask(taskId: string): Promise<void> {
    await this.http.request(`/api/tasks/${taskId}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
  }

  async pauseTask(taskId: string): Promise<void> {
    await this.http.request(`/api/tasks/${taskId}/stop`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mode: "pause",
      }),
    });
  }

  async resumeTask(taskId: string): Promise<void> {
    await this.http.request(`/api/tasks/${taskId}/resume`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
  }

  async controlTask(taskId: string, action: DonggriTaskAction): Promise<void> {
    if (action === "run") {
      await this.runTask(taskId);
      return;
    }

    if (action === "pause") {
      await this.pauseTask(taskId);
      return;
    }

    await this.resumeTask(taskId);
  }

  async getTaskTerminal(taskId: string, lines = 120): Promise<DonggriTerminalResponse> {
    return this.http.request<DonggriTerminalResponse>(
      `/api/tasks/${taskId}/terminal?pretty=1&lines=${encodeURIComponent(String(lines))}`,
    );
  }

  async getMessages(): Promise<DonggriMessage[]> {
    const response = await this.http.request<{ messages: DonggriMessage[] }>("/api/messages?limit=50");
    return response.messages;
  }

  async sendDirective(
    content: string,
    binding?: { projectId?: string; projectPath?: string; projectContext?: string },
  ): Promise<void> {
    await this.http.request("/api/directives", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content,
        project_id: binding?.projectId,
        project_path: binding?.projectPath,
        project_context: binding?.projectContext,
      }),
    });
  }

  async getDecisionInbox(): Promise<DonggriDecisionItem[]> {
    const response = await this.http.request<{ items: DonggriDecisionItem[] }>("/api/decision-inbox");
    return response.items;
  }

  async replyDecision(decisionId: string, optionNumber: number): Promise<void> {
    await this.http.request(`/api/decision-inbox/${decisionId}/reply`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        option_number: optionNumber,
      }),
    });
  }
}
