import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveHostExecutable } from "./host-executable-resolver.ts";

const cleanupDirectories: string[] = [];

function makeTempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "host-executable-resolver-"));
  cleanupDirectories.push(directory);
  return directory;
}

function npmCmd(entrypoint = "node_modules\\safe-cli\\cli.js"): string {
  return [
    "@ECHO off",
    "GOTO start",
    ":find_dp0",
    "SET dp0=%~dp0",
    "EXIT /b",
    ":start",
    "SETLOCAL",
    "CALL :find_dp0",
    'IF EXIST "%dp0%\\node.exe" (',
    '  SET "_prog=%dp0%\\node.exe"',
    ") ELSE (",
    '  SET "_prog=node"',
    "  SET PATHEXT=%PATHEXT:;.JS;=;%",
    ")",
    `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${entrypoint}" %*`,
    "",
  ].join("\r\n");
}

afterEach(() => {
  while (cleanupDirectories.length > 0) {
    fs.rmSync(cleanupDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("resolveHostExecutable", () => {
  it("fails closed when the caller omits an executable allowlist", () => {
    expect(resolveHostExecutable({ command: "node" } as any)).toEqual({
      ok: false,
      reason: "executable_command_not_allowed: node",
    });
  });

  it("uses the current absolute Node executable without consulting a shell", () => {
    const resolved = resolveHostExecutable({
      command: "node",
      argv: ["--version"],
      platform: process.platform,
      allowedCommands: ["node"],
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.executable).toBe(fs.realpathSync.native(process.execPath));
      expect(resolved.argv).toEqual(["--version"]);
      expect(resolved.source).toBe("node-self");
      expect(resolved.shell).toBe(false);
    }
  });

  it.runIf(process.platform === "win32")(
    "translates a canonical npm .cmd shim to Node plus a bounded JS entrypoint",
    () => {
      const directory = makeTempDirectory();
      const entrypoint = path.join(directory, "node_modules", "safe-cli", "cli.js");
      fs.mkdirSync(path.dirname(entrypoint), { recursive: true });
      fs.writeFileSync(entrypoint, "process.exit(0);", "utf8");
      fs.writeFileSync(path.join(directory, "safe-cli.cmd"), npmCmd(), "utf8");

      const resolved = resolveHostExecutable({
        command: "safe-cli",
        argv: ["--json"],
        pathValue: directory,
        platform: "win32",
        allowedCommands: ["safe-cli"],
      });

      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.executable).toBe(fs.realpathSync.native(process.execPath));
        expect(resolved.argv).toEqual([fs.realpathSync.native(entrypoint), "--json"]);
        expect(resolved.source).toBe("npm-cmd");
        expect(resolved.shell).toBe(false);
      }
    },
  );

  it.runIf(process.platform === "win32")("rejects a tampered npm shim instead of passing it to cmd.exe", () => {
    const directory = makeTempDirectory();
    const entrypoint = path.join(directory, "node_modules", "safe-cli", "cli.js");
    fs.mkdirSync(path.dirname(entrypoint), { recursive: true });
    fs.writeFileSync(entrypoint, "process.exit(0);", "utf8");
    fs.writeFileSync(
      path.join(directory, "safe-cli.cmd"),
      npmCmd().replace("GOTO start", "calc.exe\r\nGOTO start"),
      "utf8",
    );

    expect(
      resolveHostExecutable({
        command: "safe-cli",
        pathValue: directory,
        platform: "win32",
        allowedCommands: ["safe-cli"],
      }),
    ).toEqual({
      ok: false,
      reason: expect.stringContaining("npm_cmd_template_invalid"),
    });
  });

  it.runIf(process.platform === "win32")(
    "rejects a npm shim entrypoint that escapes its installation directory",
    () => {
      const directory = makeTempDirectory();
      fs.writeFileSync(path.join(directory, "safe-cli.cmd"), npmCmd("..\\outside.js"), "utf8");

      expect(
        resolveHostExecutable({
          command: "safe-cli",
          pathValue: directory,
          platform: "win32",
          allowedCommands: ["safe-cli"],
        }),
      ).toEqual({
        ok: false,
        reason: expect.stringContaining("npm_cmd_entrypoint_escape"),
      });
    },
  );

  it("rejects command metacharacters before path lookup", () => {
    expect(
      resolveHostExecutable({
        command: "codex & whoami",
        pathValue: process.env.PATH,
        allowedCommands: ["codex"],
      }),
    ).toEqual({
      ok: false,
      reason: "executable_command_metacharacter_rejected: codex & whoami",
    });
  });

  it("rejects relative path escape commands", () => {
    expect(
      resolveHostExecutable({
        command: `..${path.sep}codex`,
        pathValue: process.env.PATH,
        allowedCommands: ["codex"],
      }),
    ).toEqual({
      ok: false,
      reason: `executable_command_not_allowed: ..${path.sep}codex`,
    });
  });

  it("rejects a reparse or symbolic-link executable when the host permits creating one", () => {
    const directory = makeTempDirectory();
    const linkPath = path.join(directory, process.platform === "win32" ? "linked-cli.exe" : "linked-cli");
    try {
      fs.symlinkSync(process.execPath, linkPath, "file");
    } catch {
      return;
    }

    const resolved = resolveHostExecutable({
      command: linkPath,
      platform: process.platform,
      allowedCommands: [linkPath],
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toMatch(/reparse_rejected|not_regular_file/u);
  });

  it("rejects an arbitrary absolute executable when only its basename token is allowed", () => {
    const directory = makeTempDirectory();
    const arbitraryPath = path.join(directory, process.platform === "win32" ? "codex.exe" : "codex");
    fs.copyFileSync(process.execPath, arbitraryPath);
    if (process.platform !== "win32") fs.chmodSync(arbitraryPath, 0o700);

    expect(
      resolveHostExecutable({
        command: arbitraryPath,
        platform: process.platform,
        allowedCommands: ["codex"],
      }),
    ).toEqual({
      ok: false,
      reason: `executable_command_not_allowed: ${arbitraryPath}`,
    });
  });
});
