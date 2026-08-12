import { z } from "zod";

const NonEmpty = z.string().trim().min(1);
const ArtifactId = NonEmpty;
const ProjectId = z.string().regex(/^project:[A-Za-z0-9._-]+$/);
const TaskId = z.string().regex(/^task:[A-Za-z0-9._:-]+$/);
const RunId = z.string().regex(/^run:[A-Za-z0-9._:-]+$/);
const TraceId = z.string().regex(/^trace:[A-Za-z0-9._:-]+$/);
const Timestamp = z.string().datetime();

export const Master95ImageArtifactSchema = z
  .object({
    artifact_id: ArtifactId,
    project_id: ProjectId,
    task_id: TaskId,
    run_id: RunId,
    trace_id: TraceId,
    created_by_agent_id: NonEmpty,
    skill_id: NonEmpty,
    skill_version: NonEmpty,
    model: NonEmpty,
    prompt_version: NonEmpty,
    operation: z.enum([
      "input",
      "generate",
      "edit",
      "background_remove",
      "resize",
      "format_convert",
      "analyze",
      "restore",
    ]),
    version: z.number().int().positive(),
    parent_artifact_id: ArtifactId.nullable(),
    source_artifact_ids: z.array(ArtifactId),
    source_uri: NonEmpty,
    output_uri: NonEmpty,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mime_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    rights_source: NonEmpty,
    created_at: Timestamp,
    modified_at: Timestamp,
    processing_status: z.enum(["complete", "partial", "failed"]),
    failure_reason: NonEmpty.nullable(),
    analysis_summary: NonEmpty.nullable(),
    approval_status: z.enum(["draft", "pending", "approved", "rejected", "discarded", "quarantined"]),
    exported_at: Timestamp.nullable(),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (artifact.version > 1 && !artifact.parent_artifact_id) {
      context.addIssue({ code: "custom", path: ["parent_artifact_id"], message: "version_parent_required" });
    }
    if (artifact.exported_at && artifact.approval_status !== "approved") {
      context.addIssue({ code: "custom", path: ["exported_at"], message: "unapproved_export_forbidden" });
    }
    if (Date.parse(artifact.modified_at) < Date.parse(artifact.created_at)) {
      context.addIssue({ code: "custom", path: ["modified_at"], message: "modified_before_created" });
    }
    if (artifact.exported_at && Date.parse(artifact.exported_at) < Date.parse(artifact.created_at)) {
      context.addIssue({ code: "custom", path: ["exported_at"], message: "exported_before_created" });
    }
    if (artifact.processing_status !== "complete" && !artifact.failure_reason) {
      context.addIssue({ code: "custom", path: ["failure_reason"], message: "failure_reason_required" });
    }
    if (artifact.processing_status === "complete" && artifact.failure_reason) {
      context.addIssue({ code: "custom", path: ["failure_reason"], message: "complete_artifact_has_failure" });
    }
  });

export const Master95ImageHandoffSchema = z
  .object({
    handoff_id: NonEmpty,
    artifact_id: ArtifactId,
    project_id: ProjectId,
    task_id: TaskId,
    run_id: RunId,
    trace_id: TraceId,
    from_agent_id: NonEmpty,
    to_agent_id: NonEmpty,
    occurred_at: Timestamp,
  })
  .strict();

export const Master95ImageHandoffReceiptSchema = z
  .object({
    handoff_id: NonEmpty,
    artifact_id: ArtifactId,
    project_id: ProjectId,
    receiver_agent_id: NonEmpty,
    receiver_agent_version: NonEmpty,
    trace_id: TraceId,
    accepted_at: Timestamp,
  })
  .strict();

export type Master95ImageArtifact = z.infer<typeof Master95ImageArtifactSchema>;
export type Master95ImageHandoff = z.infer<typeof Master95ImageHandoffSchema>;
export type Master95ImageHandoffReceipt = z.infer<typeof Master95ImageHandoffReceiptSchema>;

export class Master95ImageWorkbench {
  readonly #artifacts = new Map<string, Readonly<Master95ImageArtifact>>();
  readonly #handoffs = new Map<string, Readonly<Master95ImageHandoff>>();
  readonly #handoffReceipts = new Map<string, Readonly<Master95ImageHandoffReceipt>>();

