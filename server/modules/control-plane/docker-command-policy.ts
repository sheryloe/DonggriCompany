export type DockerCommandDecision = "allow" | "approval-required" | "block";

export type DockerCommandPolicyResult = {
  decision: DockerCommandDecision;
  reason_code:
    | "DOCKER_READ_ONLY_ALLOWLIST"
    | "E_DOCKER_APPROVAL_REQUIRED"
    | "E_DOCKER_COMMAND_BLOCKED";
  operation_class:
    | "docker-read-only"
    | "docker-runtime-or-host-lifecycle-change"
    | "docker-unknown-or-compound";
  required_approval: "APR-DKR-OPS-*" | null;
  matched_rule: string;
};

const APPROVAL_REQUIRED: Omit<DockerCommandPolicyResult, "matched_rule"> = {
  decision: "approval-required",
  reason_code: "E_DOCKER_APPROVAL_REQUIRED",
  operation_class: "docker-runtime-or-host-lifecycle-change",
  required_approval: "APR-DKR-OPS-*",
};

const BLOCKED: Omit<DockerCommandPolicyResult, "matched_rule"> = {
  decision: "block",
  reason_code: "E_DOCKER_COMMAND_BLOCKED",
  operation_class: "docker-unknown-or-compound",
  required_approval: null,
};

const ALLOWED: Omit<DockerCommandPolicyResult, "matched_rule"> = {
  decision: "allow",
  reason_code: "DOCKER_READ_ONLY_ALLOWLIST",
  operation_class: "docker-read-only",
  required_approval: null,
};

const DIRECT_MUTATION_COMMANDS = new Set([
  "attach",
  "build",
  "commit",
  "cp",
  "create",
  "exec",
  "export",
  "import",
  "kill",
  "load",
  "login",
  "logout",
  "pause",
  "plugin",
  "pull",
  "push",
  "rename",
  "restart",
  "rm",
  "rmi",
  "run",
  "save",
  "start",
  "stop",
  "swarm",
  "tag",
  "trust",
  "unpause",
  "update",
  "wait",
]);

const DIRECT_READ_ONLY_COMMANDS = new Set([
  "diff",
  "events",
  "history",
  "images",
  "info",
  "inspect",
  "logs",
  "port",
  "ps",
  "stats",
  "status",
  "top",
  "version",
]);

const RESOURCE_READ_ONLY_COMMANDS: Readonly<Record<string, ReadonlySet<string>>> = {
  container: new Set(["diff", "inspect", "logs", "ls", "port", "stats", "top"]),
  image: new Set(["history", "inspect", "ls"]),
  network: new Set(["inspect", "ls"]),
  volume: new Set(["inspect", "ls"]),
};

const RESOURCE_MUTATION_COMMANDS: Readonly<Record<string, ReadonlySet<string>>> = {
  container: new Set([
    "attach",
    "commit",
    "cp",
    "create",
    "exec",
    "export",
    "kill",
    "pause",
    "prune",
    "rename",
    "restart",
    "rm",
    "run",
    "start",
    "stop",
    "unpause",
    "update",
    "wait",
  ]),
  image: new Set(["build", "import", "load", "prune", "pull", "push", "rm", "save", "tag"]),
  network: new Set(["connect", "create", "disconnect", "prune", "rm"]),
  volume: new Set(["create", "prune", "rm", "update"]),
};

const COMPOSE_READ_ONLY_COMMANDS = new Set([
  "config",
  "events",
  "images",
  "ls",
  "logs",
  "port",
  "ps",
  "top",
  "version",
]);

const COMPOSE_MUTATION_COMMANDS = new Set([
  "build",
  "cp",
  "create",
  "down",
  "exec",
  "kill",
  "pause",
  "pull",
  "push",
  "restart",
  "rm",
  "run",
  "start",
  "stop",
  "unpause",
  "up",
  "watch",
]);

const COMPOSE_OPTIONS_WITH_VALUE = new Set([
  "--ansi",
  "--env-file",
  "--file",
  "--parallel",
  "--profile",
  "--progress",
  "--project-directory",
  "--project-name",
  "-f",
  "-p",
]);

const COMPOSE_BOOLEAN_OPTIONS = new Set(["--all-resources", "--compatibility", "--dry-run"]);

