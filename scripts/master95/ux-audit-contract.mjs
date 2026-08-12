const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SOURCE_EPOCH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REQUIRED_JOURNEYS = ["project-agent", "task-progress", "approval", "failure-retry", "artifact-close"];
const REQUIRED_EVIDENCE_SOURCES = ["five_journey", "owner_discovery", "accessibility"];
const VALID_RECORD_STATUSES = new Set(["proven", "partial", "missing"]);
export const v01HistoricalUxAuditAuthority = Object.freeze({
  absolute_path:
    "G:\\Donggri_DevDrive\\storage\\codex-control\\reports\\DonggriCompany\\2026-07-15\\master95-granular-audit\\step18-19-audit.json",
  sha256: "620d4c180dfe1b45dfebd45382e8e110915518606d2508cd733b17e1130d6ee2",
  inheritance_policy: "verified-master95-only",
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function finiteNumber(value, field) {
  assert(typeof value === "number" && Number.isFinite(value), `${field}_invalid`);
  return value;
}

function nonNegativeInteger(value, field) {
  assert(Number.isInteger(value) && value >= 0, `${field}_invalid`);
  return value;
}

function normalizeSha(value, field, pattern) {
  assert(typeof value === "string" && pattern.test(value.toLowerCase()), `${field}_invalid`);
  return value.toLowerCase();
}

function nearestRankP95(values) {
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length === 0) return Number.POSITIVE_INFINITY;
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)];
}

function evaluateStages(audit) {
  assert(Array.isArray(audit.stages) && audit.stages.length === 2, "step18_and_step19_audits_required");
  const seenIds = new Set();
  return audit.stages.map((stage) => {
    assert(stage.step === 18 || stage.step === 19, `unexpected_audited_step:${stage.step}`);
    assert(stage.status === "proven" || stage.status === "partial", `invalid_stage_status:${stage.status}`);
    assert(Array.isArray(stage.criteria) && stage.criteria.length > 0, `step_${stage.step}_criteria_required`);
    assert(
      Array.isArray(stage.completion_gates) && stage.completion_gates.length > 0,
      `step_${stage.step}_gates_required`,
    );

    const records = [...stage.criteria, ...stage.completion_gates];
    for (const record of records) {
      assert(typeof record.id === "string" && record.id.startsWith(`S${stage.step}-`), "criterion_id_invalid");
      assert(!seenIds.has(record.id), `criterion_id_duplicate:${record.id}`);
      seenIds.add(record.id);
      assert(
        typeof record.requirement === "string" && record.requirement.trim().length > 0,
        `criterion_requirement_missing:${record.id}`,
      );
      assert(VALID_RECORD_STATUSES.has(record.status), `criterion_status_invalid:${record.id}`);
      assert(Array.isArray(record.evidence) && record.evidence.length > 0, `criterion_evidence_missing:${record.id}`);
    }

    const counts = Object.fromEntries(
      [...VALID_RECORD_STATUSES].map((status) => [status, records.filter((record) => record.status === status).length]),
    );
    const computedStatus = counts.partial === 0 && counts.missing === 0 ? "proven" : "partial";
    assert(stage.status === computedStatus, `step_${stage.step}_status_mismatch`);
    return {
      step: stage.step,
      status: stage.status,
      criteria: stage.criteria.length,
      completion_gates: stage.completion_gates.length,
      counts,
    };
  });
}

