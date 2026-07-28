import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  read: vi.fn(),
  preview: vi.fn(),
  approve: vi.fn(),
  execute: vi.fn(),
  resolveParents: vi.fn(),
}));

vi.mock("../../api/image-workbench", () => ({
  readDurableImageProject: apiMocks.read,
  previewDurableImageArtifactUpload: apiMocks.preview,
  approveDurableImageArtifactUpload: apiMocks.approve,
  executeDurableImageArtifactUpload: apiMocks.execute,
  resolveRegisteredParentSha256: apiMocks.resolveParents,
  decideDurableImageArtifact: vi.fn(),
  exportDurableImageArtifact: vi.fn(),
  handoffDurableImageArtifact: vi.fn(),
  recordDurableImagePartialFailure: vi.fn(),
}));

import ImageWorkbenchPanel from "./ImageWorkbenchPanel";

const sourceEpoch = `sha256:${"a".repeat(64)}`;
const confirmation = "승인 image-workbench.upload bbbbbbbbbbbb";
const artifactId = "artifact:image:artifact-1";
let originalArrayBuffer: typeof Blob.prototype.arrayBuffer | undefined;
const preview = {
  schema_version: "1.0.0" as const,
  preview_id: "preview-1",
  spec_id: "20260725-donggricompany-v1-stabilization-certification-v1",
  project_id: "project:DonggriCompany",
  operation: "image-workbench.upload",
  resolved_target: `registered-export:project:DonggriCompany/${artifactId}`,
  scope: { artifact_id: artifactId },
  command: {
    executable_id: "image-workbench-store",
    args: [artifactId],
    cwd_ref: "worktree:DonggriCompany-v01-main",
  },
  target_digest: "b".repeat(64),
  scope_digest: "c".repeat(64),
  command_digest: "d".repeat(64),
  source_epoch: sourceEpoch,
  requester: "local-user",
  confirmation_text: confirmation,
  issued_at: "2026-07-25T00:00:00.000Z",
  expires_at: "2026-07-25T00:05:00.000Z",
};

beforeEach(() => {
  apiMocks.read.mockReset();
  apiMocks.preview.mockReset();
  apiMocks.approve.mockReset();
  apiMocks.execute.mockReset();
  apiMocks.resolveParents.mockReset();
  apiMocks.resolveParents.mockImplementation(
    (sourceArtifactIds: readonly string[], artifacts: Array<{ artifact_id: string; derived_sha256: string }>) =>
      sourceArtifactIds.map((artifactId) => {
        const artifact = artifacts.find((candidate) => candidate.artifact_id === artifactId);
        if (!artifact) throw new Error(`image_parent_not_registered:${artifactId}`);
        return artifact.derived_sha256;
      }),
  );
  originalArrayBuffer = Blob.prototype.arrayBuffer;
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    value: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
  });
  apiMocks.read
    .mockResolvedValueOnce({
      candidate_id: "dongri-grigri-v1-alpha.0",
      project_id: "project:DonggriCompany",
      artifacts: [],
      source_epoch: sourceEpoch,
    })
    .mockResolvedValue({
      candidate_id: "dongri-grigri-v1-alpha.0",
      project_id: "project:DonggriCompany",
      source_epoch: sourceEpoch,
      artifacts: [
        {
          candidate_id: "dongri-grigri-v1-alpha.0",
          source_epoch: sourceEpoch,
          project_id: "project:DonggriCompany",
          artifact_id: artifactId,
          original_sha256: "e".repeat(64),
          derived_sha256: "e".repeat(64),
          parent_sha256: [],
          approval_id: "approval-1",
          receipt_sha256: "f".repeat(64),
          export_target_ref: preview.resolved_target,
          storage_ref: `candidate-image:${artifactId}`,
          storage: {},
          filename: `${artifactId}.png`,
          mime_type: "image/png",
          byte_length: 10,
          width: 1200,
          height: 630,
          pixel_count: 756000,
          request_id: "request-3",
          recorded_at: "2026-07-25T00:00:00.000Z",
        },
      ],
    });
  apiMocks.preview.mockResolvedValue({
    data: {
      preview,
      upload_fingerprint: {
        project_id: "project:DonggriCompany",
        artifact_id: artifactId,
        filename: `${artifactId}.png`,
        mime_type: "image/png",
        byte_length: 10,
        width: 1200,
        height: 630,
        pixel_count: 756000,
        original_sha256: "e".repeat(64),
        parent_sha256: [],
        candidate_id: "dongri-grigri-v1-alpha.0",
      },
    },
    request_id: "request-1",
    source_epoch: sourceEpoch,
  });
  apiMocks.approve.mockResolvedValue({
    data: {
      approval_receipt: {
        approval_id: "approval-1",
        preview_id: "preview-1",
        spec_id: preview.spec_id,
        project_id: preview.project_id,
        operation: preview.operation,
        resolved_target: preview.resolved_target,
        target_digest: preview.target_digest,
        scope_digest: preview.scope_digest,
        command_digest: preview.command_digest,
        source_epoch: sourceEpoch,
        issued_at: preview.issued_at,
        expires_at: preview.expires_at,
        requester: "local-user",
        approver: "local-user",
        receipt_sha256: "f".repeat(64),
      },
    },
    request_id: "request-2",
    source_epoch: sourceEpoch,
  });
  apiMocks.execute.mockResolvedValue({
    data: {
      status: "executed",
      upload: {
        project_id: "project:DonggriCompany",
        artifact_id: artifactId,
        storage: {},
      },
      approval_id: "approval-1",
      receipt_sha256: "f".repeat(64),
    },
    request_id: "request-3",
    source_epoch: sourceEpoch,
  });

  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "artifact-1"),
    subtle: { digest: vi.fn(async () => new Uint8Array(32).fill(7).buffer) },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        fillStyle: "",
        filter: "none",
        fillRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray([255, 255, 255, 255]),
        })),
        putImageData: vi.fn(),
      }) as never,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["generated"], { type: "image/png" }));
  });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:generated"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalArrayBuffer) {
    Object.defineProperty(Blob.prototype, "arrayBuffer", {
      configurable: true,
      value: originalArrayBuffer,
    });
  } else {
    Reflect.deleteProperty(Blob.prototype, "arrayBuffer");
  }
});

