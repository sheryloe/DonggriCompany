import fs from "node:fs";
import path from "node:path";

export type HostExecutableResolution =
  | {
      ok: true;
      executable: string;
      argv: string[];
      commandPath: string;
      source: "native" | "node-self" | "npm-cmd";
      shell: false;
    }
  | {
      ok: false;
      reason: string;
    };

export type ResolveHostExecutableInput = {
  command: string;
  argv?: readonly string[];
  pathValue?: string;
  platform?: NodeJS.Platform;
  nodeExecutable?: string;
  allowedCommands: readonly string[];
};

const COMMAND_META_PATTERN = /[\0\r\n&|<>^%!`]/u;
const WINDOWS_NATIVE_EXTENSIONS = [".exe", ".com"];

function normalizeForComparison(value: string, platform: NodeJS.Platform): string {
  const normalized = path.normalize(value);
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isInside(parent: string, candidate: string, platform: NodeJS.Platform): boolean {
  const normalizedParent = normalizeForComparison(path.resolve(parent), platform);
  const normalizedCandidate = normalizeForComparison(path.resolve(candidate), platform);
  const relative = path.relative(normalizedParent, normalizedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateRegularFile(
  candidate: string,
  platform: NodeJS.Platform,
): { ok: true; realPath: string } | { ok: false; reason: string } {
  if (!path.isAbsolute(candidate)) {
    return { ok: false, reason: `executable_path_not_absolute: ${candidate}` };
  }

  try {
    const lstat = fs.lstatSync(candidate);
    if (!lstat.isFile()) return { ok: false, reason: `executable_not_regular_file: ${candidate}` };
    if (lstat.isSymbolicLink()) return { ok: false, reason: `executable_reparse_rejected: ${candidate}` };

    const realPath = fs.realpathSync.native(candidate);
    if (
      platform === "win32" &&
      normalizeForComparison(realPath, platform) !== normalizeForComparison(candidate, platform)
    ) {
      return { ok: false, reason: `executable_reparse_rejected: ${candidate}` };
    }
    if (platform !== "win32") fs.accessSync(realPath, fs.constants.X_OK);
    return { ok: true, realPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `executable_invalid: ${candidate} (${message})` };
  }
}

function splitAbsoluteSearchPath(pathValue: string | undefined): string[] {
  const unique = new Set<string>();
  for (const rawPart of String(pathValue ?? "").split(path.delimiter)) {
    const part = rawPart.trim().replace(/^"|"$/g, "");
    if (!part || !path.isAbsolute(part)) continue;
    unique.add(path.resolve(part));
  }
  return [...unique];
}

function findCommandCandidate(
  command: string,
  pathValue: string | undefined,
  platform: NodeJS.Platform,
): string | null {
  const hasSeparator = command.includes("/") || command.includes("\\");
  const explicit = path.isAbsolute(command) || hasSeparator;
  if (explicit) {
    if (!path.isAbsolute(command)) return null;
    if (platform !== "win32" || path.extname(command)) return path.resolve(command);
    for (const extension of [...WINDOWS_NATIVE_EXTENSIONS, ".cmd"]) {
      const candidate = `${path.resolve(command)}${extension}`;
      if (fs.existsSync(candidate)) return candidate;
    }
    return path.resolve(command);
  }

  const searchDirectories = splitAbsoluteSearchPath(pathValue);
  const extensions = platform === "win32" && !path.extname(command) ? [...WINDOWS_NATIVE_EXTENSIONS, ".cmd"] : [""];
  for (const directory of searchDirectories) {
    for (const extension of extensions) {
      const candidate = path.resolve(directory, `${command}${extension}`);
      if (!isInside(directory, candidate, platform) || !fs.existsSync(candidate)) continue;
      return candidate;
    }
  }
  return null;
}

function isCommandAllowed(params: {
  command: string;
  allowedCommands: readonly string[];
  platform: NodeJS.Platform;
}): boolean {
  const { command, allowedCommands, platform } = params;
  const commandHasSeparator = command.includes("/") || command.includes("\\");
  const commandIsAbsolute = path.isAbsolute(command);
  if (commandHasSeparator && !commandIsAbsolute) return false;

  for (const rawAllowed of Array.isArray(allowedCommands) ? allowedCommands : []) {
    const allowed = String(rawAllowed ?? "").trim();
    if (!allowed || COMMAND_META_PATTERN.test(allowed)) continue;
    const allowedHasSeparator = allowed.includes("/") || allowed.includes("\\");
    const allowedIsAbsolute = path.isAbsolute(allowed);
    if (allowedHasSeparator && !allowedIsAbsolute) continue;

    if (commandIsAbsolute) {
      if (!allowedIsAbsolute) continue;
      if (
        normalizeForComparison(path.resolve(command), platform) ===
        normalizeForComparison(path.resolve(allowed), platform)
      ) {
        return true;
      }
      continue;
    }

    if (allowedIsAbsolute) continue;
    const normalizedCommand = platform === "win32" ? command.toLowerCase() : command;
    const normalizedAllowed = platform === "win32" ? allowed.toLowerCase() : allowed;
    if (normalizedCommand === normalizedAllowed) return true;
  }
  return false;
}

function parseNpmCmdEntrypoint(
  shimPath: string,
  platform: NodeJS.Platform,
): { ok: true; entrypoint: string } | { ok: false; reason: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(shimPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `npm_cmd_unreadable: ${shimPath} (${message})` };
  }

  const lines = raw
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const expectedPrefix = [
    "@echo off",
    "goto start",
    ":find_dp0",
    "set dp0=%~dp0",
    "exit /b",
    ":start",
    "setlocal",
    "call :find_dp0",
    'if exist "%dp0%\\node.exe" (',
    'set "_prog=%dp0%\\node.exe"',
    ") else (",
    'set "_prog=node"',
    "set pathext=%pathext:;.js;=;%",
    ")",
  ];
  const normalizedPrefix = lines.slice(0, expectedPrefix.length).map((line) => line.toLowerCase());
  if (
    lines.length !== expectedPrefix.length + 1 ||
    normalizedPrefix.some((line, index) => line !== expectedPrefix[index])
  ) {
    return { ok: false, reason: `npm_cmd_template_invalid: ${shimPath}` };
  }

  const finalLine = lines.at(-1) ?? "";
  const match = finalLine.match(
    /^endLocal & goto #_undefined_# 2>NUL \|\| title %COMSPEC% & "%_prog%"\s+"%dp0%[\\/]([^"\r\n]+\.js)" %\*$/iu,
  );
  if (!match) return { ok: false, reason: `npm_cmd_template_invalid: ${shimPath}` };

  const relativeEntrypoint = match[1].replace(/[\\/]+/gu, path.sep);
  if (relativeEntrypoint.split(path.sep).includes("..") || path.isAbsolute(relativeEntrypoint)) {
    return { ok: false, reason: `npm_cmd_entrypoint_escape: ${shimPath}` };
  }

  const shimDirectory = path.dirname(shimPath);
  const entrypoint = path.resolve(shimDirectory, relativeEntrypoint);
  if (!isInside(shimDirectory, entrypoint, platform)) {
    return { ok: false, reason: `npm_cmd_entrypoint_escape: ${shimPath}` };
  }
  const validated = validateRegularFile(entrypoint, platform);
  if (!validated.ok) return { ok: false, reason: `npm_cmd_entrypoint_invalid: ${validated.reason}` };
  return { ok: true, entrypoint: validated.realPath };
}

export function resolveHostExecutable(input: ResolveHostExecutableInput): HostExecutableResolution {
  const platform = input.platform ?? process.platform;
  const command = String(input.command ?? "").trim();
  const argv = [...(input.argv ?? [])].map(String);
  if (!command) return { ok: false, reason: "executable_command_required" };
  if (COMMAND_META_PATTERN.test(command)) {
    return { ok: false, reason: `executable_command_metacharacter_rejected: ${command}` };
  }
  if (!isCommandAllowed({ command, allowedCommands: input.allowedCommands, platform })) {
    return { ok: false, reason: `executable_command_not_allowed: ${command}` };
  }

  const nodeExecutable = path.resolve(input.nodeExecutable ?? process.execPath);
  const normalizedCommand = command.toLowerCase();
  if (normalizedCommand === "node" || normalizedCommand === "node.exe") {
    const validatedNode = validateRegularFile(nodeExecutable, platform);
    if (!validatedNode.ok) return validatedNode;
    return {
      ok: true,
      executable: validatedNode.realPath,
      argv,
      commandPath: validatedNode.realPath,
      source: "node-self",
      shell: false,
    };
  }

  const candidate = findCommandCandidate(command, input.pathValue, platform);
  if (!candidate) return { ok: false, reason: `executable_not_found: ${command}` };
  const extension = path.extname(candidate).toLowerCase();
  if (platform === "win32" && extension === ".cmd") {
    const validatedShim = validateRegularFile(candidate, platform);
    if (!validatedShim.ok) return validatedShim;
    const parsedShim = parseNpmCmdEntrypoint(validatedShim.realPath, platform);
    if (!parsedShim.ok) return parsedShim;
    const validatedNode = validateRegularFile(nodeExecutable, platform);
    if (!validatedNode.ok) return validatedNode;
    return {
      ok: true,
      executable: validatedNode.realPath,
      argv: [parsedShim.entrypoint, ...argv],
      commandPath: validatedShim.realPath,
      source: "npm-cmd",
      shell: false,
    };
  }
  if (platform === "win32" && !WINDOWS_NATIVE_EXTENSIONS.includes(extension)) {
    return { ok: false, reason: `executable_extension_rejected: ${candidate}` };
  }

  const validated = validateRegularFile(candidate, platform);
  if (!validated.ok) return validated;
  return {
    ok: true,
    executable: validated.realPath,
    argv,
    commandPath: validated.realPath,
    source: "native",
    shell: false,
  };
}