function evaluateFiveJourneys(measurement, blockers) {
  assert(measurement && typeof measurement === "object", "five_journey_measurement_required");
  const attemptCount = nonNegativeInteger(measurement.attempt_count, "five_journey_attempt_count");
  const successCount = nonNegativeInteger(measurement.success_count, "five_journey_success_count");
  assert(successCount <= attemptCount, "five_journey_success_count_exceeds_attempts");
  const successRate = finiteNumber(measurement.success_rate, "five_journey_success_rate");
  assert(
    Math.abs(successRate - (attemptCount === 0 ? 0 : successCount / attemptCount)) < 1e-12,
    "five_journey_rate_mismatch",
  );

  assert(measurement.per_journey && typeof measurement.per_journey === "object", "per_journey_measurement_required");
  for (const journeyId of REQUIRED_JOURNEYS) {
    const journey = measurement.per_journey[journeyId];
    assert(journey && typeof journey === "object", `journey_measurement_missing:${journeyId}`);
    const attempts = nonNegativeInteger(journey.attempts, `journey_attempts:${journeyId}`);
    const successes = nonNegativeInteger(journey.successes, `journey_successes:${journeyId}`);
    assert(successes <= attempts, `journey_successes_exceed_attempts:${journeyId}`);
    if (attempts < 4) blockers.add(`journey_attempt_floor:${journeyId}`);
    if (attempts === 0 || successes / attempts < 0.95) blockers.add(`journey_success_rate:${journeyId}`);
  }

  const receiptHashes = measurement.approval_receipt_sha256;
  assert(Array.isArray(receiptHashes), "five_journey_receipt_hashes_required");
  const normalizedReceipts = receiptHashes.map((hash) => normalizeSha(hash, "approval_receipt_sha256", SHA256_PATTERN));
  if (new Set(normalizedReceipts).size !== normalizedReceipts.length) {
    blockers.add("five_journey_receipt_hash_duplicate");
  }
  if (receiptHashes.length !== successCount) blockers.add("five_journey_receipt_hash_coverage");
  if (
    nonNegativeInteger(measurement.idempotency_replay_count, "five_journey_idempotency_replay_count") !== successCount
  ) {
    blockers.add("five_journey_idempotency_replay_coverage");
  }
  if (measurement.sqlite_restart_verified !== true) blockers.add("five_journey_sqlite_restart");

  assert(Array.isArray(measurement.journal_event_ranges), "five_journey_event_ranges_required");
  if (measurement.journal_event_ranges.length !== successCount) blockers.add("five_journey_event_range_coverage");
  let previousLast = 0;
  const rangeJourneyCounts = Object.fromEntries(REQUIRED_JOURNEYS.map((journeyId) => [journeyId, 0]));
  for (const [index, range] of measurement.journal_event_ranges.entries()) {
    assert(range && typeof range === "object", "five_journey_event_range_invalid");
    const first = nonNegativeInteger(range.first_sequence, "five_journey_first_sequence");
    const last = nonNegativeInteger(range.last_sequence, "five_journey_last_sequence");
    assert(first > previousLast && last >= first, "five_journey_event_range_invalid");
    assert(REQUIRED_JOURNEYS.includes(range.journey_id), "five_journey_event_range_journey_invalid");
    const receipt = normalizeSha(range.approval_receipt_sha256, "event_range_receipt_sha256", SHA256_PATTERN);
    assert(receipt === normalizedReceipts[index], "five_journey_event_range_receipt_order_mismatch");
    rangeJourneyCounts[range.journey_id] += 1;
    previousLast = last;
  }
  for (const journeyId of REQUIRED_JOURNEYS) {
    if (rangeJourneyCounts[journeyId] !== measurement.per_journey[journeyId].successes) {
      blockers.add(`five_journey_event_range_journey_coverage:${journeyId}`);
    }
  }
  const journalEventCount = nonNegativeInteger(measurement.journal_event_count, "five_journey_journal_event_count");
  assert(journalEventCount >= previousLast, "five_journey_journal_event_count_mismatch");
  normalizeSha(measurement.journal_sha256, "five_journey_journal_sha256", SHA256_PATTERN);
  normalizeSha(measurement.checkpoint_sha256, "five_journey_checkpoint_sha256", SHA256_PATTERN);
  normalizeSha(measurement.mutation_db_sha256, "five_journey_mutation_db_sha256", SHA256_PATTERN);
  normalizeSha(measurement.last_event_hash, "five_journey_last_event_hash", SHA256_PATTERN);

  if (attemptCount < 20) blockers.add("five_journey_attempt_floor");
  if (successRate < 0.95) blockers.add("five_journey_overall_success_rate");
  if (nonNegativeInteger(measurement.external_effect_count, "five_journey_external_effect_count") !== 0) {
    blockers.add("five_journey_external_effect");
  }
  if (nonNegativeInteger(measurement.cross_project_leak_count, "five_journey_cross_project_leak_count") !== 0) {
    blockers.add("five_journey_cross_project_leak");
  }
}

