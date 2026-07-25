import { randomUUID } from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";

import { createControlPlaneEnvelope, createControlPlaneProblem } from "../../control-plane/api-contract.ts";
import {
  bindDerivedImageLineage,
  parseStreamingImageMultipart,
  parseStreamingImagePreviewMultipart,
  RegisteredImageExportTargetSchema,
  type ImageUploadLimits,
  type MultipartImageRequest,
  type ValidatedImagePreviewUpload,
  type ValidatedImageUpload,
} from "../../control-plane/image-upload.ts";
import {
  MutationNoEffectError,
  type ApprovalReceipt,
  type JsonValue,
  type MutationAuthorizer,
  type MutationFailureCode,
  type MutationPreview,
  type StructuredCommand,
} from "../../control-plane/mutation-authorizer.ts";
import { createExactMutationOriginPolicy, type ControlPlaneV2SecurityContext } from "./control-plane-v2.ts";

export const IMAGE_WORKBENCH_V2_UPLOAD_PATH = "/api/control-plane/v2/image-workbench/uploads";
export const IMAGE_WORKBENCH_V2_UPLOAD_PREVIEW_PATH = `${IMAGE_WORKBENCH_V2_UPLOAD_PATH}/preview`;
export const IMAGE_WORKBENCH_V2_UPLOAD_OPERATION = "image-workbench.upload";

export type ImageWorkbenchV2Lineage = ValidatedImageUpload["lineage_binding"] & {
  derived_sha256: string;
};

export type ImageWorkbenchV2StoreInput = {
  upload: ValidatedImageUpload;
  lineage: ImageWorkbenchV2Lineage;
  preview: MutationPreview;
  approval_receipt: ApprovalReceipt;
  request_id: string;
};

export type ImageWorkbenchV2UploadRouteOptions = {
  authorizer: MutationAuthorizer;
  get_source_epoch: () => string;
  get_projection_epoch: () => string;
  get_candidate_id: () => string;
  resolve_security: (request: Request) => ControlPlaneV2SecurityContext;
  store: (input: ImageWorkbenchV2StoreInput) => Promise<JsonValue>;
  allowed_origins?: readonly string[];
  limits?: ImageUploadLimits;
  create_request_id?: () => string;
};

export type ImageWorkbenchV2PreviewAuthorityInput = {
  project_id: string;
  artifact_id: string;
  parent_sha256: string[];
  candidate_id: string;
  source_epoch: string;
  original_sha256: string;
  filename: string;
  mime_type: ValidatedImagePreviewUpload["mime_type"];
  byte_length: number;
  width: number;
  height: number;
  pixel_count: number;
  requester: string;
  request_id: string;
};

export type ImageWorkbenchV2ParentLineageLookupInput = {
  project_id: string;
  parent_sha256: string[];
  candidate_id: string;
  source_epoch: string;
  requester: string;
  request_id: string;
};

export type ImageWorkbenchV2UploadPreviewRouteOptions = Omit<ImageWorkbenchV2UploadRouteOptions, "store"> & {
  spec_id: string;
  resolve_registered_parent_sha256: (
    input: ImageWorkbenchV2ParentLineageLookupInput,
  ) => readonly string[] | Promise<readonly string[]>;
  resolve_export_target: (input: ImageWorkbenchV2PreviewAuthorityInput) => string | Promise<string>;
  create_store_command: (
    input: ImageWorkbenchV2PreviewAuthorityInput & { export_target_ref: string },
  ) => StructuredCommand;
};

export type ImageWorkbenchV2UploadRoutesOptions = ImageWorkbenchV2UploadRouteOptions &
  Pick<
    ImageWorkbenchV2UploadPreviewRouteOptions,
    "spec_id" | "resolve_registered_parent_sha256" | "resolve_export_target" | "create_store_command"
  >;

type RequestContext = {
  request_id: string;
  source_epoch: string;
  projection_epoch: string;
  candidate_id: string;
  instance: string;
};

