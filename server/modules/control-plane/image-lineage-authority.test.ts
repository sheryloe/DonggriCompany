import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readRegisteredImageParentSha256 } from "./image-lineage-authority.ts";

const CANDIDATE_ID = "dongri-grigri-v1-beta.1";
const SOURCE_EPOCH = `sha256:${"a".repeat(64)}`;
const PROJECT_ID = "DonggriCompany";
const PARENT_SHA256 = "1".repeat(64);

describe("Image parent lineage ledger authority", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE control_plane_image_artifacts (
        candidate_id TEXT NOT NULL,
        source_epoch TEXT NOT NULL,
        project_id TEXT NOT NULL,
        artifact_id TEXT NOT NULL,
        derived_sha256 TEXT NOT NULL
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  function insert(input: {
    candidate_id?: string;
    source_epoch?: string;
    project_id?: string;
    artifact_id: string;
    derived_sha256?: string;
  }): void {
    db.prepare(
      `
        INSERT INTO control_plane_image_artifacts (
          candidate_id, source_epoch, project_id, artifact_id, derived_sha256
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).run(
      input.candidate_id ?? CANDIDATE_ID,
      input.source_epoch ?? SOURCE_EPOCH,
      input.project_id ?? PROJECT_ID,
      input.artifact_id,
      input.derived_sha256 ?? PARENT_SHA256,
    );
  }

  it("returns a derived parent only from the exact candidate, source epoch, and project scope", () => {
    insert({ artifact_id: "artifact-parent-valid" });

    expect(
      readRegisteredImageParentSha256(db, {
        candidate_id: CANDIDATE_ID,
        source_epoch: SOURCE_EPOCH,
        project_id: PROJECT_ID,
        parent_sha256: [PARENT_SHA256],
      }),
    ).toEqual([PARENT_SHA256]);
  });

  it.each([
    {
      label: "candidate",
      record: { candidate_id: "dongri-grigri-v1-beta.2" },
    },
    {
      label: "source epoch",
      record: { source_epoch: `sha256:${"b".repeat(64)}` },
    },
    {
      label: "project",
      record: { project_id: "BloggerGent" },
    },
  ])("does not resolve a parent stored under a different $label", ({ record }) => {
    insert({ artifact_id: "artifact-parent-cross-scope", ...record });

    expect(
      readRegisteredImageParentSha256(db, {
        candidate_id: CANDIDATE_ID,
        source_epoch: SOURCE_EPOCH,
        project_id: PROJECT_ID,
        parent_sha256: [PARENT_SHA256],
      }),
    ).toEqual([]);
  });

  it("returns no parent for an empty request without querying a broader scope", () => {
    insert({ artifact_id: "artifact-existing" });
    expect(
      readRegisteredImageParentSha256(db, {
        candidate_id: CANDIDATE_ID,
        source_epoch: SOURCE_EPOCH,
        project_id: PROJECT_ID,
        parent_sha256: [],
      }),
    ).toEqual([]);
  });
});