function evaluateOwnerDiscovery(measurement, blockers) {
  assert(measurement && typeof measurement === "object", "owner_discovery_measurement_required");
  assert(measurement.mode === "human_timed_study", "owner_discovery_human_study_required");
  const participantCount = nonNegativeInteger(measurement.participant_count, "owner_discovery_participant_count");
  const durations = measurement.durations_seconds;
  assert(Array.isArray(durations), "owner_discovery_durations_required");
  for (const duration of durations) {
    assert(finiteNumber(duration, "owner_discovery_duration") >= 0, "owner_discovery_duration_invalid");
  }
  const reportedP95 = finiteNumber(measurement.p95_seconds, "owner_discovery_p95_seconds");
  const computedP95 = nearestRankP95(durations);
  assert(Math.abs(reportedP95 - computedP95) < 1e-9, "owner_discovery_p95_mismatch");
  const totalSessionCount = nonNegativeInteger(measurement.total_session_count, "owner_discovery_total_session_count");
  const correctSessionCount = nonNegativeInteger(
    measurement.correct_session_count,
    "owner_discovery_correct_session_count",
  );
  const failedSessionCount = nonNegativeInteger(
    measurement.failed_session_count,
    "owner_discovery_failed_session_count",
  );
  const accuracyRate = finiteNumber(measurement.accuracy_rate, "owner_discovery_accuracy_rate");
  assert(totalSessionCount === durations.length, "owner_discovery_total_session_count_mismatch");
  assert(correctSessionCount + failedSessionCount === totalSessionCount, "owner_discovery_accuracy_count_mismatch");
  assert(
    Math.abs(accuracyRate - (totalSessionCount === 0 ? 0 : correctSessionCount / totalSessionCount)) < 1e-12,
    "owner_discovery_accuracy_rate_mismatch",
  );
  assert(measurement.personal_data_included === false, "owner_discovery_personal_data_forbidden");
  assert(Array.isArray(measurement.participant_sessions), "owner_discovery_participant_sessions_required");
  assert(measurement.participant_sessions.length === participantCount, "owner_discovery_participant_count_mismatch");
  const participantHashes = new Set();
  let participantSessionTotal = 0;
  for (const participant of measurement.participant_sessions) {
    assert(participant && typeof participant === "object", "owner_discovery_participant_invalid");
    const participantHash = normalizeSha(
      participant.participant_sha256,
      "owner_discovery_participant_sha256",
      SHA256_PATTERN,
    );
    assert(!participantHashes.has(participantHash), "owner_discovery_participant_duplicate");
    participantHashes.add(participantHash);
    participantSessionTotal += nonNegativeInteger(
      participant.session_count,
      "owner_discovery_participant_session_count",
    );
  }
  assert(participantSessionTotal === durations.length, "owner_discovery_participant_session_total_mismatch");
  if (participantCount < 2) blockers.add("owner_discovery_participant_floor");
  if (durations.length < 5) blockers.add("owner_discovery_session_floor");
  if (nonNegativeInteger(measurement.coached_session_count, "owner_discovery_coached_session_count") !== 0) {
    blockers.add("owner_discovery_coached_session");
  }
  if (reportedP95 > 10) blockers.add("owner_discovery_p95");
  if (failedSessionCount !== 0 || accuracyRate !== 1) blockers.add("owner_discovery_accuracy");
}

