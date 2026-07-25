import crypto from "node:crypto";
import path from "node:path";
import type { IncomingHttpHeaders } from "node:http";
import Busboy from "busboy";
import sharp from "sharp";
import { z } from "zod";

export const IMAGE_UPLOAD_DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
export const IMAGE_UPLOAD_DEFAULT_MAX_EDGE = 8_192;
export const IMAGE_UPLOAD_DEFAULT_MAX_PIXELS = 40_000_000;

const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);
const SourceEpoch = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const MutationId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/);
const SafeRef = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !value.includes("\0") && !/(^|[\\/])\.\.([\\/]|$)/.test(value), "unsafe_reference");
export const RegisteredImageExportTargetSchema = SafeRef.refine(
  (value) => /^registered-export:[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,479}$/.test(value),
  "export_target_must_be_registered_ref",
);
const ManualConfirmation = z
  .string()
  .min(1)
  .max(4_096)
  .refine((value) => !value.includes("\0"), "confirmation_text_invalid");

export const ImageUploadPreviewMetadataSchema = z
  .object({
    project_id: MutationId,
    artifact_id: MutationId,
    parent_sha256: z.array(SHA256).max(64),
  })
  .strict();

export const ImageUploadMetadataSchema = z
  .object({
    project_id: MutationId,
    artifact_id: MutationId,
    candidate_id: MutationId,
    source_epoch: SourceEpoch,
    preview_id: MutationId,
    approval_id: MutationId,
    confirmation_text: ManualConfirmation,
    export_target_ref: RegisteredImageExportTargetSchema,
    parent_sha256: z.array(SHA256).max(64),
    expected_original_sha256: SHA256,
    expected_width: z.number().int().positive().optional(),
    expected_height: z.number().int().positive().optional(),
  })
  .strict();

export type ImageUploadMetadata = z.infer<typeof ImageUploadMetadataSchema>;
export type ImageUploadPreviewMetadata = z.infer<typeof ImageUploadPreviewMetadataSchema>;

type ValidatedImagePayload<TMetadata> = {
  filename: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  bytes: Buffer;
  byte_length: number;
  width: number;
  height: number;
  pixel_count: number;
  original_sha256: string;
  metadata: TMetadata;
};

export type ValidatedImagePreviewUpload = ValidatedImagePayload<ImageUploadPreviewMetadata>;

export type ValidatedImageUpload = ValidatedImagePayload<ImageUploadMetadata> & {
  lineage_binding: {
    candidate_id: string;
    source_epoch: string;
    approval_id: string;
    export_target_ref: string;
    original_sha256: string;
    parent_sha256: string[];
  };
};

export type MultipartImageRequest = NodeJS.ReadableStream & {
  headers: IncomingHttpHeaders;
};

export type ImageUploadLimits = {
  max_bytes?: number;
  max_edge?: number;
  max_pixels?: number;
};

type SupportedMime = ValidatedImageUpload["mime_type"];

const MIME_EXTENSIONS: Record<SupportedMime, ReadonlySet<string>> = {
  "image/png": new Set([".png"]),
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/webp": new Set([".webp"]),
};

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const SHARP_FORMAT_MIME: Readonly<Record<string, SupportedMime>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

