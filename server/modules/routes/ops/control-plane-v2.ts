import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";

import { createControlPlaneEnvelope, createControlPlaneProblem } from "../../control-plane/api-contract.ts";
import {
  MutationInputError,
  type ApprovalReceipt,
  type JsonValue,
  type MutationAuthorizer,
  type MutationAuthorizerPersistence,
  type MutationFailureCode,
  type MutationPreview,
  type StructuredCommand,
} from "../../control-plane/mutation-authorizer.ts";

export const CONTROL_PLANE_V2_MUTATION_PATHS = {
  preview: "/api/control-plane/v2/mutations/preview",
  approval: "/api/control-plane/v2/mutations/approval",
  execute: "/api/control-plane/v2/mutations/execute",
} as const;

export type ControlPlaneV2SecurityContext = {
  authenticated: boolean;
  csrf_valid: boolean;
  requester: string | null;
  approver: string | null;
};

export type ControlPlaneV2Operation = {
  prepare(input: {
    project_id: string;
    source_epoch: string;
    requester: string;
    request_id: string;
    parameters: JsonValue;
  }): Promise<{
    spec_id: string;
    resolved_target: string;
    scope: JsonValue;
    command: StructuredCommand;
    expires_in_ms?: number;
  }>;
  execute(input: {
    preview: MutationPreview;
    approval_receipt: ApprovalReceipt;
    command: StructuredCommand;
    request_id: string;
  }): Promise<unknown>;
};

export type ControlPlaneV2OperationRegistry = Readonly<Record<string, ControlPlaneV2Operation>>;

export type ControlPlaneV2MutationRouteOptions = {
  authorizer: MutationAuthorizer;
  persistence: MutationAuthorizerPersistence;
  operations: ControlPlaneV2OperationRegistry;
  get_source_epoch: () => string;
  get_projection_epoch: () => string;
  resolve_security: (request: Request) => ControlPlaneV2SecurityContext;
  allowed_origins?: readonly string[];
  create_request_id?: () => string;
};

type RequestContext = {
  request_id: string;
  source_epoch: string;
  projection_epoch: string;
  instance: string;
};

type ProblemMetadata = {
  status: number;
  title: string;
};

const FAILURE_METADATA: Record<MutationFailureCode, ProblemMetadata> = {
  invalid_input: { status: 400, title: "Invalid mutation request" },
  not_authenticated: { status: 401, title: "Authentication required" },
  csrf_invalid: { status: 403, title: "CSRF validation failed" },
  origin_not_allowed: { status: 403, title: "Origin not allowed" },
  idempotency_key_invalid: { status: 400, title: "Invalid Idempotency-Key" },
  preview_not_found: { status: 404, title: "Mutation preview not found" },
  preview_tampered: { status: 409, title: "Mutation preview integrity failed" },
  preview_expired: { status: 410, title: "Mutation preview expired" },
  source_epoch_mismatch: { status: 409, title: "Source epoch mismatch" },
  projection_epoch_mismatch: { status: 409, title: "Projection epoch mismatch" },
  confirmation_mismatch: { status: 422, title: "Manual confirmation mismatch" },
  approval_not_found: { status: 404, title: "Approval not found" },
  approval_expired: { status: 410, title: "Approval expired" },
  approval_tampered: { status: 409, title: "Approval integrity failed" },
  approval_mismatch: { status: 409, title: "Approval does not match preview" },
  approval_reused: { status: 409, title: "Approval already consumed" },
  idempotency_conflict: { status: 409, title: "Idempotency-Key conflict" },
  execution_in_flight: { status: 409, title: "Mutation execution already in flight" },
  execution_reconciliation_required: { status: 503, title: "Mutation execution reconciliation required" },
  persistence_corrupt: { status: 500, title: "Mutation persistence integrity failed" },
  mutation_callback_failed: { status: 500, title: "Mutation execution failed" },
};

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const OPERATION_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{8,200}$/;

