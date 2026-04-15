import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { decryptSecret } from "../../../oauth/helpers.ts";
import type { RuntimeContext } from "../../../types/runtime-context.ts";

export type GitHubRouteDeps = Pick<RuntimeContext, "app" | "db" | "broadcast">;

export function registerGitHubRoutes(deps: GitHubRouteDeps): void {
  const { app, db, broadcast } = deps;

  function getGitHubAccessToken(): string | null {
    const row = db
      .prepare(
        "SELECT access_token_enc, scope FROM oauth_accounts WHERE provider = 'github' AND status = 'active' ORDER BY priority ASC, updated_at DESC LIMIT 1",
      )
      .get() as { access_token_enc: string | null; scope: string | null } | undefined;
    if (!row?.access_token_enc) return null;
    try {
      return decryptSecret(row.access_token_enc);
    } catch {
      return null;
    }
  }

  function hasRepoScope(scope: string | null | undefined): boolean {
    if (!scope) return false;
    if (scope.includes("github-app")) return true;
    return scope.split(/[\s,]+/).includes("repo");
  }

  function buildGitHubHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(extra ?? {}),
    };
  }

  function normalizeTargetPath(rawPath: unknown, fallbackRepoName = "repo"): string {
    const candidate = typeof rawPath === "string" ? rawPath.trim() : "";
    const defaultTarget = path.join(os.homedir(), "Projects", fallbackRepoName);
    let targetPath = candidate || defaultTarget;
    if (targetPath === "~") targetPath = os.homedir();
    else if (targetPath.startsWith("~/")) targetPath = path.join(os.homedir(), targetPath.slice(2));
    return path.resolve(targetPath);
  }

  const activeClones = new Map<
    string,
    { status: string; progress: number; error?: string; targetPath: string; repoFullName: string }
  >();

  app.get("/api/github/status", async (_req, res) => {
    const row = db
      .prepare(
        "SELECT id, email, scope, status, access_token_enc FROM oauth_accounts WHERE provider = 'github' AND status = 'active' ORDER BY priority ASC, updated_at DESC LIMIT 1",
      )
      .get() as
      | { id: string; email: string | null; scope: string | null; status: string; access_token_enc: string | null }
      | undefined;
    if (!row) return res.json({ connected: false, has_repo_scope: false });

    let repoScope = hasRepoScope(row.scope);
    if (!repoScope && row.access_token_enc) {
      try {
        const token = decryptSecret(row.access_token_enc);
        const authHeaders = {
          ...buildGitHubHeaders(token),
        };

        const probe = await fetch("https://api.github.com/user", {
          headers: authHeaders,
          signal: AbortSignal.timeout(8000),
        });
        const actualScopes = probe.headers.get("x-oauth-scopes");

        if (probe.ok && typeof actualScopes === "string" && actualScopes.length > 0) {
          db.prepare("UPDATE oauth_accounts SET scope = ?, updated_at = ? WHERE id = ?").run(
            actualScopes,
            Date.now(),
            row.id,
          );
          repoScope = hasRepoScope(actualScopes);
        } else if (probe.ok && (actualScopes === "" || actualScopes === null)) {
          try {
            const repoProbe = await fetch("https://api.github.com/user/repos?per_page=1&visibility=private", {
              headers: authHeaders,
              signal: AbortSignal.timeout(8000),
            });
            if (repoProbe.ok) {
              repoScope = true;
              db.prepare("UPDATE oauth_accounts SET scope = ?, updated_at = ? WHERE id = ?").run(
                "repo (github-app)",
                Date.now(),
                row.id,
              );
            }
          } catch {
            // private repo 접근 체크 실패는 무시하고 기존 결과 유지
          }
        }
      } catch (probeErr) {
        console.error("[GitHub Status] probe error:", probeErr);
      }
    }

    res.json({
      connected: true,
      has_repo_scope: repoScope,
      email: row.email,
      account_id: row.id,
      scope: row.scope,
    });
  });

  app.get("/api/github/repos", async (req, res) => {
    const token = getGitHubAccessToken();
    if (!token) return res.status(401).json({ error: "github_not_connected" });
    const q = String(req.query.q || "").trim();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const perPage = Math.min(50, Math.max(1, parseInt(String(req.query.per_page || "30"), 10)));
    try {
      let url: string;
      if (q) {
        url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}+user:@me&per_page=${perPage}&page=${page}&sort=updated`;
      } else {
        url = `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`;
      }
      const resp = await fetch(url, {
        headers: buildGitHubHeaders(token),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        return res.status(resp.status).json({ error: "github_api_error", status: resp.status, detail: body });
      }
      const json = await resp.json();
      const repos = q ? ((json as any).items ?? []) : json;
      res.json({
        repos: (repos as any[]).map((r: any) => ({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          owner: r.owner?.login,
          private: r.private,
          description: r.description,
          default_branch: r.default_branch,
          updated_at: r.updated_at,
          html_url: r.html_url,
          clone_url: r.clone_url,
        })),
      });
    } catch (err) {
      res.status(502).json({ error: "github_fetch_failed", message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/github/repos", async (req, res) => {
    const token = getGitHubAccessToken();
    if (!token) return res.status(401).json({ error: "github_not_connected" });

    const body = (req.body ?? {}) as { name?: unknown; private?: unknown };
    const repoName = typeof body.name === "string" ? body.name.trim() : "";
    const isPrivate = typeof body.private === "boolean" ? body.private : true;
    if (!repoName) return res.status(400).json({ error: "repo_name_required" });

    try {
      const resp = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: buildGitHubHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: repoName,
          private: isPrivate,
          auto_init: true,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const responseText = await resp.text().catch(() => "");
      let responseJson: any = null;
      if (responseText) {
        try {
          responseJson = JSON.parse(responseText);
        } catch {
          responseJson = null;
        }
      }

      if (!resp.ok) {
        if (resp.status === 422) {
          return res.status(422).json({
            error: "repo_name_conflict",
            detail: responseJson?.message ?? (responseText || "Repository name already exists"),
          });
        }
        return res.status(resp.status).json({
          error: "github_api_error",
          status: resp.status,
          detail: responseJson ?? responseText,
        });
      }

      const repoNameFromResponse = typeof responseJson?.name === "string" ? responseJson.name : repoName;
      const repoFullName = typeof responseJson?.full_name === "string" ? responseJson.full_name : null;
      if (!repoFullName) {
        return res.status(502).json({
          error: "github_repo_create_failed",
          message: "GitHub returned a success status without repository metadata.",
          detail: responseText || null,
        });
      }

      return res.json({
        repo: {
          name: repoNameFromResponse,
          full_name: repoFullName,
          private: Boolean(responseJson?.private),
          default_branch: responseJson?.default_branch ?? null,
          html_url: responseJson?.html_url ?? null,
          clone_url: responseJson?.clone_url ?? null,
        },
      });
    } catch (err) {
      return res.status(502).json({
        error: "github_repo_create_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.delete("/api/github/repos/:owner/:repo", async (req, res) => {
    const token = getGitHubAccessToken();
    if (!token) return res.status(401).json({ error: "github_not_connected" });

    const owner = String(req.params.owner || "").trim();
    const repo = String(req.params.repo || "").trim();
    if (!owner || !repo) return res.status(400).json({ error: "owner_and_repo_required" });

    try {
      const resp = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        {
          method: "DELETE",
          headers: buildGitHubHeaders(token),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (resp.status === 204) {
        return res.json({ ok: true });
      }

      const responseText = await resp.text().catch(() => "");
      let detail: unknown = responseText || null;
      if (responseText) {
        try {
          detail = JSON.parse(responseText);
        } catch {
          detail = responseText;
        }
      }

      if (resp.status === 404) {
        return res.status(404).json({ error: "repo_not_found", detail });
      }

      return res.status(resp.status).json({
        error: "github_repo_delete_failed",
        status: resp.status,
        detail,
      });
    } catch (err) {
      return res.status(502).json({
        error: "github_repo_delete_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/github/repos/:owner/:repo/branches", async (req, res) => {
    const pat = typeof req.headers["x-github-pat"] === "string" ? req.headers["x-github-pat"].trim() : null;
    const token = pat || getGitHubAccessToken();
    if (!token) return res.status(401).json({ error: "github_not_connected" });
    const { owner, repo } = req.params;
    const authHeader = pat ? `token ${token}` : `Bearer ${token}`;
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
        {
          headers: {
            ...buildGitHubHeaders(token),
            Authorization: authHeader,
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!resp.ok) {
        if (resp.status === 404) {
          return res.status(404).json({
            error: "repo_not_found",
            message: `Repository ${owner}/${repo} not found or not accessible with current token`,
          });
        }
        if (resp.status === 401) {
          return res.status(401).json({ error: "token_invalid", message: "Token is invalid or expired" });
        }
        return res.status(resp.status).json({ error: "github_api_error", status: resp.status });
      }
      const branches = (await resp.json()) as any[];
      const repoResp = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        {
          headers: {
            ...buildGitHubHeaders(token),
            Authorization: authHeader,
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      const repoData = repoResp.ok ? ((await repoResp.json()) as any) : null;
      res.json({
        remote_branches: branches.map((b: any) => ({
          name: b.name,
          sha: b.commit?.sha,
          is_default: b.name === repoData?.default_branch,
        })),
        default_branch: repoData?.default_branch ?? null,
      });
    } catch (err) {
      res.status(502).json({ error: "github_fetch_failed", message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/github/clone", (req, res) => {
    const pat = typeof req.headers["x-github-pat"] === "string" ? req.headers["x-github-pat"].trim() : null;
    const token = pat || getGitHubAccessToken();
    if (!token) return res.status(401).json({ error: "github_not_connected" });
    const { owner, repo, branch, target_path } = req.body ?? {};
    if (!owner || !repo) return res.status(400).json({ error: "owner_and_repo_required" });

    const repoFullName = `${owner}/${repo}`;
    const targetPath = normalizeTargetPath(target_path, String(repo));

    if (fs.existsSync(targetPath) && fs.existsSync(path.join(targetPath, ".git"))) {
      return res.json({ clone_id: null, already_exists: true, target_path: targetPath });
    }

    const targetParent = path.dirname(targetPath);
    if (targetParent && !fs.existsSync(targetParent)) {
      try {
        fs.mkdirSync(targetParent, { recursive: true });
      } catch (err) {
        return res.status(400).json({
          error: "target_path_parent_unavailable",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const cloneId = randomUUID();
    activeClones.set(cloneId, { status: "cloning", progress: 0, targetPath, repoFullName });

    const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    const args = ["clone", "--progress"];
    if (branch) {
      args.push("--branch", branch, "--single-branch");
    }
    args.push(cloneUrl, targetPath);

    const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderrBuf = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const match = stderrBuf.match(/Receiving objects:\s+(\d+)%/);
      const resolveMatch = stderrBuf.match(/Resolving deltas:\s+(\d+)%/);
      let pct = 0;
      if (resolveMatch) pct = 50 + Math.floor(parseInt(resolveMatch[1], 10) / 2);
      else if (match) pct = Math.floor(parseInt(match[1], 10) / 2);
      const entry = activeClones.get(cloneId);
      if (entry) {
        entry.progress = pct;
      }
      broadcast("clone_progress", { clone_id: cloneId, progress: pct, status: "cloning" });
    });

    child.on("close", (code) => {
      const entry = activeClones.get(cloneId);
      if (entry) {
        if (code === 0) {
          entry.status = "done";
          entry.progress = 100;
          broadcast("clone_progress", { clone_id: cloneId, progress: 100, status: "done" });
        } else {
          entry.status = "error";
          entry.error = `git clone exited with code ${code}: ${stderrBuf.slice(-500)}`;
          broadcast("clone_progress", {
            clone_id: cloneId,
            progress: entry.progress,
            status: "error",
            error: entry.error,
          });
        }
      }
    });

    child.on("error", (err) => {
      const entry = activeClones.get(cloneId);
      if (entry) {
        entry.status = "error";
        entry.error = err.message;
        broadcast("clone_progress", { clone_id: cloneId, progress: 0, status: "error", error: err.message });
      }
    });

    res.json({ clone_id: cloneId, target_path: targetPath });
  });

  app.delete("/api/github/local-path", (req, res) => {
    const token = getGitHubAccessToken();
    if (!token) return res.status(401).json({ error: "github_not_connected" });
    const rawTargetPath = typeof req.body?.target_path === "string" ? req.body.target_path.trim() : "";
    if (!rawTargetPath) return res.status(400).json({ error: "target_path_required" });
    const targetPath = normalizeTargetPath(rawTargetPath);
    if (!path.isAbsolute(targetPath)) {
      return res.status(400).json({ error: "absolute_path_required" });
    }
    if (!fs.existsSync(targetPath)) {
      return res.json({ ok: true, removed: false, target_path: targetPath });
    }
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(targetPath);
    } catch (err) {
      return res.status(400).json({
        error: "local_path_stat_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: "local_path_not_directory" });
    }
    if (!fs.existsSync(path.join(targetPath, ".git"))) {
      return res.status(409).json({ error: "local_cleanup_requires_git_clone" });
    }
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return res.json({ ok: true, removed: true, target_path: targetPath });
    } catch (err) {
      return res.status(500).json({
        error: "local_path_cleanup_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/github/clone/:cloneId", (req, res) => {
    const entry = activeClones.get(req.params.cloneId);
    if (!entry) return res.status(404).json({ error: "clone_not_found" });
    res.json({ clone_id: req.params.cloneId, ...entry });
  });

  app.get("/api/projects/:id/branches", (req, res) => {
    const project = db.prepare("SELECT id, project_path FROM projects WHERE id = ?").get(req.params.id) as
      | { id: string; project_path: string }
      | undefined;
    if (!project) return res.status(404).json({ error: "project_not_found" });
    try {
      const raw = execFileSync("git", ["branch", "-a", "--no-color"], {
        cwd: project.project_path,
        stdio: "pipe",
        timeout: 10000,
      }).toString();
      const lines = raw
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean);
      const current = lines.find((l: string) => l.startsWith("* "))?.replace("* ", "") ?? null;
      const branches = lines.map((l: string) => l.replace(/^\*\s+/, ""));
      res.json({ branches, current_branch: current });
    } catch (err) {
      res.status(500).json({ error: "git_branch_failed", message: err instanceof Error ? err.message : String(err) });
    }
  });
}