function evaluateAccessibility(measurement, blockers) {
  assert(measurement && typeof measurement === "object", "accessibility_measurement_required");
  const dark = finiteNumber(measurement.contrast_minimum_dark, "contrast_minimum_dark");
  const light = finiteNumber(measurement.contrast_minimum_light, "contrast_minimum_light");
  if (dark < 4.5) blockers.add("accessibility_dark_contrast");
  if (light < 4.5) blockers.add("accessibility_light_contrast");
  if (measurement.keyboard_visible_focus !== "pass") blockers.add("accessibility_keyboard_visible_focus");
  if (nonNegativeInteger(measurement.focus_trap_count, "accessibility_focus_trap_count") !== 0) {
    blockers.add("accessibility_focus_trap");
  }
  if (measurement.focus_cycle_complete !== "pass") blockers.add("accessibility_focus_cycle");
  if (measurement.browser_zoom_200_reflow !== "pass") blockers.add("accessibility_browser_zoom_200_reflow");
  if (finiteNumber(measurement.mobile_390x844_overflow_px, "mobile_390x844_overflow_px") > 0) {
    blockers.add("accessibility_mobile_overflow");
  }
  if (measurement.screen_reader !== "pass") blockers.add("accessibility_screen_reader");
  assert(Array.isArray(measurement.critical_findings), "accessibility_critical_findings_required");
  if (measurement.critical_findings.length > 0) blockers.add("accessibility_critical_findings");
}

function evaluateEvidenceSources(evidenceSources) {
  assert(evidenceSources && typeof evidenceSources === "object", "ux_evidence_sources_required");
  const blockers = [];
  for (const sourceName of REQUIRED_EVIDENCE_SOURCES) {
    const source = evidenceSources[sourceName];
    assert(source && typeof source === "object", `ux_evidence_source_missing:${sourceName}`);
    assert(
      typeof source.absolute_path === "string" && /^[A-Za-z]:[\\/]/.test(source.absolute_path),
      `ux_evidence_source_path_invalid:${sourceName}`,
    );
    normalizeSha(source.sha256, `ux_evidence_source_sha256:${sourceName}`, SHA256_PATTERN);
    assert(
      source.component_status === "collecting" ||
        source.component_status === "pass" ||
        source.component_status === "fail",
      `ux_evidence_source_status_invalid:${sourceName}`,
    );
    if (source.component_status !== "pass") blockers.push(`ux_evidence_source_not_pass:${sourceName}`);
  }
  return blockers;
}

function evaluateHistoricalAuthority(authority) {
  assert(authority && typeof authority === "object", "historical_audit_authority_required");
  const normalizedPath = String(authority.absolute_path ?? "")
    .replaceAll("/", "\\")
    .toLowerCase();
  assert(
    normalizedPath === v01HistoricalUxAuditAuthority.absolute_path.toLowerCase(),
    "historical_audit_authority_path_mismatch",
  );
  assert(
    normalizeSha(authority.sha256, "historical_audit_authority_sha256", SHA256_PATTERN) ===
      v01HistoricalUxAuditAuthority.sha256,
    "historical_audit_authority_sha256_mismatch",
  );
  assert(
    authority.inheritance_policy === v01HistoricalUxAuditAuthority.inheritance_policy,
    "historical_audit_inheritance_policy_mismatch",
  );
}

export function evaluateUxMeasurements(measurements) {
  assert(measurements && typeof measurements === "object", "ux_measurements_required");
  const grouped = {
    five_journey: new Set(),
    owner_discovery: new Set(),
    accessibility: new Set(),
  };
  evaluateFiveJourneys(measurements.five_journey, grouped.five_journey);
  evaluateOwnerDiscovery(measurements.owner_discovery, grouped.owner_discovery);
  evaluateAccessibility(measurements.accessibility, grouped.accessibility);
  return {
    five_journey: [...grouped.five_journey].sort(),
    owner_discovery: [...grouped.owner_discovery].sort(),
    accessibility: [...grouped.accessibility].sort(),
    blockers: [...new Set(Object.values(grouped).flatMap((blockers) => [...blockers]))].sort(),
  };
}