function headerValue(request: Request, name: string): string | null {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.length === 1 ? value[0]?.trim() || null : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveRequestId(request: Request, createId: () => string): string {
  const supplied = headerValue(request, "x-request-id");
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : createId();
}

function exactBody(value: unknown, requiredKeys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const required = [...requiredKeys].sort();
  return keys.length === required.length && keys.every((key, index) => key === required[index]);
}

function jsonParameters(value: unknown): JsonValue | null {
  if (value === undefined) return {};
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized.length > 16_384) return null;
    const parsed = JSON.parse(serialized) as unknown;
    if (
      parsed === undefined ||
      typeof parsed === "function" ||
      typeof parsed === "symbol" ||
      typeof parsed === "bigint"
    ) {
      return null;
    }
    return parsed as JsonValue;
  } catch {
    return null;
  }
}

function normalizeOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
      return null;
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  const parsed = new URL(origin);
  return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
}

export function createExactMutationOriginPolicy(allowedOrigins: readonly string[] = []): (origin: string) => boolean {
  const normalizedAllowlist = new Set(
    allowedOrigins.map((origin) => {
      const normalized = normalizeOrigin(origin);
      if (!normalized) throw new Error("control_plane_v2_allowed_origin_invalid");
      return normalized;
    }),
  );
  return (origin: string) => {
    const normalized = normalizeOrigin(origin);
    return normalized !== null && (isLoopbackOrigin(normalized) || normalizedAllowlist.has(normalized));
  };
}

function requestInstance(request: Request): string {
  return request.originalUrl || request.url || "control-plane-v2";
}

function sendEnvelope<T>(response: Response, data: T, context: RequestContext): Response {
  response.setHeader("x-request-id", context.request_id);
  return response.json(createControlPlaneEnvelope(data, context));
}

