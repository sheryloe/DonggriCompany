import assert from "node:assert/strict";
import test from "node:test";
import { runSelfTests } from "./generate-final-evidence-pack.mjs";

const result = runSelfTests();

test("V1 evidence pipeline enforces staged 15-to-16 item certification boundaries", () => {
  assert.equal(result.ok, true);
  assert.equal(result.assessment_original_count, 15);
  assert.equal(result.final_original_count, 16);
  assert.equal(result.tamper_expectation_derived_by_inversion, true);
  assert.equal(result.advisory_model_counted_as_assessor, false);
  assert.equal(result.missing_elapsed_prerequisites_failed_closed, true);
  assert.equal(result.historical_111_runs_credited, false);
  assert.equal(result.synthetic_evidence_distinguished, true);
  assert.equal(result.absolute_evidence_escape_rejected, true);
  assert.equal(result.certification_decision_generated, false);
});

test("accepts two distinct registered assessors with valid Ed25519 signatures over one bundle", () => {
  assert.equal(result.valid_two_assessor_case_passed, true);
  assert.equal(result.registry_digest_bound_to_bundle, true);
  assert.equal(result.external_trust_root_bound_to_bundle, true);
});

test("requires an external absolute trust-root record bound to APR-V1-ASSESS-001", () => {
  assert.equal(result.external_trust_root_required, true);
  assert.equal(result.relative_trust_root_rejected, true);
});

test("rejects repo-local registry and sidecar replacement against the external trust root", () => {
  assert.equal(result.repo_registry_sidecar_self_trust_rejected, true);
});

test("rejects an assessor registry that is not approved or whose consistency digest was changed", () => {
  assert.equal(result.unapproved_registry_rejected, true);
  assert.equal(result.registry_digest_tamper_rejected, true);
});

test("rejects an assessor that is absent from the immutable approved registry", () => {
  assert.equal(result.unknown_assessor_rejected, true);
});

test("rejects duplicate assessor identities even when both signatures are valid", () => {
  assert.equal(result.duplicate_assessor_rejected, true);
});

test("rejects an invalid assessor envelope signature", () => {
  assert.equal(result.invalid_signature_rejected, true);
});

test("rejects an assessor envelope for a different assessment-ready bundle", () => {
  assert.equal(result.mismatched_bundle_rejected, true);
});
