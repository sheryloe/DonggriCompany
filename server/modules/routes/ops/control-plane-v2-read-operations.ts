import { randomUUID } from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { createControlPlaneEnvelope, createControlPlaneProblem } from "../../control-plane/api-contract.ts";
import { createExactMutationOriginPolicy, type ControlPlaneV2SecurityContext } from "./control-plane-v2.ts";

export const CONTROL_PLANE_V2_READ_OPERATION_PATHS = {
  memorySearch: "/api/control-plane/v2/memory/agentmemory/search",
  memoryContext: "/api/control-plane/v2/memory/agentmemory/context",
  controlPlaneSyncPreview: "/api/control-plane/v2/sync/preview",
  engineRoutePreview: "/api/control-plane/v2/engines/route-preview",
  harnessBlueprintPreview: "/api/control-plane/v2/harness/blueprints/preview",
} as const;

export const CONTROL_PLANE_V2_READ_OPERATION_IDS = {
  memorySearch: "memory.search",
  memoryContext: "memory.context",
  controlPlaneSyncPreview: "control-plane.sync.preview",
  engineRoutePreview: "engine.route.preview",
  harnessBlueprintPreview: "harness.blueprint.preview",
} as const;

type EpochAuthority = {
  source_epoch: string;
  projection_epoch: string;
};

type ReadOperationResult = Record<string, unknown>;

export type ControlPlaneV2ReadOperations = {
  memory_search(input: { query: string; scope: string }): Promise<ReadOperationResult>;
  memory_context(input: {
    query: string;
    scope?: string;
    department?: string;
    project_key?: string;
    spec_id?: string;
  }): Promise<ReadOperationResult>;
  control_plane_sync_preview(): Promise<ReadOperationResult> | ReadOperationResult;
  engine_route_preview(input: {
    objective: string;
    provider?:
      | "codex_exec"
      | "codex_app_server"
      | "claude"
      | "agy"
      | "hermes"
      | "codex"
      | "codex_cli"
      | "gemini"
      | "antigravity";
    scope_type?: "root" | "project" | "spec";
    scope_value?: string;
  }): Promise<ReadOperationResult> | ReadOperationResult;
  harness_blueprint_preview(input: {
    target_mode: "department" | "project" | "both";
    project_key?: string;
    objective: string;
    preferred_pattern?:
      | "auto"
      | "pipeline"
      | "fan-out-fan-in"
      | "expert-pool"
      | "producer-reviewer"
      | "supervisor"
      | "hierarchical-delegation";
    evidence_refs?: string[];
  }): Promise<ReadOperationResult> | ReadOperationResult;
};

export type ControlPlaneV2ReadOperationRouteOptions = {
  operations: ControlPlaneV2ReadOperations;
  get_epoch_authority: () => EpochAuthority;
  resolve_security: (request: Request) => ControlPlaneV2SecurityContext;
  allowed_origins?: readonly string[];
  create_request_id?: () => string;
  now?: () => Date;
};

type ReadRequestContext = EpochAuthority & {
  request_id: string;
  instance: string;
};

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const MEMORY_SCOPE_PATTERN = /^[A-Za-z0-9:_./-]+$/;
const LOGICAL_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const memorySearchSchema = z
  .object({
    query: z.string().trim().min(1).max(300),
    scope: z.string().trim().min(1).max(160).regex(MEMORY_SCOPE_PATTERN).optional().default("root"),
  })
  .strict();