type UploadExecutionValue = {
  project_id: string;
  artifact_id: string;
  filename: string;
  mime_type: ValidatedImageUpload["mime_type"];
  byte_length: number;
  width: number;
  height: number;
  pixel_count: number;
  lineage: ImageWorkbenchV2Lineage;
  storage: JsonValue;
};

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{8,200}$/;
const MULTIPART_CONTENT_TYPE_PATTERN = /^multipart\/form-data(?:\s*;|$)/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const FAILURE_STATUS: Record<MutationFailureCode, number> = {
  invalid_input: 400,
  not_authenticated: 401,
  csrf_invalid: 403,
  origin_not_allowed: 403,
  idempotency_key_invalid: 400,
  preview_not_found: 404,
  preview_tampered: 409,
  preview_expired: 410,
  source_epoch_mismatch: 409,
  projection_epoch_mismatch: 409,
  confirmation_mismatch: 422,
  approval_not_found: 404,
  approval_expired: 410,
  approval_tampered: 409,
  approval_mismatch: 409,
  approval_reused: 409,
  idempotency_conflict: 409,
  execution_in_flight: 409,
  execution_reconciliation_required: 503,
  persistence_corrupt: 500,
  mutation_callback_failed: 500,
};

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
  return request.originalUrl || request.url || IMAGE_WORKBENCH_V2_UPLOAD_PATH;
}

