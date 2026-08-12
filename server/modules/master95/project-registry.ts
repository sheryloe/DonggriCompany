import { z } from "zod";

export const MASTER95_PROJECT_REGISTRY_SCHEMA_VERSION = "1.0.0" as const;
export const MASTER95_NAMESPACE_KINDS = ["task", "run", "event", "memory", "artifact", "secret"] as const;

const NonEmpty = z.string().trim().min(1);
const ProjectId = z.string().regex(/^project:[A-Za-z0-9._-]+$/);
const Namespace = z.string().regex(/^project:[A-Za-z0-9._-]+:(?:task|run|event|memory|artifact|secret)$/);

export const Master95ProjectLaneSchema = z
  .object({
    lane_id: NonEmpty,
    group_id: NonEmpty,
    role_agent: NonEmpty,
    worktree_path: NonEmpty,
    channel_ref: NonEmpty.nullable(),
    metadata_tags: z.array(NonEmpty),
    operating_mode: z.enum(["read-only", "dry-run", "approval-gated"]),
  })
  .strict();

export const Master95ProjectManifestSchema = z
  .object({
    schema_version: z.literal(MASTER95_PROJECT_REGISTRY_SCHEMA_VERSION),
    project_id: ProjectId,
    project_key: NonEmpty,
    display_name: NonEmpty,
    repo_path: NonEmpty,
    owner_department: z.literal("OPS"),
    implementation_delegate: z.literal("IMPLEMENT"),
    lifecycle_status: z.enum(["active", "candidate", "completed", "archived"]),
    enabled: z.boolean(),
    namespaces: z
      .object(
        Object.fromEntries(MASTER95_NAMESPACE_KINDS.map((kind) => [kind, Namespace])) as Record<
          (typeof MASTER95_NAMESPACE_KINDS)[number],
          typeof Namespace
        >,
      )
      .strict(),
    model_policy: NonEmpty,
    network_policy: NonEmpty,
    budget_policy: NonEmpty,
    approver_ids: z.array(NonEmpty).min(1),
    allowed_department_agents: z.array(z.enum(["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"])).min(1),
    lanes: z.array(Master95ProjectLaneSchema),
    source_registry_ref: NonEmpty,
  })
  .strict()
  .superRefine((manifest, context) => {
    for (const kind of MASTER95_NAMESPACE_KINDS) {
      const expected = `${manifest.project_id}:${kind}`;
      if (manifest.namespaces[kind] !== expected) {
        context.addIssue({ code: "custom", path: ["namespaces", kind], message: `namespace_must_equal_${expected}` });
      }
    }
    if (new Set(manifest.lanes.map((lane) => lane.lane_id)).size !== manifest.lanes.length) {
      context.addIssue({ code: "custom", path: ["lanes"], message: "lane_ids_must_be_unique" });
    }
  });

export type Master95ProjectManifest = z.infer<typeof Master95ProjectManifestSchema>;
export type Master95NamespaceKind = (typeof MASTER95_NAMESPACE_KINDS)[number];

export type Master95ProjectAccessRequest = {
  requester_project_id?: string | null;
  resource_project_id?: string | null;
  namespace_kind: Master95NamespaceKind;
  namespace_value: string;
};

export type Master95ProjectAccessDecision = {
  decision: "allow" | "block";
  reason_code:
    | "same_project_namespace_authorized"
    | "project_id_required"
    | "project_not_registered"
    | "project_disabled"
    | "cross_project_access_denied"
    | "namespace_mismatch";
  requester_project_id: string | null;
  resource_project_id: string | null;
};

export class Master95ProjectRegistry {
  readonly #projects = new Map<string, Readonly<Master95ProjectManifest>>();

