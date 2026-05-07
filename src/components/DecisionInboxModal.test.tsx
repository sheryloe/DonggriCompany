import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DecisionInboxItem } from "./chat/decision-inbox";
import DecisionInboxModal from "./DecisionInboxModal";

function buildReviewRoundItem(): DecisionInboxItem {
  return {
    id: "review-round-pick:task-1:meeting-1",
    kind: "review_round_pick",
    agentId: null,
    agentName: "Planner",
    agentNameKo: "기획팀장",
    agentAvatar: "PL",
    requestContent: "리뷰 라운드 1에서 blocker 2건이 감지되었습니다.",
    createdAt: 1_700_000_000_000,
    taskId: "task-1",
    projectId: "project-1",
    projectName: "Decision QA",
    blockerCount: 2,
    blockerDelta: -1,
    optionNotes: ["보안 스캔 결과 보완", "모바일 레이아웃 정리"],
    plannerAnalysisQuality: {
      status: "partial",
      expectedOptionCount: 3,
      plannerOptionCount: 1,
      coveredOptionCount: 1,
      coverageRatio: 0.33,
      missingOptionNumbers: [1, 3],
      hasJsonBlock: true,
      invalidJson: false,
    },
    reviewerVerdicts: [],
    options: [
      {
        number: 1,
        action: "apply_all_feedback",
        label: "전체 반영",
        analysis: {
          rationale: "모든 reviewer blocker를 보완 범위에 포함합니다.",
          expectedResult: "전체 피드백 기반 보완 작업이 생성됩니다.",
          risk: "낮은 가치의 피드백까지 포함되어 범위가 커질 수 있습니다.",
          followUp: "생성된 보완 작업의 담당자와 완료 기준을 확인합니다.",
          source: "template",
        },
      },
      {
        number: 2,
        action: "apply_selected_feedback",
        label: "선택 반영",
        analysis: {
          rationale: "핵심 blocker만 골라 범위와 처리 시간을 통제합니다.",
          expectedResult: "선택한 번호와 메모만 보완 작업으로 생성됩니다.",
          risk: "제외한 blocker가 다음 라운드에서 다시 이슈가 될 수 있습니다.",
          followUp: "체크박스와 메모로 포함 범위를 명확히 지정합니다.",
          source: "planner",
        },
      },
      {
        number: 3,
        action: "proceed_final_verdict",
        label: "최종판정으로 진행",
        analysis: {
          rationale: "현재 reviewer 판정 기준으로 마감 판단을 진행합니다.",
          expectedResult: "최종 판정 흐름으로 넘어갑니다.",
          risk: "미해결 이슈가 사후 결함이나 재작업으로 이어질 수 있습니다.",
          followUp: "사후 리스크와 예외 승인 기록을 남깁니다.",
          source: "template",
        },
      },
    ],
  };
}

describe("DecisionInboxModal", () => {
  it("renders option analysis details and planner source for review-round decisions", () => {
    render(
      <DecisionInboxModal
        open
        loading={false}
        items={[buildReviewRoundItem()]}
        agents={[]}
        busyKey={null}
        uiLanguage="ko"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onReplyOption={vi.fn()}
        onOpenChat={vi.fn()}
      />,
    );

    expect(screen.getAllByText("판단 기준").length).toBeGreaterThan(0);
    expect(screen.getAllByText("선택 후 결과").length).toBeGreaterThan(0);
    expect(screen.getAllByText("리스크").length).toBeGreaterThan(0);
    expect(screen.getAllByText("후속 조치").length).toBeGreaterThan(0);
    expect(screen.getByText("Planner JSON 품질")).toBeInTheDocument();
    expect(screen.getByText("partial")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("누락: 1, 3")).toBeInTheDocument();
    expect(screen.getByText("Planner 분석")).toBeInTheDocument();
    expect(screen.getByText("선택한 번호와 메모만 보완 작업으로 생성됩니다.")).toBeInTheDocument();
  });
});