function sendProblem(
  response: Response,
  context: RequestContext,
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

function mutationProblem(response: Response, context: RequestContext, code: MutationFailureCode): Response {
  const metadata = FAILURE_METADATA[code];
  if (code === "execution_reconciliation_required") response.setHeader("Retry-After", "1");
  return sendProblem(response, context, { ...metadata, code });
}

function inputProblem(response: Response, context: RequestContext, detail: string): Response {
  return sendProblem(response, context, {
    status: 400,
    code: "invalid_request_body",
    title: "Invalid request body",
    detail,
  });
}

function readSourceEpoch(getSourceEpoch: () => string): string {
  const epoch = getSourceEpoch();
  if (typeof epoch !== "string" || !epoch.trim()) throw new Error("control_plane_source_epoch_unavailable");
  return epoch.trim();
}

function readProjectionEpoch(getProjectionEpoch: () => string): string {
  const epoch = getProjectionEpoch();
  if (typeof epoch !== "string" || !epoch.trim()) throw new Error("control_plane_projection_epoch_unavailable");
  return epoch.trim();
}

function guardRequest(
  request: Request,
  response: Response,
  context: RequestContext,
  security: ControlPlaneV2SecurityContext,
  originAllowed: (origin: string) => boolean,
): { origin: string; requester: string; approver: string } | Response {
  if (!security.authenticated || !security.requester?.trim()) {
    return mutationProblem(response, context, "not_authenticated");
  }
  if (!security.csrf_valid) {
    return mutationProblem(response, context, "csrf_invalid");
  }
  const origin = headerValue(request, "origin");
  if (!origin || !originAllowed(origin)) {
    return mutationProblem(response, context, "origin_not_allowed");
  }
  return {
    origin,
    requester: security.requester.trim(),
    approver: security.approver?.trim() || security.requester.trim(),
  };
}

function idempotencyKeyOrProblem(request: Request, response: Response, context: RequestContext): string | Response {
  const key = headerValue(request, "idempotency-key");
  if (key && IDEMPOTENCY_KEY_PATTERN.test(key)) return key;
  if (key) return mutationProblem(response, context, "idempotency_key_invalid");
  return sendProblem(response, context, {
    status: 428,
    code: "idempotency_key_required",
    title: "Idempotency-Key required",
  });
}

function contextForRequest(
  request: Request,
  getSourceEpoch: () => string,
  getProjectionEpoch: () => string,
  createRequestId: () => string,
): RequestContext {
  return {
    request_id: resolveRequestId(request, createRequestId),
    source_epoch: readSourceEpoch(getSourceEpoch),
    projection_epoch: readProjectionEpoch(getProjectionEpoch),
    instance: requestInstance(request),
  };
}

export function createControlPlaneV2MutationRouteHandlers(options: ControlPlaneV2MutationRouteOptions): {
  preview: RequestHandler;
  approval: RequestHandler;
  execute: RequestHandler;
} {
  const createRequestId = options.create_request_id ?? randomUUID;
  const originAllowed = createExactMutationOriginPolicy(options.allowed_origins);

  const preview: RequestHandler = async (request, response) => {
    let context: RequestContext;
    try {
      context = contextForRequest(request, options.get_source_epoch, options.get_projection_epoch, createRequestId);
    } catch {
      const requestId = resolveRequestId(request, createRequestId);
      return sendProblem(
        response,
        {
          request_id: requestId,
          source_epoch: "unavailable",
          projection_epoch: "unavailable",
          instance: requestInstance(request),
        },
        {
          status: 503,
          code: "source_epoch_unavailable",
          title: "Control Plane source epoch unavailable",
        },
      );
    }

    const idempotency = idempotencyKeyOrProblem(request, response, context);
    if (typeof idempotency !== "string") return idempotency;
    const security = options.resolve_security(request);
    const guard = guardRequest(request, response, context, security, originAllowed);
    if (!("origin" in guard)) return guard;

    const hasParameters = exactBody(request.body, ["operation", "parameters", "project_id"]);
    if (!exactBody(request.body, ["operation", "project_id"]) && !hasParameters) {
      return inputProblem(
        response,
        context,
        "Only operation, project_id, and optional parameters are accepted; target, scope, command, approval, and receipt are server-owned.",
      );
    }
    const operationKey = request.body.operation;
    const projectId = request.body.project_id;
    if (
      typeof operationKey !== "string" ||
      !OPERATION_PATTERN.test(operationKey) ||
      typeof projectId !== "string" ||
      !PROJECT_ID_PATTERN.test(projectId)
    ) {
      return inputProblem(response, context, "operation or project_id is invalid.");
    }
    const parameters = jsonParameters(hasParameters ? request.body.parameters : {});
    if (parameters === null) {
      return inputProblem(response, context, "parameters must be bounded JSON.");
    }
    const operation = options.operations[operationKey];
    if (!operation) {
      return sendProblem(response, context, {
        status: 404,
        code: "operation_not_registered",
        title: "Mutation operation not registered",
      });
    }

    try {
      const prepared = await operation.prepare({
        project_id: projectId,
        source_epoch: context.source_epoch,
        requester: guard.requester,
        request_id: context.request_id,
        parameters,
      });
      const created = await options.authorizer.createPreview(
        {
          ...prepared,
          project_id: projectId,
          operation: operationKey,
          source_epoch: context.source_epoch,
          projection_epoch: context.projection_epoch,
          requester: guard.requester,
        },
        {
          idempotency_key: idempotency,
          request: {
            phase: "preview",
            operation: operationKey,
            project_id: projectId,
            parameters,
            source_epoch: context.source_epoch,
            projection_epoch: context.projection_epoch,
            requester: guard.requester,
          },
        },
      );
      return sendEnvelope(response, { preview: created }, context);
    } catch (error) {
      const code = error instanceof Error ? error.message : "operation_contract_invalid";
      if (code === "idempotency_conflict") {
        return mutationProblem(response, context, "idempotency_conflict");
      }
      if (code === "persistence_corrupt") {
        return mutationProblem(response, context, "persistence_corrupt");
      }
      if (/^(control_tower_.+(?:invalid|required|not_active|not_canonical|not_in_project|mismatch))$/.test(code)) {
        return sendProblem(response, context, {
          status: 422,
          code,
          title: "Mutation operation parameters rejected",
        });
      }
      return sendProblem(response, context, {
        status: 500,
        code: "operation_contract_invalid",
        title: "Mutation operation contract invalid",
      });
    }
  };

  const approval: RequestHandler = async (request, response) => {
    let context: RequestContext;
    try {
      context = contextForRequest(request, options.get_source_epoch, options.get_projection_epoch, createRequestId);
    } catch {
      const requestId = resolveRequestId(request, createRequestId);
      return sendProblem(
        response,
        {
          request_id: requestId,
          source_epoch: "unavailable",
          projection_epoch: "unavailable",
          instance: requestInstance(request),
        },
        {
          status: 503,
          code: "source_epoch_unavailable",
          title: "Control Plane source epoch unavailable",
        },
      );
    }

    const idempotency = idempotencyKeyOrProblem(request, response, context);
    if (typeof idempotency !== "string") return idempotency;
    const security = options.resolve_security(request);
    const guard = guardRequest(request, response, context, security, originAllowed);
    if (!("origin" in guard)) return guard;
    if (!exactBody(request.body, ["preview_id"]) || typeof request.body.preview_id !== "string") {
      return inputProblem(
        response,
        context,
        "Only preview_id is accepted; approver identity and receipt are server-owned.",
      );
    }

    try {
      const storedPreview = await options.persistence.getPreview(request.body.preview_id);
      if (!storedPreview) return mutationProblem(response, context, "preview_not_found");
      if (storedPreview.source_epoch !== context.source_epoch) {
        return mutationProblem(response, context, "source_epoch_mismatch");
      }
      if (storedPreview.projection_epoch !== context.projection_epoch) {
        return mutationProblem(response, context, "projection_epoch_mismatch");
      }
      const receipt = await options.authorizer.issueApproval(storedPreview.preview_id, guard.approver, {
        idempotency_key: idempotency,
        request: {
          phase: "approval",
          preview_id: storedPreview.preview_id,
          source_epoch: context.source_epoch,
          projection_epoch: context.projection_epoch,
          approver: guard.approver,
        },
      });
      return sendEnvelope(response, { approval_receipt: receipt }, context);
    } catch (error) {
      if (error instanceof MutationInputError) {
        const code = error.message;
        if (
          code === "preview_not_found" ||
          code === "preview_expired" ||
          code === "preview_tampered" ||
          code === "idempotency_conflict" ||
          code === "persistence_corrupt"
        ) {
          return mutationProblem(response, context, code);
        }
      }
      return sendProblem(response, context, {
        status: 500,
        code: "approval_issue_failed",
        title: "Approval issue failed",
      });
    }
  };

  const execute: RequestHandler = async (request, response) => {
    let context: RequestContext;
    try {
      context = contextForRequest(request, options.get_source_epoch, options.get_projection_epoch, createRequestId);
    } catch {
      const requestId = resolveRequestId(request, createRequestId);
      return sendProblem(
        response,
        {
          request_id: requestId,
          source_epoch: "unavailable",
          projection_epoch: "unavailable",
          instance: requestInstance(request),
        },
        {
          status: 503,
          code: "source_epoch_unavailable",
          title: "Control Plane source epoch unavailable",
        },
      );
    }

    const idempotency = idempotencyKeyOrProblem(request, response, context);
    if (typeof idempotency !== "string") return idempotency;
    const security = options.resolve_security(request);
    const guard = guardRequest(request, response, context, security, originAllowed);
    if (!("origin" in guard)) return guard;
    if (
      !exactBody(request.body, ["approval_id", "confirmation_text", "preview_id", "source_epoch"]) ||
      typeof request.body.preview_id !== "string" ||
      typeof request.body.approval_id !== "string" ||
      typeof request.body.source_epoch !== "string" ||
      typeof request.body.confirmation_text !== "string"
    ) {
      return inputProblem(
        response,
        context,
        "Only preview_id, approval_id, source_epoch, and confirmation_text are accepted. Receipt, command, target, and scope must not be submitted.",
      );
    }
    if (request.body.source_epoch !== context.source_epoch) {
      return mutationProblem(response, context, "source_epoch_mismatch");
    }

    const storedPreview = await options.persistence.getPreview(request.body.preview_id);
    if (!storedPreview) return mutationProblem(response, context, "preview_not_found");
    if (storedPreview.source_epoch !== context.source_epoch) {
      return mutationProblem(response, context, "source_epoch_mismatch");
    }
    let executionProjectionEpoch: string;
    try {
      // Refresh immediately before authorization so long request processing
      // cannot execute against the projection captured at handler entry.
      executionProjectionEpoch = readProjectionEpoch(options.get_projection_epoch);
    } catch {
      return sendProblem(response, context, {
        status: 503,
        code: "projection_epoch_unavailable",
        title: "Control Plane projection epoch unavailable",
      });
    }
    if (storedPreview.projection_epoch !== executionProjectionEpoch) {
      return mutationProblem(response, context, "projection_epoch_mismatch");
    }
    const operation = options.operations[storedPreview.operation];
    if (!operation) {
      return sendProblem(response, context, {
        status: 409,
        code: "operation_no_longer_registered",
        title: "Mutation operation no longer registered",
      });
    }

    const result = await options.authorizer.execute(
      {
        preview_id: request.body.preview_id,
        approval_id: request.body.approval_id,
        source_epoch: request.body.source_epoch,
        current_projection_epoch: executionProjectionEpoch,
        confirmation_text: request.body.confirmation_text,
        idempotency_key: idempotency,
        guards: {
          authenticated: security.authenticated,
          csrf_valid: security.csrf_valid,
          origin: guard.origin,
        },
      },
      (authorized) =>
        operation.execute({
          ...authorized,
          request_id: context.request_id,
        }),
    );
    if (!result.ok) return mutationProblem(response, context, result.code);
    return sendEnvelope(
      response,
      {
        status: result.status,
        result: result.value,
        approval_id: result.approval_receipt.approval_id,
        receipt_sha256: result.approval_receipt.receipt_sha256,
      },
      context,
    );
  };

  return { preview, approval, execute };
}

export function registerControlPlaneV2MutationRoutes(
  app: Pick<Express, "post">,
  options: ControlPlaneV2MutationRouteOptions,
): void {
  const handlers = createControlPlaneV2MutationRouteHandlers(options);
  app.post(CONTROL_PLANE_V2_MUTATION_PATHS.preview, handlers.preview);
  app.post(CONTROL_PLANE_V2_MUTATION_PATHS.approval, handlers.approval);
  app.post(CONTROL_PLANE_V2_MUTATION_PATHS.execute, handlers.execute);
}

export function createLegacyMutationGoneHandler(options: {
  get_source_epoch: () => string;
  create_request_id?: () => string;
}): RequestHandler {
  const createRequestId = options.create_request_id ?? randomUUID;
  return (request, response) => {
    const requestId = resolveRequestId(request, createRequestId);
    let sourceEpoch = "unavailable";
    try {
      sourceEpoch = readSourceEpoch(options.get_source_epoch);
    } catch {
      // A 410 block must remain fail-closed even when source projection is degraded.
    }
    return sendProblem(
      response,
      {
        request_id: requestId,
        source_epoch: sourceEpoch,
        projection_epoch: "unavailable",
        instance: requestInstance(request),
      },
      {
        status: 410,
        code: "legacy_mutation_gone",
        title: "Legacy mutation endpoint disabled",
        detail: "Create a v2 preview and execute it with an explicit local compatibility policy.",
      },
    );
  };
}

function proofMatches(expected: string, supplied: string | null): boolean {
  if (!supplied || expected.length < 32) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export function createLegacyControlPlaneV1MutationGuard(options: {
  get_source_epoch: () => string;
  compatibility_enabled?: boolean;
  compatibility_proof?: string;
  allowed_origins?: readonly string[];
  test_mode?: boolean;
  create_request_id?: () => string;
}): RequestHandler {
  const gone = createLegacyMutationGoneHandler({
    get_source_epoch: options.get_source_epoch,
    create_request_id: options.create_request_id,
  });
  const originAllowed = createExactMutationOriginPolicy(options.allowed_origins);
  const expectedProof = options.compatibility_proof?.trim() ?? "";

  return (request, response, next) => {
    if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
      next();
      return;
    }
    if (options.test_mode) {
      next();
      return;
    }

    const origin = headerValue(request, "origin");
    const proof = headerValue(request, "x-control-plane-v1-legacy-proof");
    if (
      options.compatibility_enabled === true &&
      origin !== null &&
      originAllowed(origin) &&
      proofMatches(expectedProof, proof)
    ) {
      next();
      return;
    }
    return gone(request, response, next);
  };
}
