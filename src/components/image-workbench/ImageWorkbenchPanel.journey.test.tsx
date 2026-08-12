import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageWorkbenchPanel from "./ImageWorkbenchPanel";

class FakeImage {
  naturalWidth = 64;
  naturalHeight = 32;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.(new Event("load")));
  }
}

const canvasContext = {
  fillStyle: "",
  filter: "none",
  fillRect: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) })),
  putImageData: vi.fn(),
};

let originalArrayBuffer: typeof Blob.prototype.arrayBuffer | undefined;
let objectUrlSequence = 0;
let idSequence = 0;

beforeEach(() => {
  objectUrlSequence = 0;
  idSequence = 0;
  originalArrayBuffer = Blob.prototype.arrayBuffer;
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    value: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
  });
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => `test-${++idSequence}`),
    subtle: { digest: vi.fn(async () => new Uint8Array(32).fill(7).buffer) },
  });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => `blob:test-${++objectUrlSequence}`),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => canvasContext as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["result"], { type: "image/png" }));
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalArrayBuffer) {
    Object.defineProperty(Blob.prototype, "arrayBuffer", { configurable: true, value: originalArrayBuffer });
  } else {
    Reflect.deleteProperty(Blob.prototype, "arrayBuffer");
  }
});

async function loadSourceImage(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  fireEvent.change(input as HTMLInputElement, {
    target: { files: [new File(["source"], "source.png", { type: "image/png" })] },
  });
  await screen.findByAltText("입력 원본");
}

describe("ImageWorkbenchPanel user journeys", () => {
  it("creates a project-scoped 1200x630 local graphic preview with full generation metadata", async () => {
    render(
      <ImageWorkbenchPanel
        projectId="project:BloggerGent"
        projectName="BloggerGent"
        generationDraftEnabled={false}
        onCreateGenerationDraft={vi.fn()}
      />,
    );

    const generateButton = screen.getByRole("button", { name: "로컬 그래픽 프리뷰 생성" });
    expect(generateButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("로컬 그래픽 프리뷰 문구"), {
      target: { value: "여름 교토 3일 여행 가이드" },
    });
    expect(generateButton).toBeEnabled();
    fireEvent.click(generateButton);

    expect(await screen.findByText(/로컬 그래픽 프리뷰를 버전 1 초안/)).toHaveTextContent(
      "외부 AI 생성, 서버 저장, 발행은 실행하지 않았습니다",
    );
    expect(screen.getByAltText("버전 1 결과")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Artifact 메타데이터 보기" }));
    expect(screen.getByText(/"operation": "generate"/)).toBeInTheDocument();
    expect(screen.getByText(/"model": "browser-canvas-template"/)).toBeInTheDocument();
    expect(screen.getByText(/"project_id": "project:BloggerGent"/)).toBeInTheDocument();
  });

  it("keeps monotonic lineage through edit, old-version restore, approval, handoff preview, and export", async () => {
    const { container } = render(
      <ImageWorkbenchPanel
        projectId="project:BloggerGent"
        projectName="BloggerGent"
        generationDraftEnabled={false}
        onCreateGenerationDraft={vi.fn()}
      />,
    );
    await loadSourceImage(container);

    fireEvent.click(screen.getByRole("button", { name: "편집 버전 만들기" }));
    await screen.findByText(/편집 결과를 버전 2 초안/);
    fireEvent.click(screen.getAllByRole("button", { name: "이 버전 복원" })[0]);
    expect(await screen.findByText(/버전 1을 새 버전 3 초안으로 복원/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(screen.getByRole("button", { name: "승인" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Agent 전달 미리보기" }));
    expect(screen.getByText(/project=project:BloggerGent/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Artifact 메타데이터 보기" }));
    expect(screen.getByText(/"parent_artifact_id"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다운로드·내보내기" }));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it("covers background removal, resize, format conversion, analysis, and source comparison", async () => {
    const { container } = render(
      <ImageWorkbenchPanel
        projectId="project:BloggerGent"
        projectName="BloggerGent"
        generationDraftEnabled={false}
        onCreateGenerationDraft={vi.fn()}
      />,
    );
    await loadSourceImage(container);

    fireEvent.click(screen.getByRole("button", { name: "투명 배경 버전 만들기" }));
    await screen.findByText(/배경 제거 결과를 버전 2 초안/);
    fireEvent.change(screen.getByLabelText("너비"), { target: { value: "320" } });
    fireEvent.change(screen.getByLabelText("높이"), { target: { value: "180" } });
    fireEvent.click(screen.getByRole("button", { name: "새 크기 버전 만들기" }));
    await screen.findByText(/리사이즈 결과를 버전 3 초안/);
    fireEvent.change(screen.getByLabelText("결과 형식"), { target: { value: "image/webp" } });
    fireEvent.click(screen.getByRole("button", { name: "형식 변환" }));
    await screen.findByText(/형식 변환 결과를 버전 4 초안/);
    fireEvent.click(screen.getByRole("button", { name: "이미지 분석" }));

    expect(await screen.findByText(/현재 버전의 크기, 형식, 용량, 체크섬을 분석/)).toBeInTheDocument();
    expect(screen.getByAltText("입력 원본")).toBeInTheDocument();
    expect(screen.getByAltText("버전 4 결과")).toBeInTheDocument();
    expect(screen.getByText(/320 × 180, image\/webp/)).toBeInTheDocument();
  });

  it("preserves a traced partial version and shows the cause and next action when Canvas fails", async () => {
    const { container } = render(
      <ImageWorkbenchPanel
        projectId="project:BloggerGent"
        projectName="BloggerGent"
        generationDraftEnabled={false}
        onCreateGenerationDraft={vi.fn()}
      />,
    );
    await loadSourceImage(container);
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);

    fireEvent.click(screen.getByRole("button", { name: "편집 버전 만들기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("다음 행동");
    expect(screen.getByText(/부분 결과 · 원인:/)).toBeInTheDocument();
    expect(screen.getByText(/partial ·/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다운로드·내보내기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    fireEvent.click(screen.getByRole("button", { name: "다운로드·내보내기" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("승인된 결과만 내보낼 수 있습니다"));
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("repeats project-scoped local generation 100 times without losing versions", async () => {
    render(
      <ImageWorkbenchPanel
        projectId="project:BloggerGent"
        projectName="BloggerGent"
        generationDraftEnabled={false}
        onCreateGenerationDraft={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("로컬 그래픽 프리뷰 문구"), {
      target: { value: "BloggerGent 반복 그래픽 검증" },
    });
    const generateButton = screen.getByRole("button", { name: "로컬 그래픽 프리뷰 생성" });

    for (let attempt = 1; attempt <= 100; attempt += 1) {
      fireEvent.click(generateButton);
      await screen.findByText(new RegExp(`로컬 그래픽 프리뷰를 버전 ${attempt} 초안`));
    }

    expect(screen.getAllByRole("button", { name: "이 버전 복원" })).toHaveLength(100);
    expect(screen.getByAltText("버전 100 결과")).toBeInTheDocument();
    expect(screen.getByTestId("durable-project-summary")).toHaveTextContent("Artifact 0");
  }, 30_000);
});
