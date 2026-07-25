import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  bindDerivedImageLineage,
  IMAGE_UPLOAD_DEFAULT_MAX_BYTES,
  parseStreamingImageMultipart,
  parseStreamingImagePreviewMultipart,
} from "./image-upload.ts";

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function png(width: number, height: number, extraBytes = 0): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1; // one-bit grayscale keeps large-geometry bomb fixtures compact
  const scanlineBytes = Math.ceil(width / 8) + 1;
  const idat = deflateSync(Buffer.alloc(scanlineBytes * height), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
    Buffer.alloc(extraBytes),
  ]);
}

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 16, g: 32, b: 64 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function webp(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 16, g: 32, b: 64 },
    },
  })
    .webp()
    .toBuffer();
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function baseMetadata(bytes: Buffer) {
  return {
    project_id: "project:DonggriCompany",
    artifact_id: "artifact-1",
    candidate_id: "candidate-alpha.0",
    source_epoch: `sha256:${"a".repeat(64)}`,
    preview_id: "preview-image-001",
    approval_id: "APR-V1-IMPLEMENT-001",
    confirmation_text: "사용자가 직접 입력한 확인문",
    export_target_ref: "registered-export:image-workbench",
    parent_sha256: [],
    expected_original_sha256: sha256(bytes),
  };
}

function multipart(input: { bytes: Buffer; filename?: string; mime?: string; metadata?: Record<string, unknown> }) {
  const boundary = "donggri-v1-boundary";
  const metadata = input.metadata ?? baseMetadata(input.bytes);
  const before = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${input.filename ?? "image.png"}"\r\n` +
      `Content-Type: ${input.mime ?? "image/png"}\r\n\r\n`,
    "utf8",
  );
  const after = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([before, input.bytes, after]);
  const request = Readable.from([body]) as Readable & {
    headers: { "content-type": string; "content-length": string };
  };
  request.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(body.length),
  };
  return request;
}