async function inspectImage(
  bytes: Buffer,
  declaredMime: string,
  filename: string,
  limits: Required<ImageUploadLimits>,
): Promise<{
  mime_type: SupportedMime;
  width: number;
  height: number;
}> {
  const extension = path.extname(filename).toLowerCase();
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    // Metadata inspection does not decode the raster. Disabling libvips' default
    // pixel ceiling here lets us apply the stricter V1 contract below before any
    // raster allocation occurs.
    metadata = await sharp(bytes, {
      failOn: "warning",
      limitInputPixels: false,
      sequentialRead: true,
    }).metadata();
  } catch {
    throw new Error("image_magic_or_dimensions_invalid");
  }

  const detectedMime = metadata.format ? SHARP_FORMAT_MIME[metadata.format] : undefined;
  if (!detectedMime || !metadata.width || !metadata.height) {
    throw new Error("image_magic_or_dimensions_invalid");
  }
  if (declaredMime !== detectedMime) throw new Error("image_mime_magic_mismatch");
  if (!MIME_EXTENSIONS[detectedMime].has(extension)) throw new Error("image_extension_mismatch");
  if (metadata.width > limits.max_edge || metadata.height > limits.max_edge) {
    throw new Error("image_dimensions_exceed_limit");
  }
  const pixelCount = metadata.width * metadata.height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > limits.max_pixels) {
    throw new Error("image_pixel_count_exceeds_limit");
  }

  try {
    // metadata() alone accepts header-only/truncated files. stats() forces a
    // complete raster decode while the libvips input ceiling independently
    // enforces the same decompression-bomb budget.
    await sharp(bytes, {
      failOn: "warning",
      limitInputPixels: limits.max_pixels,
      sequentialRead: true,
    }).stats();
  } catch {
    throw new Error("image_decode_invalid");
  }

  return {
    mime_type: detectedMime,
    width: metadata.width,
    height: metadata.height,
  };
}

function validateLimits(limits: ImageUploadLimits): Required<ImageUploadLimits> {
  const resolved = {
    max_bytes: limits.max_bytes ?? IMAGE_UPLOAD_DEFAULT_MAX_BYTES,
    max_edge: limits.max_edge ?? IMAGE_UPLOAD_DEFAULT_MAX_EDGE,
    max_pixels: limits.max_pixels ?? IMAGE_UPLOAD_DEFAULT_MAX_PIXELS,
  };
  if (
    !Number.isSafeInteger(resolved.max_bytes) ||
    resolved.max_bytes <= 0 ||
    !Number.isSafeInteger(resolved.max_edge) ||
    resolved.max_edge <= 0 ||
    !Number.isSafeInteger(resolved.max_pixels) ||
    resolved.max_pixels <= 0
  ) {
    throw new Error("image_upload_limits_invalid");
  }
  return resolved;
}