const DOCKER_GLOBAL_OPTIONS_WITH_VALUE = new Set([
  "--config",
  "--context",
  "--host",
  "--log-level",
  "--tlscacert",
  "--tlscert",
  "--tlskey",
  "-c",
  "-h",
]);

const DOCKER_GLOBAL_BOOLEAN_OPTIONS = new Set(["--debug", "--tls", "--tlsverify", "-d"]);

function allowed(matchedRule: string): DockerCommandPolicyResult {
  return { ...ALLOWED, matched_rule: matchedRule };
}

function approvalRequired(matchedRule: string): DockerCommandPolicyResult {
  return { ...APPROVAL_REQUIRED, matched_rule: matchedRule };
}

function blocked(matchedRule: string): DockerCommandPolicyResult {
  return { ...BLOCKED, matched_rule: matchedRule };
}

function normalizeToken(token: string): string {
  return token.replace(/^["']|["']$/g, "").toLowerCase();
}

function tokenize(command: string): string[] {
  return (command.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []).map(normalizeToken);
}

function skipKnownOptions(
  tokens: string[],
  startIndex: number,
  optionsWithValue: ReadonlySet<string>,
  booleanOptions: ReadonlySet<string>,
): { index: number; valid: boolean } {
  let index = startIndex;
  while (index < tokens.length && tokens[index].startsWith("-")) {
    const option = tokens[index];
    const optionName = option.includes("=") ? option.slice(0, option.indexOf("=")) : option;
    if (booleanOptions.has(optionName)) {
      index += 1;
      continue;
    }
    if (optionsWithValue.has(optionName)) {
      if (option.includes("=")) {
        index += 1;
        continue;
      }
      if (index + 1 >= tokens.length) return { index, valid: false };
      index += 2;
      continue;
    }
    return { index, valid: false };
  }
  return { index, valid: true };
}

function isDockerExecutable(token: string): boolean {
  const executable = token.replaceAll("/", "\\").split("\\").at(-1);
  return executable === "docker" || executable === "docker.exe";
}

function isLegacyComposeExecutable(token: string): boolean {
  const executable = token.replaceAll("/", "\\").split("\\").at(-1);
  return executable === "docker-compose" || executable === "docker-compose.exe";
}

function classifyComposeCommand(tokens: string[], startIndex: number): DockerCommandPolicyResult {
  const composeOptions = skipKnownOptions(tokens, startIndex, COMPOSE_OPTIONS_WITH_VALUE, COMPOSE_BOOLEAN_OPTIONS);
  if (!composeOptions.valid || composeOptions.index >= tokens.length) return blocked("unknown-compose-option-or-command");
  const subcommand = tokens[composeOptions.index];
  if (COMPOSE_MUTATION_COMMANDS.has(subcommand)) return approvalRequired(`docker-compose-${subcommand}`);
  if (COMPOSE_READ_ONLY_COMMANDS.has(subcommand)) return allowed(`docker-compose-${subcommand}`);
  return blocked("unknown-compose-command");
}

function classifySimpleDockerCommand(command: string): DockerCommandPolicyResult {
  const tokens = tokenize(command);
  if (!tokens.length) return blocked("not-direct-docker-cli");
  if (isLegacyComposeExecutable(tokens[0])) return classifyComposeCommand(tokens, 1);
  if (!isDockerExecutable(tokens[0])) return blocked("not-direct-docker-cli");

  if (tokens.length === 2 && (tokens[1] === "--version" || tokens[1] === "-v")) {
    return allowed("docker-version-flag");
  }

  const globalOptions = skipKnownOptions(
    tokens,
    1,
    DOCKER_GLOBAL_OPTIONS_WITH_VALUE,
    DOCKER_GLOBAL_BOOLEAN_OPTIONS,
  );
  if (!globalOptions.valid || globalOptions.index >= tokens.length) return blocked("unknown-docker-global-option");

  const primary = tokens[globalOptions.index];
  const rest = tokens.slice(globalOptions.index + 1);
  if (DIRECT_MUTATION_COMMANDS.has(primary)) return approvalRequired(`docker-${primary}`);
  if (primary === "stats" && !rest.includes("--no-stream")) {
    return blocked("docker-stats-requires-no-stream");
  }
  if (DIRECT_READ_ONLY_COMMANDS.has(primary)) return allowed(`docker-${primary}`);

  if (primary === "compose") {
    return classifyComposeCommand(tokens, globalOptions.index + 1);
  }

  if (primary === "context") {
    const subcommand = rest[0] ?? "";
    if (["inspect", "ls", "show"].includes(subcommand)) return allowed(`docker-context-${subcommand}`);
    if (["create", "export", "import", "rm", "update", "use"].includes(subcommand)) {
      return approvalRequired(`docker-context-${subcommand}`);
    }
    return blocked("unknown-context-command");
  }

  if (primary === "system") {
    const subcommand = rest[0] ?? "";
    if (subcommand === "df") return allowed("docker-system-df");
    if (subcommand === "prune") return approvalRequired("docker-system-prune");
    return blocked("unknown-system-command");
  }

  if (primary === "desktop") {
    const subcommand = rest[0] ?? "";
    if (["status", "version"].includes(subcommand)) return allowed(`docker-desktop-${subcommand}`);
    if (["quit", "restart", "shutdown", "start", "stop"].includes(subcommand)) {
      return approvalRequired(`docker-desktop-${subcommand}`);
    }
    return blocked("unknown-docker-desktop-command");
  }

  const resourceReads = RESOURCE_READ_ONLY_COMMANDS[primary];
  const resourceMutations = RESOURCE_MUTATION_COMMANDS[primary];
  if (resourceReads || resourceMutations) {
    const subcommand = rest[0] ?? "";
    if (resourceMutations?.has(subcommand)) return approvalRequired(`docker-${primary}-${subcommand}`);
    if (subcommand === "stats" && !rest.includes("--no-stream")) {
      return blocked(`docker-${primary}-stats-requires-no-stream`);
    }
    if (resourceReads?.has(subcommand)) return allowed(`docker-${primary}-${subcommand}`);
    return blocked(`unknown-${primary}-command`);
  }

  return blocked("unknown-docker-command");
}

function classifyHostLifecycleCommand(command: string): DockerCommandPolicyResult | null {
  const lower = command.toLowerCase();
  if (/\bwsl(?:\.exe)?\b[\s\S]*\s--(?:shutdown|terminate)\b/.test(lower)) {
    return approvalRequired("wsl-lifecycle");
  }

  const dockerProcessOrService = /docker\s*desktop(?:\.exe)?|com\.docker|docker[_-]?desktop|docker[_-]?backend/.test(lower);
  const processOrServiceMutation =
    /\b(?:start|stop|restart)-process\b|\b(?:start|stop|restart|set)-service\b|\btaskkill(?:\.exe)?\b|\bsc(?:\.exe)?\s+(?:start|stop|config)\b|\bnet\s+(?:start|stop)\b/.test(
      lower,
    );
  if (dockerProcessOrService && processOrServiceMutation) {
    return approvalRequired("docker-desktop-process-or-service-lifecycle");
  }

  const launchesDockerDesktop = /\bstart-process\b[\s\S]*docker\s*desktop(?:\.exe)?/.test(lower);
  const desktopQuitOrRestart = /docker\s*desktop(?:\.exe)?[\s\S]*(?:--quit|\bquit\b|\brestart\b)/.test(lower);
  if (launchesDockerDesktop || desktopQuitOrRestart) {
    return approvalRequired("docker-desktop-direct-lifecycle");
  }

  const dockerSocket = /docker[_-]?inference|inference\.sock|docker\.sock|docker_engine|dockerdesktopvm/.test(lower);
  const socketMutation =
    /\bremove-item\b|\bmove-item\b|\brename-item\b|\b(?:del|erase|move|mv|ren|rm|unlink)\b/.test(lower);
  if (dockerSocket && socketMutation) {
    return approvalRequired("docker-socket-move-or-delete");
  }

  return null;
}

export function classifyDockerCommand(operation: unknown): DockerCommandPolicyResult {
  const command = String(operation ?? "").trim();
  if (!command) return blocked("empty-command");

  const hostLifecycle = classifyHostLifecycleCommand(command);
  if (hostLifecycle) return hostLifecycle;

  if (/[;&|><`\r\n]|\$\(|@\(/.test(command)) {
    const segments = command.split(/&&|\|\||[;&|><\r\n]+/).map((segment) => segment.trim()).filter(Boolean);
    const decisions = segments.map(classifySimpleDockerCommand);
    const riskySegment = decisions.find((decision) => decision.decision === "approval-required");
    if (riskySegment) return riskySegment;
    return blocked("compound-or-redirected-command");
  }

  return classifySimpleDockerCommand(command);
}