  register(input: unknown) {
    const manifest = Master95ProjectManifestSchema.parse(input);
    if (this.#projects.has(manifest.project_id)) throw new Error("project_already_registered");
    if ([...this.#projects.values()].some((item) => item.project_key === manifest.project_key)) {
      throw new Error("project_key_already_registered");
    }
    const frozen = deepFreeze(structuredClone(manifest));
    this.#projects.set(manifest.project_id, frozen);
    return frozen;
  }

  get(projectId: string) {
    return this.#projects.get(projectId) ?? null;
  }

  list() {
    return [...this.#projects.values()];
  }

  require(projectId: string | null | undefined) {
    const normalized = String(projectId ?? "").trim();
    if (!normalized) throw new Error("project_id_required");
    const project = this.#projects.get(normalized);
    if (!project) throw new Error("project_not_registered");
    if (!project.enabled || project.lifecycle_status !== "active") throw new Error("project_disabled");
    return project;
  }

  authorizeAccess(request: Master95ProjectAccessRequest): Master95ProjectAccessDecision {
    const requesterId = normalize(request.requester_project_id);
    const resourceId = normalize(request.resource_project_id);
    if (!requesterId || !resourceId) return accessDecision("block", "project_id_required", requesterId, resourceId);
    const requester = this.#projects.get(requesterId);
    const resource = this.#projects.get(resourceId);
    if (!requester || !resource) return accessDecision("block", "project_not_registered", requesterId, resourceId);
    if (
      !requester.enabled ||
      !resource.enabled ||
      requester.lifecycle_status !== "active" ||
      resource.lifecycle_status !== "active"
    ) {
      return accessDecision("block", "project_disabled", requesterId, resourceId);
    }
    if (requesterId !== resourceId)
      return accessDecision("block", "cross_project_access_denied", requesterId, resourceId);
    if (request.namespace_value !== resource.namespaces[request.namespace_kind]) {
      return accessDecision("block", "namespace_mismatch", requesterId, resourceId);
    }
    return accessDecision("allow", "same_project_namespace_authorized", requesterId, resourceId);
  }

  createRunScope(input: { project_id?: string | null; run_id: string; trace_id: string }) {
    const project = this.require(input.project_id);
    return {
      project_id: project.project_id,
      run_id: required(input.run_id, "run_id"),
      trace_id: required(input.trace_id, "trace_id"),
      run_namespace: project.namespaces.run,
      event_namespace: project.namespaces.event,
      memory_namespace: project.namespaces.memory,
      artifact_namespace: project.namespaces.artifact,
      secret_namespace: project.namespaces.secret,
    };
  }

  authorizeLane(input: { project_id?: string | null; lane_id: string; role_agent: string }) {
    const project = this.require(input.project_id);
    const lane = project.lanes.find((item) => item.lane_id === input.lane_id);
    if (!lane) return { decision: "block" as const, reason_code: "lane_not_registered" as const, lane: null };
    if (lane.role_agent !== input.role_agent) {
      return { decision: "block" as const, reason_code: "lane_role_mismatch" as const, lane };
    }
    return { decision: "allow" as const, reason_code: "lane_role_authorized" as const, lane };
  }
}

export function createMaster95DefaultProjectRegistry() {
  const registry = new Master95ProjectRegistry();
  for (const project of MASTER95_DEFAULT_PROJECT_MANIFESTS) registry.register(project);
  return registry;
}

function baseProject(
  input: Pick<Master95ProjectManifest, "project_id" | "project_key" | "display_name" | "repo_path">,
): Master95ProjectManifest {
  const namespaces = Object.fromEntries(
    MASTER95_NAMESPACE_KINDS.map((kind) => [kind, `${input.project_id}:${kind}`]),
  ) as Master95ProjectManifest["namespaces"];
  return {
    schema_version: MASTER95_PROJECT_REGISTRY_SCHEMA_VERSION,
    ...input,
    owner_department: "OPS",
    implementation_delegate: "IMPLEMENT",
    lifecycle_status: "active",
    enabled: true,
    namespaces,
    model_policy: "master95-balanced-v1",
    network_policy: "local-first-deny-external-by-default",
    budget_policy: "project-budget-v1",
    approver_ids: ["CONTROL"],
    allowed_department_agents: ["CONTROL", "SPEC", "EXPLORE", "IMPLEMENT", "REVIEW", "OPS"],
    lanes: [],
    source_registry_ref: "storage/codex-control/registry/projects.yaml",
  };
}

export const MASTER95_BLOGGERGENT_ROLE_AGENTS = [
  "blogger-travel-en",
  "blogger-travel-es",
  "blogger-travel-ja",
  "blogger-mystery",
  "cloudflare-archive",
  "platform-core",
  "ops-db-quality",
] as const;

export const MASTER95_BLOGGERGENT_LANES: Master95ProjectManifest["lanes"] = [
  lane("google-travel-en", "google-travel-blog", "blogger-travel-en", "blogger:34"),
  lane("google-travel-es", "google-travel-blog", "blogger-travel-es", "blogger:36"),
  lane("google-travel-ja", "google-travel-blog", "blogger-travel-ja", "blogger:37"),
  lane("mystery-google", "mystery-google-blog", "blogger-mystery", "the-midnight-archives"),
  lane("cloudflare-archive", "cloudflare-blog", "cloudflare-archive", "cloudflare:dongriarchive"),
  lane("mystery-cloudflare", "mystery-cloudflare-blog", "cloudflare-archive", "cloudflare:dongriarchive", [
    "cloudflare:dongriarchive:mystery",
  ]),
  lane("shared-platform", "shared-infra", "platform-core", null),
  lane("quality-index-analytics", "shared-infra", "ops-db-quality", null),
];

export const MASTER95_DEFAULT_PROJECT_MANIFESTS: Master95ProjectManifest[] = [
  baseProject({
    project_id: "project:DonggriCompany",
    project_key: "DonggriCompany",
    display_name: "DonggriCompany Control Plane",
    repo_path: "G:/Donggri_DevDrive/repos/DonggriCompany",
  }),
  {
    ...baseProject({
      project_id: "project:BloggerGent",
      project_key: "BloggerGent",
      display_name: "BloggerGent Project Scope",
      repo_path: "G:/Donggri_DevDrive/repos/BloggerGent",
    }),
    lanes: MASTER95_BLOGGERGENT_LANES,
  },
  baseProject({
    project_id: "project:CardNewsAgent",
    project_key: "CardNewsAgent",
    display_name: "CardNewsAgent",
    repo_path: "G:/Donggri_DevDrive/repos/CardNewsAgent",
  }),
];

function lane(
  laneId: string,
  groupId: string,
  roleAgent: (typeof MASTER95_BLOGGERGENT_ROLE_AGENTS)[number],
  channelRef: string | null,
  metadataTags: string[] = [],
): Master95ProjectManifest["lanes"][number] {
  return {
    lane_id: laneId,
    group_id: groupId,
    role_agent: roleAgent,
    worktree_path: `G:/Donggri_DevDrive/worktrees/BloggerGent-${roleAgent}`,
    channel_ref: channelRef,
    metadata_tags: metadataTags,
    operating_mode: "dry-run",
  };
}

function accessDecision(
  decision: "allow" | "block",
  reasonCode: Master95ProjectAccessDecision["reason_code"],
  requesterProjectId: string | null,
  resourceProjectId: string | null,
): Master95ProjectAccessDecision {
  return {
    decision,
    reason_code: reasonCode,
    requester_project_id: requesterProjectId,
    resource_project_id: resourceProjectId,
  };
}

function normalize(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function required(value: string, field: string) {
  const normalized = normalize(value);
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