function parseStreamingImageMultipartWithSchema<TMetadata>(
  request: MultipartImageRequest,
  metadataSchema: z.ZodType<TMetadata>,
  limits: ImageUploadLimits = {},
): Promise<ValidatedImagePayload<TMetadata>> {
  const resolvedLimits = validateLimits(limits);
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: request.headers,
        preservePath: true,
        limits: {
          files: 1,
          fields: 1,
          parts: 3,
          fileSize: resolvedLimits.max_bytes,
          fieldSize: 64 * 1024,
        },
      });
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    let metadataRaw: string | null = null;
    let fileResult: {
      filename: string;
      declaredMime: string;
      bytes: Buffer;
    } | null = null;
    let filePending = false;
    let uploadError: Error | null = null;

    const fail = (error: Error) => {
      uploadError ??= error;
    };

    parser.on("field", (name, value, info) => {
      if (name !== "metadata") fail(new Error("image_upload_unexpected_field"));
      else if (info.valueTruncated) fail(new Error("image_upload_metadata_too_large"));
      else metadataRaw = value;
    });
    parser.on("file", (name, stream, info) => {
      filePending = true;
      if (name !== "image") fail(new Error("image_upload_unexpected_file_field"));
      const basename = path.basename(info.filename);
      if (
        !info.filename ||
        basename !== info.filename ||
        info.filename.includes("/") ||
        info.filename.includes("\\") ||
        info.filename.includes("\0")
      ) {
        fail(new Error("image_upload_filename_path_traversal"));
      }
      const chunks: Buffer[] = [];
      let byteLength = 0;
      stream.on("limit", () => fail(new Error("image_upload_too_large")));
      stream.on("data", (chunk: Buffer) => {
        byteLength += chunk.length;
        if (byteLength > resolvedLimits.max_bytes) fail(new Error("image_upload_too_large"));
        else chunks.push(Buffer.from(chunk));
      });
      stream.on("error", (error) => fail(error));
      stream.on("end", () => {
        filePending = false;
        fileResult = {
          filename: info.filename,
          declaredMime: info.mimeType,
          bytes: Buffer.concat(chunks),
        };
      });
    });
    parser.on("filesLimit", () => fail(new Error("image_upload_file_count_exceeded")));
    parser.on("fieldsLimit", () => fail(new Error("image_upload_field_count_exceeded")));
    parser.on("partsLimit", () => fail(new Error("image_upload_part_count_exceeded")));
    parser.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    parser.on("finish", () => {
      if (settled) return;
      settled = true;
      void (async () => {
        try {
          if (uploadError) throw uploadError;
          if (filePending || !fileResult) throw new Error("image_upload_file_required");
          if (!metadataRaw) throw new Error("image_upload_metadata_required");
          const metadata = metadataSchema.parse(JSON.parse(metadataRaw));
          const inspected = await inspectImage(
            fileResult.bytes,
            fileResult.declaredMime,
            fileResult.filename,
            resolvedLimits,
          );
          if (
            inspected.width <= 0 ||
            inspected.height <= 0 ||
            inspected.width > resolvedLimits.max_edge ||
            inspected.height > resolvedLimits.max_edge
          ) {
            throw new Error("image_dimensions_exceed_limit");
          }
          const pixelCount = inspected.width * inspected.height;
          if (!Number.isSafeInteger(pixelCount) || pixelCount > resolvedLimits.max_pixels) {
            throw new Error("image_pixel_count_exceeds_limit");
          }
          const originalSha = sha256(fileResult.bytes);
          resolve({
            filename: fileResult.filename,
            mime_type: inspected.mime_type,
            bytes: fileResult.bytes,
            byte_length: fileResult.bytes.length,
            width: inspected.width,
            height: inspected.height,
            pixel_count: pixelCount,
            original_sha256: originalSha,
            metadata,
          });
        } catch (error) {
          reject(error);
        }
      })();
    });
    request.pipe(parser);
  });
}

export function parseStreamingImagePreviewMultipart(
  request: MultipartImageRequest,
  limits: ImageUploadLimits = {},
): Promise<ValidatedImagePreviewUpload> {
  return parseStreamingImageMultipartWithSchema(request, ImageUploadPreviewMetadataSchema, limits);
}

export async function parseStreamingImageMultipart(
  request: MultipartImageRequest,
  limits: ImageUploadLimits = {},
): Promise<ValidatedImageUpload> {
  const parsed = await parseStreamingImageMultipartWithSchema(request, ImageUploadMetadataSchema, limits);
  const { metadata } = parsed;
  if (metadata.expected_original_sha256 !== parsed.original_sha256) {
    throw new Error("image_original_sha256_mismatch");
  }
  if (metadata.expected_width !== undefined && metadata.expected_width !== parsed.width) {
    throw new Error("image_width_mismatch");
  }
  if (metadata.expected_height !== undefined && metadata.expected_height !== parsed.height) {
    throw new Error("image_height_mismatch");
  }
  return {
    ...parsed,
    lineage_binding: {
      candidate_id: metadata.candidate_id,
      source_epoch: metadata.source_epoch,
      approval_id: metadata.approval_id,
      export_target_ref: metadata.export_target_ref,
      original_sha256: parsed.original_sha256,
      parent_sha256: [...metadata.parent_sha256],
    },
  };
}

export function bindDerivedImageLineage(
  upload: ValidatedImageUpload,
  derivedBytes: Buffer,
): ValidatedImageUpload["lineage_binding"] & { derived_sha256: string } {
  return {
    ...upload.lineage_binding,
    derived_sha256: sha256(derivedBytes),
  };
}
