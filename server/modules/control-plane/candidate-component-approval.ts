import path from "node:path";

import type { CandidateComponentProductionIdentity } from "./candidate-component-producer.ts";

const APPROVAL_ID_PATTERN = /^APR-V0?1-[A-Z0-9-]+$/;

function approvalSection(ledger: string, approvalId: string): string {
  if (!APPROVAL_ID_PATTERN.test(approvalId)) throw new Error("candidate_component_approval_id_invalid");
  const heading = `## ${approvalId}`;
  const start = ledger.indexOf(heading);
  if (start < 0) throw new Error("candidate_component_approval_not_found");
  const rest = ledger.slice(start + heading.length);
  const nextHeading = rest.search(/\r?\n##\s+/);
  return nextHeading < 0 ? ledger.slice(start) : ledger.slice(start, start + heading.length + nextHeading);
}

function field(section: string, name: string): string {
  const prefix = `- ${name}: `;
  const line = section.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  const raw = line?.slice(prefix.length).trim() ?? "";
  if (raw.length < 3 || !raw.startsWith("`") || !raw.endsWith("`")) {
    throw new Error(`candidate_component_approval_${name}_missing`);
  }
  return raw.slice(1, -1);
}

function normalized(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function validateCandidateComponentApproval(input: {
  ledger: string;
  approval_id: string;
  identity: CandidateComponentProductionIdentity;
  component: string;
  attempt_id: string;
  candidate_root: string;
  now: string;
}): void {
  const section = approvalSection(input.ledger, input.approval_id);
  if (field(section, "policy_decision") !== "approved") {
    throw new Error("candidate_component_approval_not_approved");
  }
  if (field(section, "operation_class") !== "candidate-component-report-generation") {
    throw new Error("candidate_component_approval_operation_class_mismatch");
  }
  if (field(section, "candidate_id") !== input.identity.candidate_id) {
    throw new Error("candidate_component_approval_candidate_mismatch");
  }
  if (field(section, "expected_git_sha") !== input.identity.git_sha) {
    throw new Error("candidate_component_approval_git_sha_mismatch");
  }
  if (field(section, "source_epoch") !== input.identity.source_epoch) {
    throw new Error("candidate_component_approval_source_epoch_mismatch");
  }
  if (field(section, "attempt_id") !== input.attempt_id) {
    throw new Error("candidate_component_approval_attempt_mismatch");
  }
  if (normalized(field(section, "candidate_root")) !== normalized(input.candidate_root)) {
    throw new Error("candidate_component_approval_root_mismatch");
  }
  const allowedComponents = field(section, "component_allowlist")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowedComponents.includes(input.component)) {
    throw new Error("candidate_component_approval_component_not_allowed");
  }
  const now = Date.parse(input.now);
  const expiresAt = Date.parse(field(section, "expires_at"));
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt) || now >= expiresAt) {
    throw new Error("candidate_component_approval_expired");
  }
}