const memoryContextSchema = z
  .object({
    query: z.string().trim().min(1).max(300),
    scope: z.string().trim().min(1).max(160).regex(MEMORY_SCOPE_PATTERN).optional(),
    department: z.string().trim().min(1).max(40).optional(),
    project_key: z.string().trim().min(1).max(80).optional(),
    spec_id: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const controlPlaneSyncPreviewSchema = z.object({}).strict();

const engineRoutePreviewSchema = z
  .object({
    objective: z.string().trim().min(1).max(500),
    provider: z
      .enum([
        "codex_exec",
        "codex_app_server",
        "claude",
        "agy",
        "hermes",
        "codex",
        "codex_cli",
        "gemini",
        "antigravity",
      ])
      .optional(),
    scope_type: z.enum(["root", "project", "spec"]).optional(),
    scope_value: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

const harnessBlueprintPreviewSchema = z
  .object({
    target_mode: z.enum(["department", "project", "both"]),
    project_key: z.string().trim().min(1).max(80).regex(LOGICAL_KEY_PATTERN).optional(),
    objective: z.string().trim().min(1).max(2_000),
    preferred_pattern: z
      .enum([
        "auto",
        "pipeline",
        "fan-out-fan-in",
        "expert-pool",
        "producer-reviewer",
        "supervisor",
        "hierarchical-delegation",
      ])
      .optional(),
    evidence_refs: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
  })
  .strict();

function headerValue(request: Request, name: string): string | null {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.length === 1 ? value[0]?.trim() || null : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requestId(request: Request, createId: () => string): string {
  const supplied = headerValue(request, "x-request-id");
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : createId();
}

function requestInstance(request: Request): string {
  return request.originalUrl || request.url || "control-plane-v2-read-operation";
}

function requiredEpoch(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field}_unavailable`);
  return value.trim();
}

function readRequestContext(
  request: Request,
  getEpochAuthority: () => EpochAuthority,
  createId: () => string,
): ReadRequestContext {
  const authority = getEpochAuthority();
  return {
    request_id: requestId(request, createId),
    source_epoch: requiredEpoch(authority.source_epoch, "source_epoch"),
    projection_epoch: requiredEpoch(authority.projection_epoch, "projection_epoch"),
    instance: requestInstance(request),
  };
}

function sendProblem(
  response: Response,
  context: Pick<ReadRequestContext, "request_id" | "source_epoch" | "instance">,
  input: {
    status: number;
    code: string;
    title: string;
    detail?: string;
    errors?: Array<{ field?: string; code: string; message: string }>;
  },
): Response {
  response.setHeader("x-request-id", context.request_id);
  response.type("application/problem+json");
  return response.status(input.status).json(
    createControlPlaneProblem({
      ...input,
      request_id: context.request_id,
      source_epoch: context.source_epoch,
      instance: context.instance,
    }),
  );
}

function unavailableContext(request: Request, createId: () => string): ReadRequestContext {
  return {
    request_id: requestId(request, createId),
    source_epoch: "unavailable",
    projection_epoch: "unavailable",
    instance: requestInstance(request),
  };
}

function guardReadRequest(
  request: Request,
  response: Response,
  context: ReadRequestContext,
  security: ControlPlaneV2SecurityContext,
  originAllowed: (origin: string) => boolean,
): Response | null {
  if (!security.authenticated || !security.requester?.trim()) {
    return sendProblem(response, context, {
      status: 401,
      code: "not_authenticated",
      title: "Authentication required",
    });
  }
  if (!security.csrf_valid) {
    return sendProblem(response, context, {
      status: 403,
      code: "csrf_invalid",
      title: "CSRF validation failed",
    });
  }
  const origin = headerValue(request, "origin");
  if (!origin || !originAllowed(origin)) {
    return sendProblem(response, context, {
      status: 403,
      code: "origin_not_allowed",
      title: "Origin not allowed",
    });
  }
  return null;
}

function readContractViolation(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  if (Object.hasOwn(record, "writes") && record.writes !== false) return "writes_must_be_false";
  if (record.external_effects === true) return "external_effects_must_be_false";
  if (record.mutated === true) return "mutated_must_be_false";
  return null;
}

function delegateFailure(result: unknown): { status: number; code: string } | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  if (record.ok !== false) return null;
  const status =
    Number.isSafeInteger(record.status) && Number(record.status) >= 400 && Number(record.status) <= 499
      ? Number(record.status)
      : 422;
  const code =
    typeof record.error === "string" && /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(record.error)
      ? record.error
      : "read_operation_rejected";
  return { status, code };
}

function createReadOperationHandler<TSchema extends z.ZodTypeAny>(
  options: ControlPlaneV2ReadOperationRouteOptions,
  input: {
    operation: (typeof CONTROL_PLANE_V2_READ_OPERATION_IDS)[keyof typeof CONTROL_PLANE_V2_READ_OPERATION_IDS];
    schema: TSchema;
    execute: (value: z.infer<TSchema>) => Promise<ReadOperationResult> | ReadOperationResult;
    delegate_failure_is_problem?: boolean;
  },
): RequestHandler {
  const createId = options.create_request_id ?? randomUUID;
  const originAllowed = createExactMutationOriginPolicy(options.allowed_origins);
  const now = options.now ?? (() => new Date());

  return async (request, response) => {
    let context: ReadRequestContext;
    try {
      context = readRequestContext(request, options.get_epoch_authority, createId);
    } catch {
      return sendProblem(response, unavailableContext(request, createId), {
        status: 503,
        code: "epoch_authority_unavailable",
        title: "Control Plane epoch authority unavailable",
      });
    }

    const rejected = guardReadRequest(request, response, context, options.resolve_security(request), originAllowed);
    if (rejected) return rejected;

    const parsed = input.schema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendProblem(response, context, {
        status: 400,
        code: "invalid_request_body",
        title: "Invalid read operation request",
        detail: "Only the documented read-operation fields are accepted.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.length ? issue.path.join(".") : undefined,
          code: issue.code,
          message: issue.message,
        })),
      });
    }

    try {
      const result = await input.execute(parsed.data);
      const violation = readContractViolation(result);
      if (violation) {
        return sendProblem(response, context, {
          status: 500,
          code: "read_operation_contract_violation",
          title: "Read operation attempted a write contract",
          detail: violation,
        });
      }
      if (input.delegate_failure_is_problem) {
        const failure = delegateFailure(result);
        if (failure) {
          return sendProblem(response, context, {
            status: failure.status,
            code: failure.code,
            title: "Read operation rejected",
          });
        }
      }

      response.setHeader("x-request-id", context.request_id);
      return response.json(
        createControlPlaneEnvelope(
          {
            operation: input.operation,
            generated_at: now().toISOString(),
            source_epoch: context.source_epoch,
            projection_epoch: context.projection_epoch,
            writes: false as const,
            result,
          },
          context,
        ),
      );
    } catch (error) {
      return sendProblem(response, context, {
        status: 500,
        code: "read_operation_failed",
        title: "Read operation failed",
        detail: error instanceof Error ? error.message : "unknown_read_operation_failure",
      });
    }
  };
}

export function createControlPlaneV2ReadOperationHandlers(options: ControlPlaneV2ReadOperationRouteOptions): {
  memorySearch: RequestHandler;
  memoryContext: RequestHandler;
  controlPlaneSyncPreview: RequestHandler;
  engineRoutePreview: RequestHandler;
  harnessBlueprintPreview: RequestHandler;
} {
  return {
    memorySearch: createReadOperationHandler(options, {
      operation: CONTROL_PLANE_V2_READ_OPERATION_IDS.memorySearch,
      schema: memorySearchSchema,
      execute: (input) => options.operations.memory_search(input),
    }),
    memoryContext: createReadOperationHandler(options, {
      operation: CONTROL_PLANE_V2_READ_OPERATION_IDS.memoryContext,
      schema: memoryContextSchema,
      execute: (input) => options.operations.memory_context(input),
    }),
    controlPlaneSyncPreview: createReadOperationHandler(options, {
      operation: CONTROL_PLANE_V2_READ_OPERATION_IDS.controlPlaneSyncPreview,
      schema: controlPlaneSyncPreviewSchema,
      execute: () => options.operations.control_plane_sync_preview(),
      delegate_failure_is_problem: true,
    }),
    engineRoutePreview: createReadOperationHandler(options, {
      operation: CONTROL_PLANE_V2_READ_OPERATION_IDS.engineRoutePreview,
      schema: engineRoutePreviewSchema,
      execute: (input) => options.operations.engine_route_preview(input),
      delegate_failure_is_problem: true,
    }),
    harnessBlueprintPreview: createReadOperationHandler(options, {
      operation: CONTROL_PLANE_V2_READ_OPERATION_IDS.harnessBlueprintPreview,
      schema: harnessBlueprintPreviewSchema,
      execute: (input) => options.operations.harness_blueprint_preview(input),
      delegate_failure_is_problem: true,
    }),
  };
}

export function registerControlPlaneV2ReadOperationRoutes(
  app: Pick<Express, "post">,
  options: ControlPlaneV2ReadOperationRouteOptions,
): void {
  const handlers = createControlPlaneV2ReadOperationHandlers(options);
  app.post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.memorySearch, handlers.memorySearch);
  app.post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.memoryContext, handlers.memoryContext);
  app.post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.controlPlaneSyncPreview, handlers.controlPlaneSyncPreview);
  app.post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.engineRoutePreview, handlers.engineRoutePreview);
  app.post(CONTROL_PLANE_V2_READ_OPERATION_PATHS.harnessBlueprintPreview, handlers.harnessBlueprintPreview);
}
