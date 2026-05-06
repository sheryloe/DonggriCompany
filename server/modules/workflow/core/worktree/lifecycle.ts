import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export type WorktreeInfo = {
  worktreePath: string;
  branchName: string;
  projectPath: string;
};

type CreateWorktreeLifecycleToolsDeps = {
  appendTaskLog: (taskId: string, kind: string, message: string) => void;
  taskWorktrees: Map<string, WorktreeInfo>;
};

export function createWorktreeLifecycleTools(deps: CreateWorktreeLifecycleToolsDeps) {
  const { appendTaskLog, taskWorktrees } = deps;
  const gitAddInitialTimeoutMs = 120_000;
  const gitAddRetryTimeoutMs = 420_000;
  const gitCommitTimeoutMs = 180_000;
  const gitWorktreeAddTimeoutMs = Math.max(15_000, Number(process.env.WORKTREE_ADD_TIMEOUT_MS ?? 120_000) || 120_000);
  const allowGitBootstrap = process.env.WORKTREE_ALLOW_GIT_BOOTSTRAP === "1";

  function isGitRepo(dir: string): boolean {
    try {
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir, stdio: "pipe", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  function ensureWorktreeBootstrapRepo(projectPath: string, taskId: string): boolean {
    if (isGitRepo(projectPath)) return true;
    if (!allowGitBootstrap) {
      appendTaskLog(taskId, "system", "execution_blocked git_repo_required");
      appendTaskLog(taskId, "system", "Git bootstrap is disabled. Set WORKTREE_ALLOW_GIT_BOOTSTRAP=1 to enable it.");
      return false;
    }
    const shortId = taskId.slice(0, 8);
    try {
      if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
        appendTaskLog(taskId, "system", `Git bootstrap skipped: invalid project path (${projectPath})`);
        return false;
      }
    } catch {
      appendTaskLog(taskId, "system", `Git bootstrap skipped: cannot access project path (${projectPath})`);
      return false;
    }

    try {
      appendTaskLog(
        taskId,
        "system",
        "Git repository not found. Bootstrapping local repository for worktree execution...",
      );

      try {
        execFileSync("git", ["init", "-b", "main"], { cwd: projectPath, stdio: "pipe", timeout: 10000 });
      } catch {
        execFileSync("git", ["init"], { cwd: projectPath, stdio: "pipe", timeout: 10000 });
      }

      const excludePath = path.join(projectPath, ".git", "info", "exclude");
      const baseIgnore = [
        "node_modules/",
        "dist/",
        ".climpire-worktrees/",
        ".climpire/",
        ".DS_Store",
        "*.log",
        "data/",
        ".env",
        ".env.*",
        ".cache/",
        ".npm/",
        ".pnpm-store/",
        ".turbo/",
        ".next/",
      ];
      let existingExclude = "";
      try {
        existingExclude = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
      } catch {
        existingExclude = "";
      }
      const appendLines = baseIgnore.filter((line) => !existingExclude.includes(line));
      if (appendLines.length > 0) {
        const prefix = existingExclude && !existingExclude.endsWith("\n") ? "\n" : "";
        fs.appendFileSync(excludePath, `${prefix}${appendLines.join("\n")}\n`, "utf8");
      }

      const readConfig = (key: string): string => {
        try {
          return execFileSync("git", ["config", "--get", key], { cwd: projectPath, stdio: "pipe", timeout: 3000 })
            .toString()
            .trim();
        } catch {
          return "";
        }
      };
      if (!readConfig("user.name")) {
        execFileSync("git", ["config", "user.name", "Claw-Empire Bot"], {
          cwd: projectPath,
          stdio: "pipe",
          timeout: 3000,
        });
      }
      if (!readConfig("user.email")) {
        execFileSync("git", ["config", "user.email", "claw-empire@local"], {
          cwd: projectPath,
          stdio: "pipe",
          timeout: 3000,
        });
      }

      const runGitAdd = (timeout: number) => {
        execFileSync("git", ["add", "-A"], { cwd: projectPath, stdio: "pipe", timeout });
      };
      try {
        runGitAdd(gitAddInitialTimeoutMs);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/ETIMEDOUT|timed out/i.test(msg)) {
          appendTaskLog(
            taskId,
            "system",
            `Git bootstrap add timed out after ${gitAddInitialTimeoutMs}ms. Retrying with extended timeout...`,
          );
          runGitAdd(gitAddRetryTimeoutMs);
        } else {
          throw err;
        }
      }
      const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
        cwd: projectPath,
        stdio: "pipe",
        timeout: 15_000,
      })
        .toString()
        .trim();
      if (staged) {
        execFileSync("git", ["commit", "-m", "chore: initialize project for Claw-Empire worktrees"], {
          cwd: projectPath,
          stdio: "pipe",
          timeout: gitCommitTimeoutMs,
        });
      } else {
        execFileSync("git", ["commit", "--allow-empty", "-m", "chore: initialize project for Claw-Empire worktrees"], {
          cwd: projectPath,
          stdio: "pipe",
          timeout: 30_000,
        });
      }

      appendTaskLog(taskId, "system", "Git repository initialized automatically for worktree execution.");
      console.log(`[Claw-Empire] Auto-initialized git repo for task ${shortId} at ${projectPath}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendTaskLog(taskId, "system", `Git bootstrap failed: ${msg}`);
      console.error(`[Claw-Empire] Failed git bootstrap for task ${shortId}: ${msg}`);
      return false;
    }
  }

  function appendGitInfoExclude(cwd: string, patterns: string[]): void {
    const commonGitDirRaw = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd,
      stdio: "pipe",
      timeout: 5000,
    })
      .toString()
      .trim();
    const commonGitDir = path.isAbsolute(commonGitDirRaw)
      ? commonGitDirRaw
      : path.resolve(cwd, commonGitDirRaw);
    const excludePath = path.join(commonGitDir, "info", "exclude");
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
    const appendLines = patterns.filter((pattern) => !existing.split(/\r?\n/).includes(pattern));
    if (appendLines.length <= 0) return;
    const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(excludePath, `${prefix}${appendLines.join("\n")}\n`, "utf8");
  }

  function createWorktree(projectPath: string, taskId: string, agentName: string, baseBranch?: string): string | null {
    if (!ensureWorktreeBootstrapRepo(projectPath, taskId)) return null;
    if (!isGitRepo(projectPath)) return null;

    const shortId = taskId.slice(0, 8);
    const branchName = `climpire/${shortId}`;
    const worktreeBase = path.join(projectPath, ".climpire-worktrees");
    const worktreePath = path.join(worktreeBase, shortId);

    try {
      fs.mkdirSync(worktreeBase, { recursive: true });
      execFileSync("git", ["worktree", "prune"], { cwd: projectPath, stdio: "pipe", timeout: 5000 });

      // Get current branch/HEAD as base
      let base: string;
      if (baseBranch) {
        try {
          base = execFileSync("git", ["rev-parse", baseBranch], { cwd: projectPath, stdio: "pipe", timeout: 5000 })
            .toString()
            .trim();
        } catch {
          base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectPath, stdio: "pipe", timeout: 5000 })
            .toString()
            .trim();
        }
      } else {
        base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectPath, stdio: "pipe", timeout: 5000 })
          .toString()
          .trim();
      }

      const branchCandidates = [branchName, `${branchName}-1`, `${branchName}-2`, `${branchName}-3`];
      let created = false;
      let selectedBranch = branchName;
      let selectedWorktreePath = worktreePath;
      let lastError: unknown = null;

      for (let idx = 0; idx < branchCandidates.length; idx += 1) {
        const candidateBranch = branchCandidates[idx]!;
        const candidatePath = idx === 0 ? worktreePath : path.join(worktreeBase, `${shortId}-${idx}`);
        try {
          if (fs.existsSync(candidatePath)) {
            fs.rmSync(candidatePath, { recursive: true, force: true });
          }
        } catch {
          // best effort cleanup
        }

        const branchExists = (() => {
          try {
            execFileSync("git", ["show-ref", "--verify", `refs/heads/${candidateBranch}`], {
              cwd: projectPath,
              stdio: "pipe",
              timeout: 5000,
            });
            return true;
          } catch {
            return false;
          }
        })();

        const addArgs = branchExists
          ? ["worktree", "add", candidatePath, candidateBranch]
          : ["worktree", "add", candidatePath, "-b", candidateBranch, base];

        try {
          execFileSync("git", addArgs, {
            cwd: projectPath,
            stdio: "pipe",
            timeout: gitWorktreeAddTimeoutMs,
          });
          selectedBranch = candidateBranch;
          selectedWorktreePath = candidatePath;
          created = true;
          break;
        } catch (err: unknown) {
          lastError = err;
        }
      }

      if (!created) throw lastError instanceof Error ? lastError : new Error("worktree_add_failed");

      // Propagate .claude/skills into the worktree so agents can resolve installed skills
      try {
        const serverSkillsDir = path.join(process.cwd(), ".claude", "skills");
        if (fs.existsSync(serverSkillsDir)) {
          const wtClaudeDir = path.join(selectedWorktreePath, ".claude");
          const wtSkillsLink = path.join(wtClaudeDir, "skills");
          if (!fs.existsSync(wtSkillsLink)) {
            fs.mkdirSync(wtClaudeDir, { recursive: true });
            fs.symlinkSync(serverSkillsDir, wtSkillsLink, "junction");
          }
        }
      } catch {
        // best effort: skill propagation failure should not block execution
      }

      try {
        const runtimeNodeModules = path.join(process.cwd(), "node_modules");
        const worktreeNodeModules = path.join(selectedWorktreePath, "node_modules");
        if (fs.existsSync(runtimeNodeModules) && !fs.existsSync(worktreeNodeModules)) {
          appendGitInfoExclude(selectedWorktreePath, ["node_modules", "node_modules/"]);
          fs.symlinkSync(runtimeNodeModules, worktreeNodeModules, process.platform === "win32" ? "junction" : "dir");
          appendTaskLog(taskId, "system", `Worktree dependency link created: ${worktreeNodeModules}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        appendTaskLog(taskId, "system", `Worktree dependency link skipped: ${msg}`);
      }

      taskWorktrees.set(taskId, { worktreePath: selectedWorktreePath, branchName: selectedBranch, projectPath });
      console.log(
        `[Claw-Empire] Created worktree for task ${shortId}: ${selectedWorktreePath} (branch: ${selectedBranch}, agent: ${agentName})`,
      );
      return selectedWorktreePath;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendTaskLog(taskId, "error", `Worktree creation failed: ${msg}`);
      console.error(`[Claw-Empire] Failed to create worktree for task ${shortId}: ${msg}`);
      return null;
    }
  }

  function cleanupWorktree(projectPath: string, taskId: string): void {
    const info = taskWorktrees.get(taskId);
    if (!info) return;

    const shortId = taskId.slice(0, 8);

    try {
      execFileSync("git", ["worktree", "remove", info.worktreePath, "--force"], {
        cwd: projectPath,
        stdio: "pipe",
        timeout: 10000,
      });
    } catch {
      console.warn(`[Claw-Empire] git worktree remove failed for ${shortId}, falling back to manual cleanup`);
      try {
        if (fs.existsSync(info.worktreePath)) {
          fs.rmSync(info.worktreePath, { recursive: true, force: true });
        }
        execFileSync("git", ["worktree", "prune"], { cwd: projectPath, stdio: "pipe", timeout: 5000 });
      } catch {
        /* ignore */
      }
    }

    try {
      execFileSync("git", ["branch", "-D", info.branchName], {
        cwd: projectPath,
        stdio: "pipe",
        timeout: 5000,
      });
    } catch {
      console.warn(`[Claw-Empire] Failed to delete branch ${info.branchName}; manual cleanup may be required`);
    }

    taskWorktrees.delete(taskId);
    console.log(`[Claw-Empire] Cleaned up worktree for task ${shortId}`);
  }

  return {
    isGitRepo,
    createWorktree,
    cleanupWorktree,
  };
}
