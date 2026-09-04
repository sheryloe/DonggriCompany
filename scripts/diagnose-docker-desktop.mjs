import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = "1.0.0";
const DEFAULT_RECENT_MINUTES = 180;
const MAX_LOG_BYTES = 512 * 1024;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.join(SCRIPT_DIR, "fixtures", "docker-desktop");

const STATE_EXIT_CODES = Object.freeze({
  healthy: 0,
  engine_unreachable: 2,
  inference_socket_restart_risk: 2,
  recent_backend_crash: 2,
  unsupported_platform: 3,
  diagnostic_error: 1,
});

function assertReadOnlyCommand(command, args) {
  const taskListAllowed =
    command === "tasklist.exe" &&
    args.length === 5 &&
    args[0] === "/fi" &&
    ["IMAGENAME eq Docker Desktop.exe", "IMAGENAME eq com.docker.backend.exe"].includes(args[1]) &&
    args[2] === "/fo" &&
    args[3] === "csv" &&
    args[4] === "/nh";
  const engineQueryAllowed =
    command === "docker.exe" &&
    JSON.stringify(args) === JSON.stringify(["version", "--format", "{{json .Server.Version}}"]);
  const reparseQueryAllowed =
    command === "fsutil.exe" &&
    args.length === 3 &&
    args[0] === "reparsepoint" &&
    args[1] === "query" &&
    path.isAbsolute(args[2]);

  if (!taskListAllowed && !engineQueryAllowed && !reparseQueryAllowed) {
    throw new Error(`Command is outside the read-only allowlist: ${command}`);
  }
}

function isInside(basePath, candidatePath) {
  const resolvedBase = path.resolve(basePath);
  const resolvedCandidate = path.resolve(candidatePath);
  const relative = path.relative(resolvedBase, resolvedCandidate);
  return relative === "" || (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function runReadOnly(command, args, timeout = 5_000) {
  assertReadOnlyCommand(command, args);
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    timeout,
    windowsHide: true,
  });

  return {
    status: typeof result.status === "number" ? result.status : null,
    signal: result.signal ?? null,
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim(),
    error_code: result.error?.code ?? null,
  };
}

function readTail(filePath, maxBytes = MAX_LOG_BYTES) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;
  const handle = fs.openSync(filePath, "r");

  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(handle, buffer, 0, length, start);
    return {
      text: buffer.toString("utf8"),
      modified_at: stat.mtime.toISOString(),
      bytes_read: length,
      truncated: start > 0,
    };
  } finally {
    fs.closeSync(handle);
  }
}

function parseTimestamp(line) {
  const match = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/);
  if (!match) return null;
  const timestamp = Date.parse(match[0]);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function inspectBackendLog(text, { now, modifiedAt, recentMinutes }) {
  const lines = text.split(/\r?\n/);
  const inferenceFailures = lines.filter((line) => {
    const normalized = line.toLowerCase();
    return (
      normalized.includes("dockerinference") &&
      /(remove|cannot be accessed|access is denied|inaccessible|failed|error|reparse|1920|액세스할 수)/i.test(line)
    );
  });
  const crashLines = lines.filter((line) =>
    /(fatal|panic|backend crash|unexpectedly stopped|shutting down due to error)/i.test(line),
  );
  const signatureLines = [...inferenceFailures, ...crashLines];
  const timestamps = signatureLines.map(parseTimestamp).filter(Boolean).sort();
  const latestSignatureAt = timestamps.at(-1) ?? null;
  const fallbackTimestamp = modifiedAt ? Date.parse(modifiedAt) : Number.NaN;
  const signatureTimestamp = latestSignatureAt ? Date.parse(latestSignatureAt) : fallbackTimestamp;
  const ageMinutes = Number.isFinite(signatureTimestamp)
    ? Math.max(0, (now.getTime() - signatureTimestamp) / 60_000)
    : null;

  return {
    inference_failure_count: inferenceFailures.length,
    crash_signature_count: crashLines.length,
    latest_signature_at: latestSignatureAt,
    signature_age_minutes: ageMinutes === null ? null : Math.round(ageMinutes * 10) / 10,
    recent_signature: signatureLines.length > 0 && ageMinutes !== null && ageMinutes <= recentMinutes,
  };
}

function evaluateState({ engineReachable, socket, log }) {
  if (socket.listed && socket.reparse_query === "inaccessible") {
    return "inference_socket_restart_risk";
  }
  if (
    socket.reparse_query === "unavailable" ||
    (socket.listing_error_code && socket.listing_error_code !== "ENOENT") ||
    (log.read_error_code && log.read_error_code !== "ENOENT")
  ) {
    return "diagnostic_error";
  }
  if (log.recent_signature) return "recent_backend_crash";
  if (!engineReachable) return "engine_unreachable";
  return "healthy";
}

