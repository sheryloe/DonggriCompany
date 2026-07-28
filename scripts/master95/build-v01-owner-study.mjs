import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertV01NewReportPath, verifyV01EvidenceArtifact } from "./v01-evidence-file.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_KEYS = [
  "coached",
  "completed_at",
  "expected_owner",
  "identified_owner",
  "observation_artifact",
  "participant_sha256",
  "session_id",
  "started_at",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, message) {
  assert(value && typeof value === "object" && !Array.isArray(value), message);
  const actual = Object.keys(value).sort();
  const normalizedExpected = [...expected].sort();
  assert(
    actual.length === normalizedExpected.length && actual.every((key, index) => key === normalizedExpected[index]),
    message,
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function nearestRankP95(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

function bindingFromRepo() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const candidateSha = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  })
    .trim()
    .toLowerCase();
  const binding = {
    candidate_id: String(pkg.donggriRelease?.candidateId ?? ""),
    candidate_sha: candidateSha,
    source_epoch: String(pkg.donggriRelease?.sourceEpoch ?? "").toLowerCase(),
  };
  assert(/^dongri-grigri-v01(?:[-.][a-z0-9]+)*$/i.test(binding.candidate_id), "owner_candidate_id_invalid");
  assert(/^[0-9a-f]{40}$/.test(binding.candidate_sha), "owner_candidate_sha_invalid");
  assert(/^sha256:[0-9a-f]{64}$/.test(binding.source_epoch), "owner_source_epoch_invalid");
  return binding;
}

