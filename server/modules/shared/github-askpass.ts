import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type GitHubAskPassHandle = {
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
};

export function buildGitHubHttpsUrl(repoFullName: string): string {
  return `https://github.com/${repoFullName.replace(/^\/+|\/+$/g, "")}.git`;
}

export function createGitHubAskPassEnv(token: string): GitHubAskPassHandle {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-github-askpass-"));
  const scriptPath = path.join(tempDir, "askpass.mjs");
  const runnerPath = path.join(tempDir, process.platform === "win32" ? "askpass.cmd" : "askpass.sh");
  const nodePath = process.execPath;

  fs.writeFileSync(
    scriptPath,
    [
      'const prompt = process.argv.slice(2).join(" ").toLowerCase();',
      'if (prompt.includes("username")) process.stdout.write("x-access-token");',
      'else if (prompt.includes("password")) process.stdout.write(process.env.GITHUB_TOKEN_FOR_ASKPASS || "");',
      'else process.stdout.write("");',
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o700 },
  );

  if (process.platform === "win32") {
    fs.writeFileSync(runnerPath, `@echo off\r\n"${nodePath}" "${scriptPath}" %*\r\n`, {
      encoding: "utf8",
      mode: 0o700,
    });
  } else {
    fs.writeFileSync(runnerPath, `#!/bin/sh\nexec "${nodePath}" "${scriptPath}" "$@"\n`, {
      encoding: "utf8",
      mode: 0o700,
    });
  }

  return {
    env: {
      ...process.env,
      GIT_ASKPASS: runnerPath,
      GIT_TERMINAL_PROMPT: "0",
      GITHUB_TOKEN_FOR_ASKPASS: token,
    },
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    },
  };
}