  register(input: unknown) {
    const artifact = Master95ImageArtifactSchema.parse(input);
    if (this.#artifacts.has(artifact.artifact_id)) throw new Error("artifact_id_already_registered");
    if (artifact.parent_artifact_id) {
      const parent = this.#artifacts.get(artifact.parent_artifact_id);
      if (!parent) throw new Error("parent_artifact_not_found");
      if (parent.project_id !== artifact.project_id) throw new Error("cross_project_parent_denied");
      if (artifact.version !== parent.version + 1) throw new Error("artifact_version_sequence_invalid");
    }
    for (const sourceId of artifact.source_artifact_ids) {
      const source = this.#artifacts.get(sourceId);
      if (!source) throw new Error("source_artifact_not_found");
      if (source.project_id !== artifact.project_id) throw new Error("cross_project_source_denied");
    }
    const frozen = deepFreeze(structuredClone(artifact));
    this.#artifacts.set(artifact.artifact_id, frozen);
    return frozen;
  }

  submit(artifactId: string, modifiedAt?: string) {
    const artifact = this.#require(artifactId);
    if (artifact.approval_status !== "draft") throw new Error("artifact_not_draft");
    return this.#replace({ ...artifact, approval_status: "pending", modified_at: modifiedAt ?? artifact.modified_at });
  }

  decide(input: {
    artifact_id: string;
    actor: "CONTROL" | "REVIEW" | "IMPLEMENT";
    decision: "approved" | "rejected" | "discarded";
    modified_at?: string;
  }) {
    const artifact = this.#require(input.artifact_id);
    if (input.actor !== "CONTROL") throw new Error("artifact_approval_control_only");
    if (artifact.approval_status !== "pending") throw new Error("artifact_not_pending");
    return this.#replace({
      ...artifact,
      approval_status: input.decision,
      modified_at: input.modified_at ?? artifact.modified_at,
    });
  }

  recordPartialFailure(input: { artifact_id: string; failure_reason: string; modified_at: string }) {
    const artifact = this.#require(input.artifact_id);
    if (artifact.exported_at) throw new Error("exported_artifact_is_immutable");
    return this.#replace({
      ...artifact,
      processing_status: "partial",
      failure_reason: input.failure_reason,
      modified_at: input.modified_at,
    });
  }

  restore(input: {
    artifact_id: string;
    parent_artifact_id?: string;
    new_artifact_id: string;
    task_id: string;
    run_id: string;
    trace_id: string;
    actor_agent_id: string;
    created_at: string;
  }) {
    const source = this.#require(input.artifact_id);
    const parent = this.#require(input.parent_artifact_id ?? input.artifact_id);
    if (parent.project_id !== source.project_id) throw new Error("cross_project_parent_denied");
    if (source.approval_status === "discarded" || source.approval_status === "quarantined") {
      throw new Error("artifact_restore_source_unavailable");
    }
    return this.register({
      ...source,
      artifact_id: input.new_artifact_id,
      task_id: input.task_id,
      run_id: input.run_id,
      trace_id: input.trace_id,
      created_by_agent_id: input.actor_agent_id,
      operation: "restore",
      version: parent.version + 1,
      parent_artifact_id: parent.artifact_id,
      source_artifact_ids: [source.artifact_id],
      created_at: input.created_at,
      modified_at: input.created_at,
      processing_status: "complete",
      failure_reason: null,
      approval_status: "draft",
      exported_at: null,
    });
  }

  handoff(input: unknown) {
    const handoff = Master95ImageHandoffSchema.parse(input);
    if (this.#handoffs.has(handoff.handoff_id)) throw new Error("handoff_id_already_registered");
    const artifact = this.#require(handoff.artifact_id);
    if (artifact.project_id !== handoff.project_id) throw new Error("cross_project_handoff_denied");
    if (artifact.approval_status !== "approved") throw new Error("artifact_handoff_approval_required");
    if (artifact.task_id !== handoff.task_id || artifact.run_id !== handoff.run_id) {
      throw new Error("artifact_handoff_task_run_mismatch");
    }
    const frozen = deepFreeze(structuredClone(handoff));
    this.#handoffs.set(handoff.handoff_id, frozen);
    return frozen;
  }

  acceptHandoff(input: unknown) {
    const receipt = Master95ImageHandoffReceiptSchema.parse(input);
    if (this.#handoffReceipts.has(receipt.handoff_id)) throw new Error("handoff_already_accepted");
    const handoff = this.#handoffs.get(receipt.handoff_id);
    if (!handoff) throw new Error("handoff_not_found");
    if (handoff.project_id !== receipt.project_id) throw new Error("cross_project_handoff_acceptance_denied");
    if (handoff.artifact_id !== receipt.artifact_id) throw new Error("handoff_artifact_mismatch");
    if (handoff.to_agent_id !== receipt.receiver_agent_id) throw new Error("handoff_receiver_mismatch");
    const frozen = deepFreeze(structuredClone(receipt));
    this.#handoffReceipts.set(receipt.handoff_id, frozen);
    return frozen;
  }

  export(input: { artifact_id: string; exported_at: string }) {
    const artifact = this.#require(input.artifact_id);
    if (artifact.approval_status !== "approved") throw new Error("artifact_export_approval_required");
    if (artifact.processing_status !== "complete") throw new Error("incomplete_artifact_export_forbidden");
    return this.#replace({ ...artifact, exported_at: input.exported_at, modified_at: input.exported_at });
  }

  lineage(artifactId: string) {
    const root = this.#require(artifactId);
    const visited = new Set<string>();
    const result: Master95ImageArtifact[] = [];
    const visit = (artifact: Readonly<Master95ImageArtifact>) => {
      if (visited.has(artifact.artifact_id)) return;
      visited.add(artifact.artifact_id);
      result.push(structuredClone(artifact));
      for (const sourceId of artifact.source_artifact_ids) visit(this.#require(sourceId));
      if (artifact.parent_artifact_id) visit(this.#require(artifact.parent_artifact_id));
    };
    visit(root);
    return result;
  }

  snapshot() {
    return [...this.#artifacts.values()].map((artifact) => structuredClone(artifact));
  }

  handoffSnapshot() {
    return [...this.#handoffs.values()].map((handoff) => structuredClone(handoff));
  }

  handoffReceiptSnapshot() {
    return [...this.#handoffReceipts.values()].map((receipt) => structuredClone(receipt));
  }

  #require(artifactId: string) {
    const artifact = this.#artifacts.get(artifactId);
    if (!artifact) throw new Error("artifact_not_found");
    return artifact;
  }

  #replace(input: unknown) {
    const artifact = Master95ImageArtifactSchema.parse(input);
    const frozen = deepFreeze(structuredClone(artifact));
    this.#artifacts.set(artifact.artifact_id, frozen);
    return frozen;
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