function recommendationFor(state) {
  switch (state) {
    case "inference_socket_restart_risk":
      return {
        code: "freeze_and_reconcile_inference_socket",
        requires_separate_approval: true,
        message:
          "Docker Inference 소켓을 삭제하거나 Docker Desktop을 재시작하지 말고, 별도 복구 승인 범위에서 경로와 로그를 먼저 대조하세요.",
      };
    case "recent_backend_crash":
      return {
        code: "collect_crash_evidence",
        requires_separate_approval: true,
        message: "최근 backend crash 증거를 보존하고 별도 Docker 복구 SDD에서 재시작 여부를 결정하세요.",
      };
    case "engine_unreachable":
      return {
        code: "verify_desktop_state",
        requires_separate_approval: true,
        message: "엔진 연결 실패 원인을 확인하세요. 이 진단기는 Docker Desktop 또는 컨테이너를 시작하지 않습니다.",
      };
    case "diagnostic_error":
      return {
        code: "preserve_diagnostic_error",
        requires_separate_approval: false,
        message: "필수 읽기 전용 증거를 확인하지 못했습니다. 오류 코드를 보존하고 경로와 도구 가용성을 점검하세요.",
      };
    default:
      return {
        code: "none",
        requires_separate_approval: false,
        message: "읽기 전용 검사에서 즉시 조치가 필요한 신호를 찾지 못했습니다.",
      };
  }
}

function inspectProcess(imageName) {
  const query = runReadOnly("tasklist.exe", ["/fi", `IMAGENAME eq ${imageName}`, "/fo", "csv", "/nh"]);
  return {
    status:
      query.status === 0 && query.stdout.toLowerCase().includes(imageName.toLowerCase())
        ? "running"
        : query.status === 0
          ? "not_running"
          : "unknown",
    query_exit_code: query.status,
    query_error_code: query.error_code,
  };
}

function inspectEngine() {
  const query = runReadOnly("docker.exe", ["version", "--format", "{{json .Server.Version}}"]);
  return {
    status: query.status === 0 && query.stdout ? "reachable" : "unreachable",
    query_exit_code: query.status,
    query_error_code: query.error_code,
  };
}

function inspectSocket(dockerRoot, socketPath) {
  if (!isInside(dockerRoot, socketPath)) {
    throw new Error("Inference socket path escaped the fixed Docker boundary.");
  }

  let listed = false;
  let listingError = null;
  try {
    listed = fs
      .readdirSync(path.dirname(socketPath), { withFileTypes: true })
      .some((entry) => entry.name.toLowerCase() === path.basename(socketPath).toLowerCase());
  } catch (error) {
    listingError = error?.code ?? "UNKNOWN";
  }

  if (!listed) {
    return {
      path: socketPath,
      listed: false,
      listing_error_code: listingError,
      reparse_query: "not_run",
      reparse_query_exit_code: null,
      reparse_query_error_code: null,
    };
  }

  const query = runReadOnly("fsutil.exe", ["reparsepoint", "query", socketPath]);
  const combined = `${query.stdout}\n${query.stderr}`;
  const unavailable = query.error_code === "ENOENT";
  const inaccessible =
    !unavailable &&
    (query.status !== 0 || /(?:error\s+1920|cannot be accessed|access is denied|액세스할 수)/i.test(combined));

  return {
    path: socketPath,
    listed: true,
    listing_error_code: listingError,
    reparse_query: unavailable ? "unavailable" : inaccessible ? "inaccessible" : "accessible",
    reparse_query_exit_code: query.status,
    reparse_query_error_code: query.error_code,
  };
}

function inspectLog(dockerRoot, logPath, { now, recentMinutes }) {
  if (!isInside(dockerRoot, logPath)) {
    throw new Error("Backend log path escaped the fixed Docker boundary.");
  }

  try {
    const tail = readTail(logPath);
    return {
      path: logPath,
      exists: true,
      read_error_code: null,
      bytes_read: tail.bytes_read,
      truncated: tail.truncated,
      modified_at: tail.modified_at,
      ...inspectBackendLog(tail.text, {
        now,
        modifiedAt: tail.modified_at,
        recentMinutes,
      }),
    };
  } catch (error) {
    return {
      path: logPath,
      exists: error?.code !== "ENOENT",
      read_error_code: error?.code ?? "UNKNOWN",
      bytes_read: 0,
      truncated: false,
      modified_at: null,
      inference_failure_count: 0,
      crash_signature_count: 0,
      latest_signature_at: null,
      signature_age_minutes: null,
      recent_signature: false,
    };
  }
}