function requireCleanCandidate() {
  const status = execFileSync("git", ["-C", repoRoot, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  assert(status.length === 0, "owner_study_candidate_worktree_dirty");
}

function validateBinding(log, binding) {
  for (const field of ["candidate_id", "candidate_sha", "source_epoch"]) {
    assert(log[field] === binding[field], `owner_study_binding_mismatch:${field}`);
  }
}

function sessionMeasurement(session) {
  exactKeys(session, SESSION_KEYS, "owner_study_session_keys_invalid");
  assert(
    typeof session.session_id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(session.session_id),
    "owner_study_session_id_invalid",
  );
  assert(
    typeof session.participant_sha256 === "string" && SHA256_PATTERN.test(session.participant_sha256),
    "owner_study_participant_sha256_invalid",
  );
  assert(session.coached === false, "owner_study_coached_session_forbidden");
  assert(
    typeof session.expected_owner === "string" && session.expected_owner.trim().length > 0,
    "owner_study_expected_owner_invalid",
  );
  assert(
    typeof session.identified_owner === "string" && session.identified_owner.trim().length > 0,
    "owner_study_identified_owner_invalid",
  );
  exactKeys(session.observation_artifact, ["absolute_path", "sha256"], "owner_study_observation_artifact_invalid");
  assert(
    typeof session.observation_artifact.absolute_path === "string" &&
      /^[A-Za-z]:[\\/]/.test(session.observation_artifact.absolute_path),
    "owner_study_observation_path_invalid",
  );
  assert(
    typeof session.observation_artifact.sha256 === "string" && SHA256_PATTERN.test(session.observation_artifact.sha256),
    "owner_study_observation_sha256_invalid",
  );
  const started = Date.parse(session.started_at);
  const completed = Date.parse(session.completed_at);
  assert(Number.isFinite(started) && Number.isFinite(completed) && completed >= started, "owner_study_time_invalid");
  const durationSeconds = (completed - started) / 1_000;
  assert(durationSeconds <= 300, "owner_study_session_duration_unbounded");
  return {
    session_id: session.session_id,
    participant_sha256: session.participant_sha256,
    duration_seconds: durationSeconds,
    owner_correct: session.identified_owner.trim() === session.expected_owner.trim(),
    coached: false,
    observation_artifact: session.observation_artifact,
  };
}

export function buildV01OwnerStudy(log, binding, generatedAt, sourceSessionLogSha256 = null) {
  exactKeys(
    log,
    [
      "candidate_id",
      "candidate_sha",
      "certification_claimed",
      "release_label",
      "schema_version",
      "sessions",
      "source_epoch",
      "study_protocol",
    ],
    "owner_study_top_level_keys_invalid",
  );
  assert(log?.schema_version === "donggri-v01-owner-study-session-log/v1", "owner_study_schema_invalid");
  assert(log.release_label === "V01", "owner_study_release_label_mismatch");
  assert(log.certification_claimed === false, "owner_study_certification_claim_forbidden");
  validateBinding(log, binding);
  exactKeys(
    log.study_protocol,
    ["coaching_allowed", "project_id", "task_prompt_sha256"],
    "owner_study_protocol_invalid",
  );
  assert(log.study_protocol.coaching_allowed === false, "owner_study_coaching_forbidden");
  assert(
    typeof log.study_protocol.project_id === "string" && log.study_protocol.project_id.trim().length > 0,
    "owner_study_project_id_invalid",
  );
  assert(
    typeof log.study_protocol.task_prompt_sha256 === "string" &&
      SHA256_PATTERN.test(log.study_protocol.task_prompt_sha256),
    "owner_study_prompt_sha256_invalid",
  );
  assert(Array.isArray(log.sessions), "owner_study_sessions_required");
  const sessions = log.sessions.map(sessionMeasurement);
  const sessionIds = sessions.map((session) => session.session_id);
  assert(new Set(sessionIds).size === sessionIds.length, "owner_study_session_id_duplicate");
  const participants = new Map();
  for (const session of sessions) {
    participants.set(session.participant_sha256, (participants.get(session.participant_sha256) ?? 0) + 1);
  }
  const durations = sessions.map((session) => session.duration_seconds);
  const correctSessions = sessions.filter((session) => session.owner_correct).length;
  const p95 = nearestRankP95(durations);
  const pass = participants.size >= 2 && sessions.length >= 5 && correctSessions === sessions.length && p95 <= 10;
  return {
    schema_version: "donggri-v01-owner-discovery-evidence/v1",
    release_label: "V01",
    component_status: pass ? "pass" : "fail",
    certification_claimed: false,
    ...binding,
    generated_at: generatedAt,
    source_session_log: {
      sha256: sourceSessionLogSha256 ?? sha256(Buffer.from(canonicalJson(log), "utf8")),
      study_protocol: log.study_protocol,
    },
    measurement: {
      mode: "human_timed_study",
      participant_count: participants.size,
      total_session_count: sessions.length,
      correct_session_count: correctSessions,
      failed_session_count: sessions.length - correctSessions,
      accuracy_rate: sessions.length === 0 ? 0 : correctSessions / sessions.length,
      durations_seconds: durations,
      p95_seconds: p95,
      coached_session_count: sessions.filter((session) => session.coached).length,
      personal_data_included: false,
      participant_sessions: [...participants.entries()]
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([participantSha256, sessionCount]) => ({
          participant_sha256: participantSha256,
          session_count: sessionCount,
        })),
    },
    session_results: sessions,
  };
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (!value || value.startsWith("--")) throw new Error(`${flag.slice(2)}_value_required`);
  return value;
}

function main() {
  const rawInput = argumentValue("--input");
  assert(path.isAbsolute(rawInput), "owner_study_input_must_be_absolute");
  const input = path.resolve(rawInput);
  const output = assertV01NewReportPath(argumentValue("--output"), "owner_study_output");
  assert(!fs.existsSync(output) && !fs.existsSync(`${output}.sha256`), "owner_study_output_already_exists");
  requireCleanCandidate();
  const inputBytes = fs.readFileSync(input);
  const log = JSON.parse(inputBytes.toString("utf8"));
  const binding = bindingFromRepo();
  const generatedAt = new Date().toISOString();
  const report = buildV01OwnerStudy(log, binding, generatedAt, sha256(inputBytes));
  for (const session of report.session_results) {
    verifyV01EvidenceArtifact(session.observation_artifact, `owner_study_session:${session.session_id}`);
  }
  const serialized = canonicalJson(report);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, serialized, { encoding: "utf8", flag: "wx" });
  fs.writeFileSync(`${output}.sha256`, `${sha256(serialized)}  ${path.basename(output)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: report.component_status === "pass",
      component_status: report.component_status,
      participant_count: report.measurement.participant_count,
      session_count: report.measurement.durations_seconds.length,
      p95_seconds: report.measurement.p95_seconds,
      output,
      report_sha256: sha256(serialized),
    })}\n`,
  );
  if (report.component_status !== "pass") process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  }
}