function requiredAuthorityValue(value: string, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function sendEnvelope<T>(response: Response, context: RequestContext, data: T, status = 200): Response {
  response.setHeader("x-request-id", context.request_id);
  return response.status(status).json(createControlPlaneEnvelope(data, context));
}

function sendProblem(
  response: Response,
  context: Pick<RequestContext, "request_id" | "source_epoch" | "instance">,
  input: { status: number; code: string; title: string; detail?: string },
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

function unavailableProblem(
  request: Request,
  response: Response,
  request_id: string,
  code: string,
  title: string,
): Response {
  return sendProblem(
    response,
    {
      request_id,
      source_epoch: "unavailable",
      instance: requestInstance(request),
    },
    { status: 503, code, title },
  );
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArrayEquals(value: JsonValue | undefined, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => typeof item === "string" && item === expected[index])
  );
}

function scopeBindsUpload(preview: MutationPreview, upload: ValidatedImageUpload): boolean {
  const scope = preview.scope;
  if (!isJsonObject(scope)) return false;
  return (
    preview.operation === IMAGE_WORKBENCH_V2_UPLOAD_OPERATION &&
    preview.project_id === upload.metadata.project_id &&
    preview.resolved_target === upload.metadata.export_target_ref &&
    preview.source_epoch === upload.metadata.source_epoch &&
    scope.artifact_id === upload.metadata.artifact_id &&
    scope.candidate_id === upload.metadata.candidate_id &&
    scope.source_epoch === upload.metadata.source_epoch &&
    scope.export_target_ref === upload.metadata.export_target_ref &&
    scope.original_sha256 === upload.original_sha256 &&
    scope.mime_type === upload.mime_type &&
    scope.byte_length === upload.byte_length &&
    scope.width === upload.width &&
    scope.height === upload.height &&
    scope.pixel_count === upload.pixel_count &&
    stringArrayEquals(scope.parent_sha256, upload.metadata.parent_sha256)
  );
}

function uploadProblemMetadata(error: unknown): {
  status: number;
  code: string;
  title: string;
} {
  const message = error instanceof Error ? error.message : "image_upload_invalid";
  if (
    message.includes("image_upload_too_large") ||
    message.includes("image_dimensions_exceed_limit") ||
    message.includes("image_pixel_count_exceeds_limit")
  ) {
    return { status: 413, code: "image_upload_limit_exceeded", title: "Image upload limit exceeded" };
  }
  if (
    message.includes("image_magic_or_dimensions_invalid") ||
    message.includes("image_mime_magic_mismatch") ||
    message.includes("image_extension_mismatch")
  ) {
    return { status: 415, code: "image_media_type_invalid", title: "Image media type invalid" };
  }
  if (
    message.includes("image_original_sha256_mismatch") ||
    message.includes("image_width_mismatch") ||
    message.includes("image_height_mismatch")
  ) {
    return { status: 422, code: "image_integrity_mismatch", title: "Image integrity metadata mismatch" };
  }
  return { status: 400, code: "image_multipart_invalid", title: "Invalid multipart image upload" };
}

function validateRegisteredParentSha256(
  requestedParentSha256: readonly string[],
  registeredParentSha256: readonly string[],
): string[] {
  if (
    !Array.isArray(registeredParentSha256) ||
    !registeredParentSha256.every((value) => typeof value === "string" && SHA256_PATTERN.test(value))
  ) {
    throw new Error("image_parent_lineage_lookup_invalid");
  }
  if (new Set(requestedParentSha256).size !== requestedParentSha256.length) {
    throw new Error("image_parent_lineage_duplicate");
  }
  const registered = new Set(registeredParentSha256);
  return requestedParentSha256.filter((parentSha256) => !registered.has(parentSha256));
}

export function createImageWorkbenchV2UploadPreviewHandler(
  options: ImageWorkbenchV2UploadPreviewRouteOptions,
): RequestHandler {
  const createId = options.create_request_id ?? randomUUID;
  const originAllowed = createExactMutationOriginPolicy(options.allowed_origins);

  return async (request, response) => {
    const resolvedRequestId = requestId(request, createId);
    let context: RequestContext;
    try {
      context = {
        request_id: resolvedRequestId,
        source_epoch: requiredAuthorityValue(options.get_source_epoch(), "image_workbench_source_epoch_unavailable"),
        projection_epoch: requiredAuthorityValue(
          options.get_projection_epoch(),
          "image_workbench_projection_epoch_unavailable",
        ),
        candidate_id: requiredAuthorityValue(options.get_candidate_id(), "image_workbench_candidate_id_unavailable"),
        instance: requestInstance(request),
      };
    } catch (error) {
      const code =
        error instanceof Error && error.message === "image_workbench_candidate_id_unavailable"
          ? "candidate_id_unavailable"
          : error instanceof Error && error.message === "image_workbench_projection_epoch_unavailable"
            ? "projection_epoch_unavailable"
            : "source_epoch_unavailable";
      return unavailableProblem(
        request,
        response,
        resolvedRequestId,
        code,
        code === "candidate_id_unavailable"
          ? "Release candidate identity unavailable"
          : code === "projection_epoch_unavailable"
            ? "Control Plane projection epoch unavailable"
            : "Control Plane source epoch unavailable",
      );
    }

    let security: ControlPlaneV2SecurityContext;
    try {
      security = options.resolve_security(request);
    } catch {
      return sendProblem(response, context, {
        status: 500,
        code: "security_context_unavailable",
        title: "Security context unavailable",
      });
    }
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
    const idempotencyKey = headerValue(request, "idempotency-key");
    if (!idempotencyKey) {
      return sendProblem(response, context, {
        status: 428,
        code: "idempotency_key_required",
        title: "Idempotency-Key required",
      });
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return sendProblem(response, context, {
        status: 400,
        code: "idempotency_key_invalid",
        title: "Invalid Idempotency-Key",
      });
    }
    const contentType = headerValue(request, "content-type");
    if (!contentType || !MULTIPART_CONTENT_TYPE_PATTERN.test(contentType)) {
      return sendProblem(response, context, {
        status: 415,
        code: "multipart_required",
        title: "Streaming multipart upload required",
        detail: "JSON and base64 image previews are not accepted by this endpoint.",
      });
    }

    let upload: ValidatedImagePreviewUpload;
    try {
      upload = await parseStreamingImagePreviewMultipart(request as MultipartImageRequest, options.limits);
    } catch (error) {
      return sendProblem(response, context, uploadProblemMetadata(error));
    }

    const authorityInput: ImageWorkbenchV2PreviewAuthorityInput = {
      project_id: upload.metadata.project_id,
      artifact_id: upload.metadata.artifact_id,
      parent_sha256: [...upload.metadata.parent_sha256],
      candidate_id: context.candidate_id,
      source_epoch: context.source_epoch,
      original_sha256: upload.original_sha256,
      filename: upload.filename,
      mime_type: upload.mime_type,
      byte_length: upload.byte_length,
      width: upload.width,
      height: upload.height,
      pixel_count: upload.pixel_count,
      requester: security.requester.trim(),
      request_id: context.request_id,
    };

    let missingParentSha256: string[];
    try {
      missingParentSha256 = validateRegisteredParentSha256(
        upload.metadata.parent_sha256,
        await options.resolve_registered_parent_sha256({
          project_id: upload.metadata.project_id,
          parent_sha256: [...upload.metadata.parent_sha256],
          candidate_id: context.candidate_id,
          source_epoch: context.source_epoch,
          requester: security.requester.trim(),
          request_id: context.request_id,
        }),
      );
    } catch (error) {
      const duplicate = error instanceof Error && error.message === "image_parent_lineage_duplicate";
      return sendProblem(response, context, {
        status: duplicate ? 422 : 503,
        code: duplicate ? "image_parent_lineage_duplicate" : "image_parent_lineage_authority_unavailable",
        title: duplicate ? "Duplicate image parent lineage" : "Image parent lineage authority unavailable",
      });
    }
    if (missingParentSha256.length > 0) {
      return sendProblem(response, context, {
        status: 422,
        code: "image_parent_lineage_not_registered",
        title: "Image parent lineage not registered",
        detail:
          "Every parent_sha256 must be an existing derived artifact in the same candidate, source epoch, and active project ledger.",
      });
    }

    try {
      const exportTarget = RegisteredImageExportTargetSchema.parse(await options.resolve_export_target(authorityInput));
      const command = options.create_store_command({
        ...authorityInput,
        export_target_ref: exportTarget,
      });
      const preview = await options.authorizer.createPreview(
        {
          spec_id: options.spec_id,
          project_id: upload.metadata.project_id,
          operation: IMAGE_WORKBENCH_V2_UPLOAD_OPERATION,
          resolved_target: exportTarget,
          scope: {
            artifact_id: upload.metadata.artifact_id,
            candidate_id: context.candidate_id,
            source_epoch: context.source_epoch,
            export_target_ref: exportTarget,
            original_sha256: upload.original_sha256,
            parent_sha256: [...upload.metadata.parent_sha256],
            mime_type: upload.mime_type,
            byte_length: upload.byte_length,
            width: upload.width,
            height: upload.height,
            pixel_count: upload.pixel_count,
          },
          command,
          source_epoch: context.source_epoch,
          projection_epoch: context.projection_epoch,
          requester: security.requester.trim(),
        },
        {
          idempotency_key: idempotencyKey,
          request: {
            phase: "preview",
            operation: IMAGE_WORKBENCH_V2_UPLOAD_OPERATION,
            project_id: upload.metadata.project_id,
            artifact_id: upload.metadata.artifact_id,
            candidate_id: context.candidate_id,
            source_epoch: context.source_epoch,
            projection_epoch: context.projection_epoch,
            export_target_ref: exportTarget,
            original_sha256: upload.original_sha256,
            parent_sha256: [...upload.metadata.parent_sha256],
            filename: upload.filename,
            mime_type: upload.mime_type,
            byte_length: upload.byte_length,
            width: upload.width,
            height: upload.height,
            pixel_count: upload.pixel_count,
            requester: security.requester.trim(),
          },
        },
      );
      return sendEnvelope(
        response,
        context,
        {
          preview,
          upload_fingerprint: {
            project_id: upload.metadata.project_id,
            artifact_id: upload.metadata.artifact_id,
            filename: upload.filename,
            mime_type: upload.mime_type,
            byte_length: upload.byte_length,
            width: upload.width,
            height: upload.height,
            pixel_count: upload.pixel_count,
            original_sha256: upload.original_sha256,
            parent_sha256: [...upload.metadata.parent_sha256],
            candidate_id: context.candidate_id,
          },
        },
        201,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "idempotency_conflict") {
        return sendProblem(response, context, {
          status: 409,
          code: "idempotency_conflict",
          title: "Idempotency-Key conflict",
        });
      }
      if (error instanceof Error && error.message === "persistence_corrupt") {
        return sendProblem(response, context, {
          status: 500,
          code: "persistence_corrupt",
          title: "Mutation persistence integrity failed",
        });
      }
      return sendProblem(response, context, {
        status: 500,
        code: "image_upload_preview_contract_invalid",
        title: "Image upload preview contract invalid",
      });
    }
  };
}

export function createImageWorkbenchV2UploadHandler(options: ImageWorkbenchV2UploadRouteOptions): RequestHandler {
  const createId = options.create_request_id ?? randomUUID;
  const originAllowed = createExactMutationOriginPolicy(options.allowed_origins);

  return async (request, response) => {
    const resolvedRequestId = requestId(request, createId);
    let context: RequestContext;
    try {
      context = {
        request_id: resolvedRequestId,
        source_epoch: requiredAuthorityValue(options.get_source_epoch(), "image_workbench_source_epoch_unavailable"),
        projection_epoch: requiredAuthorityValue(
          options.get_projection_epoch(),
          "image_workbench_projection_epoch_unavailable",
        ),
        candidate_id: requiredAuthorityValue(options.get_candidate_id(), "image_workbench_candidate_id_unavailable"),
        instance: requestInstance(request),
      };
    } catch (error) {
      const code =
        error instanceof Error && error.message === "image_workbench_candidate_id_unavailable"
          ? "candidate_id_unavailable"
          : error instanceof Error && error.message === "image_workbench_projection_epoch_unavailable"
            ? "projection_epoch_unavailable"
            : "source_epoch_unavailable";
      return unavailableProblem(
        request,
        response,
        resolvedRequestId,
        code,
        code === "candidate_id_unavailable"
          ? "Release candidate identity unavailable"
          : code === "projection_epoch_unavailable"
            ? "Control Plane projection epoch unavailable"
            : "Control Plane source epoch unavailable",
      );
    }

    let security: ControlPlaneV2SecurityContext;
    try {
      security = options.resolve_security(request);
    } catch {
      return sendProblem(response, context, {
        status: 500,
        code: "security_context_unavailable",
        title: "Security context unavailable",
      });
    }
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
    const idempotencyKey = headerValue(request, "idempotency-key");
    if (!idempotencyKey) {
      return sendProblem(response, context, {
        status: 428,
        code: "idempotency_key_required",
        title: "Idempotency-Key required",
      });
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return sendProblem(response, context, {
        status: 400,
        code: "idempotency_key_invalid",
        title: "Invalid Idempotency-Key",
      });
    }
    const contentType = headerValue(request, "content-type");
    if (!contentType || !MULTIPART_CONTENT_TYPE_PATTERN.test(contentType)) {
      return sendProblem(response, context, {
        status: 415,
        code: "multipart_required",
        title: "Streaming multipart upload required",
        detail: "JSON and base64 image uploads are not accepted by this endpoint.",
      });
    }

    let upload: ValidatedImageUpload;
    try {
      upload = await parseStreamingImageMultipart(request as MultipartImageRequest, options.limits);
    } catch (error) {
      return sendProblem(response, context, uploadProblemMetadata(error));
    }

    if (upload.metadata.source_epoch !== context.source_epoch) {
      return sendProblem(response, context, {
        status: 409,
        code: "source_epoch_mismatch",
        title: "Source epoch mismatch",
      });
    }
    if (upload.metadata.candidate_id !== context.candidate_id) {
      return sendProblem(response, context, {
        status: 409,
        code: "candidate_id_mismatch",
        title: "Release candidate mismatch",
      });
    }

    const lineage = bindDerivedImageLineage(upload, upload.bytes);
    let executionProjectionEpoch: string;
    try {
      // Multipart parsing can be long-running. Re-read the server authority
      // immediately before MutationAuthorizer reserves or invokes any effect.
      executionProjectionEpoch = requiredAuthorityValue(
        options.get_projection_epoch(),
        "image_workbench_projection_epoch_unavailable",
      );
    } catch {
      return sendProblem(response, context, {
        status: 503,
        code: "projection_epoch_unavailable",
        title: "Control Plane projection epoch unavailable",
      });
    }
    const result = await options.authorizer.execute<UploadExecutionValue>(
      {
        preview_id: upload.metadata.preview_id,
        approval_id: upload.metadata.approval_id,
        source_epoch: upload.metadata.source_epoch,
        current_projection_epoch: executionProjectionEpoch,
        confirmation_text: upload.metadata.confirmation_text,
        idempotency_key: idempotencyKey,
        guards: {
          authenticated: security.authenticated,
          csrf_valid: security.csrf_valid,
          origin,
        },
      },
      async ({ preview, approval_receipt }) => {
        if (!scopeBindsUpload(preview, upload)) {
          throw new MutationNoEffectError("image_upload_preview_binding_mismatch");
        }
        const storage = await options.store({
          upload,
          lineage,
          preview,
          approval_receipt,
          request_id: context.request_id,
        });
        return {
          project_id: upload.metadata.project_id,
          artifact_id: upload.metadata.artifact_id,
          filename: upload.filename,
          mime_type: upload.mime_type,
          byte_length: upload.byte_length,
          width: upload.width,
          height: upload.height,
          pixel_count: upload.pixel_count,
          lineage,
          storage,
        };
      },
    );

    if (!result.ok) {
      if (result.code === "execution_reconciliation_required") {
        response.setHeader("Retry-After", "1");
      }
      return sendProblem(response, context, {
        status: FAILURE_STATUS[result.code],
        code: result.code,
        title:
          result.code === "mutation_callback_failed"
            ? "Image storage failed closed"
            : result.code === "execution_reconciliation_required"
              ? "Image storage reconciliation required"
              : "Upload authorization failed",
      });
    }
    return sendEnvelope(
      response,
      context,
      {
        status: result.status,
        upload: result.value,
        approval_id: result.approval_receipt.approval_id,
        receipt_sha256: result.approval_receipt.receipt_sha256,
      },
      result.status === "executed" ? 201 : 200,
    );
  };
}

export function registerImageWorkbenchV2UploadRoute(
  app: Pick<Express, "post">,
  options: ImageWorkbenchV2UploadRouteOptions,
): void {
  app.post(IMAGE_WORKBENCH_V2_UPLOAD_PATH, createImageWorkbenchV2UploadHandler(options));
}

export function registerImageWorkbenchV2UploadRoutes(
  app: Pick<Express, "post">,
  options: ImageWorkbenchV2UploadRoutesOptions,
): void {
  app.post(IMAGE_WORKBENCH_V2_UPLOAD_PREVIEW_PATH, createImageWorkbenchV2UploadPreviewHandler(options));
  registerImageWorkbenchV2UploadRoute(app, options);
}