describe("streaming Image Workbench upload", () => {
  it("accepts a bounded PNG and binds source, approval, export, and derived lineage", async () => {
    const upload = await parseStreamingImageMultipart(multipart({ bytes: png(640, 480) }));
    expect(upload).toMatchObject({
      filename: "image.png",
      mime_type: "image/png",
      width: 640,
      height: 480,
      pixel_count: 307_200,
      lineage_binding: {
        candidate_id: "candidate-alpha.0",
        approval_id: "APR-V1-IMPLEMENT-001",
        export_target_ref: "registered-export:image-workbench",
      },
    });
    expect(upload.original_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(bindDerivedImageLineage(upload, Buffer.from("derived"))).toMatchObject({
      original_sha256: upload.original_sha256,
      derived_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("accepts only the supported PNG, JPEG, and WebP formats when magic, MIME, and extension agree", async () => {
    await expect(parseStreamingImageMultipart(multipart({ bytes: png(20, 10) }))).resolves.toMatchObject({
      mime_type: "image/png",
      width: 20,
      height: 10,
    });
    await expect(
      parseStreamingImageMultipart(
        multipart({ bytes: await jpeg(20, 10), filename: "image.jpeg", mime: "image/jpeg" }),
      ),
    ).resolves.toMatchObject({ mime_type: "image/jpeg", width: 20, height: 10 });
    await expect(
      parseStreamingImageMultipart(
        multipart({ bytes: await webp(20, 10), filename: "image.webp", mime: "image/webp" }),
      ),
    ).resolves.toMatchObject({ mime_type: "image/webp", width: 20, height: 10 });
  });

  it("requires a complete successful decode and rejects truncated or malformed PNG data", async () => {
    const valid = png(32, 24);
    const idatTypeOffset = valid.indexOf(Buffer.from("IDAT", "ascii"));
    expect(idatTypeOffset).toBeGreaterThan(0);

    const truncated = valid.subarray(0, idatTypeOffset + 8);
    await expect(parseStreamingImageMultipart(multipart({ bytes: truncated }))).rejects.toThrow("image_decode_invalid");

    const malformed = Buffer.from(valid);
    malformed[idatTypeOffset + 4] ^= 0xff;
    await expect(parseStreamingImageMultipart(multipart({ bytes: malformed }))).rejects.toThrow("image_decode_invalid");
  });

  it("parses preview uploads from only project, artifact, and parent-lineage metadata", async () => {
    const bytes = png(320, 180);
    await expect(
      parseStreamingImagePreviewMultipart(
        multipart({
          bytes,
          metadata: {
            project_id: "DonggriCompany",
            artifact_id: "artifact-preview-001",
            parent_sha256: ["d".repeat(64)],
          },
        }),
      ),
    ).resolves.toMatchObject({
      filename: "image.png",
      mime_type: "image/png",
      width: 320,
      height: 180,
      original_sha256: sha256(bytes),
      metadata: {
        project_id: "DonggriCompany",
        artifact_id: "artifact-preview-001",
        parent_sha256: ["d".repeat(64)],
      },
    });

    await expect(
      parseStreamingImagePreviewMultipart(
        multipart({
          bytes,
          metadata: {
            project_id: "DonggriCompany",
            artifact_id: "artifact-preview-001",
            parent_sha256: [],
            export_target_ref: "registered-export:client-supplied",
            scope: { client: "owned" },
            command: { executable_id: "shell" },
            receipt: { approval_id: "client-supplied" },
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects MIME spoofing, extension mismatch, SVG, and path traversal", async () => {
    await expect(parseStreamingImageMultipart(multipart({ bytes: png(1, 1), mime: "image/jpeg" }))).rejects.toThrow(
      "image_mime_magic_mismatch",
    );
    await expect(parseStreamingImageMultipart(multipart({ bytes: png(1, 1), filename: "image.jpg" }))).rejects.toThrow(
      "image_extension_mismatch",
    );
    await expect(
      parseStreamingImageMultipart(
        multipart({
          bytes: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
          filename: "image.svg",
          mime: "image/svg+xml",
        }),
      ),
    ).rejects.toThrow("image_magic_or_dimensions_invalid");
    await expect(
      parseStreamingImageMultipart(multipart({ bytes: png(1, 1), filename: "../image.png" })),
    ).rejects.toThrow("image_upload_filename_path_traversal");
  });

  it("rejects oversized, over-edge, and decompression-bomb geometry", async () => {
    await expect(parseStreamingImageMultipart(multipart({ bytes: png(1, 1, 128) }), { max_bytes: 64 })).rejects.toThrow(
      "image_upload_too_large",
    );
    await expect(parseStreamingImageMultipart(multipart({ bytes: png(8_193, 1) }))).rejects.toThrow(
      "image_dimensions_exceed_limit",
    );
    await expect(parseStreamingImageMultipart(multipart({ bytes: png(8_000, 8_000) }))).rejects.toThrow(
      "image_pixel_count_exceeds_limit",
    );
    await expect(parseStreamingImageMultipart(multipart({ bytes: png(8_000, 5_001) }))).rejects.toThrow(
      "image_pixel_count_exceeds_limit",
    );
  });

  it("enforces the default 20 MiB byte ceiling", async () => {
    await expect(
      parseStreamingImageMultipart(multipart({ bytes: png(1, 1, IMAGE_UPLOAD_DEFAULT_MAX_BYTES) })),
    ).rejects.toThrow("image_upload_too_large");
  });

  it("rejects source hash or declared dimension drift", async () => {
    const bytes = png(100, 100);
    const metadata = baseMetadata(bytes);
    await expect(
      parseStreamingImageMultipart(
        multipart({ bytes, metadata: { ...metadata, expected_original_sha256: "b".repeat(64) } }),
      ),
    ).rejects.toThrow("image_original_sha256_mismatch");
    await expect(
      parseStreamingImageMultipart(multipart({ bytes, metadata: { ...metadata, expected_width: 101 } })),
    ).rejects.toThrow("image_width_mismatch");
  });

  it("requires strict authorization metadata and a registered export target", async () => {
    const bytes = png(100, 100);
    const metadata = baseMetadata(bytes);
    const { preview_id: _previewId, ...withoutPreview } = metadata;
    await expect(parseStreamingImageMultipart(multipart({ bytes, metadata: withoutPreview }))).rejects.toThrow();
    await expect(
      parseStreamingImageMultipart(
        multipart({ bytes, metadata: { ...metadata, export_target_ref: "C:\\outside\\image.png" } }),
      ),
    ).rejects.toThrow();
  });
});
