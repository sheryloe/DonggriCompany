import { post } from "./core";

export const CONTROL_PLANE_V2_READ_PATHS = {
  memorySearch: "/api/control-plane/v2/memory/agentmemory/search",
  memoryContext: "/api/control-plane/v2/memory/agentmemory/context",
  controlPlaneSyncPreview: "/api/control-plane/v2/sync/preview",
  engineRoutePreview: "/api/control-plane/v2/engines/route-preview",
  harnessBlueprintPreview: "/api/control-plane/v2/harness/blueprints/preview",
} as const;

type ControlPlaneV2ReadEnvelope<TResult> = {
  data: {
    operation: string;
    generated_at: string;
    source_epoch: string;
    projection_epoch: string;
    writes: false;
    result: TResult;
  };
  request_id: string;
  source_epoch: string;
};

function requireReadEnvelope<TResult>(
  envelope: ControlPlaneV2ReadEnvelope<TResult>,
  expectedOperation: string,
): TResult {
  if (
    !envelope ||
    typeof envelope !== "object" ||
    typeof envelope.request_id !== "string" ||
    !envelope.request_id ||
    typeof envelope.source_epoch !== "string" ||
    !envelope.source_epoch ||
    !envelope.data ||
    envelope.data.operation !== expectedOperation ||
    envelope.data.source_epoch !== envelope.source_epoch ||
    typeof envelope.data.projection_epoch !== "string" ||
    !envelope.data.projection_epoch ||
    envelope.data.writes !== false
  ) {
    throw new Error("control_plane_v2_read_envelope_invalid");
  }
  return envelope.data.result;
}

async function postReadOperation<TBody, TResult>(path: string, operation: string, body: TBody): Promise<TResult> {
  const envelope = await post<ControlPlaneV2ReadEnvelope<TResult>>(path, body);
  return requireReadEnvelope(envelope, operation);
}

export function searchAgentMemoryV2<TResult>(body: { query: string; scope?: string }): Promise<TResult> {
  return postReadOperation(CONTROL_PLANE_V2_READ_PATHS.memorySearch, "memory.search", body);
}

export function readAgentMemoryContextV2<TResult>(body: {
  query: string;
  scope?: string;
  department?: string;
  project_key?: string;
  spec_id?: string;
}): Promise<TResult> {
  return postReadOperation(CONTROL_PLANE_V2_READ_PATHS.memoryContext, "memory.context", body);
}

export function previewControlPlaneSyncV2<TResult>(): Promise<TResult> {
  return postReadOperation(CONTROL_PLANE_V2_READ_PATHS.controlPlaneSyncPreview, "control-plane.sync.preview", {});
}

export function previewEngineRouteV2<TResult>(body: {
  objective: string;
  provider?: string;
  scope_type?: "root" | "project" | "spec";
  scope_value?: string;
}): Promise<TResult> {
  return postReadOperation(CONTROL_PLANE_V2_READ_PATHS.engineRoutePreview, "engine.route.preview", body);
}

export function previewHarnessBlueprintV2<TResult>(body: {
  target_mode: "department" | "project" | "both";
  project_key?: string;
  objective: string;
  preferred_pattern?: string;
  evidence_refs?: string[];
}): Promise<TResult> {
  return postReadOperation(CONTROL_PLANE_V2_READ_PATHS.harnessBlueprintPreview, "harness.blueprint.preview", body);
}