describe("Image Workbench v2 manual approval", () => {
  it("never auto-fills the confirmation and executes only after the exact manual text", async () => {
    render(
      <ImageWorkbenchPanel
        projectId="project:DonggriCompany"
        projectName="DonggriCompany"
        generationDraftEnabled={false}
        onCreateGenerationDraft={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("로컬 그래픽 프리뷰 문구"), {
      target: { value: "V1 이미지 후보" },
    });
    fireEvent.click(screen.getByRole("button", { name: "로컬 그래픽 프리뷰 생성" }));
    await screen.findByAltText("버전 1 결과");
    fireEvent.click(screen.getByRole("button", { name: "등록 미리보기 생성" }));

    expect(await screen.findByTestId("durable-artifact-approval-preview")).toBeInTheDocument();
    const input = screen.getByLabelText("확인문 직접 입력");
    const execute = screen.getByRole("button", { name: "승인 후 등록 실행" });
    expect(input).toHaveValue("");
    expect(execute).toBeDisabled();
    expect(apiMocks.approve).not.toHaveBeenCalled();
    expect(apiMocks.execute).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "틀린 확인문" } });
    expect(execute).toBeDisabled();
    fireEvent.change(input, { target: { value: confirmation } });
    expect(execute).toBeEnabled();
    fireEvent.click(execute);

    await waitFor(() => expect(apiMocks.approve).toHaveBeenCalledWith("preview-1"));
    await waitFor(() => expect(apiMocks.execute).toHaveBeenCalledTimes(1));
    expect(apiMocks.execute.mock.calls[0][5]).toBe(confirmation);
    expect(await screen.findByText(/v2 등록됨/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "프로젝트 Artifact 등록됨" })).toBeDisabled();
  });

  it("discards a preview response that completes after the Project scope changes", async () => {
    let resolvePreview:
      | ((value: {
          data: {
            preview: typeof preview;
            upload_fingerprint: {
              project_id: string;
              artifact_id: string;
              filename: string;
              mime_type: "image/png";
              byte_length: number;
              width: number;
              height: number;
              pixel_count: number;
              original_sha256: string;
              parent_sha256: string[];
              candidate_id: string;
            };
          };
          request_id: string;
          source_epoch: string;
        }) => void)
      | undefined;
    apiMocks.read.mockImplementation(async (projectId: string) => ({
      candidate_id: "dongri-grigri-v1-alpha.0",
      project_id: projectId,
      source_epoch: sourceEpoch,
      artifacts: [],
    }));
    apiMocks.preview.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );

    const rendered = render(
      <ImageWorkbenchPanel
        projectId="project:DonggriCompany"
        projectName="DonggriCompany"
        generationDraftEnabled={false}
        onCreateGenerationDraft={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("로컬 그래픽 프리뷰 문구"), {
      target: { value: "이전 프로젝트 후보" },
    });
    fireEvent.click(screen.getByRole("button", { name: "로컬 그래픽 프리뷰 생성" }));
    await screen.findByAltText("버전 1 결과");
    fireEvent.click(screen.getByRole("button", { name: "등록 미리보기 생성" }));
    await waitFor(() => expect(apiMocks.preview).toHaveBeenCalledTimes(1));

    rendered.rerender(
      <ImageWorkbenchPanel
        projectId="project:BloggerGent"
        projectName="BloggerGent"
        generationDraftEnabled={false}
        onCreateGenerationDraft={vi.fn()}
      />,
    );
    await act(async () => {
      resolvePreview?.({
        data: {
          preview,
          upload_fingerprint: {
            project_id: "project:DonggriCompany",
            artifact_id: artifactId,
            filename: `${artifactId}.png`,
            mime_type: "image/png",
            byte_length: 10,
            width: 1200,
            height: 630,
            pixel_count: 756000,
            original_sha256: "e".repeat(64),
            parent_sha256: [],
            candidate_id: "dongri-grigri-v1-alpha.0",
          },
        },
        request_id: "stale-preview-request",
        source_epoch: sourceEpoch,
      });
    });

    expect(screen.getByText("BloggerGent")).toBeInTheDocument();
    expect(screen.queryByTestId("durable-artifact-approval-preview")).not.toBeInTheDocument();
    expect(apiMocks.approve).not.toHaveBeenCalled();
  });
});