function evaluateCandidateAudit(audit, options, stages) {
  assert(
    audit.component_status === "collecting" || audit.component_status === "pass" || audit.component_status === "fail",
    "component_status_invalid",
  );
  assert(audit.certification_claimed === false, "component_certification_claim_forbidden");
  assert(audit.release_label === "V01", "release_label_mismatch");
  assert(audit.candidate_binding && typeof audit.candidate_binding === "object", "candidate_binding_required");
  evaluateHistoricalAuthority(audit.historical_authority);

  const candidateId = String(audit.candidate_binding.candidate_id ?? "");
  assert(/^dongri-grigri-v01(?:[-.][a-z0-9]+)*$/i.test(candidateId), "candidate_id_invalid");
  const candidateSha = normalizeSha(audit.candidate_binding.candidate_sha, "candidate_sha", GIT_SHA_PATTERN);
  const sourceEpoch = String(audit.candidate_binding.source_epoch ?? "").toLowerCase();
  assert(SOURCE_EPOCH_PATTERN.test(sourceEpoch), "source_epoch_invalid");
  assert(!Number.isNaN(new Date(audit.candidate_binding.generated_at).valueOf()), "candidate_generated_at_invalid");

  if (options.expectedCandidateId) assert(candidateId === options.expectedCandidateId, "candidate_id_mismatch");
  if (options.expectedCandidateSha) {
    assert(candidateSha === options.expectedCandidateSha.toLowerCase(), "candidate_sha_mismatch");
  }
  if (options.expectedSourceEpoch) {
    assert(sourceEpoch === options.expectedSourceEpoch.toLowerCase(), "source_epoch_mismatch");
  }

  const evidenceSourceBlockers = evaluateEvidenceSources(audit.evidence_sources);
  const measurementEvaluation = evaluateUxMeasurements(audit.measurements);
  const blockers = new Set([...measurementEvaluation.blockers, ...evidenceSourceBlockers]);
  if (!stages.every((stage) => stage.status === "proven")) blockers.add("granular_stage_not_proven");

  const certificationReady = blockers.size === 0;
  assert(
    audit.component_status ===
      (certificationReady ? "pass" : audit.component_status === "fail" ? "fail" : "collecting"),
    "component_status_measurement_mismatch",
  );
  return {
    candidate_bound: true,
    candidate_id: candidateId,
    candidate_sha: candidateSha,
    source_epoch: sourceEpoch,
    component_status: audit.component_status,
    certification_ready: certificationReady,
    blockers: [...blockers].sort(),
    measurement_blockers: measurementEvaluation,
  };
}

export function evaluateUxAudit(audit, options = {}) {
  assert(audit && typeof audit === "object", "ux_audit_object_required");
  const stages = evaluateStages(audit);

  if (audit.schema_version === "master95_granular_completion_audit_v1") {
    if (options.requireCandidateBound) throw new Error("candidate_bound_audit_required");
    return {
      schema_version: audit.schema_version,
      candidate_bound: false,
      structurally_valid: true,
      certification_ready: false,
      blockers: ["legacy_audit_not_candidate_bound"],
      stages,
    };
  }

  assert(audit.schema_version === "master95_granular_completion_audit_v2", "unexpected_audit_schema");
  const candidate = evaluateCandidateAudit(audit, options, stages);
  return {
    schema_version: audit.schema_version,
    structurally_valid: true,
    stages,
    ...candidate,
  };
}

export const uxAuditContract = Object.freeze({
  required_journeys: [...REQUIRED_JOURNEYS],
  minimum_total_attempts: 20,
  minimum_attempts_per_journey: 4,
  minimum_success_rate: 0.95,
  minimum_owner_participants: 2,
  minimum_owner_sessions: 5,
  maximum_owner_p95_seconds: 10,
  minimum_normal_text_contrast: 4.5,
});