function buildLiveReport({ recentMinutes }) {
  if (process.platform !== "win32") {
    return {
      schema_version: SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      mode: "live",
      state: "unsupported_platform",
      read_only: true,
      mutations_performed: [],
      checks: {},
      recommendation: {
        code: "run_on_windows",
        requires_separate_approval: false,
        message: "이 진단기는 Windows Docker Desktop 전용입니다.",
      },
    };
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData || !path.isAbsolute(localAppData)) {
    throw new Error("LOCALAPPDATA is missing or is not an absolute path.");
  }

  const dockerRoot = path.resolve(localAppData, "Docker");
  const backendLogPath = path.join(dockerRoot, "log", "host", "com.docker.backend.exe.log");
  const inferenceSocketPath = path.join(dockerRoot, "run", "dockerInference");
  const now = new Date();
  const engine = inspectEngine();
  const socket = inspectSocket(dockerRoot, inferenceSocketPath);
  const backendLog = inspectLog(dockerRoot, backendLogPath, { now, recentMinutes });
  const state = evaluateState({
    engineReachable: engine.status === "reachable",
    socket,
    log: backendLog,
  });

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: now.toISOString(),
    mode: "live",
    state,
    read_only: true,
    mutations_performed: [],
    boundaries: {
      local_app_data: path.resolve(localAppData),
      docker_root: dockerRoot,
    },
    checks: {
      docker_desktop_process: inspectProcess("Docker Desktop.exe"),
      backend_process: inspectProcess("com.docker.backend.exe"),
      engine,
      inference_socket: socket,
      backend_log: backendLog,
    },
    recommendation: recommendationFor(state),
  };
}

function loadFixture(name) {
  const fixtureDir = path.join(FIXTURE_ROOT, name);
  if (!isInside(FIXTURE_ROOT, fixtureDir)) throw new Error(`Invalid fixture: ${name}`);
  const scenario = JSON.parse(fs.readFileSync(path.join(fixtureDir, "scenario.json"), "utf8"));
  const logText = fs.readFileSync(path.join(fixtureDir, "backend.log.fixture"), "utf8");
  const now = new Date(scenario.now);
  const log = inspectBackendLog(logText, {
    now,
    modifiedAt: scenario.log_modified_at,
    recentMinutes: scenario.recent_minutes ?? DEFAULT_RECENT_MINUTES,
  });
  const state = evaluateState({
    engineReachable: scenario.engine_reachable,
    socket: scenario.socket,
    log,
  });
  return { name, expected: scenario.expected_state, actual: state, passed: state === scenario.expected_state };
}

function runSelfTest() {
  const cases = ["healthy", "engine-unreachable", "recent-backend-crash", "inference-socket-restart-risk"].map(
    loadFixture,
  );
  let mutationCommandRejected = false;
  try {
    assertReadOnlyCommand("docker.exe", ["restart", "fixture-container"]);
  } catch {
    mutationCommandRejected = true;
  }
  const passed = cases.every((item) => item.passed) && mutationCommandRejected;
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    mode: "self-test",
    read_only: true,
    mutations_performed: [],
    passed,
    command_contract: {
      mutation_command_rejected: mutationCommandRejected,
      allowed_operations: ["tasklist", "docker version", "fsutil reparsepoint query", "bounded file reads"],
    },
    cases,
  };
}

function parseArgs(args) {
  let selfTest = false;
  let recentMinutes = DEFAULT_RECENT_MINUTES;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--self-test") {
      selfTest = true;
      continue;
    }
    if (arg === "--recent-minutes") {
      const value = Number(args[index + 1]);
      if (!Number.isFinite(value) || value < 1 || value > 1_440) {
        throw new Error("--recent-minutes must be between 1 and 1440.");
      }
      recentMinutes = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { selfTest, recentMinutes };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const report = options.selfTest ? runSelfTest() : buildLiveReport(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = options.selfTest ? (report.passed ? 0 : 1) : (STATE_EXIT_CODES[report.state] ?? 1);
} catch (error) {
  const report = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    mode: process.argv.includes("--self-test") ? "self-test" : "live",
    state: "diagnostic_error",
    read_only: true,
    mutations_performed: [],
    error: {
      code: error?.code ?? "DIAGNOSTIC_ERROR",
      message: error instanceof Error ? error.message : String(error),
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = STATE_EXIT_CODES.diagnostic_error;
}
