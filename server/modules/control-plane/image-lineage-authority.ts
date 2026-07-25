import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

type ImageParentLineageDb = Pick<DatabaseSync, "prepare">;

export type ImageParentLineageScope = {
  candidate_id: string;
  source_epoch: string;
  project_id: string;
  parent_sha256: readonly string[];
};

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_EPOCH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;

function assertScope(input: ImageParentLineageScope): void {
  if (!SAFE_ID_PATTERN.test(input.candidate_id)) {
    throw new Error("image_parent_candidate_id_invalid");
  }
  if (!SOURCE_EPOCH_PATTERN.test(input.source_epoch)) {
    throw new Error("image_parent_source_epoch_invalid");
  }
  if (!SAFE_ID_PATTERN.test(input.project_id)) {
    throw new Error("image_parent_project_id_invalid");
  }
  if (
    !Array.isArray(input.parent_sha256) ||
    input.parent_sha256.length > 64 ||
    !input.parent_sha256.every((value) => SHA256_PATTERN.test(value))
  ) {
    throw new Error("image_parent_sha256_invalid");
  }
  if (new Set(input.parent_sha256).size !== input.parent_sha256.length) {
    throw new Error("image_parent_sha256_duplicate");
  }
}

/**
 * Resolves only derived artifact hashes from the exact immutable candidate,
 * source epoch, and canonical active project ledger scope. SQL values are
 * parameterized and the caller receives requested hashes in request order.
 */
export function readRegisteredImageParentSha256(db: ImageParentLineageDb, input: ImageParentLineageScope): string[] {
  assertScope(input);
  if (input.parent_sha256.length === 0) return [];

  const placeholders = input.parent_sha256.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT DISTINCT derived_sha256
        FROM control_plane_image_artifacts
        WHERE candidate_id = ?
          AND source_epoch = ?
          AND project_id = ?
          AND derived_sha256 IN (${placeholders})
      `,
    )
    .all(input.candidate_id, input.source_epoch, input.project_id, ...input.parent_sha256) as Array<
    Record<string, SQLOutputValue>
  >;
  const registered = new Set(
    rows.map((row) => {
      const value = row.derived_sha256;
      if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
        throw new Error("image_parent_ledger_row_corrupt");
      }
      return value;
    }),
  );
  return input.parent_sha256.filter((parentSha256) => registered.has(parentSha256));
}
