import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImageWorkbenchPanel from "./ImageWorkbenchPanel";

describe("ImageWorkbenchPanel", () => {
  it("renders a project-scoped empty state and safety boundary", async () => {
    render(
      <ImageWorkbenchPanel
        projectId="project:BloggerGent"
        projectName="BloggerGent"
        generationDraftEnabled={false}
        onCreateGenerationDraft={vi.fn()}
      />,
    );

    expect(screen.getByText("이미지 작업대")).toBeInTheDocument();
    expect(screen.getByText("BloggerGent")).toBeInTheDocument();
    expect(screen.getByText("project:BloggerGent")).toBeInTheDocument();
    expect(screen.getByText("원본 이미지부터 선택하세요.")).toBeInTheDocument();
    expect(screen.getByText(/업로드하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이미지 생성 작업 초안" })).toBeDisabled();
    expect(await screen.findByText(/현재 후보 Artifact 0/)).toBeInTheDocument();
  });

  it("creates only a generation draft and explains the boundary", async () => {
    const onCreateGenerationDraft = vi.fn(async () => undefined);
    render(
      <ImageWorkbenchPanel
        projectId="project:DonggriCompany"
        projectName="DonggriCompany"
        generationDraftEnabled
        onCreateGenerationDraft={onCreateGenerationDraft}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이미지 생성 작업 초안" }));
    await waitFor(() => expect(onCreateGenerationDraft).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/외부 생성 실행 전 단계/)).toBeInTheDocument();
  });
});
